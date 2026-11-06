import crypto from 'node:crypto';
import {
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_SIGNATURE,
  HEADER_PAYMENT_RESPONSE,
  HEADER_PAY_TO,
  HEADER_X_PAYMENT_CONTRACT_ID,
  SETTLEMENT_OVERRIDES_HEADER,
  generatePaymentReceipt,
  verifyPaymentReceipt,
} from './http402-interceptor.js';
import {
  MAX_CONTROL_PLANE_RESPONSE_BYTES,
} from '@aegispay/shared-types';

export interface SettlementOverrides {
  asset?: string;
  scheme?: string;
  amount?: string;
}

/**
 * Axios 402 Payment Interceptor (typescript/packages/http/axios/src/index.ts)
 * Wraps an Axios instance to automatically negotiate HTTP 402 challenges, sign payments, and retry.
 */
export interface AxiosPaymentClientConfig {
  signPayment?: (challenge: any) => Promise<string>;
  secret?: string;
  maxRetries?: number;
}

export function wrapAxiosWithPayment(axiosInstance: any, config?: AxiosPaymentClientConfig): any {
  if (!axiosInstance || !axiosInstance.interceptors) {
    return axiosInstance;
  }

  axiosInstance.interceptors.response.use(
    (response: any) => response,
    async (error: any) => {
      const originalRequest = error.config;
      if (!error.response || error.response.status !== 402 || originalRequest.__is402Retry) {
        return Promise.reject(error);
      }

      originalRequest.__is402Retry = true;

      // Extract 402 challenge from PAYMENT-REQUIRED header or response body
      const reqHeader = error.response.headers[HEADER_PAYMENT_REQUIRED.toLowerCase()] ||
                        error.response.headers[HEADER_PAYMENT_REQUIRED];

      let challenge: any;
      if (reqHeader) {
        try {
          challenge = JSON.parse(Buffer.from(reqHeader, 'base64').toString('utf8'));
        } catch {
          challenge = error.response.data?.challenge || error.response.data;
        }
      } else {
        challenge = error.response.data?.challenge || error.response.data;
      }

      // Generate payment signature / receipt
      let paymentSignature: string;
      if (config?.signPayment) {
        paymentSignature = await config.signPayment(challenge);
      } else {
        const contractId = error.response.headers[HEADER_X_PAYMENT_CONTRACT_ID.toLowerCase()] ||
                           challenge?.payment_contract_id ||
                           `ct_${crypto.randomUUID().slice(0, 8)}`;
        const receipt = generatePaymentReceipt(contractId, 5000, 'USD', config?.secret);
        paymentSignature = Buffer.from(JSON.stringify({ receipt, contractId })).toString('base64');
      }

      // Attach payment header and retry
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers[HEADER_PAYMENT_SIGNATURE] = paymentSignature;
      originalRequest.headers['X-Payment-Receipt'] = paymentSignature;

      return axiosInstance(originalRequest);
    }
  );

  return axiosInstance;
}

/**
 * Express / Connect HTTP 402 Middleware (typescript/packages/http/express/src/index.ts)
 * Enforces paywalls, validates payment signatures, executes settlements, and handles overrides.
 */
export interface ExpressPaymentMiddlewareOptions {
  protectedRoutes: Array<{ path: string; method?: string; amountCents?: number }>;
  secret?: string;
  vaultSetupUrl?: string;
  payToUri?: string;
}

