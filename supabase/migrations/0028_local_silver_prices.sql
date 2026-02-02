-- Local Silver Prices (trusted scrape)
-- Premium-only feature. Does not touch gold tables.

create table if not exists public.local_silver_prices (
  id bigserial primary key,
  country text not null check (country in ('EG','AE','SA','US')),
  karat int not null check (karat in (999, 925, 900, 800)),
  buy_price numeric not null,
  sell_price numeric not null,
  change_value numeric null,
  change_pct numeric null,
  source text not null,
  trusted boolean not null default true,
  page_updated_at timestamptz null,
  scraped_at timestamptz not null default now()
);

create index if not exists idx_local_silver_prices_country_karat_scraped_at_desc
  on public.local_silver_prices(country, karat, scraped_at desc);

alter table public.local_silver_prices enable row level security;

