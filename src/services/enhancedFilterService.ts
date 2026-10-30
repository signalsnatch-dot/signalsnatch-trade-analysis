import { TradeMilestoneAnalysis, TradeSignal } from '../types/trade.ts';
import { UpstoxApiService } from './upstoxApi.ts';

export interface RuleEvaluation {
  id: string;
  name: string;
  achieved: boolean;
  scoreContribution: number;
  maxScore: number;
  description: string;
  detail: string;
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

export interface EnhancedFilterResult {
  engineType: 'UBER' | 'META' | 'ULTRA' | 'OTHER';
  engineName: string;
  expectedTarget: 'SL' | 'TP';
  targetPhilosophy: string;
  benchmarkHistoricalWinRate: number; // e.g. 86.7% for Uber, 85.7% for Meta, 88.0% for Ultra
  score: number; // 0 to 100
  isHighConfluence: boolean; // score >= 85
  rules: RuleEvaluation[];
  achievedTags: string[]; // e.g. ["✓ Inverted Alignment", "✓ Timing Window (10:15 IST)"]
  missedTags: string[]; // e.g. ["✗ Timing (After 14:00 IST)", "✗ MA Spread (0.12%)"]
  guidance: ExitHoldingGuidance;
}

export interface EnhancedAnalyticsSummary {
  totalAnalyzed: number;
  highConfluenceCount: number; // Score >= 85
  highConfluencePercentage: number;
  
  // Win rates
  allWinRate: number;
  highConfluenceWinRate: number;
  winRateLift: number; // difference in percentage points (+X%)

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

  // Excursion averages for High Confluence vs All
  avgProfitMultipleHighConfluence: number;
  avgLossMultipleHighConfluence: number;
  avgProfitMultipleAll: number;
  avgLossMultipleAll: number;
}

export interface EnhancedRuleDefinition {
  id: string;
  name: string;
  engine: 'UBER' | 'META' | 'ULTRA';
  description: string;
}

export const ALL_ENHANCED_RULES: EnhancedRuleDefinition[] = [
  // UBER ENGINE RULES
  {
    id: 'uber_inverted_alignment',
    name: 'Uber: Inverted Alignment',
    engine: 'UBER',
    description: 'SELL_STOP in BULLISH crossover; BUY_STOP in BEARISH crossover',
  },
  {
    id: 'uber_timing_window',
    name: 'Uber: Timing Window (09:35–13:00)',
    engine: 'UBER',
    description: 'Execute between 09:35 and 13:00 IST (reject after 14:00)',
  },
  {
    id: 'uber_ma_compression',
    name: 'Uber: MA Compression (≤ 0.04%)',
    engine: 'UBER',
    description: '|SMA Fast - EMA 20| / Entry <= 0.04% (tight compression)',
  },
  {
    id: 'uber_geometry_symmetry',
    name: 'Uber: Geometry Symmetry (≥ 0.60)',
    engine: 'UBER',
    description: 'Distance to SL / Distance to TP >= 0.60',
  },

  // META ENGINE RULES
  {
    id: 'meta_micro_momentum',
    name: 'Meta: Micro-Momentum Alignment',
    engine: 'META',
    description: 'BUY_STOP entered above EMA20; SELL_STOP entered below SMA9',
  },
  {
    id: 'meta_imminent_crossover',
    name: 'Meta: Imminent Crossover (≤ 10 bars)',
    engine: 'META',
    description: 'Crossover is ending/flipping in trade direction within <= 10 candles',
  },
  {
    id: 'meta_instrument_class',
    name: 'Meta: Cash Equities Segment',
    engine: 'META',
    description: 'Prioritize Cash Equities (NSE_EQ) over futures for fast breakout',
  },

  // ULTRA ENGINE RULES
  {
    id: 'ultra_macro_trend',
    name: 'Ultra: Macro Trend Alignment',
    engine: 'ULTRA',
    description: 'BUY_STOP in BULLISH crossover; SELL_STOP in BEARISH crossover',
  },
  {
    id: 'ultra_threshold_confluence',
    name: 'Ultra: Threshold Confluence (≥ 2 tiers)',
    engine: 'ULTRA',
    description: '>= 2 threshold tiers firing simultaneously or in 5m cluster',
  },
  {
    id: 'ultra_segment_advantage',
    name: 'Ultra: Cash Equities Advantage (94.1% M2)',
    engine: 'ULTRA',
    description: 'Cash Equities (NSE_EQ) with 94.1% historical M2 completion',
  },
];

/**
 * Enhanced Filter Engine Service
 * Implements historical observation criteria across UBER, META, and ULTRA engines
 */
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
   * Matches an analysis against rule combination and score range filters
   */
  static matchesEnhancedFilters(
    analysis: TradeMilestoneAnalysis,
    selectedRuleIds: string[],
    ruleMatchMode: 'ALL' | 'ANY',
    minScore: number = 0,
    maxScore: number = 100,
    allTradesOrAnalyses?: (TradeSignal | TradeMilestoneAnalysis)[]
  ): boolean {
    const evalResult = this.evaluate(analysis, allTradesOrAnalyses);

    // Score range filter check
    if (evalResult.score < minScore || evalResult.score > maxScore) {
      return false;
    }

    // Rules filter check
    if (selectedRuleIds.length === 0) {
      return true;
    }

    const achievedRuleIds = new Set(
      evalResult.rules.filter((r) => r.achieved).map((r) => r.id)
    );

    if (ruleMatchMode === 'ALL') {
      return selectedRuleIds.every((id) => achievedRuleIds.has(id));
    } else {
      return selectedRuleIds.some((id) => achievedRuleIds.has(id));
    }
  }

