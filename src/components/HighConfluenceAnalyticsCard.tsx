import React from 'react';
import { Sparkles, TrendingUp, ShieldCheck, Zap, Layers, Award, ArrowUpRight } from 'lucide-react';
import { EnhancedAnalyticsSummary } from '../services/enhancedFilterService.ts';

interface HighConfluenceAnalyticsCardProps {
  summary: EnhancedAnalyticsSummary;
  isFilterActive: boolean;
  onToggleFilter: () => void;
}

export const HighConfluenceAnalyticsCard: React.FC<HighConfluenceAnalyticsCardProps> = ({
  summary,
  isFilterActive,
  onToggleFilter,
}) => {
  if (summary.totalAnalyzed === 0) return null;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>High Confluence Analytics (Score ≥ 85%)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  {summary.highConfluenceCount} Trades ({summary.highConfluencePercentage}%)
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict historical observation rules: Inverted alignment, timing window (09:35–13:00), MA compression (≤0.04%), and geometry symmetry (≥0.60).
            </p>
          </div>
        </div>

        <button
          onClick={onToggleFilter}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shadow-md ${
            isFilterActive
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isFilterActive ? 'Showing Score ≥ 85% (Click to View All)' : 'Filter View: Score ≥ 85% Only'}</span>
        </button>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
        {/* Win Rate (High Score) */}
        <div className="bg-slate-950/70 border border-emerald-900/40 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
            Score ≥ 85% Win Rate
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5 flex items-baseline gap-1 font-mono">
            <span>{summary.highConfluenceWinRate}%</span>
            {summary.winRateLift > 0 && (
              <span className="text-[10px] text-emerald-300 font-sans font-semibold">
                (+{summary.winRateLift}%)
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Baseline: {summary.allWinRate}%
          </div>
        </div>

        {/* Uber Engine Win Rate */}
        <div className="bg-slate-950/70 border border-purple-900/40 rounded-xl p-3">
          <div className="text-[10px] text-purple-300 uppercase font-mono tracking-wider">
            Uber High Confluence
          </div>
          <div className="text-xl font-bold text-purple-300 mt-0.5 font-mono">
            {summary.uber.highConfluenceTotal > 0 ? `${summary.uber.highConfluenceWinRate}%` : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 truncate">
            {summary.uber.highConfluenceWins}/{summary.uber.highConfluenceTotal} (All: {summary.uber.allWinRate}%)
          </div>
        </div>

        {/* Meta Engine Win Rate */}
        <div className="bg-slate-950/70 border border-teal-900/40 rounded-xl p-3">
          <div className="text-[10px] text-teal-300 uppercase font-mono tracking-wider">
            Meta High Confluence
          </div>
          <div className="text-xl font-bold text-teal-300 mt-0.5 font-mono">
            {summary.meta.highConfluenceTotal > 0 ? `${summary.meta.highConfluenceWinRate}%` : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 truncate">
            {summary.meta.highConfluenceWins}/{summary.meta.highConfluenceTotal} (All: {summary.meta.allWinRate}%)
          </div>
        </div>

        {/* Ultra Engine Win Rate */}
        <div className="bg-slate-950/70 border border-amber-900/40 rounded-xl p-3">
          <div className="text-[10px] text-amber-300 uppercase font-mono tracking-wider">
            Ultra High Confluence
          </div>
          <div className="text-xl font-bold text-amber-300 mt-0.5 font-mono">
            {summary.ultra.highConfluenceTotal > 0 ? `${summary.ultra.highConfluenceWinRate}%` : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 truncate">
            {summary.ultra.highConfluenceWins}/{summary.ultra.highConfluenceTotal} (All: {summary.ultra.allWinRate}%)
          </div>
        </div>

        {/* Avg Profit Excursion */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
            Avg Profit Multiple
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5 font-mono">
            {summary.avgProfitMultipleHighConfluence.toFixed(2)}x
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Baseline: {summary.avgProfitMultipleAll.toFixed(2)}x
          </div>
        </div>

        {/* Avg Loss Excursion */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
            Avg Loss Multiple
          </div>
          <div className="text-xl font-bold text-rose-400 mt-0.5 font-mono">
            {summary.avgLossMultipleHighConfluence.toFixed(2)}x
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Baseline: {summary.avgLossMultipleAll.toFixed(2)}x
          </div>
        </div>
      </div>
    </div>
  );
};
