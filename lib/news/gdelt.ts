/**
 * GDELT News API Client
 * 
 * Fetches gold and economic news from GDELT 2.1 DOC API
 */

import 'server-only';

const GDELT_BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

import { NewsItem as BaseNewsItem } from '@/lib/supabase/news';

export interface NewsItem extends BaseNewsItem {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  tags: string[] | null;
  provider: 'gdelt';
  provider_id: string | null;
}

/**
 * Build GDELT query for a country
 */
export function buildGdeltQuery(country: string): string {
  const countryMap: Record<string, string> = {
    EG: 'Egypt',
    AE: 'United Arab Emirates',
    SA: 'Saudi Arabia',
    US: 'United States',
    GLOBAL: '',
  };

  const countryName = countryMap[country] || '';
  
  // Keywords: gold, inflation, interest rates, central bank, war, oil
  const keywords = [
    'gold',
    'inflation',
    'interest rate',
    'central bank',
    'federal reserve',
    'war',
    'oil price',
    'precious metal',
  ].join(' OR ');

  const query = countryName
    ? `(${keywords}) AND (${countryName})`
    : keywords;

  return query;
}

/**
 * Fetch GDELT news for a country
 */
export async function fetchGdelt(country: string): Promise<NewsItem[]> {
  try {
    const query = buildGdeltQuery(country);
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    
    const url = new URL(GDELT_BASE_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', '25');
    url.searchParams.set('startdatetime', twoDaysAgo.toISOString().split('T')[0]);
    url.searchParams.set('enddatetime', now.toISOString().split('T')[0]);

    const response = await fetch(url.toString(), {
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`[GDELT] Failed to fetch for ${country}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const articles = data.articles || [];

    return articles.slice(0, 25).map((article: any, index: number) => ({
      title: article.title || article.snippet || 'Untitled',
      url: article.url || '',
      source: article.source || null,
      published_at: article.seen || article.published || null,
      summary: article.snippet || null,
      image_url: article.image || null,
      tags: article.tags || null,
      provider: 'gdelt' as const,
      provider_id: article.url ? new URL(article.url).pathname : `gdelt_${index}`,
    })).filter((item: NewsItem) => item.url && item.title);
  } catch (error) {
    console.error(`[GDELT] Error fetching for ${country}:`, error);
    return [];
  }
}

