import { ChevronDown } from 'lucide-react';
import type { Trade } from '../../../shared/types/trade';
import { getRemainingQuantity } from '../../../shared/services/tradeMath';

interface TradeCardCollapsedProps {
  trade: Trade;
  formatCurrency: (value: number) => string;
  priceChangeText?: string;
  priceChangeClassName?: string;
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

export default function TradeCardCollapsed({
  trade,
  formatCurrency,
  priceChangeText,
  priceChangeClassName,
  onToggle,
}: TradeCardCollapsedProps) {
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
          <p className="text-secondary leading-none">{trade.symbol}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sideBadgeClass(trade.direction)}`}>
            {trade.direction.toUpperCase()}
          </span>
          {status ? <span className={`text-[10px] font-semibold ${status.className}`}>o {status.label}</span> : null}
        </div>
        <p className="text-tertiary mt-1 text-numeric">
          {formatCurrency(trade.entryPrice)} x {trade.quantity.toFixed(2)}
        </p>
        {trade.markPrice != null ? (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-tertiary-sm text-numeric">Mark: {formatCurrency(trade.markPrice)}</span>
            <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">~15min delay</span>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-primary-sm text-numeric leading-none ${pnlClass(trade.totalPnl)}`}>
          {`${trade.totalPnl >= 0 ? '+' : ''}${formatCurrency(trade.totalPnl)}`}
        </p>
        <p className={`text-tertiary-sm text-numeric ${pnlClass(trade.totalPnl)}`}>{`(${trade.totalPnlPercent.toFixed(2)}%)`}</p>
        {priceChangeText ? <p className={`text-tertiary-sm text-numeric ${priceChangeClassName ?? ''}`}>{priceChangeText}</p> : null}
        <p className="text-tertiary-sm mt-1 flex items-center justify-end gap-1">
          Tap for details <ChevronDown size={12} />
        </p>
      </div>
    </button>
  );
}
