import type { ExitLeg, Trade, TradeMetrics } from '../types/trade';

const EPSILON = 0.000001;

export function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLegPnl(
  direction: Trade['direction'],
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  fees = 0
): number {
  const gross = direction === 'long'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
  return roundTo2(gross - fees);
}

export function getExitedQuantity(exitLegs: ExitLeg[]): number {
  return exitLegs.reduce((sum, leg) => sum + leg.quantity, 0);
}

export function getRemainingQuantity(trade: Trade): number {
  return Math.max(0, roundTo2(trade.quantity - getExitedQuantity(trade.exitLegs)));
}

export function calculateTradeMetrics(trade: Trade): TradeMetrics {
  const realizedPnl = roundTo2(
    trade.exitLegs.reduce(
      (sum, leg) => sum + calculateLegPnl(trade.direction, trade.entryPrice, leg.exitPrice, leg.quantity, leg.fees ?? 0),
      0
    )
  );

  const remainingQty = getRemainingQuantity(trade);
  const unrealizedPnl = trade.markPrice == null
    ? 0
    : roundTo2(calculateLegPnl(trade.direction, trade.entryPrice, trade.markPrice, remainingQty));

  const totalPnl = roundTo2(realizedPnl + unrealizedPnl);
  const positionCost = trade.entryPrice * trade.quantity;
  const realizedPnlPercent = positionCost > 0 ? roundTo2((realizedPnl / positionCost) * 100) : 0;
  const totalPnlPercent = positionCost > 0 ? roundTo2((totalPnl / positionCost) * 100) : 0;

  return {
    remainingQty,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    realizedPnlPercent,
    totalPnlPercent,
  };
}

export function deriveTradeStatus(trade: Trade): Trade['status'] {
  return getRemainingQuantity(trade) <= EPSILON ? 'closed' : 'open';
}

export function withComputedMetrics(trade: Trade): Trade {
  const metrics = calculateTradeMetrics(trade);
  return {
    ...trade,
    status: metrics.remainingQty <= EPSILON ? 'closed' : 'open',
    realizedPnl: metrics.realizedPnl,
    unrealizedPnl: metrics.unrealizedPnl,
    totalPnl: metrics.totalPnl,
    realizedPnlPercent: metrics.realizedPnlPercent,
    totalPnlPercent: metrics.totalPnlPercent,
  };
}
