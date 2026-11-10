import crypto from 'node:crypto';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import type { SpendMandate } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:Ed25519Verifier', { stream: 'stderr' });

const HEX_REGEX = /^[0-9a-fA-F]+$/;
const ASN1_SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex'); // SubjectPublicKeyInfo ASN.1 prefix for Ed25519

// LRU Cache for parsed crypto.KeyObject instances keyed by public_key_hex
// Avoids repetitive ASN.1 DER parsing and key object creation overhead
const MAX_KEY_CACHE_SIZE = 1000;
const keyObjectLruCache = new Map<string, crypto.KeyObject>();

/**
 * Retrieves a cached KeyObject for the given public key hex, or creates, caches, and returns a new one.
 * Uses a Map as an LRU cache (delete + set to move recently accessed entry to end).
 */
export function getOrCreateEd25519KeyObject(publicKeyHex: string, publicKeyBuffer: Buffer): crypto.KeyObject {
  const normalizedHex = publicKeyHex.toLowerCase();
  const cached = keyObjectLruCache.get(normalizedHex);
  if (cached) {
    logger.debug('Ed25519 KeyObject cache hit', {
      keyPrefix: normalizedHex.slice(0, 8),
      cacheSize: keyObjectLruCache.size,
    });
    // Refresh LRU ordering
    keyObjectLruCache.delete(normalizedHex);
    keyObjectLruCache.set(normalizedHex, cached);
    return cached;
  }

  logger.debug('Ed25519 KeyObject cache miss, parsing ASN.1 SPKI structure', {
    keyPrefix: normalizedHex.slice(0, 8),
  });

  // Parse Ed25519 ASN.1 DER SPKI structure
  const keyObject = crypto.createPublicKey({
    key: Buffer.concat([ASN1_SPKI_ED25519_PREFIX, publicKeyBuffer]),
    format: 'der',
    type: 'spki',
  });

  // Evict oldest entry if capacity reached
  if (keyObjectLruCache.size >= MAX_KEY_CACHE_SIZE) {
    const oldestKey = keyObjectLruCache.keys().next().value;
    if (oldestKey !== undefined) {
      logger.debug('Evicting oldest Ed25519 KeyObject from LRU cache', {
        evictedPrefix: oldestKey.slice(0, 8),
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
 * Returns the current number of cached parsed KeyObjects.
 */
export function getKeyObjectCacheSize(): number {
  return keyObjectLruCache.size;
}

/**
 * Clears the Ed25519 KeyObject LRU cache.
 */
export function clearKeyObjectCache(): void {
  logger.info('Clearing Ed25519 KeyObject LRU cache', { priorSize: keyObjectLruCache.size });
  keyObjectLruCache.clear();
}

export async function verifySessionMandateSignature(mandate: SpendMandate): Promise<boolean> {
  const endTimer = logger.time(`Ed25519:verify:${mandate?.mandate_id}`);
  logger.info('Verifying Ed25519 SessionMandate signature', {
    mandateId: mandate?.mandate_id,
    buyerId: mandate?.buyer_id,
    publicKeyPrefix: mandate?.public_key_hex ? mandate.public_key_hex.slice(0, 8) : undefined,
  });

  try {
    // 1. Verify mandate status is 'ACTIVE' and expires_at is in the future (> new Date())
    if (mandate.status !== 'ACTIVE') {
      logger.warn('Mandate signature check rejected: status is not ACTIVE', {
        status: mandate.status,
        mandateId: mandate.mandate_id,
      });
      endTimer('Status not ACTIVE');
      return false;
    }

    const expiresAt = mandate.expires_at instanceof Date ? mandate.expires_at : new Date(mandate.expires_at);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      logger.warn('Mandate signature check rejected: mandate has expired or invalid date', {
        expiresAt: expiresAt.toISOString(),
        now: new Date().toISOString(),
        mandateId: mandate.mandate_id,
      });
      endTimer('Mandate expired');
      return false;
    }

    // 2. Verify hexadecimal formatting using regex /^[0-9a-fA-F]+$/
    if (!mandate.ed25519_signature_hex || !HEX_REGEX.test(mandate.ed25519_signature_hex)) {
      logger.warn('Mandate signature check rejected: invalid signature hexadecimal formatting', {
        mandateId: mandate.mandate_id,
      });
      endTimer('Invalid signature hex format');
      return false;
    }
    if (!mandate.public_key_hex || !HEX_REGEX.test(mandate.public_key_hex)) {
      logger.warn('Mandate signature check rejected: invalid public key hexadecimal formatting', {
        mandateId: mandate.mandate_id,
      });
      endTimer('Invalid public key hex format');
      return false;
    }

    // 3. Enforce exact signatureBuffer length of 64 bytes and publicKeyBuffer length of 32 bytes
    const signatureBuffer = Buffer.from(mandate.ed25519_signature_hex, 'hex');
    const publicKeyBuffer = Buffer.from(mandate.public_key_hex, 'hex');

    if (signatureBuffer.length !== 64 || publicKeyBuffer.length !== 32) {
      logger.warn('Mandate signature check rejected: buffer byte length mismatch', {
        signatureBufferLength: signatureBuffer.length,
        expectedSigLength: 64,
        publicKeyBufferLength: publicKeyBuffer.length,
        expectedPubLength: 32,
        mandateId: mandate.mandate_id,
      });
      endTimer('Buffer length mismatch');
      return false;
    }

    // Create the message string that was signed
    // This assumes a specific serialization format for signing, e.g., JSON stringified without signature fields
    const messageObj = {
      mandate_id: mandate.mandate_id,
      buyer_id: mandate.buyer_id,
      max_total_spend_cents: mandate.max_total_spend_cents,
      max_single_merchant_cents: mandate.max_single_merchant_cents,
      currency_code: mandate.currency_code,
      allowed_category_ids: mandate.allowed_category_ids,
      expires_at: expiresAt.toISOString(),
      status: mandate.status,
      public_key_hex: mandate.public_key_hex,
    };

    const messageString = JSON.stringify(messageObj);
    logger.debug('Prepared message payload for Ed25519 cryptographic verification', {
      mandateId: mandate.mandate_id,
      messageLength: messageString.length,
    });

    // Retrieve or create parsed Ed25519 public key from LRU cache
    const publicKey = getOrCreateEd25519KeyObject(mandate.public_key_hex, publicKeyBuffer);

    const isVerified = crypto.verify(
      null, // algorithm is null for ed25519
      Buffer.from(messageString, 'utf8'),
      publicKey,
      signatureBuffer
    );

    logger.info('Ed25519 signature verification outcome', {
      mandateId: mandate.mandate_id,
      isVerified,
    });
    endTimer(`Verification verdict: isVerified=${isVerified}`);

    return isVerified;
  } catch (error: any) {
    logger.error('Error verifying mandate signature with WebCrypto/crypto.verify', {
      mandateId: mandate?.mandate_id,
      error: error?.message,
      stack: error?.stack,
    });
    endTimer('Cryptographic error');
    return false;
  }
}
