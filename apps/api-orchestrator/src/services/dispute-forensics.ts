import { ForensicsFactors, DisputeMatrixDecision, defaultDisputeMatrixService } from './dispute-matrix.js';
import { defaultPayPalClient, PayPalApimaticClient } from './paypal-apimatic.js';
import { evaluatePerceptualDuplicate, KnownEvidenceRecord } from './image-hasher.js';
import { PerceptualHashResult, createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:Forensics');

export interface BoundingBox {
  x: number; // 0.0 - 1.0 normalized
  y: number; // 0.0 - 1.0 normalized
  width: number; // 0.0 - 1.0 normalized
  height: number; // 0.0 - 1.0 normalized
  label: string; // e.g. 'cracked_screen', 'torn_fabric', 'missing_accessory'
  confidence: number; // [0.0, 1.0]
}

export interface ExifMetadata {
  capture_timestamp?: string;
  camera_make?: string;
  camera_model?: string;
  software?: string; // e.g. 'Photoshop', 'GIMP' (flags tamper)
  gps_latitude?: number;
  gps_longitude?: number;
  is_modified?: boolean;
}

export interface DisputeForensicAnalysisInput {
  dispute_id: string;
  buyer_id: string;
  merchant_id: string;
  dispute_amount_cents: number;
  buyer_statement: string;
  buyer_image_url: string;
  catalog_cleaned_image_url?: string;
  bounding_boxes?: BoundingBox[];
  exif_metadata?: ExifMetadata;
  tracking_delivered_timestamp?: string;
  buyer_dispute_count_last_90d?: number;
}

export interface DisputeForensicsResult extends DisputeMatrixDecision {
  dispute_id: string;
  defect_bounding_boxes: BoundingBox[];
  exif_tampered: boolean;
  tamper_reasons: string[];
  hateoas_actions: {
    rel: string;
    href: string;
    method: 'GET' | 'POST' | 'PUT';
    description: string;
  }[];
}

export interface BoundingBoxCoordinates {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface DefectAnalysisResult {
  valid: boolean;
  defectAreaRatio: number; // Normalized area [0, 1]
  defectSeverityScore: number; // S_defect in [0, 1]
  centralityScore: number;
  defectClass: 'NEGLIGIBLE' | 'COSMETIC' | 'FUNCTIONAL' | 'CRITICAL_DEFECT';
  description: string;
}

export interface ExifTamperAnalysisResult {
  exifTamperFlag: boolean; // I_exif_tamper in {0, 1}
  softwareDetected?: string;
  anomalyReasons: string[];
  cameraDevice?: string;
  originalTimestamp?: string;
  digitizedTimestamp?: string;
}

export interface HateoasActionLink {
  rel: string;
  href: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  title: string;
  description: string;
  tierRequired?: string;
}

export interface DisputeLifecycleHateoasMatrix {
  disputeId: string;
  stage: 'INQUIRY' | 'CLAIM' | 'CHARGEBACK' | 'PRE_ARBITRATION' | 'ARBITRATION' | 'RESOLVED';
  status: string;
  disputeAmountCents: number;
  sellerResponseDueDate?: string;
  hoursUntilSlaExpiry?: number;
  slaBreachRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_BREACH';
  allowedActions: string[];
  links: HateoasActionLink[];
  recommendedAction: string;
  matrixDecision?: DisputeMatrixDecision;
}

/**
 * Known image manipulation and editing software identifiers to flag as evidence tampering.
 * Stock camera tags (Apple, Samsung, Google Pixel, Sony, Xiaomi, etc.) are treated as legitimate.
 */
const KNOWN_EDITING_SIGNATURES = [
  'adobe photoshop',
  'photoshop',
  'gimp',
  'canva',
  'lightroom',
  'pixelmator',
  'snapseed',
  'affinity photo',
  'affinity',
  'coreldraw',
  'photopea',
  'vsco',
  'facetune',
  'picsart',
  'paint.net',
  'midjourney',
  'dall-e',
  'stable diffusion',
  'pixlr',
];

export class DisputeForensicsService {
  private paypalClient: PayPalApimaticClient;

  constructor(paypalClient?: PayPalApimaticClient) {
    this.paypalClient = paypalClient || defaultPayPalClient;
    logger.debug('DisputeForensicsService initialized with PayPalApimaticClient');
  }

  /**
   * Performs high-level multi-modal dispute analysis combining defect bounding boxes,
   * EXIF metadata tamper checks, buyer dispute history velocity, and 2D matrix arbitration.
   */
  public analyzeDispute(input: DisputeForensicAnalysisInput): DisputeForensicsResult {
    logger.info(`Starting dispute forensic analysis for dispute_id: ${input.dispute_id}`, {
      dispute_id: input.dispute_id,
      buyer_id: input.buyer_id,
      merchant_id: input.merchant_id,
      dispute_amount_cents: input.dispute_amount_cents,
      has_buyer_image: Boolean(input.buyer_image_url),
      has_catalog_image: Boolean(input.catalog_cleaned_image_url),
      bounding_boxes_count: input.bounding_boxes?.length ?? 0,
      has_exif: Boolean(input.exif_metadata),
      delivered_timestamp: input.tracking_delivered_timestamp,
      buyer_dispute_count_last_90d: input.buyer_dispute_count_last_90d,
    });

    const tamperReasons: string[] = [];
    let exifTampered = false;

    // 1. EXIF Tamper Detection
    if (input.exif_metadata) {
      logger.debug(`[${input.dispute_id}] Evaluating EXIF metadata`, {
        software: input.exif_metadata.software,
        camera_make: input.exif_metadata.camera_make,
        camera_model: input.exif_metadata.camera_model,
        capture_timestamp: input.exif_metadata.capture_timestamp,
        gps: input.exif_metadata.gps_latitude && input.exif_metadata.gps_longitude ? {
          lat: input.exif_metadata.gps_latitude,
          lon: input.exif_metadata.gps_longitude,
        } : undefined,
        is_modified: input.exif_metadata.is_modified,
      });

      if (input.exif_metadata.software && /(photoshop|gimp|canva|editor|lightroom|pixelmator|snapseed)/i.test(input.exif_metadata.software)) {
        exifTampered = true;
        const reason = `Tampering detected: Image software header indicates editing tool '${input.exif_metadata.software}'`;
        tamperReasons.push(reason);
        logger.warn(`[${input.dispute_id}] EXIF tamper flag triggered: Editing software '${input.exif_metadata.software}' detected`);
      } else {
        logger.debug(`[${input.dispute_id}] EXIF software check clean or legitimate: ${input.exif_metadata.software || 'none'}`);
      }

      if (input.exif_metadata.is_modified) {
        exifTampered = true;
        const reason = 'Tampering detected: File modification timestamp postdates file creation timestamp';
        tamperReasons.push(reason);
        logger.warn(`[${input.dispute_id}] EXIF tamper flag triggered: File modification postdates creation`);
      } else {
        logger.debug(`[${input.dispute_id}] EXIF file modification flag clean`);
      }

      if (input.tracking_delivered_timestamp && input.exif_metadata.capture_timestamp) {
        const delivered = new Date(input.tracking_delivered_timestamp).getTime();
        const captured = new Date(input.exif_metadata.capture_timestamp).getTime();
        logger.debug(`[${input.dispute_id}] Comparing capture vs delivered timestamps: captured=${captured}, delivered=${delivered}`);
        if (captured < delivered - 3600000) {
          exifTampered = true;
          const reason = 'Temporal anomaly: Photo was taken before package was marked delivered';
          tamperReasons.push(reason);
          logger.warn(`[${input.dispute_id}] Temporal anomaly detected: Image captured prior to delivery timestamp`);
        } else {
          logger.debug(`[${input.dispute_id}] Capture timestamp postdates delivery timestamp as expected`);
        }
      }
    } else {
      logger.debug(`[${input.dispute_id}] No EXIF metadata provided; treating neutrally`);
    }

    // 2. Defect Bounding Box Analysis
    const boxes = input.bounding_boxes || [];
    let defectCoverage = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const area = Math.min(1.0, Math.max(0.0, b.width * b.height));
      defectCoverage += area;
      logger.debug(`[${input.dispute_id}] Bounding box [${i}]: label=${b.label}, confidence=${b.confidence}, area=${area}`);
    }
    const defectSeverityScore = Math.min(1.0, defectCoverage * 2.5 + (boxes.length > 0 ? 0.2 : 0.0));
    logger.debug(`[${input.dispute_id}] Calculated defect severity score: ${defectSeverityScore} (coverage: ${defectCoverage})`);

    // 3. Buyer Velocity & Policy Validity Scores
    const buyerVelocity = Math.min(1.0, (input.buyer_dispute_count_last_90d || 0) / 5.0);
    const policyValidScore = input.dispute_amount_cents <= 100000 ? 0.9 : 0.7;
    const isNonDelivery = input.buyer_statement.toLowerCase().includes('not received');
    logger.debug(`[${input.dispute_id}] Buyer velocity score: ${buyerVelocity}, policy valid score: ${policyValidScore}, non-delivery: ${isNonDelivery}`);

    // 4. Matrix Evaluation
    const factors: ForensicsFactors = {
      defect_severity_score: defectSeverityScore,
      non_delivery_score: isNonDelivery ? 0.95 : 0.05,
      policy_valid_score: policyValidScore,
      exif_tamper_flag: exifTampered,
      identity_match_score: exifTampered ? 0.3 : 0.85,
      buyer_dispute_velocity_score: buyerVelocity,
      dispute_amount_cents: input.dispute_amount_cents,
    };

    logger.debug(`[${input.dispute_id}] Evaluating 2D Dispute Matrix with factors`, sanitizeForLogging(factors));
    const decision = defaultDisputeMatrixService.calculateLiabilityAndAbuse(factors);
    logger.info(`[${input.dispute_id}] Matrix decision evaluated: Tier=${decision.selected_tier_action}, L=${decision.liability_score_l}, R=${decision.abuse_risk_score_r}`);

    // 5. Build HATEOAS Actions
    const hateoasActions = [
      {
        rel: 'self',
        href: `/api/disputes/${input.dispute_id}/matrix`,
        method: 'GET' as const,
        description: 'Read computed liability matrix and forensics state',
      },
      {
        rel: 'provide_evidence',
        href: `/api/disputes/${input.dispute_id}/evidence`,
        method: 'POST' as const,
        description: 'Submit PDF evidence dossier to PayPal Disputes v1',
      },
      {
        rel: 'make_offer',
        href: `/api/disputes/${input.dispute_id}/offer`,
        method: 'POST' as const,
        description: 'Propose automated partial settlement offer to buyer',
      },
      {
        rel: 'escalate_sla',
        href: `/api/disputes/${input.dispute_id}/escalate`,
        method: 'POST' as const,
        description: 'Escalate to human review or PayPal arbitration before SLA deadline',
      },
    ];

    return {
      ...decision,
      dispute_id: input.dispute_id,
      defect_bounding_boxes: boxes,
      exif_tampered: exifTampered,
      tamper_reasons: tamperReasons,
      hateoas_actions: hateoasActions,
    };
  }

  /**
   * Evaluates normalized defect bounding box coordinates [ymin, xmin, ymax, xmax]
   * to determine defect severity score S_defect according to the AegisPay Two-Dimensional Matrix.
   *
   * Hardened: Strictly rejects non-normalized coordinates (< 0.0, > 1.0, NaN/Infinite)
   * or inverted coordinates (ymin >= ymax, xmin >= xmax) without masking via silent clamping.
   */
  analyzeDefectBoundingBox(
    box: [number, number, number, number] | BoundingBoxCoordinates
  ): DefectAnalysisResult {
    logger.debug('Evaluating defect bounding box payload', { box });
    let ymin: number, xmin: number, ymax: number, xmax: number;

    if (Array.isArray(box)) {
      [ymin, xmin, ymax, xmax] = box;
      logger.debug(`Parsed box array: ymin=${ymin}, xmin=${xmin}, ymax=${ymax}, xmax=${xmax}`);
    } else if (box && typeof box === 'object') {
      ymin = box.ymin;
      xmin = box.xmin;
      ymax = box.ymax;
      xmax = box.xmax;
      logger.debug(`Parsed box object: ymin=${ymin}, xmin=${xmin}, ymax=${ymax}, xmax=${xmax}`);
    } else {
      logger.warn('Defect bounding box payload structure is invalid', { box });
      return {
        valid: false,
        defectAreaRatio: 0,
        defectSeverityScore: 0.05,
        centralityScore: 0,
        defectClass: 'NEGLIGIBLE',
        description: 'Invalid bounding box payload structure.',
      };
    }

    // Verify all coordinates are finite numbers
    if (
      !Number.isFinite(ymin) ||
      !Number.isFinite(xmin) ||
      !Number.isFinite(ymax) ||
      !Number.isFinite(xmax)
    ) {
      logger.warn('Bounding box coordinates contain non-finite values', { ymin, xmin, ymax, xmax });
      return {
        valid: false,
        defectAreaRatio: 0,
        defectSeverityScore: 0.05,
        centralityScore: 0,
        defectClass: 'NEGLIGIBLE',
        description: 'Bounding box coordinates must be finite numbers.',
      };
    }

    // Strictly verify normalized range [0.0, 1.0] without silent clamping
    if (
      ymin < 0 || ymin > 1 ||
      xmin < 0 || xmin > 1 ||
      ymax < 0 || ymax > 1 ||
      xmax < 0 || xmax > 1
    ) {
      logger.warn('Bounding box coordinates out of normalized range [0.0, 1.0]', { ymin, xmin, ymax, xmax });
      return {
        valid: false,
        defectAreaRatio: 0,
        defectSeverityScore: 0.05,
        centralityScore: 0,
        defectClass: 'NEGLIGIBLE',
        description: 'Bounding box coordinates must be strictly normalized between 0.0 and 1.0.',
      };
    }

    // Reject inverted or degenerate coordinates
    if (ymin >= ymax || xmin >= xmax) {
      logger.warn('Bounding box coordinates are inverted or degenerate', { ymin, xmin, ymax, xmax });
      return {
        valid: false,
        defectAreaRatio: 0,
        defectSeverityScore: 0.05,
        centralityScore: 0,
        defectClass: 'NEGLIGIBLE',
        description: 'Invalid or inverted bounding box coordinates provided: ymin must be < ymax and xmin must be < xmax.',
      };
    }

    const height = ymax - ymin;
    const width = xmax - xmin;
    const areaRatio = Number((height * width).toFixed(4));

    // Calculate centrality (distance from center of image [0.5, 0.5])
    const centerY = (ymin + ymax) / 2;
    const centerX = (xmin + xmax) / 2;
    const distanceFromCenter = Math.sqrt(Math.pow(centerY - 0.5, 2) + Math.pow(centerX - 0.5, 2));
    const centralityScore = Number(Math.max(0, 1 - distanceFromCenter / 0.707).toFixed(3));

    // Defect severity score calculation: 70% area ratio + 30% centrality
    let rawScore = areaRatio * 0.7 + centralityScore * 0.3;
    const defectSeverityScore = Number(Math.min(1.0, Math.max(0.05, rawScore)).toFixed(3));

    let defectClass: DefectAnalysisResult['defectClass'];
    let description: string;

    if (defectSeverityScore < 0.20) {
      defectClass = 'NEGLIGIBLE';
      description = 'Minor surface variance or negligible cosmetic mark. Safe for Tier 4 forensic contest.';
    } else if (defectSeverityScore < 0.50) {
      defectClass = 'COSMETIC';
      description = 'Localized cosmetic defect. Eligible for Tier 2 Keep-The-Item partial compromise.';
    } else if (defectSeverityScore < 0.80) {
      defectClass = 'FUNCTIONAL';
      description = 'Substantial functional flaw or damage. Requires Tier 3 return item scan.';
    } else {
      defectClass = 'CRITICAL_DEFECT';
      description = 'Critical structural defect rendering item unusable. Eligible for Tier 1 micro-refund or return.';
    }

    logger.info(`Defect bounding box analyzed successfully: class=${defectClass}, severity=${defectSeverityScore}, areaRatio=${areaRatio}, centrality=${centralityScore}`);

    return {
      valid: true,
      defectAreaRatio: areaRatio,
      defectSeverityScore,
      centralityScore,
      defectClass,
      description,
    };
  }

  /**
   * Scans EXIF metadata or raw image buffer for editing software signatures and temporal anomalies.
   *
   * Hardened: Ensures stock smartphone tags (Apple iOS, Samsung, Google Pixel, Sony, Xiaomi)
   * or stripped metadata are treated as neutral without false positives.
   */
  detectExifTampering(metadata: {
    software?: string;
    make?: string;
    model?: string;
    dateTimeOriginal?: string;
    dateTimeDigitized?: string;
    modifyDate?: string;
    rawBuffer?: Buffer | Uint8Array;
  }): ExifTamperAnalysisResult {
    logger.debug('Starting EXIF tampering detection scan', {
      software: metadata?.software,
      make: metadata?.make,
      model: metadata?.model,
      dateTimeOriginal: metadata?.dateTimeOriginal,
      dateTimeDigitized: metadata?.dateTimeDigitized,
      modifyDate: metadata?.modifyDate,
      hasRawBuffer: Boolean(metadata?.rawBuffer),
      bufferLength: metadata?.rawBuffer ? metadata.rawBuffer.length : 0,
    });

    // Checkpoint 6.1 Bounded Forensic Processing: Enforce 10 MB payload limit on evidence buffers
    const MAX_FORENSIC_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB
    if (metadata?.rawBuffer && metadata.rawBuffer.length > MAX_FORENSIC_BUFFER_BYTES) {
      logger.error(`Evidence buffer exceeds 10 MB limit: ${metadata.rawBuffer.length} bytes`);
      throw new Error(`Evidence buffer exceeds maximum forensic limit of 10 MB (${metadata.rawBuffer.length} bytes)`);
    }

    const anomalyReasons: string[] = [];
    let softwareDetected: string | undefined;

    const rawSoftware = metadata?.software ? String(metadata.software).trim() : '';
    const softwareLower = rawSoftware.toLowerCase();

    // 1. Scan software string against known manipulation software
    if (softwareLower) {
      logger.debug(`Scanning software string: "${rawSoftware}" against ${KNOWN_EDITING_SIGNATURES.length} known editing signatures`);
      for (const signature of KNOWN_EDITING_SIGNATURES) {
        if (softwareLower.includes(signature)) {
          softwareDetected = rawSoftware;
          const reason = `Image edited with third-party graphics tool: "${rawSoftware}"`;
          anomalyReasons.push(reason);
          logger.warn(`EXIF software match found: signature="${signature}", software="${rawSoftware}"`);
          break;
        }
      }
      if (!softwareDetected) {
        logger.debug(`Software string "${rawSoftware}" does not match known editing signatures`);
      }
    } else {
      logger.debug('No software field in EXIF metadata');
    }

    // 2. Scan raw buffer for ASCII signatures if provided and not yet detected
    if (!softwareDetected && metadata?.rawBuffer && metadata.rawBuffer.length > 0) {
      logger.debug(`Scanning raw evidence buffer (${metadata.rawBuffer.length} bytes) for binary ASCII editing signatures`);
      try {
        const bufferString = Buffer.from(metadata.rawBuffer).toString('binary').toLowerCase();
        for (const signature of KNOWN_EDITING_SIGNATURES) {
          if (bufferString.includes(signature)) {
            softwareDetected = signature;
            const reason = `Binary buffer contains metadata signature for: "${signature}"`;
            anomalyReasons.push(reason);
            logger.warn(`Binary buffer signature match found: "${signature}"`);
            break;
          }
        }
        if (!softwareDetected) {
          logger.debug('Binary buffer scan completed with zero manipulation signatures detected');
        }
      } catch (err: any) {
        logger.error('Failed to decode rawBuffer during binary signature scan', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
      }
    }

    // 3. Temporal discrepancy check between capture and digitization/modification
    if (metadata?.dateTimeOriginal && metadata?.modifyDate) {
      logger.debug(`Comparing dateTimeOriginal ("${metadata.dateTimeOriginal}") with modifyDate ("${metadata.modifyDate}")`);
      try {
        const parseExifDate = (dateStr: string): number => {
          const normalized = String(dateStr).trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          return new Date(normalized).getTime();
        };

        const origTime = parseExifDate(metadata.dateTimeOriginal);
        const modTime = parseExifDate(metadata.modifyDate);
        if (!isNaN(origTime) && !isNaN(modTime)) {
          const diffHours = Math.abs(modTime - origTime) / (1000 * 60 * 60);
          logger.debug(`Calculated temporal discrepancy: ${diffHours.toFixed(1)} hours`);
          if (diffHours > 72) {
            const reason = `EXIF timestamp discrepancy of ${Math.round(diffHours)} hours between capture and modification.`;
            anomalyReasons.push(reason);
            logger.warn(`Timestamp anomaly detected: ${diffHours.toFixed(1)}h difference exceeds 72h threshold`);
          } else {
            logger.debug(`Timestamp discrepancy of ${diffHours.toFixed(1)}h within acceptable 72h window`);
          }
        } else {
          logger.debug('Could not parse one or both EXIF timestamps into valid dates');
        }
      } catch (err: any) {
        logger.error('Error calculating EXIF timestamp difference', {
          error: err?.message,
          code: err?.code,
          stack: err?.stack,
        });
      }
    } else {
      logger.debug('dateTimeOriginal or modifyDate missing; skipping temporal discrepancy check');
    }

    const exifTamperFlag = anomalyReasons.length > 0;
    const cameraDevice = [metadata?.make, metadata?.model].filter(Boolean).map(String).join(' ').trim();

    logger.info(`EXIF tampering scan completed: tampered=${exifTamperFlag}, cameraDevice="${cameraDevice || 'N/A'}", anomalies=${anomalyReasons.length}`);

    return {
      exifTamperFlag,
      softwareDetected,
      anomalyReasons,
      cameraDevice: cameraDevice || undefined,
      originalTimestamp: metadata?.dateTimeOriginal,
      digitizedTimestamp: metadata?.dateTimeDigitized,
    };
  }

  /**
   * Evaluates dispute lifecycle stage against PayPal HATEOAS rules and SLA deadlines
   * to produce dynamically valid action links and recommended arbitration steps.
   */
  evaluateHateoasMatrix(params: {
    disputeId: string;
    stage?: 'INQUIRY' | 'CLAIM' | 'CHARGEBACK' | 'PRE_ARBITRATION' | 'ARBITRATION' | 'RESOLVED';
    status?: string;
    disputeAmountCents: number;
    sellerResponseDueDate?: string;
    factors?: Partial<ForensicsFactors>;
  }): DisputeLifecycleHateoasMatrix {
    const stage = params.stage || 'INQUIRY';
    const disputeId = params.disputeId;
    const amountCents = params.disputeAmountCents;

    logger.info(`Evaluating HATEOAS matrix for disputeId=${disputeId}, stage=${stage}, amountCents=${amountCents}`);

    // Calculate SLA hours remaining
    let hoursUntilSlaExpiry: number | undefined;
    let slaBreachRisk: DisputeLifecycleHateoasMatrix['slaBreachRisk'] = 'LOW';

    if (params.sellerResponseDueDate) {
      const dueDate = new Date(params.sellerResponseDueDate).getTime();
      const now = Date.now();
      hoursUntilSlaExpiry = Math.max(0, Math.round((dueDate - now) / (1000 * 60 * 60)));
      logger.debug(`SLA Due date: ${params.sellerResponseDueDate}, hours remaining: ${hoursUntilSlaExpiry}`);

      if (hoursUntilSlaExpiry <= 0) {
        slaBreachRisk = 'CRITICAL_BREACH';
        logger.warn(`Dispute ${disputeId} SLA has expired: CRITICAL_BREACH`);
      } else if (hoursUntilSlaExpiry <= 20) {
        slaBreachRisk = 'HIGH';
        logger.warn(`Dispute ${disputeId} SLA < 20h remaining: HIGH risk`);
      } else if (hoursUntilSlaExpiry <= 72) {
        slaBreachRisk = 'MEDIUM';
        logger.debug(`Dispute ${disputeId} SLA <= 72h remaining: MEDIUM risk`);
      } else {
        logger.debug(`Dispute ${disputeId} SLA > 72h remaining: LOW risk`);
      }
    } else {
      logger.debug(`No sellerResponseDueDate specified for dispute ${disputeId}; breach risk defaults to LOW`);
    }

    // Default factors for matrix decision
    const fullFactors: ForensicsFactors = {
      defect_severity_score: params.factors?.defect_severity_score ?? 0.25,
      non_delivery_score: params.factors?.non_delivery_score ?? 0.0,
      policy_valid_score: params.factors?.policy_valid_score ?? 0.85,
      exif_tamper_flag: params.factors?.exif_tamper_flag ?? false,
      identity_match_score: params.factors?.identity_match_score ?? 0.9,
      buyer_dispute_velocity_score: params.factors?.buyer_dispute_velocity_score ?? 0.1,
      dispute_amount_cents: amountCents,
    };

    logger.debug(`Calculating liability & abuse matrix decision for dispute ${disputeId}`, sanitizeForLogging(fullFactors));
    const matrixDecision = defaultDisputeMatrixService.calculateLiabilityAndAbuse(fullFactors);

    const allowedActions: string[] = [];
    const links: HateoasActionLink[] = [];

    // Construct stage-specific HATEOAS links matching PayPal Disputes API
    if (stage === 'INQUIRY') {
      logger.debug(`Generating HATEOAS links for stage: INQUIRY`);
      allowedActions.push('send_message', 'make_offer', 'provide_evidence', 'escalate_to_claim');

      links.push({
        rel: 'send-message',
        href: `/api/disputes/${disputeId}/message`,
        method: 'POST',
        title: 'Send Buyer Message',
        description: 'Post a direct communication message into the PayPal dispute thread.',
      });

      links.push({
        rel: 'make-offer',
        href: `/api/disputes/${disputeId}/offer`,
        method: 'POST',
        title: 'Make Settlement Offer',
        description: 'Propose a partial refund or return compromise before claim escalation.',
        tierRequired: matrixDecision.selected_tier_action,
      });

      links.push({
        rel: 'provide-evidence',
        href: `/api/disputes/${disputeId}/evidence`,
        method: 'POST',
        title: 'Submit Evidence Dossier',
        description: 'Upload carrier tracking and defect bounding box analysis.',
      });

      links.push({
        rel: 'escalate',
        href: `/api/disputes/${disputeId}/escalate`,
        method: 'POST',
        title: 'Escalate to Formal Claim',
        description: 'Advance dispute from informal INQUIRY to formal PayPal CLAIM adjudication.',
      });
    } else if (stage === 'CLAIM') {
      logger.debug(`Generating HATEOAS links for stage: CLAIM`);
      allowedActions.push('accept_claim', 'make_offer', 'provide_evidence', 'appeal');

      links.push({
        rel: 'accept-claim',
        href: `/api/disputes/${disputeId}/accept`,
        method: 'POST',
        title: 'Accept Claim & Full Refund',
        description: 'Immediately concede claim and issue full refund from merchant balance.',
      });

      links.push({
        rel: 'make-offer',
        href: `/api/disputes/${disputeId}/offer`,
        method: 'POST',
        title: 'Propose Settlement Offer',
        description: 'Offer a partial refund amount without conceding liability.',
      });

      links.push({
        rel: 'provide-evidence',
        href: `/api/disputes/${disputeId}/evidence`,
        method: 'POST',
        title: 'Submit Adjudication Evidence',
        description: 'Transmit compiled PDF forensic dossier to PayPal resolution center.',
      });

      links.push({
        rel: 'appeal',
        href: `/api/disputes/${disputeId}/appeal`,
        method: 'POST',
        title: 'Submit Claim Appeal',
        description: 'Challenge preliminary adjudication with secondary proof.',
      });
    } else if (stage === 'CHARGEBACK') {
      logger.debug(`Generating HATEOAS links for stage: CHARGEBACK`);
      allowedActions.push('provide_evidence', 'accept_claim');

      links.push({
        rel: 'provide-evidence',
        href: `/api/disputes/${disputeId}/evidence`,
        method: 'POST',
        title: 'Submit Issuer Evidence',
        description: 'Provide proof of delivery and 3D Secure liability shift to issuing bank.',
      });

      links.push({
        rel: 'accept-claim',
        href: `/api/disputes/${disputeId}/accept`,
        method: 'POST',
        title: 'Accept Chargeback',
        description: 'Accept the bank chargeback to mitigate dispute arbitration fees.',
      });
    } else {
      logger.debug(`Generating HATEOAS links for terminal or other stage: ${stage}`);
      allowedActions.push('provide_evidence', 'view_dossier');
      links.push({
        rel: 'view-dossier',
        href: `/api/disputes/${disputeId}/dossier`,
        method: 'GET',
        title: 'View Forensic Dossier',
        description: 'Retrieve immutable arbitration ledger and PDF dossier record.',
      });
    }

    let recommendedAction = 'Review claim details';
    if (matrixDecision.selected_tier_action === 'TIER1_REFUND') {
      recommendedAction = 'Execute Tier 1 Instant Refund to prevent chargeback fees.';
    } else if (matrixDecision.selected_tier_action === 'TIER2_PARTIAL_OFFER') {
      recommendedAction = `Propose Tier 2 Partial Compromise Offer ($${((matrixDecision.partial_offer_amount_cents || 0) / 100).toFixed(2)}).`;
    } else if (matrixDecision.selected_tier_action === 'TIER3_RETURN_OFFER') {
      recommendedAction = 'Generate USPS/FedEx return label and condition refund on scan.';
    } else if (matrixDecision.selected_tier_action === 'TIER4_CONTEST_PDF') {
      recommendedAction = 'Transmit Tier 4 Compiled PDF Forensic Evidence Defense.';
    } else if (matrixDecision.selected_tier_action === 'TIER5_SLA_ESCALATE') {
      recommendedAction = 'Escalate to Senior Arbitration Analyst on Bryntum SLA Scheduler.';
    }

    logger.info(`HATEOAS evaluation complete for ${disputeId}: recommended="${recommendedAction}", actions=${allowedActions.join(', ')}`);

    return {
      disputeId,
      stage,
      status: params.status || 'UNDER_REVIEW',
      disputeAmountCents: amountCents,
      sellerResponseDueDate: params.sellerResponseDueDate,
      hoursUntilSlaExpiry,
      slaBreachRisk,
      allowedActions,
      links,
      recommendedAction,
      matrixDecision,
    };
  }

  /**
   * Computes pure TypeScript perceptual hash (dHash) and checks against existing dispute claim records.
   * Adheres strictly to Guardrail 1 (Zero C++ native binaries).
   */
  evaluateImagePerceptualDuplicate(
    buffer: Buffer | Uint8Array,
    knownRecords: KnownEvidenceRecord[] = [],
    hammingThreshold: number = 10
  ): PerceptualHashResult {
    logger.debug(`Evaluating perceptual duplicate on image buffer (${buffer.length} bytes) against ${knownRecords.length} records with threshold ${hammingThreshold}`);
    const result = evaluatePerceptualDuplicate(buffer, knownRecords, hammingThreshold);
    logger.info(`Perceptual duplicate check completed: is_duplicate=${result.is_duplicate}, matched_claim_id=${result.matched_claim_id || 'none'}, distance=${result.hamming_distance ?? 'N/A'}`);
    return result;
  }

  /**
   * Lost-in-Transit Fee Avoidance Guardrail:
   * When carrier telemetry confirms package was genuinely lost by the courier,
   * immediately accepts the claim via PayPal Disputes API to save the $15.00+ network penalty fee.
   */
  async handleLostInTransitFeeAvoidance(
    disputeId: string,
    carrierStatus: string
  ): Promise<{ handled: boolean; actionTaken: string; feeAvoided: boolean }> {
    logger.info(`Checking Lost-in-Transit Fee Avoidance for dispute ${disputeId} with carrier status: "${carrierStatus}"`);
    const isLost = carrierStatus.toUpperCase().includes('LOST') || carrierStatus.toUpperCase() === 'LOST_IN_TRANSIT';
    if (!isLost) {
      logger.debug(`Carrier status "${carrierStatus}" does not indicate lost shipment; skipping auto-acceptance`);
      return {
        handled: false,
        actionTaken: 'NO_ACTION_CARRIER_NOT_LOST',
        feeAvoided: false,
      };
    }

    logger.warn(`Carrier status confirmed LOST for dispute ${disputeId}; initiating automated claim concession`);
    try {
      await this.paypalClient.acceptDisputeClaim(
        disputeId,
        'Automated claim concession under Lost-in-Transit Fee Avoidance policy.'
      );
      logger.info(`Successfully accepted dispute claim ${disputeId} to avoid network dispute fee`);
      return {
        handled: true,
        actionTaken: 'CLAIM_ACCEPTED_FEE_AVOIDED',
        feeAvoided: true,
      };
    } catch (err: any) {
      logger.error(`Failed to accept dispute claim ${disputeId} for fee avoidance`, {
        error: err?.message,
        code: err?.code,
        stack: err?.stack,
      });
      throw err;
    }
  }

  /**
   * Post-Loss Delivered Revenue Recovery:
   * Scans a previously closed/lost dispute where carrier tracking subsequently flipped to DELIVERED.
   * Generates recovery demand record and settlement payload.
   */
  scanPostLossDeliveredRecovery(
    disputeId: string,
    buyerEmail: string,
    orderId: string,
    amountCents: number,
    latestTrackingStatus: string
  ): { recoveryEligible: boolean; demandLetter?: string; settlementPayload?: Record<string, any> } {
    logger.info(`Scanning post-loss delivery recovery for dispute ${disputeId}, order ${orderId}, status "${latestTrackingStatus}"`);
    const isDelivered = latestTrackingStatus.toUpperCase() === 'DELIVERED';
    if (!isDelivered) {
      logger.debug(`Tracking status "${latestTrackingStatus}" is not DELIVERED; not eligible for post-loss recovery`);
      return { recoveryEligible: false };
    }

    logger.info(`Shipment updated to DELIVERED post-dispute for order ${orderId}; generating recovery demand letter`);
    const demandLetter = [
      `POST-DISPUTE REVENUE RECOVERY DEMAND`,
      `To: ${buyerEmail}`,
      `Order: ${orderId} | Original Dispute: ${disputeId}`,
      `Our logistics telemetry confirms that shipment tracking for Order ${orderId} has updated to DELIVERED.`,
      `Because dispute settlement previously released funds while goods have now been successfully received,`,
      `a commercial recovery balance of $${(amountCents / 100).toFixed(2)} is outstanding.`,
      `Please remit settlement via PayPal to resolve your account standing.`,
    ].join('\n');

    return {
      recoveryEligible: true,
      demandLetter,
      settlementPayload: {
        dispute_id: disputeId,
        buyer_email: buyerEmail,
        order_id: orderId,
        amount_cents: amountCents,
        tracking_status: 'DELIVERED',
        settlement_link: `https://www.paypal.com/paypalme/merchant/${(amountCents / 100).toFixed(2)}USD`,
      },
    };
  }
}

export const defaultDisputeForensicsService = new DisputeForensicsService();
