import { ChevronRight } from 'lucide-react';
import type { Trade } from '../../../shared/types/trade';

interface RecentTradesPreviewProps {
  trades: Trade[];
  formatCurrency: (value: number) => string;
  onSelectTrade: (tradeId: string) => void;
  onViewAllTrades: () => void;
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

export default function RecentTradesPreview({
  trades,
  formatCurrency,
  onSelectTrade,
  onViewAllTrades,
}: RecentTradesPreviewProps) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Trades</h3>
      </div>
      <div className="space-y-1.5">
        {trades.map((trade) => (
          <button
            key={trade.id}
            type="button"
            onClick={() => onSelectTrade(trade.id)}
            className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-left transition hover:border-[var(--accent)]/40"
          >
            <span className="min-w-0">
              <span className="mr-2 text-sm font-semibold">{trade.symbol}</span>
              <span className="text-xs text-[var(--muted)]">{trade.direction.toUpperCase()}</span>
            </span>
            <span className="ml-2 flex items-center gap-2">
              <span className={`text-sm font-semibold ${pnlClass(trade.totalPnl)}`}>
                {`${trade.totalPnl >= 0 ? '+' : ''}${formatCurrency(trade.totalPnl)} (${trade.totalPnlPercent.toFixed(1)}%)`}
              </span>
              <ChevronRight size={14} className="text-[var(--muted)]" />
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onViewAllTrades}
        className="mt-2 text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
      >
        View All Trades -&gt;
      </button>
    </section>
  );
}
