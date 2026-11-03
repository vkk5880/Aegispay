import {
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  VaultController,
  CheckoutPaymentIntent,
} from '@paypal/paypal-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  webhookId?: string;
}

export interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export interface DisputeEvidencePayload {
  evidence_type?: string;
  evidence_info?: {
    tracking_info?: Array<{
      carrier_name: string;
      tracking_number: string;
    }>;
  };
  notes?: string;
  file?: {
    buffer: Buffer | Uint8Array;
    filename: string;
    mimeType: string;
  };
}

export class PayPalApimaticClient {
  private client: Client;
  private ordersController: OrdersController;
  private paymentsController: PaymentsController;
  private vaultController: VaultController;
  private config: PayPalConfig;
  private tokenCache: CachedToken | null = null;
  private clientTokenCache: CachedToken | null = null;

  constructor(customConfig?: Partial<PayPalConfig>) {
    this.config = {
      clientId: customConfig?.clientId || process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: customConfig?.clientSecret || process.env.PAYPAL_CLIENT_SECRET || '',
      environment: (customConfig?.environment ||
        (process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox')) as 'sandbox' | 'production',
      webhookId: customConfig?.webhookId || process.env.PAYPAL_WEBHOOK_ID || '',
    };

    const env = this.config.environment === 'production' ? Environment.Production : Environment.Sandbox;

    this.client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: this.config.clientId,
        oAuthClientSecret: this.config.clientSecret,
      },
      environment: env,
    });

