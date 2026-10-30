import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Radio,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Target,
  ShieldAlert,
  BarChart2,
  Eye,
  Layers,
} from 'lucide-react';
import { TradeSignal, TradeMilestoneAnalysis } from '../types/trade.ts';
import { UpstoxApiService } from '../services/upstoxApi.ts';
import { getInstrumentConfig } from '../config/instrumentConfig.ts';
import { EnhancedFilterService } from '../services/enhancedFilterService.ts';
import { EnhancedFilterBadge } from './EnhancedFilterBadge.tsx';
import { TradeNoteEditor } from './TradeNoteEditor.tsx';
import { HighConfluenceAnalyticsCard } from './HighConfluenceAnalyticsCard.tsx';
import { EnhancedRulesFilterControls } from './EnhancedRulesFilterControls.tsx';

interface LiveTrackerPanelProps {
  onOpenChart: (analysis: TradeMilestoneAnalysis) => void;
  initialTrades?: TradeSignal[];
}

export const LiveTrackerPanel: React.FC<LiveTrackerPanelProps> = ({
  onOpenChart,
  initialTrades = [],
}) => {
  const todayIST = UpstoxApiService.toISTDate(Date.now());
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [pollIntervalSec, setPollIntervalSec] = useState<number>(5);
  const [targetUrl, setTargetUrl] = useState(`http://13.232.16.180:8000/signals_today_${todayIST}.json`);

  // Live state
  const [lastPollTime, setLastPollTime] = useState<string>('');
  const [pollCount, setPollCount] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1-minute batch candle refresh state for pending M1 & M2 (Requirement 4)
  const [isBatchRefreshingCandles, setIsBatchRefreshingCandles] = useState(false);
  const [lastBatchCandleRefreshTime, setLastBatchCandleRefreshTime] = useState<string>('');
  const [batchCandleRefreshStatus, setBatchCandleRefreshStatus] = useState<string | null>(null);
  const batchCandleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Raw & Processed data (filter initialTrades to todayIST only to prevent Oct 27 flash)
  const [liveTrades, setLiveTrades] = useState<TradeSignal[]>(() => {
    return initialTrades.filter((t) => UpstoxApiService.toISTDate(t.timestamp) === todayIST);
  });
  const [liveAnalyses, setLiveAnalyses] = useState<TradeMilestoneAnalysis[]>([]);
  const [previousTradesCount, setPreviousTradesCount] = useState(() => {
    return initialTrades.filter((t) => UpstoxApiService.toISTDate(t.timestamp) === todayIST).length;
  });
  const [newTradesAlert, setNewTradesAlert] = useState<number>(0);

  // Version filter presets for live pipeline: ultra_uber, meta_thursday, ultra, uber, all
  const [selectedPreset, setSelectedPreset] = useState<'ultra_uber' | 'meta_thursday' | 'ultra' | 'uber' | 'all'>('ultra_uber');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'PROFIT' | 'LOSS' | 'CANCELLED'>('ALL');
  const [showHighConfluenceOnly, setShowHighConfluenceOnly] = useState(false);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [ruleMatchMode, setRuleMatchMode] = useState<'ALL' | 'ANY'>('ALL');
  const [minScore, setMinScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(100);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Active Date for Live Tracker (Defaults to current IST date)
  const [selectedDate, setSelectedDate] = useState<string>(todayIST);
  const [volumeOnly, setVolumeOnly] = useState(true);

  // Preset version mapping helper
  const getFilterVersions = useCallback((preset: string): string[] => {
    switch (preset) {
      case 'meta_thursday':
        return ['META_THURSDAY'];
      case 'ultra':
        return ['ULTRA'];
      case 'uber':
        return ['UBER'];
      case 'ultra_uber':
        return ['ULTRA', 'UBER'];
      case 'all':
      default:
        return ['ULTRA', 'UBER', 'META_THURSDAY'];
    }
  }, []);

  // Evaluate milestones by calling the backend Command 2 endpoint
  const evaluateTradesMilestones = async (tradesToAnalyze: TradeSignal[]) => {
    try {
      // Analyze all 3 presets by default so switching between presets in UI is instantaneous
      const res = await fetch('/api/command2/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades: tradesToAnalyze,
          versionFilters: ['ULTRA', 'UBER', 'META_THURSDAY'],
          useAllVersions: false,
          volumeTradesOnly: volumeOnly,
        }),
      });
      const data = await res.json();
      if (data.result?.analyses && Array.isArray(data.result.analyses)) {
        setLiveAnalyses(data.result.analyses);
      }
    } catch (e) {
      console.error('Error evaluating live milestones:', e);
    }
  };

  // Core polling function
  const pollLiveData = async () => {
    if (isPolling) return;
    setIsPolling(true);
    setErrorMessage(null);

    const todayIST = selectedDate || UpstoxApiService.toISTDate(Date.now());
    const pollUrl = targetUrl.includes('signals_today_')
      ? targetUrl.replace(/signals_today_\d{4}-\d{2}-\d{2}\.json/, `signals_today_${todayIST}.json`)
      : targetUrl;

    try {
      const res = await fetch(`/api/live/poll?url=${encodeURIComponent(pollUrl)}`);
      const data = await res.json();

      setPollCount((prev) => prev + 1);
      setLastPollTime(data.polledAtIST || UpstoxApiService.toISTString(Date.now()));

      if (data.offline) {
        setIsServerOffline(true);
        setErrorMessage(data.error || 'Remote signals server offline. Retrying automatically in background...');
      } else if (data.success && Array.isArray(data.trades)) {
        setIsServerOffline(false);
        const incomingTrades: TradeSignal[] = data.trades;

        // Requirement 5: Only trades belonging to current date should be dynamically fetched & listed
        const dateFilteredTrades = incomingTrades.filter((t) => {
          const tDate = UpstoxApiService.toISTDate(t.timestamp);
          return tDate === todayIST;
        });

        // Filter volume-based trades only (Requirement 4)
        const finalLiveTrades = volumeOnly
          ? dateFilteredTrades.filter((t) => t && t.threshold > 0 && t.bar_type !== 'price')
          : dateFilteredTrades;

        // Check if new trades arrived
        if (finalLiveTrades.length > previousTradesCount && previousTradesCount > 0) {
          const diff = finalLiveTrades.length - previousTradesCount;
          setNewTradesAlert(diff);
          setTimeout(() => setNewTradesAlert(0), 4000);
        }
        setPreviousTradesCount(finalLiveTrades.length);
        setLiveTrades(finalLiveTrades);

        // Run Command 2 milestone pipeline on the incoming live trades
        await evaluateTradesMilestones(finalLiveTrades);
        // Also trigger automatic 1m candle batch refresh for any pending instruments
        batchRefreshPendingCandles();
      } else {
        setErrorMessage(data.error || 'Invalid response from live poll');
      }
    } catch (err: unknown) {
      setIsServerOffline(true);
      setErrorMessage(err instanceof Error ? err.message : 'Network error during live poll');
    } finally {
      setIsPolling(false);
    }
  };

  // Setup interval polling
  useEffect(() => {
    if (isLiveActive) {
      pollLiveData();
      timerRef.current = setInterval(pollLiveData, pollIntervalSec * 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLiveActive, pollIntervalSec, targetUrl]);

  // Initial computation if trades already present
  useEffect(() => {
    if (liveTrades.length > 0 && liveAnalyses.length === 0) {
      evaluateTradesMilestones(liveTrades);
    }
  }, [liveTrades]);

  // Batch refresh 1-minute candles for all instruments with pending M1 or M2 (Requirement 4)
  const batchRefreshPendingCandles = useCallback(async () => {
    // Find instruments with pending M1 or pending M2
    const pendingInstruments = Array.from(
      new Set(
        liveAnalyses
          .filter((a) => !a.milestone1 || !a.milestone2 || a.milestone2.type === 'PENDING')
          .map((a) => a.trade.instrument)
      )
    );

    if (pendingInstruments.length === 0) return;

    setIsBatchRefreshingCandles(true);
    try {
      const today = selectedDate || todayIST;
      const res = await fetch('/api/live/batch-refresh-candles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentKeys: pendingInstruments,
          date: today,
        }),
      });
      const data = await res.json();
      const timeStr = UpstoxApiService.toISTString(Date.now()).split(' ')[1] || '';
      setLastBatchCandleRefreshTime(timeStr);
      setBatchCandleRefreshStatus(`Updated 1m candles for ${data.refreshedCount ?? pendingInstruments.length} pending instruments at ${timeStr}`);

      // Re-evaluate milestones with the freshly saved 1m candles!
      if (liveTrades.length > 0) {
        await evaluateTradesMilestones(liveTrades);
      }
    } catch (e) {
      console.error('Failed 1m batch candle refresh:', e);
    } finally {
      setIsBatchRefreshingCandles(false);
    }
  }, [liveAnalyses, liveTrades, selectedDate, todayIST, volumeOnly]);

  // Setup 1-minute (60s) batch request for instruments with pending M1 & M2
  useEffect(() => {
    if (isLiveActive) {
      batchCandleTimerRef.current = setInterval(() => {
        batchRefreshPendingCandles();
      }, 60000);
    } else {
      if (batchCandleTimerRef.current) {
        clearInterval(batchCandleTimerRef.current);
        batchCandleTimerRef.current = null;
      }
    }

    return () => {
      if (batchCandleTimerRef.current) {
        clearInterval(batchCandleTimerRef.current);
        batchCandleTimerRef.current = null;
      }
    };
  }, [isLiveActive, batchRefreshPendingCandles]);

  // Dynamically filtered live analyses based on version preset & outcome filter (Requirement 6, 8, 9)
  const displayedAnalyses = useMemo(() => {
    return liveAnalyses.filter((a: TradeMilestoneAnalysis) => {
      // 1. Version filter preset
      const v = (a.trade.version || '').toLowerCase();
      let matchVersion = true;
      if (selectedPreset === 'meta_thursday') {
        matchVersion = v.includes('meta_thursday');
      } else if (selectedPreset === 'ultra_uber') {
        matchVersion = v.includes('ultra') || v.includes('uber');
      } else if (selectedPreset === 'ultra') {
        matchVersion = v.includes('ultra');
      } else if (selectedPreset === 'uber') {
        matchVersion = v.includes('uber');
      } else if (selectedPreset === 'all') {
        matchVersion = v.includes('ultra') || v.includes('uber') || v.includes('meta_thursday');
      }

      if (!matchVersion) return false;

      // 2. Outcome / Status filter
      if (outcomeFilter === 'PROFIT') {
        if (!a.isSuccess) return false;
      } else if (outcomeFilter === 'LOSS') {
        if (a.isSuccess || a.milestone1 === null) return false;
      } else if (outcomeFilter === 'CANCELLED') {
        if ((a.trade.status || '').toLowerCase() !== 'cancelled') return false;
      }

      // 3. High Confluence filter shortcut (Score >= 85%)
      if (showHighConfluenceOnly) {
        const evaluation = EnhancedFilterService.evaluate(a, liveAnalyses);
        if (!evaluation.isHighConfluence) return false;
      }

      // 4. Specific Enhanced Rule(s) and Score Range Filter
      const matchesEnhanced = EnhancedFilterService.matchesEnhancedFilters(
        a,
        selectedRuleIds,
        ruleMatchMode,
        minScore,
        maxScore,
        liveAnalyses
      );
      if (!matchesEnhanced) return false;

      return true;
    });
  }, [
    liveAnalyses,
    selectedPreset,
    outcomeFilter,
    showHighConfluenceOnly,
    selectedRuleIds,
    ruleMatchMode,
    minScore,
    maxScore,
  ]);

  // Enhanced aggregated analytics for Score >= 85% breakdown (reflecting active filtered trades)
  const enhancedSummary = useMemo(() => {
    return EnhancedFilterService.computeAggregatedAnalytics(displayedAnalyses);
  }, [displayedAnalyses]);

  // Derived live KPI statistics strictly reflecting the filtered analyses (Requirement 7, 8, 9)
  const totalAnalyzed = displayedAnalyses.length;
  const wins = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.isSuccess).length;
  const losses = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => !a.isSuccess && a.milestone1 !== null).length;
  const cancelledCount = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => (a.trade.status || '').toLowerCase() === 'cancelled').length;
  const winRate = totalAnalyzed > 0 ? ((wins / totalAnalyzed) * 100).toFixed(1) : '0.0';

  const analysesWithM1 = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.milestone1 !== null);
  const avgM1Ticks =
    analysesWithM1.length > 0
      ? (analysesWithM1.reduce((acc: number, a: TradeMilestoneAnalysis) => acc + (a.milestone1?.ticks || 0), 0) / analysesWithM1.length).toFixed(1)
      : '0.0';

  const m2Achieved = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.milestone2 && a.milestone2.type !== 'PENDING');
  const m2Hits = m2Achieved.length;
  const avgM2Ticks =
    m2Hits > 0
      ? (m2Achieved.reduce((acc: number, a: TradeMilestoneAnalysis) => acc + (a.milestone2?.ticks || 0), 0) / m2Hits).toFixed(1)
      : '0.0';

  // Requirement 8: Avg Time to M2
  const totalM2TimeMs = m2Achieved.reduce((sum: number, a: TradeMilestoneAnalysis) => sum + (a.milestone2?.timeTakenMs || 0), 0);
  const avgM2TimeMs = m2Hits > 0 ? totalM2TimeMs / m2Hits : 0;
  const avgTimeM2Formatted =
    m2Hits > 0
      ? `${Math.floor(avgM2TimeMs / 60000)}m ${Math.floor((avgM2TimeMs % 60000) / 1000)}s`
      : 'N/A';

  // Excursion statistics
  const analysesWithDrawdown = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.drawdown && a.drawdown.maxLossMultiple > 0);
  const maxAdverseDrawdown =
    analysesWithDrawdown.length > 0
      ? Math.max(...analysesWithDrawdown.map((a: TradeMilestoneAnalysis) => a.drawdown.maxLossMultiple)).toFixed(1)
      : '1.0';

  return (
    <div className="space-y-6">
      {/* Live Pipeline Top Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold transition ${
                  isLiveActive && !isServerOffline
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : isServerOffline
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Radio className={`w-5 h-5 ${isLiveActive && !isServerOffline ? 'animate-pulse' : ''}`} />
              </div>
              {isLiveActive && !isServerOffline && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Live Pipeline Tracker</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isLiveActive && !isServerOffline
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : isServerOffline
                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {isLiveActive && !isServerOffline
                    ? `POLLING EVERY ${pollIntervalSec}s`
                    : isServerOffline
                    ? 'OFFLINE (RETRYING)'
                    : 'PAUSED'}
                </span>
                {newTradesAlert > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 animate-bounce">
                    +{newTradesAlert} NEW TRADES
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Target: <span className="text-cyan-400">{targetUrl}</span>
              </p>
            </div>
          </div>

          {/* Action buttons & interval */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Interval selector */}
            <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 font-medium">Interval:</span>
              {[3, 5, 10].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setPollIntervalSec(sec)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    pollIntervalSec === sec
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            {/* Toggle Start / Pause */}
            <button
              onClick={() => setIsLiveActive((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isLiveActive
                  ? 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
              }`}
            >
              {isLiveActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isLiveActive ? 'Pause Polling' : 'Resume Live'}</span>
            </button>

            {/* 1m Batch Candle Refresh (Requirement 4) */}
            <button
              onClick={() => batchRefreshPendingCandles()}
              disabled={isBatchRefreshingCandles}
              title="Fetches 1-minute historical candles from Upstox for all instruments with pending M1 or M2"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBatchRefreshingCandles ? 'animate-spin text-cyan-400' : ''}`} />
              <span>1m Candle Batch Sync</span>
              {Array.from(new Set(liveAnalyses.filter((a) => !a.milestone1 || !a.milestone2 || a.milestone2.type === 'PENDING').map((a) => a.trade.instrument))).length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-900 text-[10px] text-cyan-200">
                  {Array.from(new Set(liveAnalyses.filter((a) => !a.milestone1 || !a.milestone2 || a.milestone2.type === 'PENDING').map((a) => a.trade.instrument))).length} pending
                </span>
              )}
            </button>

            {/* Manual Poll Now */}
            <button
              onClick={pollLiveData}
              disabled={isPolling}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold transition cursor-pointer border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Poll Now</span>
            </button>
          </div>
        </div>

        {/* Status Line */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800 gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Total Polls: <strong className="text-slate-200 font-mono">{pollCount}</strong>
            </span>
            <span>
              Last Polled: <strong className="text-cyan-400 font-mono">{lastPollTime || 'Never'}</strong>
            </span>
            <span>
              Live Signals in Stream: <strong className="text-slate-200 font-mono">{liveTrades.length}</strong>
            </span>
            <span>
              1m Candle Sync: <strong className="text-emerald-400 font-mono">{lastBatchCandleRefreshTime ? `${lastBatchCandleRefreshTime}` : 'Every 60s'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">Preset:</span>
            {(
              [
                { id: 'ultra_uber', label: 'Ultra & Uber' },
                { id: 'meta_thursday', label: 'Meta Thursday' },
                { id: 'ultra', label: 'Ultra Only' },
                { id: 'uber', label: 'Uber Only' },
                { id: 'all', label: 'All 3' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPreset(p.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                  selectedPreset === p.id
                    ? p.id === 'meta_thursday'
                      ? 'bg-teal-900 text-teal-200 border-teal-500 shadow-sm'
                      : 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Outcome Filter Toolbar */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Outcome:</span>
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'PROFIT', label: 'Profit Trades (Wins)' },
                { id: 'LOSS', label: 'Loss Trades (Adverse)' },
                { id: 'CANCELLED', label: 'Cancelled Trades' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setOutcomeFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  outcomeFilter === tab.id
                    ? tab.id === 'PROFIT'
                      ? 'bg-emerald-600 text-white'
                      : tab.id === 'LOSS'
                      ? 'bg-rose-600 text-white'
                      : tab.id === 'CANCELLED'
                      ? 'bg-amber-600 text-white'
                      : 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-slate-400 text-[11px] font-mono">
            Showing <strong className="text-slate-200">{displayedAnalyses.length}</strong> of{' '}
            <strong className="text-slate-400">{liveAnalyses.length}</strong> live trades
          </div>
        </div>

        {/* Offline Alert Notice */}
        {isServerOffline && (
          <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-center gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <strong>Remote link is offline or unreachable:</strong> {errorMessage}. The live tracker will keep retrying every {pollIntervalSec}s. Existing data and candle calculations remain available.
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Rule Combination & Score Range Filter Controls */}
      <EnhancedRulesFilterControls
        selectedRuleIds={selectedRuleIds}
        onSelectRuleIds={setSelectedRuleIds}
        ruleMatchMode={ruleMatchMode}
        onRuleMatchModeChange={setRuleMatchMode}
        minScore={minScore}
        maxScore={maxScore}
        onScoreRangeChange={(min, max) => {
          setMinScore(min);
          setMaxScore(max);
          if (min >= 85) {
            setShowHighConfluenceOnly(true);
          } else if (showHighConfluenceOnly) {
            setShowHighConfluenceOnly(false);
          }
        }}
        totalFilteredCount={displayedAnalyses.length}
        totalAvailableCount={liveAnalyses.length}
        titlePrefix="Live Tracker: Enhanced Rules & Score Range Filter"
      />

      {/* High Confluence (Score >= 85%) Analytics Card */}
      <HighConfluenceAnalyticsCard
        summary={enhancedSummary}
        isFilterActive={showHighConfluenceOnly || minScore >= 85}
        onToggleFilter={() => {
          if (showHighConfluenceOnly || minScore >= 85) {
            setShowHighConfluenceOnly(false);
            setMinScore(0);
            setMaxScore(100);
          } else {
            setShowHighConfluenceOnly(true);
            setMinScore(85);
            setMaxScore(100);
          }
        }}
      />

      {/* Live KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Live Win Rate (M1)</span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{winRate}%</div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{wins}W / {losses}L of {totalAnalyzed} filtered</span>
            {cancelledCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-rose-950/80 text-[10px] text-rose-300 border border-rose-800/60 font-semibold">
                {cancelledCount} Cancelled
              </span>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Avg M1 Speed Ticks</span>
            <BarChart2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{avgM1Ticks}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">volumeSum / threshold</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>M2 Follow-through & Time</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {totalAnalyzed > 0 ? ((m2Hits / totalAnalyzed) * 100).toFixed(1) : '0'}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {m2Hits} hit M2 • Avg Time: <strong className="text-indigo-300 font-mono">{avgTimeM2Formatted}</strong>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Max Adverse Loss Multiple</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{maxAdverseDrawdown}x</div>
          <div className="text-[11px] text-slate-500 mt-0.5">drawdown multiple before target</div>
        </div>
      </div>

      {/* Live Signals & Milestones Stream Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Live Trade Milestone Analysis</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {displayedAnalyses.length} trades
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Evaluated strictly with 1-min Upstox candle data, volumeSum / threshold ticks, and IST timestamps.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-3">Trade / Version</th>
                <th className="py-3 px-3">Signal IST Time</th>
                <th className="py-3 px-3">Entry / SL / TP</th>
                <th className="py-3 px-3 bg-indigo-950/20 text-indigo-300">Enhanced Rules & Score</th>
                <th className="py-3 px-3">Milestone 1</th>
                <th className="py-3 px-3">M1 Time / Ticks</th>
                <th className="py-3 px-3">Milestone 2</th>
                <th className="py-3 px-3">Max Profit / Loss & Crossings</th>
                <th className="py-3 px-3 text-center">Notes</th>
                <th className="py-3 px-3 text-right">Chart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 font-mono">
              {displayedAnalyses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 font-sans">
                    No trades match the current preset ({selectedPreset}) and outcome filter ({outcomeFilter}).
                  </td>
                </tr>
              ) : (
                displayedAnalyses.map((analysis: TradeMilestoneAnalysis, aIdx: number) => {
                  const { trade, milestone1, milestone2, drawdown, entryIndicators } = analysis;
                  const vLower = (trade.version || '').toLowerCase();
                  const isUltra = vLower.includes('ultra');
                  const isUber = vLower.includes('uber');
                  const isMetaThursday = vLower.includes('meta_thursday');
                  const isCancelled = (trade.status || '').toLowerCase() === 'cancelled';
                  const enhancedEval = EnhancedFilterService.evaluate(analysis, liveAnalyses);

                  return (
                    <tr
                      key={`${trade.instrument}_${trade.timestamp}_${aIdx}`}
                      className="hover:bg-slate-800/40 transition"
                    >
                      {/* Version & Instrument */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isMetaThursday
                                ? 'bg-teal-950 text-teal-300 border border-teal-800'
                                : isUltra
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : isUber
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {trade.version}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              trade.type === 'BUY'
                                ? 'bg-emerald-950 text-emerald-400'
                                : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {trade.type}
                          </span>
                          {isCancelled && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
                              CANCELLED
                            </span>
                          )}
                        </div>
                        {(() => {
                          const instConfig = getInstrumentConfig(trade.instrument);
                          const displayName = trade.name || instConfig?.name || trade.instrument;
                          return (
                            <div className="mt-1">
                              <div
                                className="text-white font-semibold text-xs truncate max-w-[200px]"
                                title={`${displayName} (${trade.instrument})`}
                              >
                                {displayName}
                              </div>
                              <div
                                className="text-slate-400 font-mono text-[10px] truncate max-w-[180px]"
                                title={trade.instrument}
                              >
                                {trade.instrument}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Complete Entry MAs, Crossover & Reversal status */}
                        {entryIndicators && (
                          <div className="mt-1 text-[10px] text-slate-400 font-sans flex items-center gap-1.5 flex-wrap">
                            <span className="text-amber-400 font-mono">SMA9:{entryIndicators.smaFast.toFixed(1)}</span>
                            <span className="text-purple-400 font-mono">SMA21:{entryIndicators.smaSlow.toFixed(1)}</span>
                            <span className="text-cyan-400 font-mono">EMA20:{entryIndicators.ema20.toFixed(1)}</span>
                            <span className="text-slate-300 font-mono">Pos:{entryIndicators.candlePositionWrtMa}</span>
                            <span
                              className={`px-1 rounded text-[9px] font-bold ${
                                entryIndicators.crossoverState === 'BULLISH'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {entryIndicators.crossoverState}
                            </span>
                            <span className="text-slate-500 text-[9px]">
                              ({entryIndicators.crossoverCandlesPrior}b prior • {entryIndicators.crossoverEndedInCandles ? `flip in ${entryIndicators.crossoverEndedInCandles}b` : 'persisted'})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Signal Time */}
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        <div>{trade.ist || UpstoxApiService.toISTString(trade.timestamp)}</div>
                        <div className="text-slate-500 text-[10px]">Bar #{trade.barNumber}</div>
                      </td>

                      {/* Prices */}
                      <td className="py-3 px-3">
                        <div className="text-slate-200">
                          Entry: <span className="text-white font-bold">{Number(trade.entry || 0).toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span className="text-rose-400">SL: {Number(trade.sl || 0).toFixed(2)}</span>
                          <span className="text-emerald-400">TP: {Number(trade.tp || 0).toFixed(2)}</span>
                        </div>
                      </td>

                      {/* Enhanced Rules & Score */}
                      <td className="py-3 px-3 bg-indigo-950/10">
                        <EnhancedFilterBadge evaluation={enhancedEval} />
                      </td>

                      {/* Milestone 1 */}
                      <td className="py-3 px-3">
                        {!milestone1 || analysis.status === 'NEITHER_HIT_YET' ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 border border-slate-700 text-[10px] font-semibold flex items-center gap-1.5 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            <span>PENDING (Waiting for {analysis.expectedTarget})</span>
                          </span>
                        ) : (
                          <div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-fit ${
                                analysis.isSuccess
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {analysis.isSuccess ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <XCircle className="w-3 h-3 text-rose-400" />
                              )}
                              <span>{milestone1.type} HIT ({analysis.isSuccess ? 'WIN' : 'ADVERSE'})</span>
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1">
                              {milestone1.candlesCount} candle(s) • day +{milestone1.daysElapsed}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* M1 Time & Ticks */}
                      <td className="py-3 px-3">
                        {milestone1 ? (
                          <>
                            <div className="text-cyan-400 font-semibold">{milestone1.timeTakenFormatted}</div>
                            <div className="text-[11px] text-amber-400">
                              <strong>{milestone1.ticks}</strong> ticks{' '}
                              <span className="text-slate-500 text-[10px]">({milestone1.cumulativeVolume?.toLocaleString()} vol)</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Milestone 2 */}
                      <td className="py-3 px-3">
                        {milestone2 && milestone2.type !== 'PENDING' ? (
                          <div>
                            <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-bold">
                              {milestone2.type} HIT
                            </span>
                            <div className="text-[11px] text-cyan-400 mt-1">
                              {milestone2.timeTakenFormatted}
                            </div>
                            <div className="text-[10px] text-amber-400">
                              {milestone2.ticks} ticks ({milestone2.daysElapsed}d)
                            </div>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                            {milestone2?.type || 'M2'} PENDING
                          </span>
                        )}
                      </td>

                      {/* Drawdown & Profit Multiples / Crossings */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {analysis.isSuccess ? (
                          <>
                            <div className="text-emerald-400 font-semibold">
                              Max Profit: <strong>{drawdown.maxProfitMultiple.toFixed(2)}x</strong>
                            </div>
                            <div className="text-emerald-300 text-[10px]">
                              Before Return: <strong>{drawdown.profitMultipleBeforeReturn.toFixed(2)}x</strong>
                            </div>
                            <div className="text-slate-500 text-[10px]">
                              Max Loss: 0.00x
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-rose-400 font-semibold">
                              Max Loss: <strong>{drawdown.maxLossMultiple.toFixed(2)}x</strong>
                            </div>
                            <div className="text-amber-300 text-[10px]">
                              Before Return: <strong>{drawdown.lossMultipleBeforeEntryReturn.toFixed(2)}x</strong>
                            </div>
                            <div className="text-slate-500 text-[10px]">
                              Max Profit: 0.00x
                            </div>
                          </>
                        )}
                        <div className="text-slate-400 text-[10px] mt-0.5 pt-0.5 border-t border-slate-800/60">
                          Crossings — SL: {drawdown.slCrossCount}x • TP: {drawdown.tpCrossCount}x • Entry: {drawdown.entryCrossCount}x
                        </div>
                      </td>

                      {/* Trade Note */}
                      <td className="py-3 px-3 text-center">
                        <TradeNoteEditor trade={trade} compact={true} />
                      </td>

                      {/* Chart launcher */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onOpenChart(analysis)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-sans font-semibold border border-indigo-500/30 transition cursor-pointer flex items-center gap-1 ml-auto"
                          title="View Interactive Candlestick Chart starting from morning 09:15"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View Candle</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
