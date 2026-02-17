import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CandlestickChart, ChevronDown, ChevronUp } from 'lucide-react';
import {
  CURRENCY_STORAGE_KEY,
  MAJOR_CURRENCIES,
  PORTFOLIO_VALUE_STORAGE_KEY,
  type CurrencyCode,
} from '../../../shared/config/tradingOptions';
import { roundTo2 } from '../../../shared/services/tradeMath';

interface OnboardingWizardProps {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  portfolioValue: number;
  setPortfolioValue: (value: number) => void;
  portfolioValueInput: string;
  setPortfolioValueInput: (value: string) => void;
  onComplete: (result: { skippedPortfolioValue: boolean; portfolioValue: number }) => void;
}

type OnboardingStep = 1 | 2 | 3;
type TransitionDirection = 'forward' | 'backward';

const STEP_TRANSITION_MS = 260;
const FEATURED_CURRENCY_OPTIONS: ReadonlyArray<{ code: CurrencyCode; name: string; symbol: string }> = [
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5' },
];
const PRESET_VALUES = [10000, 50000, 100000, 500000, 1000000] as const;

const EURO_REGION_CODES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
]);

function getLocaleRegion(locale: string): string | null {
  const parts = locale.replace('_', '-').split('-');
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (/^[A-Z]{2}$/.test(upper)) {
      return upper;
    }
  }
  return null;
}

function inferCurrencyFromLocale(): CurrencyCode {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-IN';
  const region = getLocaleRegion(locale);

  if (region == null) {
    return 'INR';
  }
  if (region === 'IN') {
    return 'INR';
  }
  if (region === 'US') {
    return 'USD';
  }
  if (region === 'GB') {
    return 'GBP';
  }
  if (region === 'JP') {
    return 'JPY';
  }
  if (region === 'AU') {
    return 'AUD';
  }
  if (region === 'CA') {
    return 'CAD';
  }
  if (region === 'CH') {
    return 'CHF';
  }
  if (region === 'SG') {
    return 'SGD';
  }
  if (region === 'HK') {
    return 'HKD';
  }
  if (EURO_REGION_CODES.has(region)) {
    return 'EUR';
  }
  return 'INR';
}

function getCurrencySymbol(currency: CurrencyCode): string {
  try {
    const symbol = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')
      ?.value;
    return symbol ?? currency;
  } catch {
    return currency;
  }
}

function normalizeDigits(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.replace(/^0+(?=\d)/, '');
}

