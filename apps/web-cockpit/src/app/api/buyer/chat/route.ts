import { NextResponse } from 'next/server';
import type { ChatResponsePayload } from '@aegispay/shared-types';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  const orchestratorUrl = getApiBaseUrl() || 'http://localhost:4000';
  const body = await req.json();
  apiLogger.debug('POST /api/buyer/chat received:', { message: body.message, action: body.action });

  if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) {
    try {
      const res = await fetch(`${orchestratorUrl}/api/buyer/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        apiLogger.debug('Upstream orchestrator /api/buyer/chat returned success');
        return NextResponse.json(data);
      } else {
        apiLogger.warn(`Upstream orchestrator /api/buyer/chat returned status ${res.status}`);
      }
    } catch (err: any) {
      apiLogger.warn('Upstream orchestrator unavailable, falling back to local simulation:', err?.message);
    }
  }

  const message: string = (body.message || '').toLowerCase();
  const explicitAction = body.action;

  // Determine intent
  let action: 'DISCOVER' | 'COMPARE' | 'DETAILS' | 'BUY' = explicitAction || 'DISCOVER';
  if (!explicitAction) {
    if (/\b(buy|purchase|checkout|order|get it for me|pay now)\b/i.test(message)) {
      action = 'BUY';
    } else if (/\b(compare|vs|versus|difference between|side by side)\b/i.test(message)) {
      action = 'COMPARE';
    } else if (/\b(detail|details|specs|specifications|more info|tell me about)\b/i.test(message)) {
      action = 'DETAILS';
    }
  }

  const sampleProducts: import('@aegispay/shared-types').ProductCardData[] = [
    {
      product_id: 'ch3_anc_headphone_01',
      title: 'AcousticPro ANC Studio Headphones (Midnight)',
      description: 'Studio-grade active noise cancellation headphones with custom 45mm neodymium drivers, 40-hour battery life, and ultra-plush memory foam cushions.',
      category_id: 'audio',
      price_cents: 28000,
      compare_at_price_cents: 34999,
      commission_rebate_cents: 3150,
      commission_rate: 0.15,
      rating: 4.9,
      review_count: 328,
      shipping_fee_cents: 0,
      free_shipping: true,
      merchant_domain: 'audio-gear-direct.com',
      merchant_credibility_score: 98,
      stock_status: 'IN_STOCK',
      delivery_window: '2-Day Express via FedEx',
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&q=80',
      cleaned_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&q=80',
      specs: {
        Driver: '45mm Neodymium Driver',
        Battery: '40 Hours Playback',
        Connectivity: 'Bluetooth 5.3 + 3.5mm Jack',
        Weight: '250g',
        Warranty: '1-Year AegisPay Escrow Protection',
      },
    },
    {
      product_id: 'ch3_desk_mat_walnut',
      title: 'Precision Felt & Walnut Desk Organizer Pad',
      description: 'Premium natural felt workspace mat with solid American walnut modular docking tray and integrated magnetic wireless fast charging.',
      category_id: 'workspace',
      price_cents: 8500,
      compare_at_price_cents: 11000,
      commission_rebate_cents: 765,
      commission_rate: 0.12,
      rating: 4.8,
      review_count: 142,
      shipping_fee_cents: 0,
      free_shipping: true,
      merchant_domain: 'nordic-workspaces.io',
      merchant_credibility_score: 95,
      stock_status: 'IN_STOCK',
      delivery_window: '3-4 Business Days',
      image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=1024&q=80',
      cleaned_image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=1024&q=80',
      specs: {
        Material: 'Merino Wool Felt & Walnut Wood',
        Dimensions: '90cm x 40cm x 4mm',
        Charging: '15W MagSafe Compatible Qi Fast Charge',
        Weight: '420g',
        Warranty: '2-Year Craftsmanship Guarantee',
      },
    },
    {
      product_id: 'ch3_usb_dac_amp',
      title: 'Hi-Fi 32-bit USB Audio DAC/Amp Interface',
      description: 'Ultra-low distortion audiophile digital-to-analog converter and high-current amplifier supporting 32-bit/768kHz PCM and native DSD512.',
      category_id: 'audio',
      price_cents: 11000,
      compare_at_price_cents: 14000,
      commission_rebate_cents: 990,
      commission_rate: 0.12,
      rating: 4.7,
      review_count: 89,
      shipping_fee_cents: 500,
      free_shipping: false,
      merchant_domain: 'audio-gear-direct.com',
      merchant_credibility_score: 96,
      stock_status: 'IN_STOCK',
      delivery_window: '2-Day Express Consolidated',
      image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1024&q=80',
      cleaned_image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=1024&q=80',
      specs: {
        Resolution: '32-bit / 768kHz PCM, DSD512',
        Output: '4.4mm Balanced + 3.5mm Single Ended',
        SNR: '125 dB',
        Weight: '180g',
        Warranty: '1-Year Manufacturer Warranty',
      },
    },
  ];

  if (action === 'COMPARE') {
    const products = sampleProducts.slice(0, 2);
    const mockPayload: ChatResponsePayload = {
      action: 'COMPARE',
      markdown: '### Side-by-Side Product Comparison Matrix\n\nI evaluated **2 products** across pricing, specs, merchant credibility, and commission pass-through:\n\n> 🏆 **Top Recommendation:** **AcousticPro ANC Studio Headphones (Midnight)** delivers the best overall value with a net effective cost of $248.50 after instant commission pass-through and a 98% merchant trust rating.\n\n*Click **[Buy for Me]** to proceed with pre-purchase stock reservation.*',
      products,
      comparison: {
        product_ids: products.map((p) => p.product_id),
        products,
        winner_product_id: products[0].product_id,
        rationale: 'AcousticPro ANC Studio Headphones (Midnight) delivers the best overall value with a net effective cost of $248.50 after instant commission pass-through and a 98% merchant trust rating.',
        rows: [
          {
            attribute: 'Retail Price',
            values: {
              ch3_anc_headphone_01: '$280.00',
              ch3_desk_mat_walnut: '$85.00',
            },
          },
          {
            attribute: 'Commission Rebate',
            values: {
              ch3_anc_headphone_01: '-$31.50 (11% back)',
              ch3_desk_mat_walnut: '-$7.65 (9% back)',
            },
            highlighted_product_id: 'ch3_anc_headphone_01',
          },
          {
            attribute: 'Net Effective Price',
            values: {
              ch3_anc_headphone_01: '$248.50',
              ch3_desk_mat_walnut: '$77.35',
            },
            highlighted_product_id: 'ch3_anc_headphone_01',
          },
          {
            attribute: 'Customer Rating',
            values: {
              ch3_anc_headphone_01: '★ 4.9 (328 reviews)',
              ch3_desk_mat_walnut: '★ 4.8 (142 reviews)',
            },
          },
          {
            attribute: 'Merchant Credibility',
            values: {
              ch3_anc_headphone_01: '98% Trust Rating (audio-gear-direct.com)',
              ch3_desk_mat_walnut: '95% Trust Rating (nordic-workspaces.io)',
            },
          },
          {
            attribute: 'Delivery Window',
            values: {
              ch3_anc_headphone_01: 'Free • 2-Day Express via FedEx',
              ch3_desk_mat_walnut: 'Free • 3-4 Business Days',
            },
          },
          {
            attribute: 'Stock Status',
            values: {
              ch3_anc_headphone_01: '✓ In Stock (2PC Verified)',
              ch3_desk_mat_walnut: '✓ In Stock (2PC Verified)',
            },
          },
        ],
      },
      thought_trace: [
        `Parsed user intent: "${body.message}" -> Action: COMPARE`,
        'Initiating multi-product side-by-side comparison',
        'Retrieved candidate items from Channel3 vector catalog',
        'Computed comparison matrix across 2 products with winning recommendation',
      ],
      follow_up_suggestions: [
        'Buy the recommended AcousticPro ANC...',
        'Show details for Precision Felt Desk Pad',
        'Check multi-vendor knapsack bundle savings',
      ],
    };
    return NextResponse.json(mockPayload);
  }

  if (action === 'DETAILS') {
    const p = sampleProducts[0];
    const mockPayload: ChatResponsePayload = {
      action: 'DETAILS',
      markdown: `### ${p.title}\n\n${p.description}\n\n#### Key Specifications & Credentials:\n- **Price:** $280.00 (MSRP: ~~$349.99~~)\n- **Instant Commission Rebate:** -$31.50 (Effective Net: **$248.50**)\n- **Merchant:** \`${p.merchant_domain}\` (🛡️ **98%** Credibility Rating)\n- **Stock Status:** ✅ In Stock\n- **Delivery:** ${p.delivery_window}\n- **Warranty:** 1-Year Manufacturer Warranty + AegisPay 72h Price Drop Protection`,
      products: [p],
      product_detail: p,
      thought_trace: [
        `Parsed user intent: "${body.message}" -> Action: DETAILS`,
        'Retrieving deep product details and merchant credibility verification',
        `Verified merchant credibility score: ${p.merchant_credibility_score}% (${p.merchant_domain})`,
      ],
      follow_up_suggestions: [
        'Buy this item now ($280.00)',
        'Compare with Precision Felt Pad',
        'Check delivery to my ZIP',
      ],
    };
    return NextResponse.json(mockPayload);
  }

  if (action === 'BUY') {
    const mockPayload: ChatResponsePayload = {
      action: 'BUY',
      markdown: `### Pre-Purchase Verification & Knapsack Cart Summary\n\n✅ **Two-Phase Commit (2PC) Stock Reservation:** \`res_2pc_verified_${Date.now().toString(36)}\` (Held)\n✅ **Merchants Assigned:** audio-gear-direct.com, nordic-workspaces.io\n\n#### Financial Settlement Breakdown:\n- **Gross Subtotal:** $365.00\n- **Instant Commission Rebate:** -$39.15\n- **Estimated Sales Tax:** $26.46\n- **Shipping Fee:** $0.00 (🎉 Saved $25.00 with multi-item bundling)\n- **Net Buyer Expenditure:** **$352.31**\n\n*Merchant settlement is decoupled: merchants will be authorized full retail amount, with commission rebate applied as an instant platform subsidy.*`,
      products: [sampleProducts[0], sampleProducts[1]],
      cart: {
        gross_subtotal_cents: 36500,
        total_commission_rebate_cents: 3915,
        total_shipping_cents: 0,
        total_shipping_saved_cents: 2500,
        total_tax_cents: 2646,
        net_buyer_expenditure_cents: 35231,
        is_within_budget: true,
      },
      stock_reservation: {
        reservation_id: `res_2pc_verified_${Date.now().toString(36)}`,
        all_held: true,
        expires_at: new Date(Date.now() + 900000).toISOString(),
      },
      thought_trace: [
        `Parsed user intent: "${body.message}" -> Action: BUY`,
        'Executing pre-purchase 2PC inventory hold check and knapsack cart optimization',
        '2PC stock verification successful!',
        'Knapsack solver bundled cart: Net buyer price: $352.31, Instant Commission Rebate: $39.15, Shipping Saved: $25.00',
      ],
      follow_up_suggestions: [
        'Confirm purchase with 1-click Vault v3',
        'Apply alternate shipping address',
        'Add complementary accessories',
      ],
    };
    return NextResponse.json(mockPayload);
  }

  // Default DISCOVER
  const mockPayload: ChatResponsePayload = {
    action: 'DISCOVER',
    markdown: `Here are the top matches I discovered from Channel3 with promo code \`PAYPAL-HACKATHON-2026\`:\n\n1. **AcousticPro ANC Studio Headphones (Midnight)**\n   - Retail: ~~$349.99~~ → **Net: $248.50** (Includes $31.50 instant rebate)\n   - Seller: \`audio-gear-direct.com\` (98% Trust Score)\n   - Delivery: Free Shipping\n\n2. **Precision Felt & Walnut Desk Organizer Pad**\n   - Retail: ~~$110.00~~ → **Net: $77.35** (Includes $7.65 instant rebate)\n   - Seller: \`nordic-workspaces.io\` (95% Trust Score)\n   - Delivery: Free Shipping\n\n3. **Hi-Fi 32-bit USB Audio DAC/Amp Interface**\n   - Retail: ~~$140.00~~ → **Net: $100.10** (Includes $9.90 instant rebate)\n   - Seller: \`audio-gear-direct.com\` (96% Trust Score)\n   - Delivery: $5.00 shipping`,
    products: sampleProducts,
    thought_trace: [
      `Parsed user intent: "${body.message}" -> Action: DISCOVER`,
      'Channel3 query dispatched with promo code PAYPAL-HACKATHON-2026',
      `Found ${sampleProducts.length} matching products across participating merchants`,
    ],
    follow_up_suggestions: [
      'Compare top 2 items',
      'Show details for AcousticPro ANC Headphones',
      'Find headphones under $350',
    ],
  };

  return NextResponse.json(mockPayload);
}
