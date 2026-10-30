import fs from 'fs';
import path from 'path';
import {
  TradeSignal,
  Candle,
  MilestoneHit,
  Milestone2Hit,
  TradeMilestoneAnalysis,
  DrawdownAnalysis,
  TradeGroup5Min,
  TradeEntryMaIndicators,
} from '../types/trade.ts';
import { UpstoxApiService } from './upstoxApi.ts';
import { Command1Service } from './command1Service.ts';
import { getInstrumentLotSize, isNseFoInstrument } from '../config/instrumentConfig.ts';
import { augmentCandlesWithIndicators } from './indicators.ts';

export interface Command2Options {
  versionFilters?: string[]; // e.g. ['ULTRA', 'UBER', 'META_THURSDAY'] or specific version names
  useAllVersions?: boolean;
  marketDataDir?: string;
  outputReportsDir?: string;
  volumeTradesOnly?: boolean; // Default true (Filter volume-based trades)
}

export interface Command2Progress {
  currentIndex: number;
  totalTrades: number;
  currentTradeName: string;
  currentVersion: string;
  message: string;
}

export interface DateDayM1Breakdown {
  periodKey: string; // e.g. "2026-10-27" or "Tuesday"
  totalTrades: number;
  uberTotal: number;
  uberTpCount: number; // M1 is TP (Loss for Uber)
  uberSlCount: number; // M1 is SL (Goal/Success for Uber)
  uberWinRate: number;
  ultraTotal: number;
  ultraTpCount: number; // M1 is TP (Goal/Success for Ultra)
  ultraSlCount: number; // M1 is SL (Loss for Ultra)
  ultraWinRate: number;
  overallWinRate: number;
}

export interface ClassifiedTicksSummary {
  bracket: string; // e.g. "< 50", "50 - 100", "100 - 250", "250 - 500", "> 500"
  count: number;
  percentage: number;
  avgTimeTakenFormatted: string;
  avgTicks: number;
}

export interface LossTradeDetail {
  instrument: string;
  name: string;
  version: string;
  dateStr: string;
  type: string;
  entry: number;
  goalMilestone: 'SL' | 'TP';
  adverseMilestone: 'SL' | 'TP';
  entryTimeIST: string;
  m1HitTimeIST: string; // TP time for Uber, SL time for non-Uber
  m1Type: 'SL' | 'TP';
  durationFormatted: string;
  maxLossMultiple: number;
  lossBeforeEntryReturn: number;
  slCrossCount: number;
  tpCrossCount: number;
  entryCrossCount: number;
  ticks: number;
  entryIndicators?: TradeEntryMaIndicators;
}

export interface ProfitTradeDetail {
  instrument: string;
  name: string;
  version: string;
  dateStr: string;
  type: string;
  entry: number;
  goalMilestone: 'SL' | 'TP';
  entryTimeIST: string;
  m1HitTimeIST: string;
  m1Type: 'SL' | 'TP';
  durationFormatted: string;
  maxProfitMultiple: number;
  profitBeforeReturn: number;
  slCrossCount: number;
  tpCrossCount: number;
  entryCrossCount: number;
  ticks: number;
  entryIndicators?: TradeEntryMaIndicators;
}

export interface Command2Summary {
  totalTradesAnalyzed: number;
  totalVolumeTradesFiltered: number;
  successCount: number;
  lossCount: number;
  cancelledTradesCount: number;
  overallWinRatePercentage: number;
  uberSuccessRate: {
    totalUber: number;
    uberSuccessCount: number; // M1 hit SL
    uberLossCount: number; // M1 hit TP
    uberSuccessPercentage: number;
  };
  ultraSuccessRate: {
    totalUltra: number;
    ultraSuccessCount: number; // M1 hit TP
    ultraLossCount: number; // M1 hit SL
    ultraSuccessPercentage: number;
  };
  m1Hits: {
    tpCount: number;
    slCount: number;
    bothCount: number;
    neitherCount: number;
    tpPercentage: number;
    slPercentage: number;
  };
  m2Hits: {
    achievedSameDayCount: number;
    achievedMultiDayCount: number;
    pendingCount: number;
    sameDayPercentage: number;
    multiDayPercentage: number;
    pendingPercentage: number;
  };
  averages: {
    avgCandlesToM1: number;
    avgTimeMsToM1: number;
    avgTimeM1Formatted: string;
    avgM1Ticks: number; // Average ticks (volume / threshold with FO lotSize applied)
    avgTimeMsToM2: number;
    avgTimeM2Formatted: string;
    avgM2Ticks: number;
    avgMaxLossMultiple: number; // e.g. 2.4x (averaged strictly over loss trades)
    avgLossMultipleBeforeEntryReturn: number; // (averaged strictly over loss trades)
    avgMaxProfitMultiple: number; // Average profit multiple (averaged strictly over winning trades)
    avgProfitMultipleBeforeReturn: number; // Average profit multiple before touch on loss/entry (averaged strictly over winning trades)
    maxProfitMultipleRecorded: number; // Absolute maximum profit multiple recorded across trades
    avgEntryCrossCount: number; // Average times price crossed entry level
    avgSlCrossCount: number; // Average times price crossed SL level
    avgTpCrossCount: number; // Average times price crossed TP level
  };
  totalIncompleteTrades: number;
  totalGroupsCount: number;
  dateBreakdowns: DateDayM1Breakdown[];
  dayOfWeekBreakdowns: DateDayM1Breakdown[];
  classifiedTicks: ClassifiedTicksSummary[];
  lossTrades: LossTradeDetail[];
  profitTrades: ProfitTradeDetail[];
  activeFiltersApplied?: string;
}

export interface Command2Result {
  analyses: TradeMilestoneAnalysis[];
  incompleteTrades: TradeMilestoneAnalysis[];
  groups5Min: TradeGroup5Min[];
  summary: Command2Summary;
  reportCsvPath?: string;
}

export class Command2Service {
  private apiService: UpstoxApiService;
  private marketDataDir: string;
  private reportsDir: string;

  constructor(options?: {
    apiService?: UpstoxApiService;
    marketDataDir?: string;
    reportsDir?: string;
  }) {
    this.apiService = options?.apiService || new UpstoxApiService();
    this.marketDataDir = options?.marketDataDir || './market_data';
    this.reportsDir = options?.reportsDir || './reports';
  }

  /**
   * Check if a trade matches the version filter
   */
  static matchesVersion(tradeVersion: string, filters?: string[], useAll?: boolean): boolean {
    if (useAll) return true;
    if (!filters || filters.length === 0) {
      return /ultra|uber|meta_thursday/i.test(tradeVersion);
    }
    const upper = tradeVersion.toUpperCase();
    return filters.some((f) => upper.includes(f.toUpperCase()));
  }

  /**
   * Check if a version is Uber (for which M1 target/goal is SL)
   */
  static isUberVersion(version: string): boolean {
    return /uber/i.test(version);
  }

