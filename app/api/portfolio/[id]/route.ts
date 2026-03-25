/**
 * Single Portfolio Holding API
 * 
 * PATCH: Update holding
 * DELETE: Delete holding
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
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

    const updateData: any = {};

    if (karat !== undefined) {
      if (![14, 18, 21, 24].includes(karat)) {
        return NextResponse.json({ error: 'Invalid karat' }, { status: 400 });
      }
      updateData.karat = karat;
    }
    if (grams !== undefined) {
      if (typeof grams !== 'number' || grams <= 0) {
        return NextResponse.json({ error: 'Invalid grams' }, { status: 400 });
      }
      updateData.grams = grams;
    }
    if (purchasePricePerGram !== undefined) {
      if (typeof purchasePricePerGram !== 'number' || purchasePricePerGram <= 0) {
        return NextResponse.json({ error: 'Invalid purchase price' }, { status: 400 });
      }
      updateData.purchase_price_per_gram = purchasePricePerGram;
    }
    if (purchaseCurrency !== undefined) {
      if (!['EGP', 'USD', 'AED', 'SAR'].includes(purchaseCurrency)) {
        return NextResponse.json({ error: 'Invalid purchase currency' }, { status: 400 });
      }
      updateData.purchase_currency = purchaseCurrency;
    }
    if (purchasedAt !== undefined) {
      updateData.purchased_at = purchasedAt || null;
    }
    if (notes !== undefined) {
      updateData.notes = notes || null;
    }
    if (country !== undefined) {
      if (country && !['EG', 'AE', 'SA', 'US'].includes(country)) {
        return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
      }
      updateData.country = country || null;
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_gold_holdings')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    return NextResponse.json({ holding: data });
  } catch (error) {
    console.error('Portfolio PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from('user_gold_holdings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Portfolio DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