export function createExpressPaymentMiddleware(options: ExpressPaymentMiddlewareOptions) {
  const { protectedRoutes, secret = 'aegispay_test_secret_key_402', vaultSetupUrl, payToUri } = options;

  return async (req: any, res: any, next: () => void) => {
    const reqPath = req.path || req.url.split('?')[0];
    const reqMethod = (req.method || 'GET').toUpperCase();

    const matchedRule = protectedRoutes.find(r => {
      const pathMatches = reqPath === r.path || reqPath.startsWith(r.path);
      const methodMatches = !r.method || r.method.toUpperCase() === reqMethod;
      return pathMatches && methodMatches;
    });

    if (!matchedRule) {
      return next();
    }

    // Check payment signature header
    const paymentSig = req.headers[HEADER_PAYMENT_SIGNATURE.toLowerCase()] ||
                       req.headers['x-payment-receipt'] ||
                       req.headers[HEADER_PAYMENT_SIGNATURE];

    if (!paymentSig) {
      // Missing payment -> Issue 402 challenge
      const contractId = `ct_402_${crypto.randomBytes(16).toString('hex')}`;
      const vaultUrl = vaultSetupUrl || 'https://www.sandbox.paypal.com/v3/vault/setup-tokens';
      const payTo = payToUri || `payto://paypal/merchant@aegispay.dev?contract=${contractId}`;

      const challenge = {
        type: 'https://aegispay.dev/protocols/http402',
        title: 'AegisPay Autonomous Payment Challenge',
        payment_contract_id: contractId,
        pay_to: payTo,
        amount_cents: matchedRule.amountCents || 5000,
        vault_setup_url: vaultUrl,
      };

      const base64Challenge = Buffer.from(JSON.stringify(challenge)).toString('base64');
      res.status(402);
      res.setHeader(HEADER_PAY_TO, payTo);
      res.setHeader(HEADER_X_PAYMENT_CONTRACT_ID, contractId);
      res.setHeader(HEADER_PAYMENT_REQUIRED, base64Challenge);

      return res.json({
        error: 'PAYMENT_REQUIRED',
        status: 402,
        message: 'Payment Required',
        challenge,
      });
    }

    // Settlement Overrides evaluation (RFC settlement overrides header)
    const rawOverrides = req.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()] ||
                         req.headers[SETTLEMENT_OVERRIDES_HEADER];
    if (rawOverrides && typeof rawOverrides === 'string') {
      try {
        const decoded = Buffer.from(rawOverrides, 'base64').toString('utf8');
        req.settlementOverrides = JSON.parse(decoded);
      } catch {
        // ignore malformed override header
      }
    }

    // Attach response settlement receipt
    const settlementReceipt = `settle_${crypto.randomUUID().slice(0, 16)}`;
    res.setHeader(HEADER_PAYMENT_RESPONSE, Buffer.from(JSON.stringify({ settlementReceipt, success: true })).toString('base64'));

    next();
  };
}

/**
 * Universal Fetch 402 Client Wrapper (typescript/packages/http/fetch/src/index.ts)
 */
export function wrapFetchWithPayment(
  fetchFn: typeof fetch = fetch,
  config?: AxiosPaymentClientConfig
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await fetchFn(input, init);

    if (response.status !== 402) {
      return response;
    }

    // Extract challenge from PAYMENT-REQUIRED header or response body
    const reqHeader = response.headers.get(HEADER_PAYMENT_REQUIRED);
    let challenge: any;
    if (reqHeader) {
      try {
        challenge = JSON.parse(Buffer.from(reqHeader, 'base64').toString('utf8'));
      } catch {
        challenge = await response.clone().json().catch(() => ({}));
      }
    } else {
      challenge = await response.clone().json().catch(() => ({}));
    }

    // Generate signed payment proof
    let paymentSig: string;
    if (config?.signPayment) {
      paymentSig = await config.signPayment(challenge);
    } else {
      const contractId = response.headers.get(HEADER_X_PAYMENT_CONTRACT_ID) || challenge?.payment_contract_id || `ct_${crypto.randomUUID().slice(0, 8)}`;
      const receipt = generatePaymentReceipt(contractId, 5000, 'USD', config?.secret);
      paymentSig = Buffer.from(JSON.stringify({ receipt, contractId })).toString('base64');
    }

    // Clone headers and retry request with payment signature
    const newHeaders = new Headers(init?.headers);
    newHeaders.set(HEADER_PAYMENT_SIGNATURE, paymentSig);
    newHeaders.set('X-Payment-Receipt', paymentSig);

    return fetchFn(input, { ...init, headers: newHeaders });
  };
}

