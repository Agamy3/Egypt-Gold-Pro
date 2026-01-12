/**
 * Price Change Detection v2
 * 
 * Detects price changes >= 0.5% and manages state in price_change_state table
 * Also evaluates user custom price alert rules
 */

import 'server-only';
import { getServerClient } from '@/lib/supabase/server';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getCountryCurrency, convertMoney, getMultiCurrencyRates, Currency } from '@/lib/fx-multi';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Karat = 14 | 18 | 21 | 22 | 24;

const PRICE_CHANGE_THRESHOLD = 0.005; // 0.5%
const RULE_COOLDOWN_HOURS = 6;

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

interface UserRuleTrigger {
  ruleId: number;
  userId: string;
  country: Country;
  karat: Karat;
  direction: 'UP' | 'DOWN';
  thresholdPrice: number;
  currentPrice: number;
  currency: Currency;
}

/**
 * Get or initialize price change state for a country+karat
 */
async function getPriceChangeState(
  country: Country,
  karat: Karat
): Promise<PriceChangeState | null> {
  const supabase = getServerClient();
  
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
  const supabase = getServerClient();
  
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
    const marketData = await getMarketMedians(country, false, 60);
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

/**
 * Evaluate user custom price alert rules
 */
export async function evaluateUserRules(): Promise<UserRuleTrigger[]> {
  const supabase = getServerClient();
  const triggers: UserRuleTrigger[] = [];

  try {
    // Get all enabled rules
    const { data: rules, error: rulesError } = await supabase
      .from('user_price_alert_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesError) {
      console.error('Error fetching user rules:', rulesError);
      return triggers;
    }

    if (!rules || rules.length === 0) {
      return triggers;
    }

    // Get FX rates for currency conversion
    const fxRates = await getMultiCurrencyRates();

    // Group rules by country+karat to batch price fetches
    const rulesByCountryKarat: Record<string, typeof rules> = {};
    for (const rule of rules) {
      const key = `${rule.country}_${rule.karat}`;
      if (!rulesByCountryKarat[key]) {
        rulesByCountryKarat[key] = [];
      }
      rulesByCountryKarat[key].push(rule);
    }

    // Evaluate each group
    for (const [key, groupRules] of Object.entries(rulesByCountryKarat)) {
      const [country, karatStr] = key.split('_');
      const karat = parseInt(karatStr, 10) as Karat;
      const countryCode = country as Country;

      // Get current market price
      const marketData = await getMarketMedians(countryCode, false, 60);
      const canonicalCurrency = getCountryCurrency(countryCode);
      const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
      const currentPrice = marketData.prices[priceKey] as number | null;

      if (!currentPrice || currentPrice <= 0) {
        continue; // Skip if no price data
      }

      // Evaluate each rule in this group
      for (const rule of groupRules) {
        // Get rule state (cooldown check)
        const { data: ruleState } = await supabase
          .from('user_rule_state')
          .select('*')
          .eq('rule_id', rule.id)
          .single();

        const now = new Date();
        const cooldownMs = RULE_COOLDOWN_HOURS * 60 * 60 * 1000;

        if (ruleState) {
          const lastTriggered = new Date(ruleState.last_triggered_at);
          const timeSinceLastTrigger = now.getTime() - lastTriggered.getTime();

          // Check cooldown
          if (timeSinceLastTrigger < cooldownMs) {
            continue; // Still in cooldown
          }

          // Check if price moved back across threshold (reset boundary)
          const lastPrice = ruleState.last_triggered_price;
          const thresholdInCanonical = await convertThresholdToCanonical(
            rule.threshold_price,
            rule.currency as Currency,
            canonicalCurrency,
            fxRates
          );

          if (thresholdInCanonical === null) {
            continue; // Cannot convert
          }

          // Reset boundary: price must have moved back across threshold
          if (rule.direction === 'above') {
            // Rule triggers when price goes above threshold
            // Reset if price went back below threshold
            if (lastPrice >= thresholdInCanonical && currentPrice < thresholdInCanonical) {
              // Price went back below, reset state
              await supabase
                .from('user_rule_state')
                .upsert({
                  rule_id: rule.id,
                  last_triggered_at: now.toISOString(),
                  last_triggered_price: currentPrice,
                });
              continue; // Don't trigger, just reset
            }
          } else {
            // Rule triggers when price goes below threshold
            // Reset if price went back above threshold
            if (lastPrice <= thresholdInCanonical && currentPrice > thresholdInCanonical) {
              // Price went back above, reset state
              await supabase
                .from('user_rule_state')
                .upsert({
                  rule_id: rule.id,
                  last_triggered_at: now.toISOString(),
                  last_triggered_price: currentPrice,
                });
              continue; // Don't trigger, just reset
            }
          }
        }

        // Convert threshold to canonical currency
        const thresholdInCanonical = await convertThresholdToCanonical(
          rule.threshold_price,
          rule.currency as Currency,
          canonicalCurrency,
          fxRates
        );

        if (thresholdInCanonical === null) {
          continue; // Cannot convert
        }

        // Check if rule should trigger
        let shouldTrigger = false;
        let direction: 'UP' | 'DOWN' = 'UP';

        if (rule.direction === 'above') {
          // Trigger if current price >= threshold and last price < threshold
          if (currentPrice >= thresholdInCanonical) {
            if (!ruleState || ruleState.last_triggered_price < thresholdInCanonical) {
              shouldTrigger = true;
              direction = 'UP';
            }
          }
        } else {
          // Trigger if current price <= threshold and last price > threshold
          if (currentPrice <= thresholdInCanonical) {
            if (!ruleState || ruleState.last_triggered_price > thresholdInCanonical) {
              shouldTrigger = true;
              direction = 'DOWN';
            }
          }
        }

        if (shouldTrigger) {
          // Update rule state
          await supabase
            .from('user_rule_state')
            .upsert({
              rule_id: rule.id,
              last_triggered_at: now.toISOString(),
              last_triggered_price: currentPrice,
            });

          triggers.push({
            ruleId: rule.id,
            userId: rule.user_id,
            country: countryCode,
            karat,
            direction,
            thresholdPrice: thresholdInCanonical,
            currentPrice,
            currency: canonicalCurrency,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error evaluating user rules:', error);
  }

  return triggers;
}

/**
 * Convert threshold price from user currency to canonical currency
 */
async function convertThresholdToCanonical(
  thresholdPrice: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  fxRates: { usd_egp: number | null; usd_aed: number | null; usd_sar: number | null }
): Promise<number | null> {
  if (fromCurrency === toCurrency) {
    return thresholdPrice;
  }

  return convertMoney(thresholdPrice, fromCurrency, toCurrency, fxRates);
}

