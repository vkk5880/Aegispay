'use client';

import React, { useState } from 'react';
import {
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  DateFilterModule,
  enableDevValidations,
  NumberFilterModule,
  QuickFilterModule,
  TextFilterModule,
  themeQuartz,
  type ColDef,
  type ColTypeDefs,
  type ValueFormatterParams,
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';

if (process.env.NODE_ENV !== 'production') {
  enableDevValidations();
}

const modules = [
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  QuickFilterModule,
  ColumnAutoSizeModule,
];

const theme = themeQuartz.withParams({
  fontFamily: 'var(--pp-font, sans-serif)',
  accentColor: 'var(--pp-blue, #0070e0)',
  foregroundColor: 'var(--pp-ink, #001435)',
  borderColor: 'var(--pp-border, #dbe1e8)',
  headerFontWeight: 600,
  headerTextColor: 'var(--pp-muted, #545d68)',
  rowHoverColor: 'var(--pp-highlight, #e6f0fc)',
});

export type Row = Record<string, unknown>;

/**
 * Escapes special regex characters in a search string to protect against regex injection
 * or syntax errors when querying across AG-Grid columns.
 */
export function sanitizeQuickFilter(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  // Trim and escape regex special characters: \ ^ $ * + ? . ( ) | { } [ ]
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
}

/**
 * Formats numeric monetary amounts with currency safety and null/undefined handling.
 */
export function formatMoney({ value, data }: ValueFormatterParams<Row>): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return '—';
  }

  const rawCurrency = typeof data?.currency === 'string' ? data.currency.trim().toUpperCase() : 'USD';
  const currencyCode = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'USD';

  try {
    return num.toLocaleString('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currencyCode} ${num.toFixed(2)}`;
  }
}

/**
 * Formats timestamps or ISO date strings with resilient null, undefined, and invalid date handling.
 */
export function formatTimestamp({ value }: ValueFormatterParams<Row>): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  try {
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) {
      return '—';
    }
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  } catch {
    return '—';
  }
}

export const columnTypes: ColTypeDefs<Row> = {
  money: { valueFormatter: formatMoney, filter: 'agNumberColumnFilter' },
  timestamp: { valueFormatter: formatTimestamp, filter: 'agDateColumnFilter' },
  dateTime: { valueFormatter: formatTimestamp, filter: 'agDateColumnFilter' },
};

const defaultColDef: ColDef<Row> = { filter: true };
const autoSizeStrategy = { type: 'fitCellContents' } as const;

/**
 * Exports in-memory row data to downloadable CSV format.
 */
export function exportToCsv(rows: Row[], filename = 'merchant-settlement.csv'): void {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const escaped = String(val ?? '').replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    ),
  ];
  if (typeof window !== 'undefined' && typeof Blob !== 'undefined' && window.URL && window.document) {
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function DataGrid({ rows, columns }: { rows: Row[]; columns: ColDef<Row>[] }) {
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Sanitize the search query before providing to AG Grid quick filter text
  const sanitizedSearch = sanitizeQuickFilter(search);

  const handleExport = () => {
    exportToCsv(rows);
    setActionNotice('Settlement CSV exported successfully');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleAction = (actionType: 'approve' | 'refund' | 'escalate') => {
    if (!selectedRow) return;
    const msg =
      actionType === 'approve'
        ? 'Order hold approved and released to settlement'
        : actionType === 'refund'
        ? 'Compensating 100% refund initiated'
        : 'Dispute escalated to Tier 5 SLA human review';
    setActionNotice(msg);
    setSelectedRow(null);
    setTimeout(() => setActionNotice(null), 4000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Merchant Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all columns…"
          aria-label="Search all columns"
          className="h-10 w-72 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0c1424] px-3 text-sm outline-none focus:border-cyan-500 text-slate-800 dark:text-slate-100"
        />
        <div className="flex items-center gap-2">
          {actionNotice && (
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg animate-fade-in">
              {actionNotice}
            </span>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="h-10 px-3.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            Export Settlement CSV
          </button>
        </div>
      </div>

      <div
        className="min-h-[400px] h-[520px] flex-1 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm"
        role="region"
        aria-label="Merchant Data Table"
        aria-busy={!rows}
      >
        <AgGridProvider modules={modules}>
          <AgGridReact
            theme={theme}
            rowData={rows}
            columnDefs={columns}
            columnTypes={columnTypes}
            defaultColDef={defaultColDef}
            quickFilterText={sanitizedSearch}
            autoSizeStrategy={autoSizeStrategy}
            enableCellTextSelection
            domLayout="normal"
            onRowClicked={(event) => event.data && setSelectedRow(event.data)}
          />
        </AgGridProvider>
      </div>

      {/* Interactive Custody Action Modal */}
      {selectedRow && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#0c1424] border border-slate-700 shadow-2xl p-6 flex flex-col gap-4 text-slate-100">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Merchant Custody & Order Controls</h3>
                <p className="text-xs text-slate-400">Inspect record attributes and trigger immediate escrow actions.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-xs p-3 rounded-xl bg-slate-950 border border-slate-800">
              {Object.entries(selectedRow).map(([key, val]) => (
                <div key={key} className="flex justify-between gap-2 border-b border-slate-900/50 pb-1">
                  <span className="text-slate-400">{key}:</span>
                  <span className="text-slate-200 font-bold truncate max-w-[260px]">{String(val ?? '—')}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleAction('escalate')}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-purple-500/30 bg-purple-950/30 text-purple-300 hover:bg-purple-900/50 cursor-pointer"
              >
                Escalate SLA
              </button>
              <button
                type="button"
                onClick={() => handleAction('refund')}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-500/30 bg-red-950/30 text-red-400 hover:bg-red-900/50 cursor-pointer"
              >
                Refund Order
              </button>
              <button
                type="button"
                onClick={() => handleAction('approve')}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 cursor-pointer"
              >
                Approve & Release Hold
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
