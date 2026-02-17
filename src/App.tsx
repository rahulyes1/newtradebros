import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlarmClockCheck,
  BarChart3,
  CandlestickChart,
  Clock3,
  Download,
  Edit2,
  Globe2,
  Home,
  Inbox,
  Info,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  Wallet,
  X,
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
  PORTFOLIO_VALUE_STORAGE_KEY,
  type CurrencyCode,
} from './shared/config/tradingOptions';
import TradeFormModal, { type TradeFormPayload } from './features/trades/components/TradeFormModal';
import CloseTradeModal from './features/trades/components/CloseTradeModal';
import GoalsPanel from './features/goals/components/GoalsPanel';
import OnboardingWizard from './features/onboarding/components/OnboardingWizard';
import TodayPerformanceCard from './features/overview/components/TodayPerformanceCard';
import QuickStatsGrid from './features/overview/components/QuickStatsGrid';
import RecentTradesPreview from './features/overview/components/RecentTradesPreview';
import TradeCard from './features/trades/components/TradeCard';
import EmptyState from './shared/components/EmptyState';
import { supabase } from './supabaseClient';
import { Toaster, toast } from 'sonner';

type Tab = 'trades' | 'history' | 'overview' | 'analytics' | 'goals' | 'settings';
type FilterType = 'all' | 'wins' | 'losses';
type TradeViewMode = 'card' | 'compact';
type ContextTipKey = 'overview' | 'trades' | 'analytics';
type MetricContextTone = 'success' | 'warning' | 'muted';