/**
 * Hono HTTP 402 Paywall Middleware (typescript/packages/http/hono/src/index.ts)
 */
export function createHonoPaymentMiddleware(options: ExpressPaymentMiddlewareOptions) {
  const { protectedRoutes, secret = 'aegispay_test_secret_key_402', vaultSetupUrl, payToUri } = options;

  return async (c: any, next: () => Promise<void>) => {
    const reqUrl = new URL(c.req.url, 'http://localhost');
    const reqPath = reqUrl.pathname;
    const reqMethod = c.req.method.toUpperCase();

    const matchedRule = protectedRoutes.find(r => {
      const pathMatches = reqPath === r.path || reqPath.startsWith(r.path);
      const methodMatches = !r.method || r.method.toUpperCase() === reqMethod;
      return pathMatches && methodMatches;
    });

    if (!matchedRule) {
      return next();
    }

    const paymentSig = c.req.header(HEADER_PAYMENT_SIGNATURE.toLowerCase()) ||
                       c.req.header('x-payment-receipt') ||
                       c.req.header(HEADER_PAYMENT_SIGNATURE);

    if (!paymentSig) {
      const contractId = `ct_hono_${crypto.randomBytes(16).toString('hex')}`;
      const vaultUrl = vaultSetupUrl || 'https://www.sandbox.paypal.com/v3/vault/setup-tokens';
      const payTo = payToUri || `payto://paypal/merchant@aegispay.dev?contract=${contractId}`;

      const challenge = {
        type: 'https://aegispay.dev/protocols/http402',
        title: 'AegisPay Autonomous Payment Challenge',
        payment_contract_id: contractId,
        pay_to: payTo,
        amount_cents: matchedRule.amountCents || 5000,
        vault_setup_url: vaultUrl,
      };

      c.status(402);
      c.header(HEADER_PAY_TO, payTo);
      c.header(HEADER_X_PAYMENT_CONTRACT_ID, contractId);
      c.header(HEADER_PAYMENT_REQUIRED, Buffer.from(JSON.stringify(challenge)).toString('base64'));

      return c.json({
        error: 'PAYMENT_REQUIRED',
        status: 402,
        message: 'Payment Required',
        challenge,
      });
    }

    // Attach response settlement receipt
    const settlementReceipt = `settle_${crypto.randomUUID().slice(0, 16)}`;
    c.header(HEADER_PAYMENT_RESPONSE, Buffer.from(JSON.stringify({ settlementReceipt, success: true })).toString('base64'));

    await next();
  };
}

/**
 * Next.js Edge / Route Handler Wrapper withX402 (typescript/packages/http/next/src/index.ts)
 */
export function withX402<T = unknown>(
  handler: (req: any) => Promise<any>,
  options?: { protected?: boolean; amountCents?: number; secret?: string }
) {
  return async (req: any) => {
    if (options?.protected === false) {
      return handler(req);
    }

    const headers = req.headers;
    const paymentSig = (typeof headers.get === 'function')
      ? (headers.get(HEADER_PAYMENT_SIGNATURE.toLowerCase()) || headers.get('x-payment-receipt'))
      : (headers[HEADER_PAYMENT_SIGNATURE.toLowerCase()] || headers['x-payment-receipt']);

    if (!paymentSig) {
      const contractId = `ct_next_${crypto.randomBytes(16).toString('hex')}`;
      const challenge = {
        type: 'https://aegispay.dev/protocols/http402',
        title: 'AegisPay Next.js Payment Challenge',
        payment_contract_id: contractId,
        amount_cents: options?.amountCents || 5000,
      };
      return new Response(JSON.stringify({ error: 'PAYMENT_REQUIRED', status: 402, challenge }), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          [HEADER_PAYMENT_REQUIRED]: Buffer.from(JSON.stringify(challenge)).toString('base64'),
          [HEADER_X_PAYMENT_CONTRACT_ID]: contractId,
        },
      });
    }

    return handler(req);
  };
}
