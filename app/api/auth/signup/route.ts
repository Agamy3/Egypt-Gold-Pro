/**
 * Email/Password Sign Up API
 * POST /api/auth/signup
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';
import { createServerClient as createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, displayName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const response = NextResponse.json({ success: true });
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value,
              ...options,
            });
            response.cookies.set({
              name,
              value,
              ...options,
            });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value: '',
              ...options,
            });
            response.cookies.set({
              name,
              value: '',
              ...options,
            });
          },
        },
      }
    );

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    // Create profile if user was created
    if (authData.user) {
      const supabaseAdmin = createAdminClient();
      const defaultCountry = 'EG'; // Default country is Egypt
      
      // Create user profile with push notifications enabled by default
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          email: authData.user.email!,
          display_name: displayName || null,
          preferred_country: defaultCountry,
          push_notifications_enabled: true, // Enable push notifications by default
          email_notifications_enabled: true,
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        // Don't fail the signup if profile creation fails - it can be created later
      } else {
        // Create default notification rule for 24k price changes in default country
        // This rule triggers on any price change >= 0.5% for 24k gold in the default country
        const { error: ruleError } = await supabaseAdmin
          .from('notification_rules')
          .insert({
            user_id: authData.user.id,
            type: 'price_move_pct',
            country: defaultCountry,
            karat: 24,
            pct_threshold: 0.005, // 0.5% threshold
            enabled: true,
            channel_inapp: true,
            channel_push: true, // Enable push for this rule
            channel_email: true,
            one_time: false,
          });

        if (ruleError) {
          console.error('Error creating default notification rule:', ruleError);
          // Don't fail the signup if rule creation fails
        }

        // Add default country to watchlist
        const { error: watchlistError } = await supabaseAdmin
          .from('user_country_watchlist')
          .insert({
            user_id: authData.user.id,
            country: defaultCountry,
            enabled: true,
          });

        if (watchlistError) {
          console.error('Error creating default watchlist entry:', watchlistError);
          // Don't fail the signup if watchlist creation fails
        }
      }
    }

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