const C = {
  grid: '#283243',
  text: '#9ca3af',
  realized: '#38bdf8',
  provisional: '#22c55e',
  pos: '#34d399',
  neg: '#f87171',
};
const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid rgba(118, 144, 180, 0.35)',
  borderRadius: '10px',
  color: '#e7eefb',
  padding: '8px 10px',
};
const CHART_LABEL_STYLE = { color: '#9fb0ca', fontSize: 12 };
const CHART_ITEM_STYLE = { color: '#e7eefb', fontSize: 12 };
const TAB_ICON_CLASS = 'mb-0.5 block md:mb-0';
const dateDisplayFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const periodNow = () => new Date().toISOString().slice(0, 7);
const pnlClass = (v: number) => (v >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]');
const CONFIRM_DELETE_STORAGE_KEY = 'settings.confirmDelete';
const AUTO_REFRESH_MARKS_STORAGE_KEY = 'settings.autoRefreshMarks';
const ANALYTICS_UNREALIZED_STORAGE_KEY = 'settings.analytics.includeUnrealized';
const HAS_SKIPPED_PORTFOLIO_VALUE_STORAGE_KEY = 'hasSkippedPortfolioValue';
const DISMISSED_PORTFOLIO_BANNER_STORAGE_KEY = 'dismissedPortfolioBanner';
const DISMISSED_AFTER_FIVE_TRADES_STORAGE_KEY = 'dismissedAfter5Trades';
const PORTFOLIO_NUDGE_DISMISS_DATE_STORAGE_KEY = 'portfolioNudgeDismissDate';
const OVERVIEW_TOOLTIP_DISMISSED_KEY = 'tooltipDismissed.overview';
const TRADES_TOOLTIP_DISMISSED_KEY = 'tooltipDismissed.trades';
const ANALYTICS_TOOLTIP_DISMISSED_KEY = 'tooltipDismissed.analytics';
const GOAL_LABELS: Record<GoalType, string> = {
  monthly_pnl: 'Monthly P&L',
  monthly_win_rate: 'Monthly Win Rate',
  monthly_trade_count: 'Monthly Trade Count',
};

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

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map((value) => Number.parseInt(value, 10));
  return new Date(year, month - 1, day);
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWithinLastDays(dateIso: string, days: number): boolean {
  const date = parseIsoDate(dateIso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return date >= start && date <= today;
}

function isWithinPastDayRange(dateIso: string, minDaysAgo: number, maxDaysAgo: number): boolean {
  const date = parseIsoDate(dateIso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const newest = new Date(today);
  newest.setDate(newest.getDate() - minDaysAgo);

  const oldest = new Date(today);
  oldest.setDate(oldest.getDate() - maxDaysAgo);

  return date >= oldest && date <= newest;
}

function formatTradeDate(dateIso: string): string {
  const date = parseIsoDate(dateIso);
  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  }
  if (date.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }
  return dateDisplayFormatter.format(date);
}

function getMetricContext(
  metricType: 'winRate' | 'totalPnL' | 'thisWeek' | 'openRisk' | 'realizedPnL' | 'todayPnL',
  value: number,
  additionalData: Record<string, number | boolean | string>
): { text: string; tone: MetricContextTone } {
  if (metricType === 'winRate') {
    const totalTrades = Number(additionalData.totalTrades ?? 0);
    const wins = Number(additionalData.wins ?? 0);
    const losses = Number(additionalData.losses ?? 0);
    if (totalTrades < 10) {
      return { text: `Only ${totalTrades} trades - need 10+ for reliable insight`, tone: 'muted' };
    }
    if (value < 40) {
      return { text: 'Below average - review your strategy', tone: 'warning' };
    }
    if (value > 60) {
      return { text: `Strong performance - ${wins}W / ${losses}L`, tone: 'success' };
    }
    return { text: `${wins}W / ${losses}L - room to improve`, tone: 'muted' };
  }

  if (metricType === 'totalPnL') {
    const pct = Number(additionalData.portfolioPct ?? 0);
    const trades = Number(additionalData.tradeCount ?? 0);
    return {
      text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% of portfolio • ${trades} trades`,
      tone: pct >= 0 ? 'success' : 'warning',
    };
  }

  if (metricType === 'thisWeek') {
    const pct = Number(additionalData.portfolioPct ?? 0);
    const count = Number(additionalData.weekTradeCount ?? 0);
    const deltaVsLastWeek = Number(additionalData.deltaVsLastWeek ?? 0);
    const trend = deltaVsLastWeek > 0 ? 'Up from last week' : deltaVsLastWeek < 0 ? 'Down from last week' : 'Flat vs last week';
    return {
      text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% • ${count} trades • ${trend}`,
      tone: pct >= 0 ? 'success' : 'warning',
    };
  }

  if (metricType === 'openRisk') {
    const openPositions = Number(additionalData.openPositions ?? 0);
    const riskPct = Number(additionalData.riskPct ?? 0);
    const riskLevel = riskPct < 20 ? 'Low risk' : riskPct < 50 ? 'Moderate risk' : riskPct < 75 ? 'High risk' : 'Very high risk';
    return {
      text: `${openPositions} position${openPositions === 1 ? '' : 's'} • ${riskLevel}`,
      tone: riskPct >= 50 ? 'warning' : riskPct < 20 ? 'success' : 'muted',
    };
  }

  if (metricType === 'realizedPnL') {
    const exitCount = Number(additionalData.exitCount ?? 0);
    if (exitCount <= 0) {
      return { text: '0 exits • Add exits to see average', tone: 'muted' };
    }
    const avgPerExitLabel = typeof additionalData.avgPerExitLabel === 'string'
      ? additionalData.avgPerExitLabel
      : Number(additionalData.avgPerExit ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return {
      text: `${exitCount} exits • Avg ${avgPerExitLabel} per exit`,
      tone: value >= 0 ? 'success' : 'warning',
    };
  }

  const hasTradesToday = Boolean(additionalData.hasTradesToday);
  const isBestDay = Boolean(additionalData.isBestDay);
  const isWorstDay = Boolean(additionalData.isWorstDay);
  const hasOnlyUnrealized = Boolean(additionalData.hasOnlyUnrealized);
  if (!hasTradesToday) {
    return { text: 'No trades today', tone: 'muted' };
  }
  if (hasOnlyUnrealized) {
    return { text: 'Unrealized gains only', tone: 'muted' };
  }
  if (isBestDay) {
    return { text: 'Best day this month!', tone: 'success' };
  }
  if (isWorstDay) {
    return { text: 'Tough day - tomorrow is new', tone: 'warning' };
  }
  return { text: "Today's performance", tone: 'muted' };
}

function metricContextClass(tone: MetricContextTone): string {
  if (tone === 'success') {
    return 'text-[var(--positive)]';
  }
  if (tone === 'warning') {
    return 'text-[var(--negative)]';
  }
  return 'text-[var(--muted)]';
}

interface PortfolioValueBannerProps {
  onSetValue: () => void;
  onDismiss: () => void;
}

function PortfolioValueBanner({ onSetValue, onDismiss }: PortfolioValueBannerProps) {
  return (
    <div className="mb-4 rounded-lg border border-[var(--accent)] bg-[color:rgba(125,211,252,0.12)] p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl" aria-hidden="true">
          {'\u{1F4CA}'}
        </div>
        <div className="flex-1">
          <h3 className="mb-1 font-semibold">Unlock Advanced Metrics</h3>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Set your portfolio value to see returns as %, position sizing, and risk management insights.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSetValue}
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
            >
              Set Portfolio Value
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PortfolioValueNudgeModalProps {
  currentPnL: number;
  currency: CurrencyCode;
  formatCurrency: (value: number) => string;
  onSet: (value: number) => void;
  onDismiss: () => void;
}

function PortfolioValueNudgeModal({
  currentPnL,
  currency,
  formatCurrency,
  onSet,
  onDismiss,
}: PortfolioValueNudgeModalProps) {
  const [inputValue, setInputValue] = useState('');

  const presets = [10000, 50000, 100000, 500000];

  const currencySymbol = useMemo(
    () =>
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value || currency,
    [currency]
  );

  const handleSave = () => {
    const value = Number.parseFloat(inputValue);
    if (value > 0) {
      onSet(roundTo2(value));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-center text-4xl" aria-hidden="true">
          {'\u{1F4C8}'}
        </div>
        <h2 className="mb-2 text-center text-xl font-bold">You're Making Progress!</h2>
        <p className="mb-4 text-center text-sm text-[var(--muted)]">
          You've logged 5 trades. Ready to unlock advanced insights?
        </p>

        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="mb-2 text-sm font-semibold">Set your portfolio value to see:</p>
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            <li>• Your actual % returns</li>
            <li className="flex items-center gap-2">
              <span>Currently: {formatCurrency(currentPnL)} = </span>
              <span className="rounded bg-[var(--accent)]/20 px-2 py-0.5 text-xs text-[var(--accent)]">?%</span>
            </li>
            <li>• Position sizing recommendations</li>
            <li>• Risk management insights</li>
          </ul>
        </div>

        <input
          type="number"
          min="0"
          step="0.01"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={`Portfolio value (${currencySymbol})`}
          className="mb-3 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm"
        />

        <div className="mb-4">
          <div className="mb-2 text-xs text-[var(--muted)]">Quick presets:</div>
          <div className="grid grid-cols-4 gap-2">
            {presets.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInputValue(String(value))}
                className="min-h-10 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs hover:border-[var(--accent)]"
              >
                {currencySymbol}
                {value >= 1000000
                  ? `${(value / 1000000).toFixed(0)}M`
                  : value >= 100000
                    ? `${(value / 100000).toFixed(0)}L`
                    : `${(value / 1000).toFixed(0)}K`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!inputValue || Number.parseFloat(inputValue) <= 0}
            className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            Set Portfolio Value
          </button>
        </div>
      </div>
    </div>
  );
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
  const [hasSkippedPortfolioValue, setHasSkippedPortfolioValue] = useState<boolean>(() =>
    getInitialBoolean(HAS_SKIPPED_PORTFOLIO_VALUE_STORAGE_KEY, false)
  );
  const [dismissedPortfolioBanner, setDismissedPortfolioBanner] = useState<boolean>(() =>
    getInitialBoolean(DISMISSED_PORTFOLIO_BANNER_STORAGE_KEY, false)
  );
  const [dismissedAfter5Trades, setDismissedAfter5Trades] = useState<boolean>(() =>
    getInitialBoolean(DISMISSED_AFTER_FIVE_TRADES_STORAGE_KEY, false)
  );
  const [showPortfolioNudgeModal, setShowPortfolioNudgeModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(() => getInitialBoolean(CONFIRM_DELETE_STORAGE_KEY, true));
  const [autoRefreshMarks, setAutoRefreshMarks] = useState<boolean>(() => getInitialBoolean(AUTO_REFRESH_MARKS_STORAGE_KEY, false));
  const [tab, setTab] = useState<Tab>('trades');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [flt, setFlt] = useState<FilterType>('all');
  const [useUnrealized, setUseUnrealized] = useState<boolean>(() => getInitialBoolean(ANALYTICS_UNREALIZED_STORAGE_KEY, true));
  const [isRefreshingMarks, setIsRefreshingMarks] = useState(false);
  const [markRefreshError, setMarkRefreshError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [manageTrade, setManageTrade] = useState<Trade | null>(null);
  const [tradeViewMode, setTradeViewMode] = useState<TradeViewMode>('card');
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [activeContextTip, setActiveContextTip] = useState<ContextTipKey | null>(null);
  const [dismissedContextTips, setDismissedContextTips] = useState<Record<ContextTipKey, boolean>>(() => ({
    overview: getInitialBoolean(OVERVIEW_TOOLTIP_DISMISSED_KEY, false),
    trades: getInitialBoolean(TRADES_TOOLTIP_DISMISSED_KEY, false),
    analytics: getInitialBoolean(ANALYTICS_TOOLTIP_DISMISSED_KEY, false),
  }));
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);
  const [isSyncingSettings, setIsSyncingSettings] = useState(false);
  const [hasDoneInitialAutoRefresh, setHasDoneInitialAutoRefresh] = useState(false);
  const [toastPosition, setToastPosition] = useState<'bottom-center' | 'top-right'>(() =>
    window.innerWidth >= 768 ? 'top-right' : 'bottom-center'
  );
  const refreshToastIdRef = useRef<string | number | null>(null);
  const announcedGoalIdsRef = useRef<Set<string>>(new Set());

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
  const formatCurrencyCompact = (value: number): string => {
    const absCompact = compactNumberFormatter.format(Math.abs(value));
    return `${value < 0 ? '-' : ''}${currencySign}${absCompact}`;
  };

  const pushToast = (kind: 'success' | 'error' | 'info' | 'warning', message: string, description?: string) => {
    if (kind === 'success') {
      toast.success(message, { description });
      return;
    }
    if (kind === 'error') {
      toast.error(message, { description });
      return;
    }
    if (kind === 'warning') {
      toast.warning(message, { description });
      return;
    }
    toast(message, { description });
  };

  const dismissContextTip = (tip: ContextTipKey) => {
    setDismissedContextTips((prev) => ({ ...prev, [tip]: true }));
    if (activeContextTip === tip) {
      setActiveContextTip(null);
    }
  };

  const tabIcon = (tabId: Tab, size = 13) => {
    if (tabId === 'trades') {
      return <List size={size} className={TAB_ICON_CLASS} />;
    }
    if (tabId === 'history') {
      return <Clock3 size={size} className={TAB_ICON_CLASS} />;
    }
    if (tabId === 'overview') {
      return <Home size={size} className={TAB_ICON_CLASS} />;
    }
    if (tabId === 'analytics') {
      return <BarChart3 size={size} className={TAB_ICON_CLASS} />;
    }
    if (tabId === 'goals') {
      return <Target size={size} className={TAB_ICON_CLASS} />;
    }
    return <Settings size={size} className={TAB_ICON_CLASS} />;
  };

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
      setHasSkippedPortfolioValue(false);
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
    if (needsCurrencyOnboarding) {
      return;
    }
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [currency, needsCurrencyOnboarding]);

  useEffect(() => {
    if (needsCurrencyOnboarding) {
      return;
    }
    try {
      localStorage.setItem(PORTFOLIO_VALUE_STORAGE_KEY, String(portfolioValue));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [portfolioValue, needsCurrencyOnboarding]);

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
    try {
      localStorage.setItem(HAS_SKIPPED_PORTFOLIO_VALUE_STORAGE_KEY, String(hasSkippedPortfolioValue));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [hasSkippedPortfolioValue]);

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_PORTFOLIO_BANNER_STORAGE_KEY, String(dismissedPortfolioBanner));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [dismissedPortfolioBanner]);

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_AFTER_FIVE_TRADES_STORAGE_KEY, String(dismissedAfter5Trades));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [dismissedAfter5Trades]);

  useEffect(() => {
    if (portfolioValue > 0) {
      setHasSkippedPortfolioValue(false);
      setShowPortfolioNudgeModal(false);
    }
  }, [portfolioValue]);

  useEffect(() => {
    try {
      const lastDismissDateRaw = localStorage.getItem(PORTFOLIO_NUDGE_DISMISS_DATE_STORAGE_KEY);
      const lastDismissDate = lastDismissDateRaw ? Number.parseInt(lastDismissDateRaw, 10) : Number.NaN;
      if (Number.isFinite(lastDismissDate)) {
        const daysSince = (Date.now() - lastDismissDate) / (1000 * 60 * 60 * 24);
        if (daysSince > 30) {
          setDismissedPortfolioBanner(false);
          setDismissedAfter5Trades(false);
        }
      }
    } catch {
      // Ignore localStorage read errors.
    }

    if (trades.length % 10 === 0 && trades.length > 5) {
      setDismissedPortfolioBanner(false);
      setDismissedAfter5Trades(false);
    }
  }, [trades.length]);

  useEffect(() => {
    if (!dismissedPortfolioBanner && !dismissedAfter5Trades) {
      return;
    }
    try {
      localStorage.setItem(PORTFOLIO_NUDGE_DISMISS_DATE_STORAGE_KEY, Date.now().toString());
    } catch {
      // Ignore localStorage write errors.
    }
  }, [dismissedAfter5Trades, dismissedPortfolioBanner]);

  useEffect(() => {
    try {
      localStorage.setItem(OVERVIEW_TOOLTIP_DISMISSED_KEY, String(dismissedContextTips.overview));
      localStorage.setItem(TRADES_TOOLTIP_DISMISSED_KEY, String(dismissedContextTips.trades));
      localStorage.setItem(ANALYTICS_TOOLTIP_DISMISSED_KEY, String(dismissedContextTips.analytics));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [dismissedContextTips]);

  useEffect(() => {
    if (needsCurrencyOnboarding) {
      return;
    }
    if (tab === 'overview' && !dismissedContextTips.overview) {
      setActiveContextTip('overview');
      return;
    }
    if (tab === 'trades' && !dismissedContextTips.trades) {
      setActiveContextTip('trades');
      return;
    }
    if (tab === 'analytics' && trades.length >= 5 && !dismissedContextTips.analytics) {
      setActiveContextTip('analytics');
      return;
    }
    setActiveContextTip(null);
  }, [dismissedContextTips, needsCurrencyOnboarding, tab, trades.length]);

  useEffect(() => {
    if (!activeContextTip) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDismissedContextTips((prev) => ({ ...prev, [activeContextTip]: true }));
      setActiveContextTip(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [activeContextTip]);

  useEffect(() => {
    if (!accountUser || !isAuthReady) {
      return;
    }

    let isCurrent = true;
    const timer = window.setTimeout(async () => {
      setIsSyncingSettings(true);
      const syncToastId = toast.loading('Syncing settings...');
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
        toast.dismiss(syncToastId);
        return;
      }

      if (error) {
        setAuthNotice(`Signed in, but settings sync failed: ${error.message}`);
        toast.error('Sync Failed', {
          id: syncToastId,
          description: 'Try again later or check settings',
        });
      } else if (data.user) {
        setAccountUser(data.user);
        toast.success('Settings Saved', {
          id: syncToastId,
          description: 'Synced to your account',
        });
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

  useEffect(() => {
    setExpandedTradeId(null);
  }, [tab, tradeViewMode]);

  useEffect(() => {
    const updateToastPosition = () => {
      setToastPosition(window.innerWidth >= 768 ? 'top-right' : 'bottom-center');
    };
    window.addEventListener('resize', updateToastPosition);
    return () => window.removeEventListener('resize', updateToastPosition);
  }, []);

  const submitTrade = (payload: TradeFormPayload) => {
    try {
      const isCreate = payload.mode === 'create';
      const next = payload.mode === 'create'
        ? tradeRepo.createOpenTrade(payload.data)
        : payload.tradeId
          ? tradeRepo.updateTrade(payload.tradeId, payload.data)
          : trades;

      if (isCreate) {
        const newTradesLength = next.length;
        const isNudgeTradeMilestone = newTradesLength >= 5 && (newTradesLength - 5) % 10 === 0;
        if (isNudgeTradeMilestone && hasSkippedPortfolioValue && portfolioValue === 0 && !dismissedAfter5Trades) {
          setShowPortfolioNudgeModal(true);
        }

        if (portfolioValue > 0 && payload.mode === 'create') {
          const positionValue = payload.data.entryPrice * payload.data.quantity;
          const positionShare = (positionValue / portfolioValue) * 100;
          if (positionShare >= 50) {
            pushToast('warning', 'Large Position', `This is ${positionShare.toFixed(1)}% of your portfolio.`);
          }
        }
      }

      setTrades(next);
      setShowForm(false);
      setEditTrade(null);

      if (payload.mode === 'create') {
        pushToast('success', 'Trade Added', `${payload.data.symbol.toUpperCase()} ${payload.data.direction.toUpperCase()} position opened.`);
      } else {
        pushToast('success', 'Trade Updated', 'Changes saved successfully.');
      }

      if (portfolioValue > 0) {
        const nextOpenExposureValue = next
          .filter((trade) => trade.status === 'open')
          .reduce((sum, trade) => sum + trade.entryPrice * getRemainingQuantity(trade), 0);
        const nextOpenExposurePct = (nextOpenExposureValue / portfolioValue) * 100;
        if (nextOpenExposurePct >= 75) {
          pushToast('warning', 'High Risk Alert', `Open exposure is now ${nextOpenExposurePct.toFixed(1)}% of portfolio.`);
        }
      }
    } catch {
      pushToast('error', 'Invalid Trade Data', 'Please review your trade inputs and try again.');
    }
  };

  const performDeleteTrade = (id: string) => {
    const deleted = trades.find((trade) => trade.id === id);
    if (!deleted) {
      return;
    }
    const next = tradeRepo.deleteTrade(id);
    setTrades(next);
    toast('Trade Deleted', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          const restored = [deleted, ...next];
          tradeRepo.saveTrades(restored);
          setTrades(restored);
          toast.success('Trade Restored');
        },
      },
    });
  };

  const delTrade = (id: string) => {
    if (confirmDelete) {
      toast('Delete this trade?', {
        description: 'This action cannot be undone.',
        duration: 6000,
        action: {
          label: 'Delete',
          onClick: () => performDeleteTrade(id),
        },
        cancel: {
          label: 'Cancel',
          onClick: () => {
            // no-op
          },
        },
      });
      return;
    }
    performDeleteTrade(id);
  };

  const addLeg = (id: string, leg: AddExitLegInput) => {
    const next = tradeRepo.addExitLeg(id, leg);
    setTrades(next);
    const updated = next.find((trade) => trade.id === id) ?? null;
    setManageTrade(updated?.status === 'open' ? updated : null);
    pushToast('success', 'Exit Saved', 'Exit leg saved successfully.');
  };

  const saveMark = (id: string, mark: number | undefined) => {
    const next = tradeRepo.updateMarkPrice(id, mark);
    setTrades(next);
    const updated = next.find((trade) => trade.id === id) ?? null;
    setManageTrade(updated?.status === 'open' ? updated : null);
    pushToast('info', mark == null ? 'Mark Price Cleared' : 'Mark Price Updated');
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
        pushToast('info', 'No Open Positions', 'No open trades available for mark refresh.');
      }
      return;
    }

    setMarkRefreshError('');
    setIsRefreshingMarks(true);
    if (!options?.silentIfNoOpen) {
      refreshToastIdRef.current = toast.loading('Refreshing prices...', {
        description: 'Fetching latest market marks',
      });
    }
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
        toast.error('Couldn\'t Refresh Prices', {
          id: refreshToastIdRef.current ?? undefined,
          description: 'No symbol quotes were returned.',
        });
      } else if (!options?.silentIfNoOpen) {
        toast.success('Prices Updated', {
          id: refreshToastIdRef.current ?? undefined,
          description: `${Object.keys(pricesBySymbol).length} positions refreshed`,
        });
      }
    } catch {
      setMarkRefreshError('Could not refresh prices. Check your connection and try again.');
      if (!options?.silentIfNoOpen) {
        toast.error('Couldn\'t Refresh Prices', {
          id: refreshToastIdRef.current ?? undefined,
          description: 'Check your internet connection',
        });
      }
    } finally {
      refreshToastIdRef.current = null;
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
      pushToast('error', 'Sign-in failed', 'Please try again.');
    } else {
      setAuthNotice(`Redirecting to Google sign-in...`);
      pushToast('info', 'Redirecting to Google sign-in...');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthNotice(`Sign out failed: ${error.message}`);
      pushToast('error', 'Sign out failed', 'Please try again.');
    } else {
      pushToast('success', 'Signed out.');
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
    setHasSkippedPortfolioValue(false);
    setDismissedPortfolioBanner(false);
    setDismissedAfter5Trades(false);
    pushToast('success', 'Settings Saved', accountUser ? 'Synced to your account' : 'Saved on this device');
  };

  const handleExportTrades = (rows: Trade[]) => {
    if (rows.length === 0) {
      pushToast('error', 'Export failed', 'No trades available to export.');
      return;
    }
    try {
      exportTradesToCsv(rows);
      const filename = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
      pushToast('success', 'CSV Exported', `${filename} downloaded`);
    } catch {
      pushToast('error', 'Export failed', 'Could not generate CSV file.');
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

  const todayPnl = useMemo(() => {
    const today = localIsoDate(new Date());
    return roundTo2(trades.filter((trade) => trade.date === today).reduce((sum, trade) => sum + trade.totalPnl, 0));
  }, [trades]);

  const thisWeekPnl = useMemo(
    () => roundTo2(trades.filter((trade) => isWithinLastDays(trade.date, 7)).reduce((sum, trade) => sum + trade.totalPnl, 0)),
    [trades]
  );

  const todayPnlPercent = portfolioValue > 0 ? roundTo2((todayPnl / portfolioValue) * 100) : null;
  const thisWeekPnlPercent = portfolioValue > 0 ? roundTo2((thisWeekPnl / portfolioValue) * 100) : null;
  const totalPnlPercentOfPortfolio = portfolioValue > 0 ? roundTo2((summary.total / portfolioValue) * 100) : null;
  const weekTradeCount = useMemo(() => trades.filter((trade) => isWithinLastDays(trade.date, 7)).length, [trades]);
  const lastWeekPnl = useMemo(
    () => roundTo2(trades.filter((trade) => isWithinPastDayRange(trade.date, 7, 13)).reduce((sum, trade) => sum + trade.totalPnl, 0)),
    [trades]
  );
  const lastWeekDelta = roundTo2(thisWeekPnl - lastWeekPnl);
  const exitCount = useMemo(() => trades.reduce((sum, trade) => sum + trade.exitLegs.length, 0), [trades]);
  const avgRealizedPerExit = exitCount > 0 ? roundTo2(summary.realized / exitCount) : 0;
  const avgRealizedPerExitLabel = `${avgRealizedPerExit >= 0 ? '+' : ''}${formatCurrency(avgRealizedPerExit)}`;

  const currentMonthDayPnls = useMemo(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const map = new Map<string, number>();
    trades
      .filter((trade) => trade.date.startsWith(month))
      .forEach((trade) => {
        map.set(trade.date, roundTo2((map.get(trade.date) ?? 0) + trade.totalPnl));
      });
    return Array.from(map.values());
  }, [trades]);

  const todayTrades = useMemo(() => {
    const today = localIsoDate(new Date());
    return trades.filter((trade) => trade.date === today);
  }, [trades]);

  const todayContext = useMemo(
    () =>
      getMetricContext('todayPnL', todayPnl, {
        hasTradesToday: todayTrades.length > 0,
        hasOnlyUnrealized: todayTrades.length > 0 && todayTrades.every((trade) => trade.realizedPnl === 0 && trade.unrealizedPnl !== 0),
        isBestDay: currentMonthDayPnls.length > 1 && todayPnl > 0 && todayPnl === Math.max(...currentMonthDayPnls),
        isWorstDay: currentMonthDayPnls.length > 1 && todayPnl < 0 && todayPnl === Math.min(...currentMonthDayPnls),
      }),
    [currentMonthDayPnls, todayPnl, todayTrades]
  );

  const winRateContext = useMemo(
    () =>
      getMetricContext('winRate', summary.winRate, {
        totalTrades: trades.length,
        wins: summary.wins,
        losses: summary.losses,
      }),
    [summary.losses, summary.winRate, summary.wins, trades.length]
  );

  const totalPnlContext = useMemo(
    () => {
      if (portfolioValue <= 0 || totalPnlPercentOfPortfolio == null) {
        return { text: `Set portfolio value to see % • ${trades.length} trades`, tone: 'muted' as const };
      }
      return getMetricContext('totalPnL', summary.total, {
        portfolioPct: totalPnlPercentOfPortfolio,
        tradeCount: trades.length,
      });
    },
    [portfolioValue, summary.total, totalPnlPercentOfPortfolio, trades.length]
  );

  const thisWeekContext = useMemo(
    () => {
      if (portfolioValue <= 0 || thisWeekPnlPercent == null) {
        return { text: `${weekTradeCount} trades this week • set portfolio for %`, tone: 'muted' as const };
      }
      return getMetricContext('thisWeek', thisWeekPnl, {
        portfolioPct: thisWeekPnlPercent,
        weekTradeCount,
        deltaVsLastWeek: lastWeekDelta,
      });
    },
    [portfolioValue, thisWeekPnl, thisWeekPnlPercent, weekTradeCount, lastWeekDelta]
  );

  const openRiskContext = useMemo(
    () =>
      getMetricContext('openRisk', openExposure.percent, {
        riskPct: openExposure.percent,
        openPositions: summary.open,
      }),
    [openExposure.percent, summary.open]
  );

  const realizedPnlContext = useMemo(
    () =>
      getMetricContext('realizedPnL', summary.realized, {
        exitCount,
        avgPerExitLabel: avgRealizedPerExitLabel,
      }),
    [avgRealizedPerExitLabel, exitCount, summary.realized]
  );

  const recentTrades = useMemo(
    () => [...trades].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [trades]
  );

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
  const hasTradeFilters = Boolean(search || from || to || flt !== 'all');

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

  useEffect(() => {
    goalProgress.forEach((progressItem) => {
      if (progressItem.status !== 'achieved') {
        return;
      }
      if (announcedGoalIdsRef.current.has(progressItem.goal.id)) {
        return;
      }
      announcedGoalIdsRef.current.add(progressItem.goal.id);
      pushToast('success', 'Goal Achieved!', `${GOAL_LABELS[progressItem.goal.type]} target reached.`);
    });
  }, [goalProgress]);

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
              <p className="ui-label">Total P&amp;L</p>
              <p className={`ui-number text-xl font-semibold ${pnlClass(summary.total)}`}>{pnl(summary.total)}</p>
            </div>
            {isSyncingSettings && isAuthReady && accountUser ? (
              <p className="mt-1 text-[11px] text-[var(--accent)]">Syncing settings to account...</p>
            ) : null}
          </div>
        </header>

        {activeContextTip ? (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-[color:rgba(125,211,252,0.35)] bg-[color:rgba(12,74,110,0.35)] px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <Info size={14} className="mt-0.5 text-[var(--accent)]" />
              <p className="text-[var(--text)]">
                {activeContextTip === 'overview' ? 'This is your command center. Start with today, then scan quick stats and recent trades.' : null}
                {activeContextTip === 'trades' ? 'All your trades are here. Tap any card to expand full details.' : null}
                {activeContextTip === 'analytics' ? 'Great progress. Analytics now shows deeper insight into your trading behavior.' : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismissContextTip(activeContextTip)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:text-[var(--text)]"
              aria-label="Dismiss tip"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

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
                <span className="inline-flex items-center gap-1.5">
                  {tabIcon(tabItem.id, 13)}
                  <span>{tabItem.label}</span>
                  {tabItem.badge ? <span className="text-[11px] text-[var(--muted)]">{tabItem.badge}</span> : null}
                </span>
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-3">
              {portfolioValue === 0 && hasSkippedPortfolioValue && !dismissedPortfolioBanner ? (
                <PortfolioValueBanner
                  onSetValue={() => {
                    setTab('settings');
                  }}
                  onDismiss={() => setDismissedPortfolioBanner(true)}
                />
              ) : null}

              <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
                <TodayPerformanceCard
                  todayPnl={todayPnl}
                  todayPnlPercent={todayPnlPercent}
                  openPositions={summary.open}
                  currency={currency}
                  compactPortfolioValue={compactPortfolioValue}
                  formatCurrency={formatCurrency}
                  contextText={todayContext.text}
                  contextClassName={metricContextClass(todayContext.tone)}
                />
                <QuickStatsGrid
                  items={[
                    {
                      label: 'Total P&L',
                      value: `${summary.total >= 0 ? '+' : '-'}${formatCurrencyCompact(Math.abs(summary.total))}`,
                      valueClassName: pnlClass(summary.total),
                      subValue: totalPnlContext.text,
                      subValueClassName: metricContextClass(totalPnlContext.tone),
                    },
                    {
                      label: 'Win Rate',
                      value: `${summary.winRate.toFixed(1)}%`,
                      subValue: winRateContext.text,
                      subValueClassName: metricContextClass(winRateContext.tone),
                    },
                    {
                      label: 'This Week',
                      value: `${thisWeekPnl >= 0 ? '+' : '-'}${formatCurrencyCompact(Math.abs(thisWeekPnl))}`,
                      valueClassName: pnlClass(thisWeekPnl),
                      subValue: thisWeekContext.text,
                      subValueClassName: metricContextClass(thisWeekContext.tone),
                    },
                    {
                      label: 'Open Risk',
                      value: `${formatCurrency(openExposure.value)} (${portfolioValue > 0 ? `${openExposure.percent.toFixed(1)}%` : '--'})`,
                      subValue: portfolioValue > 0 ? openRiskContext.text : 'Set portfolio value to unlock %',
                      subValueClassName: portfolioValue > 0 ? metricContextClass(openRiskContext.tone) : 'text-[var(--muted)]',
                    },
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTab('trades')}
                  className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium"
                >
                  View All Trades
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditTrade(null);
                    setShowForm(true);
                  }}
                  className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium"
                >
                  Add Trade
                </button>
              </div>

              {recentTrades.length > 0 ? (
                <RecentTradesPreview
                  trades={recentTrades}
                  formatCurrency={formatCurrency}
                  onSelectTrade={(tradeId) => {
                    setTab('trades');
                    setTradeViewMode('card');
                    setExpandedTradeId(tradeId);
                  }}
                  onViewAllTrades={() => setTab('trades')}
                />
              ) : (
                <EmptyState
                  icon={<CandlestickChart size={64} className="empty-icon-float" />}
                  title="Start Your Trading Journey"
                  description="Track every trade, analyze your performance, and improve your trading decisions over time."
                  action={{
                    label: 'Add Your First Trade',
                    onClick: () => {
                      setEditTrade(null);
                      setShowForm(true);
                    },
                  }}
                />
              )}

              {reminders.length > 0 ? (
                <div className="space-y-2">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-start justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          <AlarmClockCheck size={14} className="mr-1 inline text-[var(--accent)]" />
                          {reminder.title}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{reminder.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          completeReminder(reminder.kind);
                          setReminders(listActiveReminders());
                        }}
                        className="min-h-11 rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-black"
                      >
                        Done
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<AlarmClockCheck size={52} />}
                  title="No Active Reminders"
                  description="Set reminders to review trades or check on open positions."
                  action={{
                    label: 'Create Reminder',
                    onClick: () => {
                      pushToast('info', 'Weekly and month-end reminders are created automatically.');
                    },
                  }}
                />
              )}
            </div>
          )}

                    {tab === 'trades' && (
            <div className="space-y-2.5">
              <div className="grid gap-2 md:grid-cols-4">
                <label className="relative block">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-[var(--muted)]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search symbol"
                    className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-3)] pl-8 pr-2.5 text-sm"
                  />
                </label>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
                />
                <select
                  value={flt}
                  onChange={(event) => setFlt(event.target.value as FilterType)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
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
                      className={`flex h-11 items-center gap-1 rounded-md px-2 text-xs ${
                        tradeViewMode === 'card' ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      <LayoutGrid size={12} /> Card
                    </button>
                    <button
                      onClick={() => setTradeViewMode('compact')}
                      className={`flex h-11 items-center gap-1 rounded-md px-2 text-xs ${
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
                    className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={`mr-1 inline ${isRefreshingMarks ? 'animate-spin' : ''}`} />
                    {isRefreshingMarks ? 'Refreshing' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => handleExportTrades(trades)}
                    className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                  >
                    <Download size={13} className="mr-1 inline" /> Export
                  </button>
                </div>
              </div>

              {isRefreshingMarks ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--muted)]">
                  <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-[var(--accent)]" />
                  <p className="font-semibold text-[var(--text)]">Refreshing Market Prices...</p>
                  <p className="mt-1 text-xs">This may take a few seconds.</p>
                </div>
              ) : null}

              {markRefreshError ? (
                <div className="rounded-lg border border-[color:rgba(248,113,113,0.5)] bg-[color:rgba(127,29,29,0.25)] p-3 text-sm">
                  <p className="font-semibold text-[color:#fecaca]">Couldn't Refresh Prices</p>
                  <p className="mt-1 text-[color:#fecaca]">{markRefreshError}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void refreshOpenTradeMarks();
                      }}
                      className="min-h-11 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
                    >
                      Try Again
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarkRefreshError('')}
                      className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}

              {trades.length === 0 ? (
                <EmptyState
                  icon={<CandlestickChart size={64} className="empty-icon-float" />}
                  title="Start Your Trading Journey"
                  description="Track every trade, analyze your performance, and improve your trading decisions over time."
                  action={{
                    label: 'Add Your First Trade',
                    onClick: () => {
                      setEditTrade(null);
                      setShowForm(true);
                    },
                  }}
                />
              ) : activeTrades.length === 0 ? (
                hasTradeFilters ? (
                  <EmptyState
                    icon={<Search size={58} />}
                    title={`No trades found${search ? ` for "${search}"` : ''}`}
                    description="Try searching by symbol, use partial matches, or clear filters to see more trades."
                    action={{
                      label: 'Clear Search',
                      onClick: () => {
                        setSearch('');
                        setFrom('');
                        setTo('');
                        setFlt('all');
                      },
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={<Inbox size={54} />}
                    title="No Open Trades Right Now"
                    description="Your open positions will appear here. You can add a new trade to continue tracking."
                    action={{
                      label: 'Add Trade',
                      onClick: () => {
                        setEditTrade(null);
                        setShowForm(true);
                      },
                    }}
                  />
                )
              ) : tradeViewMode === 'compact' ? (
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-card)]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid grid-cols-[90px_64px_90px_70px_120px_76px_124px] gap-2 border-b border-[var(--border)] px-2 py-2">
                        <p className="ui-label">Symbol</p>
                        <p className="ui-label">Side</p>
                        <p className="ui-label">Entry</p>
                        <p className="ui-label">Qty</p>
                        <p className="ui-label">P&amp;L</p>
                        <p className="ui-label">%</p>
                        <p className="ui-label text-right">Actions</p>
                      </div>
                      {activeTrades.map((trade) => (
                        <div
                          key={trade.id}
                          className={`grid grid-cols-[90px_64px_90px_70px_120px_76px_124px] items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 last:border-b-0 ${
                            trade.totalPnl >= 0 ? 'border-l-2 border-l-[var(--positive)]' : 'border-l-2 border-l-[var(--negative)]'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{trade.symbol}</p>
                            <p className="truncate text-[10px] text-[var(--muted)]">{formatTradeDate(trade.date)}</p>
                          </div>
                          <p className="text-xs uppercase text-[var(--muted)]">{trade.direction === 'long' ? 'LONG' : 'SHORT'}</p>
                          <p className="text-xs ui-number">{formatCurrency(trade.entryPrice)}</p>
                          <p className="text-xs ui-number">{trade.quantity.toFixed(2)}</p>
                          <p className={`text-xs font-semibold ui-number ${pnlClass(trade.totalPnl)}`}>{pnl(trade.totalPnl)}</p>
                          <p className={`text-xs ui-number ${pnlClass(trade.totalPnl)}`}>{trade.totalPnlPercent.toFixed(2)}%</p>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setManageTrade(trade)}
                              className="h-11 rounded-full bg-[color:rgba(245,158,11,0.18)] px-2.5 text-[10px] font-medium text-[color:#fbbf24] transition hover:brightness-110"
                            >
                              Manage
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditTrade(trade);
                                setShowForm(true);
                              }}
                              className="h-11 w-11 rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
                            >
                              <Edit2 size={12} className="mx-auto" />
                            </button>
                            <button
                              type="button"
                              onClick={() => delTrade(trade.id)}
                              className="h-11 w-11 rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--negative)]"
                            >
                              <Trash2 size={12} className="mx-auto" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {activeTrades.map((trade) => (
                    <TradeCard
                      key={trade.id}
                      trade={trade}
                      isExpanded={expandedTradeId === trade.id}
                      portfolioValue={portfolioValue}
                      formatCurrency={formatCurrency}
                      formatTradeDate={formatTradeDate}
                      onToggle={(tradeId) => setExpandedTradeId((prev) => (prev === tradeId ? null : tradeId))}
                      onEdit={(tradeId) => {
                        const selected = activeTrades.find((item) => item.id === tradeId);
                        if (!selected) {
                          return;
                        }
                        setEditTrade(selected);
                        setShowForm(true);
                      }}
                      onDelete={(tradeId) => delTrade(tradeId)}
                      onManage={(tradeId) => {
                        const selected = activeTrades.find((item) => item.id === tradeId);
                        if (!selected) {
                          return;
                        }
                        setManageTrade(selected);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

                    {tab === 'history' && (
            <div className="space-y-2.5">
              <div className="grid gap-2 md:grid-cols-4">
                <label className="relative block">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-[var(--muted)]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search symbol"
                    className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-3)] pl-8 pr-2.5 text-sm"
                  />
                </label>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
                />
                <select
                  value={flt}
                  onChange={(event) => setFlt(event.target.value as FilterType)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
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
                  onClick={() => handleExportTrades(historyTrades)}
                  className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                >
                  <Download size={13} className="mr-1 inline" /> Export History
                </button>
              </div>

              {historyTrades.length === 0 ? (
                hasTradeFilters ? (
                  <EmptyState
                    icon={<Search size={58} />}
                    title={`No trades found${search ? ` for "${search}"` : ''}`}
                    description="Try searching for a different symbol or clear filters to view your closed trades."
                    action={{
                      label: 'Clear Search',
                      onClick: () => {
                        setSearch('');
                        setFrom('');
                        setTo('');
                        setFlt('all');
                      },
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={<Clock3 size={58} />}
                    title="No Closed Trades Yet"
                    description="Your trade history will appear here once you close your positions."
                    action={{
                      label: 'View Open Trades',
                      onClick: () => setTab('trades'),
                    }}
                    secondary={<p className="text-xs text-[var(--muted)]">Active trades: {activeTrades.length} open</p>}
                  />
                )
              ) : tradeViewMode === 'compact' ? (
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-card)]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[730px]">
                      <div className="grid grid-cols-[90px_64px_90px_72px_118px_76px_114px] gap-2 border-b border-[var(--border)] px-2 py-2">
                        <p className="ui-label">Symbol</p>
                        <p className="ui-label">Side</p>
                        <p className="ui-label">Entry</p>
                        <p className="ui-label">Qty</p>
                        <p className="ui-label">Realized</p>
                        <p className="ui-label">%</p>
                        <p className="ui-label text-right">Actions</p>
                      </div>
                      {historyTrades.map((trade) => (
                        <div
                          key={trade.id}
                          className={`grid grid-cols-[90px_64px_90px_72px_118px_76px_114px] items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 last:border-b-0 ${
                            trade.realizedPnl >= 0 ? 'border-l-2 border-l-[var(--positive)]' : 'border-l-2 border-l-[var(--negative)]'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{trade.symbol}</p>
                            <p className="truncate text-[10px] text-[var(--muted)]">{formatTradeDate(trade.date)}</p>
                          </div>
                          <p className="text-xs uppercase text-[var(--muted)]">{trade.direction === 'long' ? 'LONG' : 'SHORT'}</p>
                          <p className="ui-number text-xs">{formatCurrency(trade.entryPrice)}</p>
                          <p className="ui-number text-xs">{trade.quantity.toFixed(2)}</p>
                          <p className={`ui-number text-xs font-semibold ${pnlClass(trade.realizedPnl)}`}>{pnl(trade.realizedPnl)}</p>
                          <p className={`ui-number text-xs ${pnlClass(trade.totalPnl)}`}>{trade.totalPnlPercent.toFixed(2)}%</p>
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditTrade(trade);
                                setShowForm(true);
                              }}
                              className="h-11 w-11 rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--text)]"
                            >
                              <Edit2 size={12} className="mx-auto" />
                            </button>
                            <button
                              onClick={() => delTrade(trade.id)}
                              className="h-11 w-11 rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--negative)]"
                            >
                              <Trash2 size={12} className="mx-auto" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {historyTrades.map((trade) => (
                    <TradeCard
                      key={trade.id}
                      trade={trade}
                      isExpanded={expandedTradeId === trade.id}
                      portfolioValue={portfolioValue}
                      formatCurrency={formatCurrency}
                      formatTradeDate={formatTradeDate}
                      onToggle={(tradeId) => setExpandedTradeId((prev) => (prev === tradeId ? null : tradeId))}
                      onEdit={(tradeId) => {
                        const selected = historyTrades.find((item) => item.id === tradeId);
                        if (!selected) {
                          return;
                        }
                        setEditTrade(selected);
                        setShowForm(true);
                      }}
                      onDelete={(tradeId) => delTrade(tradeId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

                    {tab === 'analytics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs uppercase text-[var(--muted)]">Realized P&amp;L</p>
                  <p className={`text-lg font-semibold ${pnlClass(summary.realized)}`}>{pnl(summary.realized)}</p>
                  <p className={`mt-1 text-xs ${metricContextClass(realizedPnlContext.tone)}`}>{realizedPnlContext.text}</p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs uppercase text-[var(--muted)]">Unrealized</p>
                  <p className={`text-lg font-semibold ${pnlClass(summary.unrealized)}`}>{pnl(summary.unrealized)}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{summary.open} open position{summary.open === 1 ? '' : 's'}</p>
                </div>
              </div>

              {trades.length < 5 ? (
                <EmptyState
                  icon={<BarChart3 size={64} className="empty-icon-float" />}
                  title="Build Your Analytics Profile"
                  description="You need at least 5 trades to see meaningful analytics and insights."
                  action={{
                    label: 'Add More Trades',
                    onClick: () => setTab('trades'),
                  }}
                  secondary={(
                    <div className="w-full min-w-[220px]">
                      <p className="mb-1 text-xs text-[var(--muted)]">Current progress: {Math.min(trades.length, 5)}/5 trades</p>
                      <div className="h-2 rounded-full bg-[var(--surface)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.min((trades.length / 5) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                />
              ) : (
                <>
                  {portfolioValue === 0 ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
                      <p className="mb-2 text-sm font-semibold">Limited Analytics</p>
                      <p className="mb-3 text-sm text-[var(--muted)]">
                        Set your portfolio value to see % based analytics and risk metrics.
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab('settings')}
                        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
                      >
                        Set Portfolio Value
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="text-sm">Analytics mode: {useUnrealized ? 'Realized + unrealized' : 'Realized only'}</p>
                    <button
                      onClick={() => setUseUnrealized((value) => !value)}
                      className="min-h-11 rounded border border-[var(--border)] px-3 py-1 text-sm"
                    >
                      Toggle
                    </button>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <p className="mb-2 text-xs uppercase text-[var(--muted)]">Monthly Performance</p>
                      {monthData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={monthData}>
                            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                            <XAxis dataKey="month" stroke={C.text} />
                            <YAxis stroke={C.text} />
                            <Tooltip
                              contentStyle={CHART_TOOLTIP_STYLE}
                              labelStyle={CHART_LABEL_STYLE}
                              itemStyle={CHART_ITEM_STYLE}
                            />
                            <Bar dataKey="realized" fill={C.realized} />
                            <Bar dataKey="provisional" fill={C.provisional} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center text-center text-sm text-[var(--muted)]">
                          <div>
                            <Inbox size={18} className="mx-auto mb-1" />
                            Add your first trade to unlock analytics.
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <p className="mb-2 text-xs uppercase text-[var(--muted)]">Win/Loss (closed trades)</p>
                      {summary.wins + summary.losses > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={75}>
                              {pieData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={CHART_TOOLTIP_STYLE}
                              labelStyle={CHART_LABEL_STYLE}
                              itemStyle={CHART_ITEM_STYLE}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center text-center text-sm text-[var(--muted)]">
                          <div>
                            <Inbox size={18} className="mx-auto mb-1" />
                            Close trades to populate win/loss split.
                          </div>
                        </div>
                      )}
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
                </>
              )}
            </div>
          )}

          {tab === 'goals' && (
            <div className="space-y-3">
              {goals.length === 0 ? (
                <EmptyState
                  icon={<Target size={60} className="empty-icon-float" />}
                  title="Set Your Trading Goals"
                  description="Stay motivated and track progress toward your trading objectives."
                  action={{
                    label: 'Create Your First Goal',
                    onClick: () => {
                      pushToast('info', 'Use the goal editor below to create your first goal.');
                    },
                  }}
                  secondary={(
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left text-xs text-[var(--muted)]">
                      <p className="mb-1 font-semibold text-[var(--text)]">Popular goals:</p>
                      <p>• Hit ₹10,000 monthly profit</p>
                      <p>• Achieve 70% win rate</p>
                      <p>• Make 20 profitable trades</p>
                    </div>
                  )}
                />
              ) : null}
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
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Globe2 size={14} className="text-[var(--accent)]" />
                  Trading Preferences
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Currency and PF value are saved locally and synced to your account when signed in.
                </p>
                <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="ui-label">Display Currency</span>
                    <select
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                      className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                    >
                      {MAJOR_CURRENCIES.map((currencyOption) => (
                        <option key={currencyOption.code} value={currencyOption.code}>
                          {currencyOption.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="ui-label">PF Value ({currency})</span>
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
                      className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal size={14} className="text-[var(--accent)]" />
                  Execution Controls
                </h3>
                <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete((value) => !value)}
                    className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm transition hover:brightness-110"
                  >
                    <span>Confirm before deleting trades</span>
                    <span className={`relative h-6 w-11 rounded-full transition ${confirmDelete ? 'bg-[var(--positive)]' : 'bg-[var(--surface-3)]'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${confirmDelete ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoRefreshMarks((value) => !value)}
                    className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm transition hover:brightness-110"
                  >
                    <span>Auto-refresh open marks on app start</span>
                    <span className={`relative h-6 w-11 rounded-full transition ${autoRefreshMarks ? 'bg-[var(--positive)]' : 'bg-[var(--surface-3)]'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${autoRefreshMarks ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseUnrealized((value) => !value)}
                    className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm transition hover:brightness-110"
                  >
                    <span>Analytics include unrealized P&amp;L</span>
                    <span className={`relative h-6 w-11 rounded-full transition ${useUnrealized ? 'bg-[var(--positive)]' : 'bg-[var(--surface-3)]'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${useUnrealized ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck size={14} className="text-[var(--accent)]" />
                  Account Sync
                </h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Sign in with Google to keep settings across devices. Sync runs automatically after each change.
                </p>

                {accountUser ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <p className="text-sm">
                      Signed in as <span className="font-semibold">{accountUser.email ?? accountUser.id}</span>
                    </p>
                    <button
                      onClick={() => {
                        void signOut();
                      }}
                      className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <LogOut size={14} className="mr-1 inline" /> Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <button
                      onClick={() => {
                        void signInWithGoogle();
                      }}
                      disabled={isSigningInWithGoogle}
                      className="min-h-11 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
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
        title="Add Trade"
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[color:rgba(96,165,250,0.6)] bg-[linear-gradient(130deg,#22d3ee,#3b82f6)] text-[#05101f] shadow-[0_14px_26px_rgba(37,99,235,0.35)] transition hover:brightness-110 md:bottom-6"
      >
        <Plus size={20} />
        <span className="sr-only">Add Trade</span>
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[color:rgba(7,11,20,0.95)] px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-6 gap-2">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`min-h-11 rounded-lg border-t-2 px-1.5 py-2 text-xs ${
                tab === tabItem.id
                  ? 'border-t-[var(--accent)] bg-[var(--surface-strong)] text-[var(--accent)] shadow-[0_8px_18px_rgba(30,64,175,0.25)]'
                  : tabItem.id === 'trades'
                    ? 'border-t-transparent bg-[color:rgba(30,41,59,0.7)] text-[var(--text)]'
                    : 'border-t-transparent text-[var(--muted)]'
              }`}
            >
              <span className="flex flex-col items-center justify-center gap-0.5">
                {tabIcon(tabItem.id, 14)}
                <span>{tabItem.label}</span>
                {tabItem.badge ? <span className="text-[10px] text-[var(--muted)]">{tabItem.badge}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <Toaster
        position={toastPosition}
        offset={toastPosition === 'bottom-center' ? 88 : 16}
        richColors
        visibleToasts={4}
        toastOptions={{
          className: 'custom-toast',
          duration: 3000,
        }}
      />

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

      {showPortfolioNudgeModal ? (
        <PortfolioValueNudgeModal
          currentPnL={summary.realized + summary.unrealized}
          currency={currency}
          formatCurrency={formatCurrency}
          onSet={(value) => {
            setPortfolioValue(value);
            setPortfolioValueInput(value.toFixed(2));
            setHasSkippedPortfolioValue(false);
            setDismissedPortfolioBanner(false);
            setDismissedAfter5Trades(false);
            setShowPortfolioNudgeModal(false);
            pushToast('success', 'Portfolio value set. Advanced metrics unlocked.');
          }}
          onDismiss={() => {
            setShowPortfolioNudgeModal(false);
            setDismissedAfter5Trades(true);
          }}
        />
      ) : null}

      {needsCurrencyOnboarding ? (
        <OnboardingWizard
          currency={currency}
          setCurrency={setCurrency}
          portfolioValue={portfolioValue}
          setPortfolioValue={setPortfolioValue}
          portfolioValueInput={portfolioValueInput}
          setPortfolioValueInput={setPortfolioValueInput}
          onComplete={({ skippedPortfolioValue }) => {
            setHasSkippedPortfolioValue(skippedPortfolioValue);
            if (!skippedPortfolioValue) {
              setDismissedPortfolioBanner(false);
              setDismissedAfter5Trades(false);
            }
            setNeedsCurrencyOnboarding(false);
          }}
        />
      ) : null}
    </div>
  );
}






