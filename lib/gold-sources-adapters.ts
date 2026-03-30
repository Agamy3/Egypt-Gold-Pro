/**
 * Gold Source Adapters
 * 
 * Fetch and parse prices from the 5 gold price sources
 */

import * as cheerio from 'cheerio';
import { toFloat, detectJsPage, validatePrice } from './gold-ingestion-utils';
import { Karat } from './gold-ingestion-config';
import { SOURCE_URLS, KARATS, ABS_MIN, ABS_MAX } from './gold-ingestion-config';

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
  regexMatches?: Array<{ karat: number; pattern: string; match: string; snippet?: string }>;
  method?: 'dom' | 'regex';
  methodTried?: string[];
  selectorHits?: Record<string, number>;
  parseError?: string;
  rowSamples?: Array<{ karat: number; text: string }>;
  numbersFoundSample?: Array<{ karat: number; numbers: number[] }>;
  allRowSamples?: string[];
  allRowNumbersSamples?: number[][];
  httpStatus?: number;
}

interface ParsedPrices {
  [karat: number]: { buy: number; sell?: number };
}

interface ParseDebugContext {
  methodTried: string[];
  selectorHits: Record<string, number>;
  regexMatches: Array<{ karat: number; pattern: string; match: string; snippet?: string }>;
  rowSamples?: Array<{ karat: number; text: string }>;
  numbersFoundSample?: Array<{ karat: number; numbers: number[] }>;
  allRowSamples?: string[];
  allRowNumbersSamples?: number[][];
}

/**
 * Normalize text for parsing (remove currency, spaces, etc.)
 */
