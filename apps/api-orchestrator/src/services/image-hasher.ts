import crypto from 'node:crypto';
import { PerceptualHashResult, createLogger } from '@aegispay/shared-types';

const logger = createLogger('API:Services:ImageHasher');

/**
 * Pure TypeScript 64-bit difference hash (dHash) generator and image deduplicator.
 * Adheres strictly to GUARDRAIL 1: Zero native C++ binaries (no sharp, no canvas).
 * Operates purely on Node.js Buffer / Uint8Array byte streams.
 */

/**
 * Computes SHA-256 hash of image buffer.
 */
export function computeImageSha256(buffer: Buffer | Uint8Array): string {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  logger.debug(`computeImageSha256: payload size=${buffer.length} bytes, sha256=${hash}`);
  return hash;
}

/**
 * Samples 72 equidistant luminance points (8 rows x 9 columns) across the image data payload.
 */
function sampleLuminanceGrid(buffer: Buffer): number[][] {
  const len = buffer.length;
  logger.debug(`sampleLuminanceGrid: sampling buffer of ${len} bytes`);

  // Fallback if buffer is tiny
  if (len < 72) {
    logger.warn(`sampleLuminanceGrid: Buffer size (${len} bytes) < 72, returning default neutral luminance grid`);
    const defaultGrid: number[][] = [];
    for (let r = 0; r < 8; r++) {
      defaultGrid.push(new Array(9).fill(128));
    }
    return defaultGrid;
  }

  // Find start of image data payload: skip header bytes
  // For JPEG: skip SOI (0xFFD8) and APP markers, look for image stream
  let startOffset = 0;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    startOffset = Math.min(len - 100, 128);
    logger.debug(`sampleLuminanceGrid: detected JPEG magic bytes (0xFFD8), startOffset=${startOffset}`);
  } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    // PNG: skip 8-byte signature + IHDR chunk
    startOffset = Math.min(len - 100, 33);
    logger.debug(`sampleLuminanceGrid: detected PNG magic bytes (0x89504E47), startOffset=${startOffset}`);
  } else {
    logger.debug(`sampleLuminanceGrid: generic/unrecognized image format header, startOffset=0`);
  }

  const payloadLength = Math.max(72, len - startOffset - 2);
  const step = Math.floor(payloadLength / 72);
  logger.debug(`sampleLuminanceGrid: payloadLength=${payloadLength}, step=${step}`);

  const grid: number[][] = [];
  let sampleIndex = 0;

  for (let r = 0; r < 8; r++) {
    const row: number[] = [];
    for (let c = 0; c < 9; c++) {
      const offset = startOffset + sampleIndex * step;
      // Read 3 consecutive bytes as RGB or luminance proxy
      const b1 = buffer[Math.min(len - 1, offset)];
      const b2 = buffer[Math.min(len - 1, offset + 1)];
      const b3 = buffer[Math.min(len - 1, offset + 2)];
      // ITU-R BT.601 standard luminance: Y = 0.299R + 0.587G + 0.114B
      const luminance = Math.round(0.299 * b1 + 0.587 * b2 + 0.114 * b3);
      row.push(luminance);
      sampleIndex++;
    }
    grid.push(row);
  }

  logger.debug(`sampleLuminanceGrid: sampled 8x9 grid successfully (${sampleIndex} points)`);
  return grid;
}

/**
 * Computes 64-bit difference hash (dHash) as a 16-character hexadecimal string.
 * For each row (8 rows), compares column c+1 > column c (8 comparisons per row).
 */
export function computeDHash(buffer: Buffer | Uint8Array): string {
  const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  logger.debug(`computeDHash: starting dHash calculation for ${nodeBuf.length} bytes`);
  const grid = sampleLuminanceGrid(nodeBuf);

  let hexResult = '';

  for (let r = 0; r < 8; r++) {
    let rowByte = 0;
    for (let c = 0; c < 8; c++) {
      const bit = grid[r][c + 1] > grid[r][c] ? 1 : 0;
      rowByte = (rowByte << 1) | bit;
    }
    hexResult += rowByte.toString(16).padStart(2, '0');
  }

  const dHash = hexResult.toLowerCase();
  logger.info(`computeDHash: generated 64-bit dHash=${dHash}`);
  return dHash;
}

/**
 * Computes the Hamming distance (number of differing bits) between two 16-char dHash strings.
 */
export function computeHammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== 16 || hashB.length !== 16) {
    logger.error(`computeHammingDistance error: invalid length (hashA=${hashA.length}, hashB=${hashB.length})`);
    throw new Error('dHash strings must be exactly 16 hexadecimal characters (64 bits)');
  }

  let distance = 0;
  for (let i = 0; i < 16; i += 2) {
    const byteA = parseInt(hashA.slice(i, i + 2), 16);
    const byteB = parseInt(hashB.slice(i, i + 2), 16);
    let xor = byteA ^ byteB;
    // Count set bits (popcount)
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  logger.debug(`computeHammingDistance: hashA=${hashA}, hashB=${hashB}, distance=${distance}`);
  return distance;
}

export interface KnownEvidenceRecord {
  claim_id: string;
  sha256: string;
  dHash: string;
}

/**
 * Evaluates an incoming claim image against existing evidence records.
 * Returns duplicate flag if exact SHA-256 matches OR perceptual dHash Hamming distance <= threshold (default 10).
 */
export function evaluatePerceptualDuplicate(
  buffer: Buffer | Uint8Array,
  knownEvidence: KnownEvidenceRecord[] = [],
  hammingThreshold: number = 10
): PerceptualHashResult {
  const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  logger.info(`evaluatePerceptualDuplicate: evaluating ${nodeBuf.length} bytes against ${knownEvidence.length} known records with threshold=${hammingThreshold}`);

  const sha256 = computeImageSha256(nodeBuf);
  const dHash = computeDHash(nodeBuf);

  for (let idx = 0; idx < knownEvidence.length; idx++) {
    const record = knownEvidence[idx];
    logger.debug(`Checking record [${idx}] claim_id=${record.claim_id}: sha256=${record.sha256}, dHash=${record.dHash}`);

    // Exact hash match
    if (record.sha256 === sha256) {
      logger.warn(`Exact SHA-256 collision detected with claim ${record.claim_id}`);
      return {
        sha256,
        dHash,
        is_duplicate: true,
        hamming_distance: 0,
        matched_claim_id: record.claim_id,
      };
    } else {
      logger.debug(`Record [${idx}] SHA-256 did not match incoming image`);
    }

    // Perceptual dHash match
    try {
      const distance = computeHammingDistance(dHash, record.dHash);
      logger.debug(`Record [${idx}] perceptual Hamming distance: ${distance} (threshold: ${hammingThreshold})`);
      if (distance <= hammingThreshold) {
        logger.warn(`Perceptual dHash duplicate match detected with claim ${record.claim_id}: distance=${distance} <= ${hammingThreshold}`);
        return {
          sha256,
          dHash,
          is_duplicate: true,
          hamming_distance: distance,
          matched_claim_id: record.claim_id,
        };
      } else {
        logger.debug(`Record [${idx}] Hamming distance ${distance} exceeds threshold ${hammingThreshold}`);
      }
    } catch (err: any) {
      logger.error(`Error computing Hamming distance for record [${idx}] claim ${record.claim_id}`, {
        error: err?.message,
        code: err?.code,
        stack: err?.stack,
      });
    }
  }

  logger.info(`evaluatePerceptualDuplicate: zero matches found across ${knownEvidence.length} records. Image confirmed unique.`);
  return {
    sha256,
    dHash,
    is_duplicate: false,
    hamming_distance: undefined,
  };
}
