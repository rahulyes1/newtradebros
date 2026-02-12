import type { AddExitLegInput, CreateOpenTradeInput, Trade, UpdateTradeInput } from '../../../shared/types/trade';
import { getRemainingQuantity, withComputedMetrics } from '../../../shared/services/tradeMath';

const STORAGE_KEY = 'trades';

interface LegacyTrade {
  id: string;
  date: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  setup?: string;
  emotion?: string;
  notes?: string;
}

export interface TradeRepository {
  listTrades(): Trade[];
  createOpenTrade(input: CreateOpenTradeInput): Trade[];
  updateTrade(tradeId: string, updates: UpdateTradeInput): Trade[];
  addExitLeg(tradeId: string, input: AddExitLegInput): Trade[];
  updateMarkPrice(tradeId: string, markPrice: number | undefined): Trade[];
  updateOpenTradeMarks(pricesBySymbol: Record<string, number>): Trade[];
  deleteTrade(tradeId: string): Trade[];
  saveTrades(trades: Trade[]): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function hasOwnMarkPrice(updates: UpdateTradeInput): boolean {
  return Object.prototype.hasOwnProperty.call(updates, 'markPrice');
}

function isPositiveNumber(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function samePrice(a: number | undefined, b: number | undefined): boolean {
  if (a == null && b == null) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  return Math.abs(a - b) < 0.000001;
}

function migrateLegacyTrade(legacy: LegacyTrade): Trade {
  const createdAt = nowIso();
  const closeQty = toNumber(legacy.quantity);
  const hasExit = Number.isFinite(legacy.exitPrice) && legacy.exitPrice > 0;

  const migrated: Trade = {
    id: String(legacy.id ?? randomId('trade')),
    date: legacy.date ?? createdAt.slice(0, 10),
    symbol: String(legacy.symbol ?? '').toUpperCase(),
    direction: legacy.direction === 'short' ? 'short' : 'long',
    entryPrice: toNumber(legacy.entryPrice),
    quantity: closeQty,
    status: hasExit ? 'closed' : 'open',
    exitLegs: hasExit
      ? [
          {
            id: randomId('leg'),
            date: legacy.date ?? createdAt.slice(0, 10),
            quantity: closeQty,
            exitPrice: toNumber(legacy.exitPrice),
          },
        ]
      : [],
    setup: legacy.setup,
    emotion: legacy.emotion,
    notes: legacy.notes,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    realizedPnlPercent: 0,
    totalPnlPercent: 0,
    createdAt,
    updatedAt: createdAt,
  };

  return withComputedMetrics(migrated);
}

function normalizeTrade(raw: unknown): Trade | null {
  if (!isObject(raw)) {
    return null;
  }

  // Legacy object shape had direct exitPrice and no exitLegs.
  if (!Array.isArray(raw.exitLegs) && 'exitPrice' in raw) {
    return migrateLegacyTrade(raw as unknown as LegacyTrade);
  }

  if (typeof raw.id !== 'string') {
    return null;
  }

  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso();
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt;

  const trade: Trade = {
    id: raw.id,
    date: typeof raw.date === 'string' ? raw.date : createdAt.slice(0, 10),
    symbol: typeof raw.symbol === 'string' ? raw.symbol.toUpperCase() : '',
    direction: raw.direction === 'short' ? 'short' : 'long',
    entryPrice: toNumber(raw.entryPrice),
    quantity: toNumber(raw.quantity),
    status: raw.status === 'closed' ? 'closed' : 'open',
    exitLegs: Array.isArray(raw.exitLegs)
      ? raw.exitLegs
          .filter(isObject)
          .map((leg) => ({
            id: typeof leg.id === 'string' ? leg.id : randomId('leg'),
            date: typeof leg.date === 'string' ? leg.date : createdAt.slice(0, 10),
            quantity: toNumber(leg.quantity),
            exitPrice: toNumber(leg.exitPrice),
            fees: leg.fees == null ? undefined : toNumber(leg.fees),
            note: typeof leg.note === 'string' ? leg.note : undefined,
          }))
      : [],
    markPrice: raw.markPrice == null ? undefined : toNumber(raw.markPrice),
    markPriceUpdatedAt: typeof raw.markPriceUpdatedAt === 'string' ? raw.markPriceUpdatedAt : undefined,
    setup: typeof raw.setup === 'string' ? raw.setup : undefined,
    emotion: typeof raw.emotion === 'string' ? raw.emotion : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    realizedPnlPercent: 0,
    totalPnlPercent: 0,
    createdAt,
    updatedAt,
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
  };

  const normalized = withComputedMetrics(trade);
  if (normalized.status === 'closed') {
    normalized.markPrice = undefined;
    normalized.markPriceUpdatedAt = undefined;
  }
  return normalized;
}

export class LocalTradeRepository implements TradeRepository {
  listTrades(): Trade[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const normalized = parsed
        .map(normalizeTrade)
        .filter((trade): trade is Trade => trade !== null)
        .sort((a, b) => b.date.localeCompare(a.date));

      this.saveTrades(normalized);
      return normalized;
    } catch {
      return [];
    }
  }

  saveTrades(trades: Trade[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  }

  createOpenTrade(input: CreateOpenTradeInput): Trade[] {
    const trades = this.listTrades();
    if (!isPositiveNumber(input.entryPrice) || !isPositiveNumber(input.quantity)) {
      return trades;
    }
    if (input.markPrice != null && !isPositiveNumber(input.markPrice)) {
      return trades;
    }

    if (input.initialExitLeg) {
      if (!isPositiveNumber(input.initialExitLeg.exitPrice) || !isPositiveNumber(input.initialExitLeg.quantity)) {
        return trades;
      }
      if (input.initialExitLeg.quantity > input.quantity) {
        return trades;
      }
      if (input.initialExitLeg.fees != null && (!Number.isFinite(input.initialExitLeg.fees) || input.initialExitLeg.fees < 0)) {
        return trades;
      }
    }

    const timestamp = nowIso();

    const newTrade: Trade = withComputedMetrics({
      id: randomId('trade'),
      date: input.date,
      symbol: input.symbol.toUpperCase(),
      direction: input.direction,
      entryPrice: input.entryPrice,
      quantity: input.quantity,
      status: 'open',
      exitLegs: [],
      markPrice: input.markPrice,
      markPriceUpdatedAt: input.markPrice == null ? undefined : timestamp,
      setup: input.setup,
      emotion: input.emotion,
      notes: input.notes,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalPnl: 0,
      realizedPnlPercent: 0,
      totalPnlPercent: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (input.initialExitLeg) {
      const withLeg = withComputedMetrics({
        ...newTrade,
        exitLegs: [
          ...newTrade.exitLegs,
          {
            id: randomId('leg'),
            ...input.initialExitLeg,
          },
        ],
      });
      const updated = [withLeg, ...trades];
      this.saveTrades(updated);
      return updated;
    }

    const updated = [newTrade, ...trades];
    this.saveTrades(updated);
    return updated;
  }

  updateTrade(tradeId: string, updates: UpdateTradeInput): Trade[] {
    const trades = this.listTrades();
    const timestamp = nowIso();
    const next = trades.map((trade) => {
      if (trade.id !== tradeId) {
        return trade;
      }

      const exitedQty = trade.exitLegs.reduce((sum, leg) => sum + leg.quantity, 0);
      const nextQuantity = updates.quantity ?? trade.quantity;
      const nextEntryPrice = updates.entryPrice ?? trade.entryPrice;

      if (!isPositiveNumber(nextEntryPrice) || !isPositiveNumber(nextQuantity) || nextQuantity + 0.000001 < exitedQty) {
        return trade;
      }

      if (hasOwnMarkPrice(updates) && updates.markPrice != null && !isPositiveNumber(updates.markPrice)) {
        return trade;
      }

      const markPriceUpdatedAt = hasOwnMarkPrice(updates)
        ? updates.markPrice == null
          ? undefined
          : timestamp
        : trade.markPriceUpdatedAt;

      const merged: Trade = withComputedMetrics({
        ...trade,
        ...updates,
        symbol: updates.symbol ? updates.symbol.toUpperCase() : trade.symbol,
        markPriceUpdatedAt,
        updatedAt: timestamp,
      });

      if (merged.status === 'closed') {
        merged.markPrice = undefined;
        merged.markPriceUpdatedAt = undefined;
      }
      return merged;
    });

    this.saveTrades(next);
    return next;
  }

  addExitLeg(tradeId: string, input: AddExitLegInput): Trade[] {
    const trades = this.listTrades();
    const next = trades.map((trade) => {
      if (trade.id !== tradeId) {
        return trade;
      }

      const remainingQty = getRemainingQuantity(trade);
      if (
        !isPositiveNumber(input.exitPrice) ||
        !isPositiveNumber(input.quantity) ||
        input.quantity > remainingQty ||
        (input.fees != null && (!Number.isFinite(input.fees) || input.fees < 0))
      ) {
        return trade;
      }

      const updated = withComputedMetrics({
        ...trade,
        exitLegs: [
          ...trade.exitLegs,
          {
            id: randomId('leg'),
            date: input.date,
            quantity: input.quantity,
            exitPrice: input.exitPrice,
            fees: input.fees,
            note: input.note,
          },
        ],
        updatedAt: nowIso(),
      });

      if (updated.status === 'closed') {
        updated.markPrice = undefined;
        updated.markPriceUpdatedAt = undefined;
      }

      return updated;
    });

    this.saveTrades(next);
    return next;
  }

  updateMarkPrice(tradeId: string, markPrice: number | undefined): Trade[] {
    if (markPrice != null && !isPositiveNumber(markPrice)) {
      return this.listTrades();
    }

    const trades = this.listTrades();
    const timestamp = nowIso();
    const next = trades.map((trade) => {
      if (trade.id !== tradeId || trade.status === 'closed') {
        return trade;
      }

      if (samePrice(trade.markPrice, markPrice)) {
        return trade;
      }

      return withComputedMetrics({
        ...trade,
        markPrice,
        markPriceUpdatedAt: markPrice == null ? undefined : timestamp,
        updatedAt: timestamp,
      });
    });

    this.saveTrades(next);
    return next;
  }

  updateOpenTradeMarks(pricesBySymbol: Record<string, number>): Trade[] {
    const trades = this.listTrades();
    const timestamp = nowIso();
    let hasChanges = false;

    const next = trades.map((trade) => {
      if (trade.status === 'closed') {
        return trade;
      }

      const nextPrice = pricesBySymbol[trade.symbol.toUpperCase()];
      if (!isPositiveNumber(nextPrice) || samePrice(trade.markPrice, nextPrice)) {
        return trade;
      }

      hasChanges = true;
      return withComputedMetrics({
        ...trade,
        markPrice: nextPrice,
        markPriceUpdatedAt: timestamp,
        updatedAt: timestamp,
      });
    });

    if (!hasChanges) {
      return trades;
    }

    this.saveTrades(next);
    return next;
  }

  deleteTrade(tradeId: string): Trade[] {
    const trades = this.listTrades();
    const next = trades.filter((trade) => trade.id !== tradeId);
    this.saveTrades(next);
    return next;
  }
}
