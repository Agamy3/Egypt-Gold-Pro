/**
 * RSS Feed Parser
 * 
 * Fetches and parses RSS feeds for news items
 */

import 'server-only';

import { NewsItem as BaseNewsItem } from '@/lib/supabase/news';

export interface NewsItem extends BaseNewsItem {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  tags: string[] | null;
  provider: 'rss';
  provider_id: string | null;
}

/**
 * Parse RSS feed XML
 */
function parseRSSFeed(xmlText: string, feedUrl: string): NewsItem[] {
  const items: NewsItem[] = [];
  
  try {
    // Simple RSS parsing (for MVP)
    const itemMatches = xmlText.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const descriptionMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const imageMatch = itemContent.match(/<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]*)"/i) ||
                        itemContent.match(/<media:content[^>]*url="([^"]*)"[^>]*type="image[^"]*"/i);

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
      const url = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
      const pubDate = pubDateMatch ? pubDateMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
      let summary = descriptionMatch ? descriptionMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
      
      // Strip HTML tags and decode entities from summary
      if (summary) {
        // Remove HTML tags inline (simple regex, no async needed)
        summary = summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        // Decode common entities
        summary = summary
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#8220;/g, '"')
          .replace(/&#8221;/g, '"')
          .replace(/&#8217;/g, "'")
          .substring(0, 500);
      }
      const imageUrl = imageMatch ? imageMatch[1] : null;

      if (title && url) {
        items.push({
          title,
          url,
          source: new URL(feedUrl).hostname,
          published_at: pubDate ? new Date(pubDate).toISOString() : null,
          summary,
          image_url: imageUrl,
          tags: null,
          provider: 'rss',
          provider_id: url,
        });
      }
    }
  } catch (error) {
    console.error('[RSS] Error parsing feed:', error);
  }

  return items;
}

/**
 * Fetch RSS feed
 */
export async function fetchRssFeed(feedUrl: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EgyptGoldPro/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`[RSS] Failed to fetch ${feedUrl}: ${response.status} ${response.statusText}`);
      return [];
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('text')) {
      console.warn(`[RSS] Unexpected content-type for ${feedUrl}: ${contentType}`);
    }

    const text = await response.text();
    
    if (!text || text.trim().length === 0) {
      console.warn(`[RSS] Empty response from ${feedUrl}`);
      return [];
    }

    const items = parseRSSFeed(text, feedUrl);
    
    if (items.length === 0) {
      console.warn(`[RSS] Parsed 0 items from ${feedUrl} - feed may be empty or format not recognized`);
    }
    
    return items;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[RSS] Error fetching ${feedUrl}:`, errorMsg);
    return [];
  }
}

/**
 * Default RSS feeds fallback
 * These match the NEWS_RSS_FEEDS_JSON environment variable configuration
 */
const DEFAULT_FEEDS: Record<string, string[]> = {
  GLOBAL: [
    'https://www.kitco.com/rss/news',
    'https://feeds.reuters.com/reuters/businessNews',
  ],
  US: [
    'https://www.investing.com/rss/news_285.rss',
  ],
  EG: [
    'https://www.dailynewsegypt.com/feed/',
  ],
  AE: [
    'https://www.khaleejtimes.com/rss',
  ],
  SA: [
    'https://english.alarabiya.net/rss.xml',
  ],
};

/**
 * Parse NEWS_RSS_FEEDS_JSON with robust error handling
 * Handles BOM, whitespace, newlines, and malformed JSON
 */
function parseFeedsConfig(): Record<string, string[]> {
  const raw = process.env.NEWS_RSS_FEEDS_JSON ?? '';
  
  // Remove BOM and trim whitespace/newlines
  const cleaned = raw.trim().replace(/^\uFEFF/, '').replace(/\n/g, '').replace(/\r/g, '');
  
  if (cleaned.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[RSS] NEWS_RSS_FEEDS_JSON is empty, using DEFAULT_FEEDS');
    return DEFAULT_FEEDS;
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Merge with defaults to ensure all countries have at least GLOBAL fallback
      const merged: Record<string, string[]> = { ...DEFAULT_FEEDS };
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
          merged[key] = value;
        }
      }
      // eslint-disable-next-line no-console
      console.log('[RSS] Parsed NEWS_RSS_FEEDS_JSON successfully');
      return merged;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[RSS] Failed to parse NEWS_RSS_FEEDS_JSON, using DEFAULT_FEEDS:', error instanceof Error ? error.message : String(error));
  }

  return DEFAULT_FEEDS;
}

/**
 * Fetch all RSS feeds for a country
 * 
 * If country has 0 feeds, falls back to GLOBAL feeds
 */
export async function fetchRssForCountry(country: string): Promise<NewsItem[]> {
  const feedsConfig = parseFeedsConfig();
  
  // Get country feeds, fallback to GLOBAL if empty
  let countryFeeds = feedsConfig[country] || [];
  if (countryFeeds.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[RSS] No feeds configured for ${country}, falling back to GLOBAL feeds`);
    countryFeeds = feedsConfig.GLOBAL || [];
  }

  if (countryFeeds.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[RSS] No feeds available for', country, 'or GLOBAL fallback');
    return [];
  }

  const allItems: NewsItem[] = [];
  const errors: string[] = [];

  for (const feedUrl of countryFeeds) {
    try {
      const items = await fetchRssFeed(feedUrl);
      allItems.push(...items);
      // eslint-disable-next-line no-console
      console.log(`[RSS] Fetched ${items.length} items from ${feedUrl}`);
      if (items.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`[RSS] Feed ${feedUrl} returned 0 items - feed may be empty or inaccessible`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to fetch ${feedUrl}: ${errorMsg}`);
      // eslint-disable-next-line no-console
      console.error(`[RSS] Error fetching ${feedUrl}:`, errorMsg);
    }
  }

  if (errors.length > 0 && allItems.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(`[RSS] All feeds failed for ${country}:`, errors);
  }

  return allItems;
}

