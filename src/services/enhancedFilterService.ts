import { TradeMilestoneAnalysis, TradeSignal } from '../types/trade.ts';
import { UpstoxApiService } from './upstoxApi.ts';

/**
 * Trade Lifecycle States
 * State 0: Pre-Entry (Filter candidate signals)
 * State 1: In-Flight Entry -> Awaiting M1
 * State 2A: M1 is WON (UBER hits SL; ULTRA/META hits TP)
 * State 2B: M1 is LOST (UBER hits TP; ULTRA/META hits SL)
 * State 3: Adverse Recovery Hold Phase (ONLY active losing positions)
 * State 4A: Target Lock / Runner Trail (Profit banked or trailing)
 * State 4B: Final Resolution (M2 Recovery Hit OR Hard Stop Cut)
 */
export type LifecycleStateCode =
  | 'STATE_0'
  | 'STATE_1'
  | 'STATE_2A_4A'
  | 'STATE_2B_3'
  | 'STATE_4B';

export interface TradeLifecycleState {
  code: LifecycleStateCode;
  name: string;
  shortLabel: string;
  description: string;
  isWonM1: boolean;
  isLossRecovery: boolean;
}

export type RuleStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
export type RulePhase =
  | 'PRE_ENTRY'
  | 'IN_FLIGHT'
  | 'RECOVERY_HOLD'
  | 'FINAL_EXIT'
  | 'COMBINATION'
  | 'INVERSION';

export interface RuleEvaluation {
  id: string;
  name: string;
  phase: RulePhase;
  lifecycleState: string;
  status: RuleStatus;
  achieved: boolean; // true if status === 'PASS'
  isApplicable: boolean; // false if NOT_APPLICABLE (e.g., Hold rule on M1 Win)
  triggerMoment: string;
  eligiblePool: string;
  scoreContribution: number;
  maxScore: number;
  description: string;
  confidenceText?: string;
  detail: string;
  actionText: string;
}

export interface ExitHoldingGuidance {
  tradeType: string;
  optimalHoldWin: string;
  maxHoldWin: string;
  optimalHoldLoss: string;
  targetProfitMultiple: string;
  maxDrawdownAllowed: string;
  primaryCloseIndicator: string;
  lossManagementRule: string;
  liveStatusAdvice?: string;
}

export interface HighConfluenceCombinationMatch {
  id: string;
  name: string;
  winRate: number;
  engine: 'UBER' | 'ULTRA' | 'META';
  badgeLabel: string;
  description: string;
  phaseTarget: string;
}

export interface InversionSignal {
  shouldInvert: boolean;
  inversionType: string;
  invertedDirection: 'BUY' | 'SELL';
  originalType: string;
  entryPrice: number;
  targetPrice: number; // original SL
  originalSL: number;
  winRate: number; // 92.3%
  title: string;
  rationale: string;
}

export interface LifecycleAdvice {
  lifecycleState: TradeLifecycleState;
  entryVerdict: 'PASS' | 'WARN' | 'REJECT';
  entryReason: string;
  inFlightAdvice: string;
  holdAdvice: string;
  exitAdvice: string;
}

export interface EnhancedFilterResult {
  engineType: 'UBER' | 'META' | 'ULTRA' | 'OTHER';
  engineName: string;
  expectedTarget: 'SL' | 'TP';
  targetPhilosophy: string;
  benchmarkHistoricalWinRate: number;
  lifecycleState: TradeLifecycleState;
  score: number; // 0 to 100 based strictly on Pre-Entry (State 0) setup quality
  isHighConfluence: boolean; // score >= 85 or matches >90% combination
  highConfluenceCombinations: HighConfluenceCombinationMatch[];
  inversionSignal?: InversionSignal;
  lifecycleAdvice: LifecycleAdvice;
  rules: RuleEvaluation[];
  preEntryRules: RuleEvaluation[];
  inFlightRules: RuleEvaluation[];
  recoveryHoldRules: RuleEvaluation[];
  finalExitRules: RuleEvaluation[];
  // Backwards compatibility mappings
  entryRules: RuleEvaluation[];
  holdRules: RuleEvaluation[];
  exitRules: RuleEvaluation[];
  achievedTags: string[];
  missedTags: string[];
  notApplicableTags: string[];
  guidance: ExitHoldingGuidance;
}

export interface EnhancedAnalyticsSummary {
  totalAnalyzed: number;
  highConfluenceCount: number; // Score >= 85
  highConfluencePercentage: number;

  allWinRate: number;
  highConfluenceWinRate: number;
  winRateLift: number;

  // High Confluence Combinations (>90% sets)
  uberSuperSetCount: number;
  uberSuperSetWins: number;
  uberSuperSetWinRate: number;

  ultraCashSweepCount: number;
  ultraCashSweepWins: number;
  ultraCashSweepWinRate: number;

  ultraFreshWaveCount: number;
  ultraFreshWaveWins: number;
  ultraFreshWaveWinRate: number;

  ultraEqRecoveryCount: number;
  ultraEqRecoveryWins: number;
  ultraEqRecoveryWinRate: number;

  fadeInversionCount: number;

  // Engine breakdown for high confluence
  uber: {
    total: number;
    highConfluenceTotal: number;
    highConfluenceWins: number;
    highConfluenceWinRate: number;
    allWinRate: number;
  };
  meta: {
    total: number;
    highConfluenceTotal: number;
    highConfluenceWins: number;
    highConfluenceWinRate: number;
    allWinRate: number;
  };
  ultra: {
    total: number;
    highConfluenceTotal: number;
    highConfluenceWins: number;
    highConfluenceWinRate: number;
    allWinRate: number;
  };

  avgProfitMultipleHighConfluence: number;
  avgLossMultipleHighConfluence: number;
  avgProfitMultipleAll: number;
  avgLossMultipleAll: number;
}

export interface EnhancedRuleDefinition {
  id: string;
  name: string;
  engine: 'UBER' | 'META' | 'ULTRA' | 'ALL';
  phase: RulePhase;
  lifecycleState: string;
  triggerMoment: string;
  eligiblePool: string;
  description: string;
  confidenceText?: string;
}

export const ALL_ENHANCED_RULES: EnhancedRuleDefinition[] = [
  // =========================================================================
  // 1. UBER ENGINE (Expected Target: SL — Mean Reversion Scalp)
  // =========================================================================
  {
    id: 'ub_e1_inverted_regime',
    name: 'Uber: Inverted Regime & Extension Confluence (UB-E1)',
    engine: 'UBER',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'When stop signal is generated',
    eligiblePool: 'All candidate UBER signals (N = 102)',
    confidenceText: '84.3% M1 Win Rate (N=86/102)',
    description: 'SELL_STOP in BULLISH cross + Above SMA9/21; BUY_STOP in BEARISH cross + Below SMA9/21',
  },
  {
    id: 'ub_e2_geometry_calendar',
    name: 'Uber: Target Geometry & Expiry Calendar (UB-E2)',
    engine: 'UBER',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Pre-entry validation',
    eligiblePool: 'Signals passing UB-E1 (N = 51)',
    confidenceText: '88.2% M1 Win Rate (N=45/51)',
    description: 'Geometry Ratio >= 0.60; Execution 10:00–13:00 IST; Weeks 2, 3, 4, 5 of month (Block Week 1)',
  },
  {
    id: 'ub_e3_execution_order_type',
    name: 'Uber: Execution Order Type / Wick Sweep (UB-E3)',
    engine: 'UBER',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Order execution log',
    eligiblePool: 'Filled bracket orders (N = 57)',
    confidenceText: '89.5% M1 Win Rate (N=51/57)',
    description: 'Engine bracket auto-cancels secondary leg (is_cancelled == YES; instant wick fill footprint)',
  },
  {
    id: 'ub_h1_1_5tick_scratch',
    name: 'Uber: 1.5-Tick Scratch Rule (UB-H1)',
    engine: 'UBER',
    phase: 'IN_FLIGHT',
    lifecycleState: 'State 1: In-Flight Entry -> M1',
    triggerMoment: 'First 120 seconds post-fill (Continuous tick check)',
    eligiblePool: 'All filled, active UBER positions (N = 94)',
    confidenceText: '89.7% Zero Adverse Heat (N=52/58)',
    description: 'If price moves adversely toward TP by >= 1.5 ticks in first 120s, fire immediate Market Scratch Exit',
  },
  {
    id: 'ub_h2_dynamic_invalidation_gate',
    name: 'Uber: Dynamic Invalidation Stop (UB-H2)',
    engine: 'UBER',
    phase: 'RECOVERY_HOLD',
    lifecycleState: 'State 3: Adverse Recovery Hold',
    triggerMoment: 'M1 hits TP (Adverse Loss). Position active in State 3',
    eligiblePool: 'ONLY active positions that lost M1 (N = 36). N/A if M1 won',
    confidenceText: '83.3% Recovery Rate to M2 SL (N=25/30)',
    description: 'Kill immediately if adverse touches > 2.0x while entry_cross_count == 0; Hold for M2 if price recrosses entry before 2.0x loss',
  },
  {
    id: 'ub_x1_direct_target',
    name: 'Uber: Direct Target Capture (UB-X1)',
    engine: 'UBER',
    phase: 'FINAL_EXIT',
    lifecycleState: 'State 4A: Target Lock',
    triggerMoment: 'M1 SL Hit',
    eligiblePool: 'All winning UBER trades',
    confidenceText: '100% Target Close',
    description: 'Exit 100% at SL hit; holding for M2 is forbidden unless trailing at BE + 1 tick',
  },
  {
    id: 'ub_x2_terminal_cutoff',
    name: 'Uber: Terminal Cutoff Stop (UB-X2)',
    engine: 'UBER',
    phase: 'FINAL_EXIT',
    lifecycleState: 'State 4B: Stop Cut',
    triggerMoment: 'Adverse expansion during State 3',
    eligiblePool: 'Losing positions expanding past 2.5x',
    confidenceText: 'Avoids 100% Catastrophic Drift (N=0/19 recovered)',
    description: 'If State 3 active and loss expands past > 2.5x without recross, hard close at market',
  },

  // =========================================================================
  // 2. ULTRA ENGINE (Expected Target: TP — Institutional Volume Breakout)
  // =========================================================================
  {
    id: 'ul_e1_fresh_wave',
    name: 'Ultra: Fresh Wave Ignition Filter (UL-E1)',
    engine: 'ULTRA',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Breakout signal generation',
    eligiblePool: 'All candidate ULTRA signals (N = 87)',
    confidenceText: '82.8% Direct M1 Win Rate (N=72/87)',
    description: 'prior_candles <= 8; BUY_STOP Bullish + Above EMA20, SELL_STOP Bearish + Below SMA9',
  },
  {
    id: 'ul_e2_threshold_cluster',
    name: 'Ultra: Multi-Threshold Density Cluster & Completed Order (UL-E2)',
    engine: 'ULTRA',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Order placement and execution',
    eligiblePool: 'Signals passing UL-E1 (N = 66)',
    confidenceText: '86.4% Direct M1 Win Rate (N=57/66)',
    description: 'Order triggers across >= 2 threshold tiers simultaneously (|Thresh1 - Thresh2| <= 5 pts); status == completed, is_cancelled == NO',
  },
  {
    id: 'ul_e3_calendar_day_rules',
    name: 'Ultra: Calendar & Day-of-Week Rules (UL-E3)',
    engine: 'ULTRA',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Pre-entry timing check',
    eligiblePool: 'Candidate ULTRA signals (N = 95)',
    confidenceText: '82.1% Win Rate (N=78/95)',
    description: 'Trade Tue, Wed, Thu (10:00–12:30 IST); On Mondays or Week 1, trade Cash Equities (NSE_EQ) only',
  },
  {
    id: 'ul_if1_trend_wave_hold',
    name: 'Ultra: Trend Wave Hold (UL-IF1)',
    engine: 'ULTRA',
    phase: 'IN_FLIGHT',
    lifecycleState: 'State 1: In-Flight Entry -> M1',
    triggerMoment: 'Candles 1 to 8 post-fill',
    eligiblePool: 'All filled ULTRA positions',
    confidenceText: '82.8% Capture TP in 1–4 candles',
    description: 'Hold through Candles 1 to 8 as long as price does not hit SL',
  },
  {
    id: 'ul_h1_cash_equity_shield',
    name: 'Ultra: Cash Equity (NSE_EQ) Immunity Hold (UL-H1)',
    engine: 'ULTRA',
    phase: 'RECOVERY_HOLD',
    lifecycleState: 'State 3: Adverse Recovery Hold',
    triggerMoment: 'Position suffers M1 Loss (hits SL). Position active',
    eligiblePool: 'ONLY active M1-loss positions in Cash Equities (N = 37). N/A if M1 won or Futures',
    confidenceText: '91.9% M2 TP Recovery Rate (N=34/37)',
    description: 'In NSE_EQ: HOLD position. Do not exit at SL; let cycle through 2.5x–3.5x drawdown to M2 TP',
  },
  {
    id: 'ul_h2_futures_5candle_test',
    name: 'Ultra: Futures (NSE_FO) 5-Candle Dynamic Test (UL-H2)',
    engine: 'ULTRA',
    phase: 'RECOVERY_HOLD',
    lifecycleState: 'State 3: Adverse Recovery Hold',
    triggerMoment: 'Position suffers M1 Loss (hits SL). Position active',
    eligiblePool: 'ONLY active M1-loss positions in Futures (N = 48). N/A if M1 won or Cash',
    confidenceText: '84.6% M2 TP Recovery on Hold (N=22/26)',
    description: 'At Candle 5 post-SL: HOLD if recrosses entry (crossings >= 1) & loss <= 3.5x; KILL if 0 crosses past > 3.0x loss',
  },
  {
    id: 'ul_x1_take_profit',
    name: 'Ultra: Take Profit Execution (UL-X1)',
    engine: 'ULTRA',
    phase: 'FINAL_EXIT',
    lifecycleState: 'State 4A: Target Lock',
    triggerMoment: 'TP Target Hit',
    eligiblePool: 'All winning ULTRA trades',
    confidenceText: 'Primary Exit at TP',
    description: 'Limit exit at TP (1.5x to 2.5x)',
  },
  {
    id: 'ul_x2_eod_time_stop',
    name: 'Ultra: EOD Time Stop (UL-X2, 14:15 IST)',
    engine: 'ULTRA',
    phase: 'FINAL_EXIT',
    lifecycleState: 'State 4B: Final Resolution',
    triggerMoment: '14:15 IST EOD check',
    eligiblePool: 'All open intraday positions',
    confidenceText: 'Prevents 76.9% Overnight Pending Stalls',
    description: 'Hard market close at 14:15 IST for all open intraday positions regardless of PnL',
  },

  // =========================================================================
  // 3. META ENGINE (Expected Target: TP — Kinetic Momentum Expansion)
  // =========================================================================
  {
    id: 'm_e1_micro_momentum',
    name: 'Meta: Dynamic Support Micro-Momentum (M-E1)',
    engine: 'META',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Breakout signal generation',
    eligiblePool: 'All candidate META signals (N = 20)',
    confidenceText: '84.6% Direct M1 Win Rate (N=11/13)',
    description: 'SELL_STOP strictly below SMA9 and EMA20; BUY_STOP strictly above EMA20; asset preferably NSE_EQ',
  },
  {
    id: 'm_e2_segment_priority',
    name: 'Meta: Segment Priority (M-E2, Cash Equities)',
    engine: 'META',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Candidate screening',
    eligiblePool: 'Candidate META signals',
    confidenceText: 'Highest Clean Breakout Ratio',
    description: 'Prioritize Cash Equities (NSE_EQ) over derivatives',
  },
  {
    id: 'm_e3_imminent_crossover',
    name: 'Meta: Imminent Crossover State (M-E3, ≤ 10 bars)',
    engine: 'META',
    phase: 'PRE_ENTRY',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Pre-entry check',
    eligiblePool: 'Candidate META setups',
    confidenceText: 'Early Wave Ignition',
    description: 'Crossover is flipping in trade direction within <= 10 candles',
  },
  {
    id: 'm_if1_fast_momentum_tracking',
    name: 'Meta: Fast Momentum Tracking (M-IF1)',
    engine: 'META',
    phase: 'IN_FLIGHT',
    lifecycleState: 'State 1: In-Flight Entry -> M1',
    triggerMoment: 'Post-fill execution',
    eligiblePool: 'All filled META positions',
    confidenceText: 'Fast Resolution',
    description: 'Position must resolve within 6 candles of entry',
  },
  {
    id: 'm_h1_zero_tolerance_loss',
    name: 'Meta: Zero Tolerance on M1 Loss (M-H1, No Hold Allowed)',
    engine: 'META',
    phase: 'RECOVERY_HOLD',
    lifecycleState: 'State 3: Adverse Recovery Hold',
    triggerMoment: 'M1 hits SL',
    eligiblePool: 'ONLY active META positions hitting SL (N = 7). N/A if M1 won',
    confidenceText: '71.4% Trap Avoidance (N=5/7 avoided 6.8x–11.3x losses)',
    description: 'MARKET CLOSE IMMEDIATELY (0 to 3 minutes). DO NOT HOLD for M2',
  },
  {
    id: 'm_x1_trailing_profit_lock',
    name: 'Meta: Trailing Profit Lock (M-X1)',
    engine: 'META',
    phase: 'FINAL_EXIT',
    lifecycleState: 'State 4A: Target Lock',
    triggerMoment: 'M1 TP Hit',
    eligiblePool: 'All winning META trades (N = 9)',
    confidenceText: '88.9% Win Preservation Rate (N=8/9)',
    description: 'Move trailing stop to +1.5x profit once M1 TP is hit; ride extensions up to 12.6x',
  },

  // =========================================================================
  // 4. HIGH CONFLUENCE COMBINATIONS (>90% WIN RATE) & INVERSIONS
  // =========================================================================
  {
    id: 'combo_uber_expiry_cycle_93',
    name: '1. UBER Expiry-Cycle Mean Reversion (93.8% Win Rate)',
    engine: 'UBER',
    phase: 'COMBINATION',
    lifecycleState: 'State 0: Pre-Entry',
    triggerMoment: 'Pre-entry composite validation',
    eligiblePool: '32 qualifying UBER setups',
    confidenceText: '93.8% Win Rate (N=30/32)',
    description: 'UB-E1 (Inverted Cross + Ext) + Ratio >= 0.60 + Time 10:00–13:00 IST + Weeks 3, 4, 5 (Day >= 15)',
  },
  {
    id: 'combo_ultra_cash_sweep_92',
    name: '2. ULTRA Institutional Cash Sweep (92.7% Win Rate)',
    engine: 'ULTRA',
    phase: 'COMBINATION',
    lifecycleState: 'State 0 + State 3',
    triggerMoment: 'Order placement & hold in NSE_EQ',
    eligiblePool: '41 qualifying ULTRA setups',
    confidenceText: '92.7% Win Rate (N=38/41)',
    description: 'NSE_EQ + prior_candles <= 8 + Threshold Gap <= 5 pts + status == completed',
  },
  {
    id: 'combo_ultra_eq_recovery_91',
    name: '3. ULTRA Cash Equity M1 Recovery (91.9% Recovery Rate)',
    engine: 'ULTRA',
    phase: 'COMBINATION',
    lifecycleState: 'State 3: Adverse Recovery Hold',
    triggerMoment: 'Position suffers M1 Loss in NSE_EQ',
    eligiblePool: '37 losing cash setups',
    confidenceText: '91.9% Recovery (N=34/37)',
    description: 'M1 Hit == SL + Instrument == NSE_EQ + loss_multiple_before_return <= 3.5x',
  },
  {
    id: 'combo_ultra_fade_inversion_92',
    name: '4. The Cancelled ULTRA Inversion Fade (92.3% Win Rate)',
    engine: 'ULTRA',
    phase: 'INVERSION',
    lifecycleState: 'State 0: Opposite Entry',
    triggerMoment: 'Cancelled / stalled mature order in NSE_FO',
    eligiblePool: '26 mature futures traps',
    confidenceText: '92.3% Fade Win Rate (N=24/26)',
    description: 'Fading cancelled orders in NSE_FO where prior_candles >= 20 (Target = Original SL)',
  },
];

