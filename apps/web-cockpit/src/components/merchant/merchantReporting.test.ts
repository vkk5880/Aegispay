import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardReports } from './DashboardReports.js';
import { DataGrid } from './DataGrid.js';
import { EndpointPage } from './EndpointPage.js';

test('DashboardReports renders all 5 report cards and metrics', () => {
  const html = renderToStaticMarkup(
    React.createElement(DashboardReports, {
      metrics: {
        totalProducts: 4,
        activePlans: 2,
        openInvoices: 5,
        usdBalance: '$25,000.00',
        recentTxCount: 12,
      },
    })
  );

  assert.ok(html.includes('Catalog Products'));
  assert.ok(html.includes('Subscription Plans'));
  assert.ok(html.includes('Commercial Invoices'));
  assert.ok(html.includes('Held Balances'));
  assert.ok(html.includes('Transaction Stream'));
  assert.ok(html.includes('$25,000.00'));
  assert.ok(html.includes('/merchant/products'));
  assert.ok(html.includes('/merchant/plans'));
  assert.ok(html.includes('/merchant/invoices'));
  assert.ok(html.includes('/merchant/balances'));
  assert.ok(html.includes('/merchant/transactions'));
});

test('DataGrid renders search input and grid container markup', () => {
  const rows = [
    { id: 'PROD-1', name: 'Software Tier 1', price: 99.0, currency: 'USD' },
    { id: 'PROD-2', name: 'Software Tier 2', price: 199.0, currency: 'USD' },
  ];
  const columns = [
    { field: 'name', headerName: 'Product Name' },
    { field: 'price', headerName: 'Price', type: 'money' },
  ];

  const html = renderToStaticMarkup(
    React.createElement(DataGrid, { rows, columns })
  );

  assert.ok(html.includes('Search all columns…'));
  assert.ok(html.includes('overflow-hidden'));
});

test('EndpointPage renders header metadata, source API, calls, and DataGrid', () => {
  const rows = [{ currency: 'USD', total: 1000 }];
  const columns = [{ field: 'currency', headerName: 'Currency' }];

  const html = renderToStaticMarkup(
    React.createElement(EndpointPage, {
      title: 'Merchant Held Balances',
      calls: ['GET /v1/reporting/balances'],
      source: 'getBalances()',
      note: 'Account balance reporting test note',
      rows,
      columns,
    })
  );

  assert.ok(html.includes('Merchant Held Balances'));
  assert.ok(html.includes('GET /v1/reporting/balances'));
  assert.ok(html.includes('getBalances()'));
  assert.ok(html.includes('Account balance reporting test note'));
  assert.ok(html.includes('1 row'));
  assert.ok(html.includes('Search all columns…'));
});
