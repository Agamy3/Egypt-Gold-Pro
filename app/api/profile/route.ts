/**
 * Profile API
 * 
 * GET: Get user profile
 * PATCH: Update user profile
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Return profile with user email from auth
    return NextResponse.json({
      profile: profile || null,
      email: user.email,
      provider: user.app_metadata?.provider || 'email',
      created_at: user.created_at,
    });
  } catch (error) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      display_name,
      preferred_country,
      preferred_currency,
      preferred_language,
      email_notifications_enabled,
      app_notifications_enabled,
    } = body;

    // Validation
    const updateData: any = {};

    if (display_name !== undefined) {
      updateData.display_name = display_name?.trim() || null;
    }

    if (preferred_country !== undefined) {
      if (preferred_country && !['EG', 'AE', 'SA', 'US'].includes(preferred_country)) {
        return NextResponse.json({ error: 'Invalid preferred_country' }, { status: 400 });
      }
      updateData.preferred_country = preferred_country || null;
    }

    if (preferred_currency !== undefined) {
      if (preferred_currency && !['EGP', 'USD', 'AED', 'SAR'].includes(preferred_currency)) {
        return NextResponse.json({ error: 'Invalid preferred_currency' }, { status: 400 });
      }
      updateData.preferred_currency = preferred_currency || null;
    }

    if (preferred_language !== undefined) {
      if (preferred_language && !['EN', 'AR'].includes(preferred_language)) {
        return NextResponse.json({ error: 'Invalid preferred_language' }, { status: 400 });
      }
      updateData.preferred_language = preferred_language || null;
    }

    if (email_notifications_enabled !== undefined) {
      updateData.email_notifications_enabled = Boolean(email_notifications_enabled);
    }

    if (app_notifications_enabled !== undefined) {
      updateData.app_notifications_enabled = Boolean(app_notifications_enabled);
    }

    const supabase = await createServerSupabaseClient();
    
    // First ensure profile exists
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      // Create profile if it doesn't exist
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email!,
          ...updateData,
        });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    } else {
      // Update existing profile
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    }

    // Fetch updated profile
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Profile PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

