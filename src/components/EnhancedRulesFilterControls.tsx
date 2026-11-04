import React, { useState } from 'react';
import {
  Sliders,
  Filter,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Layers,
  HelpCircle,
  Plus,
  Minus,
  Ban,
  Check,
  Zap,
  Target,
  Clock,
  Compass,
} from 'lucide-react';
import {
  ALL_ENHANCED_RULES,
  EnhancedRuleDefinition,
  RulePhase,
} from '../services/enhancedFilterService.ts';

interface EnhancedRulesFilterControlsProps {
  selectedRuleIds: string[];
  onSelectRuleIds: (ruleIds: string[]) => void;
  negatedRuleIds?: string[];
  onNegateRuleIds?: (ruleIds: string[]) => void;
  ruleMatchMode: 'ALL' | 'ANY';
  onRuleMatchModeChange: (mode: 'ALL' | 'ANY') => void;
  minScore: number;
  maxScore: number;
  onScoreRangeChange: (min: number, max: number) => void;
  totalFilteredCount: number;
  totalAvailableCount: number;
  titlePrefix?: string;
}

export const EnhancedRulesFilterControls: React.FC<EnhancedRulesFilterControlsProps> = ({
  selectedRuleIds,
  onSelectRuleIds,
  negatedRuleIds = [],
  onNegateRuleIds,
  ruleMatchMode,
  onRuleMatchModeChange,
  minScore,
  maxScore,
  onScoreRangeChange,
  totalFilteredCount,
  totalAvailableCount,
  titlePrefix = 'Trade Lifecycle State Machine & Execution Matrix',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [engineTab, setEngineTab] = useState<'ALL' | 'UBER' | 'META' | 'ULTRA'>('ALL');
  const [phaseTab, setPhaseTab] = useState<
    'ALL' | 'PRE_ENTRY' | 'IN_FLIGHT' | 'RECOVERY_HOLD' | 'FINAL_EXIT' | 'COMBINATION_INVERSION'
  >('ALL');

  const isScoreFiltered = minScore > 0 || maxScore < 100;
  const isRulesFiltered = selectedRuleIds.length > 0 || negatedRuleIds.length > 0;
  const isAnyFilterActive = isScoreFiltered || isRulesFiltered;

  // Toggle rule state: NONE -> PASS -> NEGATE -> NONE
  const handleCycleRule = (ruleId: string) => {
    const isPass = selectedRuleIds.includes(ruleId);
    const isNeg = negatedRuleIds.includes(ruleId);

    if (!isPass && !isNeg) {
      onSelectRuleIds([...selectedRuleIds, ruleId]);
    } else if (isPass) {
      onSelectRuleIds(selectedRuleIds.filter((id) => id !== ruleId));
      if (onNegateRuleIds) {
        onNegateRuleIds([...negatedRuleIds, ruleId]);
      }
    } else if (isNeg) {
      if (onNegateRuleIds) {
        onNegateRuleIds(negatedRuleIds.filter((id) => id !== ruleId));
      }
    }
  };

  const handleSetRulePass = (ruleId: string) => {
    const isPass = selectedRuleIds.includes(ruleId);
    if (isPass) {
      onSelectRuleIds(selectedRuleIds.filter((id) => id !== ruleId));
    } else {
      onSelectRuleIds([...selectedRuleIds, ruleId]);
      if (onNegateRuleIds && negatedRuleIds.includes(ruleId)) {
        onNegateRuleIds(negatedRuleIds.filter((id) => id !== ruleId));
      }
    }
  };

  const handleSetRuleNegate = (ruleId: string) => {
    if (!onNegateRuleIds) return;
    const isNeg = negatedRuleIds.includes(ruleId);
    if (isNeg) {
      onNegateRuleIds(negatedRuleIds.filter((id) => id !== ruleId));
    } else {
      onNegateRuleIds([...negatedRuleIds, ruleId]);
      if (selectedRuleIds.includes(ruleId)) {
        onSelectRuleIds(selectedRuleIds.filter((id) => id !== ruleId));
      }
    }
  };

  const handleScorePreset = (min: number, max: number) => {
    onScoreRangeChange(min, max);
  };

  const handleSelectHighConfluenceCombinations = () => {
    const comboIds = [
      'combo_uber_expiry_cycle_93',
      'combo_ultra_cash_sweep_92',
      'combo_ultra_eq_recovery_91',
      'combo_ultra_fade_inversion_92',
    ];
    onSelectRuleIds(comboIds);
    onRuleMatchModeChange('ANY');
    if (onNegateRuleIds) onNegateRuleIds([]);
  };

  const handleSelectInversion = () => {
    onSelectRuleIds(['combo_ultra_fade_inversion_92']);
    onRuleMatchModeChange('ANY');
    if (onNegateRuleIds) onNegateRuleIds([]);
  };

  const handleResetFilters = () => {
    onSelectRuleIds([]);
    if (onNegateRuleIds) {
      onNegateRuleIds([]);
    }
    onRuleMatchModeChange('ALL');
    onScoreRangeChange(0, 100);
  };

  // Filtered rule definitions based on engine tab and lifecycle state / phase tab
  const displayedRules = ALL_ENHANCED_RULES.filter((r) => {
    const matchesEngine = engineTab === 'ALL' || r.engine === engineTab || r.engine === 'ALL';
    const matchesPhase =
      phaseTab === 'ALL' ||
      (phaseTab === 'COMBINATION_INVERSION' && (r.phase === 'COMBINATION' || r.phase === 'INVERSION')) ||
      r.phase === phaseTab;
    return matchesEngine && matchesPhase;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
      {/* Header / Summary Bar */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-850/60 transition bg-slate-950/40"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>{titlePrefix}</span>
                {isAnyFilterActive && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </h4>

              {/* Active Filter Badges in Header */}
              {isScoreFiltered && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
                  Pre-Entry Score: {minScore}%–{maxScore}%
                </span>
              )}
              {selectedRuleIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>+{selectedRuleIds.length} Required</span>
                </span>
              )}
              {negatedRuleIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1">
                  <Ban className="w-3 h-3 text-rose-400" />
                  <span>-{negatedRuleIds.length} Negated</span>
                </span>
              )}
              {isRulesFiltered && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                  {ruleMatchMode}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Anchored to Trade Lifecycle States: State 0 (Pre-Entry), State 1 (In-Flight), State 3 (Recovery Hold on M1 Loss), State 4 (Exit), &amp; &gt;90% Sets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-between sm:justify-end">
          <div className="font-mono text-slate-300 text-right">
            Matches: <strong className="text-emerald-400">{totalFilteredCount}</strong> /{' '}
            <span className="text-slate-500">{totalAvailableCount} trades</span>
          </div>
          {isAnyFilterActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleResetFilters();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/80 text-[11px] text-rose-300 font-semibold transition cursor-pointer"
              title="Reset all enhanced rules and score filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
          <button className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Controls Drawer */}
      {isOpen && (
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-5">
          {/* SECTION 1: QUICK COMBINATION & INVERSION SHORTCUTS */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between flex-wrap gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Quick Set Audits:
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSelectHighConfluenceCombinations}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>All &gt;90% Win Rate Combinations</span>
              </button>

              <button
                type="button"
                onClick={handleSelectInversion}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-700/80 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>92.3% Fade Inversion Signals</span>
              </button>

              <button
                type="button"
                onClick={() => handleScorePreset(85, 100)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/80 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Target className="w-3 h-3 text-indigo-400" />
                <span>Score &ge; 85% Optimal Only</span>
              </button>
            </div>
          </div>

          {/* SECTION 2: PRE-ENTRY SETUP QUALITY SCORE */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                1. Filter by Pre-Entry Setup Score (State 0 Quality):
              </span>

              {/* Quick Score Range Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-500 text-[11px]">Presets:</span>
                <button
                  onClick={() => handleScorePreset(0, 100)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    minScore === 0 && maxScore === 100
                      ? 'bg-slate-700 text-white font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  All (0–100%)
                </button>
                <button
                  onClick={() => handleScorePreset(85, 100)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    minScore === 85 && maxScore === 100
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : 'bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-800/80'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>&ge; 85% Optimal</span>
                </button>
                <button
                  onClick={() => handleScorePreset(70, 84)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    minScore === 70 && maxScore === 84
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  70%–84% (Moderate)
                </button>
                <button
                  onClick={() => handleScorePreset(0, 49)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    minScore === 0 && maxScore === 49
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  &lt; 50% (High Risk)
                </button>
              </div>
            </div>

            {/* Score Sliders & Inputs */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-slate-400 w-16">Min Score:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    onScoreRangeChange(val, Math.max(val, maxScore));
                  }}
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center font-bold text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-500">%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onScoreRangeChange(val, Math.max(val, maxScore));
                  }}
                  className="w-24 sm:w-32 accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-slate-400 w-16">Max Score:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={maxScore}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    onScoreRangeChange(Math.min(minScore, val), val);
                  }}
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center font-bold text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-500">%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={maxScore}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onScoreRangeChange(Math.min(minScore, val), val);
                  }}
                  className="w-24 sm:w-32 accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="text-slate-400 text-[11px] sm:ml-auto">
                Pre-Entry Quality Range: <strong className="text-emerald-400">{minScore}%</strong> to{' '}
                <strong className="text-emerald-400">{maxScore}%</strong>
              </div>
            </div>
          </div>

          {/* SECTION 3: SPECIFIC RULE MATRIX ANCHORED TO LIFECYCLE STATES */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                2. Lifecycle Rules &amp; Execution Matrix (Pass / Negate):
              </span>

              {/* Match Mode Toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <span className="text-slate-500 px-1.5 font-mono">Mode:</span>
                  <button
                    onClick={() => onRuleMatchModeChange('ALL')}
                    className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                      ruleMatchMode === 'ALL'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Trade must satisfy ALL specified rule conditions"
                  >
                    Match ALL (Strict)
                  </button>
                  <button
                    onClick={() => onRuleMatchModeChange('ANY')}
                    className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                      ruleMatchMode === 'ANY'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Trade must satisfy AT LEAST ONE specified rule condition"
                  >
                    Match ANY (Broad)
                  </button>
                </div>

                {(selectedRuleIds.length > 0 || negatedRuleIds.length > 0) && (
                  <button
                    onClick={() => {
                      onSelectRuleIds([]);
                      if (onNegateRuleIds) onNegateRuleIds([]);
                    }}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-medium underline cursor-pointer ml-1"
                  >
                    Clear Rules ({selectedRuleIds.length + negatedRuleIds.length})
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs: Engine & Lifecycle State */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-1">
              {/* Lifecycle State Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] flex-wrap">
                <span className="text-slate-500 px-1.5 font-mono">State:</span>
                {(
                  [
                    { key: 'ALL', label: 'All Lifecycle States' },
                    { key: 'PRE_ENTRY', label: 'State 0: Pre-Entry' },
                    { key: 'IN_FLIGHT', label: 'State 1: In-Flight' },
                    { key: 'RECOVERY_HOLD', label: 'State 3: Hold (Loss Only)' },
                    { key: 'FINAL_EXIT', label: 'State 4: Exit' },
                    { key: 'COMBINATION_INVERSION', label: '🌟 >90% Sets & Fade' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setPhaseTab(tab.key)}
                    className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                      phaseTab === tab.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Engine Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <span className="text-slate-500 px-1.5 font-mono">Engine:</span>
                {(['ALL', 'UBER', 'META', 'ULTRA'] as const).map((eng) => (
                  <button
                    key={eng}
                    onClick={() => setEngineTab(eng)}
                    className={`px-2.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                      engineTab === eng
                        ? eng === 'UBER'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : eng === 'META'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : eng === 'ULTRA'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-700 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {eng === 'ALL' ? 'All Engines' : eng}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Rules with Trigger, Eligible Pool, and Pass (+) / Negate (-) Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {displayedRules.map((rule: EnhancedRuleDefinition) => {
                const isPass = selectedRuleIds.includes(rule.id);
                const isNeg = negatedRuleIds.includes(rule.id);

                return (
                  <div
                    key={rule.id}
                    onClick={() => handleCycleRule(rule.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between gap-2 select-none ${
                      isPass
                        ? 'bg-emerald-950/60 border-emerald-500 shadow-sm text-white'
                        : isNeg
                        ? 'bg-rose-950/60 border-rose-500 shadow-sm text-white'
                        : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="font-bold text-xs truncate">{rule.name}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                              rule.engine === 'UBER'
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : rule.engine === 'META'
                                ? 'bg-teal-950 text-teal-300 border border-teal-800'
                                : rule.engine === 'ULTRA'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {rule.engine}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-300">
                            {rule.lifecycleState}
                          </span>
                        </div>

                        {/* Status Tag */}
                        {isPass && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-900 text-emerald-300 border border-emerald-600 flex items-center gap-0.5 shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            <span>MUST PASS</span>
                          </span>
                        )}
                        {isNeg && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-rose-900 text-rose-300 border border-rose-600 flex items-center gap-0.5 shrink-0">
                            <Ban className="w-2.5 h-2.5 stroke-[3]" />
                            <span>NEGATE (FAIL)</span>
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {rule.description}
                      </p>

                      <div className="grid grid-cols-1 gap-1 text-[10px] font-mono text-slate-500 pt-1.5">
                        <div className="truncate">
                          <span className="text-slate-400">[Trigger]:</span> {rule.triggerMoment}
                        </div>
                        <div className="truncate text-cyan-400/90">
                          <span className="text-slate-400">[Pool]:</span> {rule.eligiblePool}
                        </div>
                      </div>

                      {rule.confidenceText && (
                        <div className="text-[10px] font-mono text-emerald-400 mt-1">
                          Confidence: {rule.confidenceText}
                        </div>
                      )}
                    </div>

                    {/* Action Bar for this rule */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px]"
                    >
                      <span className="text-slate-500">Click to cycle or select:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetRulePass(rule.id)}
                          className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-0.5 ${
                            isPass
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-700'
                          }`}
                          title="Require trade to satisfy this rule (+)"
                        >
                          <Plus className="w-2.5 h-2.5 stroke-[3]" />
                          <span>Pass</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetRuleNegate(rule.id)}
                          className={`px-2 py-0.5 rounded font-bold transition cursor-pointer flex items-center gap-0.5 ${
                            isNeg
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700'
                          }`}
                          title="Negate: Require trade to NOT satisfy this rule (-)"
                        >
                          <Minus className="w-2.5 h-2.5 stroke-[3]" />
                          <span>Negate</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(selectedRuleIds.length > 0 || negatedRuleIds.length > 0) && (
              <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50 flex items-center justify-between text-xs text-indigo-300 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Active Rule Conditions ({ruleMatchMode} Mode):{' '}
                    {selectedRuleIds.length > 0 && (
                      <strong className="text-emerald-400">+{selectedRuleIds.length} Required</strong>
                    )}
                    {selectedRuleIds.length > 0 && negatedRuleIds.length > 0 && ', '}
                    {negatedRuleIds.length > 0 && (
                      <strong className="text-rose-400">-{negatedRuleIds.length} Negated</strong>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => {
                    onSelectRuleIds([]);
                    if (onNegateRuleIds) onNegateRuleIds([]);
                  }}
                  className="text-xs text-indigo-400 hover:text-white underline cursor-pointer"
                >
                  Clear All Rules
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
