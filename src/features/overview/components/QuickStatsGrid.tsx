interface QuickStatsItem {
  label: string;
  value: string;
  valueClassName?: string;
  subValue: string;
  subValueClassName?: string;
}

interface QuickStatsGridProps {
  items: QuickStatsItem[];
}

function QuickStatCard({ item }: { item: QuickStatsItem }) {
  return (
    <article
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label={`${item.label}: ${item.value}. ${item.subValue}`}
    >
      <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--muted)]">{item.label}</p>
      <p className={`mt-1 text-base font-semibold ${item.valueClassName ?? 'text-[var(--text)]'}`}>{item.value}</p>
      <p className={`mt-0.5 text-xs leading-[1.4] ${item.subValueClassName ?? 'text-[var(--muted)]'}`}>{item.subValue}</p>
    </article>
  );
}

export default function QuickStatsGrid({ items }: QuickStatsGridProps) {
  return (
    <section className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <QuickStatCard key={item.label} item={item} />
      ))}
    </section>
  );
}