function normalizeText(text: string): string {
  let s = text.trim();
  // Remove currency symbols
  s = s.replace(/ج\.?م\.?/g, '');
  s = s.replace(/ج/g, '');
  s = s.replace(/EGP/gi, '');
  s = s.replace(/£/g, '');
  s = s.replace(/\$/g, '');
  s = s.replace(/جنيه/g, '');
  s = s.replace(/LE\b/g, '');
  s = s.replace(/L\.E\./g, '');
  // Remove non-breaking spaces
  s = s.replace(/\u00A0/g, ' ');
  s = s.replace(/\u2009/g, ' ');
  // Remove commas and normalize whitespace
  s = s.replace(/,/g, '');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

/**
 * Normalize number string: remove commas, Arabic digits, currency symbols, percent signs
 */
function normalizeNumber(s: string): string {
  let result = s.trim();
  // Normalize Arabic digits
  result = result.replace(/٠/g, '0').replace(/١/g, '1').replace(/٢/g, '2').replace(/٣/g, '3').replace(/٤/g, '4').replace(/٥/g, '5').replace(/٦/g, '6').replace(/٧/g, '7').replace(/٨/g, '8').replace(/٩/g, '9');
  // Remove currency symbols
  result = result.replace(/ج\.?م\.?/g, '');
  result = result.replace(/ج/g, '');
  result = result.replace(/EGP/gi, '');
  result = result.replace(/£/g, '');
  result = result.replace(/\$/g, '');
  result = result.replace(/جنيه/g, '');
  result = result.replace(/LE\b/g, '');
  result = result.replace(/L\.E\./g, '');
  result = result.replace(/%/g, '');
  // Remove commas (but keep decimal point)
  result = result.replace(/,/g, '');
  // Remove non-breaking spaces
  result = result.replace(/\u00A0/g, '');
  result = result.replace(/\u2009/g, '');
  return result.trim();
}

/**
 * Parse BankLive HTML
 * Text-based regex parsing from body text
 */
function parseBankLive(html: string, ctx?: ParseDebugContext): ParsedPrices {
  const prices: ParsedPrices = {};
  const $ = cheerio.load(html);
  
  if (ctx) {
    ctx.selectorHits = ctx.selectorHits || {};
    ctx.selectorHits['banklive_table_rows'] = $('table tr, .table tr, tbody tr').length;
  }
  
  if (ctx && !ctx.rowSamples) ctx.rowSamples = [];
  if (ctx && !ctx.numbersFoundSample) ctx.numbersFoundSample = [];
  
  // Dump all row samples for debug (first 25 rows)
  if (ctx) {
    const trs = $('tr').toArray();
    const allRowSamples = trs
      .slice(0, 25)
      .map(tr => $(tr).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map(t => t.substring(0, 200));
    
    const allRowNumbersSamples = allRowSamples.map(t =>
      (t.match(/\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?/g) || []).slice(0, 10).map(n => {
        const cleaned = normalizeNumber(n);
        return parseFloat(cleaned);
      }).filter(n => !isNaN(n))
    );
    
    ctx.allRowSamples = allRowSamples;
    ctx.allRowNumbersSamples = allRowNumbersSamples;
  }
  
  // Get body text for regex parsing
  $('script, style, noscript, svg, iframe, header, nav, footer').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  
  // Parse using regex patterns: ذهب عيار 24 [buy] [sell]
  for (const karat of KARATS) {
    // Pattern: ذهب\s+عيار\s+24\s+([\d,.]+).*?\s+([\d,.]+)
    const pattern = new RegExp(`ذهب\\s+عيار\\s+${karat}\\s+([\\d,.]+).*?\\s+([\\d,.]+)`, 'i');
    const match = bodyText.match(pattern);
    
    if (match && match[1] && match[2]) {
      try {
        const buyStr = normalizeNumber(match[1]);
        const sellStr = normalizeNumber(match[2]);
        const buy = parseFloat(buyStr);
        const sell = parseFloat(sellStr);
        
        if (!isNaN(buy) && !isNaN(sell) && buy > 0 && sell > 0 && validatePrice(karat, buy)) {
          prices[karat] = { buy, sell };
          
          if (ctx) {
            ctx.selectorHits = ctx.selectorHits || {};
            ctx.selectorHits[`banklive_dom_k${karat}`] = 1;
            if (ctx.rowSamples && ctx.rowSamples.length < 8) {
              ctx.rowSamples.push({
                karat,
                text: match[0].substring(0, 200),
              });
            }
            if (ctx.numbersFoundSample && ctx.numbersFoundSample.length < 8) {
              ctx.numbersFoundSample.push({
                karat,
                numbers: [buy, sell],
              });
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }
  }
  
  if (Object.keys(prices).length > 0 && ctx) {
    ctx.selectorHits = ctx.selectorHits || {};
    ctx.selectorHits['banklive_dom_success'] = 1;
  }
  
  return prices;
}

/**
 * Parse GoldEra HTML
 * Text-based regex parsing from body text
 * Format: "عيار 24 6,749£ 6,691£" (typically sell then buy, or buy then sell)
 */
function parseGoldEra(html: string, ctx?: ParseDebugContext): ParsedPrices {
  const prices: ParsedPrices = {};
  const $ = cheerio.load(html);
  
  if (ctx && !ctx.rowSamples) ctx.rowSamples = [];
  if (ctx && !ctx.numbersFoundSample) ctx.numbersFoundSample = [];

  let debugMethodUsed: 'table_headers' | 'table_positional' | 'regex' | null = null;

  try {
    const tables = $('table');
    for (const el of tables.toArray()) {
      const table = $(el);
      const headerRow = table.find('tr').first();
      const headers = headerRow
        .find('th, td')
        .toArray()
        .map((h) => $(h).text().replace(/\s+/g, ' ').trim().toLowerCase());

      const sellIdx = headers.findIndex((h) => h.includes('sell') || h.includes('بيع'));
      const buyIdx = headers.findIndex((h) => h.includes('buy') || h.includes('شراء'));
      const rows = table.find('tr').toArray().slice(1);
      for (const rowEl of rows) {
        const cells = $(rowEl)
          .find('td, th')
          .toArray()
          .map((c) => $(c).text().replace(/\s+/g, ' ').trim());

        if (cells.length === 0) continue;
        const rowText = cells.join(' ');
        const karatMatch = rowText.match(/\b(24|22|21|18|14)\b/);
        if (!karatMatch?.[1]) continue;
        const karat = Number(karatMatch[1]) as (typeof KARATS)[number];

        let buy: number | null = null;
        let sell: number | null = null;

        // Preferred: header-based mapping.
        if (sellIdx !== -1 && buyIdx !== -1) {
          const sellText = cells[sellIdx] ?? '';
          const buyText = cells[buyIdx] ?? '';
          const s = parseFloat(normalizeNumber(sellText));
          const b = parseFloat(normalizeNumber(buyText));
          if (!isNaN(s) && !isNaN(b) && s > 0 && b > 0) {
            sell = s;
            buy = b;
            debugMethodUsed = debugMethodUsed ?? 'table_headers';
          }
        }

        // Fallback: positional mapping (karat, then two numeric columns). Enforce sell >= buy.
        if (buy === null || sell === null) {
          const numeric = cells
            .map((t) => parseFloat(normalizeNumber(t)))
            .filter((n) => !isNaN(n) && n > 0);
          if (numeric.length >= 2) {
            const a = numeric[0];
            const b = numeric[1];
            sell = Math.max(a, b);
            buy = Math.min(a, b);
            debugMethodUsed = debugMethodUsed ?? 'table_positional';
          }
        }

        if (buy !== null && sell !== null) {
          // Final safety: if we ever see buy > sell, swap.
          if (buy > sell) {
            const tmp = buy;
            buy = sell;
            sell = tmp;
          }

          if (validatePrice(karat, buy)) {
            prices[karat] = { buy, sell };
            if (ctx) {
              ctx.selectorHits = ctx.selectorHits || {};
              ctx.selectorHits[`gold_era_table_k${karat}`] = 1;
              if (ctx.rowSamples && ctx.rowSamples.length < 8) {
                ctx.rowSamples.push({ karat, text: rowText.substring(0, 200) });
              }
              if (ctx.numbersFoundSample && ctx.numbersFoundSample.length < 8) {
                ctx.numbersFoundSample.push({ karat, numbers: [sell, buy] });
              }
            }
          }
        }
      }

      if (Object.keys(prices).length > 0) break;
    }
  } catch (e) {
    // fall through to regex
  }
  
  // Get body text for regex parsing
  $('script, style, noscript, svg, iframe, header, nav, footer').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  
  // Parse using regex patterns: عيار {k} {num1}£{num2}£
  // Format from bodyTextSnippet: "عيار 246,749£6,691£"
  // Pattern: /عيار\s*{k}\s*([\d,]+)\s*£\s*([\d,]+)\s*£/
  // First number = SELL, second number = BUY
  for (const karat of KARATS) {
    // Pattern: عيار\s*${karat}\s*([\d,]+)\s*£\s*([\d,]+)\s*£
    const pattern = new RegExp(`عيار\\s*${karat}\\s*([\\d,]+)\\s*£\\s*([\\d,]+)\\s*£`, 'i');
    const match = bodyText.match(pattern);
    
    if (match && match[1] && match[2]) {
      try {
        const num1Str = normalizeNumber(match[1]);
        const num2Str = normalizeNumber(match[2]);
        const num1 = parseFloat(num1Str);
        const num2 = parseFloat(num2Str);
        
        if (!isNaN(num1) && !isNaN(num2) && num1 > 0 && num2 > 0) {
          // GoldEra table shows: Sell then Buy, but content extraction can reorder.
          // Enforce sell >= buy to avoid flipped columns.
          const sell = Math.max(num1, num2);
          const buy = Math.min(num1, num2);
          
          if (validatePrice(karat, buy)) {
            prices[karat] = { buy, sell };
            debugMethodUsed = debugMethodUsed ?? 'regex';
            
            if (ctx) {
              ctx.selectorHits = ctx.selectorHits || {};
              ctx.selectorHits[`gold_era_k${karat}`] = 1;
              if (ctx.regexMatches && ctx.regexMatches.length < 10) {
                ctx.regexMatches.push({
                  karat,
                  pattern: pattern.toString(),
                  match: match[0].substring(0, 120),
                  snippet: match[0].substring(0, 120),
                });
              }
              if (ctx.rowSamples && ctx.rowSamples.length < 8) {
                ctx.rowSamples.push({
                  karat,
                  text: match[0].substring(0, 200),
                });
              }
              if (ctx.numbersFoundSample && ctx.numbersFoundSample.length < 8) {
                ctx.numbersFoundSample.push({
                  karat,
                  numbers: [num1, num2],
                });
              }
            }
          }
        }
      } catch (e) {
        // Continue to next karat
      }
    }
  }

  if (Object.keys(prices).length > 0) {
    console.log('[GoldEra] parsed', {
      method: debugMethodUsed,
      k24: prices[24] ?? null,
      k21: prices[21] ?? null,
      k18: prices[18] ?? null,
      k14: prices[14] ?? null,
    });
  }
  
  if (Object.keys(prices).length > 0 && ctx) {
    ctx.selectorHits = ctx.selectorHits || {};
    ctx.selectorHits['gold_era_dom_success'] = 1;
  }
  
  return prices;
}

/**
 * Parse DokanGold HTML
 * Text-based regex parsing from body text
 * Format: "عيار 24 24 6645.75 6674.25" (buy then sell)
 * Fallback for 14k: "شراء/بيع" patterns
 */
function parseDokanGold(html: string, ctx?: ParseDebugContext): ParsedPrices {
  const prices: ParsedPrices = {};
  const $ = cheerio.load(html);
  
  if (ctx) {
    ctx.selectorHits = ctx.selectorHits || {};
    ctx.selectorHits['dokangold_table_rows'] = $('table tr, .table tr, tbody tr').length;
  }
  
  if (ctx && !ctx.rowSamples) ctx.rowSamples = [];
  if (ctx && !ctx.numbersFoundSample) ctx.numbersFoundSample = [];
  
  // Get body text for regex parsing
  $('script, style, noscript, svg, iframe, header, nav, footer').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  
  // Parse "عيارات أخرى" rows: عيار 24 24 [buy] [sell]
  for (const karat of KARATS) {
    // Pattern: عيار\s+24\s+24\s*([\d,.]+)\s*([\d,.]+)
    const pattern = new RegExp(`عيار\\s+${karat}\\s+${karat}\\s*([\\d,.]+)\\s*([\\d,.]+)`, 'i');
    const match = bodyText.match(pattern);
    
    if (match && match[1] && match[2]) {
      try {
        const buyStr = normalizeNumber(match[1]);
        const sellStr = normalizeNumber(match[2]);
        const buy = parseFloat(buyStr);
        const sell = parseFloat(sellStr);
        
        if (!isNaN(buy) && !isNaN(sell) && buy > 0 && sell > 0 && validatePrice(karat, buy)) {
          prices[karat] = { buy, sell };
          
          if (ctx) {
            ctx.selectorHits = ctx.selectorHits || {};
            ctx.selectorHits[`dokangold_dom_k${karat}`] = 1;
            if (ctx.rowSamples && ctx.rowSamples.length < 8) {
              ctx.rowSamples.push({
                karat,
                text: match[0].substring(0, 200),
              });
            }
            if (ctx.numbersFoundSample && ctx.numbersFoundSample.length < 8) {
              ctx.numbersFoundSample.push({
                karat,
                numbers: [buy, sell],
              });
            }
          }
        }
      } catch (e) {
        // Continue
      }
    }
  }
  
  // Fallback for 14k: parse header section "شراء [num] ... بيع [num]"
  if (!prices[14]) {
    const buyPattern = new RegExp(`شراء\\s*([\\d,.]+)`, 'i');
    const sellPattern = new RegExp(`بيع\\s*([\\d,.]+)`, 'i');
    const buyMatch = bodyText.match(buyPattern);
    const sellMatch = bodyText.match(sellPattern);
    
    if (buyMatch && buyMatch[1]) {
      try {
        const buyStr = normalizeNumber(buyMatch[1]);
        const buy = parseFloat(buyStr);
        
        if (!isNaN(buy) && buy > 0 && validatePrice(14, buy)) {
          let sell: number | undefined;
          if (sellMatch && sellMatch[1]) {
            const sellStr = normalizeNumber(sellMatch[1]);
            sell = parseFloat(sellStr);
          }
          
          prices[14] = { buy, sell };
          
          if (ctx && ctx.rowSamples && ctx.rowSamples.length < 8) {
            ctx.rowSamples.push({
              karat: 14,
              text: `شراء/بيع fallback: ${buyMatch[0].substring(0, 200)}`,
            });
          }
        }
      } catch (e) {
        // Continue
      }
    }
  }
  
  if (Object.keys(prices).length > 0 && ctx) {
    ctx.selectorHits = ctx.selectorHits || {};
    ctx.selectorHits['dokangold_dom_success'] = 1;
  }
  
  return prices;
}

/**
 * Parse LivePriceOfGold HTML
 * Extract BUY/SELL from: "سعر الذهب بالجرام عيار 24 <buy> <sell>"
 * First number after karat = BUY, second = SELL
 */
function parseLivePriceOfGold(html: string, ctx?: ParseDebugContext): ParsedPrices {
  const prices: ParsedPrices = {};
  const $ = cheerio.load(html);
  
  if (ctx) {
    if (!ctx.selectorHits) ctx.selectorHits = {};
    if (!ctx.regexMatches) ctx.regexMatches = [];
  }
  
  // Get body text (flattened)
  $('script, style, noscript, svg, iframe, header, nav, footer').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  
  // Parse pattern: "سعر الذهب بالجرام عيار 24 <buy> <sell>"
  // Pattern: /سعر\s*الذهب\s*بالجرام\s*عيار\s*{k}\s*([0-9]+(?:\.[0-9]+)?)\s*([0-9]+(?:\.[0-9]+)?)/i
  // First number = BUY, second = SELL
  for (const karat of KARATS) {
    // Pattern: سعر\s*الذهب\s*بالجرام\s*عيار\s*{k}\s*([0-9]+(?:\.[0-9]+)?)\s*([0-9]+(?:\.[0-9]+)?)
    const pattern = new RegExp(`سعر\\s*الذهب\\s*بالجرام\\s*عيار\\s*${karat}\\s+([0-9]+(?:\\.[0-9]+)?)\\s+([0-9]+(?:\\.[0-9]+)?)`, 'i');
    const match = bodyText.match(pattern);
    
    if (match && match[1] && match[2]) {
      try {
        const buyStr = normalizeNumber(match[1]);
        const sellStr = normalizeNumber(match[2]);
        const buy = parseFloat(buyStr);
        const sell = parseFloat(sellStr);
        
        if (!isNaN(buy) && !isNaN(sell) && buy > 0 && sell > 0) {
          if (validatePrice(karat, buy)) {
            prices[karat] = { buy, sell };
            
            if (ctx) {
              ctx.selectorHits = ctx.selectorHits || {};
              ctx.selectorHits[`livepriceofgold_k${karat}`] = 1;
              if (ctx.regexMatches && ctx.regexMatches.length < 10) {
                ctx.regexMatches.push({
                  karat,
                  pattern: pattern.toString(),
                  match: match[0].substring(0, 120),
                  snippet: match[0].substring(0, 120),
                });
              }
            }
          }
        }
      } catch (e) {
        // Continue to next karat
      }
    }
  }
  
  // Optionally parse USD/EGP: "الدولار الأمريكي / الجنيه المصري <buy> <sell>"
  if (ctx) {
    const fxPattern = /الدولار الأمريكي\s*\/\s*الجنيه المصري\s+(\d+\.?\d*)\s+(\d+\.?\d*)/i;
    const fxMatch = bodyText.match(fxPattern);
    if (fxMatch && fxMatch[1] && fxMatch[2]) {
      try {
        const fxBuy = parseFloat(normalizeNumber(fxMatch[1]));
        const fxSell = parseFloat(normalizeNumber(fxMatch[2]));
        if (!isNaN(fxBuy) && !isNaN(fxSell) && fxBuy > 0 && fxSell > 0) {
          // Store in context as fxHint (don't override main FX provider)
          (ctx as any).fxHint = { buy: fxBuy, sell: fxSell };
        }
      } catch (e) {
        // Ignore FX parse errors
      }
    }
  }
  
  return prices;
}

/**
 * Parse GoldRate24 HTML
 * Extract prices from Jina-rendered text
 * Patterns: "6,655.60 جنيه مصري/غرام عيار 24" or "4,991.70 للغرام عيار 18"
 */
function parseGoldRate24(html: string, ctx?: ParseDebugContext): ParsedPrices {
  const prices: ParsedPrices = {};
  
  if (ctx) {
    if (!ctx.selectorHits) ctx.selectorHits = {};
    if (!ctx.regexMatches) ctx.regexMatches = [];
  }
  
  // Get text from bodyTextSnippet first, then fallback to parsed HTML
  let text = '';
  if (ctx && (ctx as any).bodyTextSnippet) {
    text = (ctx as any).bodyTextSnippet.replace(/\s+/g, ' ').trim();
  } else {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, iframe, header, nav, footer').remove();
    text = $('body').text().replace(/\s+/g, ' ').trim();
  }
  
  // If still no text, try rawHtmlSnippet from context
  if (!text && ctx && (ctx as any).rawHtmlSnippet) {
    text = (ctx as any).rawHtmlSnippet.replace(/\s+/g, ' ').trim();
  }
  
  // Parse using regex: capture number then karat
  // Pattern: /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:جنيه\s*مصري\/غرام)?\s*عيار\s*{k}/gi
  for (const karat of KARATS) {
    // Pattern matches: "6,655.60 جنيه مصري/غرام عيار 24" or "4,991.70 للغرام عيار 18"
    const pattern = new RegExp(`([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?)\\s*(?:جنيه\\s*مصري\\/غرام|للغرام)?\\s*عيار\\s*${karat}`, 'gi');
    const match = text.match(pattern);
    
    if (match && match[1]) {
      try {
        const buyStr = normalizeNumber(match[1]);
        const buy = parseFloat(buyStr);
        
        if (!isNaN(buy) && buy > 0) {
          if (validatePrice(karat, buy)) {
            prices[karat] = { buy, sell: undefined };
            
            if (ctx) {
              ctx.selectorHits = ctx.selectorHits || {};
              ctx.selectorHits[`goldrate24_k${karat}`] = 1;
              if (ctx.regexMatches && ctx.regexMatches.length < 10) {
                ctx.regexMatches.push({
                  karat,
                  pattern: pattern.toString(),
                  match: match[0].substring(0, 120),
                  snippet: match[0].substring(0, 120),
                });
              }
            }
          }
        }
      } catch (e) {
        // Continue to next karat
      }
    } else if (ctx && (karat === 21 || karat === 24)) {
      // Only set parseError for required karats (21/24) if missing
      if (!(ctx as any).parseError) {
        (ctx as any).parseError = `Karat ${karat}: not found`;
      } else {
        (ctx as any).parseError += `, Karat ${karat}: not found`;
      }
    }
  }
  
  return prices;
}

/**
 * Parse GoldBullionEG HTML
 * Extract prices from table rows using DOM parsing with data-val attributes
 * Table structure: <tr><td>جرام عيار 24</td><td class="num" data-val="6726">6726</td><td class="num td-arrow" data-val="6703">6703</td></tr>
 */
function parseGoldBullionEG(html: string, ctx?: ParseDebugContext): ParsedPrices {
  const prices: ParsedPrices = {};
  
  if (ctx) {
    if (!ctx.selectorHits) ctx.selectorHits = {};
    if (!ctx.regexMatches) ctx.regexMatches = [];
    if (!ctx.methodTried) ctx.methodTried = [];
  }
  
  const $ = cheerio.load(html);
  
  // Find all table rows
  const rows = $('tr').toArray();
  if (ctx) {
    ctx.selectorHits = ctx.selectorHits || {};
    ctx.selectorHits['goldbullioneg_table_rows'] = rows.length;
    ctx.methodTried = ctx.methodTried || [];
    if (!ctx.methodTried.includes('dom')) {
      ctx.methodTried.push('dom');
    }
  }
  
  let rowHits = 0;
  
  // Map Arabic labels to karats and special fields
  const karatPatterns: Record<number, RegExp> = {
    24: /جرام\s*عيار\s*24/i,
    21: /جرام\s*عيار\s*21/i,
    18: /جرام\s*عيار\s*18/i,
    14: /جرام\s*عيار\s*14/i,
  };
  
  const fxPattern = /الدولار/i;
  const ouncePattern = /الأونصة/i;
  
  // Store FX and ounce if found
  let fxBuy: number | null = null;
  let fxSell: number | null = null;
  let ounceUsd: number | null = null;
  
  for (const row of rows) {
    const $row = $(row);
    const cells = $row.find('td').toArray();
    
    if (cells.length < 3) continue;
    
    const firstCellText = $(cells[0]).text().trim();
    const numCells = $row.find('td.num').toArray();
    
    if (numCells.length < 2) continue;
    
    const buyCell = $(numCells[0]);
    const sellCell = $(numCells[1]);
    
    // Extract values from data-val attribute, fallback to text
    const getValue = (cell: cheerio.Cheerio<any>): number | null => {
      const dataVal = cell.attr('data-val');
      if (dataVal) {
        const val = parseFloat(dataVal.replace(/,/g, ''));
        if (!isNaN(val) && isFinite(val)) return val;
      }
      const text = normalizeNumber(cell.text());
      const val = parseFloat(text);
      return (!isNaN(val) && isFinite(val)) ? val : null;
    };
    
    const buy = getValue(buyCell);
    const sell = getValue(sellCell);
    
    if (buy === null) continue;
    
    // Match karats
    for (const [karat, pattern] of Object.entries(karatPatterns)) {
      const k = parseInt(karat) as Karat;
      if (pattern.test(firstCellText)) {
        if (buy !== null && validatePrice(k, buy)) {
          prices[k] = { buy, sell: sell !== null ? sell : undefined };
          rowHits++;
          if (ctx) {
            ctx.selectorHits[`goldbullioneg_k${k}`] = 1;
          }
        }
        break;
      }
    }
    
    // Match FX (USD/EGP)
    if (fxPattern.test(firstCellText) && buy !== null) {
      fxBuy = buy;
      fxSell = sell;
      rowHits++;
    }
    
    // Match ounce USD
    if (ouncePattern.test(firstCellText) && buy !== null) {
      ounceUsd = buy;
      rowHits++;
    }
  }
  
  if (ctx) {
    ctx.selectorHits['goldbullioneg_row_hits'] = rowHits;
    
    // Store FX and ounce in context for downstream use
    if (fxBuy !== null) {
      (ctx as any).fxBuy = fxBuy;
      (ctx as any).fxSell = fxSell;
    }
    if (ounceUsd !== null) {
      (ctx as any).ounceUsd = ounceUsd;
    }
  }
  
  // If DOM parsing found nothing, try regex fallback
  if (Object.keys(prices).length === 0 && ctx) {
    if (!ctx.methodTried.includes('regex')) {
      ctx.methodTried.push('regex');
    }
    
    const bodyText = $('body').text();
    
    for (const karat of KARATS) {
      const pattern = new RegExp(
        `جرام\\s*عيار\\s*${karat}[\\s\\S]*?data-val="([0-9.]+)"[\\s\\S]*?data-val="([0-9.]+)"`,
        'gi'
      );
      const match = bodyText.match(pattern);
      
      if (match && match[1] && match[2]) {
        try {
          const buy = parseFloat(match[1].replace(/,/g, ''));
          const sell = parseFloat(match[2].replace(/,/g, ''));
          
          if (!isNaN(buy) && buy > 0 && validatePrice(karat, buy)) {
            prices[karat] = { buy, sell: !isNaN(sell) && sell > 0 ? sell : undefined };
            
            if (ctx.regexMatches && ctx.regexMatches.length < 10) {
              ctx.regexMatches.push({
                karat,
                pattern: pattern.toString(),
                match: match[0].substring(0, 120),
                snippet: match[0].substring(0, 120),
              });
            }
          }
        } catch (e) {
          // Continue
        }
      }
    }
  }
  
  return prices;
}

/**
 * Process a single source: fetch, parse, validate
 */
export async function processSource(source: string): Promise<SourcePriceResult> {
  const result: SourcePriceResult = {
    source,
    valid: false,
    stale: {},
    prices: {},
    sells: {},
    errors: [],
    notes: [],
  };

  const url = SOURCE_URLS[source];
  if (!url) {
    result.errors.push(`Source ${source} has no configured URL`);
    return result;
  }

  try {
    // Fetch HTML with retry logic (for livepriceofgold and goldrate24)
    let response: Response | null = null;
    let fetchError: Error | null = null;
    const maxRetries = (source === 'goldrate24') ? 2 : 1;
    const timeoutMs = (source === 'goldrate24') ? 15000 : 10000;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': 'https://www.google.com/',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        break; // Success, exit retry loop
      } catch (error) {
        fetchError = error instanceof Error ? error : new Error('Unknown fetch error');
        if (attempt === maxRetries - 1) {
          // Last attempt failed, try Jina fallback for livepriceofgold and goldrate24
          if (source === 'goldrate24') {
            try {
              const jinaUrl = `https://r.jina.ai/${url}`;
              const jinaResponse = await fetch(jinaUrl, {
                headers: {
                  'Accept': 'text/plain',
                  'X-Return-Format': 'text',
                },
                signal: AbortSignal.timeout(15000),
              });
              
              if (jinaResponse.ok) {
                const jinaText = await jinaResponse.text();
                result.httpStatus = jinaResponse.status;
                result.method = 'dom' as any; // Jina fallback uses DOM parsing
                result.notes.push('jina-fallback');
                
                // Parse from Jina-rendered text
                const $ = cheerio.load(jinaText);
                $('script, style, noscript, svg, iframe, header, nav, footer').remove();
                const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
                result.bodyTextSnippet = bodyText.substring(0, 1200);
                result.contentLength = jinaText.length;
                result.rawSnippet = jinaText.substring(0, 1200);
                
                // Use source-specific parser with Jina text
                let parsedPrices: ParsedPrices = {};
                const methodTried: string[] = ['jina'];
                const selectorHits: Record<string, number> = {};
                const regexMatches: Array<{ karat: number; pattern: string; match: string; snippet?: string }> = [];
                
                // Declare parseCtx in broader scope for later use
                let parseCtx: any = undefined;
                
                try {
                  if (source === 'goldrate24') {
                    parseCtx = {
                      methodTried: [...methodTried, 'jina', 'regex'],
                      selectorHits,
                      regexMatches,
                      bodyTextSnippet: result.bodyTextSnippet,
                      rawHtmlSnippet: result.rawSnippet,
                    };
                    parsedPrices = parseGoldRate24(jinaText, parseCtx);
                  }
                  
                  // Extract buy prices and validate
                  for (const karat of KARATS) {
                    if (karat in parsedPrices) {
                      const priceData = parsedPrices[karat];
                      if (priceData.buy && validatePrice(karat, priceData.buy)) {
                        result.prices[karat] = priceData.buy;
                        result.stale[karat] = false;
                      }
                    }
                  }
                  
                  // For goldrate24, check minimum viable (21 + 24)
                  if (source === 'goldrate24') {
                    const has21 = 21 in result.prices;
                    const has24 = 24 in result.prices;
                    if (has21 && has24) {
                      result.valid = true;
                    } else {
                      result.errors.push('no_prices_found');
                      if (source === 'goldrate24' && parseCtx && (parseCtx as any).parseError) {
                        result.parseError = (parseCtx as any).parseError;
                      }
                    }
                  } else if (Object.keys(result.prices).length > 0) {
                    result.valid = true;
                  }
                } catch (parseError) {
                  result.errors.push(`Jina parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);
                }
                
                return result;
              }
            } catch (jinaError) {
              // Jina also failed, return original error
            }
          }
          result.errors.push(`Fetch failed after ${maxRetries} attempts: ${fetchError.message}`);
          return result;
        }
        // Wait a bit before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }

    if (!response) {
      result.errors.push(`Fetch failed: ${fetchError?.message || 'Unknown error'}`);
      return result;
    }

    result.httpStatus = response.status;

    if (!response.ok) {
      result.errors.push(`HTTP ${response.status}: ${response.statusText}`);
      
      // Try Jina fallback for livepriceofgold and goldrate24 on non-OK response
      if ((source === 'goldrate24') && response.status >= 400) {
        try {
          const jinaUrl = `https://r.jina.ai/${url}`;
          const jinaResponse = await fetch(jinaUrl, {
            headers: {
              'Accept': 'text/plain',
              'X-Return-Format': 'text',
            },
            signal: AbortSignal.timeout(15000),
          });
          
          if (jinaResponse.ok) {
            const jinaText = await jinaResponse.text();
            result.httpStatus = jinaResponse.status;
                result.method = 'dom' as any; // Jina fallback uses DOM parsing
            result.notes.push('jina-fallback');
            
            const $ = cheerio.load(jinaText);
            $('script, style, noscript, svg, iframe, header, nav, footer').remove();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            result.bodyTextSnippet = bodyText.substring(0, 1200);
            result.contentLength = jinaText.length;
            result.rawSnippet = jinaText.substring(0, 1200);
            
            let parsedPrices: ParsedPrices = {};
            const methodTriedJina: string[] = ['jina', 'regex'];
            const selectorHitsJina: Record<string, number> = {};
            const regexMatchesJina: Array<{ karat: number; pattern: string; match: string; snippet?: string }> = [];
            
            // Declare parseCtx in broader scope for later use
            let parseCtx: any = undefined;
            
            try {
              if (source === 'goldrate24') {
                parseCtx = {
                  methodTried: methodTriedJina,
                  selectorHits: selectorHitsJina,
                  regexMatches: regexMatchesJina,
                  bodyTextSnippet: result.bodyTextSnippet,
                  rawHtmlSnippet: result.rawSnippet,
                };
                parsedPrices = parseGoldRate24(jinaText, parseCtx);
              }
              
              for (const karat of KARATS) {
                if (karat in parsedPrices) {
                  const priceData = parsedPrices[karat];
                  if (priceData.buy && validatePrice(karat, priceData.buy)) {
                    result.prices[karat] = priceData.buy;
                    result.stale[karat] = false;
                  }
                }
              }
              
              // For goldrate24, check minimum viable (21 + 24)
              if (source === 'goldrate24') {
                const has21 = 21 in result.prices;
                const has24 = 24 in result.prices;
                if (has21 && has24) {
                  result.valid = true;
                } else {
                  result.errors.push('no_prices_found');
                  if (source === 'goldrate24' && (parseCtx as any)?.parseError) {
                    result.parseError = (parseCtx as any).parseError;
                  }
                }
              } else if (Object.keys(result.prices).length > 0) {
                result.valid = true;
              }
            } catch (parseError) {
              result.errors.push(`Jina parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);
            }
            
            return result;
          }
        } catch (jinaError) {
          // Jina fallback failed, continue with original error
        }
      }
      
      return result;
    }

    // Read FULL HTML body (never truncated before parsing)
    const fullHtml = await response.text();
    
    // Store content length (full HTML)
    result.contentLength = fullHtml.length;
    
    // Store snippet for debug only (1200 chars)
    result.rawSnippet = fullHtml.substring(0, 1200);

    // Declare parsing variables early for use in Jina fallback block
    let parsedPrices: ParsedPrices;
    const methodTried: string[] = [];
    const selectorHits: Record<string, number> = {};
    const regexMatches: Array<{ karat: number; pattern: string; match: string; snippet?: string }> = [];
    let finalMethod: 'dom' | 'regex' | null = null;

    // Check for JS/placeholder page (use FULL HTML)
    // For goldrate24, try Jina fallback if JS-rendered
    if (detectJsPage(fullHtml)) {
      if (source === 'goldrate24') {
        // Try Jina fallback for JS-rendered goldrate24
        try {
          const jinaUrl = `https://r.jina.ai/${url}`;
          const jinaResponse = await fetch(jinaUrl, {
            headers: {
              'Accept': 'text/plain',
              'X-Return-Format': 'text',
            },
            signal: AbortSignal.timeout(15000),
          });
          
          if (jinaResponse.ok) {
            const jinaText = await jinaResponse.text();
            result.httpStatus = jinaResponse.status;
                result.method = 'dom' as any; // Jina fallback uses DOM parsing
            result.notes.push('jina-fallback');
            
            const $ = cheerio.load(jinaText);
            $('script, style, noscript, svg, iframe, header, nav, footer').remove();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            result.bodyTextSnippet = bodyText.substring(0, 1200);
            result.contentLength = jinaText.length;
            result.rawSnippet = jinaText.substring(0, 1200);
            
            // Parse using goldrate24 parser
            try {
              parsedPrices = parseGoldRate24(jinaText, { methodTried, selectorHits, regexMatches });
              finalMethod = 'regex';
              
              // Extract buy prices and validate
              for (const karat of KARATS) {
                if (karat in parsedPrices) {
                  const priceData = parsedPrices[karat];
                  if (priceData.buy && validatePrice(karat, priceData.buy)) {
                    result.prices[karat] = priceData.buy;
                    result.stale[karat] = false;
                  }
                }
              }
              
              if (Object.keys(result.prices).length > 0) {
                result.valid = true;
              } else {
                // No prices found, add debug info
                result.errors.push('no_prices_found');
                if (result.bodyTextSnippet) {
                  result.notes.push(`bodyTextSnippet preview: ${result.bodyTextSnippet.substring(0, 400)}`);
                }
              }
            } catch (parseError) {
              result.errors.push(`Jina parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);
              if (result.bodyTextSnippet) {
                result.notes.push(`bodyTextSnippet preview: ${result.bodyTextSnippet.substring(0, 400)}`);
              }
            }
            
            return result;
          }
        } catch (jinaError) {
          // Jina fallback failed, continue with original error
        }
      }
      result.errors.push('Likely JS-rendered page: insufficient HTML');
      return result;
    }

    // Extract body text for debug (exclude script/style/nav)
    const $ = cheerio.load(fullHtml);
    $('script, style, noscript, svg, iframe, header, nav, footer').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    result.bodyTextSnippet = bodyText.substring(0, 1200);

    // Parse prices using source-specific parser (use FULL HTML, never truncated)
    // Note: parsedPrices, methodTried, selectorHits, regexMatches, and finalMethod are declared earlier for Jina fallback
    let parseError: string | null = null;

    try {
      switch (source) {
        case 'banklive':
          methodTried.push('regex');
          parsedPrices = parseBankLive(fullHtml, { methodTried, selectorHits, regexMatches });
          finalMethod = 'regex';
          break;
        case 'gold_era':
          methodTried.push('regex');
          parsedPrices = parseGoldEra(fullHtml, { methodTried, selectorHits, regexMatches });
          finalMethod = 'regex';
          break;
        case 'dokangold':
          methodTried.push('regex');
          parsedPrices = parseDokanGold(fullHtml, { methodTried, selectorHits, regexMatches });
          finalMethod = 'regex';
          break;
        case 'livepriceofgold':
          methodTried.push('regex');
          parsedPrices = parseLivePriceOfGold(fullHtml, { methodTried, selectorHits, regexMatches });
          finalMethod = 'regex';
          break;
        case 'goldrate24':
          methodTried.push('regex');
          parsedPrices = parseGoldRate24(fullHtml, { methodTried, selectorHits, regexMatches });
          finalMethod = 'regex';
          break;
        case 'goldbullioneg':
          methodTried.push('dom');
          parsedPrices = parseGoldBullionEG(fullHtml, { methodTried, selectorHits, regexMatches });
          finalMethod = 'dom';
          break;
        default:
          parsedPrices = {};
          result.errors.push(`No parser implemented for source: ${source}`);
          return result;
      }

      // Extract buy and sell prices and validate (collect all results, don't throw per-karat)
      for (const karat of KARATS) {
        if (karat in parsedPrices) {
          const priceData = parsedPrices[karat];
          if (priceData.buy && validatePrice(karat, priceData.buy)) {
            result.prices[karat] = priceData.buy;
            if (priceData.sell !== undefined && priceData.sell !== null) {
              if (!result.sells) result.sells = {};
              result.sells[karat] = priceData.sell;
            }
            result.stale[karat] = false;
          } else {
            const errorMsg = `Karat ${karat}: invalid buy price ${priceData.buy}`;
            result.errors.push(errorMsg);
            if (!parseError) parseError = errorMsg;
          }
        } else {
          result.stale[karat] = false;
        }
      }
      
      // After scanning all karats, if no prices found at all, set parseError
      if (Object.keys(result.prices).length === 0 && !parseError) {
        parseError = 'no_prices_found';
      }

      result.method = finalMethod || undefined;
      result.methodTried = methodTried;
      result.selectorHits = Object.keys(selectorHits).length > 0 ? selectorHits : undefined;
      if (regexMatches.length > 0) {
        result.regexMatches = regexMatches;
      }
      if (parseError) {
        result.parseError = parseError;
      }

      // Validate price ordering (soft warning)
      const priceList = KARATS.filter(k => k in result.prices).map(k => ({ karat: k, price: result.prices[k] }));
      for (let i = 1; i < priceList.length; i++) {
        if (priceList[i].price > priceList[i - 1].price) {
          result.notes.push(`Price ordering warning: ${priceList[i].karat}K (${priceList[i].price}) > ${priceList[i - 1].karat}K (${priceList[i - 1].price})`);
        }
      }

      // Accept partial success: 21 and 24 are minimum viable, 18/14 are optional
      const has21 = 21 in result.prices;
      const has24 = 24 in result.prices;
      result.valid = has21 && has24; // Minimum viable: must have both 21 and 24
      
      // Add warnings for missing 18/14 (not errors)
      if (!(18 in result.prices)) {
        result.notes.push('Missing 18k price (optional)');
      }
      if (!(14 in result.prices)) {
        result.notes.push('Missing 14k price (optional)');
      }
    } catch (e) {
      result.errors.push(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      result.errors.push('Timeout after 10s');
    } else {
      result.errors.push(`Fetch error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
