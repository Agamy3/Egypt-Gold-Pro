/**
 * Premium News API
 *
 * GET /api/news/premium?country=EG&limit=10
 *
 * Returns public fields plus premium-only summary, tags, and why-it-matters context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getUserStatus } from '@/lib/auth/getUserStatus';
import { buildWhyItMatters } from '@/lib/news/context';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const status = await getUserStatus();

    if (!status.isLoggedIn || !status.isPremium) {
      return NextResponse.json(
        { ok: false, error: 'premium_required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country') || 'GLOBAL';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    const validCountries = ['EG', 'AE', 'SA', 'US', 'GLOBAL'];
    if (!validCountries.includes(country)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid country' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('news_items')
      .select('id, title, url, source, published_at, summary, image_url, tags, country, created_at')
      .eq('country', country)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[API /news/premium] Error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch news' },
        { status: 500 }
      );
    }

    const items = (data || []).map((row) => {
      const context = buildWhyItMatters(
        {
          title: row.title,
          source: row.source,
          summary: row.summary,
        },
        row.country || country
      );

      return {
        id: row.id,
        title: row.title,
        url: row.url,
        source: row.source,
        published_at: row.published_at,
        image_url: row.image_url,
        country: row.country || country,
        summary: row.summary,
        tags: row.tags || [],
        whyItMatters: context.bullets,
        contextTags: context.tags,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (error: any) {
    console.error('[API /news/premium] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
