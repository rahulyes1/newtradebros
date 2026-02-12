import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AddExitLegInput, Trade } from '../../../shared/types/trade';
import type { CurrencyCode } from '../../../shared/config/tradingOptions';
import { getRemainingQuantity } from '../../../shared/services/tradeMath';

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
  const [exitDate, setExitDate] = useState(() => todayIso());
  const [exitPrice, setExitPrice] = useState('');
  const [exitQty, setExitQty] = useState(() => (trade ? formatNumber(getRemainingQuantity(trade)) : ''));
  const [fees, setFees] = useState('');
  const [note, setNote] = useState('');
  const [markPrice, setMarkPrice] = useState(() => (trade ? formatNumber(trade.markPrice) : ''));

  const remainingQty = useMemo(() => (trade ? getRemainingQuantity(trade) : 0), [trade]);

  if (!trade) {
    return null;
  }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-xl font-semibold text-[var(--text)]">Manage Open Trade</h2>
          <button
            type="button"
            className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
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

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Manual Mark Price</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                min="0"
                step="0.01"
                value={markPrice}
                onChange={(event) => setMarkPrice(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                placeholder={`Leave blank to clear (${currency})`}
              />
              <button
                type="button"
                onClick={saveMarkPrice}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:brightness-110"
              >
                Save Mark
              </button>
            </div>
          </div>

          <form onSubmit={confirmExit} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">Add Exit Leg (Confirm Execute)</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Exit Date</span>
                <input
                  type="date"
                  value={exitDate}
                  onChange={(event) => setExitDate(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
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
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
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
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
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
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-[var(--positive)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Confirm Exit Leg
            </button>
          </form>

          {trade.exitLegs.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
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
