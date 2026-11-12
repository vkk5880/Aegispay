import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultPayPalClient, InvoiceDraftPayload } from '../services/paypal-apimatic.js';
import { authenticateUser } from '../middleware/auth.js';

const logger = createLogger('API:Routes:Invoicing');

const InvoiceIdParamsSchema = z.object({
  id: z.string().min(1, 'Invoice ID is required'),
});

const CreateInvoiceBodySchema = z.object({
  detail: z.object({
    invoice_number: z.string().optional(),
    invoice_date: z.string().optional(),
    currency_code: z.string().default('USD'),
    note: z.string().optional(),
    term: z.string().optional(),
    payment_term: z.object({
      term_type: z.string().optional(),
      due_date: z.string().optional(),
    }).optional(),
  }),
  invoicer: z.object({
    name: z.object({
      given_name: z.string().optional(),
      surname: z.string().optional(),
    }).optional(),
    address: z.any().optional(),
    email_address: z.string().email().optional(),
    website: z.string().url().optional(),
  }).optional(),
  primary_recipients: z.array(
    z.object({
      billing_info: z.object({
        name: z.object({
          given_name: z.string().optional(),
          surname: z.string().optional(),
          full_name: z.string().optional(),
        }).optional(),
        email_address: z.string().email(),
        business_name: z.string().optional(),
        address: z.any().optional(),
      }),
    })
  ).min(1, 'At least one primary recipient is required'),
  items: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      quantity: z.union([z.string(), z.number()]).default('1'),
      unit_amount: z.object({
        currency_code: z.string().default('USD'),
        value: z.string(),
      }),
      unit_of_measure: z.string().optional(),
      tax: z.object({
        name: z.string().optional(),
        percent: z.string().optional(),
      }).optional(),
      category: z.enum(['PHYSICAL_GOODS', 'DIGITAL_GOODS']).optional(),
    })
  ).min(1, 'At least one item is required'),
  configuration: z.object({
    allow_tip: z.boolean().optional(),
    tax_calculated_after_discount: z.boolean().optional(),
    tax_inclusive: z.boolean().optional(),
  }).optional(),
  amount: z.object({
    currency_code: z.string(),
    value: z.string(),
    breakdown: z.any().optional(),
  }).optional(),
});

const RemindInvoiceBodySchema = z.object({
  note: z.string().optional(),
});

