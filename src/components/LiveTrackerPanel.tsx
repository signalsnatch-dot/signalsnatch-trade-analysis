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
  Download,
  Ban,
  Award,
  Clock,
  Activity,
} from 'lucide-react';
import { TradeSignal, TradeMilestoneAnalysis } from '../types/trade.ts';
import { UpstoxApiService } from '../services/upstoxApi.ts';
import { getInstrumentConfig } from '../config/instrumentConfig.ts';
import { EnhancedFilterService } from '../services/enhancedFilterService.ts';
import { EnhancedFilterBadge } from './EnhancedFilterBadge.tsx';
import { TradeNoteEditor } from './TradeNoteEditor.tsx';
import { TradeNotesService } from '../services/tradeNotesService.ts';
import { HighConfluenceAnalyticsCard } from './HighConfluenceAnalyticsCard.tsx';
import { EnhancedRulesFilterControls } from './EnhancedRulesFilterControls.tsx';
import { VersionFilterControl, VersionFilterMode } from './VersionFilterControl.tsx';

// Helper to deduplicate signals by unique trade signature
export const deduplicateLiveTrades = (trades: TradeSignal[]): TradeSignal[] => {
  const seen = new Set<string>();
  const out: TradeSignal[] = [];
  for (const t of trades) {
    if (!t) continue;
    const sig = `${t.instrument}_${t.timestamp}_${t.version}_${t.type}_${Number(t.entry || 0).toFixed(2)}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(t);
    }
  }
  return out;
};

// Helper to deduplicate milestone analyses by unique trade signature
export const deduplicateLiveAnalyses = (analysesList: TradeMilestoneAnalysis[]): TradeMilestoneAnalysis[] => {
  const seen = new Set<string>();
  const out: TradeMilestoneAnalysis[] = [];
  for (const a of analysesList) {
    if (!a?.trade) continue;
    const t = a.trade;
    const sig = `${t.instrument}_${t.timestamp}_${t.version}_${t.type}_${Number(t.entry || 0).toFixed(2)}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(a);
    }
  }
  return out;
};

interface LiveTrackerPanelProps {
  onOpenChart: (analysis: TradeMilestoneAnalysis) => void;
  initialTrades?: TradeSignal[];
  onLiveTradesUpdate?: (trades: TradeSignal[]) => void;
}

