/**
 * News Ingestion Cron Job
 *
 * GET /api/cron/news-ingest?secret=CRON_SECRET
 *
 * Fetches GDELT + RSS feeds and upserts into news_items
 */

import { fetchGdelt } from '@/lib/news/gdelt';
import { fetchRssForCountry } from '@/lib/news/rss';
import { upsertNewsItems } from '@/lib/supabase/news';


export async function GET(request: Request) {
  try {
    // Check CRON_SECRET
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      // eslint-disable-next-line no-console
      console.warn('[API /cron/news-ingest] Unauthorized access attempt');
      return Response.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const countries = ['EG', 'AE', 'SA', 'US', 'GLOBAL'];
    const results: Record<string, {
      gdelt?: { inserted: number; updated: number; skipped: number; errors: string[]; fetchedCount?: number };
      rss?: { inserted: number; updated: number; skipped: number; errors: string[]; fetchedCount?: number; feedsCount?: number };
      total?: { inserted: number; updated: number; skipped: number; errors: string[] };
      error?: string;
    }> = {};

    // eslint-disable-next-line no-console
    console.log('[API /cron/news-ingest] Starting ingestion for countries:', countries.join(', '));

    for (const country of countries) {
      try {
        // Fetch GDELT (continues even if it fails)
        const gdeltItems = await fetchGdelt(country);
        const gdeltResult = await upsertNewsItems(gdeltItems, country);

        // Fetch RSS (continues even if it fails)
        const rssItems = await fetchRssForCountry(country);
        const rssResult = await upsertNewsItems(rssItems, country);

        results[country] = {
          gdelt: {
            ...gdeltResult,
            fetchedCount: gdeltItems.length,
          },
          rss: {
            ...rssResult,
            fetchedCount: rssItems.length,
            // Note: feedsCount would require passing it from fetchRssForCountry
            // For now, we log it in the RSS function itself
          },
          total: {
            inserted: gdeltResult.inserted + rssResult.inserted,
            updated: gdeltResult.updated + rssResult.updated,
            skipped: gdeltResult.skipped + rssResult.skipped,
            errors: [...gdeltResult.errors, ...rssResult.errors],
          },
        };

        // eslint-disable-next-line no-console
        console.log(`[API /cron/news-ingest] ${country}: GDELT ${gdeltItems.length} fetched → ${gdeltResult.inserted} inserted, RSS ${rssItems.length} fetched → ${rssResult.inserted} inserted`);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        // eslint-disable-next-line no-console
        console.error(`[API /cron/news-ingest] Error processing ${country}:`, errorMsg);
        results[country] = {
          error: errorMsg,
        };
      }
    }

    const totalInserted = Object.values(results).reduce((sum, r) => sum + (r.total?.inserted || 0), 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + (r.total?.errors?.length || 0), 0);

    // eslint-disable-next-line no-console
    console.log(`[API /cron/news-ingest] Complete: ${totalInserted} total items inserted, ${totalErrors} total errors`);

    return Response.json({
      ok: true,
      results,
      timestamp: new Date().toISOString(),
      summary: {
        totalInserted,
        totalErrors,
        countriesProcessed: countries.length,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Internal server error';
    // eslint-disable-next-line no-console
    console.error('[API /cron/news-ingest] Fatal error:', errorMsg);
    return Response.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
