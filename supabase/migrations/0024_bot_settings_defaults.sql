-- Ensure minute-bot settings include defaults for horizon + frequency.

insert into public.bot_settings(key, value)
values (
  'minute_bot',
  jsonb_build_object(
    'tradingEnabled', true,
    'predictionHorizonMinutes', 1,
    'tradeFrequencyMinutes', 1
  )
)
on conflict (key) do nothing;

update public.bot_settings
set
  value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
    'tradingEnabled', coalesce((value->>'tradingEnabled')::boolean, true),
    'predictionHorizonMinutes', coalesce((value->>'predictionHorizonMinutes')::int, 1),
    'tradeFrequencyMinutes', coalesce((value->>'tradeFrequencyMinutes')::int, 1)
  ),
  updated_at = now()
where key = 'minute_bot';

