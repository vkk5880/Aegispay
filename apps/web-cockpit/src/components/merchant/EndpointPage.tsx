import React from 'react';
import Link from 'next/link';
import type { ColDef } from 'ag-grid-community';
import { DataGrid, type Row } from '@/components/merchant/DataGrid';
import { ArrowLeft } from 'lucide-react';

export function EndpointPage({
  title,
  calls,
  source,
  note,
  rows,
  columns,
}: {
  title: string;
  calls: string[];
  source: string;
  note?: string;
  rows: Row[];
  columns: ColDef<Row>[];
}) {
  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full transition-colors">
      <div className="flex flex-col gap-2">
        <Link
          href="/merchant"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Merchant Cockpit
        </Link>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {calls.map((call) => (
            <code
              key={call}
              className="rounded bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-800 px-2 py-0.5 text-cyan-800 dark:text-cyan-300 font-mono"
            >
              {call}
            </code>
          ))}
          <span>
            via <code className="text-slate-800 dark:text-slate-200 font-mono">{source}</code> · {rows.length}{' '}
            {rows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
        {note && <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">{note}</p>}
      </div>

      <div className="flex min-h-[500px] flex-1 flex-col">
        <DataGrid rows={rows} columns={columns} />
      </div>
    </div>
  );
}
