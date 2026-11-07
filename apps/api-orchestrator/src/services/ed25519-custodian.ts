import crypto from 'node:crypto';

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
  if (!publicKeyHex || typeof publicKeyHex !== 'string') {
    return true;
  }
  const cleanHex = publicKeyHex.trim().toLowerCase();
  if (cleanHex.length !== 64 || !HEX_REGEX.test(cleanHex)) {
    return true;
  }

  // Check known dummy patterns
  for (const pattern of KNOWN_DUMMY_PATTERNS) {
    if (pattern.test(cleanHex)) {
      return true;
    }
  }

  // Check byte entropy / uniqueness
  const buf = Buffer.from(cleanHex, 'hex');
  const uniqueBytes = new Set(buf);
  if (uniqueBytes.size <= 4) {
    // Fewer than 4 distinct byte values in a 32-byte Ed25519 key indicates a dummy or repetitive key
    return true;
  }

  return false;
}

/**
 * Asserts that the given Ed25519 public key meets production security requirements.
 * Throws SecurityError if weak/dummy keys are detected in production.
 */
export function assertStrongKeyInProduction(publicKeyHex: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && isWeakOrDummyKey(publicKeyHex)) {
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
    keyObjectLruCache.delete(normalizedHex);
    keyObjectLruCache.set(normalizedHex, cached);
    return cached;
  }

  const buf = publicKeyBuffer ?? Buffer.from(normalizedHex, 'hex');
  if (buf.length !== 32) {
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
      keyObjectLruCache.delete(oldestKey);
    }
  }

  keyObjectLruCache.set(normalizedHex, keyObject);
  return keyObject;
}

/**
 * Clears the Ed25519 KeyObject cache.
 */
export function clearKeyObjectCache(): void {
  keyObjectLruCache.clear();
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
      throw new CanonicalisationError(`Non-finite number at ${path}: ${node}`);
    }
    if (!Number.isInteger(node)) {
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
        throw new CanonicalisationError(`non-string key at ${path}: ${String(key)}`);
      }
      validateCanonicalNode(val, `${path}.${key}`);
    }
    return;
  }

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
  if (!params.previous_hash || !HEX_REGEX.test(params.previous_hash) || params.previous_hash.length !== 64) {
    throw new LedgerError('Invalid previous_hash: must be 64-character hexadecimal SHA-256 string');
  }
  if (!params.nonce || typeof params.nonce !== 'string') {
    throw new LedgerError('Invalid nonce: must be a non-empty string');
  }

  // Canonicalize payload to guarantee deterministic representation
  const canonicalPayloadString = canonicalJson(params.payload);

  // SHA-256(previous_hash + canonicalJson(payload) + nonce)
  return crypto
    .createHash('sha256')
    .update(params.previous_hash, 'utf8')
    .update(canonicalPayloadString, 'utf8')
    .update(params.nonce, 'utf8')
    .digest('hex');
}

/**
 * Constant-time hex hash comparison using crypto.timingSafeEqual to prevent timing attacks.
 */
export function timingSafeHashEqual(hashA: string, hashB: string): boolean {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    return false;
  }
  const bufA = Buffer.from(hashA, 'hex');
  const bufB = Buffer.from(hashB, 'hex');
  if (bufA.length !== bufB.length || bufA.length !== 32) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
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

  // Validate format and lengths
  if (!publicKeyHex || !HEX_REGEX.test(publicKeyHex) || publicKeyHex.length !== 64) {
    return false;
  }
  if (!signatureHex || !HEX_REGEX.test(signatureHex) || signatureHex.length !== 128) {
    return false;
  }

  assertStrongKeyInProduction(publicKeyHex);

  try {
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const signatureBuffer = Buffer.from(signatureHex, 'hex');
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    const keyObject = getOrCreateEd25519KeyObject(publicKeyHex, publicKeyBuffer);

    // crypto.verify for ed25519 uses constant-time signature verification in native libcrypto / OpenSSL
    return crypto.verify(null, dataBuffer, keyObject, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Signs data using an Ed25519 private key.
 */
export function signEd25519(privateKey: crypto.KeyObject | crypto.PrivateKeyInput, data: Buffer | string): string {
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const sig = crypto.sign(null, dataBuffer, privateKey);
  return sig.toString('hex');
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
    if (!params.payload || typeof params.payload !== 'object' || Array.isArray(params.payload)) {
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

    const hash = computeChainHash({
      previous_hash,
      payload: params.payload,
      nonce,
    });

    let signature_hex: string | undefined = undefined;
    let signer_public_key_hex: string | undefined = params.signer_public_key_hex;

    if (params.privateKey) {
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
    return block;
  }

  verifyChain(): boolean {
    for (let i = 0; i < this.blocks.length; i++) {
      const current = this.blocks[i];
      const expectedPrevHash = i === 0 ? GENESIS_HASH : this.blocks[i - 1].hash;

      // Constant-time check on previous_hash
      if (!timingSafeHashEqual(current.previous_hash, expectedPrevHash)) {
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
        return false;
      }

      // Verify Ed25519 signature if attached
      if (current.signature_hex && current.signer_public_key_hex) {
        const isSigValid = verifyEd25519Signature({
          publicKeyHex: current.signer_public_key_hex,
          signatureHex: current.signature_hex,
          data: current.hash,
        });
        if (!isSigValid) {
          return false;
        }
      }
    }
    return true;
  }

  getBlocks(): readonly AuditBlock[] {
    return [...this.blocks];
  }

  getBlockByRequestId(requestId: string): AuditBlock[] {
    return this.blocks.filter((b) => b.request_id === requestId);
  }

  clear(): void {
    this.blocks = [];
  }
}

export const defaultEd25519AuditChain = new Ed25519AuditChain();
