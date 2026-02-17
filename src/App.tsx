import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlarmClockCheck,
  BarChart3,
  CandlestickChart,
  Download,
  Edit2,
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
  TrendingUp,
  Trash2,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react';
import type { Goal, GoalType } from './shared/types/goal';
import type { AddExitLegInput, CreateOpenTradeInput, Trade } from './shared/types/trade';
import { LocalTradeRepository } from './features/trades/repository/tradeRepository';
import { LocalGoalRepository } from './features/goals/repository/goalRepository';
import { buildAnalyticsSummary } from './features/analytics/analyticsService';
import { getGoalProgress } from './features/goals/services/goalService';
import { completeReminder, listActiveReminders } from './features/reminders/reminderService';
import { getRemainingQuantity, roundTo2 } from './shared/services/tradeMath';
import { exportTradesToCsv } from './features/trades/services/exportService';
import { pricingService as sharedPricingService } from './shared/services/pricing';
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

type Tab = 'dashboard' | 'trades' | 'insights' | 'profile';
type FilterType = 'all' | 'wins' | 'losses' | 'open' | 'closed';
type TradeViewMode = 'card' | 'compact';
type ContextTipKey = 'dashboard' | 'trades' | 'insights';
type MetricContextTone = 'success' | 'warning' | 'muted';
type InsightType = 'success' | 'warning' | 'info' | 'tip';

interface InsightAction {
  label: string;
  onClick: () => void;
}

interface InsightCardProps {
  id: string;
  type: InsightType;
  title: string;
  content: string;
  action?: InsightAction;
}

interface PriceChange {
  oldMark: number;
  newMark: number;
  change: number;
  changePercent: number;
}

interface RefreshResult {
  refreshedCount: number;
  updatedTradeIds: string[];
  priceChanges: Record<string, PriceChange>;
}

interface CloudTradingDataRow {
  user_id: string;
  trades: unknown;
  goals: unknown;
  updated_at?: string | null;
}

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
const DASHBOARD_TOOLTIP_DISMISSED_KEY = 'tooltipDismissed.dashboard';
const TRADES_TOOLTIP_DISMISSED_KEY = 'tooltipDismissed.trades';
const INSIGHTS_TOOLTIP_DISMISSED_KEY = 'tooltipDismissed.insights';
const CURRENT_TAB_STORAGE_KEY = 'currentTab';
const TRADE_VIEW_MODE_STORAGE_KEY = 'tradeViewMode';
const DISMISSED_INSIGHTS_STORAGE_KEY = 'dismissedInsights';
const GOALS_STORAGE_KEY = 'goals';
const CLOUD_TRADING_DATA_TABLE = 'user_trading_data';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCloudTrades(value: unknown): Trade[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Trade => isRecord(item) && typeof item.id === 'string');
}

function parseCloudGoals(value: unknown): Goal[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Goal => {
    if (!isRecord(item)) {
      return false;
    }
    if (typeof item.id !== 'string' || typeof item.period !== 'string') {
      return false;
    }
    if (item.type !== 'monthly_pnl' && item.type !== 'monthly_win_rate' && item.type !== 'monthly_trade_count') {
      return false;
    }
    return true;
  });
}

