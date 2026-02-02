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
    .replace(/[^\d.,-]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

function parseKarat(s: string): 999 | 925 | 900 | 800 | null {
  const t = s.replace(/[^\d]/g, '');
  if (t === '999') return 999;
  if (t === '925') return 925;
  if (t === '900') return 900;
  if (t === '800') return 800;
  return null;
}

function parsePageUpdatedAt($: cheerio.CheerioAPI): string | null {
  // Best-effort extraction. We look for common "Last updated" phrases.
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const m =
    bodyText.match(/Last\s*updated\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}[^.]{0,30}\d{1,2}:\d{2}\s*(AM|PM)?)/i) ||
    bodyText.match(/Updated\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}[^.]{0,30}\d{1,2}:\d{2}\s*(AM|PM)?)/i);
  if (!m) return null;

  const candidate = m[1];
  const ms = Date.parse(candidate);
  if (!isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function scrapeEgyptLocalSilverSafeHaven(): Promise<SafeHavenSilverScrapeResult> {
  const pageUrl = 'https://safehavenhub.com';
  const scrapedAtIso = new Date().toISOString();

  try {
    const res = await fetch(pageUrl, {
      cache: 'no-store',
      headers: { 'User-Agent': 'egyptgold-pro/1.0 (+vercel)' },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, pageUrl, scrapedAtIso };
    const html = await res.text();
    const $ = cheerio.load(html);

    // Find any table that contains one of our target karats (999/925/900/800)
    const tables = $('table').toArray();
    let picked: AnyNode | null = null;
    for (const t of tables) {
      const txt = $(t).text();
      if (/\b999\b/.test(txt) && /\b925\b/.test(txt)) {
        picked = t;
        break;
      }
    }
    if (!picked) return { ok: false, error: 'Silver table not found', pageUrl, scrapedAtIso };

    const rows: SafeHavenSilverRow[] = [];
    $(picked)
      .find('tr')
      .each((_i, tr) => {
        const cells = $(tr).find('th,td').toArray().map((c) => $(c).text().trim());
        if (cells.length < 3) return;

        const k = parseKarat(cells[0] ?? '');
        if (!k) return;

        const buy = asNumFromText(cells[1] ?? '');
        const sell = asNumFromText(cells[2] ?? '');
        if (buy == null || sell == null) return;

        const changeValue = cells[3] != null ? asNumFromText(cells[3]) : null;
        const changePctRaw = cells[4] != null ? asNumFromText(cells[4]) : null;
        const changePct = changePctRaw != null ? changePctRaw : null;

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

