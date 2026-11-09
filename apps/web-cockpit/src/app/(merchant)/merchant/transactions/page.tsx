import React from 'react';
import type { Metadata } from 'next';
import { EndpointPage } from '@/components/merchant/EndpointPage';

export const metadata: Metadata = { title: 'Transactions | Merchant Cockpit' };

export default async function TransactionsPage() {
  const transactions = [
    {
      id: 'TXN-DEMO-001',
      date: '2026-11-04T14:22:00Z',
      eventCode: 'T0001',
      status: 'S',
      amount: 150.0,
      gross_amount: 150.0,
      fee: 4.65,
      paypal_fee: 4.65,
      channel3_rebate: 2.25,
      endingBalance: 15400.0,
      currency: 'USD',
      counterparty: 'affiliate@partner.com',
      subject: 'Affiliate settlement',
      note: 'AegisPay settlement voucher',
      carrier: 'USPS',
      tracking_number: '94001118992200D8823901',
      delivery_status: 'DELIVERED',
      postal_code: '94016',
      liability_score_l: 0.12,
      abuse_risk_score_r: 0.22,
      hateoasAllowedActions: ['accept-claim'],
      purchase_units: [
        {
          payee_merchant_id: 'MERCHANT_C3_01',
          item_name: 'Wireless Noise Canceling Headphones',
          category: 'ELECTRONICS',
          amount: 120.0,
          net_settlement: 114.72,
          status: 'CAPTURED',
        },
        {
          payee_merchant_id: 'MERCHANT_AFFILIATE_99',
          item_name: 'Affiliate Knapsack Co-Pay Item',
          category: 'ACCESSORIES',
          amount: 30.0,
          net_settlement: 28.83,
          status: 'CAPTURED',
        },
      ],
      vault_token: {
        vault_id: 'vlt_token_9981248109',
        customer_id: 'cust_buyer_synth_001',
        status: 'ACTIVE_VAULTED',
        expires_at: '2026-11-12T14:22:00Z',
        reauth_count: 3,
        last_reauth_at: '2026-11-04T14:22:00Z',
      },
      trackers: [
        {
          carrier: 'USPS',
          tracking_number: '94001118992200D8823901',
          postal_code: '94016',
          delivery_status: 'DELIVERED',
          timestamp: '2026-11-04 14:15 UTC',
        },
      ],
    },
    {
      id: 'TXN-DEMO-002',
      date: '2026-11-03T18:45:00Z',
      eventCode: 'T0006',
      status: 'S',
      amount: 285.5,
      gross_amount: 285.5,
      fee: 8.58,
      paypal_fee: 8.58,
      channel3_rebate: 4.28,
      endingBalance: 15250.0,
      currency: 'USD',
      counterparty: 'knapsack_store@sandbox.paypal.com',
      subject: 'Knapsack multi-cart order',
      note: 'Autonomous escrow authorization',
      carrier: 'FEDEX',
      tracking_number: '794820194829',
      delivery_status: 'DELIVERED',
      postal_code: '94016',
      liability_score_l: 0.18,
      abuse_risk_score_r: 0.35,
      hateoasAllowedActions: ['make-offer'],
      purchase_units: [
        {
          payee_merchant_id: 'MERCHANT_C3_02',
          item_name: 'Mechanical Gaming Keyboard',
          category: 'ELECTRONICS',
          amount: 195.5,
          net_settlement: 187.12,
          status: 'CAPTURED',
        },
        {
          payee_merchant_id: 'MERCHANT_ACC_12',
          item_name: 'Braided USB-C Aviator Cable',
          category: 'ACCESSORIES',
          amount: 90.0,
          net_settlement: 86.48,
          status: 'CAPTURED',
        },
      ],
      vault_token: {
        vault_id: 'vlt_token_4829104812',
        customer_id: 'cust_buyer_synth_002',
        status: 'ACTIVE_VAULTED',
        expires_at: '2026-11-15T18:45:00Z',
        reauth_count: 1,
        last_reauth_at: '2026-11-03T18:45:00Z',
      },
      trackers: [
        {
          carrier: 'FEDEX',
          tracking_number: '794820194829',
          postal_code: '94016',
          delivery_status: 'DELIVERED',
          timestamp: '2026-11-04 15:40 UTC',
        },
      ],
    },
    {
      id: 'TXN-DEMO-003',
      date: '2026-11-02T11:10:00Z',
      eventCode: 'T1107',
      status: 'P',
      amount: 450.0,
      gross_amount: 450.0,
      fee: 13.35,
      paypal_fee: 13.35,
      channel3_rebate: 6.75,
      endingBalance: 14964.5,
      currency: 'EUR',
      counterparty: 'enterprise_client@acme.de',
      subject: 'Quarterly SaaS Subscription License',
      note: 'Pending SEPA / Card confirmation',
      carrier: 'DHL',
      tracking_number: 'DHL9482049182',
      delivery_status: 'IN_TRANSIT',
      postal_code: '10115',
      liability_score_l: 0.45,
      abuse_risk_score_r: 0.78,
      hateoasAllowedActions: ['provide-evidence', 'make-offer'],
      purchase_units: [
        {
          payee_merchant_id: 'MERCHANT_GLOBAL_EU',
          item_name: 'Quarterly Multi-Seat License',
          category: 'SOFTWARE',
          amount: 450.0,
          net_settlement: 432.5,
          status: 'PENDING_HOLD',
        },
      ],
      vault_token: {
        vault_id: 'vlt_token_sepa_88291',
        customer_id: 'cust_eu_corp_99',
        status: 'ACTIVE_VAULTED',
        expires_at: '2026-11-10T11:10:00Z',
        reauth_count: 5,
        last_reauth_at: '2026-11-02T11:10:00Z',
      },
      trackers: [
        {
          carrier: 'DHL',
          tracking_number: 'DHL9482049182',
          postal_code: '10115',
          delivery_status: 'IN_TRANSIT',
          timestamp: '2026-11-02 12:00 UTC',
        },
      ],
    },
  ];

  return (
    <EndpointPage
      title="Transaction Search (Last 31 Days)"
      calls={['GET /v1/reporting/transactions']}
      source="searchTransactions(start, end)"
      note="Multi-merchant settlement ledger powered by AG Grid Enterprise Master/Detail, dynamic row grouping, status bar summaries, and in-line HATEOAS actions."
      rows={transactions}
      columns={[
        {
          field: 'date',
          headerName: 'Date',
          type: 'dateTime',
          width: 175,
          cellRenderer: 'agGroupCellRenderer',
        },
        { field: 'id', headerName: 'Transaction ID', width: 140 },
        { field: 'currency', headerName: 'Currency', width: 100, enableRowGroup: true },
        { field: 'status', headerName: 'Status', width: 85, enableRowGroup: true },
        {
          field: 'amount',
          headerName: 'Financial Split (Gross / Fee / Rebate)',
          width: 230,
          cellRenderer: 'MonetarySplitCellRenderer',
          aggFunc: 'sum',
        },
        {
          field: 'tracking_number',
          headerName: 'Carrier Tracker',
          width: 240,
          cellRenderer: 'CarrierTrackerCellRenderer',
        },
        {
          field: 'liability_score_l',
          headerName: 'Forensic Risk (L, R)',
          width: 140,
          cellRenderer: 'RiskScoreRadialCellRenderer',
        },
        {
          field: 'hateoasAllowedActions',
          headerName: 'One-Click Actions',
          minWidth: 220,
          cellRenderer: 'HateoasActionCellRenderer',
        },
        { field: 'counterparty', headerName: 'Counterparty', minWidth: 170, flex: 1 },
      ]}
    />
  );
}
