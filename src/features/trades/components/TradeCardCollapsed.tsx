import { ChevronDown } from 'lucide-react';
import type { Trade } from '../../../shared/types/trade';
import { getRemainingQuantity } from '../../../shared/services/tradeMath';

interface TradeCardCollapsedProps {
  trade: Trade;
  formatCurrency: (value: number) => string;
  onToggle: () => void;
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

function sideBadgeClass(direction: Trade['direction']): string {
  return direction === 'long'
    ? 'bg-[color:rgba(52,211,153,0.16)] text-[var(--positive)]'
    : 'bg-[color:rgba(248,113,113,0.16)] text-[var(--negative)]';
}

function statusBadge(trade: Trade): { label: string; className: string } | null {
  if (trade.status !== 'open') {
    return null;
  }
  const remainingQty = getRemainingQuantity(trade);
  if (remainingQty < trade.quantity) {
    return { label: 'PARTIAL', className: 'text-[color:#fb923c]' };
  }
  return { label: 'OPEN', className: 'text-[color:#facc15]' };
}

export default function TradeCardCollapsed({ trade, formatCurrency, onToggle }: TradeCardCollapsedProps) {
  const status = statusBadge(trade);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Expand trade details for ${trade.symbol}`}
      className="group flex min-h-[60px] w-full items-center justify-between gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-left transition hover:scale-[1.02] active:scale-[0.99]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold leading-none">{trade.symbol}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sideBadgeClass(trade.direction)}`}>
            {trade.direction.toUpperCase()}
          </span>
          {status ? <span className={`text-[10px] font-semibold ${status.className}`}>o {status.label}</span> : null}
        </div>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          {formatCurrency(trade.entryPrice)} x {trade.quantity.toFixed(2)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xl font-bold leading-none ${pnlClass(trade.totalPnl)}`}>
          {`${trade.totalPnl >= 0 ? '+' : ''}${formatCurrency(trade.totalPnl)}`}
        </p>
        <p className={`mt-1 text-xs ${pnlClass(trade.totalPnl)}`}>{`(${trade.totalPnlPercent.toFixed(2)}%)`}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[var(--muted)]">
          Tap for details <ChevronDown size={12} />
        </p>
      </div>
    </button>
  );
}
