import 'server-only';

type AlpacaOrderSide = 'buy' | 'sell';
type AlpacaOrderStatus = 'open' | 'closed' | 'all';

export type AlpacaAccount = {
  id: string;
  status: string;
  equity: string;
  cash: string;
  buying_power: string;
  last_equity?: string;
  portfolio_value?: string;
  currency?: string;
};

export type AlpacaPosition = {
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  avg_entry_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
};

export type AlpacaOrder = {
  id: string;
  client_order_id?: string;
  created_at?: string;
  submitted_at?: string;
  filled_at?: string;
  filled_avg_price?: string;
  symbol: string;
  side: AlpacaOrderSide;
  qty?: string;
  notional?: string;
  status: string;
  order_type?: string;
  type?: string;
  legs?: AlpacaOrder[];
};

type Timeframe = '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';

export type AlpacaBar = {
  t: string; // RFC3339
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

function mustEnv(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getTradingBaseUrl(): string {
  const base = mustEnv('ALPACA_BASE_URL');
  // Safety: enforce paper base URL. Never allow live trading endpoints.
  if (!base.includes('paper')) {
    throw new Error('Refusing to run: ALPACA_BASE_URL must contain "paper" for paper trading only.');
  }
  return base.replace(/\/+$/, '');
}

function getDataBaseUrl(): string {
  // Alpaca market data is served from data.alpaca.markets.
  // Allow override if needed, but keep a safe default.
  const v = (process.env.ALPACA_DATA_BASE_URL ?? 'https://data.alpaca.markets').trim();
  return v.replace(/\/+$/, '');
}

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID': mustEnv('ALPACA_API_KEY_ID'),
    'APCA-API-SECRET-KEY': mustEnv('ALPACA_API_SECRET_KEY'),
    'Content-Type': 'application/json',
  };
}

async function alpacaFetch<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...alpacaHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Alpaca API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getAccount(): Promise<AlpacaAccount> {
  return alpacaFetch<AlpacaAccount>(getTradingBaseUrl(), '/v2/account');
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  return alpacaFetch<AlpacaPosition[]>(getTradingBaseUrl(), '/v2/positions');
}

export async function getOrders(opts?: { status?: AlpacaOrderStatus; limit?: number; after?: string; until?: string }): Promise<AlpacaOrder[]> {
  const status = opts?.status ?? 'all';
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const qs = new URLSearchParams({ status, limit: String(limit), direction: 'desc' });
  if (opts?.after) qs.set('after', opts.after);
  if (opts?.until) qs.set('until', opts.until);
  return alpacaFetch<AlpacaOrder[]>(getTradingBaseUrl(), `/v2/orders?${qs.toString()}`);
}

export async function placeBracketOrder(input: {
  symbol: string;
  qty: number;
  side: 'BUY' | 'SELL';
  stopLoss: number;
  takeProfit: number;
}): Promise<AlpacaOrder> {
  const side: AlpacaOrderSide = input.side === 'BUY' ? 'buy' : 'sell';
  const stop = Number(input.stopLoss);
  const tp = Number(input.takeProfit);
  if (!isFinite(stop) || !isFinite(tp)) throw new Error('Invalid stopLoss/takeProfit');

  const body = {
    symbol: input.symbol,
    qty: String(input.qty),
    side,
    type: 'market',
    time_in_force: 'day',
    order_class: 'bracket',
    take_profit: { limit_price: tp.toFixed(2) },
    stop_loss: { stop_price: stop.toFixed(2) },
  };
  return alpacaFetch<AlpacaOrder>(getTradingBaseUrl(), '/v2/orders', { method: 'POST', body: JSON.stringify(body) });
}

export async function getBars(input: {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
}): Promise<AlpacaBar[]> {
  const limit = Math.min(Math.max(input.limit ?? 200, 10), 1000);
  const qs = new URLSearchParams({
    timeframe: input.timeframe,
    limit: String(limit),
    adjustment: 'raw',
  });
  const data = await alpacaFetch<any>(getDataBaseUrl(), `/v2/stocks/${encodeURIComponent(input.symbol)}/bars?${qs.toString()}`);
  const bars = (data?.bars ?? []) as any[];
  return bars
    .map((b) => ({
      t: String(b.t),
      o: Number(b.o),
      h: Number(b.h),
      l: Number(b.l),
      c: Number(b.c),
      v: Number(b.v),
    }))
    .filter((b) => isFinite(b.o) && isFinite(b.h) && isFinite(b.l) && isFinite(b.c));
}

export async function getLatestTradeOrQuote(symbol: string): Promise<{ price: number; ts: string }> {
  // Prefer latest trade price. If not available, fall back to quote midpoint.
  const base = getDataBaseUrl();
  try {
    const t = await alpacaFetch<any>(base, `/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`);
    const trade = t?.trade;
    const p = Number(trade?.p);
    const ts = String(trade?.t ?? '');
    if (isFinite(p) && ts) return { price: p, ts };
  } catch {
    // ignore
  }

  const q = await alpacaFetch<any>(base, `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`);
  const quote = q?.quote;
  const bid = Number(quote?.bp);
  const ask = Number(quote?.ap);
  const ts = String(quote?.t ?? '');
  const mid = isFinite(bid) && isFinite(ask) ? (bid + ask) / 2 : (isFinite(ask) ? ask : bid);
  if (!isFinite(mid) || !ts) throw new Error('Missing latest trade/quote');
  return { price: mid, ts };
}

