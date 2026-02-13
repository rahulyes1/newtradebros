import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AddExitLegInput, Trade } from '../../../shared/types/trade';
import type { CurrencyCode } from '../../../shared/config/tradingOptions';
import { calculateLegPnl, getRemainingQuantity } from '../../../shared/services/tradeMath';

interface CloseTradeModalProps {
  trade: Trade | null;
  currency: CurrencyCode;
  formatCurrency: (value: number) => string;
  onClose: () => void;
  onConfirmExit: (tradeId: string, payload: AddExitLegInput) => void;
  onUpdateMarkPrice: (tradeId: string, markPrice: number | undefined) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '';
  }
  return String(value);
}

export default function CloseTradeModal({
  trade,
  currency,
  formatCurrency,
  onClose,
  onConfirmExit,
  onUpdateMarkPrice,
}: CloseTradeModalProps) {
  const [exitMode, setExitMode] = useState<'partial' | 'full'>('partial');
  const [exitDate, setExitDate] = useState(() => todayIso());
  const [exitPrice, setExitPrice] = useState('');
  const [exitQty, setExitQty] = useState(() => (trade ? formatNumber(getRemainingQuantity(trade)) : ''));
  const [fees, setFees] = useState('');
  const [note, setNote] = useState('');
  const [markPrice, setMarkPrice] = useState(() => (trade ? formatNumber(trade.markPrice) : ''));

  const remainingQty = useMemo(() => (trade ? getRemainingQuantity(trade) : 0), [trade]);
  const parsedExitPrice = Number.parseFloat(exitPrice);
  const parsedExitQty = Number.parseFloat(exitQty);
  const previewPnl = useMemo(() => {
    if (!trade || !Number.isFinite(parsedExitPrice) || parsedExitPrice <= 0 || !Number.isFinite(parsedExitQty) || parsedExitQty <= 0) {
      return undefined;
    }
    return calculateLegPnl(trade.direction, trade.entryPrice, parsedExitPrice, parsedExitQty, fees.trim() ? Number.parseFloat(fees) : 0);
  }, [fees, parsedExitPrice, parsedExitQty, trade]);

  if (!trade) {
    return null;
  }

  const setQtyFromRatio = (ratio: number) => {
    const nextQty = Math.max(0, remainingQty * ratio);
    setExitQty(nextQty.toFixed(2));
    setExitMode(ratio >= 0.9999 ? 'full' : 'partial');
  };

  const saveMarkPrice = () => {
    if (!markPrice.trim()) {
      onUpdateMarkPrice(trade.id, undefined);
      return;
    }
    const parsed = Number.parseFloat(markPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert('Mark price must be greater than 0.');
      return;
    }
    onUpdateMarkPrice(trade.id, parsed);
  };

  const confirmExit = (event: FormEvent) => {
    event.preventDefault();
    const parsedPrice = Number.parseFloat(exitPrice);
    const parsedQty = Number.parseFloat(exitQty);
    const parsedFees = fees.trim() ? Number.parseFloat(fees) : undefined;

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      alert('Exit price must be greater than 0.');
      return;
    }

    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      alert('Exit quantity must be greater than 0.');
      return;
    }

    if (parsedQty > remainingQty) {
      alert('Exit quantity cannot be greater than remaining quantity.');
      return;
    }

    if (parsedFees != null && (!Number.isFinite(parsedFees) || parsedFees < 0)) {
      alert('Fees must be zero or positive.');
      return;
    }

    onConfirmExit(trade.id, {
      date: exitDate,
      exitPrice: parsedPrice,
      quantity: parsedQty,
      fees: parsedFees,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4">
      <div className="modal-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-xl font-semibold text-[var(--text)]">Manage Open Trade</h2>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            <p className="font-semibold text-[var(--text)]">
              {trade.symbol} ({trade.direction.toUpperCase()})
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[var(--muted)]">
              <span>Entry: {formatCurrency(trade.entryPrice)}</span>
              <span>Qty: {trade.quantity}</span>
              <span>Exited: {(trade.quantity - remainingQty).toFixed(2)}</span>
              <span>Remaining: {remainingQty.toFixed(2)}</span>
            </div>
            {trade.markPriceUpdatedAt && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Mark updated: {new Date(trade.markPriceUpdatedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Manual Mark Price</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                min="0"
                step="0.01"
                value={markPrice}
                onChange={(event) => setMarkPrice(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] h-11 px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                placeholder={`Leave blank to clear (${currency})`}
              />
              <button
                type="button"
                onClick={saveMarkPrice}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:brightness-110"
              >
                Save Mark
              </button>
            </div>
          </div>

          <form onSubmit={confirmExit} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <h3 className="text-sm font-semibold text-[var(--text)]">Exit Builder</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setExitMode('partial');
                  if (Number.parseFloat(exitQty) > remainingQty) {
                    setExitQty(remainingQty.toFixed(2));
                  }
                }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${
                  exitMode === 'partial'
                    ? 'border-[var(--accent)] bg-[color:rgba(250,204,21,0.15)] text-[var(--text)]'
                    : 'border-[var(--border)] text-[var(--muted)]'
                }`}
              >
                Partial Sell
              </button>
              <button
                type="button"
                onClick={() => {
                  setExitMode('full');
                  setExitQty(remainingQty.toFixed(2));
                }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${
                  exitMode === 'full'
                    ? 'border-[var(--positive)] bg-[color:rgba(52,211,153,0.15)] text-[var(--text)]'
                    : 'border-[var(--border)] text-[var(--muted)]'
                }`}
              >
                Close Full Position
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setQtyFromRatio(0.25)}
                className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]"
              >
                25%
              </button>
              <button
                type="button"
                onClick={() => setQtyFromRatio(0.5)}
                className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setQtyFromRatio(0.75)}
                className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]"
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setQtyFromRatio(1)}
                className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]"
              >
                100%
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Exit Date</span>
                <input
                  type="date"
                  value={exitDate}
                  onChange={(event) => setExitDate(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] h-11 px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Exit Price ({currency})</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={exitPrice}
                  onChange={(event) => setExitPrice(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] h-11 px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Exit Quantity</span>
                <input
                  type="number"
                  min="0"
                  max={remainingQty}
                  step="0.01"
                  value={exitQty}
                  onChange={(event) => setExitQty(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] h-11 px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Fees ({currency}, optional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fees}
                  onChange={(event) => setFees(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] h-11 px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
              <p className="text-[var(--muted)]">
                Remaining after exit:{' '}
                <span className="font-semibold text-[var(--text)]">
                  {Number.isFinite(parsedExitQty) ? Math.max(0, remainingQty - parsedExitQty).toFixed(2) : remainingQty.toFixed(2)}
                </span>
              </p>
              <p className="text-[var(--muted)]">
                Estimated leg P&L:{' '}
                <span className={previewPnl != null && previewPnl >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                  {previewPnl != null ? formatCurrency(previewPnl) : '-'}
                </span>
              </p>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] h-11 px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-[var(--positive)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              {exitMode === 'full' ? 'Confirm Full Close' : 'Confirm Partial Exit'}
            </button>
          </form>

          {trade.exitLegs.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Existing Exit Legs</h3>
              <div className="space-y-2 text-sm">
                {trade.exitLegs.map((leg) => (
                  <div key={leg.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2">
                    <span className="text-[var(--muted)]">{leg.date}</span>
                    <span className="text-[var(--text)]">
                      {leg.quantity} @ {formatCurrency(leg.exitPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

