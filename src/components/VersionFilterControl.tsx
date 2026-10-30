import React from 'react';
import { Layers, Plus, Minus, RotateCcw, Check, Ban } from 'lucide-react';

export type VersionFilterMode = 'INCLUDE' | 'NEGATE' | 'NONE';

interface VersionFilterControlProps {
  versionStates: Record<string, VersionFilterMode>;
  onChangeVersionStates: (states: Record<string, VersionFilterMode>) => void;
  availableVersions?: string[];
  compact?: boolean;
}

export const VersionFilterControl: React.FC<VersionFilterControlProps> = ({
  versionStates,
  onChangeVersionStates,
  availableVersions = ['ULTRA', 'UBER', 'META_THURSDAY'],
  compact = false,
}) => {
  // Normalize known standard versions and any dynamic custom versions
  const coreVersions = ['ULTRA', 'UBER', 'META_THURSDAY'];
  const allUniqueVersions = Array.from(
    new Set([
      ...coreVersions,
      ...availableVersions.map((v) => v.toUpperCase().trim()).filter(Boolean),
    ])
  );

  const getMode = (v: string): VersionFilterMode => {
    return versionStates[v] || 'NONE';
  };

  const handleSetMode = (v: string, mode: VersionFilterMode) => {
    const next = { ...versionStates, [v]: mode };
    onChangeVersionStates(next);
  };

  // Cycle: NONE -> INCLUDE -> NEGATE -> NONE
  const handleCycleMode = (v: string) => {
    const current = getMode(v);
    let next: VersionFilterMode = 'INCLUDE';
    if (current === 'INCLUDE') next = 'NEGATE';
    else if (current === 'NEGATE') next = 'NONE';
    else next = 'INCLUDE';
    handleSetMode(v, next);
  };

  // Quick Preset Handlers
  const handlePreset = (preset: 'ultra_uber' | 'ultra_only' | 'uber_only' | 'meta_only' | 'negate_uber' | 'reset') => {
    const next: Record<string, VersionFilterMode> = {};
    allUniqueVersions.forEach((v) => {
      next[v] = 'NONE';
    });

    if (preset === 'ultra_uber') {
      next['ULTRA'] = 'INCLUDE';
      next['UBER'] = 'INCLUDE';
    } else if (preset === 'ultra_only') {
      next['ULTRA'] = 'INCLUDE';
      next['UBER'] = 'NEGATE';
    } else if (preset === 'uber_only') {
      next['UBER'] = 'INCLUDE';
      next['ULTRA'] = 'NEGATE';
    } else if (preset === 'meta_only') {
      next['META_THURSDAY'] = 'INCLUDE';
      next['UBER'] = 'NEGATE';
    } else if (preset === 'negate_uber') {
      next['UBER'] = 'NEGATE'; // Kept all other versions!
    } else if (preset === 'reset') {
      // All NONE
    }
    onChangeVersionStates(next);
  };

  const activeIncludes = allUniqueVersions.filter((v) => getMode(v) === 'INCLUDE');
  const activeNegates = allUniqueVersions.filter((v) => getMode(v) === 'NEGATE');
  const isAnyFilterActive = activeIncludes.length > 0 || activeNegates.length > 0;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs w-full">
      {/* Version Chips with Include/Negate Toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1 shrink-0">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>Versions:</span>
        </span>

        {allUniqueVersions.map((v) => {
          const mode = getMode(v);
          const isInc = mode === 'INCLUDE';
          const isNeg = mode === 'NEGATE';

          return (
            <div
              key={v}
              className={`inline-flex items-center rounded-xl border transition shadow-sm select-none ${
                isInc
                  ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-emerald-950/40'
                  : isNeg
                  ? 'bg-rose-950/80 border-rose-500 text-white shadow-rose-950/40'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              {/* Main Version Label button (cycles state) */}
              <button
                type="button"
                onClick={() => handleCycleMode(v)}
                title={`Click to cycle: ${v} (Currently ${mode})`}
                className="px-2.5 py-1 text-xs font-semibold cursor-pointer flex items-center gap-1.5 focus:outline-none"
              >
                {isInc && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 stroke-[2.5]" />}
                {isNeg && <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0 stroke-[2.5]" />}
                <span>{v.replace(/_/g, ' ')}</span>
              </button>

              {/* Dedicated Toggle Controls for Include (+) & Negate (-) */}
              <div className="flex items-center border-l border-slate-800/80 pr-1 pl-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetMode(v, isInc ? 'NONE' : 'INCLUDE');
                  }}
                  title={`Include ${v} (+)`}
                  className={`p-1 rounded-lg transition cursor-pointer text-[10px] font-bold ${
                    isInc
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                  }`}
                >
                  <Plus className="w-3 h-3 stroke-[3]" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetMode(v, isNeg ? 'NONE' : 'NEGATE');
                  }}
                  title={`Negate ${v} (Exclude -)`}
                  className={`p-1 rounded-lg transition cursor-pointer text-[10px] font-bold ${
                    isNeg
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
                  }`}
                >
                  <Minus className="w-3 h-3 stroke-[3]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Presets & Reset */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-slate-500 text-[10px] uppercase tracking-wider font-mono">Presets:</span>
        <button
          type="button"
          onClick={() => handlePreset('ultra_uber')}
          className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white transition cursor-pointer"
        >
          Ultra & Uber
        </button>
        <button
          type="button"
          onClick={() => handlePreset('ultra_only')}
          className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white transition cursor-pointer"
        >
          +Ultra, -Uber
        </button>
        <button
          type="button"
          onClick={() => handlePreset('negate_uber')}
          title="All trades EXCEPT Uber"
          className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-amber-300 hover:text-amber-200 transition cursor-pointer"
        >
          -Uber Only
        </button>
        <button
          type="button"
          onClick={() => handlePreset('meta_only')}
          className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-teal-300 hover:text-teal-200 transition cursor-pointer"
        >
          Meta Thursday
        </button>
        {isAnyFilterActive && (
          <button
            type="button"
            onClick={() => handlePreset('reset')}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/80 text-[11px] text-rose-300 font-semibold transition cursor-pointer"
            title="Reset version filters to show all"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
};
