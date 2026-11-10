import crypto from 'node:crypto';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:FinancialCustodian:Ed25519');

/**
 * Genesis hash for the immutable SHA-256 hash chain (64 zeros hex string).
 */
export const GENESIS_HASH = '0'.repeat(64);

const HEX_REGEX = /^[0-9a-fA-F]+$/;
const ASN1_SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex'); // SubjectPublicKeyInfo ASN.1 prefix for Ed25519

// Thread-safe in-memory LRU Cache for parsed crypto.KeyObject instances keyed by public_key_hex
const MAX_KEY_CACHE_SIZE = 1000;
const keyObjectLruCache = new Map<string, crypto.KeyObject>();

export class CanonicalisationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalisationError';
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

/**
 * Known weak or dummy Ed25519 public keys to reject in production.
 * Includes all-zeros, all-ones, repetitive patterns, and standard test vectors.
 */
const KNOWN_DUMMY_PATTERNS = [
  /^0+$/,
  /^f+$/i,
  /^1+$/,
  /^(01){16}$/,
  /^(00){16}$/,
  /^(ff){16}$/i,
  /^(1234567890abcdef){2}$/i,
  /^(deadbeef){4}$/i,
  /^(baadf00d){4}$/i,
];

/**
 * Validates whether an Ed25519 public key hex string is weak or dummy.
 * In production environments, weak or dummy keys are strictly prohibited.
 */
export function isWeakOrDummyKey(publicKeyHex: string): boolean {
  logger.debug('Evaluating Ed25519 public key strength and entropy', {
    publicKeyPrefix: typeof publicKeyHex === 'string' ? publicKeyHex.slice(0, 8) : 'invalid_type',
  });

  if (!publicKeyHex || typeof publicKeyHex !== 'string') {
    logger.warn('Weak Ed25519 key rejected: missing or non-string format', {
      type: typeof publicKeyHex,
    });
    return true;
  }
  const cleanHex = publicKeyHex.trim().toLowerCase();
  if (cleanHex.length !== 64 || !HEX_REGEX.test(cleanHex)) {
    logger.warn('Weak Ed25519 key rejected: length or hex regex mismatch', {
      length: cleanHex.length,
      isHex: HEX_REGEX.test(cleanHex),
    });
    return true;
  }

  // Check known dummy patterns
  for (const pattern of KNOWN_DUMMY_PATTERNS) {
    if (pattern.test(cleanHex)) {
      logger.warn('Weak Ed25519 key rejected: matched known dummy key pattern', {
        pattern: pattern.toString(),
        keyPrefix: cleanHex.slice(0, 8),
      });
      return true;
    }
  }

  // Check byte entropy / uniqueness
  const buf = Buffer.from(cleanHex, 'hex');
  const uniqueBytes = new Set(buf);
  if (uniqueBytes.size <= 4) {
    // Fewer than 4 distinct byte values in a 32-byte Ed25519 key indicates a dummy or repetitive key
    logger.warn('Weak Ed25519 key rejected: insufficient byte entropy in public key', {
      uniqueBytesCount: uniqueBytes.size,
      keyPrefix: cleanHex.slice(0, 8),
    });
    return true;
  }

  logger.debug('Ed25519 public key entropy check passed', {
    uniqueBytesCount: uniqueBytes.size,
    keyPrefix: cleanHex.slice(0, 8),
  });
  return false;
}

/**
 * Asserts that the given Ed25519 public key meets production security requirements.
 * Throws SecurityError if weak/dummy keys are detected in production.
 */
export function assertStrongKeyInProduction(publicKeyHex: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  logger.debug('Checking Ed25519 key production security constraints', {
    isProduction,
    keyPrefix: typeof publicKeyHex === 'string' ? publicKeyHex.slice(0, 8) : 'invalid',
  });

  if (isProduction && isWeakOrDummyKey(publicKeyHex)) {
    logger.error('ED25519_WEAK_OR_DUMMY_KEY_REJECTED: Weak or dummy key prohibited in production', {
      publicKeyPrefix: publicKeyHex.slice(0, 8),
    });
    throw new SecurityError('ED25519_WEAK_OR_DUMMY_KEY_REJECTED: Weak or dummy keys are prohibited in production.');
  }
}