  /**
   * Parse IST time (hours, minutes) from millisecond timestamp
   */
  static getISTTime(ts: number): { hours: number; minutes: number; timeStr: string } {
    const istStr = UpstoxApiService.toISTString(ts);
    // Format: "Thu, 29 Oct 2026 10:45:22 IST"
    const match = istStr.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return {
        hours: parseInt(match[1], 10),
        minutes: parseInt(match[2], 10),
        timeStr: `${match[1]}:${match[2]} IST`,
      };
    }
    const d = new Date(ts);
    return {
      hours: d.getUTCHours(),
      minutes: d.getUTCMinutes(),
      timeStr: `${d.getUTCHours()}:${d.getUTCMinutes()}`,
    };
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
    const { trade, entryIndicators, milestone1, milestone2, drawdown } = analysis;
    const engineType = this.getEngineType(trade.version);
    const isBuy = trade.type === 'BUY_STOP' || trade.type === 'BUY';
    const isNseEq = trade.instrument.startsWith('NSE_EQ') || trade.instrument.includes('_EQ');
    const isNseFo = trade.instrument.startsWith('NSE_FO') || trade.instrument.includes('_FO');
    const { hours, minutes, timeStr } = this.getISTTime(trade.timestamp);
    const totalMinutes = hours * 60 + minutes;

    const rules: RuleEvaluation[] = [];

    // Helper distances
    const distToSL = Math.abs(trade.entry - trade.sl) || 0.001;
    const distToTP = Math.abs(trade.entry - trade.tp) || 0.001;
    const symmetry = distToSL / distToTP;

    // MA Compression: |SMA Fast - EMA 20| / Entry <= 0.04% (0.0004)
    let maCompressionRatio = 0;
    if (entryIndicators && trade.entry > 0) {
      maCompressionRatio = Math.abs(entryIndicators.smaFast - entryIndicators.ema20) / trade.entry;
    }

