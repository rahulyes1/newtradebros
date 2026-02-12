import type { Goal, GoalProgress, GoalStatus } from '../../../shared/types/goal';
import type { Trade } from '../../../shared/types/trade';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function statusFor(goalType: Goal['type'], current: number, target: number): GoalStatus {
  if (target === 0) {
    return 'on_track';
  }

  if (goalType === 'monthly_win_rate') {
    if (current >= target) {
      return 'achieved';
    }
    return current >= target * 0.7 ? 'on_track' : 'at_risk';
  }

  if (current >= target) {
    return 'achieved';
  }
  return current >= target * 0.7 ? 'on_track' : 'at_risk';
}

function inPeriod(date: string, period: string): boolean {
  return date.slice(0, 7) === period;
}

export function getGoalProgress(goals: Goal[], trades: Trade[]): GoalProgress[] {
  return goals.map((goal) => {
    const periodTrades = trades.filter((trade) => inPeriod(trade.date, goal.period));
    const closedTrades = periodTrades.filter((trade) => trade.status === 'closed');
    const closedWins = closedTrades.filter((trade) => trade.realizedPnl > 0).length;

    let current = 0;
    let currentWithUnrealized = 0;

    if (goal.type === 'monthly_pnl') {
      current = closedTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
      currentWithUnrealized = periodTrades.reduce((sum, trade) => sum + trade.totalPnl, 0);
    } else if (goal.type === 'monthly_trade_count') {
      current = closedTrades.length;
      currentWithUnrealized = periodTrades.length;
    } else if (goal.type === 'monthly_win_rate') {
      current = closedTrades.length > 0 ? (closedWins / closedTrades.length) * 100 : 0;
      const provisionalWins = periodTrades.filter((trade) => trade.totalPnl > 0).length;
      currentWithUnrealized = periodTrades.length > 0 ? (provisionalWins / periodTrades.length) * 100 : 0;
    }

    const progressPercent = goal.target === 0 ? 0 : clampPercent((current / goal.target) * 100);
    const progressPercentWithUnrealized = goal.target === 0 ? 0 : clampPercent((currentWithUnrealized / goal.target) * 100);

    return {
      goal,
      current,
      currentWithUnrealized,
      status: statusFor(goal.type, current, goal.target),
      statusWithUnrealized: statusFor(goal.type, currentWithUnrealized, goal.target),
      progressPercent,
      progressPercentWithUnrealized,
    };
  });
}
