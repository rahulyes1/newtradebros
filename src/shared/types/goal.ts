export type GoalType = 'monthly_pnl' | 'monthly_win_rate' | 'monthly_trade_count';
export type GoalStatus = 'on_track' | 'at_risk' | 'achieved';

export interface Goal {
  id: string;
  type: GoalType;
  period: string;
  target: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  currentWithUnrealized: number;
  status: GoalStatus;
  statusWithUnrealized: GoalStatus;
  progressPercent: number;
  progressPercentWithUnrealized: number;
}