    if (engineType === 'UBER') {
      // =========================================================================
      // A. UBER ENGINE (expected_target: SL) — Mean Reversion Scalp
      // =========================================================================

      // Rule 1: Inverted Alignment (SELL_STOP only in BULLISH crossover; BUY_STOP only in BEARISH crossover)
      const crossoverState = entryIndicators?.crossoverState;
      const invertedAlignment =
        (!isBuy && crossoverState === 'BULLISH') || (isBuy && crossoverState === 'BEARISH');
      rules.push({
        id: 'uber_inverted_alignment',
        name: 'Inverted Alignment',
        achieved: Boolean(invertedAlignment),
        scoreContribution: invertedAlignment ? 25 : 0,
        maxScore: 25,
        description: 'SELL_STOP in BULLISH crossover; BUY_STOP in BEARISH crossover (Mean Reversion)',
        detail: crossoverState
          ? `${trade.type} with ${crossoverState} crossover (${invertedAlignment ? 'Inverted ✓' : 'Direct Alignment ✗'})`
          : 'Awaiting Crossover Data',
      });

      // Rule 2: Timing Window: 09:35 to 13:00 IST (Reject after 14:00 IST)
      // 09:35 is 9 * 60 + 35 = 575; 13:00 is 13 * 60 = 780; 14:00 is 840
      const inOptimalWindow = totalMinutes >= 575 && totalMinutes <= 780;
      const isLateSession = totalMinutes > 840;
      const timingScore = inOptimalWindow ? 25 : totalMinutes <= 840 && totalMinutes > 780 ? 12 : 0;
      rules.push({
        id: 'uber_timing_window',
        name: 'Timing Window',
        achieved: inOptimalWindow,
        scoreContribution: timingScore,
        maxScore: 25,
        description: 'Execute between 09:35 and 13:00 IST (Reject after 14:00 IST)',
        detail: inOptimalWindow
          ? `${timeStr} (Optimal morning window)`
          : isLateSession
          ? `${timeStr} (Rejected: after 14:00 IST)`
          : `${timeStr} (Outside optimal window)`,
      });

      // Rule 3: MA Compression (|SMA Fast - EMA 20| / Entry <= 0.04%)
      const compressionAchieved = Boolean(entryIndicators && maCompressionRatio <= 0.0004);
      rules.push({
        id: 'uber_ma_compression',
        name: 'MA Compression (<= 0.04%)',
        achieved: compressionAchieved,
        scoreContribution: compressionAchieved ? 25 : 0,
        maxScore: 25,
        description: '|SMA Fast - EMA 20| / Entry <= 0.04%',
        detail: entryIndicators
          ? `${(maCompressionRatio * 100).toFixed(3)}% (Threshold: 0.040%)`
          : 'Pending Entry MA indicators',
      });

      // Rule 4: Geometry Symmetry (Distance to SL / Distance to TP >= 0.60)
      const symmetryAchieved = symmetry >= 0.60;
      rules.push({
        id: 'uber_geometry_symmetry',
        name: 'Geometry Symmetry (>= 0.60)',
        achieved: symmetryAchieved,
        scoreContribution: symmetryAchieved ? 25 : 0,
        maxScore: 25,
        description: 'Distance to SL / Distance to TP >= 0.60',
        detail: `Ratio: ${symmetry.toFixed(2)} (SL: ${distToSL.toFixed(1)} / TP: ${distToTP.toFixed(1)})`,
      });

      // M1 Loss Management Note
      let lossAdvice =
        'If M1 hits TP (loss): hold if loss before return < 2.0x (60.7% reverse to M2). Kill if loss exceeds 2.0x without touching entry.';
      if (milestone1 && milestone1.type === 'TP') {
        // Adverse hit
        if (drawdown.lossMultipleBeforeEntryReturn >= 2.0 && drawdown.entryCrossCount === 0) {
          lossAdvice = '⚠️ KILL SIGNAL: Loss exceeded 2.0x without touching entry! Cut position immediately.';
        } else if (drawdown.lossMultipleBeforeEntryReturn < 2.0) {
          lossAdvice = '✓ HOLD: Adverse excursion < 2.0x. 60.7% historical probability of reversal towards M2 (SL).';
        }
      }

      const totalScore = Math.min(100, rules.reduce((acc, r) => acc + r.scoreContribution, 0));

      return {
        engineType: 'UBER',
        engineName: 'Uber Engine (Mean Reversion Scalp)',
        expectedTarget: 'SL',
        targetPhilosophy: 'Profits on mean reversion back to moving averages.',
        benchmarkHistoricalWinRate: 86.7,
        score: totalScore,
        isHighConfluence: totalScore >= 85,
        rules,
        achievedTags: rules.filter((r) => r.achieved).map((r) => `✓ ${r.name}`),
        missedTags: rules.filter((r) => !r.achieved).map((r) => `✗ ${r.name}`),
        guidance: {
          tradeType: 'Counter-Trend / Mean Reversion',
          optimalHoldWin: '4 to 10 minutes (5–12 candles)',
          maxHoldWin: '15 minutes (Hard Exit)',
          optimalHoldLoss: 'Max 3–5 minutes (cut if > 2.0x)',
          targetProfitMultiple: 'Book at 3.0x to 5.0x',
          maxDrawdownAllowed: '2.0x stop distance',
          primaryCloseIndicator: 'Candle Count >= 15 OR profit_before_return == 0',
          lossManagementRule:
            'If M1 hits TP (loss), hold if loss before return < 2.0x (60.7% reverse to M2). Kill if loss exceeds 2.0x without touching entry.',
          liveStatusAdvice: lossAdvice,
        },
      };
    } else if (engineType === 'META') {
      // =========================================================================
      // B. META ENGINE (expected_target: TP) — Fast Momentum Breakout
      // =========================================================================

      // Rule 1: Micro-Momentum Alignment (SELL_STOP entered below SMA9; BUY_STOP entered above EMA20)
      let microMomentum = false;
      if (entryIndicators) {
        if (isBuy) {
          microMomentum = trade.entry >= entryIndicators.ema20;
        } else {
          microMomentum = trade.entry <= entryIndicators.smaFast;
        }
      }
      rules.push({
        id: 'meta_micro_momentum',
        name: 'Micro-Momentum Alignment',
        achieved: microMomentum,
        scoreContribution: microMomentum ? 30 : 0,
        maxScore: 30,
        description: 'BUY_STOP above EMA20; SELL_STOP below SMA9',
        detail: entryIndicators
          ? isBuy
            ? `Entry ${trade.entry.toFixed(1)} ${microMomentum ? '>=' : '<'} EMA20 ${entryIndicators.ema20.toFixed(1)}`
            : `Entry ${trade.entry.toFixed(1)} ${microMomentum ? '<=' : '>'} SMA9 ${entryIndicators.smaFast.toFixed(1)}`
          : 'Pending Entry MAs',
      });

      // Rule 2: Imminent Crossover State (crossover ending within <= 10 candles)
      const crossoverEnded = entryIndicators?.crossoverEndedInCandles;
      const imminentCrossover = crossoverEnded !== null && crossoverEnded !== undefined && crossoverEnded <= 10;
      rules.push({
        id: 'meta_imminent_crossover',
        name: 'Imminent Crossover (<= 10 bars)',
        achieved: Boolean(imminentCrossover),
        scoreContribution: imminentCrossover ? 35 : 0,
        maxScore: 35,
        description: 'Crossover is flipping in trade direction within <= 10 candles',
        detail:
          crossoverEnded !== null && crossoverEnded !== undefined
            ? `Crossover ends/flips in ${crossoverEnded} candles`
            : 'Crossover persistent or not flipping',
      });

      // Rule 3: Instrument Class (Prioritize Cash Equities NSE_EQ over futures)
      rules.push({
        id: 'meta_instrument_class',
        name: 'Segment: Cash Equities (NSE_EQ)',
        achieved: isNseEq,
        scoreContribution: isNseEq ? 35 : 15,
        maxScore: 35,
        description: 'Prioritize Cash Equities (NSE_EQ) over futures for fast clean breakouts',
        detail: isNseEq ? 'Cash Equities (NSE_EQ) ✓' : `${trade.instrument.split('|')[0] || 'Futures'} (Sub-optimal)`,
      });

      // M1 Loss Management Note
      let lossAdvice =
        'If M1 hits SL (loss), cut immediately at market. 71.4% of M1 losses are permanent traps that produce 5x–11x drawdowns.';
      if (milestone1 && milestone1.type === 'SL') {
        lossAdvice = '🚨 IMMEDIATE CUT TRIGGERED: M1 hit SL! Cut immediately (71.4% permanent trap risk).';
      }

      const totalScore = Math.min(100, rules.reduce((acc, r) => acc + r.scoreContribution, 0));

      return {
        engineType: 'META',
        engineName: 'Meta Engine (Fast Momentum Breakout)',
        expectedTarget: 'TP',
        targetPhilosophy: 'Profits on rapid momentum acceleration.',
        benchmarkHistoricalWinRate: 85.7,
        score: totalScore,
        isHighConfluence: totalScore >= 85,
        rules,
        achievedTags: rules.filter((r) => r.achieved).map((r) => `✓ ${r.name}`),
        missedTags: rules.filter((r) => !r.achieved).map((r) => `✗ ${r.name}`),
        guidance: {
          tradeType: 'Rapid Momentum Breakout',
          optimalHoldWin: '25 to 50 minutes (25–52 candles)',
          maxHoldWin: '60 minutes (or trail at +1.5x)',
          optimalHoldLoss: '0 to 3 minutes (Cut instantly)',
          targetProfitMultiple: 'Trail after 1.5x (Ride to 10x)',
          maxDrawdownAllowed: '1.0x stop distance',
          primaryCloseIndicator: 'm1_hit_type == SL (Instant) OR Crossover un-flipped at #10',
          lossManagementRule:
            'If M1 hits SL (loss), cut immediately at market. 71.4% of M1 losses are permanent traps that produce 5x–11x drawdowns.',
          liveStatusAdvice: lossAdvice,
        },
      };
    } else {
      // =========================================================================
      // C. ULTRA ENGINE (expected_target: TP) — Multi-Tier Institutional Flow
      // =========================================================================

      // Rule 1: Macro Trend Alignment (BUY_STOP in BULLISH crossover; SELL_STOP in BEARISH crossover)
      const crossoverState = entryIndicators?.crossoverState;
      const macroTrendAlignment =
        (isBuy && crossoverState === 'BULLISH') || (!isBuy && crossoverState === 'BEARISH');
      rules.push({
        id: 'ultra_macro_trend',
        name: 'Macro Trend Alignment',
        achieved: Boolean(macroTrendAlignment),
        scoreContribution: macroTrendAlignment ? 30 : 0,
        maxScore: 30,
        description: 'BUY_STOP in BULLISH crossover; SELL_STOP in BEARISH crossover',
        detail: crossoverState
          ? `${trade.type} aligned with ${crossoverState} crossover (${macroTrendAlignment ? 'Trend Follow ✓' : 'Counter Trend ✗'})`
          : 'Pending Crossover Data',
      });

      // Rule 2: Threshold Confluence (>= 2 threshold tiers fire simultaneously or within 5-min cluster)
      let multiTierConfluence = false;
      let clusterCount = 1;
      if (allTradesInBatch && allTradesInBatch.length > 0) {
        // Find sibling trades within 5 minutes for same instrument
        const siblings = allTradesInBatch.filter(
          (t) =>
            t.instrument === trade.instrument &&
            Math.abs(t.timestamp - trade.timestamp) <= 300_000
        );
        clusterCount = siblings.length;
        multiTierConfluence = clusterCount >= 2;
      } else {
        // Check confidence / threshold indicators on trade object
        multiTierConfluence = (trade.confidence && trade.confidence >= 0.5) || trade.threshold >= 2;
      }

      rules.push({
        id: 'ultra_threshold_confluence',
        name: 'Threshold Confluence (>= 2 tiers)',
        achieved: multiTierConfluence,
        scoreContribution: multiTierConfluence ? 30 : 0,
        maxScore: 30,
        description: 'Only take signals where >= 2 threshold tiers fire simultaneously',
        detail: multiTierConfluence
          ? `Multi-tier confluence detected (${clusterCount} sibling signals in cluster)`
          : `Single-tier signal (${clusterCount} signal)`,
      });

      // Rule 3: Segment Advantage (In Cash Equities NSE_EQ, 94.1% M2 completion rate)
      rules.push({
        id: 'ultra_segment_advantage',
        name: isNseEq ? 'Segment: Cash Equities (94.1% M2)' : 'Segment: Futures (NSE_FO)',
        achieved: isNseEq,
        scoreContribution: isNseEq ? 40 : 25,
        maxScore: 40,
        description: 'In Cash Equities (NSE_EQ), trades have 94.1% M2 completion rate',
        detail: isNseEq
          ? 'NSE_EQ Cash Segment (Highest institutional flow completion)'
          : 'NSE_FO Futures Segment (Recovery management applied)',
      });

      // M1 Loss Management Note
      let lossAdvice =
        'If in NSE_EQ: Do not cut on SL; let cycle to M2 TP. If in NSE_FO: Wait for exhaustion at 2.5x–3.5x loss and re-cross entry (entry_cross_count >= 1). If entry_cross_count == 0 past 2.0x, cut immediately.';
      if (milestone1 && milestone1.type === 'SL') {
        if (isNseEq) {
          lossAdvice = '✓ NSE_EQ HOLD: Do not cut on SL; 94.1% cycle to M2 TP follow-through.';
        } else {
          if (drawdown.entryCrossCount >= 1) {
            lossAdvice = `✓ NSE_FO RECOVERY ACTIVE: Price re-crossed entry ${drawdown.entryCrossCount}x. Ride M2 recovery!`;
          } else if (drawdown.maxLossMultiple > 2.0 && drawdown.entryCrossCount === 0) {
            lossAdvice = '⚠️ NSE_FO CUT TRIGGERED: Loss exceeded 2.0x with zero entry re-crosses. Cut immediately.';
          } else {
            lossAdvice = '⏳ NSE_FO EXHAUSTION WATCH: Monitoring for 2.5x-3.5x exhaustion and entry re-cross.';
          }
        }
      }

      const totalScore = Math.min(100, rules.reduce((acc, r) => acc + r.scoreContribution, 0));

      return {
        engineType: 'ULTRA',
        engineName: 'Ultra Engine (Institutional Flow)',
        expectedTarget: 'TP',
        targetPhilosophy: 'Profits on multi-tier volume liquidity sweeps.',
        benchmarkHistoricalWinRate: 88.0,
        score: totalScore,
        isHighConfluence: totalScore >= 85,
        rules,
        achievedTags: rules.filter((r) => r.achieved).map((r) => `✓ ${r.name}`),
        missedTags: rules.filter((r) => !r.achieved).map((r) => `✗ ${r.name}`),
        guidance: {
          tradeType: 'Multi-Tier Institutional Flow',
          optimalHoldWin: '15 to 45 minutes (18–50 candles)',
          maxHoldWin: '90 minutes (or 14:15 IST EOD)',
          optimalHoldLoss: '25 to 45 minutes (for recovery)',
          targetProfitMultiple: 'Book at 1.5x to 2.5x',
          maxDrawdownAllowed: isNseEq ? '3.5x (Cash)' : '2.0x (Futures)',
          primaryCloseIndicator: 'entry_cross_count == 0 at #5 OR Session time > 14:15 IST',
          lossManagementRule:
            'If in NSE_EQ: Do not cut on SL; let it cycle to M2 TP. If in NSE_FO: Wait for price to exhaust at 2.5x–3.5x loss and re-cross entry (entry_cross_count >= 1). If entry_cross_count == 0 past 2.0x, cut immediately.',
          liveStatusAdvice: lossAdvice,
        },
      };
    }
  }

  /**
   * Compute aggregated analytics comparing trades with Score >= 85% against the entire baseline
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
