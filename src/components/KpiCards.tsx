import React from 'react';
import { Target, Clock, BarChart2, CheckCircle2, ShieldAlert, Award, TrendingDown } from 'lucide-react';
import { Command2Summary } from '../services/command2Service.ts';

interface KpiCardsProps {
  summary: Command2Summary | null;
  totalLoadedTrades: number;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ summary, totalLoadedTrades }) => {
  if (!summary || summary.totalTradesAnalyzed === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center text-slate-400">
        <p className="text-sm">Run Command 2 to view trade milestone metrics, tick counts, and drawdown excursion ratios.</p>
      </div>
    );
  }

  const {
    m1Hits,
    m2Hits,
    averages,
    totalTradesAnalyzed,
    successCount,
    overallWinRatePercentage,
    uberSuccessRate,
    ultraSuccessRate,
    totalGroupsCount,
  } = summary;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Milestone 1 Resolution & Win Rate */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">M1 Target Win Rate</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Award className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold text-emerald-400">
            {overallWinRatePercentage.toFixed(1)}%
          </span>
          <span className="text-xs text-slate-400">
            ({successCount}/{totalTradesAnalyzed} won)
          </span>
        </div>
        <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-indigo-300 font-medium">Uber Target (SL):</span>
            <span className="font-semibold text-white">
              {uberSuccessRate.uberSuccessCount}/{uberSuccessRate.totalUber} ({uberSuccessRate.uberSuccessPercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-cyan-300 font-medium">Ultra Target (TP):</span>
            <span className="font-semibold text-white">
              {ultraSuccessRate.ultraSuccessCount}/{ultraSuccessRate.totalUltra} ({ultraSuccessRate.ultraSuccessPercentage.toFixed(1)}%)
            </span>
          </div>
          {summary.cancelledTradesCount > 0 && (
            <div className="flex justify-between items-center text-amber-400 font-medium pt-1 border-t border-slate-800/40">
              <span>Cancelled Trades:</span>
              <span className="font-semibold font-mono">{summary.cancelledTradesCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Speed & Ticks to Milestone 1 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">M1 Speed & Ticks</span>
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold text-cyan-400 font-mono">
            {averages.avgM1Ticks.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400">ticks (vol / thresh)</span>
        </div>
        <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Avg Time from Entry:</span>
            <span className="font-medium text-slate-200">
              {averages.avgTimeM1Formatted}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Avg 1-Min Candles:</span>
            <span className="font-medium text-slate-200 font-mono">
              {averages.avgCandlesToM1.toFixed(1)} candles
            </span>
          </div>
        </div>
      </div>

      {/* Card 3: Milestone 2 Resolution & Ticks */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">M2 Resolution & Ticks</span>
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-purple-400 font-mono">
              {averages.avgM2Ticks.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400">ticks</span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Avg Time to M2:</span>
            <span className="text-xs font-semibold text-purple-300 font-mono">
              {averages.avgTimeM2Formatted}
            </span>
          </div>
        </div>
        <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-emerald-400">Same-Day Hit:</span>
            <span className="font-semibold text-white font-mono">
              {m2Hits.achievedSameDayCount} ({m2Hits.sameDayPercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-indigo-400">Multi-Day Hit:</span>
            <span className="font-semibold text-white font-mono">
              {m2Hits.achievedMultiDayCount} ({m2Hits.multiDayPercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-amber-400">Pending / Next Days:</span>
            <span className="font-semibold text-white font-mono">
              {m2Hits.pendingCount} ({m2Hits.pendingPercentage.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Card 4: Profit & Drawdown Excursion Metrics (Requirement 6) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Profit & Loss Multipliers</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold text-emerald-400 font-mono">
            {(averages.avgMaxProfitMultiple || 0).toFixed(1)}x
          </span>
          <span className="text-xs text-slate-400">profit /</span>
          <span className="text-xl font-bold text-rose-400 font-mono">
            {averages.avgMaxLossMultiple.toFixed(1)}x
          </span>
          <span className="text-xs text-slate-400">loss</span>
        </div>
        <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Profit Before Return:</span>
            <span className="font-semibold text-emerald-300 font-mono">
              {(averages.avgProfitMultipleBeforeReturn || 0).toFixed(1)}x reward
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Loss Before Return:</span>
            <span className="font-semibold text-amber-300 font-mono">
              {averages.avgLossMultipleBeforeEntryReturn.toFixed(1)}x risk
            </span>
          </div>
          {summary.totalIncompleteTrades > 0 && (
            <div className="flex justify-between items-center text-amber-400 font-semibold pt-1 border-t border-slate-800/40">
              <span>Excluded Incomplete:</span>
              <span className="font-mono">{summary.totalIncompleteTrades} trades (no CSV)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
