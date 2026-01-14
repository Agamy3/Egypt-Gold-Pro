/**
 * News Items Database Operations
 * 
 * Server-only functions for upserting news items
 */

import 'server-only';
import { createServerClient } from '@/lib/supabase/server';
import { htmlToText } from '@/lib/html-text-converter';

export interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  image_url: string | null;
  tags: string[] | null;
  provider: 'gdelt' | 'rss';
  provider_id: string | null;
}

/**
 * Upsert news items into database
 * 
 * Deduplicates by URL
 * Uses service role client (bypasses RLS)
 */
export async function upsertNewsItems(
  items: NewsItem[],
  country: string
): Promise<{ inserted: number; updated: number; skipped: number; errors: string[] }> {
  const supabase = createServerClient();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Validate required fields
  const validItems = items.filter((item) => {
    if (!item.title || !item.url || item.title.trim().length === 0 || item.url.trim().length === 0) {
      errors.push(`Skipping item with missing title or URL`);
      return false;
    }
    return true;
  });

  if (validItems.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(`[News] No valid items to upsert for ${country}`);
    return { inserted: 0, updated: 0, skipped: 0, errors };
  }

  // eslint-disable-next-line no-console
  console.log(`[News] Upserting ${validItems.length} items for ${country}`);

  for (const item of validItems) {
    try {
      // Check if item exists first to determine insert vs update
      const { data: existing } = await supabase
        .from('news_items')
        .select('id')
        .eq('url', item.url)
        .maybeSingle();

      const isUpdate = existing !== null;

      // Parse published_at to ensure it's a valid ISO string or null
      let publishedAt: string | null = null;
      if (item.published_at) {
        try {
          const date = new Date(item.published_at);
          if (!isNaN(date.getTime())) {
            publishedAt = date.toISOString();
          }
        } catch {
          // Invalid date, leave as null
        }
      }

      // Clean summary: strip HTML and decode entities
      let cleanSummary: string | null = null;
      if (item.summary) {
        cleanSummary = htmlToText(item.summary).substring(0, 500);
        if (cleanSummary.length === 0) {
          cleanSummary = null;
        }
      }

      const { error } = await supabase
        .from('news_items')
        .upsert({
          country,
          title: item.title.trim(),
          url: item.url.trim(),
          source: item.source ? item.source.trim() : null,
          published_at: publishedAt,
          summary: cleanSummary,
          image_url: item.image_url ? item.image_url.trim() : null,
          tags: Array.isArray(item.tags) ? item.tags : null,
          provider: item.provider,
          provider_id: item.provider_id ? String(item.provider_id).trim() : null,
        }, {
          onConflict: 'url',
        });

      if (error) {
        if (error.code === '23505') {
          // Unique violation (already exists) - count as skipped
          skipped++;
        } else {
          errors.push(`Failed to upsert ${item.url}: ${error.message}`);
          // eslint-disable-next-line no-console
          console.error(`[News] Upsert error for ${item.url}:`, error.message);
        }
      } else {
        if (isUpdate) {
          updated++;
        } else {
          inserted++;
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Error processing ${item.url}: ${errorMsg}`);
      // eslint-disable-next-line no-console
      console.error(`[News] Exception processing ${item.url}:`, errorMsg);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[News] Upsert complete for ${country}: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

  return { inserted, updated, skipped, errors };
}

