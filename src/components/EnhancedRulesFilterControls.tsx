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
} from 'lucide-react';
import {
  ALL_ENHANCED_RULES,
  EnhancedRuleDefinition,
} from '../services/enhancedFilterService.ts';

interface EnhancedRulesFilterControlsProps {
  selectedRuleIds: string[];
  onSelectRuleIds: (ruleIds: string[]) => void;
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
  ruleMatchMode,
  onRuleMatchModeChange,
  minScore,
  maxScore,
  onScoreRangeChange,
  totalFilteredCount,
  totalAvailableCount,
  titlePrefix = 'Enhanced Observation Rules & Score Filter',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [engineTab, setEngineTab] = useState<'ALL' | 'UBER' | 'META' | 'ULTRA'>('ALL');

  const isScoreFiltered = minScore > 0 || maxScore < 100;
  const isRulesFiltered = selectedRuleIds.length > 0;
  const isAnyFilterActive = isScoreFiltered || isRulesFiltered;

  // Toggle individual rule
  const handleToggleRule = (ruleId: string) => {
    if (selectedRuleIds.includes(ruleId)) {
      onSelectRuleIds(selectedRuleIds.filter((id) => id !== ruleId));
    } else {
      onSelectRuleIds([...selectedRuleIds, ruleId]);
    }
  };

  // Quick preset score buttons
  const handleScorePreset = (min: number, max: number) => {
    onScoreRangeChange(min, max);
  };

  // Reset all enhanced filters
  const handleResetFilters = () => {
    onSelectRuleIds([]);
    onRuleMatchModeChange('ALL');
    onScoreRangeChange(0, 100);
  };

  // Filtered rule definitions based on engine tab
  const displayedRules =
    engineTab === 'ALL'
      ? ALL_ENHANCED_RULES
      : ALL_ENHANCED_RULES.filter((r) => r.engine === engineTab);

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
                  Score: {minScore}% – {maxScore}%
                </span>
              )}

              {isRulesFiltered && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-700">
                  {selectedRuleIds.length} Rule{selectedRuleIds.length > 1 ? 's' : ''} ({ruleMatchMode})
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-0.5">
              Filter trades by single or combined rules (Inverted Alignment, Compression, Timing, etc.) and fine-tune score brackets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
          <div className="text-right text-[11px] font-mono">
            <span className="text-slate-400">Matches: </span>
            <strong className="text-emerald-400 font-bold">{totalFilteredCount}</strong>
            <span className="text-slate-500"> / {totalAvailableCount} trades</span>
          </div>

          {isAnyFilterActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleResetFilters();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-[10px] font-semibold border border-rose-900/50 transition cursor-pointer"
              title="Reset enhanced rules and score filters to default"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          <div className="p-1 rounded-lg bg-slate-800 text-slate-400">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded Controls Panel */}
      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-slate-800 space-y-5 bg-slate-900/40 animate-in fade-in duration-150">
          {/* SECTION 1: ENHANCED RULE SCORE RANGE FILTER */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                1. Enhanced Rule Score Range:
              </span>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1 flex-wrap text-xs">
                <span className="text-[10px] text-slate-400 mr-1 font-mono">Presets:</span>
                {[
                  { label: 'All (0–100%)', min: 0, max: 100 },
                  { label: '≥ 85% (Optimal)', min: 85, max: 100 },
                  { label: '70% – 84%', min: 70, max: 84 },
                  { label: '50% – 69%', min: 50, max: 69 },
                  { label: '< 50%', min: 0, max: 49 },
                ].map((p) => {
                  const isActive = minScore === p.min && maxScore === p.max;
                  return (
                    <button
                      key={p.label}
                      onClick={() => handleScorePreset(p.min, p.max)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Range Sliders & Inputs */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-slate-400">Min Score:</span>
                <input
                  type="number"
                  min={0}
                  max={maxScore}
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
                <span className="text-slate-400">Max Score:</span>
                <input
                  type="number"
                  min={minScore}
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
                Active Range: <strong className="text-emerald-400">{minScore}%</strong> to{' '}
                <strong className="text-emerald-400">{maxScore}%</strong>
              </div>
            </div>
          </div>

          {/* SECTION 2: SPECIFIC RULE OR COMBINATION OF RULES */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                2. Select Specific Rule or Combination of Rules:
              </span>

              {/* Engine Sub-Tabs & Match Mode */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Match Mode Toggle */}
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <span className="text-slate-500 px-1.5 font-mono">Mode:</span>
                  <button
                    onClick={() => onRuleMatchModeChange('ALL')}
                    className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                      ruleMatchMode === 'ALL'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Trade must pass ALL selected rules"
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
                    title="Trade must pass AT LEAST ONE of selected rules"
                  >
                    Match ANY (Broad)
                  </button>
                </div>

                {/* Engine Selector */}
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  {(['ALL', 'UBER', 'META', 'ULTRA'] as const).map((eng) => (
                    <button
                      key={eng}
                      onClick={() => setEngineTab(eng)}
                      className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                        engineTab === eng
                          ? eng === 'UBER'
                            ? 'bg-purple-900 text-purple-200'
                            : eng === 'META'
                            ? 'bg-teal-900 text-teal-200'
                            : eng === 'ULTRA'
                            ? 'bg-amber-900 text-amber-200'
                            : 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {eng === 'ALL' ? 'All Rules' : eng}
                    </button>
                  ))}
                </div>

                {selectedRuleIds.length > 0 && (
                  <button
                    onClick={() => onSelectRuleIds([])}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-medium underline cursor-pointer ml-1"
                  >
                    Clear Rules ({selectedRuleIds.length})
                  </button>
                )}
              </div>
            </div>

            {/* List of Rules with Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {displayedRules.map((rule: EnhancedRuleDefinition) => {
                const isSelected = selectedRuleIds.includes(rule.id);
                return (
                  <div
                    key={rule.id}
                    onClick={() => handleToggleRule(rule.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-start gap-2.5 select-none ${
                      isSelected
                        ? 'bg-indigo-950/70 border-indigo-500 shadow-sm text-white'
                        : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Handled by container onClick
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs truncate">{rule.name}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                            rule.engine === 'UBER'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : rule.engine === 'META'
                              ? 'bg-teal-950 text-teal-300 border border-teal-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {rule.engine}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {rule.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedRuleIds.length > 0 && (
              <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50 flex items-center justify-between text-xs text-indigo-300 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Listing trades that pass <strong>{ruleMatchMode === 'ALL' ? 'ALL' : 'ANY'}</strong> of the{' '}
                    <strong>{selectedRuleIds.length}</strong> selected rule(s).
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {totalFilteredCount} matching trade(s) update all KPIs and tables
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
