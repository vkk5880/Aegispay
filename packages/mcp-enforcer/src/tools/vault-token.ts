import crypto from 'node:crypto';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultAuditChain } from '../audit-chain.js';

const logger = createLogger('MCP:Enforcer:VaultToken', { stream: 'stderr' });

/**
 * Zod schema for minting a PayPal Vault v3 setup token or registering a vaulted payment token.
 */
export const VaultTokenInputSchema = z.object({
  mandate_id: z.string().min(1, 'mandate_id must not be empty').max(64),
  customer_id: z
    .string()
    .min(1, 'customer_id must not be empty')
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'customer_id contains invalid characters'),
  usage_type: z.enum(['MERCHANT', 'PLATFORM']).default('MERCHANT'),
  customer_type: z.enum(['CONSUMER', 'BUSINESS']).default('CONSUMER'),
  payment_source_type: z.enum(['CARD', 'PAYPAL']).default('PAYPAL'),
  setup_token_id: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/, 'setup_token_id contains invalid characters')
    .optional(),
  return_url: z
    .string()
    .url('Invalid return_url format')
    .max(512, 'return_url cannot exceed 512 characters')
    .optional(),
  cancel_url: z
    .string()
    .url('Invalid cancel_url format')
    .max(512, 'cancel_url cannot exceed 512 characters')
    .optional(),
});

export type VaultTokenInput = z.infer<typeof VaultTokenInputSchema>;

export interface VaultTokenResult {
  success: boolean;
  setup_token_id?: string;
  payment_token_id?: string;
  customer_id?: string;
  status?: string;
  masked_token?: string;
  audit_hash?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Masks a sensitive token string showing only prefix and suffix.
 */
export function maskSensitiveToken(token: string): string {
  if (!token || typeof token !== 'string') return '';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Masks unexpected errors to avoid leaking internal stack traces.
 */
function maskSafeError(err: unknown): { code: string; message: string } {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  logger.error('Masked vault token error', { errorMessage: errMsg, stack: errStack });

  if (errMsg.startsWith('ERR_')) {
    const code = errMsg.split(':')[0].trim();
    logger.warn('Recognized business guardrail failure in vault token operation', { code, message: errMsg });
    return {
      code,
      message: errMsg,
    };
  }

  return {
    code: 'ERR_VAULT_TOKEN_OPERATION_FAILED',
    message: 'The vault token operation failed due to a processing constraint.',
  };
}

/**
 * Handles minting or converting a PayPal Vault v3 token with strict validation,
 * token masking, and safe error masking.
 */
export async function handleVaultToken(
  rawArgs: unknown,
  vaultClient?: {
    createSetupToken?: (input: VaultTokenInput) => Promise<{ id: string; status: string }>;
    createPaymentToken?: (setupTokenId: string) => Promise<{ id: string; status: string }>;
  }
): Promise<VaultTokenResult> {
  logger.info('Evaluating vault token operation request', sanitizeForLogging(rawArgs));
  try {
    const parseResult = VaultTokenInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const formattedErrors = parseResult.error.format();
      logger.warn('Vault token input schema validation failed', {
        issue,
        formattedErrors,
        rawArgs: sanitizeForLogging(rawArgs),
      });
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid vault token arguments',
        },
      };
    }

    const args = parseResult.data;
    logger.debug('Vault token schema successfully validated', {
      mandate_id: args.mandate_id,
      customer_id: args.customer_id,
      usage_type: args.usage_type,
      customer_type: args.customer_type,
      payment_source_type: args.payment_source_type,
      has_setup_token_id: Boolean(args.setup_token_id),
      has_return_url: Boolean(args.return_url),
      has_cancel_url: Boolean(args.cancel_url),
      has_vault_client: Boolean(vaultClient),
    });

