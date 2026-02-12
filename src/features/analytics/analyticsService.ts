import type { Trade } from '../../shared/types/trade';

export interface GroupPerformance {
  key: string;
  trades: number;
  winRate: number;
  pnl: number;
}

export interface AnalyticsSummary {
  setupPerformance: GroupPerformance[];
  emotionPerformance: GroupPerformance[];
  weekdayPerformance: GroupPerformance[];
  bestSetup?: GroupPerformance;
  worstSetup?: GroupPerformance;
}

function scoreTrade(trade: Trade, includeUnrealized: boolean): number {
  return includeUnrealized ? trade.totalPnl : trade.realizedPnl;
}

function calculateGroupedPerformance(
  trades: Trade[],
  groupBy: (trade: Trade) => string | undefined,
  includeUnrealized: boolean
): GroupPerformance[] {
  const groups = new Map<string, { pnl: number; trades: number; wins: number }>();

  trades.forEach((trade) => {
    const key = groupBy(trade);
    if (!key) {
      return;
    }
    const value = scoreTrade(trade, includeUnrealized);
    const group = groups.get(key) ?? { pnl: 0, trades: 0, wins: 0 };
    group.pnl += value;
    group.trades += 1;
    if (value > 0) {
      group.wins += 1;
    }
    groups.set(key, group);
  });

  return Array.from(groups.entries())
    .map(([key, value]) => ({
      key,
      pnl: Math.round((value.pnl + Number.EPSILON) * 100) / 100,
      trades: value.trades,
      winRate: value.trades > 0 ? (value.wins / value.trades) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayFromIsoDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }
  return WEEK_DAYS[parsed.getDay()];
}

export function buildAnalyticsSummary(trades: Trade[], includeUnrealized = true): AnalyticsSummary {
  const setupPerformance = calculateGroupedPerformance(
    trades,
    (trade) => trade.setup?.trim() || undefined,
    includeUnrealized
  );

  const emotionPerformance = calculateGroupedPerformance(
    trades,
    (trade) => trade.emotion?.trim() || undefined,
    includeUnrealized
  );

  const weekdayRaw = calculateGroupedPerformance(trades, (trade) => weekdayFromIsoDate(trade.date), includeUnrealized);
  const weekdayPerformance = WEEK_DAYS
    .map((day) => weekdayRaw.find((entry) => entry.key === day))
    .filter((entry): entry is GroupPerformance => Boolean(entry));

  const eligibleSetups = setupPerformance.filter((entry) => entry.trades >= 3);

  return {
    setupPerformance,
    emotionPerformance,
    weekdayPerformance,
    bestSetup: eligibleSetups.at(0),
    worstSetup: eligibleSetups.at(-1),
  };
}
