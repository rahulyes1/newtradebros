import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PriceResponse {
  symbol: string;
  yahooSymbol: string;
  price: number;
  timestamp: string;
  source: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const YAHOO_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

function applyCors(response: VercelResponse): void {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
}

function normalize(rawSymbol: string): string {
  const normalized = rawSymbol.trim().toUpperCase();
  if (normalized.includes('.')) {
    return normalized;
  }
  return `${normalized}.NS`;
}

async function fetchYahooPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const response = await fetch(url, { headers: YAHOO_HEADERS });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function resolvePrice(symbol: string, raw: boolean): Promise<{ yahooSymbol: string; price: number | null }> {
  const cleaned = symbol.trim().toUpperCase();
  if (!cleaned) {
    return { yahooSymbol: cleaned, price: null };
  }

  const candidates = raw
    ? [cleaned]
    : cleaned.includes('.')
      ? [cleaned]
      : [normalize(cleaned), `${cleaned}.BO`, cleaned];

  for (const candidate of candidates) {
    const price = await fetchYahooPrice(candidate);
    if (price != null) {
      return { yahooSymbol: candidate, price };
    }
  }

  return { yahooSymbol: candidates[0], price: null };
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  applyCors(response);

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const symbol = typeof request.query.symbol === 'string' ? request.query.symbol : '';
  if (!symbol.trim()) {
    response.status(400).json({ error: 'Symbol is required' });
    return;
  }

  try {
    const raw = request.query.raw === '1' || request.query.raw === 'true';
    const { yahooSymbol, price } = await resolvePrice(symbol, raw);
    if (price == null) {
      response.status(404).json({ error: `Price not found for ${symbol.trim().toUpperCase()}` });
      return;
    }

    const payload: PriceResponse = {
      symbol: symbol.trim().toUpperCase(),
      yahooSymbol,
      price,
      timestamp: new Date().toISOString(),
      source: 'Yahoo Finance',
    };
    response.status(200).json(payload);
  } catch {
    response.status(500).json({ error: 'Failed to fetch price' });
  }
}
