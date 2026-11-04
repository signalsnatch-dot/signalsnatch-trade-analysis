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
  Zap,
  TrendingUp,
  TrendingDown,
  Compass,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
} from 'lucide-react';
import {
  EnhancedFilterResult,
  RuleEvaluation,
  RulePhase,
  TradeLifecycleState,
} from '../services/enhancedFilterService.ts';

interface EnhancedFilterBadgeProps {
  evaluation: EnhancedFilterResult;
  compact?: boolean;
}

export const EnhancedFilterBadge: React.FC<EnhancedFilterBadgeProps> = ({
  evaluation,
  compact = false,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedPhaseTab, setSelectedPhaseTab] = useState<'ALL' | 'PRE_ENTRY' | 'IN_FLIGHT' | 'RECOVERY_HOLD' | 'FINAL_EXIT'>('ALL');

  const {
    score,
    isHighConfluence,
    engineType,
    engineName,
    lifecycleState,
    achievedTags,
    missedTags,
    notApplicableTags,
    guidance,
    rules,
    preEntryRules,
    inFlightRules,
    recoveryHoldRules,
    finalExitRules,
    highConfluenceCombinations,
    inversionSignal,
    lifecycleAdvice,
  } = evaluation;

  // Determine score color
  const scoreBadgeClass = isHighConfluence
    ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80'
    : score >= 60
    ? 'bg-amber-950 text-amber-300 border-amber-700/80'
    : 'bg-rose-950 text-rose-300 border-rose-800/80';

  // Lifecycle state pill color
  const stateBadgeClass = lifecycleState.isWonM1
    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
    : lifecycleState.isLossRecovery
    ? 'bg-amber-950 text-amber-300 border-amber-800'
    : lifecycleState.code === 'STATE_1'
    ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
    : 'bg-slate-800 text-slate-300 border-slate-700';

  const displayedRules =
    selectedPhaseTab === 'ALL'
      ? rules
      : selectedPhaseTab === 'PRE_ENTRY'
      ? preEntryRules
      : selectedPhaseTab === 'IN_FLIGHT'
      ? inFlightRules
      : selectedPhaseTab === 'RECOVERY_HOLD'
      ? recoveryHoldRules
      : finalExitRules;

  return (
    <>
      <div className="flex flex-col gap-1 items-start text-[10px]">
        {/* Main Score & State Pill */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(true);
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold border transition cursor-pointer shadow-sm ${scoreBadgeClass} hover:brightness-110`}
            title="Click to view Trade Lifecycle State Machine & Rule Matrix"
          >
            {isHighConfluence && <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />}
            <span>Score: {score}%</span>
          </button>

          {/* Lifecycle State Machine Tag */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(true);
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono border cursor-pointer hover:brightness-110 ${stateBadgeClass}`}
            title={lifecycleState.description}
          >
            <Layers className="w-2.5 h-2.5" />
            <span>{lifecycleState.shortLabel}</span>
          </span>

          {/* High Confluence Combination Badges */}
          {highConfluenceCombinations.map((combo) => (
            <span
              key={combo.id}
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-gradient-to-r from-amber-500/20 via-emerald-500/20 to-cyan-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs cursor-pointer hover:border-emerald-400"
              title={`${combo.name} (${combo.winRate}% win rate) — Target: ${combo.phaseTarget}`}
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-300" />
              <span>{combo.badgeLabel}</span>
            </span>
          ))}

          {/* Inversion Signal Badge */}
          {inversionSignal?.shouldInvert && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-amber-950/80 text-amber-300 border border-amber-600 shadow-xs cursor-pointer hover:bg-amber-900 animate-pulse"
              title={inversionSignal.rationale}
            >
              <Zap className="w-2.5 h-2.5 text-amber-400" />
              <span>92.3% Fade Inversion: {inversionSignal.invertedDirection}</span>
            </span>
          )}
        </div>

        {/* Achieved and Missed Tags Preview */}
        {!compact && (
          <div className="flex flex-wrap gap-1 max-w-xs mt-0.5 font-sans">
            {achievedTags.slice(0, 3).map((tag, idx) => (
              <span
                key={`ach_${idx}`}
                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 truncate"
              >
                {tag}
              </span>
            ))}
            {missedTags.slice(0, 2).map((tag, idx) => (
              <span
                key={`mis_${idx}`}
                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-950/70 text-rose-300 border border-rose-800/60 truncate"
              >
                {tag}
              </span>
            ))}
            {achievedTags.length + missedTags.length > 5 && (
              <span className="text-[9px] text-slate-500">
                +{achievedTags.length + missedTags.length - 5} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Modal with Full Trade Lifecycle State Machine Auditor */}
      {showModal && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(false);
          }}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-100"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    isHighConfluence
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 shadow-md'
                      : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                  }`}
                >
                  {isHighConfluence ? <Sparkles className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">{engineName}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${scoreBadgeClass}`}
                    >
                      Pre-Entry Score: {score}%
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${stateBadgeClass}`}
                    >
                      {lifecycleState.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Target: <strong className="text-cyan-300">{evaluation.expectedTarget}</strong> • Benchmark Win Rate:{' '}
                    <strong className="text-emerald-400">{evaluation.benchmarkHistoricalWinRate}%</strong> • Ground Truth: Multi-week audit across 817+ entries
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
              {/* Trade Lifecycle State Machine Visual Pipeline */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Trade Lifecycle State Machine
                  </span>
                  <span className="text-[11px] font-mono text-cyan-300">
                    Active State: <strong>{lifecycleState.shortLabel}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] font-mono">
                  {/* State 0 */}
                  <div
                    className={`p-2 rounded-xl border ${
                      lifecycleState.code === 'STATE_0'
                        ? 'bg-indigo-950 border-indigo-500 text-white font-bold ring-2 ring-indigo-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-[9px] uppercase text-slate-500">State 0</div>
                    <div>Pre-Entry Filter</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Setup Score {score}%</div>
                  </div>

                  {/* State 1 */}
                  <div
                    className={`p-2 rounded-xl border ${
                      lifecycleState.code === 'STATE_1'
                        ? 'bg-indigo-950 border-indigo-500 text-white font-bold ring-2 ring-indigo-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-[9px] uppercase text-slate-500">State 1</div>
                    <div>In-Flight Execution</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Awaiting M1 Hit</div>
                  </div>

                  {/* State 2A / 4A */}
                  <div
                    className={`p-2 rounded-xl border ${
                      lifecycleState.code === 'STATE_2A_4A'
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold ring-2 ring-emerald-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-[9px] uppercase text-slate-500">State 2A &rarr; 4A</div>
                    <div>M1 Won &rarr; Lock</div>
                    <div className="text-[9px] text-emerald-400 mt-0.5">Hold Rule N/A</div>
                  </div>

                  {/* State 2B / 3 */}
                  <div
                    className={`p-2 rounded-xl border ${
                      lifecycleState.code === 'STATE_2B_3' || lifecycleState.code === 'STATE_4B'
                        ? 'bg-amber-950 border-amber-500 text-amber-300 font-bold ring-2 ring-amber-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-[9px] uppercase text-slate-500">State 2B &rarr; 3</div>
                    <div>M1 Lost &rarr; Hold?</div>
                    <div className="text-[9px] text-amber-400 mt-0.5">Recovery Protocol</div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 leading-relaxed font-sans">
                  <strong>Lifecycle Clarification:</strong> A &ldquo;Hold Condition&rdquo; <strong>never applies to trades that won M1</strong>. Once M1 is won, the trade moves directly to Target Lock. The Hold Protocol belongs exclusively to <strong>State 3 (Adverse Recovery Hold)</strong> to evaluate whether price will reverse to M2 or become a capital trap.
                </p>
              </div>

              {/* Inversion Signal Banner (if triggered) */}
              {inversionSignal?.shouldInvert && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/60 to-purple-950/60 border border-amber-500/80 shadow-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                      <Zap className="w-5 h-5 text-amber-400 animate-bounce" />
                      <span>{inversionSignal.title}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono font-bold text-xs">
                      {inversionSignal.winRate}% Fade Win Rate
                    </span>
                  </div>
                  <p className="text-slate-200 text-xs leading-relaxed">
                    {inversionSignal.rationale}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between font-mono text-xs flex-wrap gap-2">
                    <div>
                      Original Signal: <span className="text-rose-400 font-bold">{inversionSignal.originalType}</span>
                    </div>
                    <div>
                      Inverted Action:{' '}
                      <strong className={inversionSignal.invertedDirection === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                        {inversionSignal.invertedDirection} @ {inversionSignal.entryPrice.toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      Target:{' '}
                      <strong className="text-cyan-300">{inversionSignal.targetPrice.toFixed(2)}</strong> (Original SL)
                    </div>
                  </div>
                </div>
              )}

              {/* Lifecycle Advice Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Pre-Entry Verdict */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-cyan-400" />
                      State 0: Pre-Entry
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        lifecycleAdvice.entryVerdict === 'PASS'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : lifecycleAdvice.entryVerdict === 'WARN'
                          ? 'bg-amber-950 text-amber-300 border border-amber-700'
                          : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}
                    >
                      {lifecycleAdvice.entryVerdict}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {lifecycleAdvice.entryReason}
                  </p>
                </div>

                {/* 2. In-Flight & Hold Advice */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    State 1 & 3: Hold Protocol
                  </span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {lifecycleAdvice.holdAdvice}
                  </p>
                </div>

                {/* 3. Exit Protocol */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    State 4: Final Exit
                  </span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {lifecycleAdvice.exitAdvice}
                  </p>
                </div>
              </div>

              {/* High Confluence (>90%) Matched Combinations */}
              {highConfluenceCombinations.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    High Confluence (&gt;90% Win Rate) Combinations Achieved
                  </h4>
                  <div className="space-y-2">
                    {highConfluenceCombinations.map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-xl bg-slate-950 border border-emerald-700/60 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{c.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-900 text-emerald-300 font-mono font-bold">
                              {c.winRate}% Win Rate
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Target: {c.phaseTarget}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{c.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rules Evaluation Breakdown with Phase Tabs */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Lifecycle Execution Matrix ({rules.filter((r) => r.status === 'PASS').length} Passed,{' '}
                    {rules.filter((r) => r.status === 'NOT_APPLICABLE').length} N/A)
                  </h4>

                  {/* Phase Tabs */}
                  <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] flex-wrap">
                    {(
                      [
                        { key: 'ALL', label: `All (${rules.length})` },
                        { key: 'PRE_ENTRY', label: `State 0: Pre-Entry (${preEntryRules.length})` },
                        { key: 'IN_FLIGHT', label: `State 1: In-Flight (${inFlightRules.length})` },
                        { key: 'RECOVERY_HOLD', label: `State 3: Hold (${recoveryHoldRules.length})` },
                        { key: 'FINAL_EXIT', label: `State 4: Exit (${finalExitRules.length})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setSelectedPhaseTab(tab.key)}
                        className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                          selectedPhaseTab === tab.key
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {displayedRules.map((rule) => {
                    const isPass = rule.status === 'PASS';
                    const isFail = rule.status === 'FAIL';
                    const isNA = rule.status === 'NOT_APPLICABLE';

                    return (
                      <div
                        key={rule.id}
                        className={`p-3 rounded-2xl border flex items-start justify-between gap-3 ${
                          isPass
                            ? 'bg-emerald-950/20 border-emerald-800/60 text-slate-200'
                            : isFail
                            ? 'bg-rose-950/20 border-rose-800/60 text-slate-300'
                            : 'bg-slate-950/40 border-slate-800/60 text-slate-400'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono ${
                                isPass
                                  ? 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                                  : isFail
                                  ? 'bg-rose-900 text-rose-200 border border-rose-700'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {rule.status === 'NOT_APPLICABLE' ? 'NOT APPLICABLE' : rule.status}
                            </span>
                            <span className="font-bold text-white text-xs">{rule.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-300">
                              {rule.lifecycleState}
                            </span>
                            {rule.confidenceText && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800">
                                {rule.confidenceText}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-300">{rule.description}</p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px] font-mono pt-1 text-slate-400">
                            <div>
                              <strong className="text-slate-300">[Trigger]:</strong> {rule.triggerMoment}
                            </div>
                            <div>
                              <strong className="text-slate-300">[Eligible Pool]:</strong> {rule.eligiblePool}
                            </div>
                          </div>

                          <div className="text-[11px] font-mono text-cyan-300 pt-0.5">
                            Detail: {rule.detail}
                          </div>

                          <div className="text-[11px] font-sans text-amber-300 font-semibold">
                            Directive: {rule.actionText}
                          </div>
                        </div>

                        {rule.maxScore > 0 && (
                          <div className="text-right shrink-0 font-mono">
                            <span
                              className={`font-bold ${
                                isPass ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            >
                              +{rule.scoreContribution}
                            </span>
                            <span className="text-slate-500"> / {rule.maxScore} pts</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Master Operational Reference Card Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Master Operational Reference ({guidance.tradeType})
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
                  <span>State 3 Execution & M1 Loss Management Directive</span>
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                  {guidance.liveStatusAdvice || guidance.lossManagementRule}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition cursor-pointer"
              >
                Close Auditor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