  /**
   * Load 1-minute candles for an instrument on a given date (from CSV cache first to support expired contracts!)
   */
  async getCandlesForDay(instrumentKey: string, dateStr: string): Promise<Candle[]> {
    const safeName = Command1Service.safeFilename(instrumentKey);
    const csvPath = path.join(this.marketDataDir, dateStr, `${safeName}.csv`);
    const todayIST = UpstoxApiService.toISTDate(Date.now());
    const isToday = dateStr === todayIST;

    // For today's live date, ALWAYS attempt fetching fresh 1-minute candles from Upstox API first to ensure live candle data is fully up to date!
    if (isToday) {
      try {
        const liveCandles = await this.apiService.fetch1MinCandles(instrumentKey, dateStr);
        if (liveCandles && liveCandles.length > 0) {
          const targetDir = path.dirname(csvPath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          UpstoxApiService.saveCandlesToCsv(liveCandles, csvPath);
          return liveCandles;
        }
      } catch {
        // Fallback to local CSV cache if API is offline or returns empty
      }
    }

    // 1. Try reading from CSV on disk (supports expired contracts or historical dates!)
    if (fs.existsSync(csvPath)) {
      const candles = UpstoxApiService.loadCandlesFromCsv(csvPath);
      if (candles.length > 0) return candles;
    }

    // 2. Fallback to API directly for historical dates
    try {
      const candles = await this.apiService.fetch1MinCandles(instrumentKey, dateStr);
      if (candles.length > 0) {
        const targetDir = path.dirname(csvPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        UpstoxApiService.saveCandlesToCsv(candles, csvPath);
      }
      return candles;
    } catch {
      return [];
    }
  }

  /**
   * Helper to sum candle volumes strictly between entry timestamp and hit timestamp,
   * prorating boundary candles based on seconds elapsed.
   * FOR NSE_FO INSTRUMENTS: volume is divided by lotSize before summing and dividing by threshold!
   */
  static calculateVolumeAndTicks(
    candles: Candle[],
    startCandleIdx: number,
    hitCandleIdx: number,
    entryTimeMs: number,
    hitTimeMs: number,
    threshold: number,
    lotSize: number = 1
  ): { volumeSum: number; ticks: number } {
    if (candles.length === 0 || startCandleIdx < 0 || hitCandleIdx < startCandleIdx) {
      return { volumeSum: 0, ticks: 0 };
    }

    let volumeSum = 0;
    const safeThreshold = threshold > 0 ? threshold : 1;
    const safeLotSize = lotSize > 0 ? lotSize : 1;

    if (startCandleIdx === hitCandleIdx) {
      // Entry and hit in the same minute
      const candle = candles[startCandleIdx];
      const entrySec = Math.floor((entryTimeMs % 60000) / 1000);
      const hitSec = Math.min(59, Math.max(entrySec + 1, Math.floor((hitTimeMs % 60000) / 1000)));
      const fraction = Math.max(0.1, (hitSec - entrySec) / 60);
      const adjustedVol = candle.volume / safeLotSize;
      volumeSum = Math.round(adjustedVol * fraction);
    } else {
      // Multiple candles
      // 1. Entry candle fraction (from entry second to end of minute)
      const entryCandle = candles[startCandleIdx];
      const entrySec = Math.floor((entryTimeMs % 60000) / 1000);
      const entryFraction = Math.max(0.1, (60 - entrySec) / 60);
      volumeSum += Math.round((entryCandle.volume / safeLotSize) * entryFraction);

      // 2. Full intermediate candles
      for (let i = startCandleIdx + 1; i < hitCandleIdx; i++) {
        volumeSum += Math.round(candles[i].volume / safeLotSize);
      }

      // 3. Hit candle fraction (from start of minute to hit second)
      const hitCandle = candles[hitCandleIdx];
      const hitSec = Math.max(1, Math.floor((hitTimeMs % 60000) / 1000));
      const hitFraction = Math.min(1.0, Math.max(0.1, hitSec / 60));
      volumeSum += Math.round((hitCandle.volume / safeLotSize) * hitFraction);
    }

    const ticks = parseFloat((volumeSum / safeThreshold).toFixed(2));
    return { volumeSum, ticks };
  }

  /**
   * Evaluate a single trade's milestones with multi-day M1 & M2 resolution,
   * NSE_FO lotSize adjustment in volume/ticks, Uber vs Ultra targets,
   * adverse excursion drawdown, and crossings tracking.
   */
  async evaluateTrade(trade: TradeSignal): Promise<TradeMilestoneAnalysis> {
    const dateStr = UpstoxApiService.toISTDate(trade.timestamp);
    const entryIst = UpstoxApiService.toISTString(trade.timestamp);
    const isBuy = trade.type === 'BUY_STOP';
    const isUber = Command2Service.isUberVersion(trade.version);

    // Lot Size calculation: For NSE_FO, Upstox volume is in shares/units, so divide by lotSize
    const isNseFo = isNseFoInstrument(trade.instrument);
    const lotSize = isNseFo ? getInstrumentLotSize(trade.instrument, trade.name) : 1;

    // Target / Goal definitions:
    // Uber: Goal is SL (Hitting SL as M1 is SUCCESS). Hitting TP as M1 is LOSS.
    // Ultra/Others: Goal is TP (Hitting TP as M1 is SUCCESS). Hitting SL as M1 is LOSS.
    const expectedTarget: 'TP' | 'SL' = isUber ? 'SL' : 'TP';

    // Planned risk unit scale for adverse excursion:
    // For Uber: Adverse direction is towards TP! Scale is |entry - tp|
    // For Non-Uber: Adverse direction is towards SL! Scale is |entry - sl|
    const plannedRisk = isUber
      ? Math.abs(trade.entry - trade.tp) || 1
      : Math.abs(trade.entry - trade.sl) || 1;

    // Planned reward unit scale for profit excursion:
    const plannedReward = isUber
      ? Math.abs(trade.entry - trade.sl) || 1
      : Math.abs(trade.entry - trade.tp) || 1;

    // Load 1-minute candles for the entry day
    const rawDayCandles = await this.getCandlesForDay(trade.instrument, dateStr);
    const dayCandles = augmentCandlesWithIndicators(rawDayCandles);

    const defaultDrawdown: DrawdownAnalysis = {
      plannedRisk: parseFloat(plannedRisk.toFixed(2)),
      maxAdversePoints: 0,
      maxLossMultiple: 0,
      maxLossBeforeEntryReturn: 0,
      lossMultipleBeforeEntryReturn: 0,
      plannedReward: parseFloat(plannedReward.toFixed(2)),
      maxProfitPoints: 0,
      maxProfitMultiple: 0,
      maxProfitBeforeReturn: 0,
      profitMultipleBeforeReturn: 0,
      slCrossCount: 0,
      tpCrossCount: 0,
      entryCrossCount: 0,
      drawdownTicks: 0,
      drawdownTimeFormatted: '0 days 0h 0m 0s',
    };

    if (!dayCandles || dayCandles.length === 0) {
      return {
        trade,
        entryIst,
        dateStr,
        matchedVersionFilter: true,
        candlesFoundForDay: 0,
        expectedTarget,
        isSuccess: false,
        milestone1: null,
        milestone2: null,
        drawdown: defaultDrawdown,
        status: 'NO_CANDLE_DATA',
        lotSizeUsed: lotSize,
        isVolumeTrade: trade.threshold > 0,
        isIncomplete: true,
        incompleteReason: `CSV candle data not found for ${trade.instrument} on ${dateStr}`,
      };
    }

    // Active candle timeline: find the exact entry candle
    const tradeEntryMs = trade.timestamp;
    let entryCandleIdx = dayCandles.findIndex((c) => c.timeMs <= tradeEntryMs && tradeEntryMs < c.timeMs + 60_000);
    if (entryCandleIdx === -1) {
      const lastCandle = dayCandles[dayCandles.length - 1];
      if (lastCandle && tradeEntryMs > lastCandle.timeMs) {
        // Trade occurred after all available candles -> no candles after entry yet (stays PENDING)
        entryCandleIdx = dayCandles.length - 1;
      } else {
        entryCandleIdx = dayCandles.findIndex((c) => c.timeMs >= tradeEntryMs);
        if (entryCandleIdx === -1) {
          entryCandleIdx = 0;
        }
      }
    }

    // Evaluation for M1, M2 and excursion stats strictly starts ONE CANDLE AFTER the entry price candle
    const evalStartIdx = entryCandleIdx + 1;
    const candidateCandles = evalStartIdx < dayCandles.length ? dayCandles.slice(evalStartIdx) : [];
    const effectiveStartIdx = evalStartIdx;

    // Requirement 3: Calculate SMA Fast (9), SMA Slow (21), EMA 20, candle direction, and crossover state at entry
    let entryIndicators: TradeEntryMaIndicators | undefined = undefined;
    if (dayCandles.length > 0 && entryCandleIdx < dayCandles.length) {
      const entryCandle = dayCandles[entryCandleIdx];
      const smaFast = entryCandle.smaFast ?? entryCandle.close;
      const smaSlow = entryCandle.smaSlow ?? entryCandle.close;
      const ema20 = entryCandle.ema20 ?? entryCandle.close;

      const candleDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
        entryCandle.close > entryCandle.open ? 'BULLISH' : entryCandle.close < entryCandle.open ? 'BEARISH' : 'NEUTRAL';

      const aboveFast = entryCandle.close >= smaFast;
      const aboveSlow = entryCandle.close >= smaSlow;
      const aboveEma = entryCandle.close >= ema20;

      let candlePositionWrtMa = '';
      if (aboveFast && aboveSlow && aboveEma) {
        candlePositionWrtMa = 'Above SMA9, SMA21, EMA20';
      } else if (!aboveFast && !aboveSlow && !aboveEma) {
        candlePositionWrtMa = 'Below SMA9, SMA21, EMA20';
      } else {
        const parts: string[] = [];
        parts.push(aboveFast ? 'Above SMA9' : 'Below SMA9');
        parts.push(aboveSlow ? 'Above SMA21' : 'Below SMA21');
        parts.push(aboveEma ? 'Above EMA20' : 'Below EMA20');
        candlePositionWrtMa = parts.join(', ');
      }

      const crossoverState: 'BULLISH' | 'BEARISH' = smaFast >= smaSlow ? 'BULLISH' : 'BEARISH';

      // Prior candles that had the same crossover state leading into entry
      let crossoverCandlesPrior = 0;
      for (let k = entryCandleIdx; k >= 0; k--) {
        const c = dayCandles[k];
        if (c.smaFast !== undefined && c.smaSlow !== undefined) {
          const stateAtK = c.smaFast >= c.smaSlow ? 'BULLISH' : 'BEARISH';
          if (stateAtK === crossoverState) {
            crossoverCandlesPrior++;
          } else {
            break;
          }
        } else {
          crossoverCandlesPrior++;
        }
      }

      entryIndicators = {
        smaFast: parseFloat(smaFast.toFixed(2)),
        smaSlow: parseFloat(smaSlow.toFixed(2)),
        ema20: parseFloat(ema20.toFixed(2)),
        candleDirection,
        candlePositionWrtMa,
        crossoverState,
        crossoverCandlesPrior: Math.max(1, crossoverCandlesPrior),
        crossoverEndedInCandles: null, // will be resolved after multi-day scan
      };
    }

    let milestone1: MilestoneHit | null = null;
    let milestone2: Milestone2Hit | null = null;
    let m1CandleLocalIndex = -1;

    // Crossings & Drawdown Tracking
    let slCrossCount = 0;
    let tpCrossCount = 0;
    let entryCrossCount = 0;

    let maxAdversePoints = 0;
    let maxLossBeforeEntryReturn = 0;
    let maxProfitPoints = 0;
    let maxProfitBeforeReturn = 0;
    let hasReturnedToEntry = false;
    let drawdownVolume = 0;
    let drawdownCandlesCount = 0;

    // Helper to evaluate candle for crossings & adverse excursions
    const processCandleExcursion = (candle: Candle, candleIdx: number) => {
      // 1. Crossings (price spanned through the level)
      if (candle.low <= trade.sl && candle.high >= trade.sl) slCrossCount++;
      if (candle.low <= trade.tp && candle.high >= trade.tp) tpCrossCount++;
      if (candle.low <= trade.entry && candle.high >= trade.entry) entryCrossCount++;

      // 2. Adverse price movement relative to goal:
      let adverseDistance = 0;
      let isInAdverse = false;

      if (isUber) {
        // Goal is SL. Adverse is in TP direction!
        if (isBuy) {
          // BUY_STOP: TP is above entry. Adverse movement is price going UP towards TP!
          adverseDistance = Math.max(0, candle.high - trade.entry);
          isInAdverse = candle.close > trade.entry;
        } else {
          // SELL_STOP: TP is below entry. Adverse movement is price going DOWN towards TP!
          adverseDistance = Math.max(0, trade.entry - candle.low);
          isInAdverse = candle.close < trade.entry;
        }
      } else {
        // Non-Uber: Goal is TP. Adverse is in SL direction!
        if (isBuy) {
          // BUY_STOP: SL is below entry. Adverse movement is price going DOWN towards SL!
          adverseDistance = Math.max(0, trade.entry - candle.low);
          isInAdverse = candle.close < trade.entry;
        } else {
          // SELL_STOP: SL is above entry. Adverse movement is price going UP towards SL!
          adverseDistance = Math.max(0, candle.high - trade.entry);
          isInAdverse = candle.close > trade.entry;
        }
      }

      if (adverseDistance > maxAdversePoints) {
        maxAdversePoints = adverseDistance;
      }

      // Track excursion before price first returns to entry level
      if (!hasReturnedToEntry) {
        if (adverseDistance > maxLossBeforeEntryReturn) {
          maxLossBeforeEntryReturn = adverseDistance;
        }
        // Check if price returned to entry after initial bar
        if (candleIdx > 0 && candle.low <= trade.entry && candle.high >= trade.entry) {
          hasReturnedToEntry = true;
        }
      }

      if (isInAdverse) {
        drawdownVolume += Math.round(candle.volume / lotSize);
        drawdownCandlesCount++;
      }
    };

    // Scan intraday candles for Milestone 1 & 2
    for (let i = 0; i < candidateCandles.length; i++) {
      const candle = candidateCandles[i];
      const globalCandleIdx = effectiveStartIdx + i;

      processCandleExcursion(candle, i);

      const hitTP = isBuy ? candle.high >= trade.tp : candle.low <= trade.tp;
      const hitSL = isBuy ? candle.low <= trade.sl : candle.high >= trade.sl;

      if (!milestone1) {
        if (hitTP && hitSL) {
          const distToSL = Math.abs(candle.open - trade.sl);
          const distToTP = Math.abs(candle.open - trade.tp);
          const inferredFirst = distToSL < distToTP ? 'SL' : 'TP';
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone1 = {
            type: inferredFirst,
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            candleTimeMs: candle.timeMs,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            hitPrice: inferredFirst === 'SL' ? trade.sl : trade.tp,
            hitDate: dateStr,
          };
          m1CandleLocalIndex = i;
        } else if (hitSL) {
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone1 = {
            type: 'SL',
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            candleTimeMs: candle.timeMs,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            hitPrice: trade.sl,
            hitDate: dateStr,
          };
          m1CandleLocalIndex = i;
        } else if (hitTP) {
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone1 = {
            type: 'TP',
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            candleTimeMs: candle.timeMs,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            hitPrice: trade.tp,
            hitDate: dateStr,
          };
          m1CandleLocalIndex = i;
        }
      } else if (!milestone2 && i > m1CandleLocalIndex) {
        // Milestone 1 already hit, look for Milestone 2 in same day
        const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
        const hitTarget2 = target2 === 'TP' ? hitTP : hitSL;

        if (hitTarget2) {
          const hitTimeMs = candle.timeMs;
          const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
            dayCandles,
            effectiveStartIdx,
            globalCandleIdx,
            tradeEntryMs,
            hitTimeMs,
            trade.threshold,
            lotSize
          );

          milestone2 = {
            type: target2,
            achievedSameDay: true,
            candleIndex: i,
            candleTimestamp: candle.timestamp,
            hitDate: dateStr,
            candlesCount: i + 1,
            daysElapsed: 0,
            timeTakenMs: Math.max(0, candle.timeMs - tradeEntryMs),
            timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, candle.timeMs - tradeEntryMs)),
            cumulativeVolume: volumeSum,
            ticks,
            notes: `Achieved same day at candle #${i + 1}`,
          };
          break;
        }
      }
    }

