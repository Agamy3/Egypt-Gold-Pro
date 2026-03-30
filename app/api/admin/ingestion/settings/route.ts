import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';
import {
  getEffectiveIngestionConfig,
  getKnownEgyptSources,
  getDefaultEgyptAggregationEnabledSources,
  getDefaultEgyptIngestionEnabledSources,
  getAllAdminIngestionSettingKeys,
  type IngestionCountry,
} from '@/lib/ingestion/adminIngestionSettings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return null;
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const sources = getKnownEgyptSources();
    const keys = getAllAdminIngestionSettingKeys();

    const { data, error } = await supabase.from('admin_settings').select('key, value, updated_at, updated_by_user_id').in('key', keys);
    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));

    const m = new Map<string, any>();
    for (const row of data || []) {
      if (row && typeof (row as any).key === 'string') {
        m.set(String((row as any).key), row);
      }
    }

    const defaultsIngestion = new Set(getDefaultEgyptIngestionEnabledSources());
    const defaultsAggregation = new Set(getDefaultEgyptAggregationEnabledSources());

    const sourceRows = sources.map((s) => {
      const ingestKey = `ingestion_source_enabled_${s}`;
      const aggKey = `aggregation_source_enabled_${s}`;
      const ingestRaw = m.get(ingestKey)?.value;
      const aggRaw = m.get(aggKey)?.value;

      const ingestionEnabled = asBool(ingestRaw) ?? defaultsIngestion.has(s);
      const aggregationEnabled = asBool(aggRaw) ?? defaultsAggregation.has(s);

      return {
        source: s,
        ingestionEnabled,
        aggregationEnabled,
        ingestionSetting: m.get(ingestKey)
          ? {
              key: ingestKey,
              updated_at: m.get(ingestKey)?.updated_at ?? null,
              updated_by_user_id: m.get(ingestKey)?.updated_by_user_id ?? null,
            }
          : null,
        aggregationSetting: m.get(aggKey)
          ? {
              key: aggKey,
              updated_at: m.get(aggKey)?.updated_at ?? null,
              updated_by_user_id: m.get(aggKey)?.updated_by_user_id ?? null,
            }
          : null,
      };
    });

    const effective = await getEffectiveIngestionConfig(supabase);

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        effective,
        countries: effective.countriesEnabled,
        egyptSources: sourceRows,
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdmin();
    const supabase = getServerClient();

    const body = (await req.json().catch(() => null)) as {
      key?: string;
      enabled?: boolean;
    } | null;

    const key = body?.key;
    const enabled = body?.enabled;

    if (typeof key !== 'string' || key.length < 3) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid key' }, { status: 400 }));
    }
    if (typeof enabled !== 'boolean') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'enabled must be boolean' }, { status: 400 }));
    }

    const allowedKeys = new Set(getAllAdminIngestionSettingKeys());
    if (!allowedKeys.has(key)) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Key not allowed' }, { status: 400 }));
    }

    const desc = (() => {
      if (key === 'ingestion_country_enabled_EG') return 'Enable/disable Egypt ingestion/writes';
      if (key === 'ingestion_country_enabled_AE') return 'Enable/disable UAE ingestion/writes';
      if (key === 'ingestion_country_enabled_SA') return 'Enable/disable Saudi ingestion/writes';
      if (key.startsWith('ingestion_source_enabled_')) return 'Enable/disable Egypt source fetching + normalized writes';
      if (key.startsWith('aggregation_source_enabled_')) return 'Enable/disable Egypt source participation in aggregation';
      return null;
    })();

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert(
        {
          key,
          value: enabled,
          description: desc,
          updated_by_user_id: user.id,
        },
        { onConflict: 'key' }
      )
      .select('key, value, updated_at, updated_by_user_id')
      .single();

    if (error) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    }

    const effective = await getEffectiveIngestionConfig(supabase);

    const countryKeyToCountry: Record<string, IngestionCountry> = {
      ingestion_country_enabled_EG: 'EG',
      ingestion_country_enabled_AE: 'AE',
      ingestion_country_enabled_SA: 'SA',
    };

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        setting: {
          key: data.key,
          enabled: data.value === true || data.value === 'true',
          updated_at: (data as any).updated_at ?? null,
          updated_by_user_id: (data as any).updated_by_user_id ?? null,
          country: countryKeyToCountry[key] ?? null,
        },
        effective,
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