export class EnhancedFilterService {
  /**
   * Determine engine classification from version string
   */
  static getEngineType(version: string): 'UBER' | 'META' | 'ULTRA' | 'OTHER' {
    const v = (version || '').toLowerCase();
    if (v.includes('uber')) return 'UBER';
    if (v.includes('meta')) return 'META';
    if (v.includes('ultra')) return 'ULTRA';
    return 'OTHER';
  }

  /**
   * Determine the Trade Lifecycle State of a trade
   */
  static determineLifecycleState(analysis: TradeMilestoneAnalysis): TradeLifecycleState {
    const { trade, milestone1, milestone2, isSuccess } = analysis;
    const isCancelled = (trade.status || '').toLowerCase() === 'cancelled';

    if (isCancelled && !milestone1) {
      return {
        code: 'STATE_0',
        name: 'State 0: Pre-Entry (Cancelled Order)',
        shortLabel: 'State 0: Cancelled',
        description: 'Order was cancelled or rejected prior to execution. Eligible for Fade Inversion analysis.',
        isWonM1: false,
        isLossRecovery: false,
      };
    }

    if (!milestone1 || analysis.status === 'NEITHER_HIT_YET') {
      return {
        code: 'STATE_1',
        name: 'State 1: In-Flight Entry -> Awaiting M1',
        shortLabel: 'State 1: In-Flight',
        description: 'Position is actively filled and moving towards Milestone 1.',
        isWonM1: false,
        isLossRecovery: false,
      };
    }

    // Milestone 1 has been resolved
    if (isSuccess) {
      // M1 is WON
      return {
        code: 'STATE_2A_4A',
        name: 'State 2A -> 4A: M1 is WON (Target Locked / Trailing)',
        shortLabel: 'State 2A/4A: M1 Won',
        description: 'Trade successfully captured primary M1 target. State 3 Recovery Hold does NOT apply.',
        isWonM1: true,
        isLossRecovery: false,
      };
    } else {
      // M1 is LOST (Adverse Barrier Hit)
      if (milestone2?.type === 'TP' || milestone2?.type === 'SL' || analysis.status === 'COMPLETED_BOTH') {
        return {
          code: 'STATE_4B',
          name: 'State 4B: Final Resolution (M2 Recovery or Cut)',
          shortLabel: 'State 4B: Resolved',
          description: 'Trade completed its post-loss recovery cycle or was cut by terminal stop.',
          isWonM1: false,
          isLossRecovery: true,
        };
      }
      return {
        code: 'STATE_2B_3',
        name: 'State 2B -> 3: M1 Lost (Adverse Recovery Hold Phase)',
        shortLabel: 'State 3: Recovery Hold',
        description: 'M1 hit adverse barrier. Position is active/open in State 3. Hold Protocol decides whether to hold for M2 or kill.',
        isWonM1: false,
        isLossRecovery: true,
      };
    }
  }

  /**
   * Match trade version against include and negate sets
   */
  static matchesVersionFilter(
    version: string,
    versionStates: Record<string, 'INCLUDE' | 'NEGATE' | 'NONE'>
  ): boolean {
    const v = (version || '').toLowerCase();
    const includes = Object.entries(versionStates)
      .filter(([_, state]) => state === 'INCLUDE')
      .map(([k]) => k.toLowerCase());
    const negates = Object.entries(versionStates)
      .filter(([_, state]) => state === 'NEGATE')
      .map(([k]) => k.toLowerCase());

    for (const neg of negates) {
      if (v.includes(neg)) return false;
    }

    if (includes.length > 0) {
      return includes.some((inc) => v.includes(inc));
    }

    return true;
  }

  /**
   * Parse IST time (hours, minutes) and calendar date metadata from millisecond timestamp
   */
  static getISTTime(ts: number): {
    hours: number;
    minutes: number;
    timeStr: string;
    dayOfMonth: number;
    dayOfWeek: number;
    isWeek1: boolean;
    isWeeks2To5: boolean;
    isWeeks3To5: boolean;
  } {
    // India Standard Time is UTC + 5:30 (19,800,000 ms)
    const istDate = new Date(ts + 19800000);
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const dayOfMonth = istDate.getUTCDate();
    const dayOfWeek = istDate.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');

    return {
      hours,
      minutes,
      timeStr: `${hoursStr}:${minutesStr} IST`,
      dayOfMonth,
      dayOfWeek,
      isWeek1: dayOfMonth <= 7,
      isWeeks2To5: dayOfMonth >= 8,
      isWeeks3To5: dayOfMonth >= 15,
    };
  }

