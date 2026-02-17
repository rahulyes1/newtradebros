import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Edit2, Trash2, X } from 'lucide-react';
import type { Trade } from '../../../shared/types/trade';
import TradeCardCollapsed from './TradeCardCollapsed';
import TradeCardExpanded from './TradeCardExpanded';

type HapticStyle = 'light' | 'medium' | 'heavy';

interface TradePriceChange {
  change: number;
  changePercent: number;
}

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
  onDuplicate?: (tradeId: string) => void;
  onCloseQuick?: (tradeId: string) => void;
  showSelection?: boolean;
  selected?: boolean;
  onSelectToggle?: (tradeId: string, checked: boolean) => void;
  isRecentlyUpdated?: boolean;
  priceChange?: TradePriceChange;
  onHaptic?: (style: HapticStyle) => void;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  onDuplicate,
  onCloseQuick,
  showSelection,
  selected,
  onSelectToggle,
  isRecentlyUpdated,
  priceChange,
  onHaptic,
}: TradeCardProps) {
  const hasCloseAction = Boolean(onCloseQuick ?? onManage);
  const actionWidth = hasCloseAction ? 156 : 104;

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const triggerHaptic = (style: HapticStyle) => {
    if (onHaptic) {
      onHaptic(style);
      return;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 40;
      navigator.vibrate(duration);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const resetSwipe = () => {
    setIsRevealed(false);
    setSwipeOffset(0);
  };

  useEffect(() => {
    if (isExpanded) {
      const timer = window.setTimeout(() => {
        resetSwipe();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isExpanded]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const priceChangeText = useMemo(() => {
    if (!priceChange || priceChange.change === 0) {
      return undefined;
    }
    const arrow = priceChange.change > 0 ? 'UP' : 'DOWN';
    return `${arrow} ${formatCurrency(Math.abs(priceChange.change))} (${Math.abs(priceChange.changePercent).toFixed(2)}%)`;
  }, [formatCurrency, priceChange]);

  const priceChangeClassName = priceChange && priceChange.change !== 0
    ? priceChange.change > 0
      ? 'text-[var(--positive)]'
      : 'text-[var(--negative)]'
    : undefined;

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (isExpanded || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setMenuPosition({ x: touch.clientX, y: touch.clientY });
      setShowContextMenu(true);
      triggerHaptic('medium');
      longPressTimerRef.current = null;
    }, 500);
  };

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (isExpanded || !startRef.current || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - startRef.current.x;
    const deltaY = touch.clientY - startRef.current.y;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      clearLongPressTimer();
      return;
    }

    clearLongPressTimer();

    if (deltaX < 0) {
      setSwipeOffset(clamp(deltaX, -actionWidth, 0));
      return;
    }

    if (isRevealed && deltaX > 0) {
      setSwipeOffset(clamp(-actionWidth + deltaX, -actionWidth, 0));
    }
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (isExpanded) {
      clearLongPressTimer();
      startRef.current = null;
      return;
    }
    clearLongPressTimer();
    startRef.current = null;

    if (swipeOffset <= -60) {
      setSwipeOffset(-actionWidth);
      setIsRevealed(true);
      triggerHaptic('light');
      return;
    }

    resetSwipe();
  };

  const handleToggle = () => {
    if (isRevealed) {
      resetSwipe();
      return;
    }
    onToggle(trade.id);
  };

  const openManage = () => {
    setShowContextMenu(false);
    resetSwipe();
    if (onCloseQuick) {
      onCloseQuick(trade.id);
      return;
    }
    onManage?.(trade.id);
  };

  const openEdit = () => {
    setShowContextMenu(false);
    resetSwipe();
    onEdit(trade.id);
  };

  const deleteTrade = () => {
    setShowContextMenu(false);
    resetSwipe();
    triggerHaptic('heavy');
    onDelete(trade.id);
  };

  const duplicateTrade = () => {
    setShowContextMenu(false);
    onDuplicate?.(trade.id);
  };

  return (
    <article className={`relative overflow-hidden rounded-xl border border-[var(--border)] border-l-[3px] ${borderClass(trade.totalPnl)} ${isRecentlyUpdated ? 'pulse-update' : ''}`}>
      {showSelection ? (
        <div className="absolute left-2 top-2 z-20">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={(event) => onSelectToggle?.(trade.id, event.target.checked)}
            className="h-4 w-4 rounded"
            aria-label={`Select ${trade.symbol}`}
          />
        </div>
      ) : null}

      {!isExpanded ? (
        <div className="absolute inset-y-0 right-0 z-0 flex" style={{ width: actionWidth }}>
          {hasCloseAction ? (
            <button
              type="button"
              onClick={openManage}
              className="flex w-[52px] items-center justify-center bg-[color:rgba(59,130,246,0.85)] text-white"
            >
              <X size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={openEdit}
            className="flex w-[52px] items-center justify-center bg-[color:rgba(245,158,11,0.85)] text-white"
          >
            <Edit2 size={16} />
          </button>
          <button
            type="button"
            onClick={deleteTrade}
            className="flex w-[52px] items-center justify-center bg-[color:rgba(239,68,68,0.9)] text-white"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}

      <div
        className="relative z-10 transition-transform duration-200"
        style={{ transform: !isExpanded ? `translateX(${swipeOffset}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isExpanded ? (
          <div className="trade-card-expanded">
            <TradeCardExpanded
              trade={trade}
              portfolioValue={portfolioValue}
              formatCurrency={formatCurrency}
              formatTradeDate={formatTradeDate}
              priceChangeText={priceChangeText}
              priceChangeClassName={priceChangeClassName}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={deleteTrade}
              onManage={onManage ? openManage : undefined}
            />
          </div>
        ) : (
          <TradeCardCollapsed
            trade={trade}
            formatCurrency={formatCurrency}
            priceChangeText={priceChangeText}
            priceChangeClassName={priceChangeClassName}
            onToggle={handleToggle}
          />
        )}
      </div>

      {showContextMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-transparent"
            onClick={() => setShowContextMenu(false)}
            aria-label="Close context menu"
          />
          <div
            className="fixed z-40 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-card)]"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button type="button" onClick={openEdit} className="flex w-full items-center gap-2 px-3 py-2 text-tertiary hover:bg-[var(--surface-2)]">
              <Edit2 size={14} /> Edit Trade
            </button>
            {onDuplicate ? (
              <button type="button" onClick={duplicateTrade} className="flex w-full items-center gap-2 px-3 py-2 text-tertiary hover:bg-[var(--surface-2)]">
                <Copy size={14} /> Trade Again
              </button>
            ) : null}
            {hasCloseAction ? (
              <button type="button" onClick={openManage} className="flex w-full items-center gap-2 px-3 py-2 text-tertiary hover:bg-[var(--surface-2)]">
                <X size={14} /> Close Position
              </button>
            ) : null}
            <div className="my-1 h-px bg-[var(--border)]" />
            <button type="button" onClick={deleteTrade} className="flex w-full items-center gap-2 px-3 py-2 text-[var(--negative)] hover:bg-[var(--surface-2)]">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}

export default memo(TradeCard);
