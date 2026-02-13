import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlarmClockCheck,
  CandlestickChart,
  Download,
  Edit2,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react';
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
import { supabase } from './supabaseClient';

type Tab = 'trades' | 'history' | 'overview' | 'analytics' | 'goals' | 'settings';
type FilterType = 'all' | 'wins' | 'losses';
type TradeViewMode = 'card' | 'compact';

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
const PORTFOLIO_VALUE_STORAGE_KEY = 'settings.portfolioValue';
const CONFIRM_DELETE_STORAGE_KEY = 'settings.confirmDelete';
const AUTO_REFRESH_MARKS_STORAGE_KEY = 'settings.autoRefreshMarks';
const ANALYTICS_UNREALIZED_STORAGE_KEY = 'settings.analytics.includeUnrealized';

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

function hasSavedCurrencyPreference(): boolean {
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return Boolean(saved && isCurrencyCode(saved));
  } catch {
    return false;
  }
}

function getInitialPortfolioValue(): number {
  try {
    const raw = localStorage.getItem(PORTFOLIO_VALUE_STORAGE_KEY);
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return roundTo2(parsed);
    }
  } catch {
    // Ignore localStorage read errors and fallback.
  }
  return 10000;
}

function getInitialBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
  } catch {
    // Ignore localStorage read errors and fallback.
  }
  return fallback;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

