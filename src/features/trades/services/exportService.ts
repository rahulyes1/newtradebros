import type { Trade } from '../../../shared/types/trade';

function quote(value: string | number | undefined): string {
  if (value == null) {
    return '';
  }
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function exportTradesToCsv(trades: Trade[]): void {
  if (trades.length === 0) {
    alert('No trades to export.');
    return;
  }

  const headers = [
    'Date',
    'Symbol',
    'Direction',
    'Status',
    'Entry',
    'Quantity',
    'Exited Quantity',
    'Remaining Quantity',
    'Mark Price',
    'Realized PnL',
    'Unrealized PnL',
    'Total PnL',
    'Setup',
    'Emotion',
    'Notes',
    'Exit Legs',
  ];

  const rows = trades.map((trade) => {
    const exitedQty = trade.exitLegs.reduce((sum, leg) => sum + leg.quantity, 0);
    const remainingQty = Math.max(0, trade.quantity - exitedQty);
    const exitLegs = trade.exitLegs
      .map((leg) => `${leg.date}:${leg.quantity}@${leg.exitPrice}${leg.fees ? ` fee:${leg.fees}` : ''}`)
      .join(' | ');

    return [
      quote(trade.date),
      quote(trade.symbol),
      quote(trade.direction),
      quote(trade.status),
      quote(trade.entryPrice),
      quote(trade.quantity),
      quote(exitedQty),
      quote(remainingQty),
      quote(trade.markPrice),
      quote(trade.realizedPnl.toFixed(2)),
      quote(trade.unrealizedPnl.toFixed(2)),
      quote(trade.totalPnl.toFixed(2)),
      quote(trade.setup),
      quote(trade.emotion),
      quote(trade.notes),
      quote(exitLegs),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
