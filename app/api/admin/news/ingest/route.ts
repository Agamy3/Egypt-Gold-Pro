/**
 * Admin News Ingestion Endpoint
 *
 * POST /api/admin/news/ingest
 *
 * - Admin-only (getUserStatus.isAdmin) OR CRON_SECRET header
 * - Runs ingestion for a specific country or all supported countries
 * - Returns inserted/updated counts per country
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserStatus } from '@/lib/auth/getUserStatus';
import { fetchGdelt } from '@/lib/news/gdelt';
import { fetchRssForCountry } from '@/lib/news/rss';
import { upsertNewsItems } from '@/lib/supabase/news';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cronSecretHeader = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    const status = await getUserStatus();
    const isAdmin = status.isAdmin === true;
    const hasValidCronSecret = Boolean(expectedSecret && cronSecretHeader === expectedSecret);

    if (!isAdmin && !hasValidCronSecret) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestedCountry = typeof body.country === 'string' ? body.country : undefined;

    const supportedCountries = ['EG', 'AE', 'SA', 'US', 'GLOBAL'] as const;

    const targetCountries =
      requestedCountry && supportedCountries.includes(requestedCountry as (typeof supportedCountries)[number])
        ? [requestedCountry]
        : supportedCountries;

    const results: Record<
      string,
      {
        gdelt?: { inserted: number; updated: number; skipped: number; errors: string[]; fetchedCount?: number };
        rss?: { inserted: number; updated: number; skipped: number; errors: string[]; fetchedCount?: number };
        total?: { inserted: number; updated: number; skipped: number; errors: string[] };
        error?: string;
      }
    > = {};

    // eslint-disable-next-line no-console
    console.log(`[API /admin/news/ingest] Starting ingestion for: ${targetCountries.join(', ')}`);

    for (const country of targetCountries) {
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
          },
          total: {
            inserted: gdeltResult.inserted + rssResult.inserted,
            updated: gdeltResult.updated + rssResult.updated,
            skipped: gdeltResult.skipped + rssResult.skipped,
            errors: [...gdeltResult.errors, ...rssResult.errors],
          },
        };

        // eslint-disable-next-line no-console
        console.log(`[API /admin/news/ingest] ${country}: GDELT ${gdeltItems.length} fetched → ${gdeltResult.inserted} inserted, RSS ${rssItems.length} fetched → ${rssResult.inserted} inserted`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        // eslint-disable-next-line no-console
        console.error(`[API /admin/news/ingest] Error processing ${country}:`, message);
        results[country] = { error: message };
      }
    }

    const totalInserted = Object.values(results).reduce((sum, r) => sum + (r.total?.inserted || 0), 0);
    // eslint-disable-next-line no-console
    console.log(`[API /admin/news/ingest] Complete: ${totalInserted} total items inserted`);

    return NextResponse.json({
      ok: true,
      results,
      timestamp: new Date().toISOString(),
      summary: {
        totalInserted: Object.values(results).reduce((sum, r) => sum + (r.total?.inserted || 0), 0),
        totalErrors: Object.values(results).reduce((sum, r) => sum + (r.total?.errors?.length || 0), 0),
        countriesProcessed: targetCountries.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    // eslint-disable-next-line no-console
    console.error('[API /admin/news/ingest] Error:', error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}


