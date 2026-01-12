/**
 * Price Change Detection Utilities
 * 
 * Detects price changes >= 0.5% and manages state in price_change_state table
 */

import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getCountryCurrency } from '@/lib/fx-multi';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Karat = 14 | 18 | 21 | 22 | 24;

const PRICE_CHANGE_THRESHOLD = 0.005; // 0.5%

interface PriceChangeState {
  country: Country;
  karat: Karat;
  last_price: number;
  last_notified_at: string;
}

interface PriceChangeResult {
  country: Country;
  karat: Karat;
  triggered: boolean;
  direction?: 'UP' | 'DOWN';
  pctChange?: number;
  oldPrice?: number;
  newPrice?: number;
}

/**
 * Get or initialize price change state for a country+karat
 */
async function getPriceChangeState(
  country: Country,
  karat: Karat
): Promise<PriceChangeState | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('price_change_state')
    .select('*')
    .eq('country', country)
    .eq('karat', karat)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Error fetching price change state:', error);
    return null;
  }

  return data || null;
}

/**
 * Initialize or update price change state
 */
async function updatePriceChangeState(
  country: Country,
  karat: Karat,
  price: number
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  
  const { error } = await supabase
    .from('price_change_state')
    .upsert(
      {
        country,
        karat,
        last_price: price,
        last_notified_at: new Date().toISOString(),
      },
      { onConflict: 'country,karat' }
    );

  if (error) {
    console.error('Error updating price change state:', error);
    throw error;
  }
}

/**
 * Check if price change triggers notification (>= 0.5%)
 */
export async function checkPriceChange(
  country: Country,
  karat: Karat
): Promise<PriceChangeResult> {
  try {
    // Get current market price
    const marketData = await getMarketMedians(country, true, 60);
    const canonicalCurrency = getCountryCurrency(country);
    
    // Get price for the karat (buy price)
    const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
    const newPrice = marketData.prices[priceKey] as number | null;

    if (!newPrice || newPrice <= 0) {
      return {
        country,
        karat,
        triggered: false,
      };
    }

    // Get last notified price
    const state = await getPriceChangeState(country, karat);

    // If no state exists, initialize and don't trigger
    if (!state || !state.last_price || state.last_price <= 0) {
      await updatePriceChangeState(country, karat, newPrice);
      return {
        country,
        karat,
        triggered: false,
      };
    }

    const oldPrice = state.last_price;
    const pctChange = (newPrice - oldPrice) / oldPrice;
    const absPctChange = Math.abs(pctChange);

    // Check if change >= 0.5%
    if (absPctChange >= PRICE_CHANGE_THRESHOLD) {
      const direction: 'UP' | 'DOWN' = pctChange >= 0 ? 'UP' : 'DOWN';
      
      // Update state after triggering
      await updatePriceChangeState(country, karat, newPrice);

      return {
        country,
        karat,
        triggered: true,
        direction,
        pctChange: absPctChange,
        oldPrice,
        newPrice,
      };
    }

    // Price changed but below threshold - update state without triggering
    await updatePriceChangeState(country, karat, newPrice);

    return {
      country,
      karat,
      triggered: false,
    };
  } catch (error) {
    console.error(`Error checking price change for ${country} ${karat}k:`, error);
    return {
      country,
      karat,
      triggered: false,
    };
  }
}

/**
 * Check all countries and karats for price changes
 */
export async function checkAllPriceChanges(): Promise<PriceChangeResult[]> {
  const countries: Country[] = ['EG', 'AE', 'SA', 'US'];
  const karats: Karat[] = [14, 18, 21, 24];
  
  const results: PriceChangeResult[] = [];

  for (const country of countries) {
    for (const karat of karats) {
      const result = await checkPriceChange(country, karat);
      results.push(result);
    }
  }

  return results;
}

