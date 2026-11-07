import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

/**
 * Sanitizes an object before stderr logging to avoid exposing tokens or keys.
 */
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    if (typeof clone[key] === 'string') {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('signature') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('key')
      ) {
        clone[key] = '[REDACTED]';
      }
    } else if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = sanitizeForLogging(clone[key]);
    }
  }
  return clone;
}

/**
 * Validates a filename / relative path to prevent path traversal attacks.
 * Rejects:
 * - Null bytes (%00, \0)
 * - Directory traversal tokens ('..')
 * - Absolute paths starting with '/' or '\' or drive letters (e.g. C:)
 * - Backslashes or forward slashes in plain filenames
 */
export function validateSafeFilePath(inputPath: string): boolean {
  if (!inputPath || typeof inputPath !== 'string') return false;

  // Null byte injection check
  if (inputPath.includes('\0') || inputPath.includes('%00')) {
    return false;
  }

  // Directory traversal check
  if (inputPath.includes('..')) {
    return false;
  }

  // Path normalization check
  const normalized = path.normalize(inputPath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return false;
  }

  // Reject windows drive letters like C:\ or C:/
  if (/^[a-zA-Z]:/.test(inputPath)) {
    return false;
  }

  return true;
}

/**
 * Validates normalized defect bounding coordinates.
 * Supports:
 * - [ymin, xmin, ymax, xmax] as an array of 4 numbers
 * - { ymin, xmin, ymax, xmax } as an object
 * Requirements:
 * - All coordinates must be within [0.0, 1.0]
 * - ymin < ymax
 * - xmin < xmax
 */
export function validateBoundingBoxCoordinates(
  coords: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number }
): { valid: boolean; error?: string } {
  let ymin: number, xmin: number, ymax: number, xmax: number;

  if (Array.isArray(coords)) {
    if (coords.length !== 4) {
      return { valid: false, error: 'Bounding coordinates array must contain exactly 4 numbers [ymin, xmin, ymax, xmax]' };
    }
    [ymin, xmin, ymax, xmax] = coords;
  } else if (coords && typeof coords === 'object') {
    ymin = coords.ymin;
    xmin = coords.xmin;
    ymax = coords.ymax;
    xmax = coords.xmax;
  } else {
    return { valid: false, error: 'Bounding coordinates must be an array or object' };
  }

  if (
    typeof ymin !== 'number' || isNaN(ymin) ||
    typeof xmin !== 'number' || isNaN(xmin) ||
    typeof ymax !== 'number' || isNaN(ymax) ||
    typeof xmax !== 'number' || isNaN(xmax)
  ) {
    return { valid: false, error: 'Bounding coordinates must be valid numbers' };
  }

  if (ymin < 0 || ymin > 1 || xmin < 0 || xmin > 1 || ymax < 0 || ymax > 1 || xmax < 0 || xmax > 1) {
    return { valid: false, error: 'Bounding coordinates must be normalized within range [0.0, 1.0]' };
  }

  if (ymin >= ymax) {
    return { valid: false, error: 'Invalid bounding box: ymin must be strictly less than ymax' };
  }

  if (xmin >= xmax) {
    return { valid: false, error: 'Invalid bounding box: xmin must be strictly less than xmax' };
  }

  return { valid: true };
}

/**
 * Zod schema for dispute evidence submission.
 * Enforces:
 * - Validating file path/attachment names to prevent path traversal.
 * - Validating defect bounding coordinates strictly.
 */
export const DisputeEvidenceInputSchema = z.object({
  paypal_dispute_id: z.string().min(1).max(64),
  carrier_tracking_number: z.string().max(64).optional(),
  policy_proof_text: z.string().max(4096).optional(),
  attachment_file_name: z
    .string()
    .max(255)
    .refine((fn) => validateSafeFilePath(fn), {
      message: 'ERR_PATH_TRAVERSAL_DETECTED: attachment_file_name contains directory traversal or absolute path',
    })
    .optional(),
  attachment_file_path: z
    .string()
    .max(512)
    .refine((fp) => validateSafeFilePath(fp), {
      message: 'ERR_PATH_TRAVERSAL_DETECTED: attachment_file_path contains directory traversal or absolute path',
    })
    .optional(),
  vision_defect_mask: z
    .union([
      z.tuple([z.number(), z.number(), z.number(), z.number()]),
      z.object({
        ymin: z.number(),
        xmin: z.number(),
        ymax: z.number(),
        xmax: z.number(),
      }),
    ])
    .refine((coords) => validateBoundingBoxCoordinates(coords as any).valid, {
      message: 'ERR_INVALID_BOUNDING_BOX: coordinates must be within [0.0, 1.0] with ymin < ymax and xmin < xmax',
    })
    .optional(),
});

export type DisputeEvidenceInput = z.infer<typeof DisputeEvidenceInputSchema>;

export interface DisputeEvidenceOutput {
  status: 'SUBMITTED' | 'REJECTED';
  evidence_id?: string;
  paypal_dispute_id: string;
  tracking_validated?: boolean;
  defect_mask_validated?: boolean;
  error?: string;
  error_code?: string;
}

/**
 * Handles dispute evidence compilation and validation.
 * Rejects path traversal attempts and malformed defect coordinates.
 * Logs exclusively to stderr.
 */
export async function handleDisputeEvidence(rawArgs: unknown): Promise<DisputeEvidenceOutput> {
  console.error('[DisputeEvidence Tool] Validating dispute evidence bundle...', sanitizeForLogging(rawArgs));

  const parsed = DisputeEvidenceInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    const primaryError = parsed.error.issues[0]?.message || 'ERR_INVALID_DISPUTE_EVIDENCE_ARGUMENTS';
    return {
      status: 'REJECTED',
      paypal_dispute_id: (rawArgs as any)?.paypal_dispute_id || 'UNKNOWN',
      error: primaryError,
      error_code: primaryError.split(':')[0].trim(),
    };
  }

  const data = parsed.data;
  const entropy = crypto.randomUUID().slice(0, 12);
  const evidenceId = `ev_${data.paypal_dispute_id}_${entropy}`;

  return {
    status: 'SUBMITTED',
    evidence_id: evidenceId,
    paypal_dispute_id: data.paypal_dispute_id,
    tracking_validated: Boolean(data.carrier_tracking_number),
    defect_mask_validated: Boolean(data.vision_defect_mask),
  };
}
