import type { Goal, GoalType } from '../../../shared/types/goal';

const STORAGE_KEY = 'goals';

export interface GoalRepository {
  listGoals(): Goal[];
  upsertGoal(input: { type: GoalType; period: string; target: number }): Goal[];
  deleteGoal(goalId: string): Goal[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeGoal(raw: unknown): Goal | null {
  if (!isObject(raw) || typeof raw.id !== 'string') {
    return null;
  }
  if (raw.type !== 'monthly_pnl' && raw.type !== 'monthly_win_rate' && raw.type !== 'monthly_trade_count') {
    return null;
  }
  if (typeof raw.period !== 'string') {
    return null;
  }

  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso();
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt;

  return {
    id: raw.id,
    type: raw.type,
    period: raw.period,
    target: toNumber(raw.target),
    createdAt,
    updatedAt,
  };
}

export class LocalGoalRepository implements GoalRepository {
  private save(goals: Goal[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }

  listGoals(): Goal[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const goals = parsed.map(normalizeGoal).filter((goal): goal is Goal => goal !== null);
      this.save(goals);
      return goals;
    } catch {
      return [];
    }
  }

  upsertGoal(input: { type: GoalType; period: string; target: number }): Goal[] {
    const goals = this.listGoals();
    const now = nowIso();
    const existing = goals.find((goal) => goal.type === input.type && goal.period === input.period);
    let next: Goal[];

    if (existing) {
      next = goals.map((goal) =>
        goal.id === existing.id
          ? {
              ...goal,
              target: input.target,
              updatedAt: now,
            }
          : goal
      );
    } else {
      next = [
        ...goals,
        {
          id: randomId('goal'),
          type: input.type,
          period: input.period,
          target: input.target,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }

    this.save(next);
    return next;
  }

  deleteGoal(goalId: string): Goal[] {
    const goals = this.listGoals();
    const next = goals.filter((goal) => goal.id !== goalId);
    this.save(next);
    return next;
  }
}