function mergeTradesByLatest(localTrades: Trade[], remoteTrades: Trade[]): Trade[] {
  const merged = new Map<string, Trade>();
  [...localTrades, ...remoteTrades].forEach((trade) => {
    const existing = merged.get(trade.id);
    if (!existing) {
      merged.set(trade.id, trade);
      return;
    }
    merged.set(trade.id, trade.updatedAt > existing.updatedAt ? trade : existing);
  });
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function mergeGoalsByLatest<
  T extends { id: string; updatedAt: string }
>(localGoals: T[], remoteGoals: T[]): T[] {
  const merged = new Map<string, T>();
  [...localGoals, ...remoteGoals].forEach((goal) => {
    const existing = merged.get(goal.id);
    if (!existing) {
      merged.set(goal.id, goal);
      return;
    }
    merged.set(goal.id, goal.updatedAt > existing.updatedAt ? goal : existing);
  });
  return [...merged.values()];
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

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / 60000);

  if (seconds < 60) {
    return 'just now';
  }
  if (minutes === 1) {
    return '1 min ago';
  }
  if (minutes < 60) {
    return `${minutes} mins ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours === 1) {
    return '1 hour ago';
  }
  return `${hours} hours ago`;
}

function isNSEMarketOpen(): boolean {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + 330 + 1440) % 1440;
  const istDay = (now.getUTCDay() + (utcMinutes + 330 >= 1440 ? 1 : 0)) % 7;
  const isWeekday = istDay >= 1 && istDay <= 5;
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;
  return isWeekday && istMinutes >= marketOpen && istMinutes <= marketClose;
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

function calculateWinRate(trades: Trade[]): number {
  const closed = trades.filter((trade) => trade.status === 'closed');
  if (closed.length === 0) {
    return 0;
  }
  const wins = closed.filter((trade) => trade.realizedPnl > 0).length;
  return (wins / closed.length) * 100;
}

function getTradesFromLastNDays(trades: Trade[], days: number): Trade[] {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return trades.filter((trade) => parseIsoDate(trade.date) >= cutoff);
}

function calculateAvgWinSize(trades: Trade[]): number {
  const wins = trades.filter((trade) => trade.status === 'closed' && trade.realizedPnl > 0);
  if (wins.length === 0) {
    return 0;
  }
  return wins.reduce((sum, trade) => sum + trade.realizedPnl, 0) / wins.length;
}

function calculateAvgLossSize(trades: Trade[]): number {
  const losses = trades.filter((trade) => trade.status === 'closed' && trade.realizedPnl < 0);
  if (losses.length === 0) {
    return 0;
  }
  return losses.reduce((sum, trade) => sum + trade.realizedPnl, 0) / losses.length;
}

function calculateDailyBalances(trades: Trade[]): number[] {
  let running = 0;
  return [...trades]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((trade) => {
      running += trade.realizedPnl;
      return roundTo2(running);
    });
}

function generatePnLInsight(
  trades: Trade[],
  overallWinRate: number,
  portfolioValue: number,
  totalPnl: number,
  formatCurrency: (value: number) => string,
  onReviewLosses: () => void
): InsightCardProps | null {
  const closed = trades.filter((trade) => trade.status === 'closed');
  const recentClosed = closed.slice(-10);
  const recentWinRate = calculateWinRate(recentClosed);

  if (recentClosed.length >= 5 && recentWinRate > overallWinRate + 10) {
    return {
      id: 'pnl-performance-improving',
      type: 'success',
      title: 'Performance Improving',
      content: `Your last ${recentClosed.length} closed trades are winning ${recentWinRate.toFixed(1)}%, which is ${(
        recentWinRate - overallWinRate
      ).toFixed(1)}% above your baseline. Keep following the same setup discipline.`,
    };
  }

  if (recentClosed.length >= 5 && recentWinRate < overallWinRate - 10) {
    return {
      id: 'pnl-recent-slump',
      type: 'warning',
      title: 'Recent Slump Detected',
      content: `Recent win rate is ${recentWinRate.toFixed(1)}% vs your ${overallWinRate.toFixed(1)}% average. Review recent losses and tighten entries.`,
      action: {
        label: 'Review Recent Losses',
        onClick: onReviewLosses,
      },
    };
  }

  if (portfolioValue > 0) {
    const balances = calculateDailyBalances(closed);
    if (balances.length > 1) {
      const currentBalance = portfolioValue + totalPnl;
      const peakBalance = portfolioValue + Math.max(...balances, 0);
      const drawdown = peakBalance > 0 ? ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
      if (drawdown > 10) {
        return {
          id: 'pnl-drawdown-alert',
          type: 'warning',
          title: 'Drawdown Alert',
          content: `You are ${drawdown.toFixed(1)}% below your equity peak. Consider reducing size and reviewing your highest-conviction setups.`,
        };
      }
    }
  }

  const lastMonthClosed = getTradesFromLastNDays(closed, 30);
  const monthlyRealized = lastMonthClosed.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  if (monthlyRealized > 0 && lastMonthClosed.length >= 20) {
    return {
      id: 'pnl-strong-month',
      type: 'success',
      title: 'Strong Monthly Performance',
      content: `You realized ${formatCurrency(monthlyRealized)} across ${lastMonthClosed.length} closed trades in the last 30 days. Consistency is compounding.`,
    };
  }

  return null;
}

function generateWinRateInsight(
  trades: Trade[],
  winRate: number,
  formatCurrency: (value: number) => string,
  onViewWinningTrades: () => void
): InsightCardProps | null {
  const closed = trades.filter((trade) => trade.status === 'closed');
  const totalClosed = closed.length;

  if (totalClosed < 10) {
    return {
      id: 'winrate-build-track-record',
      type: 'info',
      title: 'Build Your Track Record',
      content: `You have ${totalClosed} closed trades. Reach 10+ closed trades for a more reliable win-rate signal.`,
    };
  }

  if (winRate >= 65) {
    return {
      id: 'winrate-excellent',
      type: 'success',
      title: 'Excellent Win Rate',
      content: `Your ${winRate.toFixed(1)}% win rate is strong. Keep protecting gains with disciplined stop-loss and position sizing.`,
    };
  }

  if (winRate < 45) {
    return {
      id: 'winrate-needs-work',
      type: 'warning',
      title: 'Win Rate Needs Improvement',
      content: `Win rate is ${winRate.toFixed(1)}%. Review entry timing and compare losers against your best-performing setups.`,
      action: {
        label: 'View Winning Trades',
        onClick: onViewWinningTrades,
      },
    };
  }

  const avgWin = calculateAvgWinSize(closed);
  const avgLoss = Math.abs(calculateAvgLossSize(closed));
  if (avgWin > 0 && avgLoss > 0 && avgWin < avgLoss * 1.5) {
    return {
      id: 'winrate-risk-reward-tip',
      type: 'tip',
      title: 'Improve Risk/Reward',
      content: `Average win is ${formatCurrency(avgWin)} while average loss is ${formatCurrency(avgLoss)}. Aim for winners that are at least 2x your losses.`,
    };
  }

  return null;
}

function generateTradingFrequencyInsight(trades: Trade[]): InsightCardProps | null {
  const last7Days = getTradesFromLastNDays(trades, 7);
  const last30Days = getTradesFromLastNDays(trades, 30);

  if (last7Days.length > 20) {
    return {
      id: 'frequency-overtrading',
      type: 'warning',
      title: 'Possible Overtrading',
      content: `${last7Days.length} trades in 7 days is a high pace. Overtrading increases emotional decisions. Prioritize setup quality over activity.`,
    };
  }

  if (last30Days.length >= 10 && last30Days.length <= 40) {
    const recentWinRate = calculateWinRate(last30Days);
    if (recentWinRate >= 55) {
      return {
        id: 'frequency-balanced',
        type: 'success',
        title: 'Disciplined Trading Frequency',
        content: `You are averaging ${(last30Days.length / 30).toFixed(1)} trades/day with ${recentWinRate.toFixed(1)}% wins over 30 days. This cadence looks sustainable.`,
      };
    }
  }

  if (trades.length >= 5 && last30Days.length < 3) {
    return {
      id: 'frequency-low-activity',
      type: 'info',
      title: 'Low Trading Activity',
      content: `Only ${last30Days.length} trades in the last 30 days. If this is intentional selectivity, keep it. If not, review your setup criteria.`,
    };
  }

  return null;
}

function generateRiskManagementInsight(
  trades: Trade[],
  portfolioValue: number,
  onViewOpenTrades: () => void
): InsightCardProps | null {
  const openTrades = trades.filter((trade) => trade.status === 'open');
  if (portfolioValue <= 0) {
    return {
      id: 'risk-set-portfolio',
      type: 'info',
      title: 'Set Portfolio Value',
      content: 'Add your portfolio value to unlock exposure-based risk insights.',
    };
  }

  const totalExposure = openTrades.reduce((sum, trade) => sum + trade.entryPrice * getRemainingQuantity(trade), 0);
  const exposurePercent = (totalExposure / portfolioValue) * 100;

  if (exposurePercent > 80) {
    return {
      id: 'risk-very-high-exposure',
      type: 'warning',
      title: 'Very High Risk Exposure',
      content: `${exposurePercent.toFixed(1)}% of portfolio is currently deployed. Reduce concentration risk before adding new positions.`,
      action: {
        label: 'View Open Positions',
        onClick: onViewOpenTrades,
      },
    };
  }

  if (openTrades.length === 0 && trades.length > 0) {
    return {
      id: 'risk-no-open-positions',
      type: 'info',
      title: 'No Active Positions',
      content: 'You are flat right now. Use this time to review your journal and prepare high-probability setups.',
    };
  }

  if (exposurePercent >= 20 && exposurePercent <= 50) {
    return {
      id: 'risk-balanced-exposure',
      type: 'success',
      title: 'Balanced Risk Exposure',
      content: `${exposurePercent.toFixed(1)}% exposure leaves room for opportunities while controlling downside.`,
    };
  }

  return null;
}

function generateStreakInsight(trades: Trade[]): InsightCardProps | null {
  const recentClosed = trades.filter((trade) => trade.status === 'closed').slice(-10);
  if (recentClosed.length < 3) {
    return null;
  }

  let streakCount = 0;
  let streakType: 'win' | 'loss' | null = null;
  for (let i = recentClosed.length - 1; i >= 0; i -= 1) {
    const isWin = recentClosed[i].realizedPnl > 0;
    if (streakType == null) {
      streakType = isWin ? 'win' : 'loss';
      streakCount = 1;
      continue;
    }
    if ((streakType === 'win' && isWin) || (streakType === 'loss' && !isWin)) {
      streakCount += 1;
      continue;
    }
    break;
  }

  if (streakCount < 3 || streakType == null) {
    return null;
  }

  if (streakType === 'win') {
    return {
      id: 'streak-winning',
      type: 'success',
      title: `${streakCount}-Trade Winning Streak`,
      content: `Momentum is strong. Stay disciplined and avoid increasing risk just because confidence is high.`,
    };
  }

  return {
    id: 'streak-losing',
    type: 'warning',
    title: `${streakCount} Losses In A Row`,
    content: 'Pause and review what changed. Preserving capital and confidence is part of strategy execution.',
  };
}

function generateBestWorstTradeInsight(trades: Trade[]): InsightCardProps | null {
  const closed = trades.filter((trade) => trade.status === 'closed');
  if (closed.length < 5) {
    return null;
  }

  const best = closed.reduce((max, trade) => (trade.realizedPnl > max.realizedPnl ? trade : max), closed[0]);
  const worst = closed.reduce((min, trade) => (trade.realizedPnl < min.realizedPnl ? trade : min), closed[0]);

  const bestBase = best.entryPrice * best.quantity;
  const worstBase = worst.entryPrice * worst.quantity;
  if (bestBase <= 0 || worstBase <= 0) {
    return null;
  }
  const bestPct = (best.realizedPnl / bestBase) * 100;
  const worstPct = (worst.realizedPnl / worstBase) * 100;

  if (Math.abs(worstPct) > Math.abs(bestPct) * 2) {
    return {
      id: 'best-worst-loss-dominance',
      type: 'warning',
      title: 'Losses Outweigh Wins',
      content: `Worst trade (${worst.symbol} ${worstPct.toFixed(1)}%) is much larger than best win (${best.symbol} ${bestPct.toFixed(1)}%). Cut losers earlier.`,
    };
  }

  return null;
}

function InsightCard({
  id,
  type,
  title,
  content,
  action,
  dismissible = false,
  dismissed = false,
  onDismiss,
}: InsightCardProps & { dismissible?: boolean; dismissed?: boolean; onDismiss?: (id: string) => void }) {
  if (dismissible && dismissed) {
    return null;
  }

  const icons: Record<InsightType, string> = {
    success: '\u{1F4A1}',
    warning: '\u26A0\uFE0F',
    info: '\u2139\uFE0F',
    tip: '\u2728',
  };
  const colors: Record<InsightType, string> = {
    success: 'var(--positive)',
    warning: '#f59e0b',
    info: 'var(--accent)',
    tip: '#8b5cf6',
  };

  return (
    <div className="insight-card" style={{ borderLeftColor: colors[type] }}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icons[type]}</span>
        <div className="flex-1">
          <h4 className="text-secondary-sm mb-1">{title}</h4>
          <p className="text-tertiary leading-relaxed">{content}</p>
          {action ? (
            <button type="button" onClick={action.onClick} className="mt-2 text-tertiary text-[var(--accent)] hover:underline">
              {action.label} {'\u2192'}
            </button>
          ) : null}
        </div>
        {dismissible ? (
          <button
            type="button"
            onClick={() => onDismiss?.(id)}
            className="rounded-md p-1 text-[var(--muted)] transition hover:text-[var(--text)]"
            aria-label="Dismiss insight"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
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

interface PriceDisclaimerModalProps {
  onAccept: () => void;
}

function PriceDisclaimerModal({ onAccept }: PriceDisclaimerModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-4 text-center text-3xl">{'\u{1F4CA}'}</div>
        <h2 className="mb-2 text-center text-xl font-bold">About Price Data</h2>
        <div className="mb-6 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
          <div className="flex gap-3">
            <span>{'\u{1F517}'}</span>
            <p><strong>Source:</strong> Price data is sourced from Yahoo Finance (NSE feed)</p>
          </div>
          <div className="flex gap-3">
            <span>{'\u23F1\uFE0F'}</span>
            <p><strong>Delay:</strong> Prices may be delayed up to 15-20 minutes. Not real-time.</p>
          </div>
          <div className="flex gap-3">
            <span>{'\u{1F4DD}'}</span>
            <p><strong>Purpose:</strong> Provided for journaling and research only. Not investment advice.</p>
          </div>
          <div className="flex gap-3">
            <span>{'\u26A0\uFE0F'}</span>
            <p><strong>Risk:</strong> Trading involves substantial risk of loss. Past performance does not guarantee future results.</p>
          </div>
        </div>
        <p className="mb-4 text-center text-xs text-[var(--muted)]">For live prices, please use your broker's platform.</p>
        <button
          type="button"
          onClick={onAccept}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-[var(--bg)]"
        >
          I Understand, Continue
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const tradeRepo = useMemo(() => new LocalTradeRepository(), []);
  const goalRepo = useMemo(() => new LocalGoalRepository(), []);
  const pricingService = useMemo(() => sharedPricingService, []);

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
  const [tab, setTab] = useState<Tab>('dashboard');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [flt, setFlt] = useState<FilterType>('all');
  const [useUnrealized, setUseUnrealized] = useState<boolean>(() => getInitialBoolean(ANALYTICS_UNREALIZED_STORAGE_KEY, true));
  const [isRefreshingMarks, setIsRefreshingMarks] = useState(false);
  const [markRefreshError, setMarkRefreshError] = useState('');
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showPriceDisclaimer, setShowPriceDisclaimer] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [hasSeenPriceDisclaimer, setHasSeenPriceDisclaimer] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hasSeenPriceDisclaimer') === 'true';
    } catch {
      return false;
    }
  });
  const [recentlyUpdatedTradeIds, setRecentlyUpdatedTradeIds] = useState<string[]>([]);
  const [priceChangesByTradeId, setPriceChangesByTradeId] = useState<Record<string, PriceChange>>({});
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tradeFormInitialValues, setTradeFormInitialValues] = useState<Partial<CreateOpenTradeInput> | undefined>(undefined);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [manageTrade, setManageTrade] = useState<Trade | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [tradeViewMode, setTradeViewMode] = useState<TradeViewMode>(() => {
    try {
      const saved = localStorage.getItem(TRADE_VIEW_MODE_STORAGE_KEY);
      return saved === 'compact' ? 'compact' : 'card';
    } catch {
      return 'card';
    }
  });
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [isEditingPortfolio, setIsEditingPortfolio] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [dismissedInsights, setDismissedInsights] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_INSIGHTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [activeContextTip, setActiveContextTip] = useState<ContextTipKey | null>(null);
  const [dismissedContextTips, setDismissedContextTips] = useState<Record<ContextTipKey, boolean>>(() => ({
    dashboard: getInitialBoolean(DASHBOARD_TOOLTIP_DISMISSED_KEY, false),
    trades: getInitialBoolean(TRADES_TOOLTIP_DISMISSED_KEY, false),
    insights: getInitialBoolean(INSIGHTS_TOOLTIP_DISMISSED_KEY, false),
  }));
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);
  const [isSyncingSettings, setIsSyncingSettings] = useState(false);
  const [isSyncingCloudData, setIsSyncingCloudData] = useState(false);
  const [hasHydratedCloudData, setHasHydratedCloudData] = useState(false);
  const [hasDoneInitialAutoRefresh, setHasDoneInitialAutoRefresh] = useState(false);
  const [toastPosition, setToastPosition] = useState<'bottom-center' | 'top-right'>(() =>
    window.innerWidth >= 768 ? 'top-right' : 'bottom-center'
  );
  const refreshToastIdRef = useRef<string | number | null>(null);
  const refreshInFlightRef = useRef(false);
  const pullMetaRef = useRef<{ x: number; y: number; enabled: boolean }>({ x: 0, y: 0, enabled: false });
  const recentUpdateClearTimerRef = useRef<number | null>(null);
  const priceChangeClearTimerRef = useRef<number | null>(null);
  const announcedGoalIdsRef = useRef<Set<string>>(new Set());
  const tradesRef = useRef<Trade[]>(trades);
  const goalsRef = useRef<Goal[]>(goals);
  const lastSyncedCloudSnapshotRef = useRef('');

  const currencyFormatter = useMemo(() => buildCurrencyFormatter(currency), [currency]);

  const formatCurrency = useCallback((value: number): string => currencyFormatter.format(roundTo2(value)), [currencyFormatter]);
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

  const pushToast = useCallback((kind: 'success' | 'error' | 'info' | 'warning', message: string, description?: string) => {
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
  }, []);

  const haptic = useCallback((style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!('vibrate' in navigator)) {
      return;
    }
    const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 45;
    navigator.vibrate(duration);
  }, []);

  const refreshAgeLabel = useMemo(() => {
    void refreshTick;
    if (!lastRefreshTime) {
      return 'Never';
    }
    return formatTimeAgo(lastRefreshTime);
  }, [lastRefreshTime, refreshTick]);
  const isMarketOpenNow = useMemo(() => {
    void refreshTick;
    return isNSEMarketOpen();
  }, [refreshTick]);

  const dismissContextTip = (tip: ContextTipKey) => {
    setDismissedContextTips((prev) => ({ ...prev, [tip]: true }));
    if (activeContextTip === tip) {
      setActiveContextTip(null);
    }
  };

  const tabIcon = (tabId: Tab, size = 13) => {
    if (tabId === 'dashboard') {
      return <Home size={size} className={TAB_ICON_CLASS} />;
    }
    if (tabId === 'trades') {
      return <List size={size} className={TAB_ICON_CLASS} />;
    }
    if (tabId === 'insights') {
      return <TrendingUp size={size} className={TAB_ICON_CLASS} />;
    }
    return <UserIcon size={size} className={TAB_ICON_CLASS} />;
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
        setHasHydratedCloudData(false);
        lastSyncedCloudSnapshotRef.current = '';
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
        setHasHydratedCloudData(false);
        lastSyncedCloudSnapshotRef.current = '';
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
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  useEffect(() => {
    const tick = window.setInterval(() => setRefreshTick((value) => value + 1), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (recentUpdateClearTimerRef.current != null) {
        window.clearTimeout(recentUpdateClearTimerRef.current);
      }
      if (priceChangeClearTimerRef.current != null) {
        window.clearTimeout(priceChangeClearTimerRef.current);
      }
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
      localStorage.setItem(TRADE_VIEW_MODE_STORAGE_KEY, tradeViewMode);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [tradeViewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_INSIGHTS_STORAGE_KEY, JSON.stringify(dismissedInsights));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [dismissedInsights]);

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
      localStorage.setItem(DASHBOARD_TOOLTIP_DISMISSED_KEY, String(dismissedContextTips.dashboard));
      localStorage.setItem(TRADES_TOOLTIP_DISMISSED_KEY, String(dismissedContextTips.trades));
      localStorage.setItem(INSIGHTS_TOOLTIP_DISMISSED_KEY, String(dismissedContextTips.insights));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [dismissedContextTips]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_TAB_STORAGE_KEY);
      if (!saved) {
        return;
      }
      const tabMigration: Record<string, Tab> = {
        dashboard: 'dashboard',
        overview: 'dashboard',
        trades: 'trades',
        history: 'trades',
        insights: 'insights',
        analytics: 'insights',
        goals: 'insights',
        profile: 'profile',
        settings: 'profile',
      };
      const nextTab = tabMigration[saved];
      if (nextTab) {
        setTab(nextTab);
      }
    } catch {
      // Ignore localStorage read errors.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_TAB_STORAGE_KEY, tab);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [tab]);

  useEffect(() => {
    if (needsCurrencyOnboarding) {
      return;
    }
    if (tab === 'dashboard' && !dismissedContextTips.dashboard) {
      setActiveContextTip('dashboard');
      return;
    }
    if (tab === 'trades' && !dismissedContextTips.trades) {
      setActiveContextTip('trades');
      return;
    }
    if (tab === 'insights' && trades.length >= 5 && !dismissedContextTips.insights) {
      setActiveContextTip('insights');
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
    const hydrateCloudData = async () => {
      setIsSyncingCloudData(true);
      const { data, error } = await supabase
        .from(CLOUD_TRADING_DATA_TABLE)
        .select('user_id,trades,goals,updated_at')
        .eq('user_id', accountUser.id)
        .maybeSingle<CloudTradingDataRow>();

      if (!isCurrent) {
        return;
      }

      if (error) {
        if (error.code === '42P01') {
          setAuthNotice('Signed in, but cloud table is missing. Create user_trading_data table to sync trades.');
        } else {
          setAuthNotice(`Signed in, but cloud data sync failed: ${error.message}`);
        }
        setHasHydratedCloudData(true);
        setIsSyncingCloudData(false);
        return;
      }

      const remoteTrades = parseCloudTrades(data?.trades);
      const remoteGoals = parseCloudGoals(data?.goals);
      const localTrades = tradesRef.current;
      const localGoals = goalsRef.current;
      const mergedTrades = mergeTradesByLatest(localTrades, remoteTrades);
      const mergedGoals = mergeGoalsByLatest(localGoals, remoteGoals);

      tradeRepo.saveTrades(mergedTrades);
      setTrades(mergedTrades);
      try {
        localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(mergedGoals));
      } catch {
        // Ignore localStorage write errors.
      }
      setGoals(mergedGoals);

      const snapshot = JSON.stringify({ trades: mergedTrades, goals: mergedGoals });
      lastSyncedCloudSnapshotRef.current = snapshot;
      setHasHydratedCloudData(true);
      setIsSyncingCloudData(false);

      const { error: upsertError } = await supabase.from(CLOUD_TRADING_DATA_TABLE).upsert(
        {
          user_id: accountUser.id,
          trades: mergedTrades,
          goals: mergedGoals,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (upsertError && isCurrent) {
        setAuthNotice(`Signed in, but cloud write failed: ${upsertError.message}`);
      }
    };

    void hydrateCloudData();

    return () => {
      isCurrent = false;
    };
  }, [accountUser?.id, isAuthReady, tradeRepo]);

  useEffect(() => {
    if (!accountUser || !isAuthReady || !hasHydratedCloudData) {
      return;
    }

    const snapshot = JSON.stringify({ trades, goals });
    if (snapshot === lastSyncedCloudSnapshotRef.current) {
      return;
    }

    let isCurrent = true;
    const timer = window.setTimeout(async () => {
      setIsSyncingCloudData(true);
      const { error } = await supabase.from(CLOUD_TRADING_DATA_TABLE).upsert(
        {
          user_id: accountUser.id,
          trades,
          goals,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (!isCurrent) {
        return;
      }

      if (error) {
        setAuthNotice(`Signed in, but cloud data sync failed: ${error.message}`);
      } else {
        lastSyncedCloudSnapshotRef.current = snapshot;
      }
      setIsSyncingCloudData(false);
    }, 1200);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [accountUser?.id, goals, hasHydratedCloudData, isAuthReady, trades]);

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
      setIsSyncingCloudData(false);
      setHasHydratedCloudData(false);
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
      setTradeFormInitialValues(undefined);

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

  const refreshMarks = useCallback(async (options?: { silentIfNoOpen?: boolean }): Promise<RefreshResult | null> => {
    if (refreshInFlightRef.current) {
      return null;
    }

    if (!isOnline) {
      setMarkRefreshError('You are offline. Reconnect to refresh mark prices.');
      if (!options?.silentIfNoOpen) {
        pushToast('error', 'You are offline', 'Price updates are unavailable.');
      }
      return null;
    }

    const openTrades = trades.filter((trade) => getRemainingQuantity(trade) > 0);
    const symbols = Array.from(
      new Set(openTrades.map((trade) => trade.symbol.trim().toUpperCase()).filter(Boolean))
    );

    if (symbols.length === 0) {
      if (!options?.silentIfNoOpen) {
        pushToast('info', 'No Open Positions', 'No open trades available for mark refresh.');
      }
      return {
        refreshedCount: 0,
        updatedTradeIds: [],
        priceChanges: {},
      };
    }

    setMarkRefreshError('');
    setIsRefreshingMarks(true);
    setRefreshProgress(0);
    refreshInFlightRef.current = true;
    if (!options?.silentIfNoOpen) {
      refreshToastIdRef.current = toast.loading('Refreshing prices...', {
        description: 'Fetching latest market marks',
      });
    }

    try {
      const pricesBySymbol: Record<string, number> = {};
      const symbolPriceMap = await pricingService.fetchPrices(symbols);
      symbols.forEach((symbol, index) => {
        const price = symbolPriceMap.get(symbol);
        if (price != null && price > 0) {
          pricesBySymbol[symbol] = roundTo2(price);
        }
        setRefreshProgress(Math.round(((index + 1) / symbols.length) * 100));
      });

      const priceChanges: Record<string, PriceChange> = {};
      const updatedTradeIds: string[] = [];
      openTrades.forEach((trade) => {
        const nextMark = pricesBySymbol[trade.symbol.toUpperCase()];
        if (!Number.isFinite(nextMark) || nextMark <= 0) {
          return;
        }
        const oldMark = trade.markPrice ?? trade.entryPrice;
        const change = roundTo2(nextMark - oldMark);
        if (Math.abs(change) < 0.000001) {
          return;
        }
        updatedTradeIds.push(trade.id);
        const changePercent = oldMark > 0 ? roundTo2((change / oldMark) * 100) : 0;
        priceChanges[trade.id] = {
          oldMark,
          newMark: nextMark,
          change,
          changePercent,
        };
      });

      const next = tradeRepo.updateOpenTradeMarks(pricesBySymbol);
      setTrades(next);
      setManageTrade((current) => {
        if (!current) {
          return current;
        }
        const updated = next.find((trade) => trade.id === current.id) ?? null;
        return updated?.status === 'open' ? updated : null;
      });
      setLastRefreshTime(new Date());

      if (updatedTradeIds.length > 0) {
        setRecentlyUpdatedTradeIds(updatedTradeIds);
        if (recentUpdateClearTimerRef.current != null) {
          window.clearTimeout(recentUpdateClearTimerRef.current);
        }
        recentUpdateClearTimerRef.current = window.setTimeout(() => {
          setRecentlyUpdatedTradeIds([]);
          recentUpdateClearTimerRef.current = null;
        }, 2000);
      }

      if (Object.keys(priceChanges).length > 0) {
        setPriceChangesByTradeId(priceChanges);
        if (priceChangeClearTimerRef.current != null) {
          window.clearTimeout(priceChangeClearTimerRef.current);
        }
        priceChangeClearTimerRef.current = window.setTimeout(() => {
          setPriceChangesByTradeId({});
          priceChangeClearTimerRef.current = null;
        }, 5000);
      }

      const refreshedCount = Object.keys(pricesBySymbol).length;
      if (refreshedCount === 0 && !options?.silentIfNoOpen) {
        toast.error('Couldn\'t Refresh Prices', {
          id: refreshToastIdRef.current ?? undefined,
          description: 'No symbol quotes were returned.',
        });
      } else if (!options?.silentIfNoOpen) {
        toast.success('Prices Updated', {
          id: refreshToastIdRef.current ?? undefined,
          description: `${refreshedCount} symbols refreshed`,
        });
      }

      return { refreshedCount, updatedTradeIds, priceChanges };
    } catch {
      setMarkRefreshError('Could not refresh prices. Check your connection and try again.');
      if (!options?.silentIfNoOpen) {
        toast.error('Couldn\'t Refresh Prices', {
          id: refreshToastIdRef.current ?? undefined,
          description: 'Check your internet connection',
        });
      }
      return null;
    } finally {
      refreshToastIdRef.current = null;
      refreshInFlightRef.current = false;
      setIsRefreshingMarks(false);
      setRefreshProgress(0);
      setIsPulling(false);
      setPullDistance(0);
    }
  }, [isOnline, pricingService, pushToast, tradeRepo, trades]);

  const handleRefreshClick = useCallback(() => {
    if (!hasSeenPriceDisclaimer) {
      setShowPriceDisclaimer(true);
      setPendingRefresh(true);
      return;
    }
    void refreshMarks();
  }, [hasSeenPriceDisclaimer, refreshMarks]);

  const handleDisclaimerAccept = useCallback(() => {
    try {
      localStorage.setItem('hasSeenPriceDisclaimer', 'true');
    } catch {
      // Ignore localStorage errors.
    }
    setHasSeenPriceDisclaimer(true);
    setShowPriceDisclaimer(false);
    if (pendingRefresh) {
      setPendingRefresh(false);
      void refreshMarks();
    }
  }, [pendingRefresh, refreshMarks]);

  useEffect(() => {
    if (!autoRefreshMarks || hasDoneInitialAutoRefresh || !isOnline) {
      return;
    }
    setHasDoneInitialAutoRefresh(true);
    void refreshMarks({ silentIfNoOpen: true });
  }, [autoRefreshMarks, hasDoneInitialAutoRefresh, isOnline, refreshMarks]);

  useEffect(() => {
    if (!autoRefreshMarks || !isOnline) {
      return;
    }
    const hasOpenTrades = trades.some((trade) => trade.status === 'open');
    if (!hasOpenTrades) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (refreshInFlightRef.current) {
        return;
      }
      void refreshMarks({ silentIfNoOpen: true });
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [autoRefreshMarks, isOnline, refreshMarks, trades]);

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

  const clearAllData = () => {
    tradeRepo.saveTrades([]);
    setTrades([]);
    localStorage.removeItem('goals');
    setGoals([]);
    setSearch('');
    setFrom('');
    setTo('');
    setFlt('all');
    setExpandedTradeId(null);
    setTab('dashboard');
    pushToast('success', 'All local data cleared');
  };

  const handleClearAllData = () => {
    if (confirmDelete) {
      toast('Clear all local trade and goal data?', {
        description: 'This cannot be undone.',
        duration: 7000,
        action: {
          label: 'Clear Data',
          onClick: clearAllData,
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
    clearAllData();
  };

  const openCreateTradeModal = (initialValues?: Partial<CreateOpenTradeInput>) => {
    setEditTrade(null);
    setTradeFormInitialValues(initialValues);
    setShowForm(true);
  };

  const duplicateTrade = (tradeId: string) => {
    const source = trades.find((trade) => trade.id === tradeId);
    if (!source) {
      return;
    }
    openCreateTradeModal({
      date: localIsoDate(new Date()),
      symbol: source.symbol,
      direction: source.direction,
      entryPrice: source.entryPrice,
      quantity: source.quantity,
      markPrice: source.markPrice,
      setup: source.setup,
      emotion: source.emotion,
      notes: source.notes,
    });
    pushToast('info', `Prefilled ${source.symbol}`, 'Review values before saving.');
  };

  const closeTradeNow = async (tradeId: string) => {
    const source = trades.find((trade) => trade.id === tradeId && trade.status === 'open');
    if (!source) {
      return false;
    }
    const qty = getRemainingQuantity(source);
    if (qty <= 0) {
      return false;
    }
    addLeg(tradeId, {
      date: localIsoDate(new Date()),
      quantity: qty,
      exitPrice: source.markPrice ?? source.entryPrice,
    });
    return true;
  };

  const handleCloseAll = () => {
    const targets = trades.filter((trade) => trade.status === 'open' && getRemainingQuantity(trade) > 0);
    if (targets.length < 2) {
      return;
    }

    toast('Close all open positions?', {
      description: `This will close ${targets.length} trade${targets.length === 1 ? '' : 's'}.`,
      duration: 7000,
      action: {
        label: 'Close All',
        onClick: () => {
          haptic('heavy');
          let closedCount = 0;
          targets.forEach((trade) => {
            const qty = getRemainingQuantity(trade);
            if (qty <= 0) {
              return;
            }
            addLeg(trade.id, {
              date: localIsoDate(new Date()),
              quantity: qty,
              exitPrice: trade.markPrice ?? trade.entryPrice,
            });
            closedCount += 1;
          });
          pushToast('success', 'Positions Closed', `Closed ${closedCount} open trade${closedCount === 1 ? '' : 's'}.`);
        },
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {
          // no-op
        },
      },
    });
  };

  const handleBulkExport = () => {
    const selectedSet = new Set(selectedTrades);
    const rows = trades.filter((trade) => selectedSet.has(trade.id));
    handleExportTrades(rows);
  };

  const handleBulkDelete = () => {
    if (selectedTrades.length === 0) {
      return;
    }
    toast(`Delete ${selectedTrades.length} selected trade${selectedTrades.length === 1 ? '' : 's'}?`, {
      description: 'This action cannot be undone.',
      duration: 7000,
      action: {
        label: 'Delete',
        onClick: () => {
          haptic('medium');
          let next = trades;
          selectedTrades.forEach((id) => {
            next = next.filter((trade) => trade.id !== id);
          });
          tradeRepo.saveTrades(next);
          setTrades(next);
          setSelectedTrades([]);
          setBulkSelectMode(false);
          pushToast('success', 'Trades Deleted', `${selectedTrades.length} trade${selectedTrades.length === 1 ? '' : 's'} removed.`);
        },
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {
          // no-op
        },
      },
    });
  };

  const setDateToToday = () => {
    const today = localIsoDate(new Date());
    setFrom(today);
    setTo(today);
  };

  const setDateToThisWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const deltaToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - deltaToMonday);
    setFrom(localIsoDate(monday));
    setTo(localIsoDate(today));
  };

  const setDateToThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setFrom(localIsoDate(firstDay));
    setTo(localIsoDate(today));
  };

  const handleTradesTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (tab !== 'trades' || !isOnline || isRefreshingMarks) {
      return;
    }
    if (event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const atTop = window.scrollY <= 0 && event.currentTarget.scrollTop <= 0;
    pullMetaRef.current = { x: touch.clientX, y: touch.clientY, enabled: atTop };
    setPullStartY(touch.clientY);
  };

  const handleTradesTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const pullState = pullMetaRef.current;
    if (!pullState.enabled || tab !== 'trades') {
      return;
    }
    if (event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const deltaY = touch.clientY - pullState.y;
    const deltaX = touch.clientX - pullState.x;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      pullMetaRef.current.enabled = false;
      setIsPulling(false);
      setPullDistance(0);
      return;
    }
    if (deltaY <= 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    event.preventDefault();
    setIsPulling(true);
    setPullDistance(Math.min(deltaY, 120));
  };

  const handleTradesTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    const shouldRefresh = pullMetaRef.current.enabled && pullDistance >= 60 && !isRefreshingMarks && isOnline;
    pullMetaRef.current = { x: 0, y: 0, enabled: false };
    setIsPulling(false);
    setPullStartY(0);
    setPullDistance(0);
    if (shouldRefresh) {
      handleRefreshClick();
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

  const filteredTrades = useMemo(() => {
    let result = [...trades].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    if (search) {
      const query = search.toLowerCase();
      result = result.filter((trade) => trade.symbol.toLowerCase().includes(query));
    }
    if (from) {
      result = result.filter((trade) => trade.date >= from);
    }
    if (to) {
      result = result.filter((trade) => trade.date <= to);
    }
    if (flt === 'wins') {
      result = result.filter((trade) => trade.status === 'closed' && trade.realizedPnl > 0);
    } else if (flt === 'losses') {
      result = result.filter((trade) => trade.status === 'closed' && trade.realizedPnl < 0);
    } else if (flt === 'open') {
      result = result.filter((trade) => trade.status === 'open');
    } else if (flt === 'closed') {
      result = result.filter((trade) => trade.status === 'closed');
    }
    return result;
  }, [trades, search, from, to, flt]);
  const activeTrades = useMemo(() => trades.filter((trade) => trade.status === 'open'), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === 'closed'), [trades]);
  const filteredOpenTrades = useMemo(() => filteredTrades.filter((trade) => trade.status === 'open'), [filteredTrades]);
  const winCount = useMemo(() => closedTrades.filter((trade) => trade.realizedPnl > 0).length, [closedTrades]);
  const lossCount = useMemo(() => closedTrades.filter((trade) => trade.realizedPnl < 0).length, [closedTrades]);
  const totalOpenExposure = useMemo(
    () => activeTrades.reduce((sum, trade) => sum + trade.entryPrice * getRemainingQuantity(trade), 0),
    [activeTrades]
  );
  const lastTrade = useMemo(() => {
    if (trades.length === 0) {
      return null;
    }
    return [...trades].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }, [trades]);

  useEffect(() => {
    if (!bulkSelectMode) {
      return;
    }
    setSelectedTrades([]);
  }, [tab, search, flt, from, to, bulkSelectMode]);

  useEffect(() => {
    if (!bulkSelectMode) {
      return;
    }
    setSelectedTrades((prev) => prev.filter((id) => trades.some((trade) => trade.id === id)));
  }, [bulkSelectMode, trades]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isTypingField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable);

      if (isTypingField && event.key !== 'Escape') {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('#search-input');
        searchInput?.focus();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openCreateTradeModal();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        handleExportTrades(filteredTrades);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        handleRefreshClick();
        return;
      }

      if (event.key === 'Escape') {
        setShowForm(false);
        setManageTrade(null);
        setShowShortcuts(false);
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !isTypingField && ['1', '2', '3', '4'].includes(event.key)) {
        const tabMap: Tab[] = ['dashboard', 'trades', 'insights', 'profile'];
        const mapped = tabMap[Number.parseInt(event.key, 10) - 1];
        if (mapped) {
          setTab(mapped);
        }
        return;
      }

      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !isTypingField) {
        event.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredTrades, handleExportTrades, handleRefreshClick]);

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

  const activityData = useMemo(() => {
    const days = 14;
    const result: Array<{ day: string; trades: number }> = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - index);
      const key = localIsoDate(date);
      result.push({
        day: key.slice(5),
        trades: trades.filter((trade) => trade.date === key).length,
      });
    }
    return result;
  }, [trades]);
  const riskExposureData = useMemo(
    () => [
      {
        name: 'Open Exposure',
        percent: roundTo2(openExposure.percent),
        fill: openExposure.percent > 80 ? C.neg : openExposure.percent > 50 ? '#f59e0b' : C.pos,
      },
    ],
    [openExposure.percent]
  );

  const pieData = [
    { name: 'Wins', value: summary.wins, color: C.pos },
    { name: 'Losses', value: summary.losses, color: C.neg },
  ];
  const currentPeriod = periodNow();
  const periodGoals = goals.filter((goal) => goal.period === currentPeriod);
  const goalProgress = getGoalProgress(periodGoals, trades);
  const dismissedInsightSet = useMemo(() => new Set(dismissedInsights), [dismissedInsights]);

  const pnlInsight = useMemo(
    () =>
      generatePnLInsight(trades, summary.winRate, portfolioValue, summary.total, formatCurrency, () => {
        setTab('trades');
        setFlt('losses');
      }),
    [formatCurrency, portfolioValue, summary.total, summary.winRate, trades]
  );

  const winRateInsight = useMemo(
    () =>
      generateWinRateInsight(trades, summary.winRate, formatCurrency, () => {
        setTab('trades');
        setFlt('wins');
      }),
    [formatCurrency, summary.winRate, trades]
  );

  const tradingFrequencyInsight = useMemo(() => generateTradingFrequencyInsight(trades), [trades]);
  const riskInsight = useMemo(
    () =>
      generateRiskManagementInsight(trades, portfolioValue, () => {
        setTab('trades');
        setFlt('open');
      }),
    [portfolioValue, trades]
  );
  const streakInsight = useMemo(() => generateStreakInsight(trades), [trades]);
  const bestWorstInsight = useMemo(() => generateBestWorstTradeInsight(trades), [trades]);

  const dismissInsight = (id: string) => {
    setDismissedInsights((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

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

  const tabs: Array<{ id: Tab; label: string; badge?: number | string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'trades', label: 'Trades', badge: activeTrades.length || undefined },
    { id: 'insights', label: 'Insights' },
    { id: 'profile', label: 'Profile', badge: accountUser ? undefined : '!' },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-28 text-[var(--text)] md:pb-8">
      {!isOnline ? (
        <div className="bg-[var(--negative)] px-4 py-2 text-center text-sm font-medium text-white">
          {'\u26A0\uFE0F'} No internet connection - Price updates unavailable
        </div>
      ) : null}
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        <header className="sticky top-0 z-30 rounded-2xl border border-[var(--border)] bg-[linear-gradient(140deg,rgba(37,99,235,0.16),rgba(17,24,39,0.92)_35%,rgba(15,23,42,0.95))] p-3 shadow-[var(--shadow-card)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:rgba(148,163,184,0.25)] bg-[color:rgba(59,130,246,0.22)] text-[var(--accent)]">
                <CandlestickChart size={16} />
              </div>
              <h1
                className="truncate text-base font-semibold tracking-tight text-[var(--text-strong)] md:text-lg"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Trading GF
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCurrencyModal(true)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm sm:hidden"
              >
                {currency}
              </button>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                className="hidden rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm sm:block"
              >
                {MAJOR_CURRENCIES.map((currencyOption) => (
                  <option key={currencyOption.code} value={currencyOption.code}>
                    {currencyOption.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setTab('profile')}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"
                aria-label="Open profile"
              >
                <Settings size={14} />
                {!accountUser ? <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--negative)]" /> : null}
              </button>
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
                {activeContextTip === 'dashboard' ? 'Dashboard shows today, key metrics, and your most recent trades.' : null}
                {activeContextTip === 'trades' ? 'Use search, filters, and date range together to isolate specific trades quickly.' : null}
                {activeContextTip === 'insights' ? 'Insights explains what the charts are saying and what to improve next.' : null}
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

          {tab === 'dashboard' && (
            <div className="space-y-3">
              {portfolioValue === 0 && hasSkippedPortfolioValue && !dismissedPortfolioBanner ? (
                <PortfolioValueBanner
                  onSetValue={() => setTab('profile')}
                  onDismiss={() => setDismissedPortfolioBanner(true)}
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                <span className="text-sm text-[var(--muted)]">Portfolio Value</span>
                {!isEditingPortfolio ? (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{compactPortfolioValue}</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingPortfolio(true)}
                      className="text-sm text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={portfolioValueInput}
                      onChange={(event) => setPortfolioValueInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitPortfolioValue();
                          setIsEditingPortfolio(false);
                        }
                        if (event.key === 'Escape') {
                          setPortfolioValueInput(portfolioValue.toFixed(2));
                          setIsEditingPortfolio(false);
                        }
                      }}
                      autoFocus
                      className="h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm sm:w-36"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        commitPortfolioValue();
                        setIsEditingPortfolio(false);
                      }}
                      className="text-sm text-[var(--positive)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPortfolioValueInput(portfolioValue.toFixed(2));
                        setIsEditingPortfolio(false);
                      }}
                      className="text-sm text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

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
                  onClick={() => openCreateTradeModal()}
                  className="min-h-11 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
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
                  title="No trades yet"
                  description="Add your first trade to start tracking performance."
                  action={{
                    label: 'Add Trade',
                    onClick: () => openCreateTradeModal(),
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
              ) : null}
            </div>
          )}

          {tab === 'trades' && (
            <div
              className="pull-to-refresh-wrapper space-y-3"
              onTouchStart={handleTradesTouchStart}
              onTouchMove={handleTradesTouchMove}
              onTouchEnd={handleTradesTouchEnd}
            >
              {isPulling ? (
                <div className="refresh-indicator h-16" data-pull-start={pullStartY}>
                  <div className="flex items-center justify-center gap-2 text-tertiary">
                    <RefreshCw
                      size={18}
                      className={pullDistance >= 60 ? 'animate-spin text-[var(--accent)]' : 'text-[var(--accent)]'}
                      style={{ transform: `rotate(${Math.max(0, pullDistance * 3)}deg)` }}
                    />
                    <span>{pullDistance >= 60 ? 'Release to refresh' : 'Pull to refresh'}</span>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3 transition-transform duration-150" style={{ transform: isPulling ? `translateY(${pullDistance * 0.35}px)` : undefined }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-secondary">Trades ({filteredTrades.length})</h2>
                    <p className="text-tertiary">Last refresh: {refreshAgeLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkSelectMode((value) => {
                          const next = !value;
                          if (!next) {
                            setSelectedTrades([]);
                          }
                          return next;
                        });
                      }}
                      className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-tertiary"
                    >
                      {bulkSelectMode ? 'Cancel Select' : 'Select Multiple'}
                    </button>
                    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setTradeViewMode('card')}
                        className={`flex min-h-11 items-center gap-1 rounded-md px-3 text-tertiary ${
                          tradeViewMode === 'card' ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)]'
                        }`}
                      >
                        <LayoutGrid size={12} /> Card
                      </button>
                      <button
                        type="button"
                        onClick={() => setTradeViewMode('compact')}
                        className={`flex min-h-11 items-center gap-1 rounded-md px-3 text-tertiary ${
                          tradeViewMode === 'compact' ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--muted)]'
                        }`}
                      >
                        <List size={12} /> Compact
                      </button>
                    </div>
                  </div>
                </div>

                {!isOnline ? (
                  <div className="rounded-lg border border-[var(--negative)] bg-[color:rgba(248,113,113,0.12)] p-3 text-tertiary text-[var(--negative)]">
                    You are offline. Price updates are unavailable.
                  </div>
                ) : null}

                {activeTrades.length > 1 ? (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <div>
                      <p className="text-secondary-sm">{activeTrades.length} open positions</p>
                      <p className="text-tertiary text-numeric">Exposure: {formatCurrency(totalOpenExposure)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseAll}
                      className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-secondary-sm text-black"
                    >
                      Close All
                    </button>
                  </div>
                ) : null}

                {lastTrade ? (
                  <button
                    type="button"
                    onClick={() => duplicateTrade(lastTrade.id)}
                    className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-tertiary"
                  >
                    Trade {lastTrade.symbol} again
                  </button>
                ) : null}

              <label className="relative block">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-[var(--muted)]" />
                <input
                  id="search-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search symbol"
                  className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-3)] pl-8 pr-2.5 text-secondary-sm"
                />
              </label>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setFlt('all')}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${flt === 'all' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                >
                  All ({trades.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFlt('wins')}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${flt === 'wins' ? 'bg-[var(--positive)] text-white' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                >
                  Wins ({winCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFlt('losses')}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${flt === 'losses' ? 'bg-[var(--negative)] text-white' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                >
                  Losses ({lossCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFlt('open')}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${flt === 'open' ? 'bg-[color:rgba(245,158,11,0.95)] text-black' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                >
                  Open ({activeTrades.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFlt('closed')}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${flt === 'closed' ? 'bg-[var(--surface-strong)] text-[var(--text)]' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                >
                  Closed ({closedTrades.length})
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={setDateToToday} className="whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1 text-tertiary">Today</button>
                <button type="button" onClick={setDateToThisWeek} className="whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1 text-tertiary">This Week</button>
                <button type="button" onClick={setDateToThisMonth} className="whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1 text-tertiary">This Month</button>
                <button type="button" onClick={() => setFlt('open')} className="whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1 text-tertiary">Open Only</button>
                <button type="button" onClick={() => setFlt('losses')} className="whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-1 text-tertiary">Losses Only</button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm"
                  placeholder="To"
                />
                {from || to ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFrom('');
                      setTo('');
                    }}
                    className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted)]"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {bulkSelectMode ? (
                <div className="sticky top-0 z-10 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-tertiary">{selectedTrades.length} selected</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={selectedTrades.length === 0}
                        onClick={handleBulkExport}
                        className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-1.5 text-tertiary disabled:opacity-50"
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        disabled={selectedTrades.length === 0}
                        onClick={handleBulkDelete}
                        className="min-h-11 rounded-lg border border-[var(--negative)] bg-[color:rgba(248,113,113,0.12)] px-3 py-1.5 text-tertiary text-[var(--negative)] disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
                <p className="text-sm text-[var(--muted)]">
                  <Wallet size={12} className="mr-1 inline" />
                  Showing {filteredOpenTrades.length} open of {filteredTrades.length} filtered trades
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
                  {!isMarketOpenNow ? <span className="text-xs text-[var(--muted)]">Market closed • Prices may be stale</span> : null}
                  <button
                    type="button"
                    onClick={handleRefreshClick}
                    disabled={isRefreshingMarks || !isOnline}
                    title={!isOnline ? 'No internet connection' : 'Refresh prices'}
                    className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={`mr-1 inline ${isRefreshingMarks ? 'animate-spin' : ''}`} />
                    {isRefreshingMarks ? 'Refreshing...' : 'Refresh Marks'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportTrades(filteredTrades)}
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
                  {activeTrades.length > 1 ? (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span>Progress</span>
                        <span>{refreshProgress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div
                          className="h-full bg-[var(--accent)] transition-all duration-300"
                          style={{ width: `${refreshProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {markRefreshError ? (
                <div className="rounded-lg border border-[color:rgba(248,113,113,0.5)] bg-[color:rgba(127,29,29,0.25)] p-3 text-sm">
                  <p className="font-semibold text-[color:#fecaca]">Could not refresh prices</p>
                  <p className="mt-1 text-[color:#fecaca]">{markRefreshError}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshClick}
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
                  title="No trades yet"
                  description="Add your first trade to begin journaling."
                  action={{
                    label: 'Add Trade',
                    onClick: () => openCreateTradeModal(),
                  }}
                />
              ) : filteredTrades.length === 0 ? (
                <EmptyState
                  icon={<Search size={58} />}
                  title={`No trades found${search ? ` for "${search}"` : ''}`}
                  description="Try adjusting filters or clearing search."
                  action={{
                    label: 'Clear Filters',
                    onClick: () => {
                      setSearch('');
                      setFrom('');
                      setTo('');
                      setFlt('all');
                    },
                  }}
                />
              ) : tradeViewMode === 'compact' ? (
                <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-card)]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      <div className={`grid ${bulkSelectMode ? 'grid-cols-[44px_92px_72px_62px_92px_70px_120px_100px_132px]' : 'grid-cols-[92px_72px_62px_92px_70px_120px_100px_132px]'} gap-2 border-b border-[var(--border)] px-2 py-2`}>
                        {bulkSelectMode ? <p className="ui-label">Select</p> : null}
                        <p className="ui-label">Symbol</p>
                        <p className="ui-label">Status</p>
                        <p className="ui-label">Side</p>
                        <p className="ui-label">Entry</p>
                        <p className="ui-label">Qty</p>
                        <p className="ui-label">P&amp;L</p>
                        <p className="ui-label">% / Delta</p>
                        <p className="ui-label text-right">Actions</p>
                      </div>
                      {filteredTrades.map((trade) => {
                        const priceChange = priceChangesByTradeId[trade.id];
                        return (
                          <div
                            key={trade.id}
                            className={`grid ${bulkSelectMode ? 'grid-cols-[44px_92px_72px_62px_92px_70px_120px_100px_132px]' : 'grid-cols-[92px_72px_62px_92px_70px_120px_100px_132px]'} items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 last:border-b-0 ${
                              trade.totalPnl >= 0 ? 'border-l-2 border-l-[var(--positive)]' : 'border-l-2 border-l-[var(--negative)]'
                            } ${recentlyUpdatedTradeIds.includes(trade.id) ? 'pulse-update' : ''}`}
                          >
                            {bulkSelectMode ? (
                              <input
                                type="checkbox"
                                checked={selectedTrades.includes(trade.id)}
                                onChange={(event) => {
                                  setSelectedTrades((prev) => event.target.checked ? [...prev, trade.id] : prev.filter((id) => id !== trade.id));
                                }}
                                className="h-4 w-4 rounded"
                                aria-label={`Select ${trade.symbol}`}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <p className="truncate text-secondary-sm">{trade.symbol}</p>
                              <p className="truncate text-tertiary-sm">{formatTradeDate(trade.date)}</p>
                            </div>
                            <p className="text-tertiary-sm uppercase">{trade.status}</p>
                            <p className="text-tertiary-sm uppercase">{trade.direction === 'long' ? 'LONG' : 'SHORT'}</p>
                            <p className="text-tertiary-sm text-numeric">{formatCurrency(trade.entryPrice)}</p>
                            <p className="text-tertiary-sm text-numeric">{trade.quantity.toFixed(2)}</p>
                            <p className={`text-secondary-sm text-numeric ${pnlClass(trade.totalPnl)}`}>{pnl(trade.totalPnl)}</p>
                            <div>
                              <p className={`text-tertiary-sm text-numeric ${pnlClass(trade.totalPnl)}`}>{trade.totalPnlPercent.toFixed(2)}%</p>
                              {priceChange ? (
                                <p className={`text-tertiary-sm text-numeric ${priceChange.change >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                                  {priceChange.change >= 0 ? '\u2191' : '\u2193'} {formatCurrency(Math.abs(priceChange.change))} ({Math.abs(priceChange.changePercent).toFixed(2)}%)
                                </p>
                              ) : null}
                            </div>
                            <div className="flex justify-end gap-1">
                              {trade.status === 'open' ? (
                                <button
                                  type="button"
                                  onClick={() => setManageTrade(trade)}
                                  className="h-11 rounded-full bg-[color:rgba(245,158,11,0.18)] px-2.5 text-[10px] font-medium text-[color:#fbbf24] transition hover:brightness-110"
                                >
                                  Manage
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setTradeFormInitialValues(undefined);
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
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {filteredTrades.map((trade) => (
                    <TradeCard
                      key={trade.id}
                      trade={trade}
                      isExpanded={expandedTradeId === trade.id}
                      portfolioValue={portfolioValue}
                      formatCurrency={formatCurrency}
                      formatTradeDate={formatTradeDate}
                      showSelection={bulkSelectMode}
                      selected={selectedTrades.includes(trade.id)}
                      onSelectToggle={(tradeId, checked) => {
                        setSelectedTrades((prev) => checked ? [...prev, tradeId] : prev.filter((id) => id !== tradeId));
                      }}
                      isRecentlyUpdated={recentlyUpdatedTradeIds.includes(trade.id)}
                      priceChange={priceChangesByTradeId[trade.id]}
                      onHaptic={haptic}
                      onToggle={(tradeId) => setExpandedTradeId((prev) => (prev === tradeId ? null : tradeId))}
                      onEdit={(tradeId) => {
                        const selected = filteredTrades.find((item) => item.id === tradeId);
                        if (!selected) {
                          return;
                        }
                        setTradeFormInitialValues(undefined);
                        setEditTrade(selected);
                        setShowForm(true);
                      }}
                      onDelete={(tradeId) => delTrade(tradeId)}
                      onDuplicate={duplicateTrade}
                      onCloseQuick={(tradeId) => {
                        void closeTradeNow(tradeId);
                      }}
                      onManage={trade.status === 'open'
                        ? (tradeId) => {
                          const selected = filteredTrades.find((item) => item.id === tradeId && item.status === 'open');
                          if (!selected) {
                            return;
                          }
                          setManageTrade(selected);
                        }
                        : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
            </div>
          )}

          {tab === 'insights' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Insights</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useUnrealized}
                    onChange={(event) => setUseUnrealized(event.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-[var(--muted)]">Include Unrealized</span>
                </label>
              </div>

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
                  description={`Add at least 5 trades for meaningful insights. Current: ${trades.length}/5`}
                  action={{
                    label: 'Add More Trades',
                    onClick: () => setTab('trades'),
                  }}
                />
              ) : (
                <>
                  {pnlInsight ? (
                    <InsightCard
                      {...pnlInsight}
                      dismissible
                      dismissed={dismissedInsightSet.has(pnlInsight.id)}
                      onDismiss={dismissInsight}
                    />
                  ) : null}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="mb-2 text-xs uppercase text-[var(--muted)]">P&amp;L Over Time</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={lineData}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis dataKey="date" stroke={C.text} />
                        <YAxis stroke={C.text} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_LABEL_STYLE}
                          itemStyle={CHART_ITEM_STYLE}
                        />
                        <Line dataKey="realized" stroke={C.realized} strokeWidth={2} dot={false} />
                        <Line dataKey="provisional" stroke={C.provisional} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {winRateInsight ? (
                    <InsightCard
                      {...winRateInsight}
                      dismissible
                      dismissed={dismissedInsightSet.has(winRateInsight.id)}
                      onDismiss={dismissInsight}
                    />
                  ) : null}
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

                  {tradingFrequencyInsight ? (
                    <InsightCard
                      {...tradingFrequencyInsight}
                      dismissible
                      dismissed={dismissedInsightSet.has(tradingFrequencyInsight.id)}
                      onDismiss={dismissInsight}
                    />
                  ) : null}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="mb-2 text-xs uppercase text-[var(--muted)]">Trading Activity (14 days)</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={activityData}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis dataKey="day" stroke={C.text} />
                        <YAxis stroke={C.text} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_LABEL_STYLE}
                          itemStyle={CHART_ITEM_STYLE}
                        />
                        <Bar dataKey="trades" fill={C.realized} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {riskInsight ? (
                    <InsightCard
                      {...riskInsight}
                      dismissible
                      dismissed={dismissedInsightSet.has(riskInsight.id)}
                      onDismiss={dismissInsight}
                    />
                  ) : null}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="mb-2 text-xs uppercase text-[var(--muted)]">Risk Exposure (%)</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={riskExposureData}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis dataKey="name" stroke={C.text} />
                        <YAxis stroke={C.text} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={CHART_LABEL_STYLE}
                          itemStyle={CHART_ITEM_STYLE}
                        />
                        <Bar dataKey="percent">
                          {riskExposureData.map((entry, index) => (
                            <Cell key={index} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {streakInsight ? (
                    <InsightCard
                      {...streakInsight}
                      dismissible
                      dismissed={dismissedInsightSet.has(streakInsight.id)}
                      onDismiss={dismissInsight}
                    />
                  ) : null}
                  {bestWorstInsight ? (
                    <InsightCard
                      {...bestWorstInsight}
                      dismissible
                      dismissed={dismissedInsightSet.has(bestWorstInsight.id)}
                      onDismiss={dismissInsight}
                    />
                  ) : null}

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <h3 className="mb-2 font-semibold">Goals</h3>
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

          {tab === 'profile' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Profile</h2>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-2 font-semibold">Portfolio</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">Base Currency</span>
                    <span className="font-semibold">{currency}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">Portfolio Value</span>
                    <span className="font-semibold">{formatCurrency(portfolioValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">Total P&amp;L</span>
                    <span className={`font-semibold ${pnlClass(summary.total)}`}>{pnl(summary.total)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-2 font-semibold">Account</h3>
                {accountUser ? (
                  <div>
                    <p className="mb-2 text-sm">
                      Signed in as <span className="font-semibold">{accountUser.email ?? accountUser.id}</span>
                    </p>
                    <p className="mb-2 text-xs text-[var(--positive)]">Trades, goals, and settings synced across devices</p>
                    {isSyncingSettings || isSyncingCloudData ? (
                      <p className="mb-2 text-xs text-[var(--accent)]">Syncing cloud data...</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                      }}
                      className="min-h-11 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <LogOut size={14} className="mr-1 inline" /> Sign Out
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-sm text-[var(--muted)]">Sign in to sync your settings and data across devices.</p>
                    <button
                      type="button"
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
                <p className="mt-2 text-xs text-[var(--muted)]">{authNotice}</p>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-2 font-semibold">Preferences</h3>
                <button
                  type="button"
                  onClick={() => setConfirmDelete((value) => !value)}
                  className="mb-2 flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                >
                  <span>Confirm before deleting trades</span>
                  <span className={`relative h-6 w-11 rounded-full transition ${confirmDelete ? 'bg-[var(--positive)]' : 'bg-[var(--surface-3)]'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${confirmDelete ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRefreshMarks((value) => !value)}
                  className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                >
                  <span>Auto-refresh prices on app start</span>
                  <span className={`relative h-6 w-11 rounded-full transition ${autoRefreshMarks ? 'bg-[var(--positive)]' : 'bg-[var(--surface-3)]'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${autoRefreshMarks ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </button>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-2 font-semibold">Data</h3>
                <button
                  type="button"
                  onClick={() => handleExportTrades(trades)}
                  className="mb-2 min-h-11 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <Download size={14} className="mr-1 inline" /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="min-h-11 w-full rounded-lg border border-[var(--negative)] bg-[color:rgba(248,113,113,0.12)] px-3 py-2 text-sm text-[var(--negative)]"
                >
                  Clear All Data
                </button>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <h3 className="mb-2 font-semibold">About</h3>
                <p className="text-sm text-[var(--muted)]">Trading GF v1.0.0</p>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <h3 className="mb-2 text-sm font-semibold">{'\u{1F4CA}'} Price Data Information</h3>
                <div className="space-y-2 text-xs text-[var(--muted)]">
                  <p><span className="font-medium text-[var(--text)]">Source:</span> Price data sourced from Yahoo Finance (NSE feed).</p>
                  <p><span className="font-medium text-[var(--text)]">Delay:</span> Price updates are near real-time with up to 15-20 minute delay.</p>
                  <p><span className="font-medium text-[var(--text)]">Purpose:</span> Data provided for journaling and research purposes only. Not intended for real-time trading decisions.</p>
                  <p><span className="font-medium text-[var(--text)]">Risk Warning:</span> Please be aware of the risks involved in trading and seek independent advice if necessary.</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <button
        onClick={() => openCreateTradeModal()}
        title="Add Trade"
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[color:rgba(96,165,250,0.6)] bg-[linear-gradient(130deg,#22d3ee,#3b82f6)] text-[#05101f] shadow-[0_14px_26px_rgba(37,99,235,0.35)] transition hover:brightness-110 md:bottom-6"
      >
        <Plus size={20} />
        <span className="sr-only">Add Trade</span>
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[color:rgba(7,11,20,0.95)] px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-2">
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

      {showCurrencyModal ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3 sm:hidden">
          <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Select Currency</p>
              <button
                type="button"
                onClick={() => setShowCurrencyModal(false)}
                className="rounded-md p-1 text-[var(--muted)]"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MAJOR_CURRENCIES.map((currencyOption) => (
                <button
                  key={currencyOption.code}
                  type="button"
                  onClick={() => {
                    setCurrency(currencyOption.code);
                    setShowCurrencyModal(false);
                  }}
                  className={`rounded-md border px-2 py-2 text-sm ${
                    currency === currencyOption.code
                      ? 'border-[var(--accent)] bg-[color:rgba(125,211,252,0.15)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]'
                  }`}
                >
                  {currencyOption.code}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showShortcuts ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="text-secondary">Keyboard Shortcuts</h2>
            <div className="mt-3 space-y-2 text-tertiary">
              <div className="flex items-center justify-between"><span>Quick Search</span><kbd className="rounded bg-[var(--surface-2)] px-2 py-1">Ctrl/Cmd + K</kbd></div>
              <div className="flex items-center justify-between"><span>New Trade</span><kbd className="rounded bg-[var(--surface-2)] px-2 py-1">Ctrl/Cmd + N</kbd></div>
              <div className="flex items-center justify-between"><span>Refresh Prices</span><kbd className="rounded bg-[var(--surface-2)] px-2 py-1">Ctrl/Cmd + R</kbd></div>
              <div className="flex items-center justify-between"><span>Export</span><kbd className="rounded bg-[var(--surface-2)] px-2 py-1">Ctrl/Cmd + E</kbd></div>
              <div className="flex items-center justify-between"><span>Switch Tabs</span><kbd className="rounded bg-[var(--surface-2)] px-2 py-1">1-4</kbd></div>
            </div>
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              className="mt-4 min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-secondary-sm text-black"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showPriceDisclaimer ? <PriceDisclaimerModal onAccept={handleDisclaimerAccept} /> : null}

      {isRefreshingMarks ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <RefreshCw size={42} className="mx-auto mb-3 animate-spin text-[var(--accent)]" />
            <p className="text-secondary-sm">Refreshing Prices...</p>
            <p className="text-tertiary">Updating {activeTrades.length} position{activeTrades.length === 1 ? '' : 's'}</p>
          </div>
        </div>
      ) : null}

      {isRefreshingMarks && activeTrades.length > 1 ? (
        <div className="fixed bottom-20 left-4 right-4 z-[60] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 md:left-auto md:right-4 md:w-[320px]">
          <div className="mb-2 flex items-center justify-between text-tertiary">
            <span>Refreshing prices...</span>
            <span>{Math.round(refreshProgress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${refreshProgress}%` }} />
          </div>
        </div>
      ) : null}

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
          key={editTrade?.id ?? `create_${tradeFormInitialValues?.symbol ?? ''}_${tradeFormInitialValues?.date ?? ''}`}
          isOpen={showForm}
          trade={editTrade}
          initialValues={editTrade ? undefined : tradeFormInitialValues}
          currency={currency}
          portfolioValue={portfolioValue}
          onClose={() => {
            setShowForm(false);
            setEditTrade(null);
            setTradeFormInitialValues(undefined);
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









