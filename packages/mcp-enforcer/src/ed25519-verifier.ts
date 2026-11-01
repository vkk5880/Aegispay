import crypto from 'node:crypto';
import type { SpendMandate } from '@aegispay/shared-types';

export async function verifySessionMandateSignature(mandate: SpendMandate): Promise<boolean> {
  try {
    // Create the message string that was signed
    // This assumes a specific serialization format for signing, e.g., JSON stringified without signature fields
    const messageObj = {
      mandate_id: mandate.mandate_id,
      buyer_id: mandate.buyer_id,
      max_total_spend_cents: mandate.max_total_spend_cents,
      max_single_merchant_cents: mandate.max_single_merchant_cents,
      currency_code: mandate.currency_code,
      allowed_category_ids: mandate.allowed_category_ids,
      expires_at: mandate.expires_at.toISOString(),
      status: mandate.status,
      public_key_hex: mandate.public_key_hex
    };

    // In a real system, the serialization needs to be strictly deterministic.
    // For this demonstration, we assume JSON.stringify with stable key order.
    const messageString = JSON.stringify(messageObj);

    // Convert hex strings to buffers
    const signatureBuffer = Buffer.from(mandate.ed25519_signature_hex, 'hex');
    const publicKeyBuffer = Buffer.from(mandate.public_key_hex, 'hex');

    // Import raw Ed25519 public key
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'), // SubjectPublicKeyInfo ASN.1 prefix for Ed25519
        publicKeyBuffer
      ]),
      format: 'der',
      type: 'spki',
    });

    const isVerified = crypto.verify(
      null, // algorithm is null for ed25519
      Buffer.from(messageString, 'utf8'),
      publicKey,
      signatureBuffer
    );

    return isVerified;
  } catch (error) {
    console.error('Error verifying mandate signature:', error);
    return false;
  }
}