export const invoicingRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/invoices/create
  fastify.post('/api/invoices/create', { preHandler: [authenticateUser] }, async (request, reply) => {
    const routeTimer = logger.time('POST /api/invoices/create');
    logger.debug('Received B2B draft invoice creation request', {
      body: sanitizeForLogging(request.body),
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    const parseResult = CreateInvoiceBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      const errorFormat = parseResult.error.format();
      logger.warn('Draft invoice creation payload validation failed', {
        errors: errorFormat,
        issues: parseResult.error.issues,
      });
      routeTimer('Validation failed');
      return reply.status(400).send({
        error: 'Invalid invoice payload',
        details: parseResult.error.issues,
      });
    }

    const { detail, invoicer, primary_recipients, items } = parseResult.data;
    logger.info('Creating B2B PayPal draft invoice', {
      invoiceNumber: detail?.invoice_number || 'auto-generated',
      currencyCode: detail?.currency_code,
      itemCount: items.length,
      primaryRecipientsCount: primary_recipients.length,
      invoicerEmail: invoicer?.email_address ? '[REDACTED]' : 'unspecified',
    });

    try {
      const createTimer = performance.now();
      const invoice = await defaultPayPalClient.createInvoice(parseResult.data as InvoiceDraftPayload);
      const createDurationMs = performance.now() - createTimer;

      logger.info('B2B PayPal draft invoice created successfully', {
        invoiceId: (invoice as any)?.id || (invoice as any)?.invoice_id,
        status: (invoice as any)?.status || 'DRAFT',
        createDurationMs,
      });
      routeTimer('Draft invoice created');

      return reply.status(201).send({
        success: true,
        invoice,
      });
    } catch (err: any) {
      logger.error('Failed to create B2B PayPal invoice', {
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: '/api/invoices/create',
        stack: err.stack,
      });
      fastify.log.error(err, 'Failed to create PayPal invoice');
      routeTimer('Draft invoice creation threw error');
      return reply.status(500).send({
        error: 'Failed to create invoice',
        message: err.message,
      });
    }
  });

  // POST /api/invoices/:id/send
  fastify.post('/api/invoices/:id/send', { preHandler: [authenticateUser] }, async (request, reply) => {
    const routeTimer = logger.time('POST /api/invoices/:id/send');
    logger.debug('Received send invoice delivery request', {
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
      body: sanitizeForLogging(request.body),
    });

    const paramsResult = InvoiceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      const errorFormat = paramsResult.error.format();
      logger.warn('Send invoice request route parameters validation failed', {
        errors: errorFormat,
        issues: paramsResult.error.issues,
      });
      routeTimer('Validation failed');
      return reply.status(400).send({
        error: 'Invalid invoice ID',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    logger.info('Dispatching PayPal B2B invoice to primary recipients', { invoiceId: id });

    try {
      const sendTimer = performance.now();
      const sent = await defaultPayPalClient.sendInvoice(id);
      const sendDurationMs = performance.now() - sendTimer;

      logger.info('PayPal invoice sent and delivered successfully', {
        invoiceId: id,
        sentStatus: sent,
        sendDurationMs,
      });
      routeTimer('Invoice sent');

      return reply.send({
        success: sent,
        invoice_id: id,
        status: 'SENT',
      });
    } catch (err: any) {
      logger.error('Failed to send PayPal invoice', {
        invoiceId: id,
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: '/api/invoices/:id/send',
        stack: err.stack,
      });
      fastify.log.error(err, 'Failed to send PayPal invoice');
      routeTimer('Invoice send threw error');
      return reply.status(500).send({
        error: 'Failed to send invoice',
        message: err.message,
      });
    }
  });

  // GET /api/invoices/:id/qr
  fastify.get('/api/invoices/:id/qr', async (request, reply) => {
    const routeTimer = logger.time('GET /api/invoices/:id/qr');
    logger.debug('Received generate invoice QR code request', {
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    const paramsResult = InvoiceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      const errorFormat = paramsResult.error.format();
      logger.warn('Invoice QR code request route parameters validation failed', {
        errors: errorFormat,
        issues: paramsResult.error.issues,
      });
      routeTimer('Validation failed');
      return reply.status(400).send({
        error: 'Invalid invoice ID',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    logger.info('Generating scannable QR code for PayPal invoice', { invoiceId: id });

    try {
      const qrTimer = performance.now();
      const qrCode = await defaultPayPalClient.generateInvoiceQrCode(id);
      const qrDurationMs = performance.now() - qrTimer;

      logger.info('PayPal invoice QR code generated successfully', {
        invoiceId: id,
        hasQrCode: Boolean(qrCode),
        qrDurationMs,
      });
      routeTimer('QR code generated');

      return reply.send({
        success: true,
        invoice_id: id,
        qr_code: qrCode,
      });
    } catch (err: any) {
      logger.error('Failed to generate PayPal invoice QR code', {
        invoiceId: id,
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: '/api/invoices/:id/qr',
        stack: err.stack,
      });
      fastify.log.error(err, 'Failed to generate PayPal invoice QR code');
      routeTimer('QR code generation threw error');
      return reply.status(500).send({
        error: 'Failed to generate invoice QR code',
        message: err.message,
      });
    }
  });

  // POST /api/invoices/:id/remind
  fastify.post('/api/invoices/:id/remind', { preHandler: [authenticateUser] }, async (request, reply) => {
    const routeTimer = logger.time('POST /api/invoices/:id/remind');
    logger.debug('Received send invoice reminder notification request', {
      params: sanitizeForLogging(request.params),
      body: sanitizeForLogging(request.body || {}),
      query: sanitizeForLogging(request.query),
    });

    const paramsResult = InvoiceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      const errorFormat = paramsResult.error.format();
      logger.warn('Send invoice reminder request route parameters validation failed', {
        errors: errorFormat,
        issues: paramsResult.error.issues,
      });
      routeTimer('Validation failed');
      return reply.status(400).send({
        error: 'Invalid invoice ID',
        details: paramsResult.error.issues,
      });
    }

    const bodyResult = RemindInvoiceBodySchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      const errorFormat = bodyResult.error.format();
      logger.warn('Invoice reminder body validation failed', {
        errors: errorFormat,
        issues: bodyResult.error.issues,
      });
    }

    const note = bodyResult.success ? bodyResult.data.note : undefined;
    const { id } = paramsResult.data;
    logger.info('Sending payment reminder notification for PayPal invoice', {
      invoiceId: id,
      hasCustomNote: Boolean(note),
    });

    try {
      const remindTimer = performance.now();
      const reminded = await defaultPayPalClient.sendInvoiceReminder(id, note);
      const remindDurationMs = performance.now() - remindTimer;

      logger.info('PayPal invoice reminder dispatched successfully', {
        invoiceId: id,
        remindedStatus: reminded,
        remindDurationMs,
      });
      routeTimer('Reminder sent');

      return reply.send({
        success: reminded,
        invoice_id: id,
        status: 'REMINDER_SENT',
      });
    } catch (err: any) {
      logger.error('Failed to send PayPal invoice reminder', {
        invoiceId: id,
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: '/api/invoices/:id/remind',
        stack: err.stack,
      });
      fastify.log.error(err, 'Failed to send PayPal invoice reminder');
      routeTimer('Invoice reminder threw error');
      return reply.status(500).send({
        error: 'Failed to send invoice reminder',
        message: err.message,
      });
    }
  });
};
