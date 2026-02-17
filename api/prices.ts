import type { VercelRequest, VercelResponse } from '@vercel/node';

interface BatchResponse {
  prices: Record<string, number>;
  timestamp: string;
  failed: string[];
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
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

async function resolvePrice(symbol: string): Promise<number | null> {
  const cleaned = symbol.trim().toUpperCase();
  if (!cleaned) {
    return null;
  }

  const candidates = cleaned.includes('.') ? [cleaned] : [normalize(cleaned), `${cleaned}.BO`, cleaned];
  for (const candidate of candidates) {
    const price = await fetchYahooPrice(candidate);
    if (price != null) {
      return price;
    }
  }
  return null;
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

  const symbolsParam = typeof request.query.symbols === 'string' ? request.query.symbols : '';
  if (!symbolsParam.trim()) {
    response.status(400).json({ error: 'symbols query param is required' });
    return;
  }

  const symbols = Array.from(
    new Set(
      symbolsParam
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const prices: Record<string, number> = {};
  const failed: string[] = [];

  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index];
    if (index > 0) {
      await delay(200);
    }
    const price = await resolvePrice(symbol);
    if (price == null) {
      failed.push(symbol);
      continue;
    }
    prices[symbol] = price;
  }

  const payload: BatchResponse = {
    prices,
    timestamp: new Date().toISOString(),
    failed,
  };

  response.status(200).json(payload);
}
