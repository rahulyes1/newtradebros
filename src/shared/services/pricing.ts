export interface PriceResult {
  symbol: string;
  price: number;
  timestamp: Date;
  source: string;
}

interface CacheEntry {
  price: number;
  timestamp: number;
}

interface PriceApiResponse {
  symbol: string;
  yahooSymbol: string;
  price: number;
  timestamp: string;
  source: string;
}

interface BatchPriceApiResponse {
  prices?: Record<string, number>;
  failed?: string[];
  timestamp?: string;
}

export interface PricingService {
  source: 'manual' | 'api';
  getMarkPrice(symbol: string): Promise<number | null>;
}

const CACHE_DURATION_MS = 5 * 60 * 1000;
const MULTI_FETCH_DELAY_MS = 300;
const REQUEST_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const API_BASE = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '')
  : 'http://localhost:3000';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function getFriendlyErrorMessage(status: number): string {
  if (status === 404) {
    return 'Symbol not found on NSE';
  }
  if (status === 429) {
    return 'Too many requests, please wait';
  }
  if (status >= 500) {
    return 'Price service temporarily unavailable';
  }
  return `Request failed (${status})`;
}

export class ManualPricingService implements PricingService {
  source = 'manual' as const;

  async getMarkPrice(symbol: string): Promise<number | null> {
    void symbol;
    return null;
  }
}

export class ApiPricingService implements PricingService {
  source = 'api' as const;

  private readonly priceCache = new Map<string, CacheEntry>();
  private loadingCount = 0;

  get isLoading(): boolean {
    return this.loadingCount > 0;
  }

  validateSymbol(symbol: string): boolean {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      return false;
    }
    return /^[A-Z0-9.-]{2,20}$/.test(normalized);
  }

  clearCache(): void {
    this.priceCache.clear();
  }

  private startLoading(): void {
    this.loadingCount += 1;
  }

  private stopLoading(): void {
    this.loadingCount = Math.max(0, this.loadingCount - 1);
  }

  private getCacheKey(symbol: string): string {
    return symbol.trim().toUpperCase();
  }

  private getCachedPrice(symbol: string): number | null {
    const key = this.getCacheKey(symbol);
    const cached = this.priceCache.get(key);
    if (!cached) {
      console.log(`[Pricing] cache miss for ${key}`);
      return null;
    }
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION_MS) {
      console.log(`[Pricing] cache stale for ${key}`);
      this.priceCache.delete(key);
      return null;
    }
    console.log(`[Pricing] cache hit for ${key}`);
    return cached.price;
  }

  private setCachedPrice(symbol: string, price: number): void {
    const key = this.getCacheKey(symbol);
    this.priceCache.set(key, {
      price,
      timestamp: Date.now(),
    });
  }

  private async fetchSingleFromApi(symbol: string): Promise<PriceResult | null> {
    try {
      const response = await fetch(
        `${API_BASE}/api/price?symbol=${encodeURIComponent(symbol)}`,
        { headers: REQUEST_HEADERS }
      );

      if (!response.ok) {
        console.warn(`[Pricing] ${symbol}: ${getFriendlyErrorMessage(response.status)}`);
        return null;
      }

      const data = (await response.json()) as Partial<PriceApiResponse>;
      const parsedPrice = toNumber(data.price);
      if (!parsedPrice) {
        console.warn(`[Pricing] ${symbol}: missing/invalid price in API response`);
        return null;
      }

      const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
      return {
        symbol: typeof data.symbol === 'string' ? data.symbol : symbol.trim().toUpperCase(),
        price: parsedPrice,
        timestamp,
        source: typeof data.source === 'string' ? data.source : 'Yahoo Finance',
      };
    } catch {
      console.warn(`[Pricing] ${symbol}: No internet connection`);
      return null;
    }
  }

  async fetchPrice(symbol: string): Promise<PriceResult | null> {
    const raw = symbol.trim().toUpperCase();
    if (!this.validateSymbol(raw)) {
      console.warn(`[Pricing] Invalid symbol: "${symbol}"`);
      return null;
    }

    const cached = this.getCachedPrice(raw);
    if (cached != null) {
      return {
        symbol: raw,
        price: cached,
        timestamp: new Date(),
        source: 'Yahoo Finance (cached)',
      };
    }

    this.startLoading();
    try {
      const result = await this.fetchSingleFromApi(raw);
      if (!result) {
        return null;
      }
      this.setCachedPrice(raw, result.price);
      return result;
    } finally {
      this.stopLoading();
    }
  }

  async fetchPrices(symbols: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const normalized = Array.from(
      new Set(
        symbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => this.validateSymbol(symbol))
      )
    );

    if (normalized.length === 0) {
      return results;
    }

    const uncachedSymbols: string[] = [];
    normalized.forEach((symbol) => {
      const cached = this.getCachedPrice(symbol);
      if (cached != null) {
        results.set(symbol, cached);
      } else {
        uncachedSymbols.push(symbol);
      }
    });

    if (uncachedSymbols.length === 0) {
      return results;
    }

    this.startLoading();
    try {
      try {
        const response = await fetch(
          `${API_BASE}/api/prices?symbols=${encodeURIComponent(uncachedSymbols.join(','))}`,
          { headers: REQUEST_HEADERS }
        );
        if (!response.ok) {
          console.warn(`[Pricing] batch API failed: ${getFriendlyErrorMessage(response.status)}`);
          throw new Error(`Batch API error: ${response.status}`);
        }

        const payload = (await response.json()) as BatchPriceApiResponse;
        const prices = payload.prices ?? {};
        Object.entries(prices).forEach(([symbol, price]) => {
          if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
            const key = symbol.trim().toUpperCase();
            results.set(key, price);
            this.setCachedPrice(key, price);
          }
        });

        if (Array.isArray(payload.failed) && payload.failed.length > 0) {
          console.warn(`[Pricing] failed symbols: ${payload.failed.join(', ')}`);
        }
      } catch {
        // Fallback to individual requests.
        for (let index = 0; index < uncachedSymbols.length; index += 1) {
          const symbol = uncachedSymbols[index];
          if (index > 0) {
            await delay(MULTI_FETCH_DELAY_MS);
          }
          const single = await this.fetchSingleFromApi(symbol);
          if (single) {
            results.set(symbol, single.price);
            this.setCachedPrice(symbol, single.price);
          }
        }
      }
    } finally {
      this.stopLoading();
    }

    return results;
  }

  async refreshAllMarks(openTrades: Array<{ id: string; symbol: string }>): Promise<Map<string, number>> {
    const symbolPrices = await this.fetchPrices(openTrades.map((trade) => trade.symbol));
    const byTradeId = new Map<string, number>();
    openTrades.forEach((trade) => {
      const price = symbolPrices.get(trade.symbol.trim().toUpperCase());
      if (price != null) {
        byTradeId.set(trade.id, price);
      }
    });
    return byTradeId;
  }

  async getMarkPrice(symbol: string): Promise<number | null> {
    const result = await this.fetchPrice(symbol);
    return result?.price ?? null;
  }
}

export const pricingService = new ApiPricingService();
