import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClockCheck, Download, Edit2, Plus, RefreshCw, Target, Trash2 } from 'lucide-react';
import type { GoalType } from './shared/types/goal';
import type { AddExitLegInput, Trade } from './shared/types/trade';
import { LocalTradeRepository } from './features/trades/repository/tradeRepository';
import { LocalGoalRepository } from './features/goals/repository/goalRepository';
import { buildAnalyticsSummary } from './features/analytics/analyticsService';
import { getGoalProgress } from './features/goals/services/goalService';
import { completeReminder, listActiveReminders } from './features/reminders/reminderService';
import { getRemainingQuantity, roundTo2 } from './shared/services/tradeMath';
import { exportTradesToCsv } from './features/trades/services/exportService';
import { ApiPricingService } from './shared/services/pricing';
import {
  buildCurrencyFormatter,
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
  isCurrencyCode,
  MAJOR_CURRENCIES,
  type CurrencyCode,
} from './shared/config/tradingOptions';
import TradeFormModal, { type TradeFormPayload } from './features/trades/components/TradeFormModal';
import CloseTradeModal from './features/trades/components/CloseTradeModal';
import GoalsPanel from './features/goals/components/GoalsPanel';

type Tab = 'overview' | 'trades' | 'analytics' | 'goals';
type FilterType = 'all' | 'wins' | 'losses';
type StatusFilter = 'all' | 'open' | 'closed';

const C = {
  grid: '#283243',
  text: '#9ca3af',
  realized: '#38bdf8',
  provisional: '#22c55e',
  pos: '#34d399',
  neg: '#f87171',
};

const periodNow = () => new Date().toISOString().slice(0, 7);
const pnlClass = (v: number) => (v >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]');

function getInitialCurrency(): CurrencyCode {
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && isCurrencyCode(saved)) {
      return saved;
    }
  } catch {
    // Ignore localStorage read errors and fallback.
  }
  return DEFAULT_CURRENCY;
}

