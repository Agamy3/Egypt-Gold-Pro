/**
 * News Ingestion Cron Job
 * 
 * GET /api/cron/news-ingest?secret=CRON_SECRET
 * 
 * Fetches GDELT + RSS feeds and upserts into news_items
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGdelt } from '@/lib/news/gdelt';
import { fetchRssForCountry } from '@/lib/news/rss';
import { upsertNewsItems } from '@/lib/supabase/news';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Check CRON_SECRET
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const countries = ['EG', 'AE', 'SA', 'US', 'GLOBAL'];
    const results: Record<string, {
      gdelt?: { inserted: number; updated: number; skipped: number; errors: string[] };
      rss?: { inserted: number; updated: number; skipped: number; errors: string[] };
      total?: { inserted: number; updated: number; skipped: number; errors: string[] };
      error?: string;
    }> = {};

    for (const country of countries) {
      try {
        // Fetch GDELT
        const gdeltItems = await fetchGdelt(country);
        const gdeltResult = await upsertNewsItems(gdeltItems, country);

        // Fetch RSS
        const rssItems = await fetchRssForCountry(country);
        const rssResult = await upsertNewsItems(rssItems, country);

        results[country] = {
          gdelt: gdeltResult,
          rss: rssResult,
          total: {
            inserted: gdeltResult.inserted + rssResult.inserted,
            updated: gdeltResult.updated + rssResult.updated,
            skipped: gdeltResult.skipped + rssResult.skipped,
            errors: [...gdeltResult.errors, ...rssResult.errors],
          },
        };
      } catch (error: any) {
        results[country] = {
          error: error.message || 'Unknown error',
        };
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API /cron/news-ingest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
