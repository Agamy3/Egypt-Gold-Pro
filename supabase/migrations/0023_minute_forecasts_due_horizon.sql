-- Add due_at + horizon_minutes to minute_forecasts for explicit timing/validation.

alter table public.minute_forecasts
  add column if not exists horizon_minutes int not null default 1,
  add column if not exists due_at timestamptz;

-- Backfill due_at for existing rows (best-effort).
update public.minute_forecasts
set due_at = created_at + make_interval(mins => greatest(1, coalesce(horizon_minutes, 1)))
where due_at is null;

alter table public.minute_forecasts
  alter column due_at set not null;

create index if not exists idx_minute_forecasts_due_at
  on public.minute_forecasts(due_at);

