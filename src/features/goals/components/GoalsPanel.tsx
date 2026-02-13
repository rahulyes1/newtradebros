import { useMemo, useState } from 'react';
import type { Goal, GoalProgress, GoalType } from '../../../shared/types/goal';

interface GoalsPanelProps {
  period: string;
  goals: Goal[];
  progress: GoalProgress[];
  formatCurrency: (value: number) => string;
  onSaveGoal: (type: GoalType, target: number) => void;
  onDeleteGoal: (goalId: string) => void;
}

const GOAL_LABELS: Record<GoalType, string> = {
  monthly_pnl: 'Monthly P&L',
  monthly_win_rate: 'Monthly Win Rate (%)',
  monthly_trade_count: 'Monthly Trade Count',
};

function statusClass(status: GoalProgress['status']): string {
  if (status === 'achieved') {
    return 'text-[var(--positive)]';
  }
  if (status === 'at_risk') {
    return 'text-[var(--negative)]';
  }
  return 'text-[var(--accent)]';
}

function formatGoalValue(type: GoalType, value: number, formatCurrency: (amount: number) => string): string {
  if (type === 'monthly_pnl') {
    return formatCurrency(value);
  }
  if (type === 'monthly_win_rate') {
    return `${value.toFixed(1)}%`;
  }
  return `${value.toFixed(0)}`;
}

export default function GoalsPanel({ period, goals, progress, formatCurrency, onSaveGoal, onDeleteGoal }: GoalsPanelProps) {
  const [targets, setTargets] = useState<Partial<Record<GoalType, string>>>({});
  const savedTargets = useMemo(() => {
    const next: Partial<Record<GoalType, string>> = {};
    goals.forEach((goal) => {
      next[goal.type] = String(goal.target);
    });
    return next;
  }, [goals]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)]">
        <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Goals for {period}</h3>
        <p className="text-sm text-[var(--muted)]">Set targets for realized performance and track provisional progress with unrealized P&L.</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {(Object.keys(GOAL_LABELS) as GoalType[]).map((type) => (
            <div key={type} className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
              <label className="ui-label block">{GOAL_LABELS[type]}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targets[type] ?? savedTargets[type] ?? ''}
                onChange={(event) => setTargets((prev) => ({ ...prev, [type]: event.target.value }))}
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                placeholder="Set target"
              />
              <button
                type="button"
                onClick={() => {
                  const rawValue = targets[type] ?? savedTargets[type] ?? '';
                  const target = Number.parseFloat(rawValue);
                  if (!Number.isFinite(target) || target < 0) {
                    alert('Target must be zero or higher.');
                    return;
                  }
                  onSaveGoal(type, target);
                }}
                className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black transition hover:brightness-110"
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {progress.map((item) => (
          <div key={item.goal.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[var(--text)]">{GOAL_LABELS[item.goal.type]}</h4>
              <button
                type="button"
                onClick={() => onDeleteGoal(item.goal.id)}
                className="text-xs text-[var(--muted)] transition hover:text-[var(--negative)]"
              >
                Delete
              </button>
            </div>
            <p className="text-sm text-[var(--muted)]">Target: {formatGoalValue(item.goal.type, item.goal.target, formatCurrency)}</p>
            <p className="mt-1 text-sm text-[var(--text)]">Realized: {formatGoalValue(item.goal.type, item.current, formatCurrency)}</p>
            <p className="text-sm text-[var(--text)]">With Unrealized: {formatGoalValue(item.goal.type, item.currentWithUnrealized, formatCurrency)}</p>

            <div className="mt-3 space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="ui-label">Realized</span>
                  <span className={statusClass(item.status)}>{item.progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${item.progressPercent}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="ui-label">Provisional</span>
                  <span className={statusClass(item.statusWithUnrealized)}>{item.progressPercentWithUnrealized.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--positive)]" style={{ width: `${item.progressPercentWithUnrealized}%` }} />
                </div>
              </div>
            </div>
          </div>
        ))}

        {progress.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            No goals set for this month yet.
          </div>
        )}
      </div>
    </div>
  );
}
