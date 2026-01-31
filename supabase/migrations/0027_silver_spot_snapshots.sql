-- Silver spot snapshots (derived from XAG/USD spot + USD->local FX)
-- Premium-only feature uses these snapshots for direction and alerts.

create table if not exists public.silver_spot_snapshots (
  id bigserial primary key,
  country text not null check (country in ('EG','AE','SA','US')),
  currency text not null check (currency in ('EGP','USD','AED','SAR')),
  price_per_oz numeric not null,
  price_per_g numeric not null,
  spot_usd_per_oz numeric not null,
  usd_to_local numeric not null,
  source_spot text not null,
  source_fx text not null,
  spot_asof timestamptz null,
  fx_date text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_silver_spot_snapshots_country_created_at_desc
  on public.silver_spot_snapshots(country, created_at desc);

-- Keep this table server-only: enable RLS and do not add public select policies.
alter table public.silver_spot_snapshots enable row level security;

