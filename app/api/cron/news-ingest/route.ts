/**
 * News Ingestion Cron Job
 * 
 * GET /api/cron/news-ingest?secret=CRON_SECRET
 * 
 * Fetches RSS feeds for enabled news sources and upserts into country_news_items
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Parse RSS feed (simplified - for MVP)
 */
async function parseRSSFeed(feedUrl: string): Promise<Array<{ title: string; url: string; publishedAt: Date | null; summary: string | null }>> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EgyptGoldPro/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status}`);
    }

    const text = await response.text();
    const items: Array<{ title: string; url: string; publishedAt: Date | null; summary: string | null }> = [];

    // Simple RSS parsing (MVP - can be enhanced later)
    const itemMatches = text.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const descriptionMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
      const url = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1].trim()) : null;
      const summary = descriptionMatch ? descriptionMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim().substring(0, 500) : null;

      if (title && url) {
        items.push({
          title,
          url,
          publishedAt: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
          summary,
        });
      }
    }

    return items;
  } catch (error) {
    console.error('[NEWS] Error parsing RSS feed:', feedUrl, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const expectedSecret = process.env.CRON_SECRET;
    const isVercelCron = !!request.headers.get('x-vercel-cron');

    if (!isVercelCron) {
      const secret = searchParams.get('secret') || request.headers.get('authorization')?.replace('Bearer ', '');
      if (!expectedSecret || secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getServerClient();
    
    // Get enabled news sources
    const { data: sources, error: sourcesError } = await supabase
      .from('country_news_sources')
      .select('*')
      .eq('enabled', true);

    if (sourcesError) {
      console.error('[NEWS] Error fetching sources:', sourcesError);
      return NextResponse.json({ error: sourcesError.message }, { status: 400 });
    }

    if (!sources || sources.length === 0) {
      return NextResponse.json({ message: 'No enabled news sources', itemsProcessed: 0 });
    }

    let totalProcessed = 0;
    const errors: string[] = [];

    for (const source of sources) {
      try {
        const items = await parseRSSFeed(source.feed_url);
        
        for (const item of items) {
          // Upsert by URL (unique constraint)
          const { error: upsertError } = await supabase
            .from('country_news_items')
            .upsert(
              {
                country: source.country,
                source_id: source.id,
                title: item.title,
                url: item.url,
                published_at: item.publishedAt?.toISOString() || null,
                summary: item.summary || null,
              },
              { onConflict: 'url' }
            );

          if (upsertError) {
            errors.push(`Error upserting ${item.url}: ${upsertError.message}`);
          } else {
            totalProcessed++;
          }
        }
      } catch (error) {
        errors.push(`Error processing source ${source.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    return NextResponse.json({
      success: true,
      sourcesProcessed: sources.length,
      itemsProcessed: totalProcessed,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[NEWS] Ingestion error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

