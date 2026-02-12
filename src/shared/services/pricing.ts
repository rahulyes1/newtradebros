export interface PricingService {
  source: 'manual' | 'api';
  getMarkPrice(symbol: string): Promise<number | null>;
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
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? import.meta.env.VITE_TWELVEDATA_API_KEY ?? 'demo';
    this.baseUrl = options?.baseUrl ?? 'https://api.twelvedata.com';
  }

  async getMarkPrice(symbol: string): Promise<number | null> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      return null;
    }

    try {
      const url = `${this.baseUrl}/price?symbol=${encodeURIComponent(normalizedSymbol)}&apikey=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { price?: string | number };
      const rawPrice = payload.price;
      if (rawPrice == null) {
        return null;
      }

      const parsedPrice = typeof rawPrice === 'number' ? rawPrice : Number.parseFloat(rawPrice);
      return Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
    } catch {
      return null;
    }
  }
}
