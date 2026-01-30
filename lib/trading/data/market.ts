import 'server-only';

import { getBars, getLatestTradeOrQuote } from '@/lib/brokers/alpacaPaper';

export async function fetchRealtime(symbols: string[]): Promise<Record<string, { price: number; ts: string }>> {
  const out: Record<string, { price: number; ts: string }> = {};
  for (const s of symbols) {
    try {
      out[s] = await getLatestTradeOrQuote(s);
    } catch {
      // skip symbol
    }
  }
  return out;
}

export async function fetchHistory(symbol: string, timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day', limit = 300) {
  return getBars({ symbol, timeframe, limit });
}

