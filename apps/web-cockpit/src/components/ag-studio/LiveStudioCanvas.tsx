'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { setupStudioHarness, executeStudioPrompt, type AgStudioMock } from './studioHarness';
import { Bot, Sparkles, Send, Filter, CheckCircle2, RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';
import { useUiMode } from '@/context/UiModeContext';

export function LiveStudioCanvas() {
  const { showTechnicalDetails } = useUiMode();
  const [studio, setStudio] = useState<AgStudioMock | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<any[]>([]);

  useEffect(() => {
    const s = setupStudioHarness();
    setStudio(s);
  }, []);

  const handleRunPrompt = async (textToRun?: string) => {
    const query = (textToRun ?? promptInput).trim();
    if (!query || !studio) return;

    setIsProcessing(true);
    setAiResponse(null);

    try {
      const res = await executeStudioPrompt(studio, query);
      setAiResponse(res.message);
      if (res.filters) {
        setActiveFilters(res.filters);
      }
    } catch (err: any) {
      setAiResponse(`Error: ${err?.message || 'Agent command execution failed'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const presetPrompts = [
    'Isolate high risk disputes with abuse score > 60%',
    'Highlight unallocated SLA (< 24 hours remaining)',
    'Calculate net clearing margin after Channel3 rebates',
  ];

  return (
    <div className="bg-white dark:bg-[#0b1324] rounded-2xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[520px]">
      {/* Studio Header Bar */}
      <div className="bg-slate-50 dark:bg-[#080d19] border-b border-slate-200 dark:border-slate-800 px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span>
            {showTechnicalDetails
              ? 'AG Studio 3 Live Multi-Agent Canvas'
              : 'AI Resolution Studio & Command Center'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeFilters.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
              <Filter className="w-3 h-3" />
              {activeFilters.length} Active Cross-Filter{activeFilters.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
            AG Studio 3.0 Active
          </span>
        </div>
      </div>

      {/* Natural Language Prompt Bar */}
      <div className="p-3 bg-slate-100 dark:bg-[#070c18] border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRunPrompt();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ask AG Studio (e.g. 'Isolate high risk disputes', 'Calculate net clearing margin')…"
              className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b1324] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 font-medium placeholder:text-slate-500"
            />
            <Sparkles className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-cyan-500" />
          </div>
          <button
            type="submit"
            disabled={isProcessing}
            className="h-9 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-sm"
          >
            {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Execute
          </button>
        </form>

        {/* Preset Prompt Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-slate-500 font-mono">Presets:</span>
          {presetPrompts.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setPromptInput(preset);
                handleRunPrompt(preset);
              }}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-cyan-100 dark:hover:bg-cyan-950/60 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* AI Response Toast */}
      {aiResponse && (
        <div className="px-4 py-2 bg-cyan-950/40 border-b border-cyan-500/30 text-cyan-300 text-xs flex items-center justify-between font-mono animate-in fade-in">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">{aiResponse}</span>
          </div>
          <button
            type="button"
            onClick={() => setAiResponse(null)}
            className="text-slate-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Studio Canvas View */}
      <div className="flex-1 bg-slate-900 dark:bg-[#060b14] p-4 overflow-y-auto space-y-4">
        {/* Dynamic Studio Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-white space-y-1">
            <span className="text-slate-400 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-cyan-400" />
              Active High-Risk Cases
            </span>
            <p className="text-lg font-bold font-mono text-cyan-400">
              {activeFilters.length > 0 ? '12 Cases' : '38 Total Cases'}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">Abuse Risk &ge; 0.60, Liability &lt; 0.25</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-white space-y-1">
            <span className="text-slate-400 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1">
              <BarChart2 className="w-3 h-3 text-emerald-400" />
              Net Retained Margin
            </span>
            <p className="text-lg font-bold font-mono text-emerald-400">$14,834.12</p>
            <p className="text-[10px] text-slate-500 font-mono">Evaluated via Studio Expression Engine</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-white space-y-1">
            <span className="text-slate-400 text-[10px] font-mono uppercase tracking-wider">
              Studio Widget Registry
            </span>
            <p className="text-lg font-bold font-mono text-purple-400">3 Custom Widgets</p>
            <p className="text-[10px] text-slate-500 font-mono">EvidenceComparator, Hateoas, AutonomyDial</p>
          </div>
        </div>

        {/* Live Studio Layout Preview Grid */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
            <span className="font-bold text-slate-200 font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              AG Studio 3 Page Layout: `page_arbitration`
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
              Tool Runner: paypal_arbiter Connected
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="font-bold text-cyan-300 font-mono text-[11px]">
                Widget: `widget_disputes_grid` (AG Grid SSRM)
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Server-side row model streaming DuckDB-WASM query results. Cross-filtered by Studio Lead Agent commands.
              </p>
              <div className="text-[10px] font-mono text-slate-500">
                Status: {activeFilters.length > 0 ? 'CROSS-FILTERED' : 'STREAMING LIVE'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="font-bold text-purple-300 font-mono text-[11px]">
                Widget: `widget_settlement_chart` (AG Charts)
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Integrated grouped column chart reflecting active grid cell selections and dynamic aggregations.
              </p>
              <div className="text-[10px] font-mono text-slate-500">
                Aggregation: `Net_Retained_Margin` Computed
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveStudioCanvas;
