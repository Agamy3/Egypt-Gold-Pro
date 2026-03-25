/**
 * Portfolio API
 * 
 * GET: List user's holdings with calculations
 * POST: Create new holding
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getMultiCurrencyRates, convertMoney, getCountryCurrency } from '@/lib/fx-multi';

export const dynamic = 'force-dynamic';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';
type Karat = 14 | 18 | 21 | 24;

interface Holding {
  id: number;
  country: Country | null;
  karat: Karat;
  grams: number;
  purchase_price_per_gram: number;
  purchase_currency: Currency;
  purchased_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CalculatedHolding extends Holding {
  invested_value_selected: number;
  current_value_selected: number | null;
  current_price_per_gram_selected: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  status: 'WIN' | 'LOSS' | 'FLAT';
}

interface KaratAggregate {
  karat: Karat;
  total_grams: number;
  avg_buy_price_per_gram_selected: number;
  current_price_per_gram_selected: number | null;
  invested_value_selected: number;
  current_value_selected: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  status: 'WIN' | 'LOSS' | 'FLAT';
}

function calculateStatus(pnlPct: number): 'WIN' | 'LOSS' | 'FLAT' {
  if (pnlPct >= 0.05) return 'WIN';
  if (pnlPct <= -0.05) return 'LOSS';
  return 'FLAT';
}

async function calculateHoldings(
  holdings: Holding[],
  country: Country,
  currency: Currency,
  marketMedians: any,
  fxRates: any
): Promise<{
  calculatedHoldings: CalculatedHolding[];
  karatAggregates: KaratAggregate[];
  totals: {
    invested_value_selected: number;
    current_value_selected: number | null;
    pnl: number | null;
    pnl_pct: number | null;
    status: 'WIN' | 'LOSS' | 'FLAT';
  };
  referenceUnavailable: boolean;
}> {
  const canonicalCurrency = getCountryCurrency(country);
  const referenceUnavailable = !marketMedians || Object.keys(marketMedians).length === 0;

  // Calculate each holding
  const calculatedHoldings: CalculatedHolding[] = holdings.map((holding) => {
    // Get current price for this karat
    const karatKey = `market${holding.karat}Buy` as keyof typeof marketMedians;
    const currentPriceCanonical = marketMedians?.[karatKey] as number | null;

    // Convert to selected currency
    const currentPriceSelected =
      typeof currentPriceCanonical === 'number' && isFinite(currentPriceCanonical) && currentPriceCanonical > 0 && fxRates
        ? convertMoney(currentPriceCanonical, canonicalCurrency, currency, fxRates)
        : null;

    // Convert purchase price to selected currency
    const purchasePriceSelected = fxRates
      ? convertMoney(holding.purchase_price_per_gram, holding.purchase_currency, currency, fxRates)
      : holding.purchase_price_per_gram; // Fallback if no FX

    const investedValueSelected = holding.grams * (purchasePriceSelected || holding.purchase_price_per_gram);
    const currentValueSelected =
      typeof currentPriceSelected === 'number' && isFinite(currentPriceSelected) && currentPriceSelected > 0
        ? holding.grams * currentPriceSelected
        : null;
    const pnl = currentValueSelected !== null ? currentValueSelected - investedValueSelected : null;
    const pnlPct = currentValueSelected !== null && investedValueSelected > 0 ? pnl! / investedValueSelected : null;

    return {
      ...holding,
      invested_value_selected: investedValueSelected,
      current_value_selected: currentValueSelected,
      current_price_per_gram_selected: currentPriceSelected,
      pnl,
      pnl_pct: pnlPct,
      status: pnlPct !== null ? calculateStatus(pnlPct) : 'FLAT',
    };
  });

  // Aggregate by karat
  const karatMap = new Map<Karat, CalculatedHolding[]>();
  calculatedHoldings.forEach((h) => {
    const existing = karatMap.get(h.karat) || [];
    karatMap.set(h.karat, [...existing, h]);
  });

  const karatAggregates: KaratAggregate[] = Array.from(karatMap.entries()).map(([karat, holdings]) => {
    const totalGrams = holdings.reduce((sum, h) => sum + h.grams, 0);
    const totalInvested = holdings.reduce((sum, h) => sum + h.invested_value_selected, 0);
    const avgBuyPrice = totalGrams > 0 ? totalInvested / totalGrams : 0;

    const karatKey = `market${karat}Buy` as keyof typeof marketMedians;
    const currentPriceCanonical = marketMedians?.[karatKey] as number | null;
    const currentPriceSelected =
      typeof currentPriceCanonical === 'number' && isFinite(currentPriceCanonical) && currentPriceCanonical > 0 && fxRates
        ? convertMoney(currentPriceCanonical, canonicalCurrency, currency, fxRates)
        : null;

    const currentValue =
      typeof currentPriceSelected === 'number' && isFinite(currentPriceSelected) && currentPriceSelected > 0
        ? totalGrams * currentPriceSelected
        : null;
    const pnl = currentValue !== null ? currentValue - totalInvested : null;
    const pnlPct = currentValue !== null && totalInvested > 0 ? pnl! / totalInvested : null;

    return {
      karat,
      total_grams: totalGrams,
      avg_buy_price_per_gram_selected: avgBuyPrice,
      current_price_per_gram_selected: currentPriceSelected,
      invested_value_selected: totalInvested,
      current_value_selected: currentValue,
      pnl,
      pnl_pct: pnlPct,
      status: pnlPct !== null ? calculateStatus(pnlPct) : 'FLAT',
    };
  });

  // Calculate totals
  const totalInvested = calculatedHoldings.reduce((sum, h) => sum + h.invested_value_selected, 0);
  const hasMissingCurrent = calculatedHoldings.some((h) => h.current_value_selected === null);
  const totalCurrent = hasMissingCurrent
    ? null
    : calculatedHoldings.reduce((sum, h) => sum + (h.current_value_selected ?? 0), 0);
  const totalPnl = totalCurrent !== null ? totalCurrent - totalInvested : null;
  const totalPnlPct = totalCurrent !== null && totalInvested > 0 ? totalPnl! / totalInvested : null;

  return {
    calculatedHoldings,
    karatAggregates: karatAggregates.sort((a, b) => b.karat - a.karat), // Sort by karat descending
    totals: {
      invested_value_selected: totalInvested,
      current_value_selected: totalCurrent,
      pnl: totalPnl,
      pnl_pct: totalPnlPct,
      status: totalPnlPct !== null ? calculateStatus(totalPnlPct) : 'FLAT',
    },
    referenceUnavailable,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const country = (searchParams.get('country') || 'EG') as Country;
    const currency = (searchParams.get('currency') || getCountryCurrency(country)) as Currency;

    const supabase = await createServerSupabaseClient();
    
    // Fetch user's holdings
    const { data: holdings, error: holdingsError } = await supabase
      .from('user_gold_holdings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (holdingsError) {
      return NextResponse.json({ error: holdingsError.message }, { status: 400 });
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        holdings: [],
        karatAggregates: [],
        totals: {
          invested_value_selected: 0,
          current_value_selected: 0,
          pnl: 0,
          pnl_pct: 0,
          status: 'FLAT' as const,
        },
        referenceUnavailable: false,
      });
    }

    // Fetch market data and FX rates
    // Match homepage market source mode/window to avoid divergence in current prices.
    const marketMediansResult = await getMarketMedians(country, false, 120);
    const fxRates = await getMultiCurrencyRates();

    const result = await calculateHoldings(
      holdings as Holding[],
      country,
      currency,
      marketMediansResult.prices,
      fxRates
    );

    return NextResponse.json({
      holdings: result.calculatedHoldings,
      karatAggregates: result.karatAggregates,
      totals: result.totals,
      referenceUnavailable: result.referenceUnavailable,
      currency,
      country,
    });
  } catch (error) {
    console.error('Portfolio GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      karat,
      grams,
      purchasePricePerGram,
      purchaseCurrency,
      purchasedAt,
      notes,
      country,
    } = body;

    // Validation
    if (!karat || ![14, 18, 21, 24].includes(karat)) {
      return NextResponse.json({ error: 'Invalid karat' }, { status: 400 });
    }
    if (!grams || typeof grams !== 'number' || grams <= 0) {
      return NextResponse.json({ error: 'Invalid grams' }, { status: 400 });
    }
    if (!purchasePricePerGram || typeof purchasePricePerGram !== 'number' || purchasePricePerGram <= 0) {
      return NextResponse.json({ error: 'Invalid purchase price' }, { status: 400 });
    }
    if (!purchaseCurrency || !['EGP', 'USD', 'AED', 'SAR'].includes(purchaseCurrency)) {
      return NextResponse.json({ error: 'Invalid purchase currency' }, { status: 400 });
    }
    if (country && !['EG', 'AE', 'SA', 'US'].includes(country)) {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_gold_holdings')
      .insert({
        user_id: user.id,
        country: country || null,
        karat,
        grams,
        purchase_price_per_gram: purchasePricePerGram,
        purchase_currency: purchaseCurrency,
        purchased_at: purchasedAt || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ holding: data });
  } catch (error) {
    console.error('Portfolio POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

