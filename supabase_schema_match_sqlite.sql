-- Postgres schema matching the *existing SQLite column names* (easiest for CSV import)

create table if not exists public.egypt_market (
  id bigserial primary key,
  source text not null,
  market_21_buy double precision,
  market_21_sell double precision,
  market_24_buy double precision,
  market_24_sell double precision,
  fetched_at bigint not null, -- epoch ms
  status text not null,
  error_message text,
  raw_response text,
  constraint egypt_market_source_chk check (source in ('dahabmasr','goldbillion','ta3weem_dahabmasr'))
);

create table if not exists public.gold_spot (
  id bigserial primary key,
  xau_spot_usd_oz double precision not null,
  fetched_at bigint not null, -- epoch ms
  stale boolean not null default false,
  source text default 'GoldAPI'
);

create table if not exists public.market_snapshots (
  id bigserial primary key,
  source text not null,
  "createdAt" bigint not null, -- epoch ms
  "market21Buy" double precision,
  "market21Sell" double precision,
  "market24Buy" double precision,
  "market24Sell" double precision,
  "market18Buy" double precision,
  "market18Sell" double precision,
  "market14Buy" double precision,
  "market14Sell" double precision,
  "usdBuy" double precision,
  "usdSell" double precision,
  "rawHash" text,
  error text,
  "httpStatus" integer,
  url text,
  "rawResponseSnippet" text,
  constraint market_snapshots_source_chk check (source in (
    'banklive','dokangold','gold_era','goldbillion','goldbullioneg','goldrate24','isagha','livepriceofgold','aggregated'
  ))
);

create table if not exists public.market_snapshots_new (
  id bigserial primary key,
  "createdAt" bigint not null, -- epoch ms
  source text not null,
  "market21Buy" double precision,
  "market21Sell" double precision,
  "market24Buy" double precision,
  "market24Sell" double precision,
  "market18Buy" double precision,
  "market18Sell" double precision,
  "market14Buy" double precision,
  "market14Sell" double precision,
  "usdBuy" double precision,
  "usdSell" double precision,
  "rawHash" text,
  error text,
  "httpStatus" integer,
  url text,
  "rawResponseSnippet" text
);

create table if not exists public.source_staleness (
  id bigserial primary key,
  source text not null,
  karat integer not null,
  "lastOkTimestamp" bigint not null, -- epoch ms
  "lastOkBuy" double precision not null,
  constraint source_staleness_source_karat_uniq unique (source, karat)
);
