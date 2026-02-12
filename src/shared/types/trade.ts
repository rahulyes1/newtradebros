export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed';

export interface ExitLeg {
  id: string;
  date: string;
  quantity: number;
  exitPrice: number;
  fees?: number;
  note?: string;
}

export interface Trade {
  id: string;
  date: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  quantity: number;
  status: TradeStatus;
  exitLegs: ExitLeg[];
  markPrice?: number;
  markPriceUpdatedAt?: string;
  setup?: string;
  emotion?: string;
  notes?: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  realizedPnlPercent: number;
  totalPnlPercent: number;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

export interface TradeMetrics {
  remainingQty: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  realizedPnlPercent: number;
  totalPnlPercent: number;
}

export interface CreateOpenTradeInput {
  date: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  quantity: number;
  setup?: string;
  emotion?: string;
  notes?: string;
  markPrice?: number;
  initialExitLeg?: Omit<ExitLeg, 'id'>;
}

export interface UpdateTradeInput {
  date?: string;
  symbol?: string;
  direction?: TradeDirection;
  entryPrice?: number;
  quantity?: number;
  setup?: string;
  emotion?: string;
  notes?: string;
  markPrice?: number;
}

export interface AddExitLegInput {
  date: string;
  quantity: number;
  exitPrice: number;
  fees?: number;
  note?: string;
}
