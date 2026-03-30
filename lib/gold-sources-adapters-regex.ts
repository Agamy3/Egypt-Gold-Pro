/**
 * Workers-safe Gold Source Adapters (regex-only)
 *
 * This intentionally avoids `cheerio` / DOM parsing because some Worker runtimes
 * can fail to load Node-oriented HTML parsers.
 *
 * Goal: keep the same business behavior for ingestion:
 * - parse BUY prices for karats 21 + 24 (18/14 optional)
 * - mark result as valid only when 21 and 24 are present
 */

import { detectJsPage, validatePrice } from './gold-ingestion-utils';
import { SOURCE_URLS, KARATS } from './gold-ingestion-config';

export interface SourcePriceResult {
  source: string;
  valid: boolean;
  stale: Record<number, boolean>;
  prices: Record<number, number>; // karat -> buy price
  sells?: Record<number, number>; // karat -> sell price (optional)
  errors: string[];
  notes: string[];
  rawSnippet?: string;
  contentLength?: number;
  bodyTextSnippet?: string;
  httpStatus?: number;
  method?: 'regex' | 'jina';
  methodTried?: string[];
  selectorHits?: Record<string, number>;
  regexMatches?: Array<{ karat: number; pattern: string; match: string; snippet?: string }>;
  parseError?: string;
  // Extra debug fields (not all are populated by the regex-only adapter).
  url?: string;
  rawHtmlSnippet?: string;
  rowSamples?: Array<{ karat: number; text: string }>;
  numbersFoundSample?: Array<{ karat: number; numbers: number[] }>;
  allRowSamples?: string[];
  allRowNumbersSamples?: number[][];
}

