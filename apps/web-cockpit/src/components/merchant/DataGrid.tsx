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

const formatMoney = ({ value, data }: ValueFormatterParams<Row>) =>
  typeof value === 'number' && typeof data?.currency === 'string'
    ? value.toLocaleString('en-US', { style: 'currency', currency: data.currency })
    : '';

const columnTypes: ColTypeDefs<Row> = {
  money: { valueFormatter: formatMoney, filter: 'agNumberColumnFilter' },
};

const defaultColDef: ColDef<Row> = { filter: true };
const autoSizeStrategy = { type: 'fitCellContents' } as const;

export function DataGrid({ rows, columns }: { rows: Row[]; columns: ColDef<Row>[] }) {
  const [search, setSearch] = useState('');

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
      <div className="min-h-[400px] flex-1 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
        <AgGridProvider modules={modules}>
          <AgGridReact
            theme={theme}
            rowData={rows}
            columnDefs={columns}
            columnTypes={columnTypes}
            defaultColDef={defaultColDef}
            quickFilterText={search}
            autoSizeStrategy={autoSizeStrategy}
            enableCellTextSelection
          />
        </AgGridProvider>
      </div>
    </div>
  );
}
