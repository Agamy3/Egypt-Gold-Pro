import { getServerClient } from '@/lib/supabase/server';
import { getProvidedCronSecret, isCronRequestAuthorized } from '@/lib/cron/cronSecret';
import { scrapeEgyptLocalSilverSafeHaven } from '@/lib/metals/safehavenhubSilver';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const provided = getProvidedCronSecret(request) || secret;
  if (!isCronRequestAuthorized(request, provided)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const serverAsOf = new Date().toISOString();
  const supabase = getServerClient();

  const scrape = await scrapeEgyptLocalSilverSafeHaven();
  if (!scrape.ok) {
    console.warn('[silver-local-eg] feed unavailable', { reason: scrape.error });
    return Response.json({ ok: false, error: scrape.error, serverAsOf, pageUrl: scrape.pageUrl }, { status: 200 });
  }

  const pageUpdatedAt = scrape.pageUpdatedAtIso ? new Date(scrape.pageUpdatedAtIso).toISOString() : null;
  const scrapedAt = new Date(scrape.scrapedAtIso).toISOString();

  const rows = scrape.rows.map((r) => ({
    country: 'EG',
    karat: r.karat,
    buy_price: r.buyPrice,
    sell_price: r.sellPrice,
    change_value: r.changeValue,
    change_pct: r.changePct,
    source: 'safehavenhub',
    trusted: true,
    page_updated_at: pageUpdatedAt,
    scraped_at: scrapedAt,
  }));

  const { error } = await supabase.from('local_silver_prices').insert(rows as any);
  if (error) {
    return Response.json({ ok: false, error: error.message, serverAsOf, inserted: 0 }, { status: 200 });
  }

  return Response.json({
    ok: true,
    serverAsOf,
    inserted: rows.length,
    pageUpdatedAt,
    scrapedAt,
    source: 'safehavenhub',
  });
}
