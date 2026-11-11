import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultDisputeForensicsService } from '../services/dispute-forensics.js';
import { defaultDisputeMatrixService } from '../services/dispute-matrix.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';
import { renderWorkflowClient } from '../services/render-workflow-client.js';

const logger = createLogger('API:Services:CatalogAndDisputes');

const DisputeParamsSchema = z.object({
  id: z.string().min(1, 'Dispute ID is required'),
});

const HateoasQuerySchema = z.object({
  stage: z.enum(['INQUIRY', 'CLAIM', 'CHARGEBACK', 'PRE_ARBITRATION', 'ARBITRATION', 'RESOLVED']).optional(),
  amount_cents: z.string().regex(/^\d+$/).optional(),
});

const EscalateRequestSchema = z.object({
  notes: z.string().optional(),
});

const OfferRequestSchema = z.object({
  offer_amount_cents: z.number().int().positive().optional(),
  offer_type: z.enum(['REFUND', 'PARTIAL_REFUND', 'RETURN_REFUND']).default('PARTIAL_REFUND'),
  notes: z.string().optional(),
});

const EvidenceRequestSchema = z.object({
  evidence_type: z.string().default('PROOF_OF_DELIVERY'),
  tracking_number: z.string().optional(),
  carrier_name: z.string().optional(),
  notes: z.string().optional(),
  bounding_box: z.array(z.number().min(0).max(1)).length(4).refine(
    ([ymin, xmin, ymax, xmax]) => ymin < ymax && xmin < xmax,
    { message: 'Bounding box coordinates must be non-inverted: ymin < ymax and xmin < xmax' }
  ).optional(),
});

const AppealRequestSchema = z.object({
  appeal_reason: z.string().min(5),
  evidence_notes: z.string().optional(),
});

const BoundingBoxCoordinatesSchema = z.object({
  ymin: z.number().min(0).max(1),
  xmin: z.number().min(0).max(1),
  ymax: z.number().min(0).max(1),
  xmax: z.number().min(0).max(1),
}).refine(
  (b) => b.ymin < b.ymax && b.xmin < b.xmax,
  { message: 'Bounding box coordinates must be non-inverted: ymin < ymax and xmin < xmax' }
);

const BoundingBoxTupleSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]).refine(
  ([ymin, xmin, ymax, xmax]) => ymin < ymax && xmin < xmax,
  { message: 'Bounding box coordinates must be non-inverted: ymin < ymax and xmin < xmax' }
);

const BoundingBoxSchema = z.union([
  BoundingBoxCoordinatesSchema,
  BoundingBoxTupleSchema,
  z.object({
    box: z.union([BoundingBoxCoordinatesSchema, BoundingBoxTupleSchema]),
  }).transform((val) => val.box),
]);

const ExifAnalyzeSchema = z.object({
  software: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  dateTimeOriginal: z.string().optional(),
  dateTimeDigitized: z.string().optional(),
  modifyDate: z.string().optional(),
});

const EvidenceSubmissionSchema = z.object({
  dispute_id: z.string(),
  buyer_id: z.string(),
  merchant_id: z.string(),
  dispute_amount_cents: z.number().int().positive(),
  buyer_statement: z.string(),
  buyer_image_url: z.string().url(),
  catalog_cleaned_image_url: z.string().url().optional(),
  bounding_boxes: z.array(
    z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
      label: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ).optional(),
  exif_metadata: z.object({
    capture_timestamp: z.string().optional(),
    camera_make: z.string().optional(),
    camera_model: z.string().optional(),
    software: z.string().optional(),
    gps_latitude: z.number().optional(),
    gps_longitude: z.number().optional(),
    is_modified: z.boolean().optional(),
  }).optional(),
  tracking_delivered_timestamp: z.string().optional(),
  buyer_dispute_count_last_90d: z.number().int().min(0).optional(),
});

