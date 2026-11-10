import { FastifyPluginAsync } from 'fastify';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultDisputeMatrixService } from '../services/dispute-matrix.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

const logger = createLogger('API:Routes:Arbitration');

export const merchantArbitrationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/agents/arbiter/stream
   * Server-Sent Events (SSE) stream for AG Studio 3 Cockpit and paypal_arbiter agent
   */
  fastify.get('/api/agents/arbiter/stream', async (request, reply) => {
    logger.debug('Incoming SSE stream connection request for paypal_arbiter agent', {
      headers: sanitizeForLogging(request.headers),
      query: sanitizeForLogging(request.query),
      ip: request.ip,
    });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    logger.info('SSE stream connected for paypal_arbiter; dispatching initial greeting and status event');

    // Initial greeting event adhering to AG-UI protocol
    const initEvent = {
      type: 'TEXT_MESSAGE_PART',
      agent: 'paypal_arbiter',
      content: 'AegisPay PayPal Arbiter Specialist active. Monitoring dispute matrix and SLA schedules.',
      timestamp: new Date().toISOString(),
    };
    reply.raw.write(`data: ${JSON.stringify(initEvent)}\n\n`);

    // Stream sample dispute matrix state
    logger.debug('Computing baseline dispute matrix decision for SSE stream subscriber');
    const sampleDecision = defaultDisputeMatrixService.calculateLiabilityAndAbuse({
      defect_severity_score: 0.15,
      non_delivery_score: 0.0,
      policy_valid_score: 0.8,
      exif_tamper_flag: true,
      identity_match_score: 0.4,
      buyer_dispute_velocity_score: 0.7,
      dispute_amount_cents: 14900,
    });

    logger.info('Broadcasting sample dispute arbitration status to SSE stream', {
      disputeId: 'PP-D-998124',
      selectedTierAction: sampleDecision.selected_tier_action,
      liabilityScoreL: sampleDecision.liability_score_l,
      abuseRiskScoreR: sampleDecision.abuse_risk_score_r,
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
    let pingCount = 0;
    const interval = setInterval(() => {
      pingCount += 1;
      logger.debug(`Dispatching SSE keepalive ping #${pingCount}`);
      reply.raw.write(`: ping\n\n`);
    }, 15000);

    request.raw.on('close', () => {
      logger.info('SSE stream connection closed by client', { totalPingsSent: pingCount });
      clearInterval(interval);
    });
  });

  /**
   * POST /api/agents/arbiter/evaluate
   * Evaluates dispute with 2D (L, R) matrix and optional forensic PDF dossier generation
   */
  fastify.post('/api/agents/arbiter/evaluate', async (request, reply) => {
    const routeTimer = logger.time('POST /api/agents/arbiter/evaluate');
    logger.debug('Received dispute forensics matrix evaluation request', {
      body: sanitizeForLogging(request.body),
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

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

    logger.info('Calculating 2D (L, R) liability and abuse risk matrix', {
      disputeId: body?.dispute_id || 'unspecified',
      disputeAmountCents: factors.dispute_amount_cents,
      defectSeverityScore: factors.defect_severity_score,
      exifTamperFlag: factors.exif_tamper_flag,
      identityMatchScore: factors.identity_match_score,
    });

    const evalStart = performance.now();
    const decision = defaultDisputeMatrixService.calculateLiabilityAndAbuse(factors);
    const evalDurationMs = performance.now() - evalStart;

    logger.info('Dispute matrix decision resolved', {
      disputeId: body?.dispute_id || 'unspecified',
      selectedTierAction: decision.selected_tier_action,
      liabilityScoreL: decision.liability_score_l,
      abuseRiskScoreR: decision.abuse_risk_score_r,
      evalDurationMs,
    });

    let pdfDossier: { base64: string } | null = null;
    const shouldGeneratePdf = decision.selected_tier_action === 'TIER4_CONTEST_PDF' || Boolean(body?.generate_pdf);

    if (shouldGeneratePdf) {
      logger.info('Initiating forensic PDF evidence dossier build', {
        disputeId: body?.dispute_id || 'PP-D-MOCK-1',
        reason: decision.selected_tier_action === 'TIER4_CONTEST_PDF' ? 'TIER4_CONTEST_PDF' : 'explicit_generate_pdf_request',
        merchantDomain: body?.merchant_domain || 'techmerchant.com',
      });

      try {
        const pdfTimer = performance.now();
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
        const pdfDurationMs = performance.now() - pdfTimer;
        logger.info('Forensic PDF dossier compiled successfully in memory', {
          disputeId: body?.dispute_id || 'PP-D-MOCK-1',
          pdfSizeBytes: pdfDossier?.base64?.length || 0,
          pdfDurationMs,
        });
      } catch (pdfErr: any) {
        logger.error('Failed to compile forensic PDF evidence dossier', {
          disputeId: body?.dispute_id || 'PP-D-MOCK-1',
          errorMessage: pdfErr.message,
          errorName: pdfErr.name,
          stack: pdfErr.stack,
        });
        routeTimer('Evaluation threw during PDF generation');
        return reply.status(500).send({ error: 'PDF_GENERATION_FAILED', message: pdfErr.message });
      }
    } else {
      logger.debug('Skipping forensic PDF dossier generation for tier', {
        selectedTierAction: decision.selected_tier_action,
      });
    }

    routeTimer('Dispute evaluation completed successfully');
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
    const routeTimer = logger.time('POST /api/agents/arbiter/execute');
    logger.debug('Received Dispute HATEOAS action execution request', {
      body: sanitizeForLogging(request.body),
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    const { dispute_id, action, amount_cents, note } = (request.body as any) || {};

    if (!dispute_id || !action) {
      logger.warn('Dispute action execution rejected: missing mandatory dispute_id or action', {
        hasDisputeId: Boolean(dispute_id),
        hasAction: Boolean(action),
      });
      routeTimer('Validation failed: missing parameters');
      return reply.status(400).send({ error: 'dispute_id and action are required' });
    }

    logger.info('Executing PayPal Dispute v1 HATEOAS action', {
      disputeId: dispute_id,
      action,
      amountCents: amount_cents || null,
      hasNote: Boolean(note),
    });

    try {
      let result: any;
      const actionTimer = performance.now();

      switch (action) {
        case 'TIER1_REFUND': {
          logger.info('Executing TIER1_REFUND via capture refund', {
            disputeId: dispute_id,
            captureId: `CAP-${dispute_id}`,
            amountCents: amount_cents || 'FULL',
          });
          result = await defaultPayPalClient.refundCapturedPayment(
            `CAP-${dispute_id}`,
            amount_cents ? { currencyCode: 'USD', value: (amount_cents / 100).toFixed(2) } : undefined,
            note
          );
          logger.info('TIER1_REFUND executed successfully', { disputeId: dispute_id, refundResult: result });
          break;
        }
        case 'TIER2_PARTIAL_OFFER': {
          const offerValue = ((amount_cents || 2500) / 100).toFixed(2);
          logger.info('Submitting TIER2_PARTIAL_OFFER to PayPal Disputes API', {
            disputeId: dispute_id,
            offerValue,
            offerType: 'REFUND',
          });
          result = await defaultPayPalClient.makeDisputeOffer(dispute_id, {
            note: note || 'Partial settlement compromise offer',
            offer_amount: { currency_code: 'USD', value: offerValue },
            offer_type: 'REFUND',
          });
          logger.info('TIER2_PARTIAL_OFFER submitted successfully', { disputeId: dispute_id, offerResult: result });
          break;
        }
        case 'TIER3_RETURN_OFFER': {
          const returnOfferValue = ((amount_cents || 5000) / 100).toFixed(2);
          logger.info('Submitting TIER3_RETURN_OFFER (refund contingent on return)', {
            disputeId: dispute_id,
            returnOfferValue,
            offerType: 'REFUND_WITH_RETURN',
          });
          result = await defaultPayPalClient.makeDisputeOffer(dispute_id, {
            note: note || 'Full refund upon physical return of merchandise',
            offer_amount: { currency_code: 'USD', value: returnOfferValue },
            offer_type: 'REFUND_WITH_RETURN',
          });
          logger.info('TIER3_RETURN_OFFER submitted successfully', { disputeId: dispute_id, returnOfferResult: result });
          break;
        }
        case 'TIER4_CONTEST_PDF': {
          logger.info('Generating and compiling forensic evidence PDF for TIER4_CONTEST_PDF', {
            disputeId: dispute_id,
            amountCents: amount_cents || 5000,
          });
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
          logger.info('Uploading compiled forensic PDF dossier via multipart/form-data to PayPal provide-evidence endpoint', {
            disputeId: dispute_id,
            filename: `dossier_${dispute_id}.pdf`,
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
          logger.info('TIER4_CONTEST_PDF evidence uploaded successfully', { disputeId: dispute_id });
          break;
        }
        case 'ADJUDICATE': {
          logger.info('Executing PayPal sandbox dispute auto-adjudication in SELLER_FAVOR', { disputeId: dispute_id });
          result = await defaultPayPalClient.adjudicateDispute(dispute_id, 'SELLER_FAVOR');
          logger.info('Dispute adjudicated successfully', { disputeId: dispute_id, adjudicationResult: result });
          break;
        }
        default: {
          logger.warn(`Rejected dispute action execution: unsupported action "${action}"`, {
            disputeId: dispute_id,
            unsupportedAction: action,
          });
          routeTimer('Unsupported action');
          return reply.status(400).send({ error: `Unsupported dispute action: ${action}` });
        }
      }

      const actionDurationMs = performance.now() - actionTimer;
      logger.info('Dispute HATEOAS action execution finished', {
        disputeId: dispute_id,
        action,
        actionDurationMs,
      });
      routeTimer(`Dispute action ${action} executed`);

      return reply.send({
        status: 'EXECUTED',
        dispute_id,
        action,
        result,
      });
    } catch (err: any) {
      logger.error('Failed to execute PayPal dispute action', {
        disputeId: dispute_id,
        action,
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: '/api/agents/arbiter/execute',
        stack: err.stack,
      });
      fastify.log.error(err);
      routeTimer(`Dispute action ${action} threw error`);
      return reply.status(500).send({ error: 'EXECUTION_FAILED', message: err.message });
    }
  });
};
