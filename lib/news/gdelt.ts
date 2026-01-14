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
 * 
 * Returns empty array on failure (does not throw) so RSS can continue
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EgyptGoldPro/1.0; +https://egyptgoldpro.com)',
      },
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(`[GDELT] Failed to fetch for ${country}: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json().catch((parseError) => {
      // eslint-disable-next-line no-console
      console.error(`[GDELT] Failed to parse JSON for ${country}:`, parseError);
      return { articles: [] };
    });

    const articles = Array.isArray(data.articles) ? data.articles : (data.articles || []);

    const items = articles.slice(0, 25).map((article: any, index: number) => {
      // Parse published_at with fallbacks
      let publishedAt: string | null = null;
      if (article.seen) {
        try {
          publishedAt = new Date(article.seen).toISOString();
        } catch {
          // Invalid date, leave as null
        }
      } else if (article.published) {
        try {
          publishedAt = new Date(article.published).toISOString();
        } catch {
          // Invalid date, leave as null
        }
      }

      return {
        title: (article.title || article.snippet || 'Untitled').trim(),
        url: (article.url || '').trim(),
        source: article.source ? String(article.source).trim() : null,
        published_at: publishedAt,
        summary: article.snippet ? String(article.snippet).trim().substring(0, 500) : null,
        image_url: article.image ? String(article.image).trim() : null,
        tags: Array.isArray(article.tags) ? article.tags : null,
        provider: 'gdelt' as const,
        provider_id: article.url ? new URL(article.url).pathname : `gdelt_${index}`,
      };
    }).filter((item: NewsItem) => item.url && item.title && item.url.length > 0 && item.title.length > 0);

    // eslint-disable-next-line no-console
    console.log(`[GDELT] Fetched ${items.length} valid items for ${country}`);
    return items;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`[GDELT] Error fetching for ${country}:`, errorMsg);
    // Return empty array so RSS can continue
    return [];
  }
}

