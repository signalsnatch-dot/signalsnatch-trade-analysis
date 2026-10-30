export interface TradeSignal {
  version: string;
  instrument: string;
  name: string;
  type: 'BUY_STOP' | 'SELL_STOP' | string;
  entry: number;
  sl: number;
  tp: number;
  confidence?: number;
  reason?: string;
  timestamp: number; // millisecond timestamp
  barNumber?: number;
  bar_type?: 'volume' | 'price' | string;
  threshold: number;
  status: 'completed' | 'cancelled' | 'active' | string;
  overlapping?: boolean;
  exitReason?: string | null;
  exitPrice?: number | null;
  ist?: string;
}

export interface Candle {
  timestamp: string; // ISO 8601 (e.g. 2026-10-27T09:15:00+05:30)
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
  // Basic technical indicators
  ema20?: number;
  smaFast?: number; // e.g. SMA 9
  smaSlow?: number; // e.g. SMA 21
  crossover?: 'BULLISH' | 'BEARISH' | null;
}

export interface MilestoneHit {
  type: 'SL' | 'TP' | 'BOTH_SAME_MINUTE';
  candleIndex: number;
  candleTimestamp: string;
  candleTimeMs: number;
  candlesCount: number; // number of 1-minute candles from trade entry
  daysElapsed: number; // 0 for same day, >=1 for multi-day
  timeTakenMs: number;
  timeTakenFormatted: string; // "X day(s) Hh Mm Ss"
  cumulativeVolume: number; // adjusted by lotSize for NSE_FO
  ticks: number; // cumulativeVolume / threshold
  hitPrice: number;
  hitDate?: string;
}

export interface Milestone2Hit {
  type: 'SL' | 'TP' | 'PENDING';
  achievedSameDay: boolean;
  candleIndex?: number;
  candleTimestamp?: string;
  hitDate?: string;
  candlesCount?: number;
  daysElapsed: number; // 0 for same day, >=1 for multi-day
  timeTakenMs: number;
  timeTakenFormatted: string; // "X day(s) Hh Mm Ss"
  cumulativeVolume: number; // adjusted by lotSize for NSE_FO
  ticks: number; // cumulativeVolume / threshold
  notes?: string;
}

/**
 * Detailed Drawdown & Adverse Excursion metrics before hitting target / M2
 */
export interface DrawdownAnalysis {
  plannedRisk: number; // Math.abs(entry - planned_sl_or_tp)
  maxAdversePoints: number; // maximum price adverse movement
  maxLossMultiple: number; // maxAdversePoints / plannedRisk (e.g. 3.0x) - 0 if M1 was WIN
  maxLossBeforeEntryReturn: number; // adverse points reached before price first returned to entry after loss
  lossMultipleBeforeEntryReturn: number; // 0 if M1 was WIN
  
  // Requirement 6: Max profit and max profit before return metrics
  plannedReward: number; // Math.abs(entry - target)
  maxProfitPoints: number; // maximum excursion in win/profit direction
  maxProfitMultiple: number; // maxProfitPoints / plannedReward
  maxProfitBeforeReturn: number; // profit reached before touching loss or returning to entry (0 if M1 not win)
  profitMultipleBeforeReturn: number;

  // Requirement 6: SL, TP, Entry counts calculated AFTER M1 is hit
  slCrossCount: number; // times price crossed SL level after M1
  tpCrossCount: number; // times price crossed TP level after M1
  entryCrossCount: number; // times price touched/crossed back to Entry level after M1
  
  drawdownTicks: number; // ticks accumulated while in drawdown
  drawdownTimeFormatted: string;
  lossEntryTimeFormatted?: string; // IST
  lossM1TimeFormatted?: string; // IST (SL time for Ultra/others, TP time for Uber)
  lossDurationFormatted?: string;
}

export interface TradeEntryMaIndicators {
  smaFast: number; // SMA 9 at entry candle
  smaSlow: number; // SMA 21 at entry candle
  ema20: number; // EMA 20 at entry candle
  candleDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  candlePositionWrtMa: string;
  crossoverState: 'BULLISH' | 'BEARISH';
  crossoverCandlesPrior: number;
  crossoverEndedInCandles: number | null; // null if persisted through session/candles
}

export interface TradeMilestoneAnalysis {
  trade: TradeSignal;
  entryIst: string;
  dateStr: string; // YYYY-MM-DD
  matchedVersionFilter: boolean;
  candlesFoundForDay: number;
  expectedTarget: 'TP' | 'SL'; // For Uber: SL; for Ultra/others: TP
  isSuccess: boolean; // Uber: M1 is SL; Ultra/others: M1 is TP
  milestone1: MilestoneHit | null;
  milestone2: Milestone2Hit | null;
  drawdown: DrawdownAnalysis;
  entryIndicators?: TradeEntryMaIndicators;
  status: 'COMPLETED_BOTH' | 'COMPLETED_M1_M2_PENDING' | 'NEITHER_HIT_YET' | 'NO_CANDLE_DATA';
  multiDayCandles?: Candle[]; // 1m candles spanning from entry date through milestone identified date
  lotSizeUsed?: number;
  isVolumeTrade?: boolean;
  isIncomplete?: boolean;
  incompleteReason?: string;
}

/**
 * 5-Minute Clubbed Trade Group
 */
export interface TradeGroup5Min {
  groupId: string;
  instrument: string;
  name: string;
  dateStr: string;
  firstTimestamp: number;
  lastTimestamp: number;
  timeRangeFormatted: string;
  trades: TradeMilestoneAnalysis[];
  versions: string[];
  winningVersion: string | null;
  winningReason: string;
  hasSuccess: boolean;
  uberSuccessCount: number;
  ultraSuccessCount: number;
}

export interface DayInstrumentAccumulation {
  date: string; // YYYY-MM-DD
  instruments: {
    instrumentKey: string;
    tradeCount: number;
    names: string[];
    csvDownloaded: boolean;
    candleCount: number;
    filePath?: string;
  }[];
  totalTrades: number;
}
