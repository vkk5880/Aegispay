import { ForensicsFactors, DisputeMatrixDecision, defaultDisputeMatrixService } from './dispute-matrix.js';
import { defaultPayPalClient, PayPalApimaticClient } from './paypal-apimatic.js';
import { evaluatePerceptualDuplicate, KnownEvidenceRecord } from './image-hasher.js';
import { PerceptualHashResult } from '@aegispay/shared-types';

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
    let ymin: number, xmin: number, ymax: number, xmax: number;

    if (Array.isArray(box)) {
      [ymin, xmin, ymax, xmax] = box;
    } else if (box && typeof box === 'object') {
      ymin = box.ymin;
      xmin = box.xmin;
      ymax = box.ymax;
      xmax = box.xmax;
    } else {
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
    // Checkpoint 6.1 Bounded Forensic Processing: Enforce 10 MB payload limit on evidence buffers
    const MAX_FORENSIC_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB
    if (metadata?.rawBuffer && metadata.rawBuffer.length > MAX_FORENSIC_BUFFER_BYTES) {
      throw new Error(`Evidence buffer exceeds maximum forensic limit of 10 MB (${metadata.rawBuffer.length} bytes)`);
    }

    const anomalyReasons: string[] = [];
    let softwareDetected: string | undefined;

    const rawSoftware = metadata?.software ? String(metadata.software).trim() : '';
    const softwareLower = rawSoftware.toLowerCase();

    // 1. Scan software string against known manipulation software
    if (softwareLower) {
      for (const signature of KNOWN_EDITING_SIGNATURES) {
        if (softwareLower.includes(signature)) {
          softwareDetected = rawSoftware;
          anomalyReasons.push(`Image edited with third-party graphics tool: "${rawSoftware}"`);
          break;
        }
      }
    }

    // 2. Scan raw buffer for ASCII signatures if provided and not yet detected
    if (!softwareDetected && metadata?.rawBuffer && metadata.rawBuffer.length > 0) {
      try {
        const bufferString = Buffer.from(metadata.rawBuffer).toString('binary').toLowerCase();
        for (const signature of KNOWN_EDITING_SIGNATURES) {
          if (bufferString.includes(signature)) {
            softwareDetected = signature;
            anomalyReasons.push(`Binary buffer contains metadata signature for: "${signature}"`);
            break;
          }
        }
      } catch {
        // Safe fallback on buffer decoding
      }
    }

    // 3. Temporal discrepancy check between capture and digitization/modification
    if (metadata?.dateTimeOriginal && metadata?.modifyDate) {
      try {
        const parseExifDate = (dateStr: string): number => {
          const normalized = String(dateStr).trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
          return new Date(normalized).getTime();
        };

        const origTime = parseExifDate(metadata.dateTimeOriginal);
        const modTime = parseExifDate(metadata.modifyDate);
        if (!isNaN(origTime) && !isNaN(modTime)) {
          const diffHours = Math.abs(modTime - origTime) / (1000 * 60 * 60);
          if (diffHours > 72) {
            anomalyReasons.push(`EXIF timestamp discrepancy of ${Math.round(diffHours)} hours between capture and modification.`);
          }
        }
      } catch {
        // Fallback for non-standard date strings
      }
    }

    const exifTamperFlag = anomalyReasons.length > 0;
    const cameraDevice = [metadata?.make, metadata?.model].filter(Boolean).map(String).join(' ').trim();

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

    // Calculate SLA hours remaining
    let hoursUntilSlaExpiry: number | undefined;
    let slaBreachRisk: DisputeLifecycleHateoasMatrix['slaBreachRisk'] = 'LOW';

    if (params.sellerResponseDueDate) {
      const dueDate = new Date(params.sellerResponseDueDate).getTime();
      const now = Date.now();
      hoursUntilSlaExpiry = Math.max(0, Math.round((dueDate - now) / (1000 * 60 * 60)));

      if (hoursUntilSlaExpiry <= 0) {
        slaBreachRisk = 'CRITICAL_BREACH';
      } else if (hoursUntilSlaExpiry <= 20) {
        // Pre-chargeback 20-hour alert window per disputes-refunds.md
        slaBreachRisk = 'HIGH';
      } else if (hoursUntilSlaExpiry <= 72) {
        slaBreachRisk = 'MEDIUM';
      }
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

    const matrixDecision = defaultDisputeMatrixService.calculateLiabilityAndAbuse(fullFactors);

    const allowedActions: string[] = [];
    const links: HateoasActionLink[] = [];

    // Construct stage-specific HATEOAS links matching PayPal Disputes API
    if (stage === 'INQUIRY') {
      // INQUIRY: up to 20 days. Parties resolve directly before PayPal adjudication.
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
      // CLAIM: PayPal adjudicates.
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
      // CHARGEBACK: external bank / card issuer dispute.
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
    return evaluatePerceptualDuplicate(buffer, knownRecords, hammingThreshold);
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
    const isLost = carrierStatus.toUpperCase().includes('LOST') || carrierStatus.toUpperCase() === 'LOST_IN_TRANSIT';
    if (!isLost) {
      return {
        handled: false,
        actionTaken: 'NO_ACTION_CARRIER_NOT_LOST',
        feeAvoided: false,
      };
    }

    await this.paypalClient.acceptDisputeClaim(
      disputeId,
      'Automated claim concession under Lost-in-Transit Fee Avoidance policy.'
    );

    return {
      handled: true,
      actionTaken: 'CLAIM_ACCEPTED_FEE_AVOIDED',
      feeAvoided: true,
    };
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
    const isDelivered = latestTrackingStatus.toUpperCase() === 'DELIVERED';
    if (!isDelivered) {
      return { recoveryEligible: false };
    }

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
