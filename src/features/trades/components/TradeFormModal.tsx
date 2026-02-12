import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { CreateOpenTradeInput, Trade, TradeDirection, UpdateTradeInput } from '../../../shared/types/trade';
import { CUSTOM_STRATEGY_VALUE, STRATEGY_PRESETS, type CurrencyCode } from '../../../shared/config/tradingOptions';

export type TradeFormPayload =
  | {
      mode: 'create';
      data: CreateOpenTradeInput;
    }
  | {
      mode: 'edit';
      tradeId: string;
      data: UpdateTradeInput;
    };

interface TradeFormModalProps {
  isOpen: boolean;
  trade?: Trade | null;
  currency: CurrencyCode;
  onClose: () => void;
  onSubmit: (payload: TradeFormPayload) => void;
}

interface TradeFormState {
  date: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: string;
  quantity: string;
  markPrice: string;
  setupPreset: string;
  setupCustom: string;
  emotion: string;
  notes: string;
  initialExitDate: string;
  initialExitPrice: string;
  initialExitQuantity: string;
  initialExitFees: string;
  initialExitNote: string;
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

function getExitedQuantity(trade: Trade): number {
  return trade.exitLegs.reduce((sum, leg) => sum + leg.quantity, 0);
}

function getSetupInputs(setup: string | undefined): { setupPreset: string; setupCustom: string } {
  const normalized = setup?.trim() ?? '';
  if (!normalized) {
    return { setupPreset: '', setupCustom: '' };
  }
  if (STRATEGY_PRESETS.includes(normalized as (typeof STRATEGY_PRESETS)[number])) {
    return { setupPreset: normalized, setupCustom: '' };
  }
  return { setupPreset: CUSTOM_STRATEGY_VALUE, setupCustom: normalized };
}

function emptyState(trade?: Trade | null): TradeFormState {
  const setupInputs = getSetupInputs(trade?.setup);
  if (trade) {
    return {
      date: trade.date,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: formatNumber(trade.entryPrice),
      quantity: formatNumber(trade.quantity),
      markPrice: formatNumber(trade.markPrice),
      setupPreset: setupInputs.setupPreset,
      setupCustom: setupInputs.setupCustom,
      emotion: trade.emotion ?? 'neutral',
      notes: trade.notes ?? '',
      initialExitDate: todayIso(),
      initialExitPrice: '',
      initialExitQuantity: '',
      initialExitFees: '',
      initialExitNote: '',
    };
  }
  return {
    date: todayIso(),
    symbol: '',
    direction: 'long',
    entryPrice: '',
    quantity: '',
    markPrice: '',
    setupPreset: '',
    setupCustom: '',
    emotion: 'neutral',
    notes: '',
    initialExitDate: todayIso(),
    initialExitPrice: '',
    initialExitQuantity: '',
    initialExitFees: '',
    initialExitNote: '',
  };
}

export default function TradeFormModal({ isOpen, trade, currency, onClose, onSubmit }: TradeFormModalProps) {
  const [state, setState] = useState<TradeFormState>(() => emptyState(trade));
  const isEdit = Boolean(trade);

  const parsed = useMemo(() => {
    const entryPrice = Number.parseFloat(state.entryPrice);
    const quantity = Number.parseFloat(state.quantity);
    const markPrice = state.markPrice.trim() ? Number.parseFloat(state.markPrice) : undefined;
    const initialExitPrice = state.initialExitPrice.trim() ? Number.parseFloat(state.initialExitPrice) : undefined;
    const initialExitQuantity = state.initialExitQuantity.trim() ? Number.parseFloat(state.initialExitQuantity) : undefined;
    const initialExitFees = state.initialExitFees.trim() ? Number.parseFloat(state.initialExitFees) : undefined;
    return {
      entryPrice,
      quantity,
      markPrice,
      initialExitPrice,
      initialExitQuantity,
      initialExitFees,
    };
  }, [state.entryPrice, state.quantity, state.markPrice, state.initialExitPrice, state.initialExitQuantity, state.initialExitFees]);

  if (!isOpen) {
    return null;
  }

  const selectedSetup = state.setupPreset === CUSTOM_STRATEGY_VALUE
    ? state.setupCustom.trim()
    : state.setupPreset.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (!state.symbol.trim()) {
      alert('Symbol is required.');
      return;
    }

    if (!Number.isFinite(parsed.entryPrice) || parsed.entryPrice <= 0) {
      alert('Entry price must be greater than 0.');
      return;
    }

    if (!Number.isFinite(parsed.quantity) || parsed.quantity <= 0) {
      alert('Quantity must be greater than 0.');
      return;
    }

    if (parsed.markPrice != null && (!Number.isFinite(parsed.markPrice) || parsed.markPrice <= 0)) {
      alert('Mark price must be greater than 0 when provided.');
      return;
    }

    if (state.setupPreset === CUSTOM_STRATEGY_VALUE && !selectedSetup) {
      alert('Please enter your custom strategy.');
      return;
    }

    if (isEdit && trade) {
      const exitedQuantity = getExitedQuantity(trade);
      if (parsed.quantity + 0.000001 < exitedQuantity) {
        alert(`Quantity cannot be less than already exited quantity (${exitedQuantity.toFixed(2)}).`);
        return;
      }

      onSubmit({
        mode: 'edit',
        tradeId: trade.id,
        data: {
          date: state.date,
          symbol: state.symbol.trim().toUpperCase(),
          direction: state.direction,
          entryPrice: parsed.entryPrice,
          quantity: parsed.quantity,
          markPrice: parsed.markPrice,
          setup: selectedSetup || undefined,
          emotion: state.emotion.trim() || undefined,
          notes: state.notes.trim() || undefined,
        },
      });
      return;
    }

    const initialExitLeg =
      parsed.initialExitPrice != null && parsed.initialExitQuantity != null
        ? {
            date: state.initialExitDate,
            exitPrice: parsed.initialExitPrice,
            quantity: parsed.initialExitQuantity,
            fees: parsed.initialExitFees,
            note: state.initialExitNote.trim() || undefined,
          }
        : undefined;

    if (initialExitLeg) {
      if (!Number.isFinite(initialExitLeg.exitPrice) || initialExitLeg.exitPrice <= 0) {
        alert('Initial exit price must be greater than 0.');
        return;
      }
      if (!Number.isFinite(initialExitLeg.quantity) || initialExitLeg.quantity <= 0) {
        alert('Initial exit quantity must be greater than 0.');
        return;
      }
      if (initialExitLeg.quantity > parsed.quantity) {
        alert('Initial exit quantity cannot be more than position quantity.');
        return;
      }
      if (initialExitLeg.fees != null && (!Number.isFinite(initialExitLeg.fees) || initialExitLeg.fees < 0)) {
        alert('Fees must be zero or positive.');
        return;
      }
    }

    onSubmit({
      mode: 'create',
      data: {
        date: state.date,
        symbol: state.symbol.trim().toUpperCase(),
        direction: state.direction,
        entryPrice: parsed.entryPrice,
        quantity: parsed.quantity,
        markPrice: parsed.markPrice,
        setup: selectedSetup || undefined,
        emotion: state.emotion.trim() || undefined,
        notes: state.notes.trim() || undefined,
        initialExitLeg,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-xl font-semibold text-[var(--text)]">{isEdit ? 'Edit Trade' : 'Add Trade'}</h2>
          <button
            type="button"
            className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Date</span>
              <input
                type="date"
                value={state.date}
                onChange={(event) => setState((prev) => ({ ...prev, date: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Symbol</span>
              <input
                type="text"
                value={state.symbol}
                onChange={(event) => setState((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                placeholder="AAPL"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Direction</span>
              <select
                value={state.direction}
                onChange={(event) => setState((prev) => ({ ...prev, direction: event.target.value as TradeDirection }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Quantity</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={state.quantity}
                onChange={(event) => setState((prev) => ({ ...prev, quantity: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Entry Price ({currency})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={state.entryPrice}
                onChange={(event) => setState((prev) => ({ ...prev, entryPrice: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Mark Price ({currency}, optional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={state.markPrice}
                onChange={(event) => setState((prev) => ({ ...prev, markPrice: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                placeholder="Set for unrealized P&L"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Setup / Strategy</span>
              <select
                value={state.setupPreset}
                onChange={(event) => setState((prev) => ({ ...prev, setupPreset: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select setup (optional)</option>
                {STRATEGY_PRESETS.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy}
                  </option>
                ))}
                <option value={CUSTOM_STRATEGY_VALUE}>Other (custom)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Emotion</span>
              <select
                value={state.emotion}
                onChange={(event) => setState((prev) => ({ ...prev, emotion: event.target.value }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                <option value="confident">Confident</option>
                <option value="neutral">Neutral</option>
                <option value="anxious">Anxious</option>
                <option value="fomo">FOMO</option>
                <option value="revenge">Revenge Trading</option>
              </select>
            </label>
            {state.setupPreset === CUSTOM_STRATEGY_VALUE && (
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-[var(--muted)]">Custom Strategy</span>
                <input
                  type="text"
                  value={state.setupCustom}
                  onChange={(event) => setState((prev) => ({ ...prev, setupCustom: event.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  placeholder="Describe your setup"
                />
              </label>
            )}
          </div>

          {!isEdit && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Optional Immediate Exit Leg</h3>
              <p className="mb-3 text-xs text-[var(--muted)]">
                Leave this blank to create an open trade now and close it later.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--muted)]">Exit Date</span>
                  <input
                    type="date"
                    value={state.initialExitDate}
                    onChange={(event) => setState((prev) => ({ ...prev, initialExitDate: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--muted)]">Exit Price ({currency})</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.initialExitPrice}
                    onChange={(event) => setState((prev) => ({ ...prev, initialExitPrice: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    placeholder="Optional"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--muted)]">Exit Quantity</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.initialExitQuantity}
                    onChange={(event) => setState((prev) => ({ ...prev, initialExitQuantity: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    placeholder="Optional"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--muted)]">Fees ({currency})</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.initialExitFees}
                    onChange={(event) => setState((prev) => ({ ...prev, initialExitFees: event.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    placeholder="0.00"
                  />
                </label>
              </div>
              <label className="mt-3 block space-y-1 text-sm">
                <span className="text-[var(--muted)]">Exit Note</span>
                <input
                  type="text"
                  value={state.initialExitNote}
                  onChange={(event) => setState((prev) => ({ ...prev, initialExitNote: event.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  placeholder="Optional note"
                />
              </label>
            </div>
          )}

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Notes</span>
            <textarea
              value={state.notes}
              onChange={(event) => setState((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
              placeholder="What worked? What failed? Market context..."
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:brightness-110"
            >
              {isEdit ? 'Update Trade' : 'Save Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
