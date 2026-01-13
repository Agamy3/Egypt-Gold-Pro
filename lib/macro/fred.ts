/**
 * FRED (Federal Reserve Economic Data) API Client
 * 
 * Fetches and caches macro economic data
 */

import 'server-only';
import { createServerClient } from '@/lib/supabase/server';

const FRED_API_KEY = process.env.FRED_API_KEY;
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
  value: number;
  date: string;
}

export interface FredSeries {
  seriesId: string;
  observations: FredObservation[];
}

/**
 * Fetch latest observation for a FRED series
 */
export async function fetchFredSeries(seriesId: string): Promise<FredObservation | null> {
  if (!FRED_API_KEY) {
    console.warn('[FRED] FRED_API_KEY not set, skipping fetch');
    return null;
  }

  try {
    const url = new URL(FRED_BASE_URL);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', FRED_API_KEY);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('sort_order', 'desc');

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.error(`[FRED] Failed to fetch ${seriesId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const observations = data.observations || [];
    
    if (observations.length === 0) {
      return null;
    }

    const latest = observations[0];
    const value = parseFloat(latest.value);
    
    if (isNaN(value)) {
      return null;
    }

    return {
      value,
      date: latest.date,
    };
  } catch (error) {
    console.error(`[FRED] Error fetching ${seriesId}:`, error);
    return null;
  }
}

/**
 * Cache FRED observation in database
 */
export async function cacheFredObservation(
  seriesId: string,
  observation: FredObservation
): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('macro_series_cache')
      .upsert({
        series_id: seriesId,
        value: observation.value,
        observation_date: observation.date,
        fetched_at: new Date().toISOString(),
      }, {
        onConflict: 'series_id,observation_date',
      });

    if (error) {
      console.error(`[FRED] Error caching ${seriesId}:`, error);
    }
  } catch (error) {
    console.error(`[FRED] Error caching ${seriesId}:`, error);
  }
}

/**
 * Get cached FRED observation (last 24 hours)
 */
export async function getCachedFredObservation(
  seriesId: string
): Promise<FredObservation | null> {
  try {
    const supabase = createServerClient();
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const { data, error } = await supabase
      .from('macro_series_cache')
      .select('value, observation_date')
      .eq('series_id', seriesId)
      .gte('fetched_at', oneDayAgo.toISOString())
      .order('observation_date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      value: parseFloat(data.value.toString()),
      date: data.observation_date,
    };
  } catch (error) {
    console.error(`[FRED] Error getting cached ${seriesId}:`, error);
    return null;
  }
}

/**
 * Get or fetch FRED series (with caching)
 */
export async function getFredSeries(seriesId: string): Promise<FredObservation | null> {
  // Try cache first
  const cached = await getCachedFredObservation(seriesId);
  if (cached) {
    return cached;
  }

  // Fetch from FRED
  const observation = await fetchFredSeries(seriesId);
  if (observation) {
    // Cache it
    await cacheFredObservation(seriesId, observation);
  }

  return observation;
}

