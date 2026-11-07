import crypto from 'node:crypto';
import { z } from 'zod';
import { defaultAuditChain } from '../audit-chain.js';

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
  console.error('[MCP Enforcer:vault-token] Masked error:', errMsg);

  if (errMsg.startsWith('ERR_')) {
    const code = errMsg.split(':')[0].trim();
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
  try {
    const parseResult = VaultTokenInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid vault token arguments',
        },
      };
    }

    const args = parseResult.data;

    if (args.setup_token_id) {
      // Step: Convert setup token to permanent payment token
      let paymentTokenId = `vlt_pt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      let status = 'VAULTED';

      if (vaultClient?.createPaymentToken) {
        const clientResult = await vaultClient.createPaymentToken(args.setup_token_id);
        paymentTokenId = clientResult.id;
        status = clientResult.status;
      }

      const masked = maskSensitiveToken(paymentTokenId);

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

      return {
        success: true,
        setup_token_id: args.setup_token_id,
        payment_token_id: paymentTokenId,
        customer_id: args.customer_id,
        status,
        masked_token: masked,
        audit_hash: auditEvent.hash,
      };
    } else {
      // Step: Mint initial setup token
      let setupTokenId = `vlt_st_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      let status = 'CREATED';

      if (vaultClient?.createSetupToken) {
        const clientResult = await vaultClient.createSetupToken(args);
        setupTokenId = clientResult.id;
        status = clientResult.status;
      }

      const masked = maskSensitiveToken(setupTokenId);

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

      return {
        success: true,
        setup_token_id: setupTokenId,
        customer_id: args.customer_id,
        status,
        masked_token: masked,
        audit_hash: auditEvent.hash,
      };
    }
  } catch (err: unknown) {
    const masked = maskSafeError(err);
    return {
      success: false,
      error: masked,
    };
  }
}
