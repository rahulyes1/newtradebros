export const MAJOR_CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'HKD', label: 'Hong Kong Dollar (HKD)' },
] as const;

export type CurrencyCode = (typeof MAJOR_CURRENCIES)[number]['code'];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';
export const CURRENCY_STORAGE_KEY = 'settings.currency';
export const PORTFOLIO_VALUE_STORAGE_KEY = 'settings.portfolioValue';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return MAJOR_CURRENCIES.some((currency) => currency.code === value);
}

export function buildCurrencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const STRATEGY_PRESETS = [
  'Breakout',
  'Pullback',
  'VWAP Reclaim',
  'Opening Range Breakout',
  'Trend Continuation',
  'Mean Reversion',
  'Support Bounce',
  'Resistance Rejection',
  'Gap and Go',
  'News Momentum',
  'Earnings Reaction',
  'Range Expansion',
  'Range Fade',
  'Liquidity Sweep',
  'Scalp',
  'Swing Continuation',
  'Reversal',
] as const;

export const CUSTOM_STRATEGY_VALUE = '__custom_strategy__';