    // Customer ID bounds and formatting checks
    if (!/^[a-zA-Z0-9_-]+$/.test(args.customer_id)) {
      logger.warn('Customer ID validation failed: invalid format', { customer_id: args.customer_id });
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_CUSTOMER_ID',
          message: 'customer_id contains invalid characters',
        },
      };
    }
    logger.debug('Customer ID validated', { customer_id: args.customer_id });

    // Validate return_url and cancel_url protocols if supplied
    if (args.return_url) {
      logger.debug('Validating vault return_url protocol', { return_url: args.return_url });
      try {
        const parsedReturn = new URL(args.return_url);
        if (parsedReturn.protocol !== 'http:' && parsedReturn.protocol !== 'https:') {
          logger.warn('Vault return_url rejected: invalid protocol', { protocol: parsedReturn.protocol });
          return {
            success: false,
            error: {
              code: 'ERR_INVALID_RETURN_URL',
              message: 'return_url must use http or https protocol',
            },
          };
        }
        logger.debug('Vault return_url protocol verified', { host: parsedReturn.host });
      } catch (urlErr) {
        logger.warn('Vault return_url failed URL parsing', {
          return_url: args.return_url,
          error: urlErr instanceof Error ? urlErr.message : String(urlErr),
        });
        return {
          success: false,
          error: {
            code: 'ERR_INVALID_RETURN_URL',
            message: 'return_url is not a valid URL',
          },
        };
      }
    }

    if (args.cancel_url) {
      logger.debug('Validating vault cancel_url protocol', { cancel_url: args.cancel_url });
      try {
        const parsedCancel = new URL(args.cancel_url);
        if (parsedCancel.protocol !== 'http:' && parsedCancel.protocol !== 'https:') {
          logger.warn('Vault cancel_url rejected: invalid protocol', { protocol: parsedCancel.protocol });
          return {
            success: false,
            error: {
              code: 'ERR_INVALID_CANCEL_URL',
              message: 'cancel_url must use http or https protocol',
            },
          };
        }
        logger.debug('Vault cancel_url protocol verified', { host: parsedCancel.host });
      } catch (urlErr) {
        logger.warn('Vault cancel_url failed URL parsing', {
          cancel_url: args.cancel_url,
          error: urlErr instanceof Error ? urlErr.message : String(urlErr),
        });
        return {
          success: false,
          error: {
            code: 'ERR_INVALID_CANCEL_URL',
            message: 'cancel_url is not a valid URL',
          },
        };
      }
    }

    if (args.setup_token_id) {
      // Step: Convert setup token to permanent payment token
      logger.info('Branch: Converting setup token to permanent payment token', {
        masked_setup_token: maskSensitiveToken(args.setup_token_id),
        customer_id: args.customer_id,
      });

      let paymentTokenId = `vlt_pt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      let status = 'VAULTED';

      if (vaultClient?.createPaymentToken) {
        logger.debug('Invoking external vaultClient.createPaymentToken', {
          masked_setup_token: maskSensitiveToken(args.setup_token_id),
        });
        const clientResult = await vaultClient.createPaymentToken(args.setup_token_id);
        paymentTokenId = clientResult.id;
        status = clientResult.status;
        logger.info('vaultClient.createPaymentToken returned result', {
          masked_payment_token: maskSensitiveToken(paymentTokenId),
          status,
        });
      } else {
        logger.debug('No vaultClient provided; generated synthetic vaulted payment token', {
          masked_payment_token: maskSensitiveToken(paymentTokenId),
          status,
        });
      }

      const masked = maskSensitiveToken(paymentTokenId);

      logger.debug('Appending VAULT_TOKEN_CONVERTED to immutable audit chain', {
        mandate_id: args.mandate_id,
        customer_id: args.customer_id,
      });
      const auditEvent = defaultAuditChain.append({
        request_id: args.mandate_id,
        event_type: 'VAULT_TOKEN_CONVERTED',
        observed: {
          customer_id: args.customer_id,
          setup_token_id: maskSensitiveToken(args.setup_token_id),
          payment_source_type: args.payment_source_type,
        },
        inferred: {
          payment_token_id: masked,
          status,
        },
      });
      logger.info('Vault token conversion audit event appended', {
        auditHash: auditEvent.hash,
        seq: auditEvent.seq,
        eventId: auditEvent.event_id,
      });

      const result: VaultTokenResult = {
        success: true,
        setup_token_id: args.setup_token_id,
        payment_token_id: paymentTokenId,
        customer_id: args.customer_id,
        status,
        masked_token: masked,
        audit_hash: auditEvent.hash,
      };

      logger.info('Vault token conversion completed successfully', {
        customer_id: args.customer_id,
        status,
        masked_token: masked,
      });

      return result;
    } else {
      // Step: Mint initial setup token
      logger.info('Branch: Minting initial PayPal Vault setup token', {
        customer_id: args.customer_id,
        usage_type: args.usage_type,
        customer_type: args.customer_type,
      });

      let setupTokenId = `vlt_st_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      let status = 'CREATED';

      if (vaultClient?.createSetupToken) {
        logger.debug('Invoking external vaultClient.createSetupToken', {
          customer_id: args.customer_id,
        });
        const clientResult = await vaultClient.createSetupToken(args);
        setupTokenId = clientResult.id;
        status = clientResult.status;
        logger.info('vaultClient.createSetupToken returned result', {
          masked_setup_token: maskSensitiveToken(setupTokenId),
          status,
        });
      } else {
        logger.debug('No vaultClient provided; generated synthetic vault setup token', {
          masked_setup_token: maskSensitiveToken(setupTokenId),
          status,
        });
      }

      const masked = maskSensitiveToken(setupTokenId);

      logger.debug('Appending VAULT_SETUP_TOKEN_CREATED to immutable audit chain', {
        mandate_id: args.mandate_id,
        customer_id: args.customer_id,
      });
      const auditEvent = defaultAuditChain.append({
        request_id: args.mandate_id,
        event_type: 'VAULT_SETUP_TOKEN_CREATED',
        observed: {
          customer_id: args.customer_id,
          usage_type: args.usage_type,
          customer_type: args.customer_type,
          payment_source_type: args.payment_source_type,
        },
        inferred: {
          setup_token_id: masked,
          status,
        },
      });
      logger.info('Vault setup token audit event appended', {
        auditHash: auditEvent.hash,
        seq: auditEvent.seq,
        eventId: auditEvent.event_id,
      });

      const result: VaultTokenResult = {
        success: true,
        setup_token_id: setupTokenId,
        customer_id: args.customer_id,
        status,
        masked_token: masked,
        audit_hash: auditEvent.hash,
      };

      logger.info('Vault setup token minted successfully', {
        customer_id: args.customer_id,
        status,
        masked_token: masked,
      });

      return result;
    }
  } catch (err: unknown) {
    logger.error('Unexpected exception during handleVaultToken execution', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const masked = maskSafeError(err);
    return {
      success: false,
      error: masked,
    };
  }
}
