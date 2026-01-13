/**
 * News Items Database Operations
 * 
 * Server-only functions for upserting news items
 */

import 'server-only';
import { createServerClient } from '@/lib/supabase/server';

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

  for (const item of items) {
    try {
      const { error } = await supabase
        .from('news_items')
        .upsert({
          country,
          title: item.title,
          url: item.url,
          source: item.source,
          published_at: item.published_at,
          summary: item.summary,
          image_url: item.image_url,
          tags: item.tags,
          provider: item.provider,
          provider_id: item.provider_id,
        }, {
          onConflict: 'url',
        });

      if (error) {
        if (error.code === '23505') { // Unique violation (already exists)
          skipped++;
        } else {
          errors.push(`Failed to upsert ${item.url}: ${error.message}`);
        }
      } else {
        // Check if it was insert or update by querying first
        const { data: existing } = await supabase
          .from('news_items')
          .select('id')
          .eq('url', item.url)
          .single();
        
        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      }
    } catch (error: any) {
      errors.push(`Error processing ${item.url}: ${error.message}`);
    }
  }

  return { inserted, updated, skipped, errors };
}

