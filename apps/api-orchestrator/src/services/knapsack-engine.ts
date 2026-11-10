import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultTaxEstimator } from './tax-estimator.js';
import { Channel3Offer, Channel3ProductDetail } from './channel3.client.js';

const logger = createLogger('API:Services:CatalogAndDisputes');

export interface RequiredShoppingItem {
  product_id: string;
  name?: string;
  quantity: number;
}

export interface CandidateOfferWithProduct {
  product: Channel3ProductDetail;
  offer: Channel3Offer;
  quantity: number;
}

export interface MerchantCartGroup {
  merchant_domain: string;
  items: Array<{
    product_id: string;
    title: string;
    quantity: number;
    unit_price_cents: number;
    unit_compare_price_cents: number;
    commission_rate: number;
    cleaned_url: string;
  }>;
  subtotal_cents: number;
  commission_rebate_cents: number;
  shipping_fee_cents: number;
  shipping_waived: boolean;
  merchant_anomaly_penalty_cents: number;
  tax_cents: number;
  tax_rate_bps: number;
  net_merchant_cents: number;
  merchant_retail_authorized_cents: number;
  platform_subsidy_cents: number;
}

export interface KnapsackOptimizationResult {
  assigned_merchants: MerchantCartGroup[];
  affiliate_attribution?: any;
  total_affiliate_rebate_cents?: number;
  gross_subtotal_cents: number;
  total_commission_rebate_cents: number;
  total_shipping_cents: number;
  total_shipping_saved_cents: number;
  total_tax_cents: number;
  net_buyer_expenditure_cents: number;
  total_merchant_authorized_cents: number;
  total_platform_subsidy_credit_cents: number;
  savings_percentage: number;
  is_within_budget: boolean;
  budget_cap_cents?: number;
  overage_percentage?: number;
  zip_code?: string;
  paypal_purchase_units: Array<{
    reference_id: string;
    custom_id: string;
    invoice_id: string;
    description: string;
    amount: {
      currency_code: string;
      value: string;
      breakdown: {
        item_total: { currency_code: string; value: string };
        shipping: { currency_code: string; value: string };
        tax_total: { currency_code: string; value: string };
        discount?: { currency_code: string; value: string };
      };
    };
    platform_subsidy_credit?: {
      currency_code: string;
      value: string;
      commission_rebate_cents: number;
      settlement_decoupled: boolean;
    };
    items: Array<{
      name: string;
      unit_amount: { currency_code: string; value: string };
      quantity: string;
      sku: string;
      category: 'PHYSICAL_GOODS';
    }>;
  }>;
}

export interface KnapsackOptions {
  alpha?: number;
  lambdaAnomaly?: number;
  budgetCapCents?: number;
  zipCode?: string;
  affiliate_attribution?: any;
}

export class KnapsackEngine {
  private alpha: number;
  private lambdaAnomaly: number;

  constructor(options?: KnapsackOptions) {
    this.alpha = options?.alpha ?? 0.75;
    this.lambdaAnomaly = options?.lambdaAnomaly ?? 5000;

    logger.debug('[KnapsackEngine] KnapsackEngine instantiated', {
      alpha: this.alpha,
      lambdaAnomaly: this.lambdaAnomaly,
    });
  }

