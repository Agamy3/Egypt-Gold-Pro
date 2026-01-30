-- Extend minute_forecasts to support validation outcomes (next-cycle validation).

alter table public.minute_forecasts
  add column if not exists validated_at timestamptz,
  add column if not exists p1 numeric,
  add column if not exists outcome text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'minute_forecasts_outcome_chk'
  ) then
    alter table public.minute_forecasts
      add constraint minute_forecasts_outcome_chk
      check (outcome in ('true','false','tie','stale','na'));
  end if;
end $$;

-- Helpful index for "find unvalidated prior minutes"
create index if not exists idx_minute_forecasts_unvalidated
  on public.minute_forecasts(minute_key desc)
  where validated_at is null;

