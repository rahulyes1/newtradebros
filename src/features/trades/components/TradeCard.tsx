import { memo } from 'react';
import type { Trade } from '../../../shared/types/trade';
import TradeCardCollapsed from './TradeCardCollapsed';
import TradeCardExpanded from './TradeCardExpanded';

interface TradeCardProps {
  trade: Trade;
  isExpanded: boolean;
  portfolioValue: number;
  formatCurrency: (value: number) => string;
  formatTradeDate: (dateIso: string) => string;
  onToggle: (tradeId: string) => void;
  onEdit: (tradeId: string) => void;
  onDelete: (tradeId: string) => void;
  onManage?: (tradeId: string) => void;
}

function borderClass(pnl: number): string {
  if (pnl > 0) {
    return 'border-l-[var(--positive)]';
  }
  if (pnl < 0) {
    return 'border-l-[var(--negative)]';
  }
  return 'border-l-transparent';
}

function TradeCard({
  trade,
  isExpanded,
  portfolioValue,
  formatCurrency,
  formatTradeDate,
  onToggle,
  onEdit,
  onDelete,
  onManage,
}: TradeCardProps) {
  return (
    <article
      className={`trade-card overflow-hidden rounded-xl border border-[var(--border)] border-l-[3px] ${borderClass(trade.totalPnl)} transition-all duration-300`}
    >
      {isExpanded ? (
        <div className="trade-card-expanded">
          <TradeCardExpanded
            trade={trade}
            portfolioValue={portfolioValue}
            formatCurrency={formatCurrency}
            formatTradeDate={formatTradeDate}
            onToggle={() => onToggle(trade.id)}
            onEdit={() => onEdit(trade.id)}
            onDelete={() => onDelete(trade.id)}
            onManage={onManage ? () => onManage(trade.id) : undefined}
          />
        </div>
      ) : (
        <TradeCardCollapsed trade={trade} formatCurrency={formatCurrency} onToggle={() => onToggle(trade.id)} />
      )}
    </article>
  );
}

export default memo(TradeCard);
