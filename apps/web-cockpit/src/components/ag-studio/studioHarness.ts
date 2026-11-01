import { createAiHarness, createStudio } from 'ag-studio';

export function setupStudioHarness() {
  const studio = createStudio();

  // Wire hybrid multi-agent harness per Layer 4 architecture
  const harness = createAiHarness({
    leadAgent: 'directLlmRunner',
    delegates: ['planning', 'data', 'page', 'widget', 'paypal_arbiter']
  });

  studio.registerAgent(harness);

  // Register paypal_arbiter using clientToolRunner
  studio.registerToolRunner('paypal_arbiter', {
    type: 'clientToolRunner',
    streamEndpoint: '/api/agents/arbiter/stream'
  });

  // Programmatic cross-filtering
  studio.api.defineAiCommand('isolate_high_risk_disputes', async (args: any, { s, api }: any) => {
    return api.execCommand('AgAddPageFilterCommand', {
      pageId: s.pageId(),
      widgetId: s.widgetId(),
      filters: [
        { field: 'abuse_risk_score_r', operator: 'gte', value: 0.60 },
        { field: 'liability_score_l', operator: 'lt', value: 0.25 }
      ]
    });
  });

  // Calculated Column Expression
  studio.api.createExpression('Net_Retained_Margin', (ctx: any) => {
    const capture_amount = ctx.getValue('capture_amount') || 0;
    const paypal_fee = ctx.getValue('paypal_fee') || 0;
    const dispute_amount = ctx.getValue('dispute_amount') || 0;
    const L = ctx.getValue('liability_score_l') || 0;
    const channel3_rebate = ctx.getValue('channel3_rebate') || 0;

    return capture_amount - paypal_fee - (dispute_amount * L) + channel3_rebate;
  });

  return studio;
}
