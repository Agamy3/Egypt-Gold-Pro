-- Server-side bot settings (kill switch, etc.)

create table if not exists public.bot_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Default minute-bot settings
insert into public.bot_settings(key, value)
values ('minute_bot', jsonb_build_object('tradingEnabled', true))
on conflict (key) do nothing;

alter table public.bot_settings enable row level security;

drop policy if exists "admins can read bot_settings" on public.bot_settings;
create policy "admins can read bot_settings"
  on public.bot_settings
  for select
  using (exists(select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admins can write bot_settings" on public.bot_settings;
create policy "admins can write bot_settings"
  on public.bot_settings
  for all
  using (exists(select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists(select 1 from public.admin_users au where au.user_id = auth.uid()));