/**
 * Retrieves a cached KeyObject for the given public key hex, or creates, caches, and returns a new one.
 * Thread-safe and atomic in the single-threaded Node.js event loop.
 */
export function getOrCreateEd25519KeyObject(publicKeyHex: string, publicKeyBuffer?: Buffer): crypto.KeyObject {
  const normalizedHex = publicKeyHex.toLowerCase();
  const cached = keyObjectLruCache.get(normalizedHex);
  if (cached) {
    logger.debug('Ed25519 KeyObject cache hit', {
      keyPrefix: normalizedHex.slice(0, 8),
      cacheSize: keyObjectLruCache.size,
    });
    keyObjectLruCache.delete(normalizedHex);
    keyObjectLruCache.set(normalizedHex, cached);
    return cached;
  }

  logger.debug('Ed25519 KeyObject cache miss, constructing new KeyObject', {
    keyPrefix: normalizedHex.slice(0, 8),
    currentCacheSize: keyObjectLruCache.size,
  });

  const buf = publicKeyBuffer ?? Buffer.from(normalizedHex, 'hex');
  if (buf.length !== 32) {
    logger.error('Invalid Ed25519 public key byte length', {
      expected: 32,
      received: buf.length,
      keyPrefix: normalizedHex.slice(0, 8),
    });
    throw new SecurityError(`Invalid Ed25519 public key byte length: expected 32 bytes, got ${buf.length}`);
  }

  const keyObject = crypto.createPublicKey({
    key: Buffer.concat([ASN1_SPKI_ED25519_PREFIX, buf]),
    format: 'der',
    type: 'spki',
  });

  if (keyObjectLruCache.size >= MAX_KEY_CACHE_SIZE) {
    const oldestKey = keyObjectLruCache.keys().next().value;
    if (oldestKey !== undefined) {
      logger.debug('Evicting oldest Ed25519 KeyObject from LRU cache', {
        evictedKeyPrefix: oldestKey.slice(0, 8),
        maxSize: MAX_KEY_CACHE_SIZE,
      });
      keyObjectLruCache.delete(oldestKey);
    }
  }

  keyObjectLruCache.set(normalizedHex, keyObject);
  logger.debug('Cached parsed Ed25519 KeyObject', {
    keyPrefix: normalizedHex.slice(0, 8),
    newSize: keyObjectLruCache.size,
  });
  return keyObject;
}

/**
 * Clears the Ed25519 KeyObject cache.
 */
export function clearKeyObjectCache(): void {
  const size = keyObjectLruCache.size;
  keyObjectLruCache.clear();
  logger.info('Cleared Ed25519 KeyObject LRU cache', { evictedEntries: size });
}

/**
 * Validates that a node contains only deterministic canonical types.
 * Strictly rejects non-integer floats to prevent platform-dependent float representation drift.
 */
