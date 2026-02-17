import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondary?: ReactNode;
}

export default function EmptyState({ icon, title, description, action, secondary }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-12 text-center">
      <div className="mb-4 text-[var(--accent)]">{icon}</div>
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="mb-6 max-w-md text-sm text-[var(--muted)]">{description}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black"
        >
          {action.label}
        </button>
      ) : null}
      {secondary ? <div className="mt-4">{secondary}</div> : null}
    </div>
  );
}