export const LiveTrackerPanel: React.FC<LiveTrackerPanelProps> = ({
  onOpenChart,
  initialTrades = [],
  onLiveTradesUpdate,
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

  // Synchronization refs to prevent overlapping requests and aborted network connections
  const isPollingRef = useRef(false);
  const isBatchRefreshingRef = useRef(false);
  const isEvaluatingRef = useRef(false);
  const lastEvaluatedSignatureRef = useRef<string>('');

  // Helper to compute stable signature of trade batch to prevent redundant executions
  const computeTradeSignature = (trades: TradeSignal[]): string => {
    return `${trades.length}_${trades.map((t) => `${t.instrument}_${t.timestamp}_${t.version}_${t.type}_${t.status}`).join(';')}`;
  };

  // Raw & Processed data (filter initialTrades to todayIST only to prevent Oct 27 flash, and deduplicate)
  const [liveTrades, setLiveTrades] = useState<TradeSignal[]>(() => {
    return deduplicateLiveTrades(initialTrades.filter((t) => UpstoxApiService.toISTDate(t.timestamp) === todayIST));
  });
  const [liveAnalyses, setLiveAnalyses] = useState<TradeMilestoneAnalysis[]>([]);
  const [previousTradesCount, setPreviousTradesCount] = useState(() => {
    return deduplicateLiveTrades(initialTrades.filter((t) => UpstoxApiService.toISTDate(t.timestamp) === todayIST)).length;
  });
  const [newTradesAlert, setNewTradesAlert] = useState<number>(0);

  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'PROFIT' | 'LOSS' | 'CANCELLED'>('ALL');
  const [excludeCancelled, setExcludeCancelled] = useState<boolean>(false);
  const [versionStates, setVersionStates] = useState<Record<string, VersionFilterMode>>({
    ULTRA: 'INCLUDE',
    UBER: 'INCLUDE',
    META_THURSDAY: 'NONE',
  });
  const [showHighConfluenceOnly, setShowHighConfluenceOnly] = useState(false);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [negatedRuleIds, setNegatedRuleIds] = useState<string[]>([]);
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
  const evaluateTradesMilestones = useCallback(async (tradesToAnalyze: TradeSignal[]) => {
    if (tradesToAnalyze.length === 0 || isEvaluatingRef.current) return;
    isEvaluatingRef.current = true;
    try {
      const res = await fetch('/api/command2/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades: deduplicateLiveTrades(tradesToAnalyze),
          versionFilters: ['ULTRA', 'UBER', 'META_THURSDAY'],
          useAllVersions: false,
          volumeTradesOnly: volumeOnly,
          skipCache: true,
          isLive: true,
        }),
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data.result) {
        const allAnalyses = [
          ...(Array.isArray(data.result.analyses) ? data.result.analyses : []),
          ...(Array.isArray(data.result.incompleteTrades) ? data.result.incompleteTrades : []),
        ];
        if (allAnalyses.length > 0) {
          setLiveAnalyses(deduplicateLiveAnalyses(allAnalyses));
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Error evaluating live milestones:', e);
      }
    } finally {
      isEvaluatingRef.current = false;
    }
  }, [volumeOnly]);

  // Batch refresh 1-minute candles for all instruments with pending M1 or M2 (Requirement 4)
  const batchRefreshPendingCandles = useCallback(async (explicitTrades?: TradeSignal[]) => {
    if (isBatchRefreshingRef.current) return;
    isBatchRefreshingRef.current = true;
    setIsBatchRefreshingCandles(true);

    try {
      const candidateTrades = explicitTrades && explicitTrades.length > 0
        ? explicitTrades
        : liveAnalyses.length > 0
        ? liveAnalyses.map((a) => a.trade)
        : liveTrades;

      if (candidateTrades.length === 0) return;

      const pendingInstruments = Array.from(
        new Set(
          candidateTrades
            .filter((t) => {
              const a = liveAnalyses.find(
                (x) => x.trade.instrument === t.instrument && x.trade.timestamp === t.timestamp
              );
              if (!a) return true;
              return (
                !a.milestone1 ||
                !a.milestone2 ||
                a.milestone2.type === 'PENDING' ||
                a.candlesFoundForDay === 0 ||
                a.status === 'NO_CANDLE_DATA' ||
                a.status === 'NEITHER_HIT_YET'
              );
            })
            .map((t) => t.instrument)
        )
      );

      const today = selectedDate || todayIST;
      let refreshedCount = 0;

      if (pendingInstruments.length > 0) {
        const res = await fetch('/api/live/batch-refresh-candles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instrumentKeys: pendingInstruments,
            date: today,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          refreshedCount = data.refreshedCount ?? 0;
        }
      }

      const timeStr = UpstoxApiService.toISTString(Date.now()).split(' ')[1] || '';
      setLastBatchCandleRefreshTime(timeStr);
      setBatchCandleRefreshStatus(
        refreshedCount > 0
          ? `Synced 1m candles for ${refreshedCount} instrument(s) at ${timeStr}`
          : `All 1m candles up-to-date at ${timeStr}`
      );

      // Re-evaluate milestones with the freshly saved 1m candles!
      const targetTrades = explicitTrades && explicitTrades.length > 0 ? explicitTrades : liveTrades;
      if (targetTrades.length > 0) {
        await evaluateTradesMilestones(targetTrades);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Failed 1m batch candle refresh:', e);
      }
    } finally {
      isBatchRefreshingRef.current = false;
      setIsBatchRefreshingCandles(false);
    }
  }, [evaluateTradesMilestones, liveAnalyses, liveTrades, selectedDate, todayIST]);

  // Core polling function
  const pollLiveData = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    setIsPolling(true);
    setErrorMessage(null);

    const todayIST = selectedDate || UpstoxApiService.toISTDate(Date.now());
    const pollUrl = targetUrl.includes('signals_today_')
      ? targetUrl.replace(/signals_today_\d{4}-\d{2}-\d{2}\.json/, `signals_today_${todayIST}.json`)
      : targetUrl;

    try {
      const res = await fetch(`/api/live/poll?url=${encodeURIComponent(pollUrl)}`);
      if (!res.ok) {
        setErrorMessage(`HTTP ${res.status} from live poll`);
        return;
      }
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

        // Deduplicate trades to prevent repeated rows in live stream
        const uniqueLiveTrades = deduplicateLiveTrades(finalLiveTrades);
        const signature = computeTradeSignature(uniqueLiveTrades);
        const hasTradesChanged = signature !== lastEvaluatedSignatureRef.current;

        // Check if new trades arrived
        if (uniqueLiveTrades.length > previousTradesCount && previousTradesCount > 0) {
          const diff = uniqueLiveTrades.length - previousTradesCount;
          setNewTradesAlert(diff);
          setTimeout(() => setNewTradesAlert(0), 4000);
        }
        setPreviousTradesCount(uniqueLiveTrades.length);
        setLiveTrades(uniqueLiveTrades);
        onLiveTradesUpdate?.(uniqueLiveTrades);

        // ONLY refresh 1m candles and evaluate if trades changed or initial load!
        if (hasTradesChanged || liveAnalyses.length === 0) {
          lastEvaluatedSignatureRef.current = signature;
          await batchRefreshPendingCandles(uniqueLiveTrades);
        }
      } else {
        setErrorMessage(data.error || 'Invalid response from live poll');
      }
    } catch (err: unknown) {
      setIsServerOffline(true);
      setErrorMessage(err instanceof Error ? err.message : 'Network error during live poll');
    } finally {
      isPollingRef.current = false;
      setIsPolling(false);
    }
  }, [batchRefreshPendingCandles, liveAnalyses.length, onLiveTradesUpdate, previousTradesCount, selectedDate, targetUrl, volumeOnly]);

  const pollLiveDataRef = useRef(pollLiveData);
  pollLiveDataRef.current = pollLiveData;

  // Setup interval polling with ref to prevent stale closures
  useEffect(() => {
    if (isLiveActive) {
      pollLiveDataRef.current();
      timerRef.current = setInterval(() => {
        pollLiveDataRef.current();
      }, pollIntervalSec * 1000);
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
  }, [isLiveActive, pollIntervalSec]);

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

  // Dynamically filtered live analyses based on version Include/Negate & outcome filter
  const displayedAnalyses = useMemo(() => {
    const filtered = liveAnalyses.filter((a: TradeMilestoneAnalysis) => {
      // 1. Version filter with Include & Negate support
      const matchVersion = EnhancedFilterService.matchesVersionFilter(
        a.trade.version || '',
        versionStates
      );
      if (!matchVersion) return false;

      // Exclude cancelled trades if toggle is active
      const isCancelled = (a.trade.status || '').toLowerCase() === 'cancelled';
      if (excludeCancelled && isCancelled) return false;

      // 2. Outcome / Status filter
      if (outcomeFilter === 'PROFIT') {
        if (!a.isSuccess || isCancelled) return false;
      } else if (outcomeFilter === 'LOSS') {
        if (a.isSuccess || a.milestone1 === null || isCancelled) return false;
      } else if (outcomeFilter === 'CANCELLED') {
        if (!isCancelled) return false;
      }

      // 3. High Confluence filter shortcut (Score >= 85%)
      if (showHighConfluenceOnly) {
        const evaluation = EnhancedFilterService.evaluate(a, liveAnalyses);
        if (!evaluation.isHighConfluence) return false;
      }

      // 4. Specific Enhanced Rule(s) with Pass & Negate Support and Score Range Filter
      const matchesEnhanced = EnhancedFilterService.matchesEnhancedFilters(
        a,
        { passIds: selectedRuleIds, negateIds: negatedRuleIds },
        ruleMatchMode,
        minScore,
        maxScore,
        liveAnalyses
      );
      if (!matchesEnhanced) return false;

      return true;
    });

    return deduplicateLiveAnalyses(filtered);
  }, [
    liveAnalyses,
    versionStates,
    outcomeFilter,
    excludeCancelled,
    showHighConfluenceOnly,
    selectedRuleIds,
    negatedRuleIds,
    ruleMatchMode,
    minScore,
    maxScore,
  ]);

  // Active filters string for report metadata
  const activeLiveFiltersString = useMemo(() => {
    const parts: string[] = [];
    const incs = Object.entries(versionStates).filter(([_, s]) => s === 'INCLUDE').map(([k]) => `+${k}`);
    const negs = Object.entries(versionStates).filter(([_, s]) => s === 'NEGATE').map(([k]) => `-${k}`);
    if (incs.length > 0 || negs.length > 0) parts.push(`Versions: ${[...incs, ...negs].join(' ')}`);
    if (outcomeFilter !== 'ALL') parts.push(`Outcome: ${outcomeFilter}`);
    if (excludeCancelled) parts.push('Cancelled: Excluded');
    if (selectedRuleIds.length > 0 || negatedRuleIds.length > 0) {
      parts.push(`Rules: +${selectedRuleIds.length}, -${negatedRuleIds.length} (${ruleMatchMode})`);
    }
    if (minScore > 0 || maxScore < 100) parts.push(`Score: ${minScore}%–${maxScore}%`);
    return parts.join(' | ') || 'All Live Trades';
  }, [versionStates, outcomeFilter, excludeCancelled, selectedRuleIds, negatedRuleIds, ruleMatchMode, minScore, maxScore]);

  // Export Live Tracker Report (Requirement: Report generation for live tracker)
  const exportLiveReport = () => {
    if (displayedAnalyses.length === 0) return;
    const headers = [
      'version', 'instrument', 'name', 'type', 'status', 'is_cancelled', 'entry', 'sl', 'tp',
      'threshold', 'confidence', 'trade_timestamp', 'trade_ist', 'bar_number', 'expected_target',
      'live_status', 'is_success',
      'm1_hit_type', 'm1_time_taken', 'm1_candles_count', 'm1_ticks',
      'm2_hit_type', 'm2_achieved_same_day', 'm2_time_taken', 'm2_ticks',
      'max_loss_multiple', 'loss_multiple_before_entry_return', 'max_profit_multiple', 'profit_multiple_before_return',
      'sl_cross_count', 'tp_cross_count', 'entry_cross_count', 'drawdown_ticks', 'drawdown_time',
      'entry_sma_fast', 'entry_sma_slow', 'entry_ema_20', 'candle_direction', 'candle_position_wrt_ma',
      'sma_crossover_state', 'sma_crossover_prior_candles', 'sma_crossover_ended_in_candles',
      'enhanced_engine', 'enhanced_score', 'lifecycle_state', 'is_high_confluence', 'high_confluence_combinations', 'inversion_signal',
      'pre_entry_verdict', 'hold_advice', 'exit_advice',
      'achieved_rules', 'missed_rules', 'not_applicable_rules', 'user_note',
      'guidance_advice'
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === undefined || val === null) return '';
      const s = String(val);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const rows = displayedAnalyses.map((a) => {
      const t = a.trade;
      const m1 = a.milestone1;
      const m2 = a.milestone2;
      const dd = a.drawdown;
      const ind = a.entryIndicators;
      const evalResult = EnhancedFilterService.evaluate(a, liveAnalyses);
      const note = TradeNotesService.getNoteForTrade(t);

      return [
        t.version, t.instrument, t.name, t.type, t.status || 'active', t.status === 'cancelled' ? 'YES' : 'NO',
        Number(t.entry || 0).toFixed(2), Number(t.sl || 0).toFixed(2), Number(t.tp || 0).toFixed(2),
        t.threshold, t.confidence ?? '', t.timestamp, a.entryIst || UpstoxApiService.toISTString(t.timestamp), t.barNumber || '',
        a.expectedTarget, a.status || 'ACTIVE', a.isSuccess ? 'SUCCESS' : 'LOSS_ADVERSE',
        m1?.type || 'PENDING', m1?.timeTakenFormatted || '', m1?.candlesCount ?? '', m1 ? m1.ticks.toFixed(2) : '',
        m2?.type || 'PENDING', m2 ? (m2.achievedSameDay ? 'YES' : 'NO') : '', m2?.timeTakenFormatted || '', m2 ? m2.ticks.toFixed(2) : '',
        `${dd.maxLossMultiple.toFixed(2)}x`, `${dd.lossMultipleBeforeEntryReturn.toFixed(2)}x`,
        `${(dd.maxProfitMultiple || 0).toFixed(2)}x`, `${(dd.profitMultipleBeforeReturn || 0).toFixed(2)}x`,
        dd.slCrossCount, dd.tpCrossCount, dd.entryCrossCount, dd.drawdownTicks.toFixed(2), dd.drawdownTimeFormatted,
        ind ? ind.smaFast : '', ind ? ind.smaSlow : '', ind ? ind.ema20 : '', ind ? ind.candleDirection : '', ind ? ind.candlePositionWrtMa : '',
        ind ? ind.crossoverState : '', ind ? ind.crossoverCandlesPrior : '', ind ? (ind.crossoverEndedInCandles !== null ? ind.crossoverEndedInCandles : 'Persisted') : '',
        evalResult.engineType, `${evalResult.score}%`, evalResult.lifecycleState.shortLabel, evalResult.isHighConfluence ? 'YES' : 'NO',
        evalResult.highConfluenceCombinations.map((c) => `${c.name} (${c.winRate}%)`).join('; ') || 'NONE',
        evalResult.inversionSignal?.shouldInvert
          ? `${evalResult.inversionSignal.invertedDirection} @ ${evalResult.inversionSignal.entryPrice.toFixed(2)} -> Target SL ${evalResult.inversionSignal.targetPrice.toFixed(2)}`
          : 'NONE',
        evalResult.lifecycleAdvice.entryVerdict,
        evalResult.lifecycleAdvice.holdAdvice,
        evalResult.lifecycleAdvice.exitAdvice,
        evalResult.achievedTags.join('; '), evalResult.missedTags.join('; '), evalResult.notApplicableTags.join('; '), note,
        evalResult.guidance.liveStatusAdvice || evalResult.guidance.lossManagementRule || ''
      ].map(escapeCsv).join(',');
    });

    const csvContent = `# Signalsnatch Live Pipeline Tracker Report\n# Filters Applied: ${activeLiveFiltersString}\n# Generated IST: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}\n# Total Live Filtered Trades: ${displayedAnalyses.length}\n` + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `live_tracker_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Enhanced aggregated analytics for Score >= 85% breakdown (reflecting active filtered trades)
  const enhancedSummary = useMemo(() => {
    return EnhancedFilterService.computeAggregatedAnalytics(displayedAnalyses);
  }, [displayedAnalyses]);

  // Derived live KPI statistics strictly reflecting the filtered analyses (Requirement: max profit, avg crossings, M1 ticks, M2 time, win rate)
  const totalAnalyzed = displayedAnalyses.length;
  const wins = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.isSuccess).length;
  const losses = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => !a.isSuccess && a.milestone1 !== null).length;
  const cancelledCount = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => (a.trade.status || '').toLowerCase() === 'cancelled').length;
  const winRate = totalAnalyzed > 0 ? ((wins / totalAnalyzed) * 100).toFixed(1) : '0.0';

  // Version breakdowns for win rates
  const uberTrades = displayedAnalyses.filter((a) => /uber/i.test(a.trade.version));
  const uberWins = uberTrades.filter((a) => a.isSuccess).length;
  const uberWinPct = uberTrades.length > 0 ? ((uberWins / uberTrades.length) * 100).toFixed(1) : '0.0';

  const ultraTrades = displayedAnalyses.filter((a) => /ultra/i.test(a.trade.version));
  const ultraWins = ultraTrades.filter((a) => a.isSuccess).length;
  const ultraWinPct = ultraTrades.length > 0 ? ((ultraWins / ultraTrades.length) * 100).toFixed(1) : '0.0';

  // M1 speed & ticks
  const analysesWithM1 = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.milestone1 !== null);
  const avgM1Ticks =
    analysesWithM1.length > 0
      ? (analysesWithM1.reduce((acc: number, a: TradeMilestoneAnalysis) => acc + (a.milestone1?.ticks || 0), 0) / analysesWithM1.length).toFixed(1)
      : '0.0';

  const totalM1TimeMs = analysesWithM1.reduce((acc, a) => acc + (a.milestone1?.timeTakenMs || 0), 0);
  const avgM1TimeMs = analysesWithM1.length > 0 ? totalM1TimeMs / analysesWithM1.length : 0;
  const avgTimeM1Formatted =
    analysesWithM1.length > 0
      ? `${Math.floor(avgM1TimeMs / 60000)}m ${Math.floor((avgM1TimeMs % 60000) / 1000)}s`
      : 'N/A';
  const avgCandlesToM1 =
    analysesWithM1.length > 0
      ? (analysesWithM1.reduce((acc, a) => acc + (a.milestone1?.candlesCount || 0), 0) / analysesWithM1.length).toFixed(1)
      : '0.0';

  // M2 speed & time
  const m2Achieved = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.milestone2 && a.milestone2.type !== 'PENDING');
  const m2Hits = m2Achieved.length;
  const m2SameDayCount = displayedAnalyses.filter((a) => a.milestone2?.achievedSameDay).length;
  const m2PendingCount = displayedAnalyses.filter((a) => a.milestone2?.type === 'PENDING').length;

  const avgM2Ticks =
    m2Hits > 0
      ? (m2Achieved.reduce((acc: number, a: TradeMilestoneAnalysis) => acc + (a.milestone2?.ticks || 0), 0) / m2Hits).toFixed(1)
      : '0.0';

  const totalM2TimeMs = m2Achieved.reduce((sum: number, a: TradeMilestoneAnalysis) => sum + (a.milestone2?.timeTakenMs || 0), 0);
  const avgM2TimeMs = m2Hits > 0 ? totalM2TimeMs / m2Hits : 0;
  const avgTimeM2Formatted =
    m2Hits > 0
      ? `${Math.floor(avgM2TimeMs / 60000)}m ${Math.floor((avgM2TimeMs % 60000) / 1000)}s`
      : 'N/A';

  // Max Profit Multiple & excursions
  const peakMaxProfit =
    totalAnalyzed > 0
      ? Math.max(0, ...displayedAnalyses.map((a: TradeMilestoneAnalysis) => a.drawdown?.maxProfitMultiple || 0)).toFixed(1)
      : '0.0';
  const avgMaxProfit =
    totalAnalyzed > 0
      ? (displayedAnalyses.reduce((acc, a) => acc + (a.drawdown?.maxProfitMultiple || 0), 0) / totalAnalyzed).toFixed(1)
      : '0.0';
  const avgProfitBeforeReturn =
    totalAnalyzed > 0
      ? (displayedAnalyses.reduce((acc, a) => acc + (a.drawdown?.profitMultipleBeforeReturn || 0), 0) / totalAnalyzed).toFixed(1)
      : '0.0';

  const analysesWithDrawdown = displayedAnalyses.filter((a: TradeMilestoneAnalysis) => a.drawdown && a.drawdown.maxLossMultiple > 0);
  const maxAdverseDrawdown =
    analysesWithDrawdown.length > 0
      ? Math.max(...analysesWithDrawdown.map((a: TradeMilestoneAnalysis) => a.drawdown.maxLossMultiple)).toFixed(1)
      : '1.0';

  // Average Level Crossings (Entry / SL / TP count)
  const avgEntryCrossCount =
    totalAnalyzed > 0
      ? (displayedAnalyses.reduce((acc, a) => acc + (a.drawdown?.entryCrossCount || 0), 0) / totalAnalyzed).toFixed(1)
      : '0.0';
  const avgSlCrossCount =
    totalAnalyzed > 0
      ? (displayedAnalyses.reduce((acc, a) => acc + (a.drawdown?.slCrossCount || 0), 0) / totalAnalyzed).toFixed(1)
      : '0.0';
  const avgTpCrossCount =
    totalAnalyzed > 0
      ? (displayedAnalyses.reduce((acc, a) => acc + (a.drawdown?.tpCrossCount || 0), 0) / totalAnalyzed).toFixed(1)
      : '0.0';

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

            {/* Export Live Report CSV Button */}
            <button
              onClick={exportLiveReport}
              disabled={displayedAnalyses.length === 0}
              title="Export all currently filtered live trades to CSV report"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-sm shadow-cyan-900/20"
            >
              <Download className="w-3.5 h-3.5 text-cyan-200" />
              <span>Export Live Report ({displayedAnalyses.length})</span>
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
        </div>

        {/* Version Filter with Include & Negate support */}
        <div className="pt-2.5 border-t border-slate-800">
          <VersionFilterControl
            versionStates={versionStates}
            onChangeVersionStates={setVersionStates}
            availableVersions={['ULTRA', 'UBER', 'META_THURSDAY']}
          />
        </div>

        {/* Outcome Filter Toolbar */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
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

            {/* Remove / Exclude Cancelled trades toggle */}
            <button
              onClick={() => setExcludeCancelled((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                excludeCancelled
                  ? 'bg-rose-950/70 text-rose-300 border-rose-800 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Remove/exclude cancelled trades from live statistics, tables, and reports"
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span>Exclude Cancelled</span>
              {excludeCancelled && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
            </button>
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
        negatedRuleIds={negatedRuleIds}
        onNegateRuleIds={setNegatedRuleIds}
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

      {/* Live KPI Metric Cards (Requirement: Post max profit, avg crossings, M1 ticks, M2 time, win rate) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Card 1: Win Rate & Resolutions */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider">Live Win Rate (M1)</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-emerald-400 font-mono">{winRate}%</span>
              <span className="text-xs text-slate-400 font-mono">({wins}/{totalAnalyzed} won)</span>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-indigo-300 font-medium">Uber (SL win):</span>
              <span className="font-semibold text-white font-mono">{uberWinPct}% ({uberWins}/{uberTrades.length})</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-cyan-300 font-medium">Ultra (TP win):</span>
              <span className="font-semibold text-white font-mono">{ultraWinPct}% ({ultraWins}/{ultraTrades.length})</span>
            </div>
            {cancelledCount > 0 && (
              <div className="flex justify-between items-center text-amber-400 font-medium pt-1 border-t border-slate-800/40">
                <span>Cancelled Trades:</span>
                <span className="font-semibold font-mono">{cancelledCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: M1 Speed & Ticks */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider">M1 Speed & Ticks</span>
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-cyan-400 font-mono">{avgM1Ticks}</span>
              <span className="text-xs text-slate-400">ticks (vol / thresh)</span>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Avg Time to M1:</span>
              <span className="font-semibold text-slate-200 font-mono truncate max-w-[130px]" title={avgTimeM1Formatted}>
                {avgTimeM1Formatted}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Avg 1-Min Candles:</span>
              <span className="font-medium text-slate-200 font-mono">{avgCandlesToM1} candles</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Hit M1 Count:</span>
              <span className="font-semibold text-white font-mono">{analysesWithM1.length}/{totalAnalyzed}</span>
            </div>
          </div>
        </div>

        {/* Card 3: M2 Time & Follow-Through */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider">M2 Time & Follow-Through</span>
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-bold text-purple-400 font-mono truncate" title={avgTimeM2Formatted}>
                {avgTimeM2Formatted}
              </span>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Avg M2 Speed:</span>
              <span className="font-semibold text-purple-300 font-mono">{avgM2Ticks} ticks</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-emerald-400">Same-Day M2:</span>
              <span className="font-semibold text-white font-mono">
                {m2SameDayCount} ({totalAnalyzed > 0 ? ((m2SameDayCount / totalAnalyzed) * 100).toFixed(1) : '0'}%)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-amber-400">Pending M2:</span>
              <span className="font-semibold text-white font-mono">
                {m2PendingCount} ({totalAnalyzed > 0 ? ((m2PendingCount / totalAnalyzed) * 100).toFixed(1) : '0'}%)
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Max Profit Multiple */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider">Max Profit Multiple</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-emerald-400 font-mono">{peakMaxProfit}x</span>
              <span className="text-xs text-slate-400">peak /</span>
              <span className="text-xl font-bold text-emerald-300 font-mono">{avgMaxProfit}x</span>
              <span className="text-xs text-slate-400">avg</span>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Profit Before Return:</span>
              <span className="font-semibold text-emerald-300 font-mono">{avgProfitBeforeReturn}x</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rose-400">Max Adverse Loss:</span>
              <span className="font-semibold text-rose-300 font-mono">{maxAdverseDrawdown}x risk</span>
            </div>
          </div>
        </div>

        {/* Card 5: Avg Level Crossings (Entry / SL / TP) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider">Avg Level Crossings</span>
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-sky-400 font-mono">{avgEntryCrossCount}</span>
              <span className="text-xs text-slate-400">avg entry crossings</span>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-sky-300 font-medium">Avg Entry Crossings:</span>
              <span className="font-semibold text-white font-mono">{avgEntryCrossCount}x</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rose-400 font-medium">Avg SL Crossings:</span>
              <span className="font-semibold text-white font-mono">{avgSlCrossCount}x</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-emerald-400 font-medium">Avg TP Crossings:</span>
              <span className="font-semibold text-white font-mono">{avgTpCrossCount}x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Signals & Milestones Stream Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/60">
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

          <button
            onClick={exportLiveReport}
            disabled={displayedAnalyses.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
            title="Download full live CSV report for currently filtered trades"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Report ({displayedAnalyses.length})</span>
          </button>
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
                    No trades match the current version filters or outcome filter ({outcomeFilter}).
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