  /**
   * Matches an analysis against rule combination (positive & negate) and score filters
   * Honors NOT_APPLICABLE status: a rule that does not apply (e.g. State 3 Hold on an M1 winner)
   * does not falsely fail a negated rule, and only matches positive PASS if applicable and satisfied.
   */
  static matchesEnhancedFilters(
    analysis: TradeMilestoneAnalysis,
    selectedRuleIds: string[] | { passIds?: string[]; negateIds?: string[] },
    ruleMatchMode: 'ALL' | 'ANY',
    minScore: number = 0,
    maxScore: number = 100,
    allTradesOrAnalyses?: (TradeSignal | TradeMilestoneAnalysis)[]
  ): boolean {
    const evalResult = this.evaluate(analysis, allTradesOrAnalyses);

    // Score range filter check (based on Pre-Entry score)
    if (evalResult.score < minScore || evalResult.score > maxScore) {
      return false;
    }

    const passIds = Array.isArray(selectedRuleIds) ? selectedRuleIds : selectedRuleIds?.passIds || [];
    const negateIds = Array.isArray(selectedRuleIds) ? [] : selectedRuleIds?.negateIds || [];

    if (passIds.length === 0 && negateIds.length === 0) {
      return true;
    }

    // Map rules to their status
    const ruleStatusMap = new Map<string, RuleStatus>();
    evalResult.rules.forEach((r) => {
      ruleStatusMap.set(r.id, r.status);
    });

    // Backward-compatibility aliases
    const legacyAliases: Record<string, string> = {
      // UBER aliases
      u_e1_rubber_band: 'ub_e1_inverted_regime',
      uber_inverted_alignment: 'ub_e1_inverted_regime',
      uber_geometry_symmetry: 'ub_e2_geometry_calendar',
      u_e2_liquidity_session: 'ub_e2_geometry_calendar',
      u_e3_execution_window: 'ub_e2_geometry_calendar',
      uber_timing_window: 'ub_e2_geometry_calendar',
      uber_ma_compression: 'ub_e1_inverted_regime',
      u_if1_1_5tick_invalidation: 'ub_h1_1_5tick_scratch',
      u_h1_zero_drawdown: 'ub_h1_1_5tick_scratch',
      u_h1_2x_gate: 'ub_h2_dynamic_invalidation_gate',
      u_h2_m1_loss_recovery: 'ub_h2_dynamic_invalidation_gate',
      u_x1_direct_target: 'ub_x1_direct_target',
      u_x1_primary_win_lock: 'ub_x1_direct_target',
      u_x2_terminal_cutoff: 'ub_x2_terminal_cutoff',
      u_x2_adverse_invalidation: 'ub_x2_terminal_cutoff',
      combo_uber_superset_93: 'combo_uber_expiry_cycle_93',

      // ULTRA aliases
      ul_e2_threshold_confluence: 'ul_e2_threshold_cluster',
      ultra_threshold_confluence: 'ul_e2_threshold_cluster',
      ul_e3_anti_climax: 'ul_e1_fresh_wave',
      ultra_macro_trend: 'ul_e1_fresh_wave',
      ultra_segment_advantage: 'ul_h1_cash_equity_shield',
      ul_x1_target_capture: 'ul_x1_take_profit',
      ul_x2_eod_expiry: 'ul_x2_eod_time_stop',
      combo_ultra_fresh_wave_91: 'combo_ultra_cash_sweep_92',

      // META aliases
      meta_micro_momentum: 'm_e1_micro_momentum',
      meta_instrument_class: 'm_e2_segment_priority',
      meta_imminent_crossover: 'm_e3_imminent_crossover',
      m_h1_zero_tolerance_stop: 'm_h1_zero_tolerance_loss',
      m_h2_dynamic_winner_trailing: 'm_x1_trailing_profit_lock',
      m_x1_trailing_runner_capture: 'm_x1_trailing_profit_lock',
    };

    const getStatus = (id: string): RuleStatus => {
      if (ruleStatusMap.has(id)) return ruleStatusMap.get(id)!;
      const target = legacyAliases[id];
      if (target && ruleStatusMap.has(target)) return ruleStatusMap.get(target)!;
      for (const [legacy, canonical] of Object.entries(legacyAliases)) {
        if (canonical === id && ruleStatusMap.has(legacy)) return ruleStatusMap.get(legacy)!;
      }
      return 'NOT_APPLICABLE';
    };

    if (ruleMatchMode === 'ALL') {
      const allPass = passIds.every((id) => getStatus(id) === 'PASS');
      const allNegate = negateIds.every((id) => getStatus(id) === 'FAIL');
      return allPass && allNegate;
    } else {
      const passMatch = passIds.length > 0 && passIds.some((id) => getStatus(id) === 'PASS');
      const negateMatch = negateIds.length > 0 && negateIds.some((id) => getStatus(id) === 'FAIL');
      return passMatch || negateMatch;
    }
  }