export default function App() {
  const tradeRepo = useMemo(() => new LocalTradeRepository(), []);
  const goalRepo = useMemo(() => new LocalGoalRepository(), []);
  const pricingService = useMemo(() => new ApiPricingService(), []);

  const [trades, setTrades] = useState<Trade[]>(() => tradeRepo.listTrades());
  const [goals, setGoals] = useState(() => goalRepo.listGoals());
  const [reminders, setReminders] = useState(() => listActiveReminders());
  const [currency, setCurrency] = useState<CurrencyCode>(() => getInitialCurrency());
  const [needsCurrencyOnboarding, setNeedsCurrencyOnboarding] = useState(() => !hasSavedCurrencyPreference());
  const [portfolioValue, setPortfolioValue] = useState<number>(() => getInitialPortfolioValue());
  const [portfolioValueInput, setPortfolioValueInput] = useState<string>(() => getInitialPortfolioValue().toFixed(2));
  const [confirmDelete, setConfirmDelete] = useState<boolean>(() => getInitialBoolean(CONFIRM_DELETE_STORAGE_KEY, true));
  const [autoRefreshMarks, setAutoRefreshMarks] = useState<boolean>(() => getInitialBoolean(AUTO_REFRESH_MARKS_STORAGE_KEY, false));
  const [tab, setTab] = useState<Tab>('trades');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [flt, setFlt] = useState<FilterType>('all');
  const [useUnrealized, setUseUnrealized] = useState<boolean>(() => getInitialBoolean(ANALYTICS_UNREALIZED_STORAGE_KEY, true));
  const [isRefreshingMarks, setIsRefreshingMarks] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [manageTrade, setManageTrade] = useState<Trade | null>(null);
  const [tradeViewMode, setTradeViewMode] = useState<TradeViewMode>('card');
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);
  const [isSyncingSettings, setIsSyncingSettings] = useState(false);
  const [hasDoneInitialAutoRefresh, setHasDoneInitialAutoRefresh] = useState(false);

  const currencyFormatter = useMemo(() => buildCurrencyFormatter(currency), [currency]);

  const formatCurrency = (value: number): string => currencyFormatter.format(roundTo2(value));
  const pnl = (value: number): string => `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;
  const compactNumberFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }),
    []
  );
  const currencySign = useMemo(
    () => currencyFormatter.formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency,
    [currency, currencyFormatter]
  );
  const compactPortfolioValue = `${currencySign}${compactNumberFormatter.format(portfolioValue)}`;

  const applyAccountMetadata = (user: User) => {
    const metadata = user.user_metadata ?? {};

    const preferredCurrency = typeof metadata.preferred_currency === 'string' && isCurrencyCode(metadata.preferred_currency)
      ? metadata.preferred_currency
      : undefined;
    if (preferredCurrency) {
      setCurrency(preferredCurrency);
      setNeedsCurrencyOnboarding(false);
    }

    const accountPortfolioValue = parsePositiveNumber(metadata.portfolio_value);
    if (accountPortfolioValue != null) {
      const rounded = roundTo2(accountPortfolioValue);
      setPortfolioValue(rounded);
      setPortfolioValueInput(rounded.toFixed(2));
    }

    const accountConfirmDelete = parseBoolean(metadata.confirm_delete);
    if (accountConfirmDelete != null) {
      setConfirmDelete(accountConfirmDelete);
    }

    const accountAutoRefreshMarks = parseBoolean(metadata.auto_refresh_marks);
    if (accountAutoRefreshMarks != null) {
      setAutoRefreshMarks(accountAutoRefreshMarks);
    }

    const accountUnrealizedMode = parseBoolean(metadata.analytics_include_unrealized);
    if (accountUnrealizedMode != null) {
      setUseUnrealized(accountUnrealizedMode);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setReminders(listActiveReminders()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }
      const user = data.session?.user ?? null;
      setAccountUser(user);
      if (user) {
        applyAccountMetadata(user);
        setAuthNotice(`Signed in as ${user.email ?? 'account user'}.`);
      } else {
        setAuthNotice('Not signed in. Settings are saved locally on this device.');
      }
      setIsAuthReady(true);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }
      const user = session?.user ?? null;
      setAccountUser(user);
      if (user) {
        applyAccountMetadata(user);
        setAuthNotice(`Signed in as ${user.email ?? 'account user'}.`);
      } else {
        setAuthNotice('Signed out. Settings stay local on this device.');
      }
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [currency]);

  useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_VALUE_STORAGE_KEY, String(portfolioValue));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [portfolioValue]);

  useEffect(() => {
    try {
      localStorage.setItem(CONFIRM_DELETE_STORAGE_KEY, String(confirmDelete));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [confirmDelete]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_REFRESH_MARKS_STORAGE_KEY, String(autoRefreshMarks));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [autoRefreshMarks]);

  useEffect(() => {
    try {
      localStorage.setItem(ANALYTICS_UNREALIZED_STORAGE_KEY, String(useUnrealized));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [useUnrealized]);

  useEffect(() => {
    if (!accountUser || !isAuthReady) {
      return;
    }

    let isCurrent = true;
    const timer = window.setTimeout(async () => {
      setIsSyncingSettings(true);
      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...accountUser.user_metadata,
          preferred_currency: currency,
          portfolio_value: portfolioValue,
          confirm_delete: confirmDelete,
          auto_refresh_marks: autoRefreshMarks,
          analytics_include_unrealized: useUnrealized,
        },
      });

      if (!isCurrent) {
        return;
      }

      if (error) {
        setAuthNotice(`Signed in, but settings sync failed: ${error.message}`);
      } else if (data.user) {
        setAccountUser(data.user);
      }

      if (isCurrent) {
        setIsSyncingSettings(false);
      }
    }, 900);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [accountUser?.id, autoRefreshMarks, confirmDelete, currency, isAuthReady, portfolioValue, useUnrealized]);

  useEffect(() => {
    if (!accountUser) {
      setIsSyncingSettings(false);
    }
  }, [accountUser]);

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
    if (!confirmDelete || window.confirm('Delete this trade?')) {
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

  const refreshOpenTradeMarks = async (options?: { silentIfNoOpen?: boolean }) => {
    const symbols = Array.from(
      new Set(
        trades
          .filter((trade) => trade.status === 'open')
          .map((trade) => trade.symbol.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (symbols.length === 0) {
      if (!options?.silentIfNoOpen) {
        alert('No open trades available for mark-price refresh.');
      }
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

      if (Object.keys(pricesBySymbol).length === 0 && !options?.silentIfNoOpen) {
        alert('Price refresh completed, but no symbol quotes were returned by the API.');
      }
    } finally {
      setIsRefreshingMarks(false);
    }
  };

  useEffect(() => {
    if (!autoRefreshMarks || hasDoneInitialAutoRefresh) {
      return;
    }
    setHasDoneInitialAutoRefresh(true);
    void refreshOpenTradeMarks({ silentIfNoOpen: true });
  }, [autoRefreshMarks, hasDoneInitialAutoRefresh]);

  const signInWithGoogle = async () => {
    setIsSigningInWithGoogle(true);
    const redirectTo = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) {
      setAuthNotice(`Sign-in failed: ${error.message}`);
      setIsSigningInWithGoogle(false);
    } else {
      setAuthNotice(`Redirecting to Google sign-in...`);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthNotice(`Sign out failed: ${error.message}`);
    }
  };

  const commitPortfolioValue = () => {
    const parsed = Number.parseFloat(portfolioValueInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPortfolioValueInput(portfolioValue.toFixed(2));
      return;
    }
    const rounded = roundTo2(parsed);
    setPortfolioValue(rounded);
    setPortfolioValueInput(rounded.toFixed(2));
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

  const openExposure = useMemo(() => {
    const openValue = trades
      .filter((trade) => trade.status === 'open')
      .reduce((sum, trade) => sum + trade.entryPrice * getRemainingQuantity(trade), 0);
    const openPercent = portfolioValue > 0 ? (openValue / portfolioValue) * 100 : 0;
    return {
      value: roundTo2(openValue),
      percent: roundTo2(openPercent),
    };
  }, [portfolioValue, trades]);

  const filteredTrades = useMemo(
    () =>
      trades.filter((trade) => {
        if (search && !trade.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (from && trade.date < from) return false;
        if (to && trade.date > to) return false;
        if (flt === 'wins' && trade.totalPnl <= 0) return false;
        if (flt === 'losses' && trade.totalPnl >= 0) return false;
        return true;
      }),
    [trades, search, from, to, flt]
  );

  const activeTrades = useMemo(
    () => filteredTrades.filter((trade) => trade.status === 'open'),
    [filteredTrades]
  );

  const historyTrades = useMemo(
    () => filteredTrades.filter((trade) => trade.status === 'closed'),
    [filteredTrades]
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
  const pnlSparkline = useMemo(
    () => lineData.slice(-18).map((item) => ({ date: item.date, pnl: item.provisional })),
    [lineData]
  );

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
    { id: 'trades', label: 'Trades', badge: summary.open || undefined },
    { id: 'history', label: 'History', badge: trades.filter((trade) => trade.status === 'closed').length || undefined },
    { id: 'overview', label: 'Overview', badge: reminders.length || undefined },
    { id: 'analytics', label: 'Analytics' },
    {
      id: 'goals',
      label: 'Goals',
      badge: goalProgress.filter((goal) => goal.status === 'at_risk').length || undefined,
    },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-28 text-[var(--text)] md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(140deg,rgba(37,99,235,0.16),rgba(17,24,39,0.92)_35%,rgba(15,23,42,0.95))] p-3 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:rgba(148,163,184,0.25)] bg-[color:rgba(59,130,246,0.22)] text-[var(--accent)]">
                <CandlestickChart size={16} />
              </div>
              <h1
                className="truncate text-base font-semibold tracking-tight text-[var(--text-strong)] md:text-lg"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Trading Journal Pro
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-[var(--border)] bg-[color:rgba(15,23,42,0.72)] px-2.5 py-1.5 text-right">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Portfolio</p>
                <p className="text-sm font-semibold text-[var(--text-strong)]">{compactPortfolioValue}</p>
              </div>
              {accountUser ? (
                <button
                  onClick={() => {
                    void signOut();
                  }}
                  title="Sign Out"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgba(16,185,129,0.5)] bg-[linear-gradient(140deg,rgba(16,185,129,0.32),rgba(15,23,42,0.9))] text-[color:rgba(110,231,183,1)] shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
                >
                  <LogOut size={14} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    void signInWithGoogle();
                  }}
                  disabled={isSigningInWithGoogle}
                  title="Sign In"
                  className="flex h-9 min-w-[94px] items-center justify-center gap-1 rounded-full border border-[color:rgba(96,165,250,0.55)] bg-[linear-gradient(130deg,#38bdf8,#3b82f6)] px-3 text-xs font-semibold text-[#05101f] shadow-[0_10px_24px_rgba(59,130,246,0.3)] disabled:opacity-60"
                >
                  <LogIn size={14} />
                  <span>{isSigningInWithGoogle ? 'Wait...' : 'Sign In'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 max-w-sm rounded-lg border border-[var(--border)] bg-[color:rgba(15,23,42,0.7)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Total P&L</p>
              <p className={`text-base font-semibold ${pnlClass(summary.total)}`}>{pnl(summary.total)}</p>
            </div>
            {isSyncingSettings && isAuthReady && accountUser ? (
              <p className="mt-1 text-[11px] text-[var(--accent)]">Syncing settings to account...</p>
            ) : null}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <p className="text-[11px] text-[var(--muted)]">Realized</p>
            <p className={`text-base font-semibold ${pnlClass(summary.realized)}`}>{pnl(summary.realized)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <p className="text-[11px] text-[var(--muted)]">Unrealized</p>
            <p className={`text-base font-semibold ${pnlClass(summary.unrealized)}`}>{pnl(summary.unrealized)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <p className="text-[11px] text-[var(--muted)]">Total</p>
            <p className={`text-base font-semibold ${pnlClass(summary.total)}`}>{pnl(summary.total)}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <p className="text-[11px] text-[var(--muted)]">Win Rate</p>
            <p className="text-base font-semibold">{summary.winRate.toFixed(1)}%</p>
            <p className="text-[11px] text-[var(--muted)]">
              {summary.wins}W/{summary.losses}L
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <p className="text-[11px] text-[var(--muted)]">Open Trades</p>
            <p className="text-base font-semibold text-[var(--accent)]">{summary.open}</p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[var(--muted)]">Exposure</p>
              <p className="text-[11px] font-semibold">{openExposure.percent.toFixed(1)}%</p>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),#2dd4bf)]"
                style={{ width: `${Math.min(openExposure.percent, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{formatCurrency(openExposure.value)}</p>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex gap-1.5 overflow-auto pb-1">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  tab === tabItem.id
                    ? 'bg-[var(--surface-strong)] text-[var(--accent)] shadow-[0_8px_18px_rgba(30,64,175,0.25)]'
                    : tabItem.id === 'trades'
                      ? 'bg-[color:rgba(30,41,59,0.7)] text-[var(--text)]'
                      : 'text-[var(--muted)]'
                }`}
              >
                {tabItem.label}
                {tabItem.badge ? ` (${tabItem.badge})` : ''}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-2.5">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-start justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-card)]"
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
                    className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-black"
                  >
                    Done
                  </button>
                </div>
              ))}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-card)]">
                <p className="mb-2 text-xs uppercase text-[var(--muted)]">Cumulative Realized vs Provisional</p>
                <ResponsiveContainer width="100%" height={240}>
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
            <div className="space-y-2.5">
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search symbol"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                />
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                />
                <select
                  value={flt}
                  onChange={(event) => setFlt(event.target.value as FilterType)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                >
                  <option value="all">All P&amp;L</option>
                  <option value="wins">Winners</option>
                  <option value="losses">Losers</option>
                </select>
              </div>

              <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
                <p className="text-sm text-[var(--muted)]">
                  <Wallet size={12} className="mr-1 inline" />
                  Showing {activeTrades.length} active trades - PF Value{' '}
                  <span className="font-semibold text-[var(--text)]">{formatCurrency(portfolioValue)}</span>
                </p>
                <div className="hidden rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 md:block">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">P&amp;L Trend</p>
                  <div className="h-9">
                    {pnlSparkline.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pnlSparkline}>
                          <Line
                            dataKey="pnl"
                            stroke={summary.total >= 0 ? 'var(--positive)' : 'var(--negative)'}
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="pt-1 text-[11px] text-[var(--muted)]">Need more trades</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
                    <button
                      onClick={() => setTradeViewMode('card')}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                        tradeViewMode === 'card' ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      <LayoutGrid size={12} /> Card
                    </button>
                    <button
                      onClick={() => setTradeViewMode('compact')}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                        tradeViewMode === 'compact' ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      <List size={12} /> Compact
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      void refreshOpenTradeMarks();
                    }}
                    disabled={isRefreshingMarks}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={`mr-1 inline ${isRefreshingMarks ? 'animate-spin' : ''}`} />
                    {isRefreshingMarks ? 'Refreshing' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => exportTradesToCsv(trades)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                  >
                    <Download size={13} className="mr-1 inline" /> Export
                  </button>
                </div>
              </div>
              {activeTrades.length === 0 ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--muted)]">
                  No active trades match the current filters.
                </div>
              ) : null}

              {tradeViewMode === 'compact' ? (
                <div className="space-y-1.5">
                  {activeTrades.map((trade) => {
                    const remaining = getRemainingQuantity(trade);
                    return (
                      <article
                        key={trade.id}
                        className={`rounded-lg border border-[var(--border)] border-l-4 bg-[var(--surface-2)] px-2.5 py-2 shadow-[var(--shadow-card)] ${
                          trade.totalPnl >= 0 ? 'border-l-[var(--positive)]' : 'border-l-[var(--negative)]'
                        }`}
                      >
                        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text)]">{trade.symbol}</p>
                          <p className="truncate text-[11px] text-[var(--muted)]">
                            {trade.date} - {trade.direction.toUpperCase()} - Rem {remaining.toFixed(2)}
                          </p>
                          <p className={`text-xs font-semibold ${pnlClass(trade.totalPnl)}`}>{pnl(trade.totalPnl)}</p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-[color:rgba(250,204,21,0.2)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                              {trade.status}
                            </span>
                            <button
                              onClick={() => setManageTrade(trade)}
                              className="rounded-full bg-[color:rgba(96,165,250,0.18)] px-2 py-0.5 text-[10px] text-[color:rgba(125,211,252,1)]"
                            >
                              Partial / Close
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setEditTrade(trade);
                                setShowForm(true);
                              }}
                              className="rounded border border-[var(--border)] p-1"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button onClick={() => delTrade(trade.id)} className="rounded border border-[var(--border)] p-1">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}

              <div className={tradeViewMode === 'compact' ? 'hidden' : 'grid gap-2 lg:grid-cols-2'}>
                {activeTrades.map((trade) => {
                  const remaining = getRemainingQuantity(trade);
                  const positionValue = roundTo2(trade.entryPrice * trade.quantity);
                  const portfolioShare = portfolioValue > 0 ? roundTo2((positionValue / portfolioValue) * 100) : 0;
                  const exposureWidth = Math.max(0, Math.min(portfolioShare, 100));

                  return (
                    <article
                      key={trade.id}
                      className={`rounded-xl border border-[var(--border)] border-l-4 bg-[var(--surface-2)] p-3 shadow-[var(--shadow-card)] ${
                        trade.totalPnl >= 0 ? 'border-l-[var(--positive)]' : 'border-l-[var(--negative)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold">{trade.symbol}</p>
                          <p className="text-[11px] text-[var(--muted)]">
                            {trade.date} - {trade.direction.toUpperCase()}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              trade.status === 'open'
                                ? 'bg-[color:rgba(250,204,21,0.2)] text-[var(--accent)]'
                                : 'bg-[color:rgba(34,197,94,0.2)] text-[var(--positive)]'
                            }`}
                          >
                            {trade.status}
                          </span>
                          {trade.status === 'open' ? (
                            <button
                              onClick={() => setManageTrade(trade)}
                              className="rounded-full bg-[color:rgba(96,165,250,0.18)] px-2 py-0.5 text-[10px] text-[color:rgba(125,211,252,1)]"
                            >
                              Partial / Close
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
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs md:grid-cols-3">
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Entry</p>
                          <p>{formatCurrency(trade.entryPrice)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Qty</p>
                          <p>{trade.quantity.toFixed(2)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Remaining</p>
                          <p>{remaining.toFixed(2)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Mark</p>
                          <p>{trade.markPrice != null ? formatCurrency(trade.markPrice) : '-'}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Position Value</p>
                          <p>{formatCurrency(positionValue)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">PF Share</p>
                          <p>{portfolioShare.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="mt-2 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                          <span>Exposure</span>
                          <span>{portfolioShare.toFixed(2)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),#2dd4bf)]"
                            style={{ width: `${exposureWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[11px] text-[var(--muted)]">Realized</p>
                          <p className={pnlClass(trade.realizedPnl)}>{pnl(trade.realizedPnl)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[11px] text-[var(--muted)]">Unrealized</p>
                          <p className={pnlClass(trade.unrealizedPnl)}>{pnl(trade.unrealizedPnl)}</p>
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--muted)]">
                        <span>Total return: {trade.totalPnlPercent.toFixed(2)}%</span>
                        <span>Exit legs: {trade.exitLegs.length}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search symbol"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                />
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                />
                <select
                  value={flt}
                  onChange={(event) => setFlt(event.target.value as FilterType)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-sm"
                >
                  <option value="all">All P&amp;L</option>
                  <option value="wins">Winners</option>
                  <option value="losses">Losers</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="text-sm text-[var(--muted)]">
                  Showing {historyTrades.length} closed trades (fully executed)
                </p>
                <button
                  onClick={() => exportTradesToCsv(historyTrades)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                >
                  <Download size={13} className="mr-1 inline" /> Export History
                </button>
              </div>

              {historyTrades.length === 0 ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--muted)]">
                  No closed trades in history for current filters.
                </div>
              ) : null}

              <div className="grid gap-2 lg:grid-cols-2">
                {historyTrades.map((trade) => {
                  const closedOn = trade.exitLegs[trade.exitLegs.length - 1]?.date ?? trade.date;
                  const positionValue = roundTo2(trade.entryPrice * trade.quantity);
                  const portfolioShare = portfolioValue > 0 ? roundTo2((positionValue / portfolioValue) * 100) : 0;

                  return (
                    <article
                      key={trade.id}
                      className={`rounded-xl border border-[var(--border)] border-l-4 bg-[var(--surface-2)] p-3 shadow-[var(--shadow-card)] ${
                        trade.realizedPnl >= 0 ? 'border-l-[var(--positive)]' : 'border-l-[var(--negative)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold">{trade.symbol}</p>
                          <p className="text-[11px] text-[var(--muted)]">
                            Opened {trade.date} - Closed {closedOn}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="rounded-full bg-[color:rgba(34,197,94,0.2)] px-2 py-0.5 text-[10px] text-[var(--positive)]">
                            closed
                          </span>
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
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs md:grid-cols-3">
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Entry</p>
                          <p>{formatCurrency(trade.entryPrice)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Qty</p>
                          <p>{trade.quantity.toFixed(2)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Exit Legs</p>
                          <p>{trade.exitLegs.length}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Direction</p>
                          <p>{trade.direction.toUpperCase()}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">Position Value</p>
                          <p>{formatCurrency(positionValue)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[var(--muted)]">PF Share</p>
                          <p>{portfolioShare.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[11px] text-[var(--muted)]">Realized</p>
                          <p className={pnlClass(trade.realizedPnl)}>{pnl(trade.realizedPnl)}</p>
                        </div>
                        <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                          <p className="text-[11px] text-[var(--muted)]">Return</p>
                          <p className={pnlClass(trade.totalPnl)}>{trade.totalPnlPercent.toFixed(2)}%</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
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

          {tab === 'settings' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <h3 className="text-sm font-semibold">Trading Preferences</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Currency and PF value are saved locally and also synced to your account when signed in.
                </p>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--muted)]">Display Currency</span>
                    <select
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                    >
                      {MAJOR_CURRENCIES.map((currencyOption) => (
                        <option key={currencyOption.code} value={currencyOption.code}>
                          {currencyOption.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--muted)]">PF Value ({currency})</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={portfolioValueInput}
                      onChange={(event) => setPortfolioValueInput(event.target.value)}
                      onBlur={commitPortfolioValue}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitPortfolioValue();
                        }
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-3 space-y-2">
                  <label className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <span>Confirm before deleting trades</span>
                    <input
                      type="checkbox"
                      checked={confirmDelete}
                      onChange={(event) => setConfirmDelete(event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <span>Auto-refresh open marks on app start</span>
                    <input
                      type="checkbox"
                      checked={autoRefreshMarks}
                      onChange={(event) => setAutoRefreshMarks(event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <span>Analytics include unrealized P&amp;L</span>
                    <input
                      type="checkbox"
                      checked={useUnrealized}
                      onChange={(event) => setUseUnrealized(event.target.checked)}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <h3 className="text-sm font-semibold">Account Sync</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Sign in with Google to keep settings across devices. Sync runs automatically after each settings change.
                </p>

                {accountUser ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                    <p className="text-sm">
                      Signed in as <span className="font-semibold">{accountUser.email ?? accountUser.id}</span>
                    </p>
                    <button
                      onClick={() => {
                        void signOut();
                      }}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <LogOut size={14} className="mr-1 inline" /> Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                    <button
                      onClick={() => {
                        void signInWithGoogle();
                      }}
                      disabled={isSigningInWithGoogle}
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <LogIn size={14} className="mr-1 inline" /> {isSigningInWithGoogle ? 'Redirecting...' : 'Sign in with Google'}
                    </button>
                  </div>
                )}

                <p className="mt-3 text-xs text-[var(--muted)]">{authNotice}</p>
                {isSyncingSettings && isAuthReady && accountUser ? (
                  <p className="mt-1 text-xs text-[var(--accent)]">Syncing settings to account...</p>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      <button
        onClick={() => {
          setEditTrade(null);
          setShowForm(true);
        }}
        className="fixed bottom-24 right-4 z-50 flex h-12 items-center gap-2 rounded-full border border-[color:rgba(96,165,250,0.6)] bg-[linear-gradient(130deg,#22d3ee,#3b82f6)] px-4 text-sm font-semibold text-[#05101f] shadow-[0_14px_26px_rgba(37,99,235,0.35)] md:bottom-6"
      >
        <Plus size={17} />
        Add Trade
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[color:rgba(7,11,20,0.95)] px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-6 gap-1.5">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`rounded-lg px-1.5 py-2 text-xs ${
                tab === tabItem.id
                  ? 'bg-[var(--surface-strong)] text-[var(--accent)] shadow-[0_8px_18px_rgba(30,64,175,0.25)]'
                  : tabItem.id === 'trades'
                    ? 'bg-[color:rgba(30,41,59,0.7)] text-[var(--text)]'
                    : 'text-[var(--muted)]'
              }`}
            >
              {tabItem.id === 'goals' ? <Target size={13} className="mr-1 inline" /> : null}
              {tabItem.id === 'settings' ? <Settings size={13} className="mr-1 inline" /> : null}
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
          portfolioValue={portfolioValue}
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

      {needsCurrencyOnboarding ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-xl font-semibold">Choose Your Base Currency</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              This runs once on first open. You can change it later in Settings.
            </p>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
              className="mt-4 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            >
              {MAJOR_CURRENCIES.map((currencyOption) => (
                <option key={currencyOption.code} value={currencyOption.code}>
                  {currencyOption.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setNeedsCurrencyOnboarding(false)}
              className="mt-4 w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black"
            >
              Start Journal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