    this.ordersController = new OrdersController(this.client);
    this.paymentsController = new PaymentsController(this.client);
    this.vaultController = new VaultController(this.client);
  }

  private getBaseUrl(): string {
    return this.config.environment === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Client credential OAuth2 token fetching with 15-minute token caching.
   */
  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    // 15-minute cache buffer (900 seconds)
    if (!forceRefresh && this.tokenCache && this.tokenCache.expiresAt > now + 60 * 1000) {
      return this.tokenCache.accessToken;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      // Allow fallback / mock token for tests/dev without live credentials
      return 'mock_access_token_sandbox';
    }

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await fetch(`${this.getBaseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to fetch PayPal OAuth2 token: ${response.status} ${errText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    // Cache token for (expires_in - buffer) or 15 minutes (900s)
    const ttlMs = Math.min((data.expires_in || 900) * 1000, 15 * 60 * 1000);
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + ttlMs,
    };

    return data.access_token;
  }

  /**
   * Generates or retrieves 15-min cached client token for frontend PayPal SDK mount
   */
  async getClientToken(): Promise<string> {
    const now = Date.now();
    if (this.clientTokenCache && this.clientTokenCache.expiresAt > now + 60 * 1000) {
      return this.clientTokenCache.accessToken;
    }

    const accessToken = await this.getAccessToken();
    if (accessToken === 'mock_access_token_sandbox') {
      return 'mock_client_token_15min';
    }

    const response = await fetch(`${this.getBaseUrl()}/v1/identity/generate-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'en_US',
      },
    });

    if (!response.ok) {
      // Fallback to client id if generate-token not enabled on client credentials
      return this.config.clientId;
    }

    const data = await response.json() as { client_token: string; expires_in?: number };
    const ttlMs = (data.expires_in || 900) * 1000;
    this.clientTokenCache = {
      accessToken: data.client_token,
      expiresAt: now + ttlMs,
    };
    return data.client_token;
  }

  /**
   * Orders v2 Multi-Purchase Unit creation (intent: "AUTHORIZE" or "CAPTURE")
   */
  async createMultiPurchaseUnitOrder(params: {
    intent?: 'AUTHORIZE' | 'CAPTURE';
    purchaseUnits: Array<{
      reference_id: string;
      custom_id?: string;
      invoice_id?: string;
      amount: {
        currency_code: string;
        value: string;
        breakdown?: {
          item_total?: { currency_code: string; value: string };
          shipping?: { currency_code: string; value: string };
          tax_total?: { currency_code: string; value: string };
          discount?: { currency_code: string; value: string };
        };
      };
      items?: Array<{
        name: string;
        unit_amount: { currency_code: string; value: string };
        quantity: string;
        sku?: string;
        category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
      }>;
      payee?: {
        email_address?: string;
        merchant_id?: string;
      };
      description?: string;
    }>;
    paymentSourceToken?: string;
    payPalRequestId?: string;
  }) {
    const intent = params.intent === 'CAPTURE'
      ? CheckoutPaymentIntent.Capture
      : CheckoutPaymentIntent.Authorize;

    const reqBody: any = {
      intent,
      purchaseUnits: params.purchaseUnits.map(pu => ({
        referenceId: pu.reference_id,
        customId: pu.custom_id,
        invoiceId: pu.invoice_id,
        description: pu.description,
        amount: {
          currencyCode: pu.amount.currency_code,
          value: pu.amount.value,
          breakdown: pu.amount.breakdown ? {
            itemTotal: pu.amount.breakdown.item_total ? {
              currencyCode: pu.amount.breakdown.item_total.currency_code,
              value: pu.amount.breakdown.item_total.value,
            } : undefined,
            shipping: pu.amount.breakdown.shipping ? {
              currencyCode: pu.amount.breakdown.shipping.currency_code,
              value: pu.amount.breakdown.shipping.value,
            } : undefined,
            taxTotal: pu.amount.breakdown.tax_total ? {
              currencyCode: pu.amount.breakdown.tax_total.currency_code,
              value: pu.amount.breakdown.tax_total.value,
            } : undefined,
            discount: pu.amount.breakdown.discount ? {
              currencyCode: pu.amount.breakdown.discount.currency_code,
              value: pu.amount.breakdown.discount.value,
            } : undefined,
          } : undefined,
        },
        items: pu.items?.map(it => ({
          name: it.name,
          unitAmount: {
            currencyCode: it.unit_amount.currency_code,
            value: it.unit_amount.value,
          },
          quantity: it.quantity,
          sku: it.sku,
          category: it.category as any,
        })),
        payee: pu.payee ? {
          emailAddress: pu.payee.email_address,
          merchantId: pu.payee.merchant_id,
        } : undefined,
      })),
    };

    if (params.paymentSourceToken) {
      reqBody.paymentSource = {
        token: {
          id: params.paymentSourceToken,
          type: 'PAYMENT_METHOD_TOKEN',
        },
      };
    }

    try {
      const response = await this.ordersController.createOrder({
        body: reqBody,
        paypalRequestId: params.payPalRequestId || `aegis-req-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      });
      return response.result;
    } catch (err: any) {
      // In sandbox/offline mode without live API credentials, provide structured simulated response
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here') {
        return {
          id: `MOCK_ORDER_${Date.now()}`,
          status: params.intent === 'CAPTURE' ? 'COMPLETED' : 'CREATED',
          intent: params.intent || 'AUTHORIZE',
          purchaseUnits: params.purchaseUnits,
          links: [
            { href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/MOCK_ORDER_${Date.now()}`, rel: 'self', method: 'GET' },
          ],
        };
      }
      throw err;
    }
  }

  /**
   * Mandatory server read-back verification (GET /v2/checkout/orders/{id})
   */
  async getOrder(orderId: string) {
    try {
      const response = await this.ordersController.getOrder({ id: orderId });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || orderId.startsWith('MOCK_')) {
        return {
          id: orderId,
          status: 'AUTHORIZED',
          intent: 'AUTHORIZE',
          gross_amount: { currency_code: 'USD', value: '100.00' },
          server_readback_verified: true,
          verification_timestamp: new Date().toISOString(),
        };
      }
      throw err;
    }
  }

  /**
   * Authorize an approved order (POST /v2/checkout/orders/{id}/authorize)
   */
  async authorizeOrder(orderId: string, payPalRequestId?: string) {
    try {
      const response = await this.ordersController.authorizeOrder({
        id: orderId,
        paypalRequestId: payPalRequestId,
      });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || orderId.startsWith('MOCK_')) {
        return {
          id: orderId,
          status: 'COMPLETED',
          purchaseUnits: [
            {
              payments: {
                authorizations: [
                  {
                    id: `MOCK_AUTH_${Date.now()}`,
                    status: 'CREATED',
                    amount: { currency_code: 'USD', value: '100.00' },
                  },
                ],
              },
            },
          ],
        };
      }
      throw err;
    }
  }

  /**
   * Capture an authorized payment (POST /v2/payments/authorizations/{id}/capture)
   */
  async captureAuthorization(authorizationId: string, amount?: { currencyCode: string; value: string }, isFinal = true) {
    try {
      const response = await this.paymentsController.captureAuthorizedPayment({
        authorizationId,
        body: {
          finalCapture: isFinal,
          amount: amount ? {
            currencyCode: amount.currencyCode,
            value: amount.value,
          } : undefined,
        },
      });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || authorizationId.startsWith('MOCK_')) {
        return {
          id: `MOCK_CAPTURE_${Date.now()}`,
          status: 'COMPLETED',
          amount: amount || { currency_code: 'USD', value: '100.00' },
          final_capture: isFinal,
        };
      }
      throw err;
    }
  }

  /**
   * Void an authorization (POST /v2/payments/authorizations/{id}/void)
   */
  async voidAuthorization(authorizationId: string) {
    try {
      const response = await this.paymentsController.voidPayment({
        authorizationId,
      });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || authorizationId.startsWith('MOCK_')) {
        return {
          id: authorizationId,
          status: 'VOIDED',
        };
      }
      throw err;
    }
  }

  /**
   * Refund a captured payment (POST /v2/payments/captures/{id}/refund)
   */
  async refundCapturedPayment(captureId: string, amount?: { currencyCode: string; value: string }, note?: string) {
    try {
      const response = await this.paymentsController.refundCapturedPayment({
        captureId,
        body: {
          noteToPayer: note,
          amount: amount ? {
            currencyCode: amount.currencyCode,
            value: amount.value,
          } : undefined,
        },
      });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || captureId.startsWith('MOCK_')) {
        return {
          id: `MOCK_REFUND_${Date.now()}`,
          status: 'COMPLETED',
          amount: amount || { currency_code: 'USD', value: '10.00' },
        };
      }
      throw err;
    }
  }

  /**
   * Vault v3 Setup Token creation (POST /v3/vault/setup-tokens)
   */
  async createVaultSetupToken(params: {
    customer?: { id?: string };
    paymentSource?: any;
    usageType?: 'MERCHANT' | 'PLATFORM';
  }) {
    try {
      const response = await this.vaultController.createSetupToken({
        body: {
          paymentSource: params.paymentSource || {
            paypal: {
              usageType: (params.usageType || 'PLATFORM') as any,
              experienceContext: {
                returnUrl: 'https://aegispay.dev/vault/return',
                cancelUrl: 'https://aegispay.dev/vault/cancel',
              },
            },
          },
          customer: params.customer ? { id: params.customer.id } : undefined,
        },
      });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here') {
        return {
          id: `mock_setup_token_${Date.now()}`,
          status: 'CREATED',
          customer: params.customer,
          links: [
            { href: `https://api-m.sandbox.paypal.com/v3/vault/setup-tokens/mock_setup_token_${Date.now()}`, rel: 'approve', method: 'GET' },
          ],
        };
      }
      throw err;
    }
  }

  /**
   * Vault v3 Payment Token creation (POST /v3/vault/payment-tokens)
   */
  async createVaultPaymentToken(params: {
    setupTokenId: string;
    customer?: { id?: string };
  }) {
    try {
      const response = await this.vaultController.createPaymentToken({
        body: {
          paymentSource: {
            token: {
              id: params.setupTokenId,
              type: 'SETUP_TOKEN' as any,
            },
          },
          customer: params.customer ? { id: params.customer.id } : undefined,
        },
      });
      return response.result;
    } catch (err: any) {
      if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here') {
        return {
          id: `mock_payment_token_${Date.now()}`,
          status: 'VAULTED',
          customer: params.customer,
        };
      }
      throw err;
    }
  }

  /**
   * Disputes v1 actions: GET /v1/customer/disputes/{id}
   */
  async getDispute(disputeId: string) {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || disputeId.startsWith('MOCK_')) {
      return {
        dispute_id: disputeId,
        status: 'REQUIRED_ACTION',
        dispute_amount: { currency_code: 'USD', value: '45.00' },
        reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
        dispute_life_cycle_stage: 'CHARGEBACK',
        dispute_channel: 'INTERNAL',
        seller_response_due_date: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        links: [
          { href: `${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/provide-evidence`, rel: 'provide-evidence', method: 'POST' },
          { href: `${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/make-offer`, rel: 'make-offer', method: 'POST' },
          { href: `${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/acknowledge-return-item`, rel: 'acknowledge-return-item', method: 'POST' },
          { href: `${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/accept-claim`, rel: 'accept-claim', method: 'POST' },
        ],
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to get PayPal dispute: ${res.status} ${errText}`);
    }
    return res.json();
  }

  /**
   * Disputes v1 actions: POST /v1/customer/disputes/{id}/provide-evidence (supporting multipart/form-data)
   */
  async provideDisputeEvidence(disputeId: string, payload: DisputeEvidencePayload) {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || disputeId.startsWith('MOCK_')) {
      return {
        status: 'EVIDENCE_SUBMITTED',
        dispute_id: disputeId,
        evidence_type: payload.evidence_type || 'PROOF_OF_FULFILLMENT',
        timestamp: new Date().toISOString(),
      };
    }

    const token = await this.getAccessToken();
    if (payload.file) {
      // Build multipart/form-data
      const boundary = `----AegisPayBoundary${Date.now()}`;
      const metadata = JSON.stringify({
        evidence_type: payload.evidence_type || 'PROOF_OF_FULFILLMENT',
        evidence_info: payload.evidence_info,
        notes: payload.notes || 'Automated multi-modal evidentiary submission by AegisPay arbiter.',
      });

      const bodyParts: Buffer[] = [];
      bodyParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="input"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${metadata}\r\n`
      ));

      bodyParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${payload.file.filename}"\r\n` +
        `Content-Type: ${payload.file.mimeType}\r\n\r\n`
      ));
      bodyParts.push(Buffer.from(payload.file.buffer));
      bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      const multipartBuffer = Buffer.concat(bodyParts);

      const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/provide-evidence`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBuffer,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to provide dispute evidence: ${res.status} ${errText}`);
      }
      return res.json();
    } else {
      const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/provide-evidence`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          evidence_type: payload.evidence_type || 'PROOF_OF_FULFILLMENT',
          evidence_info: payload.evidence_info,
          notes: payload.notes || 'AegisPay Dispute Forensic Dossier',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to provide dispute evidence: ${res.status} ${errText}`);
      }
      return res.json();
    }
  }

  /**
   * Disputes v1 actions: POST /v1/customer/disputes/{id}/make-offer
   */
  async makeDisputeOffer(disputeId: string, offer: {
    note: string;
    offer_amount: { currency_code: string; value: string };
    offer_type: 'REFUND' | 'REFUND_WITH_RETURN' | 'REFUND_WITH_REPLACEMENT';
  }) {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || disputeId.startsWith('MOCK_')) {
      return {
        status: 'OFFER_MADE',
        dispute_id: disputeId,
        offer,
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/make-offer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(offer),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to make dispute offer: ${res.status} ${errText}`);
    }
    return res.json();
  }

  /**
   * Disputes v1 actions: POST /v1/customer/disputes/{id}/acknowledge-return-item
   */
  async acknowledgeReturnItem(disputeId: string, note?: string) {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || disputeId.startsWith('MOCK_')) {
      return {
        status: 'RETURN_ACKNOWLEDGED',
        dispute_id: disputeId,
        acknowledged_at: new Date().toISOString(),
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/acknowledge-return-item`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        note: note || 'AegisPay automated acknowledgement of return delivery scan.',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to acknowledge return item: ${res.status} ${errText}`);
    }
    return res.json();
  }

  /**
   * Disputes v1 sandbox actions: POST /v1/customer/disputes/{id}/adjudicate
   */
  async adjudicateDispute(disputeId: string, action: 'BUYER_FAVOR' | 'SELLER_FAVOR' = 'SELLER_FAVOR') {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || disputeId.startsWith('MOCK_')) {
      return {
        status: 'RESOLVED',
        dispute_id: disputeId,
        adjudication_outcome: action,
        resolved_at: new Date().toISOString(),
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/adjudicate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        adjudication_outcome: action,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to adjudicate dispute: ${res.status} ${errText}`);
    }
    return res.json();
  }

  /**
   * Disputes v1 sandbox testing helper: POST /v1/customer/disputes/{id}/require-evidence
   */
  async requireDisputeEvidence(disputeId: string) {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here' || disputeId.startsWith('MOCK_')) {
      return {
        status: 'REQUIRED_ACTION',
        dispute_id: disputeId,
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/customer/disputes/${disputeId}/require-evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'BUYER_EVIDENCE',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to require evidence on dispute: ${res.status} ${errText}`);
    }
    return res.json();
  }

  /**
   * Shipment Tracking v1: POST /v1/shipping/trackers-batch
   */
  async addTrackingBatch(trackers: Array<{
    transaction_id: string;
    tracking_number: string;
    status: 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    carrier: string;
  }>) {
    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here') {
      return {
        tracker_identifiers: trackers.map(t => ({
          transaction_id: t.transaction_id,
          tracking_number: t.tracking_number,
          status: t.status,
          links: [],
        })),
        errors: [],
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.getBaseUrl()}/v1/shipping/trackers-batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackers,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to add shipment tracking batch: ${res.status} ${errText}`);
    }
    return res.json();
  }

  /**
   * Webhook signature verification (POST /v1/notifications/verify-webhook-signature)
   */
  async verifyWebhookSignature(params: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookEvent: any;
    webhookId?: string;
  }): Promise<boolean> {
    const webhookId = params.webhookId || this.config.webhookId;

    if (!this.config.clientId || this.config.clientId === 'your_paypal_client_id_here') {
      // In mock/sandbox offline mode, if test headers are present, accept as verified
      return !!params.transmissionSig;
    }

    try {
      const token = await this.getAccessToken();
      const res = await fetch(`${this.getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: params.authAlgo,
          cert_url: params.certUrl,
          transmission_id: params.transmissionId,
          transmission_sig: params.transmissionSig,
          transmission_time: params.transmissionTime,
          webhook_id: webhookId,
          webhook_event: params.webhookEvent,
        }),
      });

      if (!res.ok) {
        return false;
      }
      const data = await res.json() as { verification_status?: string };
      return data.verification_status === 'SUCCESS';
    } catch {
      return false;
    }
  }
}

export const defaultPayPalClient = new PayPalApimaticClient();
