/**
 * Public News API
 * 
 * GET /api/news?country=EG&limit=10
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country') || 'GLOBAL';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    // Validate country
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
      .select('id, title, url, source, published_at, image_url, country, created_at')
      .eq('country', country)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[API /news] Error:', error);
      const errorResponse = NextResponse.json(
        { ok: false, error: 'Failed to fetch news' },
        { status: 500 }
      );
      errorResponse.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
      errorResponse.headers.set('Pragma', 'no-cache');
      errorResponse.headers.set('Expires', '0');
      return errorResponse;
    }

    let items = data || [];
    let effectiveCountry = country;

    // Fallback: if no items for specific country, use GLOBAL feed
    if (items.length === 0 && country !== 'GLOBAL') {
      const { data: globalData, error: globalError } = await supabase
        .from('news_items')
        .select('id, title, url, source, published_at, image_url, country, created_at')
        .eq('country', 'GLOBAL')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!globalError && globalData) {
        items = globalData;
        effectiveCountry = 'GLOBAL';
      }
    }

    // Get last ingestion timestamp (per-effective-country) if available
    const { data: lastIngestedRow } = await supabase
      .from('news_items')
      .select('created_at')
      .eq('country', effectiveCountry)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const response = NextResponse.json({
      ok: true,
      items,
      country: effectiveCountry,
      last_ingested_at: lastIngestedRow?.created_at ?? null,
    });

    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error: any) {
    console.error('[API /news] Error:', error);
    const response = NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }
}