export default function App() {
  const tradeRepo = useMemo(() => new LocalTradeRepository(), []);
  const goalRepo = useMemo(() => new LocalGoalRepository(), []);
  const pricingService = useMemo(() => new ApiPricingService(), []);

  const [trades, setTrades] = useState<Trade[]>(() => tradeRepo.listTrades());
  const [goals, setGoals] = useState(() => goalRepo.listGoals());
  const [reminders, setReminders] = useState(() => listActiveReminders());
  const [currency, setCurrency] = useState<CurrencyCode>(() => getInitialCurrency());
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [flt, setFlt] = useState<FilterType>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [useUnrealized, setUseUnrealized] = useState(true);
  const [isRefreshingMarks, setIsRefreshingMarks] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [manageTrade, setManageTrade] = useState<Trade | null>(null);

  const currencyFormatter = useMemo(() => buildCurrencyFormatter(currency), [currency]);

  const formatCurrency = (value: number): string => currencyFormatter.format(roundTo2(value));
  const pnl = (value: number): string => `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;

  useEffect(() => {
    const timer = window.setInterval(() => setReminders(listActiveReminders()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  }, [currency]);

  const submitTrade = (payload: TradeFormPayload) => {
    const next = payload.mode === 'create'
      ? tradeRepo.createOpenTrade(payload.data)
      : payload.tradeId
        ? tradeRepo.updateTrade(payload.tradeId, payload.data)
        : trades;
    setTrades(next);
    setShowForm(false);
    setEditTrade(null);
  };

  const delTrade = (id: string) => {
    if (window.confirm('Delete this trade?')) {
      setTrades(tradeRepo.deleteTrade(id));
    }
  };

  const addLeg = (id: string, leg: AddExitLegInput) => {
    const next = tradeRepo.addExitLeg(id, leg);
    setTrades(next);
    const updated = next.find((trade) => trade.id === id) ?? null;
    setManageTrade(updated?.status === 'open' ? updated : null);
  };

  const saveMark = (id: string, mark: number | undefined) => {
    const next = tradeRepo.updateMarkPrice(id, mark);
    setTrades(next);
    const updated = next.find((trade) => trade.id === id) ?? null;
    setManageTrade(updated?.status === 'open' ? updated : null);
  };

  const refreshOpenTradeMarks = async () => {
    const symbols = Array.from(
      new Set(
        trades
          .filter((trade) => trade.status === 'open')
          .map((trade) => trade.symbol.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (symbols.length === 0) {
      alert('No open trades available for mark-price refresh.');
      return;
    }

    setIsRefreshingMarks(true);
    try {
      const pricesBySymbol: Record<string, number> = {};
      await Promise.all(
        symbols.map(async (symbol) => {
          const price = await pricingService.getMarkPrice(symbol);
          if (price != null) {
            pricesBySymbol[symbol] = roundTo2(price);
          }
        })
      );

      const next = tradeRepo.updateOpenTradeMarks(pricesBySymbol);
      setTrades(next);
      setManageTrade((current) => {
        if (!current) {
          return current;
        }
        const updated = next.find((trade) => trade.id === current.id) ?? null;
        return updated?.status === 'open' ? updated : null;
      });

      if (Object.keys(pricesBySymbol).length === 0) {
        alert('Price refresh completed, but no symbol quotes were returned by the API.');
      }
    } finally {
      setIsRefreshingMarks(false);
    }
  };

  const summary = useMemo(() => {
    const closed = trades.filter((trade) => trade.status === 'closed');
    const realized = roundTo2(trades.reduce((sum, trade) => sum + trade.realizedPnl, 0));
    const unrealized = roundTo2(trades.reduce((sum, trade) => sum + trade.unrealizedPnl, 0));
    const wins = closed.filter((trade) => trade.realizedPnl > 0).length;
    const losses = closed.filter((trade) => trade.realizedPnl < 0).length;
    return {
      open: trades.filter((trade) => trade.status === 'open').length,
      realized,
      unrealized,
      total: roundTo2(realized + unrealized),
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
      wins,
      losses,
    };
  }, [trades]);

  const shown = useMemo(
    () =>
      trades.filter((trade) => {
        if (search && !trade.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (from && trade.date < from) return false;
        if (to && trade.date > to) return false;
        if (status !== 'all' && trade.status !== status) return false;
        if (flt === 'wins' && trade.totalPnl <= 0) return false;
        if (flt === 'losses' && trade.totalPnl >= 0) return false;
        return true;
      }),
    [trades, search, from, to, status, flt]
  );

  const analytics = useMemo(() => buildAnalyticsSummary(trades, useUnrealized), [trades, useUnrealized]);

  const lineData = useMemo(() => {
    return [...trades]
      .sort((a, b) => a.date.localeCompare(b.date))
      .reduce<Array<{ date: string; realized: number; provisional: number }>>((acc, trade) => {
        const prev = acc[acc.length - 1];
        const realized = roundTo2((prev?.realized ?? 0) + trade.realizedPnl);
        const provisional = roundTo2((prev?.provisional ?? 0) + trade.totalPnl);
        acc.push({ date: trade.date, realized, provisional });
        return acc;
      }, []);
  }, [trades]);

  const monthData = useMemo(() => {
    const monthly = new Map<string, { month: string; realized: number; provisional: number }>();
    trades.forEach((trade) => {
      const key = trade.date.slice(0, 7);
      const curr = monthly.get(key) ?? { month: key, realized: 0, provisional: 0 };
      curr.realized += trade.realizedPnl;
      curr.provisional += trade.totalPnl;
      monthly.set(key, curr);
    });
    return Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [trades]);

  const pieData = [
    { name: 'Wins', value: summary.wins, color: C.pos },
    { name: 'Losses', value: summary.losses, color: C.neg },
  ];
  const currentPeriod = periodNow();
  const periodGoals = goals.filter((goal) => goal.period === currentPeriod);
  const goalProgress = getGoalProgress(periodGoals, trades);

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'overview', label: 'Overview', badge: reminders.length || undefined },
    { id: 'trades', label: 'Trades', badge: summary.open || undefined },
    { id: 'analytics', label: 'Analytics' },
    {
      id: 'goals',
      label: 'Goals',
      badge: goalProgress.filter((goal) => goal.status === 'at_risk').length || undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-20 text-[var(--text)] md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Trading Journal Pro</h1>
              <p className="text-sm text-[var(--muted)]">
                Dark mode, open/closed lifecycle, partial exits, analytics, goals, and live mark refresh.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
                title="Display currency"
              >
                {MAJOR_CURRENCIES.map((currencyOption) => (
                  <option key={currencyOption.code} value={currencyOption.code}>
                    {currencyOption.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => exportTradesToCsv(trades)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
              >
                <Download size={14} className="inline" /> Export
              </button>
              <button
                onClick={() => {
                  void refreshOpenTradeMarks();
                }}
                disabled={isRefreshingMarks}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm disabled:opacity-60"
              >
                <RefreshCw size={14} className={`inline ${isRefreshingMarks ? 'animate-spin' : ''}`} />{' '}
                {isRefreshingMarks ? 'Refreshing' : 'Refresh Marks'}
              </button>
              <button
                onClick={() => {
                  setEditTrade(null);
                  setShowForm(true);
                }}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
              >
                <Plus size={14} className="inline" /> Add Trade
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">Realized</p>
            <p className={`text-lg font-semibold ${pnlClass(summary.realized)}`}>{pnl(summary.realized)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">Unrealized</p>
            <p className={`text-lg font-semibold ${pnlClass(summary.unrealized)}`}>{pnl(summary.unrealized)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">Total</p>
            <p className={`text-lg font-semibold ${pnlClass(summary.total)}`}>{pnl(summary.total)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">Win Rate</p>
            <p className="text-lg font-semibold">{summary.winRate.toFixed(1)}%</p>
            <p className="text-xs text-[var(--muted)]">
              {summary.wins}W/{summary.losses}L
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">Open Trades</p>
            <p className="text-lg font-semibold text-[var(--accent)]">{summary.open}</p>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="grid gap-2 md:grid-cols-5">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol"
              className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            >
              <option value="all">All status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={flt}
              onChange={(event) => setFlt(event.target.value as FilterType)}
              className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            >
              <option value="all">All P&amp;L</option>
              <option value="wins">Winners</option>
              <option value="losses">Losers</option>
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-4 flex gap-2 overflow-auto">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  tab === tabItem.id ? 'bg-[var(--surface-2)] text-[var(--accent)]' : 'text-[var(--muted)]'
                }`}
              >
                {tabItem.label}
                {tabItem.badge ? ` (${tabItem.badge})` : ''}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-start justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      <AlarmClockCheck size={14} className="mr-1 inline text-[var(--accent)]" />
                      {reminder.title}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{reminder.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      completeReminder(reminder.kind);
                      setReminders(listActiveReminders());
                    }}
                    className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-black"
                  >
                    Done
                  </button>
                </div>
              ))}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="mb-2 text-xs uppercase text-[var(--muted)]">Cumulative Realized vs Provisional</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={lineData}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke={C.text} />
                    <YAxis stroke={C.text} />
                    <Tooltip />
                    <Line dataKey="realized" stroke={C.realized} />
                    <Line dataKey="provisional" stroke={C.provisional} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {tab === 'trades' && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                    <th className="p-2">Date</th>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Entry</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Remaining</th>
                    <th className="p-2 text-right">Mark</th>
                    <th className="p-2 text-right">Realized</th>
                    <th className="p-2 text-right">Unrealized</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((trade) => (
                    <tr key={trade.id} className="border-b border-[var(--border)]">
                      <td className="p-2">{trade.date}</td>
                      <td className="p-2 font-semibold">{trade.symbol}</td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-1 text-[10px] ${
                            trade.status === 'open'
                              ? 'bg-[color:rgba(250,204,21,0.2)] text-[var(--accent)]'
                              : 'bg-[color:rgba(34,197,94,0.2)] text-[var(--positive)]'
                          }`}
                        >
                          {trade.status}
                        </span>
                      </td>
                      <td className="p-2 text-right">{formatCurrency(trade.entryPrice)}</td>
                      <td className="p-2 text-right">{trade.quantity.toFixed(2)}</td>
                      <td className="p-2 text-right">{getRemainingQuantity(trade).toFixed(2)}</td>
                      <td className="p-2 text-right">{trade.markPrice != null ? formatCurrency(trade.markPrice) : '-'}</td>
                      <td className={`p-2 text-right ${pnlClass(trade.realizedPnl)}`}>{pnl(trade.realizedPnl)}</td>
                      <td className={`p-2 text-right ${pnlClass(trade.unrealizedPnl)}`}>{pnl(trade.unrealizedPnl)}</td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-1">
                          {trade.status === 'open' ? (
                            <button
                              onClick={() => setManageTrade(trade)}
                              className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--accent)]"
                            >
                              Manage
                            </button>
                          ) : null}
                          <button
                            onClick={() => {
                              setEditTrade(trade);
                              setShowForm(true);
                            }}
                            className="rounded border border-[var(--border)] p-1"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => delTrade(trade.id)} className="rounded border border-[var(--border)] p-1">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-sm">Analytics mode: {useUnrealized ? 'Realized + unrealized' : 'Realized only'}</p>
                <button
                  onClick={() => setUseUnrealized((value) => !value)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-sm"
                >
                  Toggle
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="mb-2 text-xs uppercase text-[var(--muted)]">Monthly Performance</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthData}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="month" stroke={C.text} />
                      <YAxis stroke={C.text} />
                      <Tooltip />
                      <Bar dataKey="realized" fill={C.realized} />
                      <Bar dataKey="provisional" fill={C.provisional} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="mb-2 text-xs uppercase text-[var(--muted)]">Win/Loss (closed trades)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={75}>
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs text-[var(--muted)]">Best Setup (&gt;=3)</p>
                  <p className="font-semibold">{analytics.bestSetup?.key ?? 'N/A'}</p>
                  <p className={pnlClass(analytics.bestSetup?.pnl ?? 0)}>
                    {analytics.bestSetup ? pnl(analytics.bestSetup.pnl) : '-'}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs text-[var(--muted)]">Worst Setup (&gt;=3)</p>
                  <p className="font-semibold">{analytics.worstSetup?.key ?? 'N/A'}</p>
                  <p className={pnlClass(analytics.worstSetup?.pnl ?? 0)}>
                    {analytics.worstSetup ? pnl(analytics.worstSetup.pnl) : '-'}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs text-[var(--muted)]">Emotion Groups</p>
                  <p className="font-semibold">{analytics.emotionPerformance.length}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Weekday groups: {analytics.weekdayPerformance.length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'goals' && (
            <GoalsPanel
              period={currentPeriod}
              goals={periodGoals}
              progress={goalProgress}
              formatCurrency={formatCurrency}
              onSaveGoal={(type: GoalType, target: number) =>
                setGoals(goalRepo.upsertGoal({ type, period: currentPeriod, target }))
              }
              onDeleteGoal={(id: string) => setGoals(goalRepo.deleteGoal(id))}
            />
          )}
        </section>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] p-2 md:hidden">
        <div className="grid grid-cols-4 gap-1">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`rounded px-2 py-2 text-xs ${
                tab === tabItem.id ? 'bg-[var(--surface-2)] text-[var(--accent)]' : 'text-[var(--muted)]'
              }`}
            >
              {tabItem.id === 'goals' ? <Target size={12} className="mr-1 inline" /> : null}
              {tabItem.label}
              {tabItem.badge ? ` ${tabItem.badge}` : ''}
            </button>
          ))}
        </div>
      </nav>

      {showForm ? (
        <TradeFormModal
          key={editTrade?.id ?? 'create'}
          isOpen={showForm}
          trade={editTrade}
          currency={currency}
          onClose={() => {
            setShowForm(false);
            setEditTrade(null);
          }}
          onSubmit={submitTrade}
        />
      ) : null}

      {manageTrade ? (
        <CloseTradeModal
          key={manageTrade.id}
          trade={manageTrade}
          currency={currency}
          formatCurrency={formatCurrency}
          onClose={() => setManageTrade(null)}
          onConfirmExit={addLeg}
          onUpdateMarkPrice={saveMark}
        />
      ) : null}
    </div>
  );
}
