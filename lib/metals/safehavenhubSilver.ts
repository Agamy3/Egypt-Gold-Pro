import 'server-only';

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export type SafeHavenSilverRow = {
  karat: 999 | 925 | 900 | 800;
  buyPrice: number;
  sellPrice: number;
  changeValue: number | null;
  changePct: number | null; // percent, e.g. 1.23 means 1.23%
};

export type SafeHavenSilverScrapeResult =
  | {
      ok: true;
      source: 'safehavenhub';
      pageUrl: string;
      pageUpdatedAtIso: string | null;
      scrapedAtIso: string;
      rows: SafeHavenSilverRow[];
    }
  | { ok: false; error: string; pageUrl: string; scrapedAtIso: string };

function asNumFromText(text: string): number | null {
  const cleaned = text
    .replace(/[^\d.,+\-]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

function normalizeArabicDigits(s: string): string {
  // Arabic-Indic digits: ٠١٢٣٤٥٦٧٨٩ and Eastern Arabic-Indic: ۰۱۲۳۴۵۶۷۸۹
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  return s.replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}

function parseKarat(s: string): 999 | 925 | 900 | 800 | null {
  const t = normalizeArabicDigits(s).replace(/[^\d]/g, '');
  if (t === '999') return 999;
  if (t === '925') return 925;
  if (t === '900') return 900;
  if (t === '800') return 800;
  return null;
}

function parsePageUpdatedAt($: cheerio.CheerioAPI): string | null {
  // SafeHavenHub uses Arabic: "آخر تحديث: 3:35 ص، 2 فبراير 2026"
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const arabic = bodyText.match(/آخر\s*تحديث\s*:\s*([0-9٠-٩۰-۹]+):([0-9٠-٩۰-۹]{2})\s*(ص|م)\s*[،,]\s*([0-9٠-٩۰-۹]{1,2})\s+([^\s]+)\s+([0-9٠-٩۰-۹]{4})/);
  if (arabic) {
    const hour = Number(normalizeArabicDigits(arabic[1]));
    const minute = Number(normalizeArabicDigits(arabic[2]));
    const ampm = arabic[3];
    const day = Number(normalizeArabicDigits(arabic[4]));
    const monthName = arabic[5];
    const year = Number(normalizeArabicDigits(arabic[6]));
    const monthMap: Record<string, number> = {
      'يناير': 1,
      'فبراير': 2,
      'مارس': 3,
      'أبريل': 4,
      'ابريل': 4,
      'مايو': 5,
      'يونيو': 6,
      'يوليو': 7,
      'أغسطس': 8,
      'اغسطس': 8,
      'سبتمبر': 9,
      'أكتوبر': 10,
      'اكتوبر': 10,
      'نوفمبر': 11,
      'ديسمبر': 12,
    };
    const month = monthMap[monthName] ?? null;
    if (!month || !isFinite(hour) || !isFinite(minute) || !isFinite(day) || !isFinite(year)) return null;
    let h24 = hour % 12;
    if (ampm === 'م') h24 += 12;

    // NOTE: We intentionally do NOT use this value for staleness calculations (we use scraped_at),
    // because site timestamps are local-time and DST varies; we keep it for display only.
    const approxUtcMs = Date.UTC(year, month - 1, day, h24, minute, 0, 0);
    return new Date(approxUtcMs).toISOString();
  }

  return null;
}

export async function scrapeEgyptLocalSilverSafeHaven(): Promise<SafeHavenSilverScrapeResult> {
  const pageUrl =
    'https://safehavenhub.com/pages/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8-%D9%88%D8%A7%D9%84%D9%81%D8%B6%D8%A9';
  const scrapedAtIso = new Date().toISOString();

  try {
    const res = await fetch(pageUrl, {
      cache: 'no-store',
      headers: { 'User-Agent': 'egyptgold-pro/1.0 (+vercel)' },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, pageUrl, scrapedAtIso };
    const html = await res.text();
    const $ = cheerio.load(html);

    // SafeHavenHub uses a dedicated table class for metal prices.
    const picked = $('table.metal-prices-table').first();
    if (!picked || picked.length === 0) return { ok: false, error: 'Silver table not found', pageUrl, scrapedAtIso };

    const rows: SafeHavenSilverRow[] = [];
    picked
      .find('tr')
      .each((_i, tr) => {
        const cells = $(tr).find('th,td').toArray().map((c) => $(c).text().trim());
        if (cells.length < 3) return;

        const k = parseKarat(cells[0] ?? '');
        if (!k) return;

        // Ignore non-karat rows like "الأوقية ($)".
        const firstCellText = normalizeArabicDigits(String(cells[0] ?? ''));
        if (firstCellText.includes('الأوقية')) return;

        const sell = asNumFromText(normalizeArabicDigits(cells[1] ?? ''));
        const buy = asNumFromText(normalizeArabicDigits(cells[2] ?? ''));
        if (buy == null || sell == null) return;

        const changeValue = cells[3] != null ? asNumFromText(normalizeArabicDigits(cells[3])) : null;
        // Percent sometimes appears as "‎%1.3" or "‎%-0.67" (percent sign before number)
        const changePctText = cells[4] != null ? normalizeArabicDigits(cells[4]) : '';
        let changePct = asNumFromText(changePctText);
        if (changePct == null) {
          const m = changePctText.match(/-?\d+(?:\.\d+)?/);
          if (m) changePct = Number(m[0]);
        }

        rows.push({
          karat: k,
          buyPrice: buy,
          sellPrice: sell,
          changeValue,
          changePct,
        });
      });

    if (rows.length === 0) return { ok: false, error: 'No silver rows parsed', pageUrl, scrapedAtIso };

    const pageUpdatedAtIso = parsePageUpdatedAt($);

    // Deduplicate by karat (keep last)
    const byKarat = new Map<number, SafeHavenSilverRow>();
    for (const r of rows) byKarat.set(r.karat, r);

    const finalRows = Array.from(byKarat.values()).sort((a, b) => b.karat - a.karat) as SafeHavenSilverRow[];
    return { ok: true, source: 'safehavenhub', pageUrl, pageUpdatedAtIso, scrapedAtIso, rows: finalRows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'scrape failed', pageUrl, scrapedAtIso };
  }
}

