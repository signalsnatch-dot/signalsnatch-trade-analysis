import React, { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Target,
  ShieldAlert,
  ArrowRight,
  X,
} from 'lucide-react';
import { EnhancedFilterResult, RuleEvaluation } from '../services/enhancedFilterService.ts';

interface EnhancedFilterBadgeProps {
  evaluation: EnhancedFilterResult;
  compact?: boolean;
}

export const EnhancedFilterBadge: React.FC<EnhancedFilterBadgeProps> = ({
  evaluation,
  compact = false,
}) => {
  const [showModal, setShowModal] = useState(false);
  const { score, isHighConfluence, engineType, engineName, achievedTags, missedTags, guidance, rules } =
    evaluation;

  // Determine score color
  const scoreBadgeClass = isHighConfluence
    ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80'
    : score >= 60
    ? 'bg-amber-950 text-amber-300 border-amber-700/80'
    : 'bg-rose-950 text-rose-300 border-rose-800/80';

  return (
    <>
      <div className="flex flex-col gap-1 items-start text-[10px]">
        {/* Main Score & Engine Pill */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(true);
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold border transition cursor-pointer shadow-sm ${scoreBadgeClass} hover:brightness-110`}
            title="Click to view detailed rule breakdown and Master Exit & Holding table"
          >
            {isHighConfluence && <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />}
            <span>Score: {score}%</span>
            <span className="text-[9px] opacity-75 font-sans">
              ({isHighConfluence ? '≥85% Optimal' : '<85% Sub-optimal'})
            </span>
          </button>
        </div>

        {/* Achieved and Missed Tags Preview */}
        {!compact && (
          <div className="flex flex-wrap gap-1 max-w-xs mt-0.5 font-sans">
            {achievedTags.map((tag, idx) => (
              <span
                key={`ach_${idx}`}
                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 truncate"
              >
                {tag}
              </span>
            ))}
            {missedTags.map((tag, idx) => (
              <span
                key={`mis_${idx}`}
                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-950/70 text-rose-300 border border-rose-800/60 truncate"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Modal with Full Historical Rule Breakdown and Master Exit & Holding Table */}
      {showModal && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(false);
          }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-100"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    isHighConfluence
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {isHighConfluence ? <Sparkles className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{engineName}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${scoreBadgeClass}`}
                    >
                      {score}% Score
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Target: <strong className="text-cyan-300">{evaluation.expectedTarget}</strong> • Historical Benchmark Win Rate:{' '}
                    <strong className="text-emerald-400">{evaluation.benchmarkHistoricalWinRate}%</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Target Philosophy Banner */}
              <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 text-slate-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Target Philosophy: </span>
                  <span>{evaluation.targetPhilosophy}</span>
                </div>
              </div>

              {/* Rules Evaluation Breakdown */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Engine Core Rules ({rules.filter((r) => r.achieved).length} of {rules.length} Achieved)
                </h4>

                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-3 rounded-2xl border flex items-start justify-between gap-3 ${
                        rule.achieved
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-slate-200'
                          : 'bg-rose-950/30 border-rose-800/60 text-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              rule.achieved ? 'bg-emerald-900 text-emerald-200' : 'bg-rose-900 text-rose-200'
                            }`}
                          >
                            {rule.achieved ? 'ACHIEVED' : 'MISSED'}
                          </span>
                          <span className="font-bold text-white text-xs">{rule.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{rule.description}</p>
                        <div className="text-[11px] font-mono text-cyan-300">Detail: {rule.detail}</div>
                      </div>

                      <div className="text-right shrink-0 font-mono">
                        <span
                          className={`font-bold ${
                            rule.achieved ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          +{rule.scoreContribution}
                        </span>
                        <span className="text-slate-500"> / {rule.maxScore} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Master Exit & Holding Comparison Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Master Exit & Holding Strategy ({guidance.tradeType})
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">Optimal Hold Time (Win)</span>
                    <p className="font-semibold text-emerald-300">{guidance.optimalHoldWin}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">Max Hold Time (Win)</span>
                    <p className="font-semibold text-white">{guidance.maxHoldWin}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">Optimal Hold Time (Loss)</span>
                    <p className="font-semibold text-amber-300">{guidance.optimalHoldLoss}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">Target Profit Multiple</span>
                    <p className="font-semibold text-emerald-400">{guidance.targetProfitMultiple}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">Max Drawdown Allowed</span>
                    <p className="font-semibold text-rose-300">{guidance.maxDrawdownAllowed}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">Primary Close Indicator</span>
                    <p className="font-semibold text-indigo-300">{guidance.primaryCloseIndicator}</p>
                  </div>
                </div>
              </div>

              {/* M1 Loss Management Status */}
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/60 space-y-1">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Execution & M1 Loss Management</span>
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  {guidance.liveStatusAdvice || guidance.lossManagementRule}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
