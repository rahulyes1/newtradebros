import type { CurrencyCode } from '../../../shared/config/tradingOptions';

interface TodayPerformanceCardProps {
  todayPnl: number;
  todayPnlPercent: number | null;
  openPositions: number;
  currency: CurrencyCode;
  compactPortfolioValue: string;
  formatCurrency: (value: number) => string;
  contextText: string;
  contextClassName?: string;
}

function pnlClass(value: number): string {
  if (value > 0) {
    return 'text-[var(--positive)]';
  }
  if (value < 0) {
    return 'text-[var(--negative)]';
  }
  return 'text-[var(--text)]';
}

export default function TodayPerformanceCard({
  todayPnl,
  todayPnlPercent,
  openPositions,
  currency,
  compactPortfolioValue,
  formatCurrency,
  contextText,
  contextClassName,
}: TodayPerformanceCardProps) {
  const pnlTone = pnlClass(todayPnl);
  const signedPnl = `${todayPnl >= 0 ? '+' : ''}${formatCurrency(todayPnl)}`;
  const pctText = todayPnlPercent == null
    ? '--'
    : `${todayPnlPercent >= 0 ? '+' : ''}${todayPnlPercent.toFixed(1)}%`;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[linear-gradient(140deg,rgba(56,189,248,0.12),rgba(18,27,46,0.95)_55%,rgba(31,45,68,0.92))] p-4 shadow-[var(--shadow-card)]">
      <p className="text-sm text-[var(--muted)]">Today's P&amp;L</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <p className={`text-[32px] font-bold leading-none ${pnlTone}`}>{signedPnl}</p>
        <p className={`text-2xl font-semibold leading-none ${pnlTone}`}>({pctText})</p>
      </div>
      <p className="mt-3 text-[13px] text-[var(--muted)]">
        {openPositions} open position{openPositions === 1 ? '' : 's'} | Portfolio: {compactPortfolioValue} ({currency})
      </p>
      <p className={`mt-1 text-[13px] ${contextClassName ?? 'text-[var(--muted)]'}`}>{contextText}</p>
    </section>
  );
}