  /**
   * Evaluate enhanced rules for an individual trade analysis
   */
  static evaluate(
    analysis: TradeMilestoneAnalysis,
    allTradesOrAnalyses?: (TradeSignal | TradeMilestoneAnalysis)[]
  ): EnhancedFilterResult {
    const allTradesInBatch: TradeSignal[] | undefined = allTradesOrAnalyses?.map((item) =>
      'trade' in item ? (item as TradeMilestoneAnalysis).trade : (item as TradeSignal)
    );
    const { trade, entryIndicators, milestone1, milestone2, drawdown, isSuccess } = analysis;
    const engineType = this.getEngineType(trade.version);
    const isCancelled = Boolean((trade.status || '').toLowerCase() === 'cancelled' || (trade as any).is_cancelled === true || (trade as any).is_cancelled === 'YES');
    const isCompleted = (trade.status || '').toLowerCase() === 'completed';
    const isBuy = (trade.type || '').toUpperCase().includes('BUY');
    const isNseEq = trade.instrument.includes('NSE_EQ') || trade.instrument.endsWith('_EQ') || (!trade.instrument.includes('NSE_FO') && !trade.instrument.includes('FUT') && !trade.instrument.includes('OPT'));
    const isNseFo = !isNseEq;
    const { hours, minutes, timeStr, dayOfMonth, dayOfWeek, isWeek1, isWeeks2To5, isWeeks3To5 } = this.getISTTime(trade.timestamp);
    const totalMinutes = hours * 60 + minutes;

    // Determine exact trade lifecycle state
    const lifecycleState = this.determineLifecycleState(analysis);
    const isWonM1 = lifecycleState.isWonM1;
    const isM1Loss = Boolean(milestone1 && !isSuccess);

    const allRules: RuleEvaluation[] = [];

    // Distances & Geometry
    const distToSL = Math.abs(trade.entry - trade.sl) || 0.001;
    const distToTP = Math.abs(trade.entry - trade.tp) || 0.001;
    const symmetry = distToSL / distToTP;

    // MA Compression: |SMA Fast - EMA 20| / Entry <= 0.04% (0.0004)
    let maCompressionRatio = 0;
    if (entryIndicators && trade.entry > 0) {
      maCompressionRatio = Math.abs(entryIndicators.smaFast - entryIndicators.ema20) / trade.entry;
    }

    const posWrtMa = (entryIndicators?.candlePositionWrtMa || '').toLowerCase();
    const crossoverState = entryIndicators?.crossoverState;
    const crossoverAge = entryIndicators?.crossoverCandlesPrior ?? 0;
    const candleDir = entryIndicators?.candleDirection || 'NEUTRAL';

    // Multi-tier cluster count
    let clusterCount = 1;
    let minThresholdGap = 999999;
    if (allTradesInBatch && allTradesInBatch.length > 0) {
      const siblings = allTradesInBatch.filter(
        (t) =>
          t.instrument === trade.instrument &&
          Math.abs(t.timestamp - trade.timestamp) <= 300_000
      );
      clusterCount = siblings.length;
      for (const sib of siblings) {
        if (sib !== trade) {
          const gap = Math.abs(trade.entry - sib.entry);
          if (gap < minThresholdGap) minThresholdGap = gap;
        }
      }
    }
    const hasThresholdCompressionGap = minThresholdGap <= 5 || clusterCount >= 2;
    const hasMultiTier = clusterCount >= 2 || (trade.confidence && trade.confidence >= 0.5) || trade.threshold >= 2;

    const highConfluenceCombinations: HighConfluenceCombinationMatch[] = [];
    let inversionSignal: InversionSignal | undefined;

    // =========================================================================
    // 1. UBER ENGINE (Expected Target: SL — Mean Reversion Scalp)
    // =========================================================================
    if (engineType === 'UBER') {
      // -----------------------------------------------------------------------
      // Phase 1: Pre-Entry Protocol (State 0)
      // -----------------------------------------------------------------------
      // Rule UB-E1 (Inverted Regime & Extension Confluence)
      // SELL_STOP: sma_crossover_state == BULLISH AND candle_position_wrt_ma contains "Above SMA9" or "Above SMA21".
      // BUY_STOP: sma_crossover_state == BEARISH AND candle_position_wrt_ma contains "Below SMA9" or "Below SMA21".
      // Confidence: 84.3% M1 Win Rate (N = 86 / 102).
      const ubE1MacroValid = isBuy ? crossoverState === 'BEARISH' : crossoverState === 'BULLISH';
      const ubE1ExtValid = isBuy
        ? posWrtMa.includes('below sma9') || posWrtMa.includes('below sma21') || (entryIndicators ? trade.entry < entryIndicators.smaFast : false)
        : posWrtMa.includes('above sma9') || posWrtMa.includes('above sma21') || (entryIndicators ? trade.entry > entryIndicators.smaFast : false);
      const ubE1Pass = Boolean(ubE1MacroValid && ubE1ExtValid);

      allRules.push({
        id: 'ub_e1_inverted_regime',
        name: 'Uber: Inverted Regime & Extension Confluence (UB-E1)',
        phase: 'PRE_ENTRY',
        lifecycleState: 'State 0: Pre-Entry',
        status: ubE1Pass ? 'PASS' : 'FAIL',
        achieved: ubE1Pass,
        isApplicable: true,
        triggerMoment: 'When stop signal is generated',
        eligiblePool: 'All candidate UBER signals (N = 102)',
        scoreContribution: ubE1Pass ? 40 : ubE1ExtValid ? 20 : 0,
        maxScore: 40,
        confidenceText: '84.3% Direct M1 Win Rate (N=86/102)',
        description: 'SELL_STOP in BULLISH cross + Above SMA9/21; BUY_STOP in BEARISH cross + Below SMA9/21',
        detail: `Macro Cross: ${crossoverState || 'UNKNOWN'} (${ubE1MacroValid ? 'Inverted Pull ✓' : 'Direct Momentum ✗'}) | Micro Extension: ${ubE1ExtValid ? 'Outside Ribbon ✓' : 'Inside Ribbon ✗'}`,
        actionText: ubE1Pass ? 'Authorize Counter-Trend Entry' : 'Discard Signal (Trend trap)',
      });

      // Rule UB-E2 (Target Geometry & Expiry Calendar)
      // Geometry Ratio: |Entry - SL| / |Entry - TP| >= 0.60.
      // Calendar Filter: Execution between 10:00 and 13:00 IST; Weeks 2, 3, 4, 5 of month (Block Week 1).
      // Confidence: 88.2% M1 Win Rate (N = 45 / 51).
      const ubE2SymmetryValid = symmetry >= 0.60;
      const ubE2TimeValid = totalMinutes >= 600 && totalMinutes <= 780; // 10:00 - 13:00 IST
      const ubE2CalendarValid = isWeeks2To5; // Days 8+ of month (Weeks 2, 3, 4, 5)
      const ubE2Pass = Boolean(ubE2SymmetryValid && ubE2TimeValid && ubE2CalendarValid);

      allRules.push({
        id: 'ub_e2_geometry_calendar',
        name: 'Uber: Target Geometry & Expiry Calendar (UB-E2)',
        phase: 'PRE_ENTRY',
        lifecycleState: 'State 0: Pre-Entry',
        status: ubE2Pass ? 'PASS' : 'FAIL',
        achieved: ubE2Pass,
        isApplicable: true,
        triggerMoment: 'Pre-entry validation',
        eligiblePool: 'Signals passing UB-E1 (N = 51)',
        scoreContribution: ubE2Pass ? 35 : (ubE2SymmetryValid && ubE2TimeValid) ? 20 : ubE2SymmetryValid ? 10 : 0,
        maxScore: 35,
        confidenceText: '88.2% Direct M1 Win Rate (N=45/51)',
        description: 'Geometry Ratio >= 0.60; Execution between 10:00 and 13:00 IST; Weeks 2, 3, 4, 5 (Block Week 1)',
        detail: `Ratio: ${symmetry.toFixed(2)} (${ubE2SymmetryValid ? '>=0.60 ✓' : '<0.60 ✗'}) | Time: ${timeStr} (${ubE2TimeValid ? '10:00-13:00 ✓' : 'Outside ✗'}) | Cycle: Day ${dayOfMonth} (${ubE2CalendarValid ? 'Weeks 2-5 ✓' : 'Week 1 Blocked ✗'})`,
        actionText: ubE2Pass ? 'Authorize Order Sizing' : isWeek1 ? 'BLOCK UBER ENTRY (Week 1 Anomaly)' : 'Reject Geometry/Timing',
      });

      // Rule UB-E3 (Execution Order Type / Wick Sweep)
      // Engine bracket auto-cancels the secondary leg (is_cancelled == YES).
      // Confidence: 89.5% M1 Win Rate (N = 51 / 57).
      // UBER: Bracket auto-cancellation is the direct mechanical footprint of an instant wick fill -> high positive score (+25).
      allRules.push({
        id: 'ub_e3_execution_order_type',
        name: 'Uber: Execution Order Type / Wick Sweep (UB-E3)',
        phase: 'PRE_ENTRY',
        lifecycleState: 'State 0: Pre-Entry',
        status: isCancelled ? 'PASS' : 'FAIL',
        achieved: isCancelled,
        isApplicable: true,
        triggerMoment: 'Order execution log',
        eligiblePool: 'Filled bracket orders (N = 57)',
        scoreContribution: isCancelled ? 25 : 0,
        maxScore: 25,
        confidenceText: '89.5% Direct M1 Win Rate (N=51/57)',
        description: 'Engine bracket auto-cancels secondary leg (is_cancelled == YES; instant wick fill footprint)',
        detail: isCancelled
          ? 'Bracket auto-cancellation detected (is_cancelled == YES ✓ Direct mechanical footprint of wick sweep fill)'
          : 'Standard order execution (is_cancelled == NO)',
        actionText: isCancelled ? 'High Confluence Wick Sweep Confirmed' : 'Standard Execution',
      });

      // -----------------------------------------------------------------------
      // Phase 2: In-Flight Execution (State 1: Entry -> M1)
      // -----------------------------------------------------------------------
      // Rule UB-H1 (The 1.5-Tick Scratch Rule)
      // Continuous per-tick check for first 120 seconds post-entry.
      // If adverse heat >= 1.5 ticks toward TP, fire immediate Market Scratch Exit.
      // 89.7% of genuine UBER winners hit SL with 0.00 adverse movement. Holding beyond 1.5 ticks yields 92.3% full M1 loss.
      const ubH1Pass = drawdown ? drawdown.drawdownTicks <= 1.5 || drawdown.maxLossMultiple === 0 : true;
      allRules.push({
        id: 'ub_h1_1_5tick_scratch',
        name: 'Uber: 1.5-Tick Scratch Rule (UB-H1)',
        phase: 'IN_FLIGHT',
        lifecycleState: 'State 1: In-Flight Entry -> M1',
        status: ubH1Pass ? 'PASS' : 'FAIL',
        achieved: ubH1Pass,
        isApplicable: true,
        triggerMoment: 'First 120 seconds post-fill (Continuous tick check)',
        eligiblePool: 'All filled, active UBER positions (N = 94)',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '89.7% Zero Adverse Heat (N=52/58 hit SL at 0.00 ticks)',
        description: 'If price moves adversely toward TP by >= 1.5 ticks in first 120s, fire immediate Market Scratch Exit',
        detail: drawdown
          ? `Adverse excursion: ${drawdown.drawdownTicks.toFixed(1)} ticks (Max Loss Multiple: ${drawdown.maxLossMultiple.toFixed(2)}x)`
          : 'Awaiting in-flight ticks',
        actionText: ubH1Pass ? 'Hold cleanly to SL (Zero Drawdown Edge)' : 'Trigger Market Scratch Exit at 1.5 ticks',
      });

      // -----------------------------------------------------------------------
      // Phase 3: Real-Time M1 Loss Recovery Protocol (State 3: M1 Lost -> Awaiting M2)
      // Strictly eligible ONLY if M1 is lost! If M1 is WON, State 3 Hold is NOT APPLICABLE!
      // -----------------------------------------------------------------------
      // Rule UB-H2 (Dynamic Invalidation Stop)
      // State Machine with Dynamic Invalidation Gate:
      // State: [M1_LOSS_ACTIVE]
      // IF adverse_loss_multiple touches > 2.0x AND entry_recrossed == FALSE:
      //      └──► TERMINATE TRADE IMMEDIATELY (HARD KILL)
      // IF current_price recrosses entry_price BEFORE adverse_loss reaches 2.0x:
      //      ├── Flag: entry_recrossed = TRUE
      //      ├── Move Stop to Break-Even (Original Entry)
      //      └──► TRANSITION TO STATE: [HOLD_FOR_M2_RECOVERY] (83.3% Recovery to M2 SL)
      let ubH2Status: RuleStatus = 'NOT_APPLICABLE';
      let ubH2Detail = 'NOT APPLICABLE: Position won M1 directly; Hold Protocol exclusively applies to State 3 adverse losses.';
      let ubH2Action = 'N/A (Trade captured M1 Win)';

      if (isM1Loss) {
        const touchedOver2xWithoutRecross = drawdown.lossMultipleBeforeEntryReturn > 2.0 || (drawdown.maxLossMultiple > 2.0 && drawdown.entryCrossCount === 0);
        const recrossedBefore2x = drawdown.entryCrossCount >= 1 && drawdown.lossMultipleBeforeEntryReturn <= 2.0;

        if (touchedOver2xWithoutRecross) {
          ubH2Status = 'FAIL';
          ubH2Detail = `🚨 HARD KILL TRIGGERED: Adverse loss touched > 2.0x (${drawdown.lossMultipleBeforeEntryReturn.toFixed(2)}x) before recrossing entry. 0.0% recovery probability.`;
          ubH2Action = 'TERMINATE TRADE IMMEDIATELY (HARD KILL)';
        } else if (recrossedBefore2x) {
          ubH2Status = 'PASS';
          ubH2Detail = `✓ ENTRY RECROSSED: Price returned to entry after ${drawdown.lossMultipleBeforeEntryReturn.toFixed(2)}x loss (<= 2.0x). Stop moved to BE. 83.3% M2 SL recovery rate (N=25/30).`;
          ubH2Action = 'Move Stop to Break-Even -> TRANSITION TO STATE: [HOLD_FOR_M2_RECOVERY]';
        } else {
          ubH2Status = 'PASS';
          ubH2Detail = `State: [M1_LOSS_ACTIVE] Current adverse loss ${drawdown.maxLossMultiple.toFixed(2)}x <= 2.0x. Monitoring for entry recross.`;
          ubH2Action = 'State: [M1_LOSS_ACTIVE] Watch for entry recross before 2.0x loss';
        }
      }

      allRules.push({
        id: 'ub_h2_dynamic_invalidation_gate',
        name: 'Uber: Dynamic Invalidation Stop (UB-H2)',
        phase: 'RECOVERY_HOLD',
        lifecycleState: 'State 3: Adverse Recovery Hold',
        status: ubH2Status,
        achieved: ubH2Status === 'PASS',
        isApplicable: isM1Loss,
        triggerMoment: 'M1 hits TP (Adverse Loss). Position active in State 3',
        eligiblePool: 'ONLY active open positions where M1 hit TP (Loss, N = 30). N/A if M1 won',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '83.3% Recovery Rate to M2 SL (N=25/30)',
        description: 'Kill immediately if adverse touches > 2.0x while entry_cross_count == 0; Hold for M2 if price recrosses entry before 2.0x loss',
        detail: ubH2Detail,
        actionText: ubH2Action,
      });

      // -----------------------------------------------------------------------
      // Phase 4: Final Exit (State 4)
      // -----------------------------------------------------------------------
      // Rule UB-X1: Direct Target Capture (SL Exit / 100% Win Lock)
      const ubX1Achieved = isWonM1;
      allRules.push({
        id: 'ub_x1_direct_target',
        name: 'Uber: Direct Target Capture (UB-X1)',
        phase: 'FINAL_EXIT',
        lifecycleState: 'State 4A: Target Lock',
        status: ubX1Achieved ? 'PASS' : milestone1 ? 'FAIL' : 'NOT_APPLICABLE',
        achieved: ubX1Achieved,
        isApplicable: Boolean(milestone1),
        triggerMoment: 'M1 SL Hit',
        eligiblePool: 'All winning UBER trades',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '100% Target Close',
        description: 'Exit 100% at SL hit; holding for M2 is forbidden unless trailing at BE + 1 tick',
        detail: ubX1Achieved
          ? `M1 SL target hit in ${milestone1?.timeTakenFormatted} (${milestone1?.ticks.toFixed(1)} ticks) ✓ Full Win Locked`
          : milestone1
          ? 'M1 hit adverse TP barrier (See State 3 Hold Protocol)'
          : 'Awaiting M1 resolution',
        actionText: ubX1Achieved ? 'Bank 100% Profit at Market' : 'Awaiting Target Fill',
      });

      // Rule UB-X2: Terminal Cutoff Stop (> 2.5x with 0 recross)
      const ubX2Tripped = isM1Loss && drawdown.maxLossMultiple > 2.5 && drawdown.entryCrossCount === 0;
      allRules.push({
        id: 'ub_x2_terminal_cutoff',
        name: 'Uber: Terminal Cutoff Stop (UB-X2)',
        phase: 'FINAL_EXIT',
        lifecycleState: 'State 4B: Stop Cut',
        status: isM1Loss ? (ubX2Tripped ? 'FAIL' : 'PASS') : 'NOT_APPLICABLE',
        achieved: !ubX2Tripped,
        isApplicable: isM1Loss,
        triggerMoment: 'Adverse expansion during State 3',
        eligiblePool: 'Losing positions expanding past 2.5x',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: 'Avoids 100% Catastrophic Drift (N=0/19 recovered)',
        description: 'If State 3 active and loss expands past > 2.5x without recross, hard close at market',
        detail: isM1Loss
          ? ubX2Tripped
            ? `🚨 HARD CUT TRIPPED: Max Loss ${drawdown.maxLossMultiple.toFixed(2)}x > 2.5x with 0 entry recrosses! Hard close immediately.`
            : `Loss contained (${drawdown.maxLossMultiple.toFixed(2)}x) with ${drawdown.entryCrossCount} crossings ✓`
          : 'NOT APPLICABLE: Trade did not suffer an adverse loss.',
        actionText: ubX2Tripped ? 'HARD CLOSE AT MARKET' : 'Maintain Active Rules',
      });

      // Combination 1: UBER Expiry-Cycle Mean Reversion (93.8% Win Rate)
      // UB-E1 (Inverted Cross + Ext) + Ratio >= 0.60 + Time 10:00–13:00 + Weeks 3, 4, 5 (Day >= 15)
      const comboUberExpiryCycle = ubE1Pass && ubE2SymmetryValid && ubE2TimeValid && isWeeks3To5;
      allRules.push({
        id: 'combo_uber_expiry_cycle_93',
        name: '1. UBER Expiry-Cycle Mean Reversion (93.8% Win Rate)',
        phase: 'COMBINATION',
        lifecycleState: 'State 0: Pre-Entry',
        status: comboUberExpiryCycle ? 'PASS' : 'FAIL',
        achieved: comboUberExpiryCycle,
        isApplicable: true,
        triggerMoment: 'Pre-entry composite validation',
        eligiblePool: '32 qualifying UBER setups',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '93.8% Win Rate (N=30/32)',
        description: 'UB-E1 (Inverted Cross + Ext) + Ratio >= 0.60 + Time 10:00–13:00 IST + Weeks 3, 4, 5 (Day >= 15)',
        detail: comboUberExpiryCycle
          ? '💎 UBER EXPIRY-CYCLE MEAN REVERSION ACHIEVED (93.8% Win Rate)'
          : 'Did not meet all Expiry-Cycle Mean Reversion criteria',
        actionText: comboUberExpiryCycle ? 'Authorize High-Confidence Scalp' : 'Standard Sizing',
      });

      if (comboUberExpiryCycle) {
        highConfluenceCombinations.push({
          id: 'combo_uber_expiry_cycle_93',
          name: 'UBER Expiry-Cycle Mean Reversion',
          winRate: 93.8,
          engine: 'UBER',
          badgeLabel: '93.8% EXPIRY CYCLE',
          description: 'UB-E1 (Inverted Cross + Ext) + Ratio >= 0.60 + Time 10:00–13:00 + Weeks 3, 4, 5',
          phaseTarget: 'Pre-Entry (State 0)',
        });
      }

      // Lifecycle Advice for UBER
      let inFlightAdvice = 'Hold in-flight: continuous tick check. If adverse movement reaches >= 1.5 ticks in first 120s, fire Market Scratch Exit.';
      let holdAdvice = 'State 3 Hold Protocol: NOT APPLICABLE unless trade suffers an M1 loss.';
      if (isM1Loss) {
        if (drawdown.lossMultipleBeforeEntryReturn <= 2.0 && drawdown.entryCrossCount >= 1) {
          holdAdvice = '✓ STATE 3 HOLD ACTIVE: Loss <= 2.0x and price recrossed entry. Move stop to Break-Even. 83.3% historical probability of M2 (SL) recovery.';
        } else if (drawdown.lossMultipleBeforeEntryReturn > 2.0 || (drawdown.maxLossMultiple > 2.0 && drawdown.entryCrossCount === 0)) {
          holdAdvice = '🚨 STATE 3 HARD KILL TRIGGERED: Adverse loss touched > 2.0x without recrossing entry! Kill immediately.';
        } else {
          holdAdvice = 'State: [M1_LOSS_ACTIVE] Monitoring for entry recross before 2.0x loss.';
        }
      }

      let exitAdvice = 'Exit 100% on M1 SL hit. Holding for M2 TP is forbidden unless trailing at break-even + 1 tick.';
      if (ubX1Achieved) {
        exitAdvice = '✓ STATE 4A TARGET LOCKED: 100% profit captured at M1 SL hit. Position successfully resolved.';
      }

      // Pre-Entry Setup Score (0–100%)
      const preEntryScore = Math.min(
        100,
        allRules
          .filter((r) => r.phase === 'PRE_ENTRY')
          .reduce((acc, r) => acc + r.scoreContribution, 0)
      );

      return {
        engineType: 'UBER',
        engineName: 'Uber Engine (Mean-Reversion Scalp)',
        expectedTarget: 'SL',
        targetPhilosophy: 'Rubber-band snap to moving averages; entries counter to prevailing extension with primary target at SL.',
        benchmarkHistoricalWinRate: 86.7,
        lifecycleState,
        score: preEntryScore,
        isHighConfluence: preEntryScore >= 85 || highConfluenceCombinations.length > 0,
        highConfluenceCombinations,
        lifecycleAdvice: {
          lifecycleState,
          entryVerdict: preEntryScore >= 70 ? 'PASS' : preEntryScore >= 40 ? 'WARN' : 'REJECT',
          entryReason: ubE1Pass
            ? 'Rubber-band extension confirmed counter to macro crossover with symmetrical ratio >= 0.60.'
            : 'Price inside ribbon or direct momentum trend trap.',
          inFlightAdvice,
          holdAdvice,
          exitAdvice,
        },
        rules: allRules,
        preEntryRules: allRules.filter((r) => r.phase === 'PRE_ENTRY'),
        inFlightRules: allRules.filter((r) => r.phase === 'IN_FLIGHT'),
        recoveryHoldRules: allRules.filter((r) => r.phase === 'RECOVERY_HOLD'),
        finalExitRules: allRules.filter((r) => r.phase === 'FINAL_EXIT'),
        entryRules: allRules.filter((r) => r.phase === 'PRE_ENTRY'),
        holdRules: allRules.filter((r) => r.phase === 'RECOVERY_HOLD'),
        exitRules: allRules.filter((r) => r.phase === 'FINAL_EXIT'),
        achievedTags: allRules.filter((r) => r.status === 'PASS' && r.scoreContribution > 0).map((r) => `✓ ${r.name}`),
        missedTags: allRules.filter((r) => r.status === 'FAIL' && r.maxScore > 0).map((r) => `✗ ${r.name}`),
        notApplicableTags: allRules.filter((r) => r.status === 'NOT_APPLICABLE').map((r) => `N/A: ${r.name}`),
        guidance: {
          tradeType: 'Mean-Reversion Rubber-Band Scalp',
          optimalHoldWin: '1 to 4 minutes (1–4 candles)',
          maxHoldWin: '10 minutes (Hard Exit)',
          optimalHoldLoss: 'Cut immediately if adverse moves >= 1.5 ticks in first 120s',
          targetProfitMultiple: '100% exit at M1 SL hit',
          maxDrawdownAllowed: '1.5 ticks (Scratch exit if exceeded)',
          primaryCloseIndicator: 'M1 SL Hit (100% close) OR Adverse >= 1.5 ticks in-flight OR Terminal Stop > 2.5x',
          lossManagementRule:
            'State 3 Hold Protocol: If M1 hits TP (loss), hold ONLY IF loss <= 2.0x AND price recrosses entry (83.3% recovery). If loss > 2.0x without entry recross -> KILL IMMEDIATELY.',
          liveStatusAdvice: holdAdvice,
        },
      };
    }

    // =========================================================================
    // 2. ULTRA ENGINE (Expected Target: TP — Institutional Volume Breakout)
    // =========================================================================
    if (engineType === 'ULTRA') {
      // -----------------------------------------------------------------------
      // Phase 1: Pre-Entry Protocol (State 0)
      // -----------------------------------------------------------------------
      // Rule UL-E1 (Fresh Wave Ignition)
      // Trend Age: sma_crossover_prior_candles is <= 8 candles.
      // Directional Flow:
      // BUY_STOP: sma_crossover_state == BULLISH, candle_direction == BULLISH, price Above EMA20.
      // SELL_STOP: sma_crossover_state == BEARISH, candle_direction == BEARISH, price Below SMA9.
      // Confidence: 82.8% Direct M1 Win Rate (N = 72 / 87).
      const crossoverFresh = crossoverAge >= 1 && crossoverAge <= 8;
      const dirAlignment = isBuy
        ? crossoverState === 'BULLISH' && candleDir === 'BULLISH' && (entryIndicators ? trade.entry >= entryIndicators.ema20 : true)
        : crossoverState === 'BEARISH' && candleDir === 'BEARISH' && (entryIndicators ? trade.entry <= entryIndicators.smaFast : true);
      const ule1Pass = Boolean(crossoverFresh && dirAlignment);

      allRules.push({
        id: 'ul_e1_fresh_wave',
        name: 'Ultra: Fresh Wave Ignition Filter (UL-E1)',
        phase: 'PRE_ENTRY',
        lifecycleState: 'State 0: Pre-Entry',
        status: ule1Pass ? 'PASS' : 'FAIL',
        achieved: ule1Pass,
        isApplicable: true,
        triggerMoment: 'Breakout signal generation',
        eligiblePool: 'All candidate ULTRA signals (N = 87)',
        scoreContribution: ule1Pass ? 40 : crossoverFresh || dirAlignment ? 20 : 0,
        maxScore: 40,
        confidenceText: '82.8% Direct M1 Win Rate (N=72/87)',
        description: 'prior_candles <= 8; BUY_STOP Bullish + Above EMA20, SELL_STOP Bearish + Below SMA9',
        detail: `Crossover Age: ${crossoverAge} bars (${crossoverFresh ? '<=8 Fresh ✓' : 'Mature/Stale ✗'}) | Direction: ${candleDir} | Flow: ${dirAlignment ? 'Aligned ✓' : 'Misaligned ✗'}`,
        actionText: ule1Pass ? 'Place Stop Order in Book' : 'Discard Mature/Late Breakout',
      });

      // Rule UL-E2 (Multi-Threshold Density Cluster & Completed Order)
      // Order triggers across >= 2 threshold tiers simultaneously with compression gap |Threshold1 - Threshold2| <= 5 points.
      // Execution must be status == completed, is_cancelled == NO (Sustained institutional fill; reject if is_cancelled == YES).
      // Confidence: 86.4% Direct M1 Win Rate (N = 57 / 66).
      const ule2MultiTier = hasMultiTier && hasThresholdCompressionGap;
      const ule2ExecutionValid = isCompleted && !isCancelled;
      const ule2Pass = Boolean(ule2MultiTier && ule2ExecutionValid);

      allRules.push({
        id: 'ul_e2_threshold_cluster',
        name: 'Ultra: Multi-Threshold Density Cluster & Completed Order (UL-E2)',
        phase: 'PRE_ENTRY',
        lifecycleState: 'State 0: Pre-Entry',
        status: ule2Pass ? 'PASS' : 'FAIL',
        achieved: ule2Pass,
        isApplicable: true,
        triggerMoment: 'Order placement and execution',
        eligiblePool: 'Signals passing UL-E1 (N = 66)',
        scoreContribution: ule2Pass ? 35 : (ule2MultiTier && !isCancelled) ? 15 : 0,
        maxScore: 35,
        confidenceText: '86.4% Direct M1 Win Rate (N=57/66)',
        description: 'Order triggers across >= 2 threshold tiers simultaneously (|Thresh1 - Thresh2| <= 5 pts); status == completed, is_cancelled == NO',
        detail: ule2Pass
          ? `Multi-tier density verified (${clusterCount} sibling signals in cluster, gap: ${minThresholdGap <= 50 ? minThresholdGap.toFixed(1) + ' pts' : 'N/A'}, status: ${trade.status}) ✓`
          : isCancelled
          ? '🚨 REJECTION TRAP FOOTPRINT: Order cancelled (is_cancelled == YES). Severe institutional failure penalty.'
          : `Single-tier or uncompressed breakout (${clusterCount} signal, status: ${trade.status})`,
        actionText: ule2Pass ? 'Authorize Institutional Fill' : isCancelled ? 'REJECT: Rejection Trap (Check Inversion Fade)' : 'Standard Execution',
      });

      // Rule UL-E3 (Calendar & Day-of-Week Rules)
      // Trade Tuesdays (2), Wednesdays (3), and Thursdays (4) strictly 10:00–12:30 IST.
      // On Mondays (1) or Week 1 (Days 1–7 of month), trade Cash Equities (NSE_EQ) only (eliminates opening gap traps).
      // Confidence: 82.1% Win Rate (N = 78 / 95).
      const inWindow1230 = totalMinutes >= 600 && totalMinutes <= 750; // 10:00 - 12:30 IST
      const isMidWeek = dayOfWeek === 2 || dayOfWeek === 3 || dayOfWeek === 4; // Tue, Wed, Thu
      const isMonday = dayOfWeek === 1;

      let ule3Pass = false;
      let ule3Detail = '';
      if (isWeek1) {
        // Week 1 rule: ALLOW ULTRA only on Cash Equities (NSE_EQ)
        ule3Pass = Boolean(isNseEq && inWindow1230);
        ule3Detail = isNseEq
          ? `Week 1 Day ${dayOfMonth}: Cash Equities (NSE_EQ) permitted in 10:00–12:30 IST window ✓`
          : `Week 1 Day ${dayOfMonth}: Futures blocked (Week 1 Cash Equity rule) ✗`;
      } else if (isMonday) {
        // Monday rule: Cash Equities only
        ule3Pass = Boolean(isNseEq && inWindow1230);
        ule3Detail = isNseEq
          ? `Monday: Cash Equities (NSE_EQ) permitted in 10:00–12:30 IST window ✓`
          : `Monday: Futures blocked (Monday opening gap filter) ✗`;
      } else if (isMidWeek) {
        ule3Pass = inWindow1230;
        ule3Detail = inWindow1230
          ? `Prime Mid-Week Window (Day ${dayOfWeek}, ${timeStr} between 10:00–12:30 IST) ✓`
          : `Mid-Week but outside 10:00–12:30 IST window (${timeStr}) ✗`;
      } else {
        // Friday or other
        ule3Pass = inWindow1230;
        ule3Detail = `${timeStr} (Trading session)`;
      }

      allRules.push({
        id: 'ul_e3_calendar_day_rules',
        name: 'Ultra: Calendar & Day-of-Week Rules (UL-E3)',
        phase: 'PRE_ENTRY',
        lifecycleState: 'State 0: Pre-Entry',
        status: ule3Pass ? 'PASS' : 'FAIL',
        achieved: ule3Pass,
        isApplicable: true,
        triggerMoment: 'Pre-entry timing check',
        eligiblePool: 'Candidate ULTRA signals (N = 95)',
        scoreContribution: ule3Pass ? 25 : 0,
        maxScore: 25,
        confidenceText: '82.1% Win Rate (N=78/95)',
        description: 'Trade Tue, Wed, Thu (10:00–12:30 IST); On Mondays or Week 1, trade Cash Equities (NSE_EQ) only',
        detail: ule3Detail,
        actionText: ule3Pass ? 'Authorize Calendar Timing' : 'Reject Calendar/Timing Constraint',
      });

      // -----------------------------------------------------------------------
      // Phase 2: In-Flight Execution (State 1: Entry -> M1)
      // -----------------------------------------------------------------------
      // Rule UL-IF1: Trend Wave Hold
      // Hold position through Candles 1 to 8 as long as price does not hit SL. 82.8% of winners capture TP within 1 to 4 candles.
      allRules.push({
        id: 'ul_if1_trend_wave_hold',
        name: 'Ultra: Trend Wave Hold (UL-IF1)',
        phase: 'IN_FLIGHT',
        lifecycleState: 'State 1: In-Flight Entry -> M1',
        status: 'PASS',
        achieved: true,
        isApplicable: true,
        triggerMoment: 'Candles 1 to 8 post-fill',
        eligiblePool: 'All filled ULTRA positions',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '82.8% capture TP in 1–4 candles',
        description: 'Hold position through Candles 1 to 8 as long as price does not hit SL',
        detail: milestone1
          ? `Milestone resolved in ${milestone1.candlesCount} candle(s)`
          : 'Active in-flight position (Holding wave)',
        actionText: 'Hold Trend Wave to TP',
      });

      // -----------------------------------------------------------------------
      // Phase 3: Adverse Recovery Hold (State 3: M1 Lost -> Awaiting M2 TP)
      // STRICT SCOPE: Only applies to positions that lost M1! If M1 is WON, State 3 Hold is NOT APPLICABLE!
      // In Cash Equities (NSE_EQ): Hold M2. In Futures (NSE_FO): 5-candle test.
      // -----------------------------------------------------------------------
      // Rule UL-H1: Cash Equity (NSE_EQ) Immunity Hold
      let ulh1Status: RuleStatus = 'NOT_APPLICABLE';
      let ulh1Detail = 'NOT APPLICABLE: Position won M1 directly; Hold Protocol exclusively applies to State 3 adverse losses.';
      let ulh1Action = 'N/A (Trade captured M1 Win)';

      if (isM1Loss) {
        if (isNseEq) {
          ulh1Status = 'PASS';
          ulh1Detail = `Active M1 loss in Cash Equities (NSE_EQ) ✓ HOLD position through median 42-min drawdown (2.5x–3.5x). 91.9% M2 TP recovery rate (N=34/37).`;
          ulh1Action = 'HOLD position for M2 TP (Do NOT exit at SL)';
        } else {
          ulh1Status = 'NOT_APPLICABLE';
          ulh1Detail = 'NOT APPLICABLE: Trade is in Futures (NSE_FO). Apply UL-H2 Futures 5-Candle Test instead.';
          ulh1Action = 'Apply Futures Protocol (UL-H2)';
        }
      }

      allRules.push({
        id: 'ul_h1_cash_equity_shield',
        name: 'Ultra: Cash Equity (NSE_EQ) Immunity Hold (UL-H1)',
        phase: 'RECOVERY_HOLD',
        lifecycleState: 'State 3: Adverse Recovery Hold',
        status: ulh1Status,
        achieved: ulh1Status === 'PASS',
        isApplicable: Boolean(isM1Loss && isNseEq),
        triggerMoment: 'Position suffers M1 Loss (hits SL). Position active',
        eligiblePool: 'ONLY active M1-loss positions in Cash Equities (N = 37). N/A if M1 won or Futures',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '91.9% M2 TP Recovery Rate (N=34/37)',
        description: 'In NSE_EQ: HOLD position. Do not exit at SL; let cycle through 2.5x–3.5x drawdown to M2 TP',
        detail: ulh1Detail,
        actionText: ulh1Action,
      });

      // Rule UL-H2: Futures (NSE_FO) 5-Candle Dynamic Test
      let ulh2Status: RuleStatus = 'NOT_APPLICABLE';
      let ulh2Detail = 'NOT APPLICABLE: Position won M1 directly; Hold Protocol exclusively applies to State 3 adverse losses.';
      let ulh2Action = 'N/A (Trade captured M1 Win)';

      if (isM1Loss) {
        if (isNseFo) {
          const recrossed = drawdown.entryCrossCount >= 1 && drawdown.maxLossMultiple <= 3.5;
          const hardKill = drawdown.entryCrossCount === 0 && drawdown.maxLossMultiple > 3.0;
          if (hardKill) {
            ulh2Status = 'FAIL';
            ulh2Detail = `🚨 HARD KILL TRIGGERED: 0 entry recrosses after SL and adverse loss exceeded > 3.0x (${drawdown.maxLossMultiple.toFixed(2)}x). Cut immediately at market (avoids 100% of 5x–15x runaway trends).`;
            ulh2Action = 'HARD KILL POSITION AT MARKET';
          } else if (recrossed) {
            ulh2Status = 'PASS';
            ulh2Detail = `Price recrossed entry ${drawdown.entryCrossCount}x with loss ${drawdown.maxLossMultiple.toFixed(2)}x <= 3.5x ✓ 84.6% M2 TP recovery (N=22/26).`;
            ulh2Action = 'HOLD for M2 TP recovery';
          } else {
            ulh2Status = 'PASS';
            ulh2Detail = `At Candle 5: Loss is ${drawdown.maxLossMultiple.toFixed(2)}x. Monitoring for entry recross.`;
            ulh2Action = 'Monitor Candle 5 Invalidation Test';
          }
        } else {
          ulh2Status = 'NOT_APPLICABLE';
          ulh2Detail = 'NOT APPLICABLE: Trade is in Cash Equities (NSE_EQ). Cash Equity Immunity Hold (UL-H1) applies.';
          ulh2Action = 'Apply Cash Equity Shield';
        }
      }

      allRules.push({
        id: 'ul_h2_futures_5candle_test',
        name: 'Ultra: Futures (NSE_FO) 5-Candle Dynamic Test (UL-H2)',
        phase: 'RECOVERY_HOLD',
        lifecycleState: 'State 3: Adverse Recovery Hold',
        status: ulh2Status,
        achieved: ulh2Status === 'PASS',
        isApplicable: Boolean(isM1Loss && isNseFo),
        triggerMoment: 'Position suffers M1 Loss (hits SL). Position active',
        eligiblePool: 'ONLY active M1-loss positions in Futures (N = 48). N/A if M1 won or Cash',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '84.6% M2 TP Recovery on Hold (N=22/26); Eliminates 87.5% Runaway Losses',
        description: 'At Candle 5 post-SL: HOLD if recrosses entry (crossings >= 1) & loss <= 3.5x; KILL if 0 crosses past > 3.0x loss',
        detail: ulh2Detail,
        actionText: ulh2Action,
      });

      // -----------------------------------------------------------------------
      // Phase 4: Final Exit (State 4)
      // -----------------------------------------------------------------------
      // Rule UL-X1: Take Profit Execution
      const ulx1Achieved = isWonM1;
      allRules.push({
        id: 'ul_x1_take_profit',
        name: 'Ultra: Take Profit Execution (UL-X1)',
        phase: 'FINAL_EXIT',
        lifecycleState: 'State 4A: Target Lock',
        status: ulx1Achieved ? 'PASS' : milestone1 ? 'FAIL' : 'NOT_APPLICABLE',
        achieved: ulx1Achieved,
        isApplicable: Boolean(milestone1),
        triggerMoment: 'TP Target Hit',
        eligiblePool: 'All winning ULTRA trades',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: 'Primary Exit at TP (1.5x–2.5x)',
        description: 'Limit exit at TP (1.5x to 2.5x)',
        detail: ulx1Achieved
          ? `M1 TP achieved in ${milestone1?.timeTakenFormatted} (${milestone1?.ticks.toFixed(1)} ticks) ✓ Full Win`
          : milestone1
          ? 'M1 hit SL barrier (See State 3 Hold Protocol)'
          : 'Awaiting M1 target',
        actionText: ulx1Achieved ? 'Bank TP Profit at Limit' : 'Awaiting TP Target',
      });

      // Rule UL-X2: EOD Time Stop (14:15 IST)
      const eodTriggered = totalMinutes >= 855; // 14:15 IST
      allRules.push({
        id: 'ul_x2_eod_time_stop',
        name: 'Ultra: EOD Time Stop (UL-X2, 14:15 IST)',
        phase: 'FINAL_EXIT',
        lifecycleState: 'State 4B: Final Resolution',
        status: eodTriggered ? 'FAIL' : 'PASS',
        achieved: !eodTriggered,
        isApplicable: true,
        triggerMoment: '14:15 IST EOD check',
        eligiblePool: 'All open intraday positions',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: 'Prevents 76.9% Overnight Pending Stalls (N=40/52)',
        description: 'Hard market close at 14:15 IST for all open intraday positions regardless of PnL',
        detail: eodTriggered
          ? `Session time ${timeStr} >= 14:15 IST (EOD Time Stop Active — Close Position)`
          : `Session time ${timeStr} < 14:15 IST (Normal trading hours) ✓`,
        actionText: eodTriggered ? 'HARD CLOSE AT MARKET (EOD)' : 'Position Active',
      });

      // -----------------------------------------------------------------------
      // Combinations & Inversions for ULTRA
      // -----------------------------------------------------------------------
      // Combination 2: ULTRA Institutional Cash Sweep (92.7% Win Rate)
      // NSE_EQ + prior_candles <= 8 + Threshold Gap <= 5 pts + status == completed
      const comboUltraCashSweep = isNseEq && crossoverAge <= 8 && hasThresholdCompressionGap && isCompleted && !isCancelled;
      allRules.push({
        id: 'combo_ultra_cash_sweep_92',
        name: '2. ULTRA Institutional Cash Sweep (92.7% Win Rate)',
        phase: 'COMBINATION',
        lifecycleState: 'State 0 + State 3',
        status: comboUltraCashSweep ? 'PASS' : 'FAIL',
        achieved: comboUltraCashSweep,
        isApplicable: true,
        triggerMoment: 'Order placement & hold in NSE_EQ',
        eligiblePool: '41 qualifying ULTRA setups',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '92.7% Win Rate (N=38/41)',
        description: 'NSE_EQ + prior_candles <= 8 + Threshold Gap <= 5 pts + status == completed',
        detail: comboUltraCashSweep
          ? '💎 ULTRA CASH EQUITY SWEEP CONFLUENCE ACHIEVED (92.7% Win Rate)'
          : 'Did not meet all Cash Equity Sweep conditions',
        actionText: comboUltraCashSweep ? 'Hold Through Drawdown to TP' : 'Standard Execution',
      });

      if (comboUltraCashSweep) {
        highConfluenceCombinations.push({
          id: 'combo_ultra_cash_sweep_92',
          name: 'ULTRA Institutional Cash Sweep',
          winRate: 92.7,
          engine: 'ULTRA',
          badgeLabel: '92.7% CASH SWEEP',
          description: 'NSE_EQ + prior_candles <= 8 + Threshold Gap <= 5 pts + status == completed',
          phaseTarget: 'Pre-Entry + Hold (State 0 + 3)',
        });
      }

      // Combination 3: ULTRA Cash Equity M1 Recovery (91.9% Recovery Rate)
      // M1 Hit == SL + Instrument == NSE_EQ + loss_multiple_before_return <= 3.5x
      const comboUltraEqRecovery = Boolean(isM1Loss && isNseEq && drawdown.lossMultipleBeforeEntryReturn <= 3.5);
      allRules.push({
        id: 'combo_ultra_eq_recovery_91',
        name: '3. ULTRA Cash Equity M1 Recovery (91.9% Recovery Rate)',
        phase: 'COMBINATION',
        lifecycleState: 'State 3: Adverse Recovery Hold',
        status: isM1Loss && isNseEq ? (comboUltraEqRecovery ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE',
        achieved: comboUltraEqRecovery,
        isApplicable: Boolean(isM1Loss && isNseEq),
        triggerMoment: 'Position suffers M1 Loss in NSE_EQ',
        eligiblePool: '37 losing cash setups',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '91.9% Recovery (N=34/37)',
        description: 'M1 Hit == SL + Instrument == NSE_EQ + loss_multiple_before_return <= 3.5x',
        detail: isM1Loss && isNseEq
          ? comboUltraEqRecovery
            ? '🛡️ ULTRA CASH EQUITY RECOVERY WELL ACTIVE (91.9% M2 TP Recovery Rate)'
            : `Loss before return ${drawdown.lossMultipleBeforeEntryReturn.toFixed(2)}x exceeded 3.5x`
          : 'NOT APPLICABLE: Trade did not suffer an M1 loss in Cash Equities.',
        actionText: comboUltraEqRecovery ? 'HOLD Through Drawdown for M2 TP' : 'Manage Drawdown',
      });

      if (comboUltraEqRecovery) {
        highConfluenceCombinations.push({
          id: 'combo_ultra_eq_recovery_91',
          name: 'ULTRA Cash Equity M1 Recovery',
          winRate: 91.9,
          engine: 'ULTRA',
          badgeLabel: '91.9% EQ M2 RECOVERY',
          description: 'M1 Hit == SL + Instrument == NSE_EQ + loss_multiple_before_return <= 3.5x',
          phaseTarget: 'State 3 (Recovery)',
        });
      }

      // Inversion Strategy 4: The Cancelled ULTRA Inversion Fade (92.3% Win Rate)
      // Fading is_cancelled == YES in NSE_FO where prior_candles >= 20 (Target = Original SL)
      const isClimaxFadeCandidate = isNseFo && isCancelled && crossoverAge >= 20;
      allRules.push({
        id: 'combo_ultra_fade_inversion_92',
        name: '4. The Cancelled ULTRA Inversion Fade (92.3% Win Rate)',
        phase: 'INVERSION',
        lifecycleState: 'State 0: Opposite Entry',
        status: isClimaxFadeCandidate ? 'PASS' : 'NOT_APPLICABLE',
        achieved: isClimaxFadeCandidate,
        isApplicable: isNseFo,
        triggerMoment: 'Cancelled / stalled mature order in NSE_FO',
        eligiblePool: '26 mature futures traps',
        scoreContribution: 0,
        maxScore: 0,
        confidenceText: '92.3% Fade Win Rate (N=24/26)',
        description: 'Fading cancelled orders in NSE_FO where prior_candles >= 20 (Target = Original SL)',
        detail: isClimaxFadeCandidate
          ? `⚡ INVERSION SIGNAL TRIGGERED: Cancelled mature futures trap (Age: ${crossoverAge}b >= 20). FADE opposite direction @ Entry -> Target SL!`
          : 'Normal breakout setup (No climax fade triggered)',
        actionText: isClimaxFadeCandidate ? `Enter Opposite ${isBuy ? 'SHORT' : 'LONG'} @ Entry -> Target SL` : 'Standard Execution',
      });

      if (isClimaxFadeCandidate) {
        const invertedDir = isBuy ? 'SELL' : 'BUY';
        inversionSignal = {
          shouldInvert: true,
          inversionType: 'ULTRA_CLIMAX_FADE',
          invertedDirection: invertedDir,
          originalType: trade.type,
          entryPrice: trade.entry,
          targetPrice: trade.sl, // Target original SL
          originalSL: trade.tp, // Inverted stop is original TP
          winRate: 92.3,
          title: `92.3% Fade Inversion: ${invertedDir} @ ${trade.entry.toFixed(2)}`,
          rationale: `Fading cancelled mature futures breakout trap (Age: ${crossoverAge}b >= 20, is_cancelled == YES). 92.3% verified snapback to stop loss level ${trade.sl.toFixed(2)}.`,
        };
      }

      // Lifecycle Advice for ULTRA
      let inFlightAdvice = 'Hold through Candles 1 to 8: 82.8% of winners capture TP within 1 to 4 candles.';
      let holdAdvice = 'State 3 Hold Protocol: NOT APPLICABLE unless trade suffers an M1 loss.';
      if (isM1Loss) {
        if (isNseEq) {
          holdAdvice = '✓ STATE 3 CASH SHIELD ACTIVE: Position lost M1 in NSE_EQ. HOLD through median 42-min drawdown (up to 3.5x). 91.9% historical recovery to M2 TP.';
        } else {
          if (drawdown.entryCrossCount >= 1 && drawdown.maxLossMultiple <= 3.5) {
            holdAdvice = `✓ STATE 3 FUTURES RECOVERY ACTIVE: Price recrossed entry ${drawdown.entryCrossCount}x. Ride to M2 TP!`;
          } else if (drawdown.entryCrossCount === 0 && drawdown.maxLossMultiple > 3.0) {
            holdAdvice = '🚨 STATE 3 FUTURES KILL TRIGGER: 0 entry recrosses and loss > 3.0x! Cut at market immediately.';
          } else {
            holdAdvice = '⏳ STATE 3 FUTURES 5-CANDLE WATCH: Monitoring next 5 candles for entry recross.';
          }
        }
      }

      let exitAdvice = 'Bank TP at 1.5x–2.5x. Hard market close at 14:15 IST for all open intraday positions.';
      if (ulx1Achieved) {
        exitAdvice = '✓ STATE 4A TARGET LOCKED: Milestone 1 TP achieved. Primary win banked.';
      } else if (eodTriggered) {
        exitAdvice = '⚠️ STATE 4B EOD TIME STOP: 14:15 IST reached. Hard close open intraday position.';
      }

      // Pre-Entry Setup Score (0–100%)
      const preEntryScore = Math.min(
        100,
        allRules
          .filter((r) => r.phase === 'PRE_ENTRY')
          .reduce((acc, r) => acc + r.scoreContribution, 0)
      );

      return {
        engineType: 'ULTRA',
        engineName: 'Ultra Engine (Institutional Volume Breakout)',
        expectedTarget: 'TP',
        targetPhilosophy: 'Kinetic momentum expansion on multi-tier volume sweeps; directional continuation to TP.',
        benchmarkHistoricalWinRate: 88.0,
        lifecycleState,
        score: preEntryScore,
        isHighConfluence: preEntryScore >= 85 || highConfluenceCombinations.length > 0,
        highConfluenceCombinations,
        inversionSignal,
        lifecycleAdvice: {
          lifecycleState,
          entryVerdict: isClimaxFadeCandidate ? 'REJECT' : preEntryScore >= 70 ? 'PASS' : preEntryScore >= 40 ? 'WARN' : 'REJECT',
          entryReason: isClimaxFadeCandidate
            ? 'REJECT: Cancelled mature trap (prior_candles >= 20, is_cancelled == YES). Trigger Fade Inversion.'
            : ule1Pass
            ? 'Fresh wave ignition with aligned moving averages confirmed.'
            : 'Moderate trend setup.',
          inFlightAdvice,
          holdAdvice,
          exitAdvice,
        },
        rules: allRules,
        preEntryRules: allRules.filter((r) => r.phase === 'PRE_ENTRY'),
        inFlightRules: allRules.filter((r) => r.phase === 'IN_FLIGHT'),
        recoveryHoldRules: allRules.filter((r) => r.phase === 'RECOVERY_HOLD'),
        finalExitRules: allRules.filter((r) => r.phase === 'FINAL_EXIT'),
        entryRules: allRules.filter((r) => r.phase === 'PRE_ENTRY'),
        holdRules: allRules.filter((r) => r.phase === 'RECOVERY_HOLD'),
        exitRules: allRules.filter((r) => r.phase === 'FINAL_EXIT'),
        achievedTags: allRules.filter((r) => r.status === 'PASS' && r.scoreContribution > 0).map((r) => `✓ ${r.name}`),
        missedTags: allRules.filter((r) => r.status === 'FAIL' && r.maxScore > 0).map((r) => `✗ ${r.name}`),
        notApplicableTags: allRules.filter((r) => r.status === 'NOT_APPLICABLE').map((r) => `N/A: ${r.name}`),
        guidance: {
          tradeType: 'Institutional Volume Breakout',
          optimalHoldWin: '15 to 45 minutes (18–50 candles)',
          maxHoldWin: '90 minutes (or 14:15 IST EOD Close)',
          optimalHoldLoss: isNseEq
            ? 'Hold through median 42-min drawdown (2.5x–3.5x) for 91.9% M2 recovery'
            : 'Track 5 candles: exit if 0 recrosses past 3.0x loss',
          targetProfitMultiple: 'Book at 1.5x to 2.5x',
          maxDrawdownAllowed: isNseEq ? '3.5x (Cash Equity Immunity Hold)' : '3.5x (Futures 5-Candle Test)',
          primaryCloseIndicator: 'M1 TP Hit (Primary Win) OR 14:15 IST EOD Stop OR (NSE_FO: 0 entry crosses & loss > 3.0x)',
          lossManagementRule:
            'State 3 Hold Protocol: In NSE_EQ, HOLD (91.9% recover to M2 TP). In NSE_FO, wait 5 candles: if entry_cross_count >= 1, HOLD for TP; if entry_cross_count == 0 past 3.0x loss, CUT AT MARKET.',
          liveStatusAdvice: holdAdvice,
        },
      };
    }

    // =========================================================================
    // 3. META ENGINE (Expected Target: TP — Kinetic Momentum Expansion)
    // =========================================================================
    // -------------------------------------------------------------------------
    // Phase 1: Pre-Entry Protocol (State 0)
    // -------------------------------------------------------------------------
    // Rule M-E1: Dynamic Support Micro-Momentum
    // SELL_STOP strictly Below SMA9 and Below EMA20; BUY_STOP strictly Above EMA20; asset preferably NSE_EQ
    let me1Pass = false;
    if (entryIndicators) {
      if (isBuy) {
        me1Pass = trade.entry >= entryIndicators.ema20;
      } else {
        const isAboveAll = posWrtMa.includes('above all') || (posWrtMa.includes('above sma9') && posWrtMa.includes('above sma21') && posWrtMa.includes('above ema20'));
        me1Pass = trade.entry <= entryIndicators.smaFast && trade.entry <= entryIndicators.ema20 && !isAboveAll;
      }
    }
    allRules.push({
      id: 'm_e1_micro_momentum',
      name: 'Meta: Dynamic Support Micro-Momentum (M-E1)',
      phase: 'PRE_ENTRY',
      lifecycleState: 'State 0: Pre-Entry',
      status: me1Pass ? 'PASS' : 'FAIL',
      achieved: me1Pass,
      isApplicable: true,
      triggerMoment: 'Breakout signal generation',
      eligiblePool: 'All candidate META signals (N = 20)',
      scoreContribution: me1Pass ? 40 : 0,
      maxScore: 40,
      confidenceText: '84.6% Direct M1 Win Rate (N=11/13)',
      description: 'SELL_STOP strictly below SMA9 and EMA20; BUY_STOP strictly above EMA20; asset preferably NSE_EQ',
      detail: entryIndicators
        ? isBuy
          ? `Entry ${trade.entry.toFixed(1)} ${me1Pass ? '>=' : '<'} EMA20 ${entryIndicators.ema20.toFixed(1)}`
          : `Entry ${trade.entry.toFixed(1)} ${me1Pass ? '<=' : '>'} SMA9 ${entryIndicators.smaFast.toFixed(1)} & EMA20 ${entryIndicators.ema20.toFixed(1)}`
        : 'Pending MA indicators',
      actionText: me1Pass ? 'Authorize Kinetic Execution' : 'Reject Sub-Optimal Setup',
    });

    // Rule M-E2: Segment Priority (Cash Equities NSE_EQ)
    allRules.push({
      id: 'm_e2_segment_priority',
      name: 'Meta: Segment Priority (M-E2, Cash Equities)',
      phase: 'PRE_ENTRY',
      lifecycleState: 'State 0: Pre-Entry',
      status: isNseEq ? 'PASS' : 'FAIL',
      achieved: isNseEq,
      isApplicable: true,
      triggerMoment: 'Candidate screening',
      eligiblePool: 'Candidate META signals',
      scoreContribution: isNseEq ? 35 : 15,
      maxScore: 35,
      confidenceText: 'Highest Clean Breakout Ratio',
      description: 'Prioritize Cash Equities (NSE_EQ) over derivatives',
      detail: isNseEq ? 'Cash Equities (NSE_EQ) ✓' : `${trade.instrument.split('|')[0] || 'Futures'} (Sub-optimal)`,
      actionText: isNseEq ? 'Priority Cash Allocation' : 'Secondary Derivative Allocation',
    });

    // Rule M-E3: Imminent Crossover State (<= 10 bars)
    const crossoverEnded = entryIndicators?.crossoverEndedInCandles;
    const imminentCrossover = crossoverEnded !== null && crossoverEnded !== undefined && crossoverEnded <= 10;
    allRules.push({
      id: 'm_e3_imminent_crossover',
      name: 'Meta: Imminent Crossover State (M-E3, ≤ 10 bars)',
      phase: 'PRE_ENTRY',
      lifecycleState: 'State 0: Pre-Entry',
      status: imminentCrossover ? 'PASS' : 'FAIL',
      achieved: Boolean(imminentCrossover),
      isApplicable: true,
      triggerMoment: 'Pre-entry check',
      eligiblePool: 'Candidate META setups',
      scoreContribution: imminentCrossover ? 25 : 0,
      maxScore: 25,
      confidenceText: 'Early Wave Ignition',
      description: 'Crossover is flipping in trade direction within <= 10 candles',
      detail:
        crossoverEnded !== null && crossoverEnded !== undefined
          ? `Crossover ends/flips in ${crossoverEnded} candles ✓`
          : 'Crossover persistent or not flipping',
      actionText: imminentCrossover ? 'Authorize Fast Ignition' : 'Standard Sizing',
    });

    // -------------------------------------------------------------------------
    // Phase 2: In-Flight Execution (State 1: Entry -> M1)
    // -------------------------------------------------------------------------
    // Rule M-IF1: Fast Momentum Tracking (Resolve within 6 candles)
    const mResolvesFast = milestone1 ? milestone1.candlesCount <= 6 : true;
    allRules.push({
      id: 'm_if1_fast_momentum_tracking',
      name: 'Meta: Fast Momentum Tracking (M-IF1)',
      phase: 'IN_FLIGHT',
      lifecycleState: 'State 1: In-Flight Entry -> M1',
      status: mResolvesFast ? 'PASS' : 'FAIL',
      achieved: mResolvesFast,
      isApplicable: true,
      triggerMoment: 'Post-fill execution',
      eligiblePool: 'All filled META positions',
      scoreContribution: 0,
      maxScore: 0,
      confidenceText: 'Fast Resolution',
      description: 'Position must resolve within 6 candles of entry',
      detail: milestone1
        ? `Resolved in ${milestone1.candlesCount} candle(s) (${mResolvesFast ? '<= 6 fast ✓' : '> 6 delayed ✗'})`
        : 'Active in-flight position',
      actionText: 'Track Rapid Expansion',
    });

    // -------------------------------------------------------------------------
    // Phase 3: Adverse Recovery Hold (State 3: M1 Lost)
    // STRICT SCOPE: Only applies to positions hitting SL! Zero Tolerance: DO NOT HOLD!
    // -------------------------------------------------------------------------
    // Rule M-H1: Zero Tolerance on M1 Loss (No Hold Allowed)
    let mh1Status: RuleStatus = 'NOT_APPLICABLE';
    let mh1Detail = 'NOT APPLICABLE: Position won M1 directly; Hold Protocol exclusively applies to State 3 adverse losses.';
    let mh1Action = 'N/A (Trade captured M1 Win)';

    if (isM1Loss) {
      mh1Status = 'FAIL'; // In META, holding an M1 loss is strictly forbidden
      mh1Detail = '🚨 ZERO TOLERANCE CUT: M1 hit SL. Cut immediately at market (0 to 3 mins). DO NOT HOLD for M2 (71.4% permanent trap risk).';
      mh1Action = 'MARKET CLOSE IMMEDIATELY (DO NOT HOLD)';
    }

    allRules.push({
      id: 'm_h1_zero_tolerance_loss',
      name: 'Meta: Zero Tolerance on M1 Loss (M-H1, No Hold Allowed)',
      phase: 'RECOVERY_HOLD',
      lifecycleState: 'State 3: Adverse Recovery Hold',
      status: mh1Status,
      achieved: false,
      isApplicable: isM1Loss,
      triggerMoment: 'M1 hits SL',
      eligiblePool: 'ONLY active META positions hitting SL (N = 7). N/A if M1 won',
      scoreContribution: 0,
      maxScore: 0,
      confidenceText: '71.4% Trap Avoidance (N=5/7 avoided 6.8x–11.3x losses)',
      description: 'MARKET CLOSE IMMEDIATELY (0 to 3 minutes). DO NOT HOLD for M2',
      detail: mh1Detail,
      actionText: mh1Action,
    });

    // -------------------------------------------------------------------------
    // Phase 4: Final Exit (State 4)
    // -------------------------------------------------------------------------
    // Rule M-X1: Trailing Profit Lock
    // Move trailing stop to +1.5x profit once M1 TP is hit; ride extensions up to 12.6x
    const mx1Achieved = isWonM1;
    allRules.push({
      id: 'm_x1_trailing_profit_lock',
      name: 'Meta: Trailing Profit Lock (M-X1)',
      phase: 'FINAL_EXIT',
      lifecycleState: 'State 4A: Target Lock',
      status: mx1Achieved ? 'PASS' : milestone1 ? 'FAIL' : 'NOT_APPLICABLE',
      achieved: mx1Achieved,
      isApplicable: Boolean(milestone1),
      triggerMoment: 'M1 TP Hit',
      eligiblePool: 'All winning META trades (N = 9)',
      scoreContribution: 0,
      maxScore: 0,
      confidenceText: '88.9% Win Preservation Rate (N=8/9)',
      description: 'Move trailing stop to +1.5x profit once M1 TP is hit; ride extensions up to 12.6x',
      detail: mx1Achieved
        ? `M1 TP achieved: Move trailing stop to +1.5x profit. Max profit excursion: ${(drawdown.maxProfitMultiple || 0).toFixed(2)}x ✓`
        : milestone1
        ? 'M1 hit SL barrier (Zero tolerance cut active)'
        : 'Awaiting M1 target',
      actionText: mx1Achieved ? 'Lock Trailing Stop at +1.5x Profit' : 'Awaiting TP Fill',
    });

    let metaInFlightAdvice = 'Fast momentum tracking: resolve within 6 candles.';
    let metaHoldAdvice = 'State 3 Hold Protocol: NOT APPLICABLE unless trade suffers an M1 loss.';
    if (isM1Loss) {
      metaHoldAdvice = '🚨 STATE 3 ZERO TOLERANCE CUT: M1 hit SL! CUT IMMEDIATELY AT MARKET (0 to 3 mins). DO NOT HOLD for M2 (71.4% trap risk).';
    }

    let metaExitAdvice = 'Upon M1 TP hit, lock trailing stop at +1.5x profit. Ride extensions up to 12.6x.';
    if (mx1Achieved) {
      metaExitAdvice = '✓ STATE 4A ACTIVE: Trailing stop raised to +1.5x profit. Ride runner extensions!';
    }

    const metaPreEntryScore = Math.min(
      100,
      allRules
        .filter((r) => r.phase === 'PRE_ENTRY')
        .reduce((acc, r) => acc + r.scoreContribution, 0)
    );

    return {
      engineType: 'META',
      engineName: 'Meta Engine (Kinetic Momentum Expansion)',
      expectedTarget: 'TP',
      targetPhilosophy: 'Rapid momentum acceleration; immediate trailing on winners, instant zero-tolerance cut on adverse stops.',
      benchmarkHistoricalWinRate: 85.7,
      lifecycleState,
      score: metaPreEntryScore,
      isHighConfluence: metaPreEntryScore >= 85,
      highConfluenceCombinations,
      lifecycleAdvice: {
        lifecycleState,
        entryVerdict: metaPreEntryScore >= 70 ? 'PASS' : metaPreEntryScore >= 40 ? 'WARN' : 'REJECT',
        entryReason: me1Pass
          ? 'Micro-momentum confirmed with moving averages in direction of trade.'
          : 'Price detached or counter to micro-momentum.',
        inFlightAdvice: metaInFlightAdvice,
        holdAdvice: metaHoldAdvice,
        exitAdvice: metaExitAdvice,
      },
      rules: allRules,
      preEntryRules: allRules.filter((r) => r.phase === 'PRE_ENTRY'),
      inFlightRules: allRules.filter((r) => r.phase === 'IN_FLIGHT'),
      recoveryHoldRules: allRules.filter((r) => r.phase === 'RECOVERY_HOLD'),
      finalExitRules: allRules.filter((r) => r.phase === 'FINAL_EXIT'),
      entryRules: allRules.filter((r) => r.phase === 'PRE_ENTRY'),
      holdRules: allRules.filter((r) => r.phase === 'RECOVERY_HOLD'),
      exitRules: allRules.filter((r) => r.phase === 'FINAL_EXIT'),
      achievedTags: allRules.filter((r) => r.status === 'PASS' && r.scoreContribution > 0).map((r) => `✓ ${r.name}`),
      missedTags: allRules.filter((r) => r.status === 'FAIL' && r.maxScore > 0).map((r) => `✗ ${r.name}`),
      notApplicableTags: allRules.filter((r) => r.status === 'NOT_APPLICABLE').map((r) => `N/A: ${r.name}`),
      guidance: {
        tradeType: 'Kinetic Momentum Expansion',
        optimalHoldWin: '25 to 50 minutes (25–52 candles)',
        maxHoldWin: '60 minutes (or trail at +1.5x)',
        optimalHoldLoss: '0 to 3 minutes (Cut instantly on SL hit)',
        targetProfitMultiple: 'Trail after 1.5x (Ride runners to 10x)',
        maxDrawdownAllowed: '1.0x stop distance (Zero tolerance)',
        primaryCloseIndicator: 'M1 hit SL (Instant market cut) OR Trailing Stop at +1.5x hit',
        lossManagementRule:
          'State 3 Hold Protocol: CUT IMMEDIATELY (0 to 3 mins). Zero tolerance for holding M1 losses (71.4% permanent trap risk).',
        liveStatusAdvice: metaHoldAdvice,
      },
    };
  }

  /**
   * Compute aggregated analytics comparing trades with Score >= 85% or >90% combinations against baseline
   */
  static computeAggregatedAnalytics(
    analyses: TradeMilestoneAnalysis[]
  ): EnhancedAnalyticsSummary {
    const totalAnalyzed = analyses.length;
    if (totalAnalyzed === 0) {
      return {
        totalAnalyzed: 0,
        highConfluenceCount: 0,
        highConfluencePercentage: 0,
        allWinRate: 0,
        highConfluenceWinRate: 0,
        winRateLift: 0,
        uberSuperSetCount: 0,
        uberSuperSetWins: 0,
        uberSuperSetWinRate: 0,
        ultraCashSweepCount: 0,
        ultraCashSweepWins: 0,
        ultraCashSweepWinRate: 0,
        ultraFreshWaveCount: 0,
        ultraFreshWaveWins: 0,
        ultraFreshWaveWinRate: 0,
        ultraEqRecoveryCount: 0,
        ultraEqRecoveryWins: 0,
        ultraEqRecoveryWinRate: 0,
        fadeInversionCount: 0,
        uber: { total: 0, highConfluenceTotal: 0, highConfluenceWins: 0, highConfluenceWinRate: 0, allWinRate: 0 },
        meta: { total: 0, highConfluenceTotal: 0, highConfluenceWins: 0, highConfluenceWinRate: 0, allWinRate: 0 },
        ultra: { total: 0, highConfluenceTotal: 0, highConfluenceWins: 0, highConfluenceWinRate: 0, allWinRate: 0 },
        avgProfitMultipleHighConfluence: 0,
        avgLossMultipleHighConfluence: 0,
        avgProfitMultipleAll: 0,
        avgLossMultipleAll: 0,
      };
    }

    const allSignals = analyses.map((a) => a.trade);
    const evaluated = analyses.map((a) => ({
      analysis: a,
      enhanced: this.evaluate(a, allSignals),
    }));

    const allWins = evaluated.filter((e) => e.analysis.isSuccess).length;
    const allWinRate = parseFloat(((allWins / totalAnalyzed) * 100).toFixed(1));

    const highConfluence = evaluated.filter((e) => e.enhanced.isHighConfluence);
    const highConfluenceCount = highConfluence.length;
    const highConfluenceWins = highConfluence.filter((e) => e.analysis.isSuccess).length;
    const highConfluenceWinRate =
      highConfluenceCount > 0
        ? parseFloat(((highConfluenceWins / highConfluenceCount) * 100).toFixed(1))
        : 0;
    const winRateLift = parseFloat((highConfluenceWinRate - allWinRate).toFixed(1));

    // Combination metrics
    const uberSuperSetTrades = evaluated.filter((e) =>
      e.enhanced.highConfluenceCombinations.some((c) => c.id === 'combo_uber_expiry_cycle_93' || c.id === 'combo_uber_superset_93')
    );
    const uberSuperSetWins = uberSuperSetTrades.filter((e) => e.analysis.isSuccess).length;
    const uberSuperSetWinRate = uberSuperSetTrades.length > 0
      ? parseFloat(((uberSuperSetWins / uberSuperSetTrades.length) * 100).toFixed(1))
      : 0;

    const ultraCashSweepTrades = evaluated.filter((e) =>
      e.enhanced.highConfluenceCombinations.some((c) => c.id === 'combo_ultra_cash_sweep_92')
    );
    const ultraCashSweepWins = ultraCashSweepTrades.filter((e) => e.analysis.isSuccess).length;
    const ultraCashSweepWinRate = ultraCashSweepTrades.length > 0
      ? parseFloat(((ultraCashSweepWins / ultraCashSweepTrades.length) * 100).toFixed(1))
      : 0;

    const ultraFreshWaveTrades = evaluated.filter((e) =>
      e.enhanced.highConfluenceCombinations.some((c) => c.id === 'combo_ultra_fresh_wave_91' || c.id === 'combo_ultra_cash_sweep_92')
    );
    const ultraFreshWaveWins = ultraFreshWaveTrades.filter((e) => e.analysis.isSuccess).length;
    const ultraFreshWaveWinRate = ultraFreshWaveTrades.length > 0
      ? parseFloat(((ultraFreshWaveWins / ultraFreshWaveTrades.length) * 100).toFixed(1))
      : 0;

    const ultraEqRecoveryTrades = evaluated.filter((e) =>
      e.enhanced.highConfluenceCombinations.some((c) => c.id === 'combo_ultra_eq_recovery_91')
    );
    const ultraEqRecoveryWins = ultraEqRecoveryTrades.filter((e) => e.analysis.milestone2?.type === 'TP').length;
    const ultraEqRecoveryWinRate = ultraEqRecoveryTrades.length > 0
      ? parseFloat(((ultraEqRecoveryWins / ultraEqRecoveryTrades.length) * 100).toFixed(1))
      : 0;

    const fadeInversionTrades = evaluated.filter((e) =>
      Boolean(e.enhanced.inversionSignal?.shouldInvert) ||
      e.enhanced.highConfluenceCombinations.some((c) => c.id === 'combo_ultra_fade_inversion_92')
    );

    // Per Engine calculations
    const calcEngine = (type: 'UBER' | 'META' | 'ULTRA') => {
      const engineAll = evaluated.filter((e) => e.enhanced.engineType === type);
      const engineAllWins = engineAll.filter((e) => e.analysis.isSuccess).length;
      const engineHigh = engineAll.filter((e) => e.enhanced.isHighConfluence);
      const engineHighWins = engineHigh.filter((e) => e.analysis.isSuccess).length;

      return {
        total: engineAll.length,
        highConfluenceTotal: engineHigh.length,
        highConfluenceWins: engineHighWins,
        highConfluenceWinRate:
          engineHigh.length > 0
            ? parseFloat(((engineHighWins / engineHigh.length) * 100).toFixed(1))
            : 0,
        allWinRate:
          engineAll.length > 0
            ? parseFloat(((engineAllWins / engineAll.length) * 100).toFixed(1))
            : 0,
      };
    };

    // Excursion averages
    const highProfits = highConfluence
      .filter((e) => e.analysis.isSuccess)
      .map((e) => e.analysis.drawdown.maxProfitMultiple || 0);
    const avgProfitMultipleHighConfluence =
      highProfits.length > 0
        ? parseFloat((highProfits.reduce((a, b) => a + b, 0) / highProfits.length).toFixed(2))
        : 0;

    const highLosses = highConfluence
      .filter((e) => !e.analysis.isSuccess && e.analysis.milestone1)
      .map((e) => e.analysis.drawdown.maxLossMultiple || 0);
    const avgLossMultipleHighConfluence =
      highLosses.length > 0
        ? parseFloat((highLosses.reduce((a, b) => a + b, 0) / highLosses.length).toFixed(2))
        : 0;

    const allProfits = evaluated
      .filter((e) => e.analysis.isSuccess)
      .map((e) => e.analysis.drawdown.maxProfitMultiple || 0);
    const avgProfitMultipleAll =
      allProfits.length > 0
        ? parseFloat((allProfits.reduce((a, b) => a + b, 0) / allProfits.length).toFixed(2))
        : 0;

    const allLosses = evaluated
      .filter((e) => !e.analysis.isSuccess && e.analysis.milestone1)
      .map((e) => e.analysis.drawdown.maxLossMultiple || 0);
    const avgLossMultipleAll =
      allLosses.length > 0
        ? parseFloat((allLosses.reduce((a, b) => a + b, 0) / allLosses.length).toFixed(2))
        : 0;

    return {
      totalAnalyzed,
      highConfluenceCount,
      highConfluencePercentage: parseFloat(((highConfluenceCount / totalAnalyzed) * 100).toFixed(1)),
      allWinRate,
      highConfluenceWinRate,
      winRateLift,
      uberSuperSetCount: uberSuperSetTrades.length,
      uberSuperSetWins,
      uberSuperSetWinRate,
      ultraCashSweepCount: ultraCashSweepTrades.length,
      ultraCashSweepWins,
      ultraCashSweepWinRate,
      ultraFreshWaveCount: ultraFreshWaveTrades.length,
      ultraFreshWaveWins,
      ultraFreshWaveWinRate,
      ultraEqRecoveryCount: ultraEqRecoveryTrades.length,
      ultraEqRecoveryWins,
      ultraEqRecoveryWinRate,
      fadeInversionCount: fadeInversionTrades.length,
      uber: calcEngine('UBER'),
      meta: calcEngine('META'),
      ultra: calcEngine('ULTRA'),
      avgProfitMultipleHighConfluence,
      avgLossMultipleHighConfluence,
      avgProfitMultipleAll,
      avgLossMultipleAll,
    };
  }
}
