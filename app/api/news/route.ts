/**
 * Public News API
 * 
 * GET /api/news?country=EG&limit=10
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Revalidate every 5 minutes

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
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch news' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: data || [],
    });
  } catch (error: any) {
    console.error('[API /news] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

