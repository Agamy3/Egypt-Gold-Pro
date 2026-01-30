export const DEFAULT_ALPACA_UNIVERSE = [
  'SPY',
  'QQQ',
  'DIA',
  'IWM',
  'GLD',
  'SLV',
  'TLT',
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOGL',
  'NVDA',
  'META',
  'JNJ',
  'PG',
  'KO',
];

export const DEFAULT_ALPACA_SETTINGS = {
  enabled: false,
  interval_seconds: 60,
  max_risk_per_trade_pct: 0.02,
  max_daily_drawdown_pct: 0.05,
  universe: DEFAULT_ALPACA_UNIVERSE,
} as const;

