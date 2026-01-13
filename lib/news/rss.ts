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
      const summary = descriptionMatch ? descriptionMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim().substring(0, 500) : null;
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
      },
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`[RSS] Failed to fetch ${feedUrl}: ${response.status}`);
      return [];
    }

    const text = await response.text();
    return parseRSSFeed(text, feedUrl);
  } catch (error) {
    console.error(`[RSS] Error fetching ${feedUrl}:`, error);
    return [];
  }
}

/**
 * Fetch all RSS feeds for a country
 */
export async function fetchRssForCountry(country: string): Promise<NewsItem[]> {
  const feedsJson = process.env.NEWS_RSS_FEEDS_JSON;
  if (!feedsJson) {
    return [];
  }

  try {
    const feeds = JSON.parse(feedsJson) as Record<string, string[]>;
    const countryFeeds = feeds[country] || feeds['GLOBAL'] || [];
    
    const allItems: NewsItem[] = [];
    
    for (const feedUrl of countryFeeds) {
      const items = await fetchRssFeed(feedUrl);
      allItems.push(...items);
    }

    return allItems;
  } catch (error) {
    console.error(`[RSS] Error parsing feeds config for ${country}:`, error);
    return [];
  }
}

