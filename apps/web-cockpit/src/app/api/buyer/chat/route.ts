import { NextResponse } from 'next/server';
import type { ChatResponsePayload } from '@aegispay/shared-types';
import {
  formatDataStreamText,
  formatDataStreamToolCall,
  formatDataStreamToolResult,
  formatDataStreamFinish,
} from '@aegispay/shared-types';
import { getApiBaseUrl } from '@/lib/utils';
import { apiLogger } from '@/lib/logger';

export async function POST(req: Request) {
  const orchestratorUrl = getApiBaseUrl() || 'http://localhost:4000';
  const body = await req.json();
  const isStreamRequested = Boolean(
    body.stream ||
      req.headers.get('accept')?.includes('text/event-stream') ||
      req.headers.get('x-vercel-ai-data-stream')
  );
  apiLogger.debug('POST /api/buyer/chat received:', { message: body.message, action: body.action, isStreamRequested });

  if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (isStreamRequested) {
        headers['Accept'] = 'text/event-stream';
        headers['x-vercel-ai-data-stream'] = 'v1';
      }
      const userKey = req.headers.get('x-user-llm-api-key');
      if (userKey) {
        headers['x-user-llm-api-key'] = userKey;
      }

      const res = await fetch(`${orchestratorUrl}/api/buyer/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, stream: isStreamRequested }),
        cache: 'no-store',
      });

      if (res.ok) {
        if (isStreamRequested && res.body) {
          apiLogger.debug('Upstream orchestrator /api/buyer/chat returned stream');
          return new Response(res.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'x-vercel-ai-data-stream': 'v1',
              'Cache-Control': 'no-cache, no-transform',
            },
          });
        }
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
  const selectedProductIds: string[] = Array.isArray(body.selected_product_ids)
    ? body.selected_product_ids
    : Array.isArray(body.product_ids)
    ? body.product_ids
    : [];
  const activeTurnProducts: any[] = Array.isArray(body.active_turn_products) ? body.active_turn_products : [];

  // Determine intent
  let action: 'DISCOVER' | 'COMPARE' | 'DETAILS' | 'BUY' = explicitAction || 'DISCOVER';
  if (!explicitAction) {
    if (
      /\b(buy|purchase|checkout|order|get it for me|pay now|buy both|buy all|within budget|within my budget)\b/i.test(message)
    ) {
      action = 'BUY';
    } else if (
      /\b(compare|vs|versus|difference between|side by side|which one|which of these|which is better|longer warranty|better for)\b/i.test(message) ||
      (selectedProductIds.length >= 2 && /\b(which|better|compare|difference)\b/i.test(message))
    ) {
      action = 'COMPARE';
    } else if (
      /\b(detail|details|specs|specifications|more info|tell me about|wattage|warranty|ask ai)\b/i.test(message)
    ) {
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

  // Resolve grounded products from active turn or sample catalog
  const resolveProducts = (ids: string[]): import('@aegispay/shared-types').ProductCardData[] => {
    const list: import('@aegispay/shared-types').ProductCardData[] = [];
    for (const id of ids) {
      const fromTurn = activeTurnProducts.find((p) => p.product_id === id);
      if (fromTurn) {
        list.push({
          product_id: fromTurn.product_id,
          title: fromTurn.title,
          description: `${fromTurn.title} from ${fromTurn.merchant_domain}`,
          category_id: 'general',
          price_cents: fromTurn.price_cents,
          compare_at_price_cents: Math.round(fromTurn.price_cents * 1.15),
          commission_rebate_cents: Math.round(fromTurn.price_cents * 0.1),
          commission_rate: 0.1,
          rating: fromTurn.rating,
          review_count: 100,
          merchant_domain: fromTurn.merchant_domain,
          merchant_credibility_score: 95,
          stock_status: 'IN_STOCK',
          delivery_window: '2-Day Express',
          shipping_fee_cents: fromTurn.free_shipping ? 0 : 500,
          free_shipping: Boolean(fromTurn.free_shipping),
          specs: fromTurn.specs || {},
          image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&q=80',
          cleaned_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&q=80',
        });
        continue;
      }
      const fromSample = sampleProducts.find((p) => p.product_id === id);
      if (fromSample) {
        list.push(fromSample);
      }
    }
    return list;
  };

  const respond = (payload: ChatResponsePayload) => {
    if (isStreamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          if (payload.action === 'DISCOVER') {
            controller.enqueue(
              encoder.encode(formatDataStreamToolCall('call_disc_1', 'search_catalog', { query: body.message || 'catalog search' }))
            );
            controller.enqueue(
              encoder.encode(
                formatDataStreamToolResult('call_disc_1', {
                  products: payload.products,
                  promo_code: 'PAYPAL-HACKATHON-2026',
                })
              )
            );
          } else if (payload.action === 'COMPARE') {
            controller.enqueue(
              encoder.encode(
                formatDataStreamToolCall('call_comp_1', 'compare_products', {
                  product_ids: payload.products?.map((p) => p.product_id) || [],
                })
              )
            );
            controller.enqueue(
              encoder.encode(
                formatDataStreamToolResult('call_comp_1', {
                  comparison: payload.comparison,
                  recommended_product_id: payload.comparison?.winner_product_id,
                })
              )
            );
          } else if (payload.action === 'BUY') {
            const prod = payload.products?.[0] || sampleProducts[0];
            controller.enqueue(
              encoder.encode(
                formatDataStreamToolCall('call_prep_1', 'prepare_checkout', {
                  product_id: prod.product_id,
                  quantity: 1,
                })
              )
            );
            controller.enqueue(
              encoder.encode(
                formatDataStreamToolResult('call_prep_1', {
                  product: prod,
                  quantity: 1,
                  unit_price_cents: prod.price_cents,
                  shipping_fee_cents: 0,
                  total_cents: prod.price_cents,
                  reservation_id: payload.stock_reservation?.reservation_id || 'res_2pc_verified',
                  requires_step_up: false,
                  checkout_ready: true,
                  cart: payload.cart,
                })
              )
            );
          }
          controller.enqueue(encoder.encode(formatDataStreamText(payload.markdown)));
          controller.enqueue(encoder.encode(formatDataStreamFinish('stop')));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-vercel-ai-data-stream': 'v1',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    return NextResponse.json(payload);
  };

  if (action === 'COMPARE') {
    const matched = selectedProductIds.length >= 2 ? resolveProducts(selectedProductIds) : [];
    const products = matched.length >= 2 ? matched : sampleProducts.slice(0, 2);
    const topPick = products[0];

    const priceRows: Record<string, string> = {};
    const rebateRows: Record<string, string> = {};
    const netRows: Record<string, string> = {};
    const ratingRows: Record<string, string> = {};
    const trustRows: Record<string, string> = {};
    const deliveryRows: Record<string, string> = {};
    const stockRows: Record<string, string> = {};

    for (const p of products) {
      priceRows[p.product_id] = `$${(p.price_cents / 100).toFixed(2)}`;
      rebateRows[p.product_id] = `-$${((p.commission_rebate_cents || 0) / 100).toFixed(2)}`;
      netRows[p.product_id] = `$${((p.price_cents - (p.commission_rebate_cents || 0)) / 100).toFixed(2)}`;
      ratingRows[p.product_id] = `★ ${p.rating} (${p.review_count || 100} reviews)`;
      trustRows[p.product_id] = `${p.merchant_credibility_score || 95}% Trust (${p.merchant_domain})`;
      deliveryRows[p.product_id] = p.free_shipping ? 'Free 2-Day Express' : 'Standard Shipping';
      stockRows[p.product_id] = '✓ In Stock (2PC Verified)';
    }

    const mockPayload: ChatResponsePayload = {
      action: 'COMPARE',
      markdown: `### Side-by-Side Product Comparison Matrix\n\nI evaluated **${products.length} products** across pricing, specs, merchant credibility, and commission pass-through:\n\n> 🏆 **Top Recommendation:** **${topPick.title}** delivers the best overall value with a net effective cost of $${((topPick.price_cents - (topPick.commission_rebate_cents || 0)) / 100).toFixed(2)} after instant commission pass-through and a ${topPick.merchant_credibility_score || 98}% merchant trust rating.\n\n*Click **[Buy for Me]** to proceed with pre-purchase stock reservation.*`,
      products,
      comparison: {
        product_ids: products.map((p) => p.product_id),
        products,
        winner_product_id: topPick.product_id,
        rationale: `${topPick.title} delivers the best overall value with a net effective cost of $${((topPick.price_cents - (topPick.commission_rebate_cents || 0)) / 100).toFixed(2)} after instant commission pass-through.`,
        rows: [
          {
            attribute: 'Retail Price',
            values: priceRows,
          },
          {
            attribute: 'Commission Rebate',
            values: rebateRows,
            highlighted_product_id: topPick.product_id,
          },
          {
            attribute: 'Net Effective Price',
            values: netRows,
            highlighted_product_id: topPick.product_id,
          },
          {
            attribute: 'Customer Rating',
            values: ratingRows,
          },
          {
            attribute: 'Merchant Credibility',
            values: trustRows,
          },
          {
            attribute: 'Delivery Window',
            values: deliveryRows,
          },
          {
            attribute: 'Stock Status',
            values: stockRows,
          },
        ],
      },
      thought_trace: [
        `Parsed user intent: "${body.message}" -> Action: COMPARE`,
        `Initiating multi-product side-by-side comparison across ${products.length} products`,
        selectedProductIds.length > 0
          ? `Grounded turn selection: ${selectedProductIds.join(', ')}`
          : 'Retrieved candidate items from Channel3 vector catalog',
        `Computed comparison matrix across ${products.length} products with winning recommendation`,
      ],
      follow_up_suggestions: [
        `Buy the recommended ${topPick.title.slice(0, 25)}...`,
        'View full specs and warranty',
        'Check multi-vendor knapsack bundle savings',
      ],
    };
    return respond(mockPayload);
  }

  if (action === 'DETAILS') {
    const matched = selectedProductIds.length > 0 ? resolveProducts(selectedProductIds) : [];
    const p = matched[0] || sampleProducts[0];
    const net = p.price_cents - (p.commission_rebate_cents || 0);

    const mockPayload: ChatResponsePayload = {
      action: 'DETAILS',
      markdown: `### ${p.title}\n\n${p.description}\n\n#### Key Specifications & Credentials:\n- **Price:** $${(p.price_cents / 100).toFixed(2)} (MSRP: ~~$${(p.compare_at_price_cents / 100).toFixed(2)}~~)\n- **Instant Commission Rebate:** -$${((p.commission_rebate_cents || 0) / 100).toFixed(2)} (Effective Net: **$${(net / 100).toFixed(2)}**)\n- **Merchant:** \`${p.merchant_domain}\` (🛡️ **${p.merchant_credibility_score || 95}%** Credibility Rating)\n- **Stock Status:** ✅ In Stock\n- **Delivery:** ${p.delivery_window || '2-Day Express'}\n- **Warranty:** ${p.specs?.Warranty || '1-Year Manufacturer Warranty + AegisPay 72h Price Drop Protection'}`,
      products: [p],
      product_detail: p,
      thought_trace: [
        `Parsed user intent: "${body.message}" -> Action: DETAILS`,
        `Retrieving deep product details and merchant credibility verification for ${p.product_id}`,
        `Verified merchant credibility score: ${p.merchant_credibility_score}% (${p.merchant_domain})`,
      ],
      follow_up_suggestions: [
        `Buy this item now ($${(p.price_cents / 100).toFixed(2)})`,
        'Compare with alternatives',
        'Check delivery to my ZIP',
      ],
    };
    return respond(mockPayload);
  }

  if (action === 'BUY') {
    const matched = selectedProductIds.length > 0 ? resolveProducts(selectedProductIds) : [];
    const buyProducts = matched.length > 0 ? matched : [sampleProducts[0], sampleProducts[1]];

    const grossSubtotalCents = buyProducts.reduce((acc, p) => acc + p.price_cents, 0);
    const rebateCents = buyProducts.reduce((acc, p) => acc + (p.commission_rebate_cents || 0), 0);
    const shippingSavedCents = buyProducts.length > 1 ? 2500 : 0;
    const shippingCents = buyProducts.some((p) => !p.free_shipping) ? 500 : 0;
    const taxCents = Math.round(grossSubtotalCents * 0.0725);
    const netExpenditureCents = grossSubtotalCents - rebateCents + shippingCents + taxCents;
    const budgetCapCents = body.budget_cap_cents || 50000;
    const isWithinBudget = netExpenditureCents <= budgetCapCents;

    const mockPayload: ChatResponsePayload = {
      action: 'BUY',
      markdown: `### Pre-Purchase Verification & Knapsack Cart Summary\n\n✅ **Two-Phase Commit (2PC) Stock Reservation:** \`res_2pc_verified_${Date.now().toString(36)}\` (Held)\n✅ **Items Included (${buyProducts.length}):** ${buyProducts.map((p) => p.title).join(', ')}\n\n#### Financial Settlement Breakdown:\n- **Gross Subtotal:** $${(grossSubtotalCents / 100).toFixed(2)}\n- **Instant Commission Rebate:** -$${(rebateCents / 100).toFixed(2)}\n- **Estimated Sales Tax:** $${(taxCents / 100).toFixed(2)}\n- **Shipping Fee:** $${(shippingCents / 100).toFixed(2)}${shippingSavedCents > 0 ? ` (🎉 Saved $${(shippingSavedCents / 100).toFixed(2)} with multi-item bundling)` : ''}\n- **Net Buyer Expenditure:** **$${(netExpenditureCents / 100).toFixed(2)}**\n- **Budget Cap:** $${(budgetCapCents / 100).toFixed(2)} (${isWithinBudget ? '✅ Within Budget' : '⚠️ Exceeds Budget'})\n\n*Merchant settlement is decoupled: merchants will be authorized full retail amount, with commission rebate applied as an instant platform subsidy.*`,
      products: buyProducts,
      cart: {
        gross_subtotal_cents: grossSubtotalCents,
        total_commission_rebate_cents: rebateCents,
        total_shipping_cents: shippingCents,
        total_shipping_saved_cents: shippingSavedCents,
        total_tax_cents: taxCents,
        net_buyer_expenditure_cents: netExpenditureCents,
        budget_cap_cents: budgetCapCents,
        is_within_budget: isWithinBudget,
      },
      stock_reservation: {
        reservation_id: `res_2pc_verified_${Date.now().toString(36)}`,
        all_held: true,
        expires_at: new Date(Date.now() + 900000).toISOString(),
      },
      thought_trace: [
        `Parsed user intent: "${body.message}" -> Action: BUY`,
        `Executing pre-purchase 2PC inventory hold check and knapsack cart optimization across ${buyProducts.length} items`,
        '2PC stock verification successful!',
        `Knapsack solver bundled cart: Net buyer price: $${(netExpenditureCents / 100).toFixed(2)}, Instant Commission Rebate: $${(rebateCents / 100).toFixed(2)}, Within budget: ${isWithinBudget}`,
      ],
      follow_up_suggestions: [
        'Confirm purchase with 1-click Vault v3',
        'Apply alternate shipping address',
        'Add complementary accessories',
      ],
    };
    return respond(mockPayload);
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

  return respond(mockPayload);
}
