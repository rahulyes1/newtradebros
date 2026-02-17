import { ChevronUp, Edit2, Trash2 } from 'lucide-react';
import type { Trade } from '../../../shared/types/trade';
import { getRemainingQuantity, roundTo2 } from '../../../shared/services/tradeMath';

interface TradeCardExpandedProps {
  trade: Trade;
  portfolioValue: number;
  formatCurrency: (value: number) => string;
  formatTradeDate: (dateIso: string) => string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManage?: () => void;
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

export default function TradeCardExpanded({
  trade,
  portfolioValue,
  formatCurrency,
  formatTradeDate,
  onToggle,
  onEdit,
  onDelete,
  onManage,
}: TradeCardExpandedProps) {
  const remainingQty = getRemainingQuantity(trade);
  const baseQty = remainingQty > 0 ? remainingQty : trade.quantity;
  const entryValue = roundTo2(trade.entryPrice * baseQty);
  const referencePrice = trade.markPrice ?? trade.entryPrice;
  const positionValue = roundTo2(referencePrice * baseQty);
  const positionValuePct = entryValue > 0 ? roundTo2((positionValue / entryValue) * 100) : 100;
  const positionContext = positionValuePct > 200
    ? 'Strong move'
    : positionValuePct < 50
      ? 'Significant drawdown'
      : 'Within expected range';

  const statusText = trade.status === 'open'
    ? remainingQty < trade.quantity
      ? 'PARTIAL'
      : 'OPEN'
    : null;
  const statusClass = statusText === 'PARTIAL' ? 'text-[color:#fb923c]' : 'text-[color:#facc15]';

  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold">{trade.symbol}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sideBadgeClass(trade.direction)}`}>
              {trade.direction.toUpperCase()}
            </span>
            {statusText ? <span className={`text-[10px] font-semibold ${statusClass}`}>o {statusText}</span> : null}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Entry: {formatCurrency(trade.entryPrice)} x {trade.quantity.toFixed(2)} qty
          </p>
          <p className="text-xs text-[var(--muted)]">{formatTradeDate(trade.date)}</p>
        </div>
        <div className="flex items-center gap-1">
          {onManage ? (
            <button
              type="button"
              onClick={onManage}
              className="min-h-11 rounded-full bg-[color:rgba(96,165,250,0.2)] px-3 text-[11px] font-medium text-[var(--accent)]"
            >
              Partial/Close
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
            aria-label={`Edit ${trade.symbol}`}
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--negative)]"
            aria-label={`Delete ${trade.symbol}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      <div className="my-3 border-t border-[var(--border)] pt-3 text-center">
        <p className="text-[11px] uppercase tracking-[0.07em] text-[var(--muted)]">Total P&amp;L</p>
        <p className={`mt-1 text-[28px] font-bold leading-none ${pnlClass(trade.totalPnl)}`}>
          {`${trade.totalPnl >= 0 ? '+' : ''}${formatCurrency(trade.totalPnl)}`}
        </p>
        <p className={`mt-1 text-xl font-semibold ${pnlClass(trade.totalPnl)}`}>{`(${trade.totalPnlPercent.toFixed(2)}%)`}</p>
      </div>

      <div className="my-3 border-t border-[var(--border)] pt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Position Details</p>
        <p className="text-sm">* Position Value: {formatCurrency(positionValue)}</p>
        <p className="text-sm">* Remaining Qty: {remainingQty.toFixed(2)}</p>
        <p className="text-sm">
          * {positionValuePct.toFixed(1)}% of entry value - <span className="text-[var(--muted)]">{positionContext}</span>
        </p>
        {portfolioValue <= 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">Set portfolio value to see position % of portfolio</p>
        ) : null}
      </div>

      <div className="my-3 border-t border-[var(--border)] pt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Exit History</p>
        <p className="text-sm">
          * Realized: {`${trade.realizedPnl >= 0 ? '+' : ''}${formatCurrency(trade.realizedPnl)}`} ({trade.exitLegs.length} exits)
        </p>
        <p className="text-sm">
          * Unrealized: {`${trade.unrealizedPnl >= 0 ? '+' : ''}${formatCurrency(trade.unrealizedPnl)}`} ({remainingQty.toFixed(2)} qty open)
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-label={`Collapse trade details for ${trade.symbol}`}
        className="mt-2 flex min-h-11 items-center gap-1 text-sm text-[var(--muted)] transition hover:text-[var(--text)]"
      >
        Collapse <ChevronUp size={13} />
      </button>
    </div>
  );
}
