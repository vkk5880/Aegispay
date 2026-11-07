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

export function DataGrid({ rows, columns }: { rows: Row[]; columns: ColDef<Row>[] }) {
  const [search, setSearch] = useState('');

  // Sanitize the search query before providing to AG Grid quick filter text
  const sanitizedSearch = sanitizeQuickFilter(search);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search all columns…"
        aria-label="Search all columns"
        className="h-10 w-72 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0c1424] px-3 text-sm outline-none focus:border-cyan-500 text-slate-800 dark:text-slate-100"
      />
      <div className="min-h-[400px] h-[520px] flex-1 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
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
          />
        </AgGridProvider>
      </div>
    </div>
  );
}