function formatDigitsWithCommas(value: string): string {
  if (!value) {
    return '';
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return parsed.toLocaleString('en-US');
}

function getPresetLabel(value: number): string {
  if (value === 100000) {
    return '1L';
  }
  if (value === 500000) {
    return '5L';
  }
  if (value === 1000000) {
    return '10L';
  }
  return `${Math.round(value / 1000)}K`;
}

function findPreset(value: number): number | null {
  for (const preset of PRESET_VALUES) {
    if (preset === value) {
      return preset;
    }
  }
  return null;
}

function getInitialCapitalDigits(portfolioValue: number, portfolioValueInput: string): string {
  const parsedInput = Number.parseFloat(portfolioValueInput.replace(/,/g, ''));
  const sourceValue = Number.isFinite(parsedInput) && parsedInput > 0 ? parsedInput : portfolioValue;
  const rounded = Math.round(sourceValue);
  return rounded > 0 ? String(rounded) : '';
}

function WelcomeStep({
  onNext,
  primaryButtonRef,
}: {
  onNext: () => void;
  primaryButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section aria-labelledby="onboarding-step-1-title" className="flex h-full flex-col justify-center px-1 text-center">
      <div className="mb-5">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/80">
          <CandlestickChart size={34} className="text-[var(--accent)]" />
        </div>
        <h2 id="onboarding-step-1-title" className="font-[var(--font-display)] text-2xl font-semibold text-[var(--text)] sm:text-[1.75rem]">
          Welcome to Trading Journal Pro
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Track trades <span className="text-[var(--accent)]">{'\u2022'}</span> Analyze performance{' '}
          <span className="text-[var(--accent)]">{'\u2022'}</span> Improve your edge
        </p>
      </div>

      <div className="mb-8 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/35 p-4 text-left text-sm">
        <p className="flex items-start gap-2.5">
          <span className="mt-0.5 text-[var(--accent)]">{'\u2022'}</span>
          <span>Journal every trade with detailed tracking</span>
        </p>
        <p className="flex items-start gap-2.5">
          <span className="mt-0.5 text-[var(--accent)]">{'\u2022'}</span>
          <span>Visualize your performance with charts</span>
        </p>
        <p className="flex items-start gap-2.5">
          <span className="mt-0.5 text-[var(--accent)]">{'\u2022'}</span>
          <span>Set goals and track progress</span>
        </p>
        <p className="flex items-start gap-2.5">
          <span className="mt-0.5 text-[var(--accent)]">{'\u2022'}</span>
          <span>Export and sync across devices</span>
        </p>
      </div>

      <button
        type="button"
        ref={primaryButtonRef}
        onClick={onNext}
        className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60 focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
      >
        Get Started
      </button>
    </section>
  );
}

function CurrencyStep({
  currency,
  setCurrency,
  expanded,
  onToggleExpanded,
  onBack,
  onContinue,
  firstCurrencyRef,
}: {
  currency: CurrencyCode | null;
  setCurrency: (currency: CurrencyCode) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onBack: () => void;
  onContinue: () => void;
  firstCurrencyRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section aria-labelledby="onboarding-step-2-title" className="flex h-full flex-col">
      <h2 id="onboarding-step-2-title" className="font-[var(--font-display)] text-xl font-semibold text-[var(--text)] sm:text-2xl">
        What's your base currency?
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">This will be used for all your trades</p>

      <div className="mt-4 flex-1 space-y-2.5">
        {FEATURED_CURRENCY_OPTIONS.map((option, index) => {
          const selected = currency === option.code;
          return (
            <button
              key={option.code}
              type="button"
              ref={index === 0 ? firstCurrencyRef : undefined}
              onClick={() => setCurrency(option.code)}
              aria-pressed={selected}
              className={`min-h-14 w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/55 ${
                selected
                  ? 'border-[var(--accent)] bg-[color:rgba(125,211,252,0.14)] text-[var(--text)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)]/25 text-[var(--text)] hover:border-[var(--accent)]/50'
              }`}
            >
              <p className="text-sm font-semibold sm:text-[15px]">
                {option.code} - {option.name} ({option.symbol})
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/25">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--muted)] transition hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
        >
          <span>Show more currencies</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expanded ? (
          <div className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2">
            {MAJOR_CURRENCIES.map((currencyOption) => {
              const selected = currencyOption.code === currency;
              const symbol = getCurrencySymbol(currencyOption.code);
              return (
                <button
                  key={currencyOption.code}
                  type="button"
                  onClick={() => setCurrency(currencyOption.code)}
                  aria-pressed={selected}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/55 ${
                    selected
                      ? 'border-[var(--accent)] bg-[color:rgba(125,211,252,0.14)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]/45'
                  }`}
                >
                  <p className="font-semibold">{currencyOption.code}</p>
                  <p className="text-xs text-[var(--muted)]">{currencyOption.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">Symbol: {symbol}</p>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={currency == null}
          className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
        >
          Continue
        </button>
      </div>
    </section>
  );
}

function PortfolioStep({
  currency,
  capitalInput,
  onCapitalChange,
  onPresetSelect,
  onCustomSelect,
  selectedPreset,
  onBack,
  onStartTrading,
  onSkip,
  inputRef,
}: {
  currency: CurrencyCode;
  capitalInput: string;
  onCapitalChange: (value: string) => void;
  onPresetSelect: (value: number) => void;
  onCustomSelect: () => void;
  selectedPreset: number | 'custom' | null;
  onBack: () => void;
  onStartTrading: () => void;
  onSkip: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const symbol = getCurrencySymbol(currency);

  return (
    <section aria-labelledby="onboarding-step-3-title" className="flex h-full flex-col">
      <h2 id="onboarding-step-3-title" className="font-[var(--font-display)] text-xl font-semibold text-[var(--text)] sm:text-2xl">
        What's your trading capital?
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">(Don't worry, you can change this anytime)</p>

      <div className="mt-4">
        <label htmlFor="onboarding-capital" className="mb-1 block text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
          Portfolio value
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">{symbol}</span>
          <input
            id="onboarding-capital"
            ref={inputRef}
            inputMode="numeric"
            pattern="[0-9,]*"
            autoComplete="off"
            value={capitalInput}
            onChange={(event) => onCapitalChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onStartTrading();
              }
            }}
            placeholder="100,000"
            className="h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 pl-8 text-base text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
            aria-label="Trading capital"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/35 p-3 text-sm text-[var(--text)]">
        <p className="font-semibold">💡 This helps us calculate:</p>
        <p className="mt-1 text-[var(--muted)]">• Position sizing (% of your portfolio)</p>
        <p className="text-[var(--muted)]">• Risk per trade</p>
        <p className="text-[var(--muted)]">• Your returns as percentages</p>
        <p className="mt-2 text-xs text-[var(--muted)]">⚠️ Enter your actual trading capital, not your net worth</p>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Quick presets</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_VALUES.map((value) => {
            const selected = selectedPreset === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onPresetSelect(value)}
                className={`min-h-10 rounded-lg border px-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/55 ${
                  selected
                    ? 'border-[var(--accent)] bg-[color:rgba(125,211,252,0.14)] text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]/40'
                }`}
              >
                {symbol}
                {getPresetLabel(value)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onCustomSelect}
            className={`min-h-10 rounded-lg border px-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/55 ${
              selectedPreset === 'custom'
                ? 'border-[var(--accent)] bg-[color:rgba(125,211,252,0.14)] text-[var(--text)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]/40'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onStartTrading}
          className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
        >
          Start Trading
        </button>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mt-3 text-center text-xs text-[var(--muted)] transition hover:text-[var(--text)] focus:outline-none focus:text-[var(--text)]"
      >
        Skip for now
      </button>
    </section>
  );
}

function OnboardingWizard({
  currency,
  setCurrency,
  portfolioValue,
  setPortfolioValue,
  portfolioValueInput,
  setPortfolioValueInput,
  onComplete,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [previousStep, setPreviousStep] = useState<OnboardingStep | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>('forward');
  const [showMoreCurrencies, setShowMoreCurrencies] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(currency);
  const [capitalDigits, setCapitalDigits] = useState<string>(() => getInitialCapitalDigits(portfolioValue, portfolioValueInput));
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom' | null>(() => {
    const initialValue = Number.parseInt(getInitialCapitalDigits(portfolioValue, portfolioValueInput), 10);
    return Number.isFinite(initialValue) ? findPreset(initialValue) : null;
  });

  const initLocaleRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const getStartedButtonRef = useRef<HTMLButtonElement>(null);
  const firstCurrencyButtonRef = useRef<HTMLButtonElement>(null);
  const capitalInputRef = useRef<HTMLInputElement>(null);

  const formattedCapitalInput = useMemo(() => formatDigitsWithCommas(capitalDigits), [capitalDigits]);

  useEffect(() => {
    if (initLocaleRef.current) {
      return;
    }
    initLocaleRef.current = true;

    const inferredCurrency = inferCurrencyFromLocale();
    setSelectedCurrency(inferredCurrency);
    setCurrency(inferredCurrency);
  }, [setCurrency]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (previousStep != null) {
      return;
    }
    const focusTimer = window.setTimeout(() => {
      if (currentStep === 1) {
        getStartedButtonRef.current?.focus();
      } else if (currentStep === 2) {
        firstCurrencyButtonRef.current?.focus();
      } else {
        capitalInputRef.current?.focus();
      }
    }, 20);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [currentStep, previousStep]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current != null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const moveToStep = (nextStep: OnboardingStep) => {
    if (nextStep === currentStep || transitionTimerRef.current != null) {
      return;
    }
    setTransitionDirection(nextStep > currentStep ? 'forward' : 'backward');
    setPreviousStep(currentStep);
    setCurrentStep(nextStep);

    transitionTimerRef.current = window.setTimeout(() => {
      setPreviousStep(null);
      transitionTimerRef.current = null;
    }, STEP_TRANSITION_MS);
  };

  const handleBack = () => {
    if (currentStep === 2) {
      moveToStep(1);
    } else if (currentStep === 3) {
      moveToStep(2);
    }
  };

  const persistOnboarding = (portfolio: number) => {
    const normalizedPortfolio = portfolio > 0 ? roundTo2(portfolio) : 0;
    setCurrency(selectedCurrency);
    setPortfolioValue(normalizedPortfolio);
    setPortfolioValueInput(normalizedPortfolio.toFixed(2));

    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, selectedCurrency);
      localStorage.setItem(PORTFOLIO_VALUE_STORAGE_KEY, String(normalizedPortfolio));
    } catch {
      // Ignore localStorage write errors.
    }

    onComplete({
      skippedPortfolioValue: normalizedPortfolio === 0,
      portfolioValue: normalizedPortfolio,
    });
  };

  const handleWizardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && currentStep > 1) {
      event.preventDefault();
      handleBack();
    }
  };

  const handleCurrencyContinue = () => {
    if (selectedCurrency == null) {
      return;
    }
    setCurrency(selectedCurrency);
    moveToStep(3);
  };

  const handleCapitalChange = (value: string) => {
    const normalized = normalizeDigits(value);
    setCapitalDigits(normalized);

    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed)) {
      setSelectedPreset(findPreset(parsed));
    } else {
      setSelectedPreset(null);
    }
  };

  const handlePresetSelect = (value: number) => {
    setCapitalDigits(String(value));
    setSelectedPreset(value);
  };

  const handleCustomSelect = () => {
    setSelectedPreset('custom');
    capitalInputRef.current?.focus();
  };

  const handleStartTrading = () => {
    const parsedValue = Number.parseInt(capitalDigits, 10);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      persistOnboarding(0);
      return;
    }
    persistOnboarding(parsedValue);
  };

  const handleSkip = () => {
    persistOnboarding(0);
  };

  const renderStep = (step: OnboardingStep) => {
    if (step === 1) {
      return <WelcomeStep onNext={() => moveToStep(2)} primaryButtonRef={getStartedButtonRef} />;
    }
    if (step === 2) {
      return (
        <CurrencyStep
          currency={selectedCurrency}
          setCurrency={setSelectedCurrency}
          expanded={showMoreCurrencies}
          onToggleExpanded={() => setShowMoreCurrencies((value) => !value)}
          onBack={handleBack}
          onContinue={handleCurrencyContinue}
          firstCurrencyRef={firstCurrencyButtonRef}
        />
      );
    }
    return (
      <PortfolioStep
        currency={selectedCurrency}
        capitalInput={formattedCapitalInput}
        onCapitalChange={handleCapitalChange}
        onPresetSelect={handlePresetSelect}
        onCustomSelect={handleCustomSelect}
        selectedPreset={selectedPreset}
        onBack={handleBack}
        onStartTrading={handleStartTrading}
        onSkip={handleSkip}
        inputRef={capitalInputRef}
      />
    );
  };

  const enterClass = transitionDirection === 'forward' ? 'onboarding-step-enter-forward' : 'onboarding-step-enter-back';
  const leaveClass = transitionDirection === 'forward' ? 'onboarding-step-leave-forward' : 'onboarding-step-leave-back';

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onKeyDown={handleWizardKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`onboarding-step-${currentStep}-title`}
        className="flex h-full w-full max-w-[500px] flex-col border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] sm:h-auto sm:max-h-[94vh] sm:rounded-2xl"
      >
        <div className="border-b border-[var(--border)] px-5 pb-4 pt-5">
          <div className="mb-2 text-sm text-[var(--muted)]">Step {currentStep} of 3</div>
          <div
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={currentStep}
            aria-valuetext={`Step ${currentStep} of 3`}
            className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"
          >
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden px-5 pb-5 pt-4 sm:min-h-[460px]">
          {previousStep != null ? (
            <div className={`pointer-events-none absolute inset-0 px-5 pb-5 pt-4 ${leaveClass}`} aria-hidden="true">
              {renderStep(previousStep)}
            </div>
          ) : null}
          <div className={previousStep != null ? `absolute inset-0 px-5 pb-5 pt-4 ${enterClass}` : 'onboarding-step-static'}>
            {renderStep(currentStep)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;

