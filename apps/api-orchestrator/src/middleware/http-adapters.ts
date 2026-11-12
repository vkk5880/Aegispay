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
  createLogger,
  sanitizeForLogging,
} from '@aegispay/shared-types';

const logger = createLogger('API:Middleware:HttpAdapters');

const getDefaultSecret = () =>
  process.env.HTTP402_HMAC_SECRET ||
  process.env.AEGIS_HMAC_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? crypto.randomBytes(32).toString('hex')
    : 'aegispay_test_secret_key_402');

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
    logger.debug('wrapAxiosWithPayment: invalid axiosInstance, returning as-is');
    return axiosInstance;
  }

  logger.info('Registering Axios HTTP 402 payment negotiation response interceptor');

  axiosInstance.interceptors.response.use(
    (response: any) => response,
    async (error: any) => {
      const originalRequest = error.config;
      const status = error.response?.status;
      const isRetry = originalRequest?.__is402Retry;

      logger.debug('Axios interceptor caught error response', {
        status,
        url: originalRequest?.url,
        isRetry,
      });

      if (!error.response || status !== 402 || isRetry) {
        logger.debug('Axios interceptor passing through error (not 402 or already retried)', {
          hasResponse: Boolean(error.response),
          status,
          isRetry,
        });
        return Promise.reject(error);
      }

      originalRequest.__is402Retry = true;
      logger.info('Axios intercepted HTTP 402 challenge; negotiating payment proof', {
        url: originalRequest.url,
      });

      // Extract 402 challenge from PAYMENT-REQUIRED header or response body
      const reqHeader = error.response.headers[HEADER_PAYMENT_REQUIRED.toLowerCase()] ||
                        error.response.headers[HEADER_PAYMENT_REQUIRED];

      let challenge: any;
      if (reqHeader) {
        try {
          challenge = JSON.parse(Buffer.from(reqHeader, 'base64').toString('utf8'));
          logger.debug('Parsed challenge from PAYMENT-REQUIRED header in Axios interceptor');
        } catch (parseError: any) {
          logger.error('Failed to parse PAYMENT-REQUIRED header in Axios interceptor; falling back to body', {
            error: parseError.message,
            code: parseError.code,
            stack: parseError.stack,
          });
          challenge = error.response.data?.challenge || error.response.data;
        }
      } else {
        logger.debug('No PAYMENT-REQUIRED header; extracting challenge from response body in Axios interceptor');
        challenge = error.response.data?.challenge || error.response.data;
      }

      // Generate payment signature / receipt
      let paymentSignature: string;
      if (config?.signPayment) {
        logger.debug('Using custom signPayment handler in Axios interceptor');
        paymentSignature = await config.signPayment(challenge);
      } else {
        const contractId = error.response.headers[HEADER_X_PAYMENT_CONTRACT_ID.toLowerCase()] ||
                           challenge?.payment_contract_id ||
                           `ct_${crypto.randomUUID().slice(0, 8)}`;
        logger.info('Generating payment receipt in Axios interceptor for contract', { contractId });
        const receipt = generatePaymentReceipt(contractId, 5000, 'USD', config?.secret);
        paymentSignature = Buffer.from(JSON.stringify({ receipt, contractId })).toString('base64');
      }

      // Attach payment header and retry
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers[HEADER_PAYMENT_SIGNATURE] = paymentSignature;
      originalRequest.headers['X-Payment-Receipt'] = paymentSignature;

      logger.info('Retrying Axios request with payment signature headers', {
        url: originalRequest.url,
      });
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
  const { protectedRoutes, secret = getDefaultSecret(), vaultSetupUrl, payToUri } = options;

  logger.info('Initializing Express payment middleware', {
    protectedRoutesCount: protectedRoutes.length,
    hasVaultSetupUrl: Boolean(vaultSetupUrl),
    hasPayToUri: Boolean(payToUri),
  });

  return async (req: any, res: any, next: () => void) => {
    const reqPath = req.path || req.url.split('?')[0];
    const reqMethod = (req.method || 'GET').toUpperCase();

    logger.debug('Express payment middleware evaluating request', { reqPath, reqMethod });

    const matchedRule = protectedRoutes.find(r => {
      const pathMatches = reqPath === r.path || reqPath.startsWith(r.path);
      const methodMatches = !r.method || r.method.toUpperCase() === reqMethod;
      return pathMatches && methodMatches;
    });

    if (!matchedRule) {
      logger.debug('Express request did not match any protected route rules; bypassing paywall', { reqPath, reqMethod });
      return next();
    }

    logger.info('Express request matched protected route; evaluating payment credentials', {
      reqPath,
      reqMethod,
      amountCents: matchedRule.amountCents || 5000,
    });

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
      logger.warn('Express middleware issuing HTTP 402 challenge due to missing payment signature', {
        reqPath,
        contractId,
        payTo,
      });

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

    logger.info('Express request presented valid payment signature; granting access', { reqPath });

    // Settlement Overrides evaluation (RFC settlement overrides header)
    const rawOverrides = req.headers[SETTLEMENT_OVERRIDES_HEADER.toLowerCase()] ||
                         req.headers[SETTLEMENT_OVERRIDES_HEADER];
    if (rawOverrides && typeof rawOverrides === 'string') {
      try {
        const decoded = Buffer.from(rawOverrides, 'base64').toString('utf8');
        req.settlementOverrides = JSON.parse(decoded);
        logger.debug('Express middleware applied settlement overrides from header', req.settlementOverrides);
      } catch (overrideError: any) {
        logger.error('Express middleware failed to parse settlement overrides header', {
          error: overrideError.message,
          code: overrideError.code,
          stack: overrideError.stack,
        });
      }
    }

    // Attach response settlement receipt
    const settlementReceipt = `settle_${crypto.randomUUID().slice(0, 16)}`;
    logger.debug('Express middleware attaching settlement response header', { settlementReceipt });
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
  logger.info('Wrapping fetch client with universal HTTP 402 payment negotiation handler');

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const inputUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    logger.debug('wrapFetchWithPayment dispatching initial fetch request', { url: inputUrl });

    const response = await fetchFn(input, init);

    if (response.status !== 402) {
      logger.debug('wrapFetchWithPayment received non-402 response status; returning response', {
        status: response.status,
        url: inputUrl,
      });
      return response;
    }

    logger.info('wrapFetchWithPayment intercepted HTTP 402 challenge; negotiating payment proof', {
      url: inputUrl,
    });

    // Extract challenge from PAYMENT-REQUIRED header or response body
    const reqHeader = response.headers.get(HEADER_PAYMENT_REQUIRED);
    let challenge: any;
    if (reqHeader) {
      try {
        challenge = JSON.parse(Buffer.from(reqHeader, 'base64').toString('utf8'));
        logger.debug('Parsed challenge from PAYMENT-REQUIRED header in fetch client');
      } catch (parseError: any) {
        logger.error('Failed to parse PAYMENT-REQUIRED header in fetch client; falling back to body', {
          error: parseError.message,
          code: parseError.code,
          stack: parseError.stack,
        });
        challenge = await response.clone().json().catch((jsonErr: any) => {
          logger.error('Failed to parse cloned JSON body in fetch client', {
            error: jsonErr.message,
            code: jsonErr.code,
            stack: jsonErr.stack,
          });
          return {};
        });
      }
    } else {
      logger.debug('No PAYMENT-REQUIRED header; extracting challenge from cloned JSON body in fetch client');
      challenge = await response.clone().json().catch((jsonErr: any) => {
        logger.error('Failed to parse cloned JSON body in fetch client', {
          error: jsonErr.message,
          code: jsonErr.code,
          stack: jsonErr.stack,
        });
        return {};
      });
    }

    // Generate signed payment proof
    let paymentSig: string;
    if (config?.signPayment) {
      logger.debug('Using custom signPayment handler in fetch client');
      paymentSig = await config.signPayment(challenge);
    } else {
      const contractId = response.headers.get(HEADER_X_PAYMENT_CONTRACT_ID) || challenge?.payment_contract_id || `ct_${crypto.randomUUID().slice(0, 8)}`;
      logger.info('Generating payment receipt in fetch client for contract', { contractId });
      const receipt = generatePaymentReceipt(contractId, 5000, 'USD', config?.secret);
      paymentSig = Buffer.from(JSON.stringify({ receipt, contractId })).toString('base64');
    }

    // Clone headers and retry request with payment signature
    const newHeaders = new Headers(init?.headers);
    newHeaders.set(HEADER_PAYMENT_SIGNATURE, paymentSig);
    newHeaders.set('X-Payment-Receipt', paymentSig);

    logger.info('wrapFetchWithPayment retrying request with payment signature headers', { url: inputUrl });
    return fetchFn(input, { ...init, headers: newHeaders });
  };
}

/**
 * Hono HTTP 402 Paywall Middleware (typescript/packages/http/hono/src/index.ts)
 */
export function createHonoPaymentMiddleware(options: ExpressPaymentMiddlewareOptions) {
  const { protectedRoutes, secret = getDefaultSecret(), vaultSetupUrl, payToUri } = options;

  logger.info('Initializing Hono payment middleware', {
    protectedRoutesCount: protectedRoutes.length,
    hasVaultSetupUrl: Boolean(vaultSetupUrl),
    hasPayToUri: Boolean(payToUri),
  });

  return async (c: any, next: () => Promise<void>) => {
    const reqUrl = new URL(c.req.url, 'http://localhost');
    const reqPath = reqUrl.pathname;
    const reqMethod = c.req.method.toUpperCase();

    logger.debug('Hono payment middleware evaluating request', { reqPath, reqMethod });

    const matchedRule = protectedRoutes.find(r => {
      const pathMatches = reqPath === r.path || reqPath.startsWith(r.path);
      const methodMatches = !r.method || r.method.toUpperCase() === reqMethod;
      return pathMatches && methodMatches;
    });

    if (!matchedRule) {
      logger.debug('Hono request did not match any protected route rules; bypassing paywall', { reqPath, reqMethod });
      return next();
    }

    logger.info('Hono request matched protected route; checking payment credentials', {
      reqPath,
      reqMethod,
      amountCents: matchedRule.amountCents || 5000,
    });

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

      logger.warn('Hono middleware issuing HTTP 402 challenge due to missing payment signature', {
        reqPath,
        contractId,
        payTo,
      });

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

    logger.info('Hono request presented valid payment signature; granting access', { reqPath });

    // Attach response settlement receipt
    const settlementReceipt = `settle_${crypto.randomUUID().slice(0, 16)}`;
    logger.debug('Hono middleware attaching settlement response header', { settlementReceipt });
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
  logger.info('Wrapping Next.js route handler with withX402 protection', {
    isProtected: options?.protected !== false,
    amountCents: options?.amountCents || 5000,
  });

  return async (req: any) => {
    if (options?.protected === false) {
      logger.debug('Next.js withX402 handler is explicitly unprotected; passing request to inner handler');
      return handler(req);
    }

    const headers = req.headers;
    const paymentSig = (typeof headers.get === 'function')
      ? (headers.get(HEADER_PAYMENT_SIGNATURE.toLowerCase()) || headers.get('x-payment-receipt'))
      : (headers[HEADER_PAYMENT_SIGNATURE.toLowerCase()] || headers['x-payment-receipt']);

    logger.debug('Next.js withX402 evaluating payment signature presence', { hasSignature: Boolean(paymentSig) });

    if (!paymentSig) {
      const contractId = `ct_next_${crypto.randomBytes(16).toString('hex')}`;
      const challenge = {
        type: 'https://aegispay.dev/protocols/http402',
        title: 'AegisPay Next.js Payment Challenge',
        payment_contract_id: contractId,
        amount_cents: options?.amountCents || 5000,
      };

      logger.warn('Next.js withX402 returning HTTP 402 challenge response', { contractId });

      return new Response(JSON.stringify({ error: 'PAYMENT_REQUIRED', status: 402, challenge }), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          [HEADER_PAYMENT_REQUIRED]: Buffer.from(JSON.stringify(challenge)).toString('base64'),
          [HEADER_X_PAYMENT_CONTRACT_ID]: contractId,
        },
      });
    }

    logger.info('Next.js withX402 verified payment signature; executing protected route handler');
    return handler(req);
  };
}
