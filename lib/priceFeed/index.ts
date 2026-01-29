import 'server-only';

import type { Quote } from './types';
import { fetchGoldApiQuote } from './goldapi';
import { fetchGoldApiFreeQuote } from './goldApiFree';

export function getPriceFeedProvider(): Quote['provider'] {
  const raw = (process.env.PRICE_FEED_PROVIDER ?? 'goldapi').trim();
  if (raw === 'gold_api_free') return 'gold_api_free';
  return 'goldapi';
}

export async function fetchQuote(): Promise<Quote> {
  const provider = getPriceFeedProvider();
  return await fetchQuoteForProvider(provider);
}

export async function fetchQuoteForProvider(provider: Quote['provider']): Promise<Quote> {
  if (provider === 'gold_api_free') return await fetchGoldApiFreeQuote();
  return await fetchGoldApiQuote();
}

