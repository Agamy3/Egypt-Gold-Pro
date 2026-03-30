import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { EG_WEB_SOURCES, SOURCE_URLS, SOURCE_WEIGHTS } from '@/lib/gold-ingestion-config';

export type IngestionCountry = 'EG' | 'AE' | 'SA';

export type EffectiveIngestionConfig = {
  countriesEnabled: Record<IngestionCountry, boolean>;
  egypt: {
    ingestionSourcesEnabled: string[];
    aggregationSourcesEnabled: string[];
  };
};

function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return null;
}

export function getKnownEgyptSources(): string[] {
  const fromUrls = Object.keys(SOURCE_URLS);
  const fromWeights = Object.keys(SOURCE_WEIGHTS);
  const fromEgWeb = [...EG_WEB_SOURCES];
  return Array.from(new Set([...fromUrls, ...fromWeights, ...fromEgWeb])).sort();
}

export function getDefaultEgyptIngestionEnabledSources(): string[] {
  return Object.keys(SOURCE_URLS).sort();
}

export function getDefaultEgyptAggregationEnabledSources(): string[] {
  return [...EG_WEB_SOURCES].sort();
}

export function getAllAdminIngestionSettingKeys(): string[] {
  const sources = getKnownEgyptSources();
  const keys: string[] = [
    'ingestion_country_enabled_EG',
    'ingestion_country_enabled_AE',
    'ingestion_country_enabled_SA',
  ];

  for (const s of sources) {
    keys.push(`ingestion_source_enabled_${s}`);
    keys.push(`aggregation_source_enabled_${s}`);
  }

  return keys;
}

async function readSettingsMap(supabase: SupabaseClient, keys: string[]): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map();

  const { data, error } = await supabase.from('admin_settings').select('key, value').in('key', keys);
  if (error) return new Map();

  const m = new Map<string, unknown>();
  for (const row of data || []) {
    const k = (row as any)?.key;
    if (typeof k === 'string') {
      m.set(k, (row as any)?.value);
    }
  }
  return m;
}

function getBoolSetting(m: Map<string, unknown>, key: string): boolean | null {
  return asBool(m.get(key));
}

export async function getEffectiveIngestionConfig(supabase: SupabaseClient): Promise<EffectiveIngestionConfig> {
  const sources = getKnownEgyptSources();
  const keys = getAllAdminIngestionSettingKeys();
  const m = await readSettingsMap(supabase, keys);

  const countriesEnabled: EffectiveIngestionConfig['countriesEnabled'] = {
    EG: getBoolSetting(m, 'ingestion_country_enabled_EG') ?? true,
    AE: getBoolSetting(m, 'ingestion_country_enabled_AE') ?? true,
    SA: getBoolSetting(m, 'ingestion_country_enabled_SA') ?? true,
  };

  const defaultIngestion = new Set(getDefaultEgyptIngestionEnabledSources());
  const defaultAggregation = new Set(getDefaultEgyptAggregationEnabledSources());

  const ingestionSourcesEnabled: string[] = [];
  const aggregationSourcesEnabled: string[] = [];

  for (const s of sources) {
    const ingestKey = `ingestion_source_enabled_${s}`;
    const aggKey = `aggregation_source_enabled_${s}`;

    const ingestEnabled = getBoolSetting(m, ingestKey) ?? defaultIngestion.has(s);
    const aggEnabled = getBoolSetting(m, aggKey) ?? defaultAggregation.has(s);

    if (ingestEnabled) ingestionSourcesEnabled.push(s);
    if (aggEnabled) aggregationSourcesEnabled.push(s);
  }

  return {
    countriesEnabled,
    egypt: {
      ingestionSourcesEnabled: ingestionSourcesEnabled.sort(),
      aggregationSourcesEnabled: aggregationSourcesEnabled.sort(),
    },
  };
}

export async function isCountryIngestionEnabled(supabase: SupabaseClient, country: IngestionCountry): Promise<boolean> {
  const c = await getEffectiveIngestionConfig(supabase);
  return c.countriesEnabled[country];
}
