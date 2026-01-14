/**
 * News context builder
 *
 * Builds "Why this matters" bullets and tags from a news item.
 * Factual, rules-based, no predictions.
 */

export interface ContextInput {
  title: string;
  source: string | null;
  summary: string | null;
}

export interface ContextResult {
  bullets: string[];
  tags: string[];
}

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Build "Why this matters" context for a news item.
 */
export function buildWhyItMatters(
  item: ContextInput,
  country: string
): ContextResult {
  const text = [item.title, item.source || '', item.summary || ''].join(' ').toLowerCase();
  const bullets: string[] = [];
  const tags: string[] = [];

  // Rates / Fed / hikes / cuts
  if (hasKeyword(text, ['rate', 'rates', 'fed', 'federal reserve', 'hike', 'hikes', 'cut', 'cuts'])) {
    bullets.push(
      'Interest rate decisions and expectations can influence gold by changing real yields and the relative appeal of holding cash versus metal.'
    );
    tags.push('rates', 'central-bank');
  }

  // Inflation / CPI
  if (hasKeyword(text, ['inflation', 'cpi', 'price index', 'consumer price'])) {
    bullets.push(
      'Inflation data historically affects gold because investors use gold as a store of value when purchasing power is under pressure.'
    );
    tags.push('inflation', 'prices');
  }

  // Geopolitics / war / conflict
  if (hasKeyword(text, ['war', 'conflict', 'missile', 'strike', 'clash', 'tension'])) {
    bullets.push(
      'Periods of geopolitical stress have often coincided with stronger demand for gold as a perceived safe-haven asset.'
    );
    tags.push('geopolitics', 'risk');
  }

  // Oil / energy
  if (hasKeyword(text, ['oil', 'brent', 'wti', 'energy prices'])) {
    bullets.push(
      'Moves in energy prices can influence inflation expectations and growth outlook, which in turn affect how investors think about gold.'
    );
    tags.push('oil', 'energy');
  }

  // FX / dollar / currency
  if (hasKeyword(text, ['dollar', 'usd', 'fx', 'currency', 'exchange rate', 'forex'])) {
    bullets.push(
      'Changes in the US dollar and FX markets can alter local gold prices even when global spot prices are stable.'
    );
    tags.push('fx', 'usd');
  }

  // Country-specific note (kept descriptive, not predictive)
  if (country === 'US' && hasKeyword(text, ['fed', 'federal reserve', 'cpi', 'inflation'])) {
    bullets.push(
      'For US investors, Fed policy and inflation data are key background factors that have historically shaped gold pricing over time.'
    );
    tags.push('us-macro');
  }

  // De-duplicate tags and trim sizes
  const uniqueTags = Array.from(new Set(tags)).slice(0, 5);
  const trimmedBullets = bullets.slice(0, 4);

  return {
    bullets: trimmedBullets,
    tags: uniqueTags,
  };
}
