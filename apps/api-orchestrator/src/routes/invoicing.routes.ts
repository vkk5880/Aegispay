import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultPayPalClient, InvoiceDraftPayload } from '../services/paypal-apimatic.js';

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
  fastify.post('/api/invoices/create', async (request, reply) => {
    const parseResult = CreateInvoiceBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid invoice payload',
        details: parseResult.error.issues,
      });
    }

    try {
      const invoice = await defaultPayPalClient.createInvoice(parseResult.data as InvoiceDraftPayload);
      return reply.status(201).send({
        success: true,
        invoice,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to create PayPal invoice');
      return reply.status(500).send({
        error: 'Failed to create invoice',
        message: err.message,
      });
    }
  });

  // POST /api/invoices/:id/send
  fastify.post('/api/invoices/:id/send', async (request, reply) => {
    const paramsResult = InvoiceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid invoice ID',
        details: paramsResult.error.issues,
      });
    }

    try {
      const sent = await defaultPayPalClient.sendInvoice(paramsResult.data.id);
      return reply.send({
        success: sent,
        invoice_id: paramsResult.data.id,
        status: 'SENT',
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to send PayPal invoice');
      return reply.status(500).send({
        error: 'Failed to send invoice',
        message: err.message,
      });
    }
  });

  // GET /api/invoices/:id/qr
  fastify.get('/api/invoices/:id/qr', async (request, reply) => {
    const paramsResult = InvoiceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid invoice ID',
        details: paramsResult.error.issues,
      });
    }

    try {
      const qrCode = await defaultPayPalClient.generateInvoiceQrCode(paramsResult.data.id);
      return reply.send({
        success: true,
        invoice_id: paramsResult.data.id,
        qr_code: qrCode,
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to generate PayPal invoice QR code');
      return reply.status(500).send({
        error: 'Failed to generate invoice QR code',
        message: err.message,
      });
    }
  });

  // POST /api/invoices/:id/remind
  fastify.post('/api/invoices/:id/remind', async (request, reply) => {
    const paramsResult = InvoiceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid invoice ID',
        details: paramsResult.error.issues,
      });
    }

    const bodyResult = RemindInvoiceBodySchema.safeParse(request.body || {});
    const note = bodyResult.success ? bodyResult.data.note : undefined;

    try {
      const reminded = await defaultPayPalClient.sendInvoiceReminder(paramsResult.data.id, note);
      return reply.send({
        success: reminded,
        invoice_id: paramsResult.data.id,
        status: 'REMINDER_SENT',
      });
    } catch (err: any) {
      fastify.log.error(err, 'Failed to send PayPal invoice reminder');
      return reply.status(500).send({
        error: 'Failed to send invoice reminder',
        message: err.message,
      });
    }
  });
};
