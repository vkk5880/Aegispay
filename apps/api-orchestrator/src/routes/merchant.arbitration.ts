import { FastifyPluginAsync } from 'fastify';
import { defaultDisputeMatrixService } from '../services/dispute-matrix.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

export const merchantArbitrationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/agents/arbiter/stream
   * Server-Sent Events (SSE) stream for AG Studio 3 Cockpit and paypal_arbiter agent
   */
  fastify.get('/api/agents/arbiter/stream', async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Initial greeting event adhering to AG-UI protocol
    const initEvent = {
      type: 'TEXT_MESSAGE_PART',
      agent: 'paypal_arbiter',
      content: 'AegisPay PayPal Arbiter Specialist active. Monitoring dispute matrix and SLA schedules.',
      timestamp: new Date().toISOString(),
    };
    reply.raw.write(`data: ${JSON.stringify(initEvent)}\n\n`);

    // Stream sample dispute matrix state
    const sampleDecision = defaultDisputeMatrixService.calculateLiabilityAndAbuse({
      defect_severity_score: 0.15,
      non_delivery_score: 0.0,
      policy_valid_score: 0.8,
      exif_tamper_flag: true,
      identity_match_score: 0.4,
      buyer_dispute_velocity_score: 0.7,
      dispute_amount_cents: 14900,
    });

    const statusEvent = {
      type: 'TOOL_CALL_RESULT',
      agent: 'paypal_arbiter',
      tool: 'evaluate_dispute_forensics',
      result: {
        dispute_id: 'PP-D-998124',
        merchant_domain: 'techmerchant.com',
        decision: sampleDecision,
      },
      timestamp: new Date().toISOString(),
    };
    reply.raw.write(`data: ${JSON.stringify(statusEvent)}\n\n`);

    // Keepalive ping
    const interval = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(interval);
    });
  });

  /**
   * POST /api/agents/arbiter/evaluate
   * Evaluates dispute with 2D (L, R) matrix and optional forensic PDF dossier generation
   */
  fastify.post('/api/agents/arbiter/evaluate', async (request, reply) => {
    const body = request.body as any;
    const factors = {
      defect_severity_score: body?.defect_severity_score ?? 0.5,
      non_delivery_score: body?.non_delivery_score ?? 0.0,
      policy_valid_score: body?.policy_valid_score ?? 0.5,
      exif_tamper_flag: !!body?.exif_tamper_flag,
      identity_match_score: body?.identity_match_score ?? 0.9,
      buyer_dispute_velocity_score: body?.buyer_dispute_velocity_score ?? 0.1,
      dispute_amount_cents: body?.dispute_amount_cents ?? 5000,
    };

    const decision = defaultDisputeMatrixService.calculateLiabilityAndAbuse(factors);

    let pdfDossier: { base64: string } | null = null;
    if (decision.selected_tier_action === 'TIER4_CONTEST_PDF' || body?.generate_pdf) {
      pdfDossier = await defaultDisputeMatrixService.buildForensicPdfDossier({
        dispute_id: body?.dispute_id || 'PP-D-MOCK-1',
        merchant_domain: body?.merchant_domain || 'techmerchant.com',
        product_id: body?.product_id || 'ch3_prod_9921',
        dispute_reason: body?.dispute_reason || 'MERCHANDISE_NOT_AS_DESCRIBED',
        dispute_amount_cents: factors.dispute_amount_cents,
        decision,
        tracking_number: body?.tracking_number,
        channel3_reference_image_url: body?.channel3_reference_image_url,
        buyer_evidence_image_url: body?.buyer_evidence_image_url,
      });
    }

    return reply.send({
      status: 'SUCCESS',
      decision,
      pdf_dossier_base64: pdfDossier?.base64,
    });
  });

  /**
   * POST /api/agents/arbiter/execute
   * Executes the corresponding PayPal Dispute v1 action (e.g. provide evidence, make offer, refund, acknowledge return)
   */
  fastify.post('/api/agents/arbiter/execute', async (request, reply) => {
    const { dispute_id, action, amount_cents, note } = request.body as any;

    if (!dispute_id || !action) {
      return reply.status(400).send({ error: 'dispute_id and action are required' });
    }

    try {
      let result: any;
      switch (action) {
        case 'TIER1_REFUND': {
          // If captureId provided or mock
          result = await defaultPayPalClient.refundCapturedPayment(
            `CAP-${dispute_id}`,
            amount_cents ? { currencyCode: 'USD', value: (amount_cents / 100).toFixed(2) } : undefined,
            note
          );
          break;
        }
        case 'TIER2_PARTIAL_OFFER': {
          result = await defaultPayPalClient.makeDisputeOffer(dispute_id, {
            note: note || 'Partial settlement compromise offer',
            offer_amount: { currency_code: 'USD', value: ((amount_cents || 2500) / 100).toFixed(2) },
            offer_type: 'REFUND',
          });
          break;
        }
        case 'TIER3_RETURN_OFFER': {
          result = await defaultPayPalClient.makeDisputeOffer(dispute_id, {
            note: note || 'Full refund upon physical return of merchandise',
            offer_amount: { currency_code: 'USD', value: ((amount_cents || 5000) / 100).toFixed(2) },
            offer_type: 'REFUND_WITH_RETURN',
          });
          break;
        }
        case 'TIER4_CONTEST_PDF': {
          const dossier = await defaultDisputeMatrixService.buildForensicPdfDossier({
            dispute_id,
            merchant_domain: 'techmerchant.com',
            product_id: 'ch3_prod_9921',
            dispute_reason: 'MERCHANDISE_NOT_AS_DESCRIBED',
            dispute_amount_cents: amount_cents || 5000,
            decision: defaultDisputeMatrixService.calculateLiabilityAndAbuse({
              defect_severity_score: 0.1,
              non_delivery_score: 0,
              policy_valid_score: 0.9,
              exif_tamper_flag: true,
              identity_match_score: 0.3,
              buyer_dispute_velocity_score: 0.8,
              dispute_amount_cents: amount_cents || 5000,
            }),
          });
          result = await defaultPayPalClient.provideDisputeEvidence(dispute_id, {
            evidence_type: 'PROOF_OF_FULFILLMENT',
            notes: note || 'Automated Forensic Defense PDF Dossier',
            file: {
              buffer: Buffer.from(dossier.buffer),
              filename: `dossier_${dispute_id}.pdf`,
              mimeType: 'application/pdf',
            },
          });
          break;
        }
        case 'ADJUDICATE': {
          result = await defaultPayPalClient.adjudicateDispute(dispute_id, 'SELLER_FAVOR');
          break;
        }
        default:
          return reply.status(400).send({ error: `Unsupported dispute action: ${action}` });
      }

      return reply.send({
        status: 'EXECUTED',
        dispute_id,
        action,
        result,
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'EXECUTION_FAILED', message: err.message });
    }
  });
};