export function validateCanonicalNode(node: unknown, path = '$'): void {
  if (node === null || typeof node === 'boolean' || typeof node === 'string') {
    return;
  }

  if (typeof node === 'number') {
    if (!Number.isFinite(node)) {
      logger.error('Canonical validation failure: non-finite number', { path, value: node });
      throw new CanonicalisationError(`Non-finite number at ${path}: ${node}`);
    }
    if (!Number.isInteger(node)) {
      logger.error('Canonical validation failure: floating-point number detected in financial hash path', {
        path,
        value: node,
      });
      throw new CanonicalisationError(
        `float at ${path}: ${node}. Floats have no canonical form and must never enter the hash chain — use integer cents or basis points.`
      );
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      validateCanonicalNode(node[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof node === 'object') {
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (typeof key !== 'string') {
        logger.error('Canonical validation failure: non-string object key', { path, key: String(key) });
        throw new CanonicalisationError(`non-string key at ${path}: ${String(key)}`);
      }
      validateCanonicalNode(val, `${path}.${key}`);
    }
    return;
  }

  logger.error('Canonical validation failure: unserialisable type', { path, type: typeof node });
  throw new CanonicalisationError(`unserialisable type at ${path}: ${typeof node}`);
}

/**
 * Serializes value into canonical JSON string (RFC 8785 canonical key ordering, no extra whitespace).
 */
export function canonicalJson(value: unknown): string {
  validateCanonicalNode(value);

  function sortAndStringify(v: unknown): string {
    if (v === null || typeof v === 'boolean' || typeof v === 'number') {
      return JSON.stringify(v);
    }
    if (typeof v === 'string') {
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
      return '[' + v.map(sortAndStringify).join(',') + ']';
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      const parts = keys.map(
        (k) => JSON.stringify(k) + ':' + sortAndStringify((v as Record<string, unknown>)[k])
      );
      return '{' + parts.join(',') + '}';
    }
    return '';
  }

  return sortAndStringify(value);
}

/**
 * Generates lowercase SHA-256 hex string from canonical bytes.
 */
export function canonicalHash(value: unknown): string {
  const jsonStr = canonicalJson(value);
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

/**
 * Deterministic hash computation using (previous_hash + payload + nonce).
 * Strictly guarantees immutable audit chaining.
 */
export function computeChainHash(params: {
  previous_hash: string;
  payload: Record<string, unknown>;
  nonce: string;
}): string {
  logger.debug('Computing SHA-256 chain hash link', {
    previousHashPrefix: params.previous_hash?.slice(0, 16),
    noncePrefix: params.nonce?.slice(0, 8),
    payloadKeys: params.payload ? Object.keys(params.payload) : [],
  });

  if (!params.previous_hash || !HEX_REGEX.test(params.previous_hash) || params.previous_hash.length !== 64) {
    logger.error('Invalid previous_hash in computeChainHash', {
      previous_hash: params.previous_hash,
      length: params.previous_hash?.length,
    });
    throw new LedgerError('Invalid previous_hash: must be 64-character hexadecimal SHA-256 string');
  }
  if (!params.nonce || typeof params.nonce !== 'string') {
    logger.error('Invalid nonce in computeChainHash', {
      nonce: params.nonce,
      type: typeof params.nonce,
    });
    throw new LedgerError('Invalid nonce: must be a non-empty string');
  }

  // Canonicalize payload to guarantee deterministic representation
  const canonicalPayloadString = canonicalJson(params.payload);

  // SHA-256(previous_hash + canonicalJson(payload) + nonce)
  const hash = crypto
    .createHash('sha256')
    .update(params.previous_hash, 'utf8')
    .update(canonicalPayloadString, 'utf8')
    .update(params.nonce, 'utf8')
    .digest('hex');

  logger.debug('Computed SHA-256 chain hash link successfully', {
    hashPrefix: hash.slice(0, 16),
    payloadByteLength: Buffer.byteLength(canonicalPayloadString, 'utf8'),
  });
  return hash;
}

/**
 * Constant-time hex hash comparison using crypto.timingSafeEqual to prevent timing attacks.
 */
export function timingSafeHashEqual(hashA: string, hashB: string): boolean {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    logger.warn('Constant-time hash comparison failed: non-string argument received', {
      typeA: typeof hashA,
      typeB: typeof hashB,
    });
    return false;
  }
  const bufA = Buffer.from(hashA, 'hex');
  const bufB = Buffer.from(hashB, 'hex');
  if (bufA.length !== bufB.length || bufA.length !== 32) {
    logger.warn('Constant-time hash comparison failed: buffer length mismatch', {
      lenA: bufA.length,
      lenB: bufB.length,
    });
    return false;
  }
  const isEqual = crypto.timingSafeEqual(bufA, bufB);
  logger.debug('Constant-time hash comparison evaluated', {
    prefixA: hashA.slice(0, 8),
    prefixB: hashB.slice(0, 8),
    isEqual,
  });
  return isEqual;
}

/**
 * Verifies an Ed25519 signature in constant time against a public key.
 */
export function verifyEd25519Signature(params: {
  publicKeyHex: string;
  signatureHex: string;
  data: Buffer | string;
}): boolean {
  const { publicKeyHex, signatureHex, data } = params;

  logger.debug('Initiating Ed25519 signature verification', {
    publicKeyPrefix: typeof publicKeyHex === 'string' ? publicKeyHex.slice(0, 8) : 'invalid',
    signaturePrefix: typeof signatureHex === 'string' ? signatureHex.slice(0, 16) : 'invalid',
    dataType: Buffer.isBuffer(data) ? 'Buffer' : typeof data,
  });

  // Validate format and lengths
  if (!publicKeyHex || !HEX_REGEX.test(publicKeyHex) || publicKeyHex.length !== 64) {
    logger.warn('Ed25519 verification rejected: invalid public key hex format or length', {
      hasKey: Boolean(publicKeyHex),
      length: publicKeyHex?.length,
    });
    return false;
  }
  if (!signatureHex || !HEX_REGEX.test(signatureHex) || signatureHex.length !== 128) {
    logger.warn('Ed25519 verification rejected: invalid signature hex format or length', {
      hasSig: Boolean(signatureHex),
      length: signatureHex?.length,
    });
    return false;
  }

  assertStrongKeyInProduction(publicKeyHex);

  try {
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const signatureBuffer = Buffer.from(signatureHex, 'hex');
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    const keyObject = getOrCreateEd25519KeyObject(publicKeyHex, publicKeyBuffer);

    // crypto.verify for ed25519 uses constant-time signature verification in native libcrypto / OpenSSL
    const isValid = crypto.verify(null, dataBuffer, keyObject, signatureBuffer);
    logger.info('Ed25519 signature verification completed', {
      publicKeyPrefix: publicKeyHex.slice(0, 8),
      isValid,
      dataByteLength: dataBuffer.length,
    });
    return isValid;
  } catch (error: any) {
    logger.error('Unexpected error during Ed25519 signature verification', {
      error: error?.message || String(error),
      stack: error?.stack,
      publicKeyPrefix: publicKeyHex?.slice(0, 8),
    });
    return false;
  }
}

/**
 * Signs data using an Ed25519 private key.
 */
export function signEd25519(privateKey: crypto.KeyObject | crypto.PrivateKeyInput, data: Buffer | string): string {
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  logger.debug('Signing payload with Ed25519 private key', {
    dataByteLength: dataBuffer.length,
  });
  const sig = crypto.sign(null, dataBuffer, privateKey);
  const sigHex = sig.toString('hex');
  logger.info('Generated Ed25519 signature', {
    signatureLength: sigHex.length,
    signaturePrefix: sigHex.slice(0, 16),
  });
  return sigHex;
}

/**
 * One immutable link in the Ed25519 Custodian audit chain.
 */
export interface AuditBlock {
  readonly seq: number;
  readonly block_id: string;
  readonly request_id: string;
  readonly ts: string;
  readonly nonce: string;
  readonly previous_hash: string;
  readonly payload: Record<string, unknown>;
  readonly hash: string;
  readonly signer_public_key_hex?: string;
  readonly signature_hex?: string;
}

/**
 * Thread-safe, append-only, tamper-evident cryptographic audit chain.
 */
export class Ed25519AuditChain {
  private blocks: AuditBlock[] = [];

  getHead(): AuditBlock | null {
    return this.blocks.length > 0 ? this.blocks[this.blocks.length - 1] : null;
  }

  append(params: {
    request_id: string;
    payload: Record<string, unknown>;
    nonce?: string;
    block_id?: string;
    ts?: string;
    privateKey?: crypto.KeyObject;
    signer_public_key_hex?: string;
  }): AuditBlock {
    logger.info('Appending new block to Ed25519 audit chain', {
      requestId: params.request_id,
      currentChainLength: this.blocks.length,
      hasExplicitNonce: Boolean(params.nonce),
      hasExplicitBlockId: Boolean(params.block_id),
      hasPrivateKey: Boolean(params.privateKey),
    });

    if (!params.payload || typeof params.payload !== 'object' || Array.isArray(params.payload)) {
      logger.error('Failed to append audit block: payload is not a key-value record', {
        requestId: params.request_id,
        payloadType: Array.isArray(params.payload) ? 'array' : typeof params.payload,
      });
      throw new LedgerError('payload must be a valid key-value record');
    }

    // Validate canonical types (reject floats)
    validateCanonicalNode(params.payload);

    const prev = this.getHead();
    const previous_hash = prev ? prev.hash : GENESIS_HASH;
    const seq = this.blocks.length + 1;
    const nonce = params.nonce || crypto.randomBytes(16).toString('hex');
    const block_id = params.block_id || `blk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const ts = params.ts || new Date().toISOString();

    logger.debug('Computing chain hash for new audit block', {
      seq,
      block_id,
      previousHashPrefix: previous_hash.slice(0, 16),
      isGenesisLink: previous_hash === GENESIS_HASH,
    });

    const hash = computeChainHash({
      previous_hash,
      payload: params.payload,
      nonce,
    });

    let signature_hex: string | undefined = undefined;
    let signer_public_key_hex: string | undefined = params.signer_public_key_hex;

    if (params.privateKey) {
      logger.debug('Signing audit block hash with private key', { block_id, seq });
      signature_hex = signEd25519(params.privateKey, hash);
    }

    const block: AuditBlock = {
      seq,
      block_id,
      request_id: params.request_id,
      ts,
      nonce,
      previous_hash,
      payload: params.payload,
      hash,
      ...(signer_public_key_hex ? { signer_public_key_hex } : {}),
      ...(signature_hex ? { signature_hex } : {}),
    };

    this.blocks.push(Object.freeze(block));
    logger.info('Successfully appended and sealed Ed25519 audit block', {
      seq,
      block_id,
      hashPrefix: hash.slice(0, 16),
      isSigned: Boolean(signature_hex),
      totalBlocks: this.blocks.length,
    });
    return block;
  }

  verifyChain(): boolean {
    logger.info('Verifying Ed25519 audit chain integrity', { totalBlocks: this.blocks.length });

    for (let i = 0; i < this.blocks.length; i++) {
      const current = this.blocks[i];
      const expectedPrevHash = i === 0 ? GENESIS_HASH : this.blocks[i - 1].hash;

      // Constant-time check on previous_hash
      if (!timingSafeHashEqual(current.previous_hash, expectedPrevHash)) {
        logger.error('Ed25519 audit chain tampering detected: previous_hash mismatch', {
          blockSeq: current.seq,
          blockId: current.block_id,
          actualPrevHashPrefix: current.previous_hash.slice(0, 16),
          expectedPrevHashPrefix: expectedPrevHash.slice(0, 16),
        });
        return false;
      }

      // Re-compute deterministic SHA-256 hash (previous_hash + payload + nonce)
      const calculatedHash = computeChainHash({
        previous_hash: current.previous_hash,
        payload: current.payload,
        nonce: current.nonce,
      });

      // Constant-time check on block hash
      if (!timingSafeHashEqual(current.hash, calculatedHash)) {
        logger.error('Ed25519 audit chain tampering detected: hash computation mismatch', {
          blockSeq: current.seq,
          blockId: current.block_id,
          recordedHashPrefix: current.hash.slice(0, 16),
          recomputedHashPrefix: calculatedHash.slice(0, 16),
        });
        return false;
      }

      // Verify Ed25519 signature if attached
      if (current.signature_hex && current.signer_public_key_hex) {
        logger.debug('Verifying block signature in audit chain verification', {
          blockSeq: current.seq,
          blockId: current.block_id,
        });
        const isSigValid = verifyEd25519Signature({
          publicKeyHex: current.signer_public_key_hex,
          signatureHex: current.signature_hex,
          data: current.hash,
        });
        if (!isSigValid) {
          logger.error('Ed25519 audit chain tampering detected: invalid signature on block', {
            blockSeq: current.seq,
            blockId: current.block_id,
            signerPublicKeyPrefix: current.signer_public_key_hex.slice(0, 8),
          });
          return false;
        }
      }
    }

    logger.info('Ed25519 audit chain integrity fully verified', { totalBlocks: this.blocks.length });
    return true;
  }

  getBlocks(): readonly AuditBlock[] {
    return [...this.blocks];
  }

  getBlockByRequestId(requestId: string): AuditBlock[] {
    return this.blocks.filter((b) => b.request_id === requestId);
  }

  clear(): void {
    const priorCount = this.blocks.length;
    this.blocks = [];
    logger.info('Cleared Ed25519 audit chain', { clearedBlocksCount: priorCount });
  }
}

export const defaultEd25519AuditChain = new Ed25519AuditChain();
