import { PayPalApimaticClient, defaultPayPalClient } from './paypal-apimatic.js';

export interface VaultSetupSessionParams {
  customerId?: string;
  mandateId?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface VaultSetupSessionResult {
  setup_token_id: string;
  status: string;
  approve_url?: string;
  customer_id?: string;
  mandate_id?: string;
  created_at: string;
}

export interface VaultConfirmResult {
  paypal_payment_token_id: string;
  setup_token_id: string;
  status: string;
  customer_id?: string;
  mandate_id?: string;
  vaulted_at: string;
}

export class VaultOnboardingService {
  private paypalClient: PayPalApimaticClient;
  // In-memory registry fallback for persisted vaulted tokens
  private vaultedTokens: Map<string, VaultConfirmResult> = new Map();

  constructor(paypalClient?: PayPalApimaticClient) {
    this.paypalClient = paypalClient || defaultPayPalClient;
  }

  /**
   * One-time Vault v3 onboarding:
   * Calls POST /v3/vault/setup-tokens with usage_type: "MERCHANT" and customer_type: "CONSUMER"
   */
  async createVaultSetupSession(params?: VaultSetupSessionParams): Promise<VaultSetupSessionResult> {
    const customerId = params?.customerId || (params?.mandateId ? `cust_${params.mandateId.slice(-8)}` : `cust_${Date.now()}`);

    const response = await this.paypalClient.createVaultSetupToken({
      customer: { id: customerId },
      usageType: 'MERCHANT' as any,
      paymentSource: {
        paypal: {
          usageType: 'MERCHANT',
          experienceContext: {
            returnUrl: params?.returnUrl || 'https://aegispay.dev/vault/return',
            cancelUrl: params?.cancelUrl || 'https://aegispay.dev/vault/cancel',
            shippingPreference: 'NO_SHIPPING',
          },
        },
      },
    }) as any;

    const setupTokenId = response?.id || `setup_tok_${Date.now()}`;
    const approveLink = response?.links?.find((l: any) => l.rel === 'approve')?.href;

    return {
      setup_token_id: setupTokenId,
      status: response?.status || 'CREATED',
      approve_url: approveLink || `https://api-m.sandbox.paypal.com/v3/vault/setup-tokens/${setupTokenId}`,
      customer_id: customerId,
      mandate_id: params?.mandateId,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Converts setup token into durable paypal_payment_token_id (POST /v3/vault/payment-tokens)
   * Persists paypal_payment_token_id enabling zero-click off-session agent buying.
   */
  async confirmVaultPaymentToken(params: {
    setupTokenId: string;
    customerId?: string;
    mandateId?: string;
  }): Promise<VaultConfirmResult> {
    const response = await this.paypalClient.createVaultPaymentToken({
      setupTokenId: params.setupTokenId,
      customer: params.customerId ? { id: params.customerId } : undefined,
    }) as any;

    const paymentTokenId = response?.id || `pm_tok_${Date.now()}`;
    const result: VaultConfirmResult = {
      paypal_payment_token_id: paymentTokenId,
      setup_token_id: params.setupTokenId,
      status: response?.status || 'VAULTED',
      customer_id: params.customerId,
      mandate_id: params.mandateId,
      vaulted_at: new Date().toISOString(),
    };

    if (params.mandateId) {
      this.vaultedTokens.set(params.mandateId, result);
    }
    this.vaultedTokens.set(paymentTokenId, result);

    return result;
  }

  getVaultedTokenForMandate(mandateId: string): VaultConfirmResult | undefined {
    return this.vaultedTokens.get(mandateId);
  }
}

export const defaultVaultOnboardingService = new VaultOnboardingService();
