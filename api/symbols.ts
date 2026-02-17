import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SuggestionItem {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
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

function toDisplaySymbol(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  if (normalized.endsWith('.NS') || normalized.endsWith('.BO')) {
    return normalized.slice(0, -3);
  }
  return normalized;
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

  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
  if (query.length < 1) {
    response.status(400).json({ error: 'Query is required' });
    return;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&quotesCount=10&newsCount=0`;
    const yahooResponse = await fetch(url, { headers: YAHOO_HEADERS });
    if (!yahooResponse.ok) {
      response.status(500).json({ error: 'Failed to fetch suggestions' });
      return;
    }

    const payload = (await yahooResponse.json()) as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchDisp?: string;
      }>;
    };

    const suggestions: SuggestionItem[] = (payload.quotes ?? [])
      .filter((item) => typeof item.symbol === 'string' && item.symbol.length > 0)
      .filter((item) => {
        const symbol = String(item.symbol).toUpperCase();
        return symbol.endsWith('.NS') || symbol.endsWith('.BO') || !symbol.includes('.');
      })
      .slice(0, 8)
      .map((item) => {
        const yahooSymbol = String(item.symbol).toUpperCase();
        return {
          symbol: toDisplaySymbol(yahooSymbol),
          yahooSymbol,
          name: item.shortname ?? item.longname ?? toDisplaySymbol(yahooSymbol),
          exchange: item.exchDisp ?? '',
        };
      });

    response.status(200).json({ query, suggestions });
  } catch {
    response.status(500).json({ error: 'Failed to fetch suggestions' });
  }
}
