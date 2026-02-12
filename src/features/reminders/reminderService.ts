import type { Reminder, ReminderKind } from '../../shared/types/reminder';

const WEEKLY_REVIEW_KEY = 'reminder.weeklyReview.completedAt';
const MONTH_END_KEY = 'reminder.monthEnd.completedPeriod';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / msPerDay);
}

function getCurrentPeriod(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function createReminder(kind: ReminderKind, title: string, description: string, dueAt: string, now: Date): Reminder {
  const dueDate = new Date(`${dueAt}T00:00:00`);
  const isOverdue = now.getTime() > dueDate.getTime();
  return { id: kind, kind, title, description, dueAt, isOverdue };
}

export function listActiveReminders(now = new Date()): Reminder[] {
  const reminders: Reminder[] = [];

  const completedWeeklyAt = localStorage.getItem(WEEKLY_REVIEW_KEY);
  const weeklyBase = completedWeeklyAt ? new Date(completedWeeklyAt) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const weeklyDue = new Date(weeklyBase);
  weeklyDue.setDate(weeklyDue.getDate() + 7);
  const weeklyDueDate = toIsoDate(weeklyDue);

  if (!completedWeeklyAt || daysBetween(weeklyDue, now) >= 0) {
    reminders.push(
      createReminder(
        'weekly_review',
        'Weekly Journal Review',
        'Review your trades and journal notes for the last 7 days.',
        weeklyDueDate,
        now
      )
    );
  }

  const currentPeriod = getCurrentPeriod(now);
  const completedMonthEndFor = localStorage.getItem(MONTH_END_KEY);
  const monthEndDue = `${currentPeriod}-25`;

  if (now.getDate() >= 25 && completedMonthEndFor !== currentPeriod) {
    reminders.push(
      createReminder(
        'month_end_goal_check',
        'Month-End Goal Check',
        'Review your monthly goals and progress before month close.',
        monthEndDue,
        now
      )
    );
  }

  return reminders;
}

export function completeReminder(kind: ReminderKind, now = new Date()): void {
  if (kind === 'weekly_review') {
    localStorage.setItem(WEEKLY_REVIEW_KEY, now.toISOString());
  }
  if (kind === 'month_end_goal_check') {
    localStorage.setItem(MONTH_END_KEY, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }
}
