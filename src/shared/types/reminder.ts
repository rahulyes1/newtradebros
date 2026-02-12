export type ReminderKind = 'weekly_review' | 'month_end_goal_check';

export interface Reminder {
  id: ReminderKind;
  kind: ReminderKind;
  title: string;
  description: string;
  dueAt: string;
  isOverdue: boolean;
}