  solve(
    products: Channel3ProductDetail[],
    requirements: RequiredShoppingItem[],
    options?: KnapsackOptions
  ): KnapsackOptimizationResult {
    const alpha = Math.max(0, Math.min(1, options?.alpha ?? this.alpha));
    const lambda = Math.max(0, options?.lambdaAnomaly ?? this.lambdaAnomaly);
    const budgetCap = options?.budgetCapCents !== undefined ? Math.max(0, options.budgetCapCents) : undefined;

    logger.info('[KnapsackEngine] Starting knapsack optimization', {
      productsCount: products?.length || 0,
      requirementsCount: requirements?.length || 0,
      alpha,
      lambdaAnomaly: lambda,
      budgetCapCents: budgetCap,
      zipCode: options?.zipCode,
    });

    if (!requirements || requirements.length === 0) {
      logger.error('[KnapsackEngine] Requirements list is empty');
      throw new Error('Requirements list cannot be empty.');
    }

    const candidateChoicesPerItem: CandidateOfferWithProduct[][] = [];

    for (const req of requirements) {
      if (!req.quantity || req.quantity <= 0 || !Number.isInteger(req.quantity)) {
        logger.error('[KnapsackEngine] Invalid item quantity', {
          productId: req.product_id,
          quantity: req.quantity,
        });
        throw new Error(`Invalid item quantity for product ${req.product_id}: quantity must be a positive integer.`);
      }

      const prod = products.find(p => p.product_id === req.product_id);
      if (!prod || !prod.offers || prod.offers.length === 0) {
        logger.error('[KnapsackEngine] Product has no available offers in catalog', {
          productId: req.product_id,
        });
        throw new Error(`Product ${req.product_id} has no available merchant offers in Channel3 catalog.`);
      }

      const availableOffers: CandidateOfferWithProduct[] = [];
      let outOfStockCount = 0;

      for (const offer of prod.offers) {
        if (offer.stock_status === 'OUT_OF_STOCK') {
          outOfStockCount++;
          continue;
        }

        if (offer.price === undefined || offer.price < 0 || !Number.isFinite(offer.price)) {
          logger.error('[KnapsackEngine] Invalid offer price detected', {
            productId: req.product_id,
            merchantDomain: offer.domain,
            price: offer.price,
          });
          throw new Error(`Invalid offer price for product ${req.product_id} from ${offer.domain}: price cannot be negative.`);
        }

        const sanitizedOffer: Channel3Offer = {
          ...offer,
          price: Math.round(offer.price),
          compare_at_price: Math.max(0, Math.round(offer.compare_at_price ?? offer.price)),
          max_commission_rate: Math.max(0, Math.min(1, offer.max_commission_rate ?? 0)),
          shipping_fee_cents: Math.max(0, Math.round(offer.shipping_fee_cents ?? 1000)),
          shipping_waiver_threshold_cents: Math.max(0, Math.round(offer.shipping_waiver_threshold_cents ?? 50000)),
          merchant_anomaly_score: Math.max(0, Math.min(1, offer.merchant_anomaly_score ?? 0)),
        };

        availableOffers.push({
          product: prod,
          offer: sanitizedOffer,
          quantity: req.quantity,
        });
      }

      logger.debug('[KnapsackEngine] Candidate offers evaluated for requirement', {
        productId: req.product_id,
        availableCount: availableOffers.length,
        outOfStockCount,
      });

      if (availableOffers.length === 0) {
        logger.error('[KnapsackEngine] Product out of stock across all merchants', {
          productId: req.product_id,
        });
        throw new Error(`Product ${req.product_id} is out of stock across all merchants.`);
      }

      availableOffers.sort((a, b) => {
        const netA = a.offer.price * a.quantity * (1 - a.offer.max_commission_rate * alpha);
        const netB = b.offer.price * b.quantity * (1 - b.offer.max_commission_rate * alpha);
        return netA - netB;
      });

      candidateChoicesPerItem.push(availableOffers);
    }

    let bestAssignment: CandidateOfferWithProduct[] | null = null;
    let minNetCost = Infinity;

    const suffixMinNetCost = new Array<number>(candidateChoicesPerItem.length + 1).fill(0);
    for (let i = candidateChoicesPerItem.length - 1; i >= 0; i--) {
      const minChoiceCost = Math.min(
        ...candidateChoicesPerItem[i].map(c =>
          c.offer.price * c.quantity * (1 - c.offer.max_commission_rate * alpha)
        )
      );
      suffixMinNetCost[i] = suffixMinNetCost[i + 1] + minChoiceCost;
    }

    logger.debug('[KnapsackEngine] Suffix min net costs computed for branch-and-bound pruning', {
      suffixMinNetCost,
    });

    const evaluateCombination = (combination: CandidateOfferWithProduct[]): number => {
      const merchantSpendMap = new Map<string, {
        subtotal: number;
        rebate: number;
        shippingFee: number;
        waiverThreshold: number;
        anomalyScore: number;
      }>();

      for (const item of combination) {
        const domain = item.offer.domain;
        const price = item.offer.price * item.quantity;
        const rebate = Math.round(price * item.offer.max_commission_rate * alpha);
        const shippingFee = item.offer.shipping_fee_cents ?? 1000;
        const waiverThreshold = item.offer.shipping_waiver_threshold_cents ?? 50000;
        const anomalyScore = item.offer.merchant_anomaly_score ?? 0;

        const current = merchantSpendMap.get(domain) || {
          subtotal: 0,
          rebate: 0,
          shippingFee,
          waiverThreshold,
          anomalyScore,
        };

        current.subtotal += price;
        current.rebate += rebate;
        current.shippingFee = Math.max(current.shippingFee, shippingFee);
        current.anomalyScore = Math.max(current.anomalyScore, anomalyScore);
        merchantSpendMap.set(domain, current);
      }

      let netTotal = 0;
      for (const [, m] of merchantSpendMap.entries()) {
        const effectiveShipping = m.subtotal >= m.waiverThreshold ? 0 : m.shippingFee;
        const anomalyPenalty = Math.round(m.anomalyScore * lambda);
        netTotal += (m.subtotal - m.rebate + effectiveShipping + anomalyPenalty);
      }

      return netTotal;
    };

    let prunedBranchesCount = 0;
    let evaluatedCombinationsCount = 0;

    if (candidateChoicesPerItem.length === 1) {
      logger.debug('[KnapsackEngine] Single requirement detected; evaluating candidate choices directly');
      for (const candidate of candidateChoicesPerItem[0]) {
        evaluatedCombinationsCount++;
        const netCost = evaluateCombination([candidate]);
        if (netCost < minNetCost) {
          logger.debug('[KnapsackEngine] Found new best assignment (single item)', {
            candidateMerchant: candidate.offer.domain,
            netCost,
            prevMinCost: minNetCost === Infinity ? 'Infinity' : minNetCost,
          });
          minNetCost = netCost;
          bestAssignment = [candidate];
        }
      }
    } else {
      logger.debug('[KnapsackEngine] Multi-requirement branch-and-bound search initiated', {
        slotCount: candidateChoicesPerItem.length,
      });

      const currentChoice: CandidateOfferWithProduct[] = [];

      const search = (slotIndex: number, currentSpendEstimate: number) => {
        if (slotIndex === candidateChoicesPerItem.length) {
          evaluatedCombinationsCount++;
          const netCost = evaluateCombination(currentChoice);
          if (netCost < minNetCost) {
            logger.debug('[KnapsackEngine] Found improved assignment combination', {
              netCost,
              previousMinCost: minNetCost === Infinity ? 'Infinity' : minNetCost,
            });
            minNetCost = netCost;
            bestAssignment = [...currentChoice];
          }
          return;
        }

        if (currentSpendEstimate + suffixMinNetCost[slotIndex] >= minNetCost) {
          prunedBranchesCount++;
          return;
        }

        for (const candidate of candidateChoicesPerItem[slotIndex]) {
          const candidateNetCost = candidate.offer.price * candidate.quantity * (1 - candidate.offer.max_commission_rate * alpha);
          currentChoice.push(candidate);
          search(slotIndex + 1, currentSpendEstimate + candidateNetCost);
          currentChoice.pop();
        }
      };

      search(0, 0);
    }

    logger.info('[KnapsackEngine] Optimization search completed', {
      evaluatedCombinationsCount,
      prunedBranchesCount,
      minNetCost,
    });

    if (!bestAssignment) {
      logger.error('[KnapsackEngine] Failed to compute optimal cart assignment');
      throw new Error('Failed to compute optimal cart assignment.');
    }

    const merchantGroups = new Map<string, MerchantCartGroup>();

    for (const choice of (bestAssignment as CandidateOfferWithProduct[])) {
      const domain = choice.offer.domain;
      const priceCents = choice.offer.price * choice.quantity;
      const comparePriceCents = choice.offer.compare_at_price * choice.quantity;
      const rebateCents = Math.round(priceCents * choice.offer.max_commission_rate * alpha);

      if (!merchantGroups.has(domain)) {
        merchantGroups.set(domain, {
          merchant_domain: domain,
          items: [],
          subtotal_cents: 0,
          commission_rebate_cents: 0,
          shipping_fee_cents: choice.offer.shipping_fee_cents ?? 1000,
          shipping_waived: false,
          merchant_anomaly_penalty_cents: Math.round((choice.offer.merchant_anomaly_score ?? 0) * lambda),
          tax_cents: 0,
          tax_rate_bps: 0,
          net_merchant_cents: 0,
          merchant_retail_authorized_cents: 0,
          platform_subsidy_cents: 0,
        });
      }

      const group = merchantGroups.get(domain)!;
      group.items.push({
        product_id: choice.product.product_id,
        title: choice.product.title,
        quantity: choice.quantity,
        unit_price_cents: choice.offer.price,
        unit_compare_price_cents: choice.offer.compare_at_price,
        commission_rate: choice.offer.max_commission_rate,
        cleaned_url: choice.product.images[0]?.cleaned_url || choice.product.images[0]?.url || '',
      });
      group.subtotal_cents += priceCents;
      group.commission_rebate_cents += rebateCents;

      const waiverThreshold = choice.offer.shipping_waiver_threshold_cents ?? 50000;
      if (group.subtotal_cents >= waiverThreshold) {
        group.shipping_waived = true;
      }
    }

    let grossSubtotal = 0;
    let totalRebate = 0;
    let totalShipping = 0;
    let totalShippingSaved = 0;
    let totalTax = 0;
    let totalMerchantAuthorized = 0;

    const assignedMerchants: MerchantCartGroup[] = [];
    for (const group of merchantGroups.values()) {
      if (group.shipping_waived) {
        totalShippingSaved += group.shipping_fee_cents;
        logger.debug('[KnapsackEngine] Shipping fee waived for merchant group', {
          merchantDomain: group.merchant_domain,
          subtotalCents: group.subtotal_cents,
          savedShippingCents: group.shipping_fee_cents,
        });
        group.shipping_fee_cents = 0;
      } else {
        totalShipping += group.shipping_fee_cents;
        logger.debug('[KnapsackEngine] Standard shipping applied for merchant group', {
          merchantDomain: group.merchant_domain,
          shippingFeeCents: group.shipping_fee_cents,
        });
      }

      const taxRes = defaultTaxEstimator.calculateTax(group.subtotal_cents, options?.zipCode);
      group.tax_cents = taxRes.tax_cents;
      group.tax_rate_bps = taxRes.tax_rate_bps;
      totalTax += group.tax_cents;

      group.merchant_retail_authorized_cents = group.subtotal_cents + group.shipping_fee_cents + group.tax_cents;
      group.platform_subsidy_cents = group.commission_rebate_cents;
      group.net_merchant_cents = group.merchant_retail_authorized_cents - group.platform_subsidy_cents;

      grossSubtotal += group.subtotal_cents;
      totalRebate += group.commission_rebate_cents;
      totalMerchantAuthorized += group.merchant_retail_authorized_cents;
      assignedMerchants.push(group);
    }

    const netBuyerExpenditure = grossSubtotal - totalRebate + totalShipping + totalTax;
    const retailTotal = assignedMerchants.reduce(
      (acc, g) => acc + g.items.reduce((iAcc, item) => iAcc + item.unit_compare_price_cents * item.quantity, 0),
      0
    );
    const savingsPercentage = retailTotal > 0
      ? Number((((retailTotal - netBuyerExpenditure) / retailTotal) * 100).toFixed(2))
      : 0;

    let isWithinBudget = true;
    let overagePercentage = 0;

    if (budgetCap !== undefined && budgetCap > 0) {
      if (netBuyerExpenditure > budgetCap) {
        isWithinBudget = false;
        overagePercentage = Number((((netBuyerExpenditure - budgetCap) / budgetCap) * 100).toFixed(2));
        logger.warn('[KnapsackEngine] Net buyer expenditure exceeds budget cap', {
          netBuyerExpenditure,
          budgetCap,
          overagePercentage,
        });
      } else {
        logger.info('[KnapsackEngine] Net buyer expenditure is within budget cap', {
          netBuyerExpenditure,
          budgetCap,
        });
      }
    }

    logger.debug('[KnapsackEngine] Constructing PayPal Orders v2 multi-purchase units');
    const paypalPurchaseUnits = assignedMerchants.map((merchant, idx) => {
      const itemTotalVal = (merchant.subtotal_cents / 100).toFixed(2);
      const shippingVal = (merchant.shipping_fee_cents / 100).toFixed(2);
      const taxVal = (merchant.tax_cents / 100).toFixed(2);
      const authorizedVal = (merchant.merchant_retail_authorized_cents / 100).toFixed(2);
      const subsidyVal = (merchant.platform_subsidy_cents / 100).toFixed(2);
      const invoiceSuffix = crypto.randomUUID().slice(0, 8);

      return {
        reference_id: `PU_${merchant.merchant_domain.replace(/[^a-zA-Z0-9]/g, '_')}_${idx + 1}`,
        custom_id: `merchant:${merchant.merchant_domain}`,
        invoice_id: `INV-${Date.now()}-${invoiceSuffix}`,
        description: `Autonomous settlement for ${merchant.items.length} items from ${merchant.merchant_domain}`,
        amount: {
          currency_code: 'USD',
          value: authorizedVal,
          breakdown: {
            item_total: { currency_code: 'USD', value: itemTotalVal },
            shipping: { currency_code: 'USD', value: shippingVal },
            tax_total: { currency_code: 'USD', value: taxVal },
          },
        },
        platform_subsidy_credit: {
          currency_code: 'USD',
          value: subsidyVal,
          commission_rebate_cents: merchant.platform_subsidy_cents,
          settlement_decoupled: true,
        },
        items: merchant.items.map(it => ({
          name: it.title.substring(0, 127),
          unit_amount: {
            currency_code: 'USD',
            value: (it.unit_price_cents / 100).toFixed(2),
          },
          quantity: it.quantity.toString(),
          sku: it.product_id,
          category: 'PHYSICAL_GOODS' as const,
        })),
      };
    });

    const optimizationResult: KnapsackOptimizationResult = {
      assigned_merchants: assignedMerchants,
      gross_subtotal_cents: grossSubtotal,
      total_commission_rebate_cents: totalRebate,
      total_shipping_cents: totalShipping,
      total_shipping_saved_cents: totalShippingSaved,
      total_tax_cents: totalTax,
      net_buyer_expenditure_cents: netBuyerExpenditure,
      total_merchant_authorized_cents: totalMerchantAuthorized,
      total_platform_subsidy_credit_cents: totalRebate,
      savings_percentage: savingsPercentage,
      is_within_budget: isWithinBudget,
      budget_cap_cents: budgetCap,
      overage_percentage: overagePercentage,
      zip_code: options?.zipCode,
      paypal_purchase_units: paypalPurchaseUnits,
    };

    logger.info('[KnapsackEngine] Knapsack optimization solved successfully', {
      assignedVendorsCount: assignedMerchants.length,
      grossSubtotalCents: grossSubtotal,
      netBuyerExpenditureCents: netBuyerExpenditure,
      savingsPercentage,
      isWithinBudget,
      overagePercentage,
    });

    return optimizationResult;
  }
}

export const CartSolver = KnapsackEngine;
export const defaultKnapsackEngine = new KnapsackEngine();
export const defaultCartSolver = defaultKnapsackEngine;
