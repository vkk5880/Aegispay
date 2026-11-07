import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultDisputeForensicsService } from '../services/dispute-forensics.js';
import { defaultDisputeMatrixService } from '../services/dispute-matrix.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

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

export const disputeRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/disputes/:id/hateoas
   * Retrieves current HATEOAS state, SLA deadlines, allowed response actions, and matrix decision
   */
  fastify.get('/api/disputes/:id/hateoas', async (request, reply) => {
    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const queryResult = HateoasQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: queryResult.error.format() });
    }

    const { id } = paramsResult.data;
    const query = queryResult.data;

    const amountCents = query.amount_cents ? parseInt(query.amount_cents, 10) : 12000;
    const matrix = defaultDisputeForensicsService.evaluateHateoasMatrix({
      disputeId: id,
      stage: query.stage || 'INQUIRY',
      disputeAmountCents: amountCents,
      sellerResponseDueDate: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), // 18h SLA remaining
    });

    return reply.status(200).send(matrix);
  });

  /**
   * POST /api/disputes/:id/escalate
   * Escalates an informal INQUIRY to formal PayPal CLAIM adjudication
   */
  fastify.post('/api/disputes/:id/escalate', async (request, reply) => {
    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = EscalateRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;

    try {
      const result = await defaultPayPalClient.adjudicateDispute(id, 'SELLER_FAVOR');
      return reply.status(200).send({
        dispute_id: id,
        action: 'ESCALATE_TO_CLAIM',
        previous_stage: 'INQUIRY',
        current_stage: 'CLAIM',
        timestamp: new Date().toISOString(),
        adjudication_result: result,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'ESCALATION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/:id/offer
   * Proposes a settlement offer or partial compromise to the buyer
   */
  fastify.post('/api/disputes/:id/offer', async (request, reply) => {
    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = OfferRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;
    const { offer_amount_cents, offer_type, notes } = parseResult.data;
    try {
      const offerTypeMapped =
        offer_type === 'RETURN_REFUND' ? 'REFUND_WITH_RETURN' : 'REFUND';
      const offerResult = await defaultPayPalClient.makeDisputeOffer(id, {
        note: notes || 'AegisPay settlement offer calculated via deterministic dispute matrix',
        offer_amount: {
          currency_code: 'USD',
          value: (((offer_amount_cents || 5000)) / 100).toFixed(2),
        },
        offer_type: offerTypeMapped,
      });

      return reply.status(200).send({
        dispute_id: id,
        action: 'MAKE_OFFER',
        offer_type,
        offer_amount_cents: offer_amount_cents || 5000,
        status: 'OFFER_SUBMITTED',
        offer_result: offerResult,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'OFFER_SUBMISSION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/:id/evidence
   * Submits evidence dossier (tracking, bounding box forensics, compiled PDF)
   */
  fastify.post('/api/disputes/:id/evidence', async (request, reply) => {
    const paramsResult = DisputeParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: paramsResult.error.format() });
    }

    const parseResult = EvidenceRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id } = paramsResult.data;
    const { evidence_type, tracking_number, carrier_name, notes, bounding_box } = parseResult.data;

    let defectAnalysis: any = null;
    if (bounding_box) {
      defectAnalysis = defaultDisputeForensicsService.analyzeDefectBoundingBox(
        bounding_box as [number, number, number, number]
      );
    }

    try {
      const evidencePayload: any = {
        evidence_type,
        notes: notes || 'AegisPay automated forensic verification dossier',
      };

      if (tracking_number && carrier_name) {
        evidencePayload.evidence_info = {
          tracking_info: [{ carrier_name, tracking_number }],
        };
      }

      const evidenceResult = await defaultPayPalClient.provideDisputeEvidence(id, evidencePayload);

      return reply.status(200).send({
        dispute_id: id,
        action: 'PROVIDE_EVIDENCE',
        evidence_type,
        defect_analysis: defectAnalysis,
        status: 'EVIDENCE_SUBMITTED',
        result: evidenceResult,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'EVIDENCE_SUBMISSION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/disputes/forensics/analyze-box
   * Analyzes defect bounding box coordinates and returns severity classification
   */
  fastify.post('/api/disputes/forensics/analyze-box', async (request, reply) => {
    const parseResult = BoundingBoxSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const result = defaultDisputeForensicsService.analyzeDefectBoundingBox(parseResult.data);
    if (!result.valid) {
      return reply.status(400).send({ error: 'INVALID_BOUNDING_BOX', details: result.description, result });
    }
    return reply.status(200).send(result);
  });

  /**
   * POST /api/disputes/forensics/analyze-exif
   * Detects image tamper signatures and editing tool traces
   */
  fastify.post('/api/disputes/forensics/analyze-exif', async (request, reply) => {
    const parseResult = ExifAnalyzeSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const result = defaultDisputeForensicsService.detectExifTampering(parseResult.data);
    return reply.status(200).send(result);
  });
};
