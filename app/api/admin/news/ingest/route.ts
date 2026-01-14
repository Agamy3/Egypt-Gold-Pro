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
        gdelt?: { inserted: number; updated: number; skipped: number; errors: string[] };
        rss?: { inserted: number; updated: number; skipped: number; errors: string[] };
        total?: { inserted: number; updated: number; skipped: number; errors: string[] };
        error?: string;
      }
    > = {};

    for (const country of targetCountries) {
      try {
        const gdeltItems = await fetchGdelt(country);
        const gdeltResult = await upsertNewsItems(gdeltItems, country);

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
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results[country] = { error: message };
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      timestamp: new Date().toISOString(),
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


