import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:DisputeEvidence', { stream: 'stderr' });

/**
 * Validates a filename / relative path to prevent path traversal attacks.
 * Rejects:
 * - Null bytes (%00, \0)
 * - Directory traversal tokens ('..')
 * - Absolute paths starting with '/' or '\' or drive letters (e.g. C:)
 * - Backslashes or forward slashes in plain filenames
 */
export function validateSafeFilePath(inputPath: string): boolean {
  logger.debug('Validating file path safety', { inputPath });

  if (!inputPath || typeof inputPath !== 'string') {
    logger.warn('File path safety validation failed: empty or non-string input', {
      inputType: typeof inputPath,
    });
    return false;
  }

  // Null byte injection check
  if (inputPath.includes('\0') || inputPath.includes('%00')) {
    logger.warn('File path safety validation failed: null byte injection detected', { inputPath });
    return false;
  }

  // Directory traversal check
  if (inputPath.includes('..')) {
    logger.warn('File path safety validation failed: directory traversal token detected', { inputPath });
    return false;
  }

  // Path normalization check
  const normalized = path.normalize(inputPath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    logger.warn('File path safety validation failed: normalized path escapes root or is absolute', {
      inputPath,
      normalized,
    });
    return false;
  }

  // Reject windows drive letters like C:\ or C:/
  if (/^[a-zA-Z]:/.test(inputPath)) {
    logger.warn('File path safety validation failed: Windows drive letter detected', { inputPath });
    return false;
  }

  logger.debug('File path verified safe', { inputPath, normalized });
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
  logger.debug('Validating bounding box coordinates', { coords });
  let ymin: number, xmin: number, ymax: number, xmax: number;

  if (Array.isArray(coords)) {
    if (coords.length !== 4) {
      const err = 'Bounding coordinates array must contain exactly 4 numbers [ymin, xmin, ymax, xmax]';
      logger.warn('Bounding box validation failed: invalid array length', { length: coords.length, error: err });
      return { valid: false, error: err };
    }
    [ymin, xmin, ymax, xmax] = coords;
  } else if (coords && typeof coords === 'object') {
    ymin = coords.ymin;
    xmin = coords.xmin;
    ymax = coords.ymax;
    xmax = coords.xmax;
  } else {
    const err = 'Bounding coordinates must be an array or object';
    logger.warn('Bounding box validation failed: unsupported format', { coordsType: typeof coords, error: err });
    return { valid: false, error: err };
  }

  if (
    typeof ymin !== 'number' || isNaN(ymin) ||
    typeof xmin !== 'number' || isNaN(xmin) ||
    typeof ymax !== 'number' || isNaN(ymax) ||
    typeof xmax !== 'number' || isNaN(xmax)
  ) {
    const err = 'Bounding coordinates must be valid numbers';
    logger.warn('Bounding box validation failed: non-number or NaN coordinates detected', {
      ymin,
      xmin,
      ymax,
      xmax,
      error: err,
    });
    return { valid: false, error: err };
  }

  if (ymin < 0 || ymin > 1 || xmin < 0 || xmin > 1 || ymax < 0 || ymax > 1 || xmax < 0 || xmax > 1) {
    const err = 'Bounding coordinates must be normalized within range [0.0, 1.0]';
    logger.warn('Bounding box validation failed: coordinates out of range [0.0, 1.0]', {
      ymin,
      xmin,
      ymax,
      xmax,
      error: err,
    });
    return { valid: false, error: err };
  }

  if (ymin >= ymax) {
    const err = 'Invalid bounding box: ymin must be strictly less than ymax';
    logger.warn('Bounding box validation failed: y-axis inverted or collapsed', {
      ymin,
      ymax,
      error: err,
    });
    return { valid: false, error: err };
  }

  if (xmin >= xmax) {
    const err = 'Invalid bounding box: xmin must be strictly less than xmax';
    logger.warn('Bounding box validation failed: x-axis inverted or collapsed', {
      xmin,
      xmax,
      error: err,
    });
    return { valid: false, error: err };
  }

  logger.debug('Bounding box coordinates successfully validated', { ymin, xmin, ymax, xmax });
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
  logger.info('Evaluating dispute evidence bundle', { rawArgs: sanitizeForLogging(rawArgs) });

  try {
    const parsed = DisputeEvidenceInputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      const primaryError = parsed.error.issues[0]?.message || 'ERR_INVALID_DISPUTE_EVIDENCE_ARGUMENTS';
      const errorCode = primaryError.split(':')[0].trim();
      const rawDisputeId = (rawArgs as any)?.paypal_dispute_id || 'UNKNOWN';

      logger.warn('Dispute evidence schema validation failed', {
        paypal_dispute_id: rawDisputeId,
        primaryError,
        errorCode,
        issues: parsed.error.issues,
      });

      return {
        status: 'REJECTED',
        paypal_dispute_id: rawDisputeId,
        error: primaryError,
        error_code: errorCode,
      };
    }

    const data = parsed.data;
    const entropy = crypto.randomUUID().slice(0, 12);
    const evidenceId = `ev_${data.paypal_dispute_id}_${entropy}`;

    const trackingValidated = Boolean(data.carrier_tracking_number);
    const defectMaskValidated = Boolean(data.vision_defect_mask);

    logger.info('Dispute evidence bundle successfully validated and classified', {
      evidenceId,
      paypalDisputeId: data.paypal_dispute_id,
      trackingValidated,
      defectMaskValidated,
      hasPolicyProof: Boolean(data.policy_proof_text),
      hasAttachmentFile: Boolean(data.attachment_file_name || data.attachment_file_path),
      evidenceTypeClassification: trackingValidated
        ? 'PROOF_OF_FULFILLMENT'
        : defectMaskValidated
        ? 'DEFECT_FORENSICS'
        : 'POLICY_EVIDENCE',
    });

    return {
      status: 'SUBMITTED',
      evidence_id: evidenceId,
      paypal_dispute_id: data.paypal_dispute_id,
      tracking_validated: trackingValidated,
      defect_mask_validated: defectMaskValidated,
    };
  } catch (error: unknown) {
    logger.error('Unexpected error handling dispute evidence submission', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      status: 'REJECTED',
      paypal_dispute_id: (rawArgs as any)?.paypal_dispute_id || 'UNKNOWN',
      error: 'ERR_INTERNAL_DISPUTE_PROCESSING_FAILURE',
      error_code: 'ERR_INTERNAL_ERROR',
    };
  }
}