    // MULTI-DAY MILESTONE TRACKING:
    // If M1 or M2 is not achieved on the entry day, scan consecutive days' high/low ranges day-by-day.
    // Once the target day is identified, fetch the 1-minute candles from entry date through that identified day,
    // and pinpoint the exact minute, volume ticks, and time!
    // Requirement 4: fullMultiDayCandles starts from beginning of trade entry day (09:15 AM)
    let fullMultiDayCandles: Candle[] = [...dayCandles];
    const todayDate = UpstoxApiService.toISTDate(Date.now());
    let consecutiveDailyCandles: Candle[] = [];

    if (!milestone1 || (milestone1 && !milestone2)) {
      try {
        const nextDay = new Date(new Date(dateStr).getTime() + 86400000).toISOString().split('T')[0];
        consecutiveDailyCandles = await this.apiService.fetchDailyCandles(trade.instrument, nextDay, todayDate);
      } catch {
        consecutiveDailyCandles = [];
      }
    }

    // Multi-Day M1 Resolution
    if (!milestone1 && consecutiveDailyCandles.length > 0) {
      let targetDayDate: string | null = null;
      let dayCount = 0;

      for (const dayCandle of consecutiveDailyCandles) {
        dayCount++;
        const dDate = UpstoxApiService.toISTDate(dayCandle.timeMs);
        const hitDayTP = isBuy ? dayCandle.high >= trade.tp : dayCandle.low <= trade.tp;
        const hitDaySL = isBuy ? dayCandle.low <= trade.sl : dayCandle.high >= trade.sl;

        if (hitDayTP || hitDaySL) {
          targetDayDate = dDate;
          break;
        }
      }

      if (targetDayDate) {
        // Fetch 1-min candles from entry date through targetDayDate!
        const rangeCandles = await this.apiService.fetchCandleRange(trade.instrument, dateStr, targetDayDate);
        if (rangeCandles.length > 0) {
          fullMultiDayCandles = augmentCandlesWithIndicators(rangeCandles);
          let rangeEntryIdx = rangeCandles.findIndex((c) => c.timeMs <= tradeEntryMs && tradeEntryMs < c.timeMs + 60_000);
          if (rangeEntryIdx === -1) {
            rangeEntryIdx = rangeCandles.findIndex((c) => c.timeMs >= tradeEntryMs);
          }
          const multiStartIdx = rangeEntryIdx >= 0 ? rangeEntryIdx + 1 : rangeCandles.length;
          const activeRange = multiStartIdx < rangeCandles.length ? rangeCandles.slice(multiStartIdx) : [];
          const baseIdx = multiStartIdx;

          for (let k = 0; k < activeRange.length; k++) {
            const c = activeRange[k];
            processCandleExcursion(c, candidateCandles.length + k);

            const hitTP = isBuy ? c.high >= trade.tp : c.low <= trade.tp;
            const hitSL = isBuy ? c.low <= trade.sl : c.high >= trade.sl;

            if (hitTP || hitSL) {
              const hitType: 'TP' | 'SL' = hitTP && !hitSL ? 'TP' : 'SL';
              const hitTimeMs = c.timeMs;
              const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
                rangeCandles,
                baseIdx,
                baseIdx + k,
                tradeEntryMs,
                hitTimeMs,
                trade.threshold,
                lotSize
              );

              milestone1 = {
                type: hitType,
                candleIndex: k,
                candleTimestamp: c.timestamp,
                candleTimeMs: c.timeMs,
                candlesCount: candidateCandles.length + k + 1,
                daysElapsed: dayCount,
                timeTakenMs: Math.max(0, hitTimeMs - tradeEntryMs),
                timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, hitTimeMs - tradeEntryMs)),
                cumulativeVolume: volumeSum,
                ticks,
                hitPrice: hitType === 'TP' ? trade.tp : trade.sl,
                hitDate: targetDayDate,
              };
              m1CandleLocalIndex = k;
              break;
            }
          }
        }
      }
    }

    // Multi-Day M2 Resolution (Milestone 1 reached, scanning for Milestone 2)
    if (milestone1 && !milestone2 && consecutiveDailyCandles.length > 0) {
      const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
      let targetM2DayDate: string | null = null;
      let dayCount = milestone1.daysElapsed;

      for (let d = milestone1.daysElapsed; d < consecutiveDailyCandles.length; d++) {
        const dayCandle = consecutiveDailyCandles[d];
        dayCount++;
        const dDate = UpstoxApiService.toISTDate(dayCandle.timeMs);
        const hitDayTarget2 = target2 === 'TP'
          ? (isBuy ? dayCandle.high >= trade.tp : dayCandle.low <= trade.tp)
          : (isBuy ? dayCandle.low <= trade.sl : dayCandle.high >= trade.sl);

        if (hitDayTarget2) {
          targetM2DayDate = dDate;
          break;
        }
      }

      if (targetM2DayDate) {
        // Fetch 1m candles through targetM2DayDate
        const rangeCandles = await this.apiService.fetchCandleRange(trade.instrument, dateStr, targetM2DayDate);
        if (rangeCandles.length > 0) {
          fullMultiDayCandles = augmentCandlesWithIndicators(rangeCandles);
          const multiStartIdx = rangeCandles.findIndex((c) => c.timeMs + 60_000 >= tradeEntryMs);
          const activeRange = multiStartIdx >= 0 ? rangeCandles.slice(multiStartIdx) : rangeCandles;
          const baseIdx = multiStartIdx >= 0 ? multiStartIdx : 0;

          // Locate M1 candle index in range
          const m1IdxInRange = activeRange.findIndex((c) => c.timeMs >= milestone1!.candleTimeMs);
          const searchStart = m1IdxInRange >= 0 ? m1IdxInRange + 1 : 0;

          for (let m = searchStart; m < activeRange.length; m++) {
            const c = activeRange[m];
            processCandleExcursion(c, candidateCandles.length + m);

            const hitTP = isBuy ? c.high >= trade.tp : c.low <= trade.tp;
            const hitSL = isBuy ? c.low <= trade.sl : c.high >= trade.sl;
            const hitTarget2 = target2 === 'TP' ? hitTP : hitSL;

            if (hitTarget2) {
              const hitTimeMs = c.timeMs;
              const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
                rangeCandles,
                baseIdx,
                baseIdx + m,
                tradeEntryMs,
                hitTimeMs,
                trade.threshold,
                lotSize
              );

              milestone2 = {
                type: target2,
                achievedSameDay: false,
                hitDate: targetM2DayDate,
                candleIndex: m,
                candleTimestamp: c.timestamp,
                candlesCount: candidateCandles.length + m + 1,
                daysElapsed: dayCount,
                timeTakenMs: Math.max(0, hitTimeMs - tradeEntryMs),
                timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, hitTimeMs - tradeEntryMs)),
                cumulativeVolume: volumeSum,
                ticks,
                notes: `Achieved on day +${dayCount} (${targetM2DayDate})`,
              };
              break;
            }
          }
        }
      }
    }

    // Requirement 8: If M2 still not hit, check 1-minute candle data directly for current date (todayDate)
    if (milestone1 && !milestone2 && todayDate !== dateStr) {
      try {
        const todayCandles = await this.getCandlesForDay(trade.instrument, todayDate);
        if (todayCandles && todayCandles.length > 0) {
          const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
          for (let m = 0; m < todayCandles.length; m++) {
            const c = todayCandles[m];
            const hitTP = isBuy ? c.high >= trade.tp : c.low <= trade.tp;
            const hitSL = isBuy ? c.low <= trade.sl : c.high >= trade.sl;
            const hitTarget2 = target2 === 'TP' ? hitTP : hitSL;

            if (hitTarget2) {
              const hitTimeMs = c.timeMs;
              const { volumeSum, ticks } = Command2Service.calculateVolumeAndTicks(
                todayCandles,
                0,
                m,
                todayCandles[0].timeMs,
                hitTimeMs,
                trade.threshold,
                lotSize
              );

              const daysDiff = Math.max(1, Math.round((new Date(todayDate).getTime() - new Date(dateStr).getTime()) / 86400000));
              milestone2 = {
                type: target2,
                achievedSameDay: false,
                hitDate: todayDate,
                candleIndex: m,
                candleTimestamp: c.timestamp,
                candlesCount: candidateCandles.length + m + 1,
                daysElapsed: daysDiff,
                timeTakenMs: Math.max(0, hitTimeMs - tradeEntryMs),
                timeTakenFormatted: UpstoxApiService.formatDurationDaysHours(Math.max(0, hitTimeMs - tradeEntryMs)),
                cumulativeVolume: (milestone1.cumulativeVolume || 0) + volumeSum,
                ticks: parseFloat(((milestone1.ticks || 0) + ticks).toFixed(2)),
                notes: `Achieved on current date (${todayDate}) via 1-minute candle resolution`,
              };
              fullMultiDayCandles = [...fullMultiDayCandles, ...todayCandles.slice(0, m + 1)];
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Error checking today 1m candles for pending M2:', err);
      }
    }

    // If M2 still not hit, mark as PENDING
    if (milestone1 && !milestone2) {
      const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
      const daysElapsed = milestone1.daysElapsed;
      const elapsedMs = Math.max(0, Date.now() - tradeEntryMs);

      milestone2 = {
        type: 'PENDING',
        achievedSameDay: false,
        daysElapsed,
        timeTakenMs: elapsedMs,
        timeTakenFormatted: `Pending (${UpstoxApiService.formatDurationDaysHours(elapsedMs)})`,
        cumulativeVolume: milestone1.cumulativeVolume,
        ticks: milestone1.ticks,
        notes: `Target ${target2} pending up to current date (${todayDate})`,
      };
    }

    // MILESTONE SUCCESS & METRICS (Requirement 6)
    // Uber: Goal is SL (Win). Non-Uber: Goal is TP (Win).
    const isSuccess = milestone1 ? milestone1.type === expectedTarget : false;
    const isLossTrade = milestone1 ? !isSuccess : false;

    // Build timeline of all evaluated candles from entry to M2 / end
    const allCandles = fullMultiDayCandles.length > 0 ? fullMultiDayCandles : candidateCandles;
    const m1IdxInAll = milestone1
      ? allCandles.findIndex((c) => c.timeMs >= milestone1!.candleTimeMs)
      : -1;

    // Helper for profit & adverse distances per candle
    const getCandleExcursion = (c: Candle) => {
      let profitDist = 0;
      let adverseDist = 0;
      let isInAdverse = false;

      if (isUber) {
        // Uber: Win is SL. Adverse is TP.
        if (isBuy) {
          profitDist = Math.max(0, trade.entry - c.low); // Win: dropping towards SL
          adverseDist = Math.max(0, c.high - trade.entry); // Loss: rising towards TP
          isInAdverse = c.close > trade.entry;
        } else {
          profitDist = Math.max(0, c.high - trade.entry); // Win: rising towards SL
          adverseDist = Math.max(0, trade.entry - c.low); // Loss: dropping towards TP
          isInAdverse = c.close < trade.entry;
        }
      } else {
        // Non-Uber: Win is TP. Adverse is SL.
        if (isBuy) {
          profitDist = Math.max(0, c.high - trade.entry); // Win: rising towards TP
          adverseDist = Math.max(0, trade.entry - c.low); // Loss: dropping towards SL
          isInAdverse = c.close < trade.entry;
        } else {
          profitDist = Math.max(0, trade.entry - c.low); // Win: dropping towards TP
          adverseDist = Math.max(0, c.high - trade.entry); // Loss: rising towards SL
          isInAdverse = c.close > trade.entry;
        }
      }
      return { profitDist, adverseDist, isInAdverse };
    };

    // In allCandles, identify the index of the first candle strictly AFTER the entry candle
    let postEntryIdxInAll = allCandles.findIndex(
      (c) => c.timeMs > tradeEntryMs && c.timeMs >= (dayCandles[entryCandleIdx]?.timeMs ?? 0) + 60_000
    );
    if (postEntryIdxInAll === -1) {
      postEntryIdxInAll = allCandles.findIndex((c) => c.timeMs > tradeEntryMs);
    }
    const evalStartInAll = postEntryIdxInAll >= 0 ? postEntryIdxInAll : allCandles.length;

    maxAdversePoints = 0;
    maxLossBeforeEntryReturn = 0;
    maxProfitPoints = 0;
    maxProfitBeforeReturn = 0;

    slCrossCount = 0;
    tpCrossCount = 0;
    entryCrossCount = 0;

    drawdownVolume = 0;
    drawdownCandlesCount = 0;

    if (milestone1) {
      if (isSuccess) {
        // RULE 6A: "For a trade that hit win as M1, max loss and before return should be 0."
        maxAdversePoints = 0;
        maxLossBeforeEntryReturn = 0;

        // RULE 6B: "include all max profit and max profit before return - that says how much win it has hit before touching back on loss and back on return. Max profit before return to entry is non zero only when M1 had hit win."
        let peakProfit = 0;
        let peakProfitBeforeTouch = 0;
        let hasTouchedLossOrEntry = false;

        const profitEndIdx = (milestone2 && milestone2.type !== 'PENDING')
          ? allCandles.findIndex((c) => c.timeMs >= milestone2!.timeTakenMs + tradeEntryMs)
          : m1IdxInAll;
        const effectiveEnd = profitEndIdx >= 0 ? profitEndIdx : allCandles.length - 1;

        for (let idx = evalStartInAll; idx <= effectiveEnd && idx < allCandles.length; idx++) {
          const c = allCandles[idx];
          const { profitDist, adverseDist } = getCandleExcursion(c);
          if (profitDist > peakProfit) {
            peakProfit = profitDist;
          }
          if (!hasTouchedLossOrEntry) {
            if (profitDist > peakProfitBeforeTouch) {
              peakProfitBeforeTouch = profitDist;
            }
            if (idx > evalStartInAll && (adverseDist > 0 || (c.low <= trade.entry && c.high >= trade.entry))) {
              hasTouchedLossOrEntry = true;
            }
          }
        }
        maxProfitPoints = peakProfit;
        maxProfitBeforeReturn = peakProfitBeforeTouch;
      } else {
        // M1 is LOSS:
        // RULE 6B: "Max profit before return to entry is non zero only when M1 had hit win."
        maxProfitPoints = 0;
        maxProfitBeforeReturn = 0;

        // RULE 6A: "max loss is calculated the max it went in opposite direction before it hit win."
        let peakLoss = 0;
        for (let idx = evalStartInAll; idx < allCandles.length; idx++) {
          const c = allCandles[idx];
          const { adverseDist, isInAdverse } = getCandleExcursion(c);
          if (adverseDist > peakLoss) {
            peakLoss = adverseDist;
          }
          if (isInAdverse) {
            drawdownVolume += Math.round(c.volume / lotSize);
            drawdownCandlesCount++;
          }
        }
        maxAdversePoints = peakLoss;

        // RULE 6A: "for before return, it should be calculated only after a loss is hit first."
        let peakLossAfterM1BeforeReturn = 0;
        let hasReturnedToEntryAfterLoss = false;
        const startLossIdx = m1IdxInAll >= 0 ? m1IdxInAll + 1 : evalStartInAll;

        for (let idx = startLossIdx; idx < allCandles.length; idx++) {
          const c = allCandles[idx];
          const { adverseDist } = getCandleExcursion(c);
          if (!hasReturnedToEntryAfterLoss) {
            if (adverseDist > peakLossAfterM1BeforeReturn) {
              peakLossAfterM1BeforeReturn = adverseDist;
            }
            if (c.low <= trade.entry && c.high >= trade.entry) {
              hasReturnedToEntryAfterLoss = true;
            }
          }
        }
        maxLossBeforeEntryReturn = peakLossAfterM1BeforeReturn;
      }

      // RULE 6C: "Once M1 is hit, the price may hit entry again and before it hits M1 again it could cross in the same direction towards M2 - we want to track that count (in the direction of M2 crossing entry price here)."
      const startCounterIdx = m1IdxInAll >= 0 ? m1IdxInAll + 1 : evalStartInAll;
      const endCounterIdx = (milestone2 && milestone2.type !== 'PENDING')
        ? allCandles.findIndex((c) => c.timeMs >= milestone2!.timeTakenMs + tradeEntryMs)
        : allCandles.length - 1;
      const effectiveCounterEnd = endCounterIdx >= 0 ? endCounterIdx : allCandles.length - 1;

      const target2 = milestone1.type === 'SL' ? 'TP' : 'SL';
      // Determine if moving towards M2 requires crossing entry upwards (above) or downwards (below)
      const isM2AboveEntry = (target2 === 'TP' && isBuy) || (target2 === 'SL' && !isBuy);

      let currentSide: 'M1_SIDE' | 'M2_SIDE' = 'M1_SIDE';
      entryCrossCount = 0;

      for (let idx = startCounterIdx; idx <= effectiveCounterEnd && idx < allCandles.length; idx++) {
        const c = allCandles[idx];

        // Track SL and TP crossings
        if (c.low <= trade.sl && c.high >= trade.sl) {
          slCrossCount++;
        }
        if (c.low <= trade.tp && c.high >= trade.tp) {
          tpCrossCount++;
        }

        // Track entry crossings in the direction towards M2
        if (currentSide === 'M1_SIDE') {
          const crossedToM2 = isM2AboveEntry ? c.high > trade.entry : c.low < trade.entry;
          if (crossedToM2) {
            entryCrossCount++;
            const closedInM2 = isM2AboveEntry ? c.close > trade.entry : c.close < trade.entry;
            currentSide = closedInM2 ? 'M2_SIDE' : 'M1_SIDE';
          }
        } else {
          // On M2 side: check if price pulled back across entry towards M1 side
          const pulledBackToM1 = isM2AboveEntry ? c.low <= trade.entry : c.high >= trade.entry;
          if (pulledBackToM1) {
            currentSide = 'M1_SIDE';
            // Volatile candle that pulled back and re-crossed towards M2 in the same minute
            const reCrossedToM2 = isM2AboveEntry
              ? (c.open <= trade.entry && c.close > trade.entry)
              : (c.open >= trade.entry && c.close < trade.entry);
            if (reCrossedToM2) {
              entryCrossCount++;
              currentSide = 'M2_SIDE';
            }
          }
        }
      }
    }

    // Loss multiples:
    const maxLossMultiple = plannedRisk > 0 ? parseFloat((maxAdversePoints / plannedRisk).toFixed(2)) : 0;
    const lossMultipleBeforeEntryReturn = plannedRisk > 0 ? parseFloat((maxLossBeforeEntryReturn / plannedRisk).toFixed(2)) : 0;

    // Profit multiples:
    const maxProfitMultiple = plannedReward > 0 ? parseFloat((maxProfitPoints / plannedReward).toFixed(2)) : 0;
    const profitMultipleBeforeReturn = plannedReward > 0 ? parseFloat((maxProfitBeforeReturn / plannedReward).toFixed(2)) : 0;

    let lossEntryTimeFormatted: string | undefined;
    let lossM1TimeFormatted: string | undefined;
    let lossDurationFormatted: string | undefined;

    if (isLossTrade && milestone1) {
      lossEntryTimeFormatted = entryIst;
      lossM1TimeFormatted = UpstoxApiService.toISTString(milestone1.candleTimeMs);
      lossDurationFormatted = milestone1.timeTakenFormatted;
    }

    const drawdown: DrawdownAnalysis = {
      plannedRisk: parseFloat(plannedRisk.toFixed(2)),
      maxAdversePoints: parseFloat(maxAdversePoints.toFixed(2)),
      maxLossMultiple,
      maxLossBeforeEntryReturn: parseFloat(maxLossBeforeEntryReturn.toFixed(2)),
      lossMultipleBeforeEntryReturn,
      plannedReward: parseFloat(plannedReward.toFixed(2)),
      maxProfitPoints: parseFloat(maxProfitPoints.toFixed(2)),
      maxProfitMultiple,
      maxProfitBeforeReturn: parseFloat(maxProfitBeforeReturn.toFixed(2)),
      profitMultipleBeforeReturn,
      slCrossCount,
      tpCrossCount,
      entryCrossCount,
      drawdownTicks: trade.threshold > 0 ? parseFloat((drawdownVolume / trade.threshold).toFixed(2)) : 0,
      drawdownTimeFormatted: UpstoxApiService.formatDurationDaysHours(drawdownCandlesCount * 60000),
      lossEntryTimeFormatted,
      lossM1TimeFormatted,
      lossDurationFormatted,
    };

    // Requirement 3: Determine in how many candles the crossover state ended
    if (entryIndicators) {
      let endedInCandles: number | null = null;
      for (let k = effectiveStartIdx + 1; k < fullMultiDayCandles.length; k++) {
        const c = fullMultiDayCandles[k];
        if (c.smaFast !== undefined && c.smaSlow !== undefined) {
          const stateNow = c.smaFast >= c.smaSlow ? 'BULLISH' : 'BEARISH';
          if (stateNow !== entryIndicators.crossoverState) {
            endedInCandles = k - effectiveStartIdx;
            break;
          }
        }
      }
      entryIndicators.crossoverEndedInCandles = endedInCandles;
    }

    let status: TradeMilestoneAnalysis['status'] = 'NEITHER_HIT_YET';
    if (milestone1 && milestone2 && milestone2.type !== 'PENDING') {
      status = 'COMPLETED_BOTH';
    } else if (milestone1) {
      status = 'COMPLETED_M1_M2_PENDING';
    }

    return {
      trade,
      entryIst,
      dateStr,
      matchedVersionFilter: true,
      candlesFoundForDay: dayCandles.length,
      expectedTarget,
      isSuccess,
      milestone1,
      milestone2,
      drawdown,
      entryIndicators,
      status,
      multiDayCandles: fullMultiDayCandles.length > 0 ? fullMultiDayCandles : dayCandles,
      lotSizeUsed: lotSize,
      isVolumeTrade: trade.threshold > 0,
    };
  }

  /**
   * Group trades for same instrument within 5 minutes into single groups
   */
  static groupTrades5Min(analyses: TradeMilestoneAnalysis[]): TradeGroup5Min[] {
    const groups: TradeGroup5Min[] = [];

    // Group by instrument & date first
    const instDateMap = new Map<string, TradeMilestoneAnalysis[]>();
    for (const a of analyses) {
      const key = `${a.trade.instrument}_${a.dateStr}`;
      if (!instDateMap.has(key)) {
        instDateMap.set(key, []);
      }
      instDateMap.get(key)!.push(a);
    }

    for (const [, items] of instDateMap.entries()) {
      // Sort trades by timestamp ascending
      items.sort((a, b) => a.trade.timestamp - b.trade.timestamp);

      let currentCluster: TradeMilestoneAnalysis[] = [];
      let clusterStartTime = 0;

      for (const item of items) {
        if (currentCluster.length === 0) {
          currentCluster.push(item);
          clusterStartTime = item.trade.timestamp;
        } else {
          // If within 5 minutes (300,000 ms) of cluster start
          if (item.trade.timestamp - clusterStartTime <= 300_000) {
            currentCluster.push(item);
          } else {
            groups.push(Command2Service.build5MinGroup(currentCluster));
            currentCluster = [item];
            clusterStartTime = item.trade.timestamp;
          }
        }
      }

      if (currentCluster.length > 0) {
        groups.push(Command2Service.build5MinGroup(currentCluster));
      }
    }

    // Sort groups by timestamp
    groups.sort((a, b) => a.firstTimestamp - b.firstTimestamp);
    return groups;
  }

  private static build5MinGroup(trades: TradeMilestoneAnalysis[]): TradeGroup5Min {
    const first = trades[0];
    const last = trades[trades.length - 1];

    const versions = Array.from(new Set(trades.map((t) => t.trade.version)));
    let uberSuccessCount = 0;
    let ultraSuccessCount = 0;

    for (const a of trades) {
      if (a.isSuccess) {
        if (Command2Service.isUberVersion(a.trade.version)) {
          uberSuccessCount++;
        } else {
          ultraSuccessCount++;
        }
      }
    }

    const hasSuccess = trades.some((t) => t.isSuccess);

    // Identify which version played out best to success:
    let winningVersion: string | null = null;
    let winningReason = 'Neither version achieved success';

    const successfulTrades = trades.filter((t) => t.isSuccess);
    if (successfulTrades.length > 0) {
      successfulTrades.sort((a, b) => {
        const ticksA = a.milestone1?.ticks ?? 999999;
        const ticksB = b.milestone1?.ticks ?? 999999;
        return ticksA - ticksB;
      });

      const winner = successfulTrades[0];
      winningVersion = winner.trade.version;
      winningReason = `${winningVersion} won: hit ${winner.milestone1?.type} in ${winner.milestone1?.ticks} ticks (${winner.milestone1?.candlesCount} candles, ${winner.milestone1?.timeTakenFormatted})`;
    } else {
      trades.sort((a, b) => a.drawdown.maxLossMultiple - b.drawdown.maxLossMultiple);
      winningReason = `No target hit; ${trades[0].trade.version} had lower drawdown (${trades[0].drawdown.maxLossMultiple}x)`;
    }

    const startIst = first.entryIst.split(',')[1]?.trim() || '';
    const endIst = last.entryIst.split(',')[1]?.trim() || '';
    const timeRangeFormatted = startIst === endIst ? startIst : `${startIst} - ${endIst}`;

    return {
      groupId: `GRP_${Command1Service.safeFilename(first.trade.instrument)}_${first.trade.timestamp}`,
      instrument: first.trade.instrument,
      name: first.trade.name || first.trade.instrument,
      dateStr: first.dateStr,
      firstTimestamp: first.trade.timestamp,
      lastTimestamp: last.trade.timestamp,
      timeRangeFormatted,
      trades,
      versions,
      winningVersion,
      winningReason,
      hasSuccess,
      uberSuccessCount,
      ultraSuccessCount,
    };
  }

  /**
   * Group all trades of an instrument on a date into distinct setups outside 5-minute windows
   */
  static getDistinctInstrumentSetups(allTrades: TradeSignal[], instrumentKey: string, dateStr: string): TradeSignal[] {
    const matching = allTrades.filter(
      (t) => t.instrument === instrumentKey && UpstoxApiService.toISTDate(t.timestamp) === dateStr
    );
    if (matching.length === 0) return [];

    matching.sort((a, b) => a.timestamp - b.timestamp);

    const clusters: TradeSignal[][] = [];
    let current: TradeSignal[] = [];
    let clusterStart = 0;

    for (const t of matching) {
      if (current.length === 0) {
        current.push(t);
        clusterStart = t.timestamp;
      } else {
        if (t.timestamp - clusterStart <= 300_000) {
          current.push(t);
        } else {
          clusters.push(current);
          current = [t];
          clusterStart = t.timestamp;
        }
      }
    }
    if (current.length > 0) clusters.push(current);

    // From each cluster, pick the preferred trade (prioritizing Ultra / Uber versions!)
    return clusters.map((cluster) => {
      const preferred = cluster.find((t) => /ultra|uber/i.test(t.version));
      return preferred || cluster[0];
    });
  }

  /**
   * Deduplicate trade signals by instrument, timestamp, version, type, entry
   */
  static deduplicateTrades(trades: TradeSignal[]): TradeSignal[] {
    const seen = new Set<string>();
    const unique: TradeSignal[] = [];
    for (const t of trades) {
      if (!t) continue;
      const key = `${t.instrument}_${t.timestamp}_${t.version}_${t.type}_${Number(t.entry || 0).toFixed(2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(t);
      }
    }
    return unique;
  }

  /**
   * Deduplicate milestone analyses by trade key
   */
  static deduplicateAnalyses(analyses: TradeMilestoneAnalysis[]): TradeMilestoneAnalysis[] {
    const seen = new Set<string>();
    const unique: TradeMilestoneAnalysis[] = [];
    for (const a of analyses) {
      if (!a?.trade) continue;
      const t = a.trade;
      const key = `${t.instrument}_${t.timestamp}_${t.version}_${t.type}_${Number(t.entry || 0).toFixed(2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(a);
      }
    }
    return unique;
  }

  /**
   * Execute Command 2 across a list of trades
   */
  async execute(
    trades: TradeSignal[],
    options?: Command2Options,
    onProgress?: (p: Command2Progress) => void
  ): Promise<Command2Result> {
    const filters = options?.versionFilters;
    const useAll = options?.useAllVersions ?? false;
    const volumeOnly = options?.volumeTradesOnly !== false; // Default true: Filter only volume based trades

    // 0. Deduplicate input trades upfront to avoid redundant evaluations and duplicate output!
    const uniqueTrades = Command2Service.deduplicateTrades(trades);

    // 1. Filter only volume based trades from JSON (Requirement 4)
    let processedInput = uniqueTrades;
    let filteredOutCount = 0;
    if (volumeOnly) {
      processedInput = uniqueTrades.filter((t) => t && t.threshold > 0 && t.bar_type !== 'price');
      filteredOutCount = uniqueTrades.length - processedInput.length;
    }

    // 2. Filter trades by version
    const filteredTrades = processedInput.filter((t) =>
      Command2Service.matchesVersion(t.version, filters, useAll)
    );

    const rawAnalyses: TradeMilestoneAnalysis[] = [];
    const total = filteredTrades.length;

    const BATCH_SIZE = 10;
    const startTimeMs = Date.now();
    console.log(`\n==================================================`);
    console.log(`[COMMAND 2 START] ${new Date().toISOString()} | Processing ${total} trades in batches of ${BATCH_SIZE}...`);
    console.log(`==================================================`);

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = filteredTrades.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const trade = batch[j];
        const globalIdx = i + j;

        onProgress?.({
          currentIndex: globalIdx + 1,
          totalTrades: total,
          currentTradeName: trade.name,
          currentVersion: trade.version,
          message: `Analyzing trade ${globalIdx + 1}/${total}: ${trade.name} (${trade.version})...`,
        });

        const analysis = await this.evaluateTrade(trade);
        rawAnalyses.push(analysis);
      }

      // Non-blocking yield to event loop after each batch
      await new Promise((resolve) => setTimeout(resolve, 15));

      const elapsedSec = ((Date.now() - startTimeMs) / 1000).toFixed(2);
      const heapRamMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(total / BATCH_SIZE);
      const processedCount = Math.min(i + BATCH_SIZE, total);

      console.log(
        `[COMMAND 2 BATCH ${batchNum}/${totalBatches}] ${processedCount}/${total} trades evaluated (${elapsedSec}s elapsed) | Heap RAM: ${heapRamMb} MB`
      );
    }

    const totalElapsedSec = ((Date.now() - startTimeMs) / 1000).toFixed(2);
    console.log(`==================================================`);
    console.log(`[COMMAND 2 FINISHED] ${total} trades completed in ${totalElapsedSec}s | Analyses: ${rawAnalyses.length}`);
    console.log(`==================================================\n`);

    // REQUIREMENT 1: Separate incomplete trades (missing CSV for date) from Command 2 analyses
    const analyses: TradeMilestoneAnalysis[] = [];
    const incompleteTrades: TradeMilestoneAnalysis[] = [];

    for (const a of rawAnalyses) {
      if (a.isIncomplete || a.status === 'NO_CANDLE_DATA' || a.candlesFoundForDay === 0) {
        incompleteTrades.push(a);
      } else {
        analyses.push(a);
      }
    }

    // Compute Summary Statistics across valid analyses
    const activeFiltersApplied = options?.versionFilters && options.versionFilters.length > 0
      ? `Versions: ${options.versionFilters.join(', ')} | VolumeOnly: ${volumeOnly ? 'Yes' : 'No'}`
      : `Default (Ultra, Uber, Meta_Thursday) | VolumeOnly: ${volumeOnly ? 'Yes' : 'No'}`;

    const summary = Command2Service.computeSummary(analyses, {
      totalVolumeTradesFiltered: filteredOutCount,
      incompleteTradesCount: incompleteTrades.length,
      activeFiltersApplied,
    });

    // Build 5-minute clubbed groups
    const groups5Min = Command2Service.groupTrades5Min(analyses);

    // Save CSV Report
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.reportsDir, `milestone_analysis_${timestampStr}.csv`);
    Command2Service.saveAnalysisCsv(analyses, reportPath, { activeFiltersApplied });

    return {
      analyses,
      incompleteTrades,
      groups5Min,
      summary,
      reportCsvPath: reportPath,
    };
  }

  /**
   * Reusable summary computation method across any set of trades/filtered analyses
   */
  static computeSummary(
    analyses: TradeMilestoneAnalysis[],
    options?: {
      totalVolumeTradesFiltered?: number;
      incompleteTradesCount?: number;
      activeFiltersApplied?: string;
    }
  ): Command2Summary {
    let tp1Count = 0;
    let sl1Count = 0;
    let both1Count = 0;
    let neither1Count = 0;

    let m2SameDay = 0;
    let m2MultiDay = 0;
    let m2Pending = 0;

    let sumCandlesM1 = 0;
    let sumTimeM1 = 0;
    let sumTicksM1 = 0;
    let countM1 = 0;

    let sumTimeM2 = 0;
    let sumTicksM2 = 0;
    let countM2Achieved = 0;

    let sumMaxLossMultiple = 0;
    let sumLossMultipleBeforeEntry = 0;
    let sumMaxProfitMultiple = 0;
    let sumProfitMultipleBeforeReturn = 0;

    let totalUber = 0;
    let uberSuccessCount = 0;
    let uberLossCount = 0;

    let totalUltra = 0;
    let ultraSuccessCount = 0;
    let ultraLossCount = 0;

    let totalSuccessCount = 0;
    let totalLossCount = 0;
    let cancelledTradesCount = 0;

    const lossTrades: LossTradeDetail[] = [];
    const profitTrades: ProfitTradeDetail[] = [];

    const dateMap = new Map<string, TradeMilestoneAnalysis[]>();
    const dayMap = new Map<string, TradeMilestoneAnalysis[]>();
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Deduplicate analyses upfront to guarantee zero duplicate calculations in summary and reports
    const uniqueAnalyses = Command2Service.deduplicateAnalyses(analyses);

    for (const a of uniqueAnalyses) {
      if (a.trade.status === 'cancelled') {
        cancelledTradesCount++;
      }

      const isUber = Command2Service.isUberVersion(a.trade.version);
      if (isUber) {
        totalUber++;
        if (a.isSuccess) {
          uberSuccessCount++;
        } else {
          uberLossCount++;
        }
      } else {
        totalUltra++;
        if (a.isSuccess) {
          ultraSuccessCount++;
        } else {
          ultraLossCount++;
        }
      }

      if (a.isSuccess) {
        totalSuccessCount++;
        sumMaxProfitMultiple += a.drawdown.maxProfitMultiple;
        sumProfitMultipleBeforeReturn += a.drawdown.profitMultipleBeforeReturn;

        if (a.milestone1) {
          profitTrades.push({
            instrument: a.trade.instrument,
            name: a.trade.name,
            version: a.trade.version,
            dateStr: a.dateStr,
            type: a.trade.type,
            entry: a.trade.entry,
            goalMilestone: a.expectedTarget,
            entryTimeIST: a.entryIst,
            m1HitTimeIST: UpstoxApiService.toISTString(a.milestone1.candleTimeMs),
            m1Type: a.milestone1.type as 'SL' | 'TP',
            durationFormatted: a.milestone1.timeTakenFormatted,
            maxProfitMultiple: a.drawdown.maxProfitMultiple,
            profitBeforeReturn: a.drawdown.profitMultipleBeforeReturn,
            slCrossCount: a.drawdown.slCrossCount,
            tpCrossCount: a.drawdown.tpCrossCount,
            entryCrossCount: a.drawdown.entryCrossCount,
            ticks: a.milestone1.ticks,
            entryIndicators: a.entryIndicators,
          });
        }
      } else {
        totalLossCount++;
        sumMaxLossMultiple += a.drawdown.maxLossMultiple;
        sumLossMultipleBeforeEntry += a.drawdown.lossMultipleBeforeEntryReturn;

        if (a.milestone1) {
          lossTrades.push({
            instrument: a.trade.instrument,
            name: a.trade.name,
            version: a.trade.version,
            dateStr: a.dateStr,
            type: a.trade.type,
            entry: a.trade.entry,
            goalMilestone: a.expectedTarget,
            adverseMilestone: a.expectedTarget === 'TP' ? 'SL' : 'TP',
            entryTimeIST: a.entryIst,
            m1HitTimeIST: a.drawdown.lossM1TimeFormatted || UpstoxApiService.toISTString(a.milestone1.candleTimeMs),
            m1Type: a.milestone1.type as 'SL' | 'TP',
            durationFormatted: a.milestone1.timeTakenFormatted,
            maxLossMultiple: a.drawdown.maxLossMultiple,
            lossBeforeEntryReturn: a.drawdown.lossMultipleBeforeEntryReturn,
            slCrossCount: a.drawdown.slCrossCount,
            tpCrossCount: a.drawdown.tpCrossCount,
            entryCrossCount: a.drawdown.entryCrossCount,
            ticks: a.milestone1.ticks,
            entryIndicators: a.entryIndicators,
          });
        }
      }

      if (a.milestone1) {
        countM1++;
        sumCandlesM1 += a.milestone1.candlesCount;
        sumTimeM1 += a.milestone1.timeTakenMs;
        sumTicksM1 += a.milestone1.ticks;

        if (a.milestone1.type === 'TP') tp1Count++;
        else if (a.milestone1.type === 'SL') sl1Count++;
        else both1Count++;
      } else {
        neither1Count++;
      }

      if (a.milestone2) {
        if (a.milestone2.type !== 'PENDING') {
          countM2Achieved++;
          sumTimeM2 += a.milestone2.timeTakenMs;
          sumTicksM2 += a.milestone2.ticks;
          if (a.milestone2.achievedSameDay) {
            m2SameDay++;
          } else {
            m2MultiDay++;
          }
        } else {
          m2Pending++;
        }
      }

      if (!dateMap.has(a.dateStr)) dateMap.set(a.dateStr, []);
      dateMap.get(a.dateStr)!.push(a);

      const dObj = new Date(a.dateStr);
      const dayName = isNaN(dObj.getDay()) ? 'Unknown' : DAYS[dObj.getDay()];
      if (!dayMap.has(dayName)) dayMap.set(dayName, []);
      dayMap.get(dayName)!.push(a);
    }

    // Helper to compute Period Breakdowns (Date / Day of Week)
    const computeBreakdown = (map: Map<string, TradeMilestoneAnalysis[]>): DateDayM1Breakdown[] => {
      const results: DateDayM1Breakdown[] = [];
      for (const [key, items] of map.entries()) {
        let uTotal = 0;
        let uTp = 0;
        let uSl = 0;
        let altTotal = 0;
        let altTp = 0;
        let altSl = 0;
        let succ = 0;

        for (const item of items) {
          if (item.isSuccess) succ++;
          const isU = Command2Service.isUberVersion(item.trade.version);
          const m1Type = item.milestone1?.type;

          if (isU) {
            uTotal++;
            if (m1Type === 'TP') uTp++;
            if (m1Type === 'SL') uSl++;
          } else {
            altTotal++;
            if (m1Type === 'TP') altTp++;
            if (m1Type === 'SL') altSl++;
          }
        }

        results.push({
          periodKey: key,
          totalTrades: items.length,
          uberTotal: uTotal,
          uberTpCount: uTp,
          uberSlCount: uSl,
          uberWinRate: uTotal > 0 ? (uSl / uTotal) * 100 : 0,
          ultraTotal: altTotal,
          ultraTpCount: altTp,
          ultraSlCount: altSl,
          ultraWinRate: altTotal > 0 ? (altTp / altTotal) * 100 : 0,
          overallWinRate: items.length > 0 ? (succ / items.length) * 100 : 0,
        });
      }
      return results;
    };

    const dateBreakdowns = computeBreakdown(dateMap).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    const dayOfWeekBreakdowns = computeBreakdown(dayMap);

    // Classified Ticks Summary (<50, 50-100, 100-250, 250-500, >500)
    const tickBrackets = [
      { label: '< 50 ticks', min: 0, max: 50 },
      { label: '50 - 100 ticks', min: 50, max: 100 },
      { label: '100 - 250 ticks', min: 100, max: 250 },
      { label: '250 - 500 ticks', min: 250, max: 500 },
      { label: '> 500 ticks', min: 500, max: Infinity },
    ];

    const classifiedTicks: ClassifiedTicksSummary[] = tickBrackets.map((b) => {
      const matched = analyses.filter((a) => {
        const t = a.milestone1?.ticks ?? -1;
        return t >= b.min && t < b.max;
      });
      const count = matched.length;
      const pct = analyses.length > 0 ? (count / analyses.length) * 100 : 0;
      const sumMs = matched.reduce((acc, curr) => acc + (curr.milestone1?.timeTakenMs || 0), 0);
      const sumT = matched.reduce((acc, curr) => acc + (curr.milestone1?.ticks || 0), 0);

      return {
        bracket: b.label,
        count,
        percentage: parseFloat(pct.toFixed(1)),
        avgTimeTakenFormatted: count > 0 ? UpstoxApiService.formatDurationDaysHours(sumMs / count) : '-',
        avgTicks: count > 0 ? parseFloat((sumT / count).toFixed(1)) : 0,
      };
    });

    // Requirement 7:
    // Take trades as count for max profit or profit before return ONLY if the trade has hit win (totalSuccessCount).
    // Take trades as count for max loss or loss before return ONLY if the trade has hit loss (totalLossCount).
    const avgMaxProfitMultiple =
      totalSuccessCount > 0 ? parseFloat((sumMaxProfitMultiple / totalSuccessCount).toFixed(2)) : 0;
    const avgProfitMultipleBeforeReturn =
      totalSuccessCount > 0 ? parseFloat((sumProfitMultipleBeforeReturn / totalSuccessCount).toFixed(2)) : 0;

    const avgMaxLossMultiple =
      totalLossCount > 0 ? parseFloat((sumMaxLossMultiple / totalLossCount).toFixed(2)) : 0;
    const avgLossMultipleBeforeEntryReturn =
      totalLossCount > 0 ? parseFloat((sumLossMultipleBeforeEntry / totalLossCount).toFixed(2)) : 0;

    const avgCandlesToM1 = countM1 > 0 ? parseFloat((sumCandlesM1 / countM1).toFixed(1)) : 0;
    const avgTimeMsToM1 = countM1 > 0 ? sumTimeM1 / countM1 : 0;
    const avgTimeM1Formatted = countM1 > 0 ? UpstoxApiService.formatDurationDaysHours(sumTimeM1 / countM1) : '0 days 0h 0m 0s';
    const avgM1Ticks = countM1 > 0 ? parseFloat((sumTicksM1 / countM1).toFixed(2)) : 0;

    // Requirement 8: Average time to Milestone 2
    const avgTimeMsToM2 = countM2Achieved > 0 ? sumTimeM2 / countM2Achieved : 0;
    const avgTimeM2Formatted = countM2Achieved > 0 ? UpstoxApiService.formatDurationDaysHours(sumTimeM2 / countM2Achieved) : '0 days 0h 0m 0s';
    const avgM2Ticks = countM2Achieved > 0 ? parseFloat((sumTicksM2 / countM2Achieved).toFixed(2)) : 0;

    // Crossing averages and peak profit recorded
    const allProfits = uniqueAnalyses.map((a) => a.drawdown?.maxProfitMultiple || 0);
    const maxProfitMultipleRecorded = allProfits.length > 0 ? parseFloat(Math.max(...allProfits).toFixed(2)) : 0;

    const totalAnalyzed = uniqueAnalyses.length;
    const sumEntryCross = uniqueAnalyses.reduce((acc, a) => acc + (a.drawdown?.entryCrossCount || 0), 0);
    const sumSlCross = uniqueAnalyses.reduce((acc, a) => acc + (a.drawdown?.slCrossCount || 0), 0);
    const sumTpCross = uniqueAnalyses.reduce((acc, a) => acc + (a.drawdown?.tpCrossCount || 0), 0);
    const avgEntryCrossCount = totalAnalyzed > 0 ? parseFloat((sumEntryCross / totalAnalyzed).toFixed(1)) : 0;
    const avgSlCrossCount = totalAnalyzed > 0 ? parseFloat((sumSlCross / totalAnalyzed).toFixed(1)) : 0;
    const avgTpCrossCount = totalAnalyzed > 0 ? parseFloat((sumTpCross / totalAnalyzed).toFixed(1)) : 0;

    return {
      totalTradesAnalyzed: uniqueAnalyses.length,
      totalVolumeTradesFiltered: options?.totalVolumeTradesFiltered ?? 0,
      successCount: totalSuccessCount,
      lossCount: totalLossCount,
      cancelledTradesCount,
      overallWinRatePercentage: uniqueAnalyses.length > 0 ? (totalSuccessCount / uniqueAnalyses.length) * 100 : 0,
      uberSuccessRate: {
        totalUber,
        uberSuccessCount,
        uberLossCount,
        uberSuccessPercentage: totalUber > 0 ? (uberSuccessCount / totalUber) * 100 : 0,
      },
      ultraSuccessRate: {
        totalUltra,
        ultraSuccessCount,
        ultraLossCount,
        ultraSuccessPercentage: totalUltra > 0 ? (ultraSuccessCount / totalUltra) * 100 : 0,
      },
      m1Hits: {
        tpCount: tp1Count,
        slCount: sl1Count,
        bothCount: both1Count,
        neitherCount: neither1Count,
        tpPercentage: uniqueAnalyses.length > 0 ? (tp1Count / uniqueAnalyses.length) * 100 : 0,
        slPercentage: uniqueAnalyses.length > 0 ? (sl1Count / uniqueAnalyses.length) * 100 : 0,
      },
      m2Hits: {
        achievedSameDayCount: m2SameDay,
        achievedMultiDayCount: m2MultiDay,
        pendingCount: m2Pending,
        sameDayPercentage: uniqueAnalyses.length > 0 ? (m2SameDay / uniqueAnalyses.length) * 100 : 0,
        multiDayPercentage: uniqueAnalyses.length > 0 ? (m2MultiDay / uniqueAnalyses.length) * 100 : 0,
        pendingPercentage: uniqueAnalyses.length > 0 ? (m2Pending / uniqueAnalyses.length) * 100 : 0,
      },
      averages: {
        avgCandlesToM1,
        avgTimeMsToM1,
        avgTimeM1Formatted,
        avgM1Ticks,
        avgTimeMsToM2,
        avgTimeM2Formatted,
        avgM2Ticks,
        avgMaxLossMultiple,
        avgLossMultipleBeforeEntryReturn,
        avgMaxProfitMultiple,
        avgProfitMultipleBeforeReturn,
        maxProfitMultipleRecorded,
        avgEntryCrossCount,
        avgSlCrossCount,
        avgTpCrossCount,
      },
      totalIncompleteTrades: options?.incompleteTradesCount ?? 0,
      totalGroupsCount: 0,
      dateBreakdowns,
      dayOfWeekBreakdowns,
      classifiedTicks,
      lossTrades,
      profitTrades,
      activeFiltersApplied: options?.activeFiltersApplied,
    };
  }

  /**
   * Export analyses array to CSV format with ticks, drawdown metrics, MA indicators, and applied filter headers
   */
  static saveAnalysisCsv(
    analyses: TradeMilestoneAnalysis[],
    filePath: string,
    options?: { activeFiltersApplied?: string }
  ): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const headers = [
      'version',
      'instrument',
      'name',
      'type',
      'status',
      'is_cancelled',
      'entry',
      'sl',
      'tp',
      'threshold',
      'confidence',
      'lot_size',
      'trade_timestamp',
      'trade_ist',
      'expected_target',
      'is_success',
      'm1_hit_type',
      'm1_hit_date',
      'm1_days_elapsed',
      'm1_candles_count',
      'm1_time_taken',
      'm1_ticks',
      'm2_hit_type',
      'm2_achieved_same_day',
      'm2_hit_date',
      'm2_days_elapsed',
      'm2_time_taken',
      'm2_ticks',
      'max_loss_multiple',
      'loss_multiple_before_entry_return',
      'max_profit_multiple',
      'profit_multiple_before_return',
      'sl_cross_count',
      'tp_cross_count',
      'entry_cross_count',
      'loss_entry_time',
      'loss_m1_time',
      'drawdown_ticks',
      'drawdown_time',
      'entry_sma_fast',
      'entry_sma_slow',
      'entry_ema_20',
      'candle_direction',
      'candle_position_wrt_ma',
      'sma_crossover_state',
      'sma_crossover_prior_candles',
      'sma_crossover_ended_in_candles',
      'm2_notes',
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === undefined || val === null) return '';
      const s = String(val);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const uniqueAnalyses = Command2Service.deduplicateAnalyses(analyses);
    const rows = uniqueAnalyses.map((a) => {
      const t = a.trade;
      const m1 = a.milestone1;
      const m2 = a.milestone2;
      const dd = a.drawdown;
      const ind = a.entryIndicators;

      return [
        t.version,
        t.instrument,
        t.name,
        t.type,
        t.status || 'active',
        t.status === 'cancelled' ? 'YES' : 'NO',
        Number(t.entry || 0).toFixed(2),
        Number(t.sl || 0).toFixed(2),
        Number(t.tp || 0).toFixed(2),
        t.threshold,
        t.confidence ?? '',
        a.lotSizeUsed || 1,
        t.timestamp,
        a.entryIst,
        a.expectedTarget,
        a.isSuccess ? 'SUCCESS' : 'LOSS_ADVERSE',
        m1?.type || 'NEITHER',
        m1?.hitDate || a.dateStr,
        m1?.daysElapsed ?? '',
        m1?.candlesCount ?? '',
        m1?.timeTakenFormatted || '',
        m1 ? m1.ticks.toFixed(2) : '',
        m2?.type || 'NOT_REACHED',
        m2 ? (m2.achievedSameDay ? 'YES' : 'NO') : '',
        m2?.hitDate || '',
        m2?.daysElapsed ?? '',
        m2?.timeTakenFormatted || '',
        m2 ? m2.ticks.toFixed(2) : '',
        `${dd.maxLossMultiple.toFixed(2)}x`,
        `${dd.lossMultipleBeforeEntryReturn.toFixed(2)}x`,
        `${(dd.maxProfitMultiple || 0).toFixed(2)}x`,
        `${(dd.profitMultipleBeforeReturn || 0).toFixed(2)}x`,
        dd.slCrossCount,
        dd.tpCrossCount,
        dd.entryCrossCount,
        dd.lossEntryTimeFormatted || '',
        dd.lossM1TimeFormatted || '',
        dd.drawdownTicks.toFixed(2),
        dd.drawdownTimeFormatted,
        ind ? ind.smaFast : '',
        ind ? ind.smaSlow : '',
        ind ? ind.ema20 : '',
        ind ? ind.candleDirection : '',
        ind ? ind.candlePositionWrtMa : '',
        ind ? ind.crossoverState : '',
        ind ? ind.crossoverCandlesPrior : '',
        ind ? (ind.crossoverEndedInCandles !== null ? ind.crossoverEndedInCandles : 'Persisted') : '',
        m2?.notes || '',
      ].map(escapeCsv).join(',');
    });

    const metadataLines: string[] = [];
    if (options?.activeFiltersApplied) {
      metadataLines.push(`# Filters Applied: ${options.activeFiltersApplied}`);
      metadataLines.push(`# Generated IST: ${UpstoxApiService.toISTString(Date.now())}`);
    }

    const content = [...metadataLines, headers.join(','), ...rows].join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
