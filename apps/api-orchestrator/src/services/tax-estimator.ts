/**
 * Tax Estimator Service
 * Calculates jurisdictional sales tax based on postal zip code in basis points (bps).
 * 1 basis point = 0.01% (e.g., 825 bps = 8.25%).
 */

import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:Financial').child('TaxEstimator');

export interface TaxEstimateResult {
  zip_code: string;
  state_code: string;
  tax_rate_bps: number; // in basis points (e.g. 825 = 8.25%)
  tax_rate_percentage: number; // e.g. 8.25
  tax_cents: number;
  subtotal_cents: number;
  taxable_subtotal_cents: number;
}

export class TaxEstimatorService {
  /**
   * Reference table of approximate state & local tax rates in basis points (bps) by 2-digit zip prefixes.
   * Zero sales tax states: OR (97), NH (03), DE (19), MT (59), AK (99 - no state tax, nominal local).
   */
  private static readonly REGIONAL_TAX_RATES_BPS: Record<string, { state: string; bps: number }> = {
    // California (90-96) ~ 8.25% - 9.75%
    '90': { state: 'CA', bps: 950 },
    '91': { state: 'CA', bps: 950 },
    '92': { state: 'CA', bps: 775 },
    '93': { state: 'CA', bps: 775 },
    '94': { state: 'CA', bps: 863 },
    '95': { state: 'CA', bps: 825 },
    '96': { state: 'CA', bps: 725 },

    // New York (10-14) ~ 8.00% - 8.875%
    '10': { state: 'NY', bps: 888 },
    '11': { state: 'NY', bps: 863 },
    '12': { state: 'NY', bps: 800 },
    '13': { state: 'NY', bps: 800 },
    '14': { state: 'NY', bps: 875 },

    // Texas (75-79) ~ 6.25% - 8.25%
    '75': { state: 'TX', bps: 825 },
    '76': { state: 'TX', bps: 825 },
    '77': { state: 'TX', bps: 825 },
    '78': { state: 'TX', bps: 825 },
    '79': { state: 'TX', bps: 825 },

    // Washington (98-99) ~ 6.5% - 10.25%
    '98': { state: 'WA', bps: 1025 },

    // Florida (32-34) ~ 6.0% - 7.5%
    '32': { state: 'FL', bps: 750 },
    '33': { state: 'FL', bps: 700 },
    '34': { state: 'FL', bps: 700 },

    // Illinois (60-62) ~ 6.25% - 10.25%
    '60': { state: 'IL', bps: 1025 },
    '61': { state: 'IL', bps: 850 },
    '62': { state: 'IL', bps: 725 },

    // Massachusetts (01-02) 6.25%
    '01': { state: 'MA', bps: 625 },
    '02': { state: 'MA', bps: 625 },

    // Oregon (97) - 0% sales tax
    '97': { state: 'OR', bps: 0 },

    // New Hampshire (03) - 0% sales tax
    '03': { state: 'NH', bps: 0 },

    // Delaware (19) - 0% sales tax
    '19': { state: 'DE', bps: 0 },

    // Montana (59) - 0% sales tax
    '59': { state: 'MT', bps: 0 },

    // Alaska (99) - 0% state sales tax
    '99': { state: 'AK', bps: 0 },
  };

  private defaultTaxBps: number;

  constructor(defaultTaxBps = 700) {
    // Default 7.00% if postal code is unknown or international
    this.defaultTaxBps = defaultTaxBps;
    logger.debug('TaxEstimatorService initialized', { defaultTaxBps });
  }

  /**
   * Resolves the tax rate in basis points for a given postal code.
   */
  resolveTaxRateBps(zipCode?: string | null): { state_code: string; tax_rate_bps: number } {
    logger.debug('Resolving tax rate basis points for ZIP code', { zipCode });

    if (!zipCode) {
      logger.info('Tax rate lookup: No ZIP code provided, falling back to US_DEFAULT', {
        state_code: 'US_DEFAULT',
        tax_rate_bps: this.defaultTaxBps,
      });
      return { state_code: 'US_DEFAULT', tax_rate_bps: this.defaultTaxBps };
    }

    const cleanZip = zipCode.trim().replace(/[^0-9]/g, '');
    if (cleanZip.length < 2) {
      logger.info('Tax rate lookup: ZIP code too short, falling back to US_DEFAULT', {
        zipCode,
        cleanZip,
        state_code: 'US_DEFAULT',
        tax_rate_bps: this.defaultTaxBps,
      });
      return { state_code: 'US_DEFAULT', tax_rate_bps: this.defaultTaxBps };
    }

    const prefix = cleanZip.substring(0, 2);
    const regionalMatch = TaxEstimatorService.REGIONAL_TAX_RATES_BPS[prefix];

    if (regionalMatch) {
      logger.info('Tax rate lookup: Regional table hit', {
        zipCode,
        cleanZip,
        prefix,
        state_code: regionalMatch.state,
        tax_rate_bps: regionalMatch.bps,
        tax_rate_percentage: Number((regionalMatch.bps / 100).toFixed(2)),
      });
      return {
        state_code: regionalMatch.state,
        tax_rate_bps: regionalMatch.bps,
      };
    }

    logger.info('Tax rate lookup: Regional table miss, falling back to US_DEFAULT', {
      zipCode,
      cleanZip,
      prefix,
      state_code: 'US_DEFAULT',
      tax_rate_bps: this.defaultTaxBps,
      tax_rate_percentage: Number((this.defaultTaxBps / 100).toFixed(2)),
    });
    return {
      state_code: 'US_DEFAULT',
      tax_rate_bps: this.defaultTaxBps,
    };
  }

  /**
   * Calculates tax amount in cents given a subtotal in cents and optional postal zip code.
   */
  calculateTax(subtotalCents: number, zipCode?: string | null): TaxEstimateResult {
    logger.debug('Calculating sales tax for basket subtotal', { subtotalCents, zipCode });
    const { state_code, tax_rate_bps } = this.resolveTaxRateBps(zipCode);
    const taxCents = Math.round((subtotalCents * tax_rate_bps) / 10000);
    const tax_rate_percentage = Number((tax_rate_bps / 100).toFixed(2));

    const result: TaxEstimateResult = {
      zip_code: zipCode || 'DEFAULT',
      state_code,
      tax_rate_bps,
      tax_rate_percentage,
      tax_cents: taxCents,
      subtotal_cents: subtotalCents,
      taxable_subtotal_cents: subtotalCents,
    };

    logger.info('Sales tax calculation complete', {
      subtotal_cents: subtotalCents,
      zip_code: result.zip_code,
      state_code: result.state_code,
      tax_rate_bps: result.tax_rate_bps,
      tax_rate_percentage: result.tax_rate_percentage,
      tax_cents: result.tax_cents,
      total_with_tax_cents: subtotalCents + taxCents,
    });

    return result;
  }
}

export const defaultTaxEstimator = new TaxEstimatorService();
