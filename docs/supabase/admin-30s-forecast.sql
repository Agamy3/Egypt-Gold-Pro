-- EgyptGold Pro: Admin-only 30s forecast on GLOBAL OUNCE (XAU spot)
-- Run in Supabase SQL Editor.
--
-- SECURITY NOTE:
-- This creates an admin_users allowlist table. Add your admin user IDs there.
-- Example:
--   insert into public.admin_users(user_id) values ('<auth.users uuid>');
--
-- This is preferred over hardcoding emails in code.

-- ==============
-- Admin allowlist
-- ==============
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Allow authenticated users to read THEIR own row.
-- This is required so `exists(select 1 from admin_users ...)` works under RLS.
drop policy if exists "users can read own admin_users row" on public.admin_users;
create policy "users can read own admin_users row"
  on public.admin_users
  for select
  using (auth.uid() = user_id);

-- Only service_role can insert/update/delete admin_users (set admins via SQL / dashboard).
drop policy if exists "service role can manage admin_users" on public.admin_users;
create policy "service role can manage admin_users"
  on public.admin_users
  for all
  using (auth.jwt()->>'role' = 'service_role')
  with check (auth.jwt()->>'role' = 'service_role');

-- =========================
-- 1) admin_30s_predictions
-- =========================
create table if not exists public.admin_30s_predictions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  horizon_seconds int not null default 30,
  predicted_direction text not null check (predicted_direction in ('UP','DOWN','STALE')),
  p0 numeric not null,
  p0_at timestamptz not null,
  due_at timestamptz not null,
  validated_at timestamptz,
  p1 numeric,
  result text check (result in ('TRUE','FALSE','TIE','NA')),
  source text not null default 'gold_spot',
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_admin_30s_predictions_due_at on public.admin_30s_predictions(due_at);
create index if not exists idx_admin_30s_predictions_p0_at_desc on public.admin_30s_predictions(p0_at desc);
create index if not exists idx_admin_30s_predictions_validated_at on public.admin_30s_predictions(validated_at);

alter table public.admin_30s_predictions enable row level security;

drop policy if exists "admins can read predictions" on public.admin_30s_predictions;
create policy "admins can read predictions"
  on public.admin_30s_predictions
  for select
  using (exists(select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admins can write predictions" on public.admin_30s_predictions;
create policy "admins can write predictions"
  on public.admin_30s_predictions
  for all
  using (exists(select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists(select 1 from public.admin_users au where au.user_id = auth.uid()));

-- =====================
-- 2) admin_30s_trades
-- =====================
create table if not exists public.admin_30s_trades (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.admin_30s_predictions(id) on delete cascade,
  created_at timestamptz not null default now(),
  side text not null check (side in ('LONG','SHORT')),
  notional_usd numeric not null default 10,
  qty_oz numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  pnl_usd numeric not null,
  closed_at timestamptz not null
);

create index if not exists idx_admin_30s_trades_prediction_id on public.admin_30s_trades(prediction_id);
create index if not exists idx_admin_30s_trades_closed_at_desc on public.admin_30s_trades(closed_at desc);

alter table public.admin_30s_trades enable row level security;

drop policy if exists "admins can read trades" on public.admin_30s_trades;
create policy "admins can read trades"
  on public.admin_30s_trades
  for select
  using (exists(select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admins can write trades" on public.admin_30s_trades;
create policy "admins can write trades"
  on public.admin_30s_trades
  for all
  using (exists(select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists(select 1 from public.admin_users au where au.user_id = auth.uid()));

