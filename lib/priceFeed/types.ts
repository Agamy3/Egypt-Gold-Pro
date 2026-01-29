import 'server-only';

export type Quote = {
  price: number;
  timestampMs: number;
  bid?: number;
  ask?: number;
  provider: 'goldapi' | 'gold_api_free';
  raw?: unknown;
};