// Cloudflare Workers (and some runtimes) may not support AbortSignal.timeout.
// Polyfill it so upstream fetches time out instead of throwing.
const AbortSignalAny = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
if (typeof AbortSignalAny.timeout !== 'function') {
  AbortSignalAny.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function stripScriptsAndStyles(html: string): string {
  // Remove script/style/noscript/svg/iframe/header/nav/footer blocks.
  return html
    .replace(/<(script|style|noscript|svg|iframe|header|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function stripHtmlToText(html: string): string {
  const cleaned = stripScriptsAndStyles(html);
  // Remove tags.
  const noTags = cleaned.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(noTags);
}

function normalizeNumber(s: string): number | null {
  let t = s.trim();
  // Normalize Arabic-Indic digits to ASCII digits.
  t = t
    .replace(/٠/g, '0')
    .replace(/١/g, '1')
    .replace(/٢/g, '2')
    .replace(/٣/g, '3')
    .replace(/٤/g, '4')
    .replace(/٥/g, '5')
    .replace(/٦/g, '6')
    .replace(/٧/g, '7')
    .replace(/٨/g, '8')
    .replace(/٩/g, '9');

  // Remove currency-ish tokens.
  t = t
    .replace(/EGP/gi, '')
    .replace(/£/g, '')
    .replace(/ج\.?م\.?/gi, '')
    .replace(/جنيه/gi, '')
    .replace(/LE\b/gi, '')
    .replace(/\s+/g, '');

  // Remove thousands separators, keep decimal points.
  t = t.replace(/,/g, '');

  const n = parseFloat(t);
  if (!isFinite(n)) return null;
  return n;
}

function parseBankLive(text: string): { prices: Record<number, number>; errors: string[] } {
  const prices: Record<number, number> = {};
  const errors: string[] = [];
  for (const karat of KARATS) {
    const pattern = new RegExp(`ذهب\\s+عيار\\s+${karat}\\s*([\\d,.]+).*?\\s*([\\d,.]+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const buy = normalizeNumber(match[1]);
      const sell = normalizeNumber(match[2]);
      if (buy !== null && sell !== null && buy > 0 && sell > 0 && validatePrice(karat, buy)) {
        prices[karat] = buy;
      }
    }
  }
  if (Object.keys(prices).length === 0) errors.push('no_prices_found');
  return { prices, errors };
}

function parseGoldEra(text: string): { prices: Record<number, number>; sells: Record<number, number>; errors: string[] } {
  const prices: Record<number, number> = {};
  const sells: Record<number, number> = {};
  const errors: string[] = [];
  for (const karat of KARATS) {
    const pattern = new RegExp(`عيار\\s*${karat}\\s*([\\d,]+)\\s*£\\s*([\\d,]+)\\s*£`, 'i');
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const sell = normalizeNumber(match[1]);
      const buy = normalizeNumber(match[2]);
      if (sell !== null && buy !== null && buy > 0 && sell > 0 && validatePrice(karat, buy)) {
        prices[karat] = buy;
        sells[karat] = sell;
      }
    }
  }
  if (Object.keys(prices).length === 0) errors.push('no_prices_found');
  return { prices, sells, errors };
}

function parseDokanGold(text: string): { prices: Record<number, number>; sells?: Record<number, number>; errors: string[] } {
  const prices: Record<number, number> = {};
  const sells: Record<number, number> = {};
  const errors: string[] = [];

  for (const karat of KARATS) {
    const pattern = new RegExp(`عيار\\s+${karat}\\s+${karat}\\s*([\\d,.]+)\\s*([\\d,.]+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      const buy = normalizeNumber(match[1]);
      const sell = normalizeNumber(match[2]);
      if (buy !== null && sell !== null && buy > 0 && sell > 0 && validatePrice(karat, buy)) {
        prices[karat] = buy;
        sells[karat] = sell;
      }
    }
  }

  // 14k fallback: try "شراء <buy>" and "بيع <sell>".
  if (!prices[14]) {
    const buyMatch = text.match(/شراء\\s*([\\d,.]+)/i);
    const sellMatch = text.match(/بيع\\s*([\\d,.]+)/i);
    if (buyMatch?.[1]) {
      const buy = normalizeNumber(buyMatch[1]);
      if (buy !== null && buy > 0 && validatePrice(14, buy)) {
        prices[14] = buy;
      }
      if (sellMatch?.[1]) {
        const sell = normalizeNumber(sellMatch[1]);
        if (sell !== null && sell > 0) sells[14] = sell;
      }
    }
  }

  if (Object.keys(prices).length === 0) errors.push('no_prices_found');
  return { prices, sells: Object.keys(sells).length ? sells : undefined, errors };
}

function parseGoldRate24(text: string): { prices: Record<number, number>; errors: string[] } {
  const prices: Record<number, number> = {};
  const errors: string[] = [];

  for (const karat of KARATS) {
    const pattern = new RegExp(
      `([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?)\\s*(?:جنيه\\s*مصري\\/غرام|للغرام|للغرام)?\\s*عيار\\s*${karat}`,
      'gi'
    );
    const match = pattern.exec(text);
    if (match && match[1]) {
      const buy = normalizeNumber(match[1]);
      if (buy !== null && buy > 0 && validatePrice(karat, buy)) {
        prices[karat] = buy;
      }
    } else if (!prices[karat] && (karat === 21 || karat === 24)) {
      // Keep parse error informative for required karats.
      errors.push(`Karat ${karat}: not found`);
    }
  }

  if (Object.keys(prices).length === 0) errors.push('no_prices_found');
  return { prices, errors };
}

function parseGoldBullionEG(html: string): { prices: Record<number, number>; errors: string[] } {
  const prices: Record<number, number> = {};
  const errors: string[] = [];

  const trMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
  for (const tr of trMatches) {
    const rowHtml = tr[0];
    const rowText = normalizeWhitespace(stripHtmlToText(rowHtml));

    for (const karat of KARATS) {
      const label = `جرام\\s*عيار\\s*${karat}`;
      const labelRe = new RegExp(label, 'i');
      if (!labelRe.test(rowText)) continue;

      // Extract data-val values within the row.
      const vals = [...rowHtml.matchAll(/data-val="([0-9.]+)"/gi)].map(m => normalizeNumber(m[1])).filter((v): v is number => v !== null);

      // In the original DOM parser, buy = first data-val, sell = second data-val.
      if (vals.length >= 2) {
        const buy = vals[0];
        if (validatePrice(karat, buy)) {
          prices[karat] = buy;
        }
      }
    }
  }

  if (Object.keys(prices).length === 0) errors.push('no_prices_found');
  return { prices, errors };
}

/**
 * Process a single source: fetch HTML (+ optional Jina fallback), parse via regex, validate.
 */
export async function processSource(source: string): Promise<SourcePriceResult> {
  const result: SourcePriceResult = {
    source,
    valid: false,
    stale: {},
    prices: {},
    errors: [],
    notes: [],
  };

  const url = SOURCE_URLS[source];
  if (!url) {
    result.errors.push(`Source ${source} has no configured URL`);
    return result;
  }

  const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.7',
    Referer: 'https://www.google.com/',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  try {
    const maxRetries = 2;
    let lastErr: string | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: commonHeaders,
          signal: AbortSignal.timeout(10000),
        });

        result.httpStatus = resp.status;
        if (!resp.ok) {
          lastErr = `HTTP ${resp.status}: ${resp.statusText}`;
          continue;
        }

        const fullHtml = await resp.text();
        result.contentLength = fullHtml.length;
        result.rawSnippet = fullHtml.substring(0, 1200);

        // Prefer parsing from HTML text; for suspected JS-rendered pages, try Jina.
        const tryJina = source === 'goldrate24' ? true : detectJsPage(fullHtml);
        if (tryJina) {
          try {
            const jinaUrl = `https://r.jina.ai/${url}`;
            const jinaResp = await fetch(jinaUrl, {
              headers: {
                ...commonHeaders,
                Accept: 'text/plain',
              },
              signal: AbortSignal.timeout(15000),
            });
            if (jinaResp.ok) {
              const jinaText = await jinaResp.text();
              result.method = 'jina';
              result.bodyTextSnippet = jinaText.substring(0, 1200);

              const parseText = normalizeWhitespace(jinaText);
              const parsed = (() => {
                switch (source) {
                  case 'banklive':
                    return parseBankLive(parseText);
                  case 'gold_era':
                    return parseGoldEra(parseText);
                  case 'dokangold':
                    return parseDokanGold(parseText);
                  case 'goldrate24':
                    return parseGoldRate24(parseText);
                  case 'goldbullioneg':
                    // Jina renderer won't preserve table structure reliably; parse from original HTML instead.
                    return parseGoldBullionEG(fullHtml);
                  default:
                    return { prices: {}, errors: ['no_parser'] };
                }
              })();

              result.prices = parsed.prices;
              if ('sells' in parsed && parsed.sells && Object.keys(parsed.sells).length > 0) {
                result.sells = parsed.sells as Record<number, number>;
              }
              result.errors.push(...(parsed.errors || []));
            }
          } catch (jinaErr) {
            // Fall back to HTML parsing below.
          }
        }

        // Always attempt HTML parsing (either first, or fallback if Jina yielded nothing).
        if (Object.keys(result.prices).length === 0) {
          const bodyText = stripHtmlToText(fullHtml);
          result.bodyTextSnippet = bodyText.substring(0, 1200);

          const parsed = (() => {
            switch (source) {
              case 'banklive':
                return parseBankLive(bodyText);
              case 'gold_era':
                return parseGoldEra(bodyText);
              case 'dokangold':
                return parseDokanGold(bodyText);
              case 'goldrate24':
                return parseGoldRate24(bodyText);
              case 'goldbullioneg':
                return parseGoldBullionEG(fullHtml);
              default:
                return { prices: {}, errors: [`No parser implemented for source: ${source}`] };
            }
          })();

          result.prices = parsed.prices;
          if ('sells' in parsed && parsed.sells && Object.keys(parsed.sells).length > 0) {
            result.sells = parsed.sells as Record<number, number>;
          }
          result.errors.push(...(parsed.errors || []));
          result.method = 'regex';
        }

        // Mark stale=false for any karat we found.
        for (const [k, _v] of Object.entries(result.prices)) {
          const karat = parseInt(k, 10);
          result.stale[karat] = false;
        }

        // Valid iff we have required karats.
        const has21 = 21 in result.prices;
        const has24 = 24 in result.prices;
        result.valid = has21 && has24;

        // Optional: mark missing optional karats as notes (not errors).
        if (!result.valid && Object.keys(result.prices).length > 0) {
          result.notes.push('Missing one of required karats: 21 or 24');
        }
        if (!(18 in result.prices)) result.notes.push('Missing 18k price (optional)');
        if (!(14 in result.prices)) result.notes.push('Missing 14k price (optional)');

        return result;
      } catch (attemptErr) {
        lastErr = attemptErr instanceof Error ? attemptErr.message : String(attemptErr);
      }

      // Small backoff between attempts.
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }

    result.errors.push(lastErr ? `Fetch failed after retries: ${lastErr}` : 'Fetch failed after retries');
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Fetch/parse error: ${msg}`);
    return result;
  }
}