export const disputeRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/disputes/:id/hateoas
   * Retrieves current HATEOAS state, SLA deadlines, allowed response actions, and matrix decision
   */
  fastify.get('/api/disputes/:id/hateoas', async (request, reply) => {
    logger.info('[GET /api/disputes/:id/hateoas] Inbound HATEOAS inquiry request', {
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      logger.warn('[GET /api/disputes/:id/hateoas] Route parameter validation failed', {
        errors: paramsResult.error.format(),
        params: sanitizeForLogging(request.params),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const queryResult = HateoasQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      logger.warn('[GET /api/disputes/:id/hateoas] Query parameter validation failed', {
        errors: queryResult.error.format(),
        query: sanitizeForLogging(request.query),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: queryResult.error.format() });
    }

    const { id } = paramsResult.data;
    const query = queryResult.data;

    const amountCents = query.amount_cents ? parseInt(query.amount_cents, 10) : 12000;
    const evaluatedStage = query.stage || 'INQUIRY';
    const sellerDueDate = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString();

    logger.debug('[GET /api/disputes/:id/hateoas] Evaluating HATEOAS dispute matrix', {
      disputeId: id,
      stage: evaluatedStage,
      amountCents,
      sellerDueDate,
    });

    const matrix = defaultDisputeForensicsService.evaluateHateoasMatrix({
      disputeId: id,
      stage: evaluatedStage,
      disputeAmountCents: amountCents,
      sellerResponseDueDate: sellerDueDate,
    });

    logger.info('[GET /api/disputes/:id/hateoas] HATEOAS dispute matrix evaluation complete', {
      disputeId: id,
      stage: evaluatedStage,
      allowedActionsCount: matrix.allowedActions?.length ?? 0,
      recommendedAction: matrix.recommendedAction,
      selectedTierAction: matrix.matrixDecision?.selected_tier_action,
      matrixPayload: sanitizeForLogging(matrix),
    });

    return reply.status(200).send(matrix);
  });

  /**
   * POST /api/disputes/:id/escalate
   * Escalates an informal INQUIRY to formal PayPal CLAIM adjudication
   */
  fastify.post('/api/disputes/:id/escalate', async (request, reply) => {
    logger.info('[POST /api/disputes/:id/escalate] Inbound escalation request', {
      params: sanitizeForLogging(request.params),
      body: sanitizeForLogging(request.body),
    });

    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      logger.warn('[POST /api/disputes/:id/escalate] Parameter validation failed', {
        errors: paramsResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = EscalateRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('[POST /api/disputes/:id/escalate] Body validation failed', {
        errors: parseResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;
    const { notes } = parseResult.data;

    logger.debug('[POST /api/disputes/:id/escalate] Invoking PayPal adjudication client', {
      disputeId: id,
      notes: notes || 'none',
      adjudicationTarget: 'SELLER_FAVOR',
    });

    try {
      const result = await defaultPayPalClient.adjudicateDispute(id, 'SELLER_FAVOR');
      logger.info('[POST /api/disputes/:id/escalate] PayPal adjudication escalation succeeded', {
        disputeId: id,
        result: sanitizeForLogging(result),
      });

      return reply.status(200).send({
        dispute_id: id,
        action: 'ESCALATE_TO_CLAIM',
        previous_stage: 'INQUIRY',
        current_stage: 'CLAIM',
        timestamp: new Date().toISOString(),
        adjudication_result: result,
      });
    } catch (err: any) {
      logger.error('[POST /api/disputes/:id/escalate] Dispute escalation failed', {
        disputeId: id,
        errorMessage: err.message,
        errorCode: err.code || 'ESCALATION_FAILED',
        path: '/api/disputes/:id/escalate',
        stack: err.stack,
      });
      return reply.status(500).send({ error: 'ESCALATION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/:id/offer
   * Proposes a settlement offer or partial compromise to the buyer
   */
  fastify.post('/api/disputes/:id/offer', async (request, reply) => {
    logger.info('[POST /api/disputes/:id/offer] Inbound settlement offer request', {
      params: sanitizeForLogging(request.params),
      body: sanitizeForLogging(request.body),
    });

    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      logger.warn('[POST /api/disputes/:id/offer] Parameter validation failed', {
        errors: paramsResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = OfferRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('[POST /api/disputes/:id/offer] Body validation failed', {
        errors: parseResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;
    const { offer_amount_cents, offer_type, notes } = parseResult.data;

    const offerTypeMapped = offer_type === 'RETURN_REFUND' ? 'REFUND_WITH_RETURN' : 'REFUND';
    const effectiveOfferCents = offer_amount_cents || 5000;
    const formattedDollarValue = (effectiveOfferCents / 100).toFixed(2);

    logger.debug('[POST /api/disputes/:id/offer] Submitting dispute offer to PayPal client', {
      disputeId: id,
      offerType: offer_type,
      offerTypeMapped,
      effectiveOfferCents,
      formattedDollarValue,
    });

    try {
      const offerResult = await defaultPayPalClient.makeDisputeOffer(id, {
        note: notes || 'AegisPay settlement offer calculated via deterministic dispute matrix',
        offer_amount: {
          currency_code: 'USD',
          value: formattedDollarValue,
        },
        offer_type: offerTypeMapped,
      });

      logger.info('[POST /api/disputes/:id/offer] Dispute offer successfully created', {
        disputeId: id,
        offerResult: sanitizeForLogging(offerResult),
        effectiveOfferCents,
        offerType: offer_type,
      });

      return reply.status(200).send({
        dispute_id: id,
        action: 'MAKE_OFFER',
        offer_type,
        offer_amount_cents: effectiveOfferCents,
        status: 'OFFER_SUBMITTED',
        offer_result: offerResult,
      });
    } catch (err: any) {
      logger.error('[POST /api/disputes/:id/offer] Dispute offer submission failed', {
        disputeId: id,
        errorMessage: err.message,
        errorCode: err.code || 'OFFER_SUBMISSION_FAILED',
        path: '/api/disputes/:id/offer',
        stack: err.stack,
      });
      return reply.status(500).send({ error: 'OFFER_SUBMISSION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/:id/evidence
   * Submits evidence dossier (tracking, bounding box forensics, compiled PDF)
   */
  fastify.post('/api/disputes/:id/evidence', async (request, reply) => {
    logger.info('[POST /api/disputes/:id/evidence] Inbound evidence submission request', {
      params: sanitizeForLogging(request.params),
      body: sanitizeForLogging(request.body),
    });

    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      logger.warn('[POST /api/disputes/:id/evidence] Parameter validation failed', {
        errors: paramsResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = EvidenceRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('[POST /api/disputes/:id/evidence] Body validation failed', {
        errors: parseResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;
    const { evidence_type, tracking_number, carrier_name, notes, bounding_box } = parseResult.data;

    let defectAnalysis: any = null;
    if (bounding_box) {
      logger.debug('[POST /api/disputes/:id/evidence] Analyzing defect bounding box coordinates', {
        disputeId: id,
        boundingBox: bounding_box,
      });
      defectAnalysis = defaultDisputeForensicsService.analyzeDefectBoundingBox(
        bounding_box as [number, number, number, number]
      );
      logger.info('[POST /api/disputes/:id/evidence] Defect bounding box analysis outcome', {
        disputeId: id,
        defectAnalysis: sanitizeForLogging(defectAnalysis),
      });
    } else {
      logger.debug('[POST /api/disputes/:id/evidence] No bounding box provided with evidence submission', {
        disputeId: id,
      });
    }

    try {
      const evidencePayload: any = {
        evidence_type,
        notes: notes || 'AegisPay automated forensic verification dossier',
      };

      if (tracking_number && carrier_name) {
        logger.debug('[POST /api/disputes/:id/evidence] Attaching carrier tracking info to evidence dossier', {
          disputeId: id,
          carrierName: carrier_name,
          trackingNumber: tracking_number,
        });
        evidencePayload.evidence_info = {
          tracking_info: [{ carrier_name, tracking_number }],
        };
      } else {
        logger.debug('[POST /api/disputes/:id/evidence] No carrier tracking attached to evidence payload', {
          disputeId: id,
        });
      }

      logger.debug('[POST /api/disputes/:id/evidence] Transmitting evidence to PayPal client', {
        disputeId: id,
        evidenceType: evidence_type,
      });

      const evidenceResult = await defaultPayPalClient.provideDisputeEvidence(id, evidencePayload);

      logger.info('[POST /api/disputes/:id/evidence] Evidence successfully submitted to PayPal', {
        disputeId: id,
        evidenceType: evidence_type,
        result: sanitizeForLogging(evidenceResult),
      });

      return reply.status(200).send({
        dispute_id: id,
        action: 'PROVIDE_EVIDENCE',
        evidence_type,
        defect_analysis: defectAnalysis,
        status: 'EVIDENCE_SUBMITTED',
        result: evidenceResult,
      });
    } catch (err: any) {
      logger.error('[POST /api/disputes/:id/evidence] Evidence submission failed', {
        disputeId: id,
        errorMessage: err.message,
        errorCode: err.code || 'EVIDENCE_SUBMISSION_FAILED',
        path: '/api/disputes/:id/evidence',
        stack: err.stack,
      });
      return reply.status(500).send({ error: 'EVIDENCE_SUBMISSION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/:id/appeal
   * Appeals a closed/lost dispute determination (POST /v1/customer/disputes/{id}/appeal)
   */
  fastify.post('/api/disputes/:id/appeal', async (request, reply) => {
    logger.info('[POST /api/disputes/:id/appeal] Inbound dispute appeal request', {
      params: sanitizeForLogging(request.params),
      body: sanitizeForLogging(request.body),
    });

    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = AppealRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;
    const { appeal_reason, evidence_notes } = parseResult.data;

    try {
      const appealResult = await defaultPayPalClient.appealDispute(
        id,
        {
          evidence_type: 'PROOF_OF_EMPTY_RETURN_OR_TAMPER',
          notes: `${appeal_reason}: ${evidence_notes || 'Merchant empty-box / fraud appeal with verified visual evidence'}`,
        }
      );

      logger.info('[POST /api/disputes/:id/appeal] Dispute appeal submitted successfully', {
        disputeId: id,
        appealReason: appeal_reason,
      });

      return reply.status(200).send({
        dispute_id: id,
        action: 'APPEAL',
        status: 'UNDER_APPEAL',
        result: appealResult,
      });
    } catch (err: any) {
      logger.error('[POST /api/disputes/:id/appeal] Dispute appeal failed', {
        disputeId: id,
        errorMessage: err.message,
        stack: err.stack,
      });
      return reply.status(500).send({ error: 'APPEAL_SUBMISSION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/forensics/analyze-box
   * Analyzes defect bounding box coordinates and returns severity classification
   */
  fastify.post('/api/disputes/forensics/analyze-box', async (request, reply) => {
    logger.info('[POST /api/disputes/forensics/analyze-box] Inbound bounding box analysis request', {
      body: sanitizeForLogging(request.body),
    });

    const parseResult = BoundingBoxSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('[POST /api/disputes/forensics/analyze-box] Bounding box validation failed', {
        errors: parseResult.error.format(),
        body: sanitizeForLogging(request.body),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const result = defaultDisputeForensicsService.analyzeDefectBoundingBox(parseResult.data);
    if (!result.valid) {
      logger.warn('[POST /api/disputes/forensics/analyze-box] Defect bounding box invalid or inverted', {
        description: result.description,
        result: sanitizeForLogging(result),
      });
      return reply.status(400).send({ error: 'INVALID_BOUNDING_BOX', details: result.description, result });
    }

    logger.info('[POST /api/disputes/forensics/analyze-box] Bounding box analysis evaluated successfully', {
      defectClass: result.defectClass,
      defectSeverityScore: result.defectSeverityScore,
      defectAreaRatio: result.defectAreaRatio,
      centralityScore: result.centralityScore,
    });
    return reply.status(200).send(result);
  });

  /**
   * POST /api/disputes/forensics/analyze-exif
   * Detects image tamper signatures and editing tool traces
   */
  fastify.post('/api/disputes/forensics/analyze-exif', async (request, reply) => {
    logger.info('[POST /api/disputes/forensics/analyze-exif] Inbound EXIF analysis request', {
      body: sanitizeForLogging(request.body),
    });

    const parseResult = ExifAnalyzeSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('[POST /api/disputes/forensics/analyze-exif] EXIF metadata validation failed', {
        errors: parseResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const result = defaultDisputeForensicsService.detectExifTampering(parseResult.data);

    logger.info('[POST /api/disputes/forensics/analyze-exif] EXIF analysis evaluated', {
      tamperFlag: result.exifTamperFlag,
      softwareDetected: result.softwareDetected || 'none',
      cameraDevice: result.cameraDevice || 'none',
      anomalyReasonsCount: result.anomalyReasons?.length || 0,
    });

    return reply.status(200).send(result);
  });

  /**
   * POST /api/disputes/forensics/analyze
   * Evaluates vision defect bounding boxes, EXIF tamper detection, and liability matrix.
   */
  fastify.post('/api/disputes/forensics/analyze', async (request, reply) => {
    logger.info('[POST /api/disputes/forensics/analyze] Inbound comprehensive forensics analysis request', {
      body: sanitizeForLogging(request.body),
    });

    const parseResult = EvidenceSubmissionSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('[POST /api/disputes/forensics/analyze] Forensic evidence submission validation failed', {
        errors: parseResult.error.format(),
        body: sanitizeForLogging(request.body),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    logger.debug('[POST /api/disputes/forensics/analyze] Running dispute forensics analysis', {
      disputeId: parseResult.data.dispute_id,
      buyerId: parseResult.data.buyer_id,
      merchantId: parseResult.data.merchant_id,
      amountCents: parseResult.data.dispute_amount_cents,
    });

    const result = defaultDisputeForensicsService.analyzeDispute(parseResult.data);
    const disputeId = (parseResult.data as any).dispute_id || `disp_${Date.now()}`;

    logger.debug('[POST /api/disputes/forensics/analyze] Triggering Render durable dispute forensics workflow', {
      disputeId,
    });

    const workflowDispatch = await renderWorkflowClient.triggerDisputeForensics({
      paypal_dispute_id: disputeId,
    });

    logger.info('[POST /api/disputes/forensics/analyze] Comprehensive forensics analysis complete', {
      disputeId,
      liabilityScore: result.liability_score_l,
      abuseScore: result.abuse_risk_score_r,
      tierAction: result.selected_tier_action,
      workflowDispatched: workflowDispatch.status,
    });

    return reply.status(200).send({
      ...result,
      workflow_dispatch: workflowDispatch,
    });
  });

  /**
   * GET /api/disputes/:id/matrix
   * Returns current liability matrix for a dispute.
   */
  fastify.get('/api/disputes/:id/matrix', async (request, reply) => {
    logger.info('[GET /api/disputes/:id/matrix] Inbound dispute matrix request', {
      params: sanitizeForLogging(request.params),
    });

    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      logger.warn('[GET /api/disputes/:id/matrix] Parameter validation failed', {
        errors: paramsResult.error.format(),
      });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const { id } = paramsResult.data;
    const factors = {
      defect_severity_score: 0.45,
      non_delivery_score: 0.1,
      policy_valid_score: 0.9,
      exif_tamper_flag: false,
      identity_match_score: 0.85,
      buyer_dispute_velocity_score: 0.2,
      dispute_amount_cents: 8500,
    };

    logger.debug('[GET /api/disputes/:id/matrix] Calculating liability and abuse scores', {
      disputeId: id,
      factors,
    });

    const decision = defaultDisputeMatrixService.calculateLiabilityAndAbuse(factors);

    logger.info('[GET /api/disputes/:id/matrix] Matrix decision calculated successfully', {
      disputeId: id,
      liabilityL: decision.liability_score_l,
      abuseRiskR: decision.abuse_risk_score_r,
      recommendedAction: decision.selected_tier_action,
    });

    return reply.status(200).send({ dispute_id: id, ...decision });
  });

  // =========================================================================
  // Phase 3: Dispute Data Pipeline — Server Rollups & Batch Ingestion
  // =========================================================================

  interface AnonymizedDisputeLedgerEntry {
    paypal_dispute_id: string;
    dispute_reason: string;
    dispute_state: string;
    dispute_amount_cents: number;
    liability_score_l: number;
    abuse_risk_score_r: number;
    exif_tamper_flag: boolean;
    selected_tier_action: string;
    seller_response_due_date: string;
  }

  const activeDisputesLedger: AnonymizedDisputeLedgerEntry[] = [
    {
      paypal_dispute_id: 'PP-D-1001',
      dispute_reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      dispute_state: 'REQUIRED_ACTION',
      dispute_amount_cents: 3500,
      liability_score_l: 0.85,
      abuse_risk_score_r: 0.12,
      exif_tamper_flag: false,
      selected_tier_action: 'TIER1_REFUND',
      seller_response_due_date: new Date(Date.now() + 20 * 3600 * 1000).toISOString(), // < 48h
    },
    {
      paypal_dispute_id: 'PP-D-1002',
      dispute_reason: 'UNAUTHORISED',
      dispute_state: 'REQUIRED_ACTION',
      dispute_amount_cents: 18500,
      liability_score_l: 0.40,
      abuse_risk_score_r: 0.75,
      exif_tamper_flag: true,
      selected_tier_action: 'TIER4_CONTEST_PDF',
      seller_response_due_date: new Date(Date.now() + 32 * 3600 * 1000).toISOString(), // < 48h
    },
    {
      paypal_dispute_id: 'PP-D-1003',
      dispute_reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      dispute_state: 'UNDER_REVIEW',
      dispute_amount_cents: 8900,
      liability_score_l: 0.60,
      abuse_risk_score_r: 0.25,
      exif_tamper_flag: false,
      selected_tier_action: 'TIER2_PARTIAL_OFFER',
      seller_response_due_date: new Date(Date.now() + 96 * 3600 * 1000).toISOString(),
    },
    {
      paypal_dispute_id: 'PP-D-1004',
      dispute_reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      dispute_state: 'REQUIRED_ACTION',
      dispute_amount_cents: 12000,
      liability_score_l: 0.50,
      abuse_risk_score_r: 0.50,
      exif_tamper_flag: false,
      selected_tier_action: 'TIER3_EVIDENCE_PACK',
      seller_response_due_date: new Date(Date.now() + 120 * 3600 * 1000).toISOString(),
    },
  ];

  /**
   * GET /api/analytics/disputes/summary
   * Provides instantaneous pre-aggregated dispute KPIs for merchant cockpits.
   */
  fastify.get('/api/analytics/disputes/summary', async (request, reply) => {
    logger.info('[GET /api/analytics/disputes/summary] Computing dispute analytics KPIs summary');

    const totalActive = activeDisputesLedger.length;
    const now = Date.now();
    const threshold48h = now + 48 * 3600 * 1000;

    const slaBreachCount = activeDisputesLedger.filter(
      (d) => new Date(d.seller_response_due_date).getTime() <= threshold48h
    ).length;

    const highLiabilityCount = activeDisputesLedger.filter((d) => d.liability_score_l >= 0.5).length;
    const lossRateBps = totalActive > 0 ? Math.round((highLiabilityCount / totalActive) * 10000) : 0;

    const tierBreakdown: Record<string, number> = {
      TIER1_REFUND: 0,
      TIER2_PARTIAL_OFFER: 0,
      TIER3_EVIDENCE_PACK: 0,
      TIER4_CONTEST_PDF: 0,
    };

    let totalAtRiskCents = 0;
    for (const d of activeDisputesLedger) {
      totalAtRiskCents += d.dispute_amount_cents;
      tierBreakdown[d.selected_tier_action] = (tierBreakdown[d.selected_tier_action] || 0) + 1;
    }

    const summaryPayload = {
      total_active_disputes: totalActive,
      sla_breach_risk_count: slaBreachCount,
      loss_rate_basis_points: lossRateBps,
      total_at_risk_cents: totalAtRiskCents,
      tier_breakdown: tierBreakdown,
      generated_at: new Date().toISOString(),
    };

    logger.info('[GET /api/analytics/disputes/summary] Summary KPIs aggregated successfully', {
      totalActive,
      slaBreachCount,
      lossRateBps,
      totalAtRiskCents,
    });

    return reply.status(200).send(summaryPayload);
  });

  /**
   * GET /api/analytics/disputes/batch
   * Streams lightweight, optimized dispute records without heavy PDF base64 payloads
   * for zero-copy DuckDB-WASM batch ingestion.
   */
  fastify.get('/api/analytics/disputes/batch', async (request, reply) => {
    const query = request.query as { window_days?: string };
    const windowDays = query?.window_days ? parseInt(query.window_days, 10) : 90;

    logger.info('[GET /api/analytics/disputes/batch] Inbound dispute batch query request', {
      windowDays,
      recordsAvailable: activeDisputesLedger.length,
    });

    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=60');

    logger.debug('[GET /api/analytics/disputes/batch] Dispatching dispute batch payload for DuckDB ingestion', {
      recordCount: activeDisputesLedger.length,
      windowDays,
    });

    return reply.status(200).send({
      window_days: windowDays,
      record_count: activeDisputesLedger.length,
      records: activeDisputesLedger,
    });
  });
};
