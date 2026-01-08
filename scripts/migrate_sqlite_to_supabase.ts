/**
 * SQLite to Supabase Migration Script
 * 
 * Migrates data from SQLite database to Supabase PostgreSQL
 * Converts INTEGER ms timestamps to TIMESTAMPTZ
 * 
 * Usage: npx tsx scripts/migrate_sqlite_to_supabase.ts
 */

import Database from 'better-sqlite3';
import { getServerClient } from '../lib/supabase/server';
import path from 'path';
import fs from 'fs';

const BATCH_SIZE = 500;

// Convert SQLite INTEGER ms timestamp to ISO string for Postgres TIMESTAMPTZ
function msToTimestamptz(ms: number | null): string | null {
  if (ms === null || !isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

async function migrateTable(
  tableName: string,
  sqliteRows: any[],
  transformFn: (row: any) => any
): Promise<number> {
  const supabase = getServerClient();
  let inserted = 0;

  // Process in batches
  for (let i = 0; i < sqliteRows.length; i += BATCH_SIZE) {
    const batch = sqliteRows.slice(i, i + BATCH_SIZE);
    const transformed = batch.map(transformFn).filter(Boolean);

    if (transformed.length === 0) continue;

    const { error } = await supabase.from(tableName).insert(transformed);

    if (error) {
      console.error(`Error inserting batch into ${tableName}:`, error);
      throw error;
    }

    inserted += transformed.length;
    console.log(`  Inserted ${inserted}/${sqliteRows.length} rows into ${tableName}...`);
  }

  return inserted;
}

async function main() {
  const dbPath = process.env.DATABASE_PATH || './db/egyptgold.db';
  const fullPath = path.resolve(dbPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`SQLite database not found at: ${fullPath}`);
    process.exit(1);
  }

  console.log(`Opening SQLite database: ${fullPath}`);
  const sqlite = new Database(fullPath);

  try {
    // Verify Supabase connection
    const supabase = getServerClient();
    console.log('Connected to Supabase');

    // 1. Migrate gold_spot
    console.log('\n1. Migrating gold_spot...');
    const goldSpotRows = sqlite
      .prepare('SELECT xau_spot_usd_oz, fetched_at, stale, source FROM gold_spot ORDER BY fetched_at ASC')
      .all() as Array<{
      xau_spot_usd_oz: number;
      fetched_at: number;
      stale: number;
      source: string | null;
    }>;

    console.log(`  Found ${goldSpotRows.length} rows in SQLite`);
    
    const goldSpotInserted = await migrateTable('gold_spot', goldSpotRows, (row) => ({
      xau_spot_usd_oz: row.xau_spot_usd_oz,
      fetched_at: msToTimestamptz(row.fetched_at),
      stale: Boolean(row.stale),
      source: row.source || 'GoldAPI',
    }));

    console.log(`  ✓ Inserted ${goldSpotInserted} rows into gold_spot`);

    // 2. Migrate source_staleness
    console.log('\n2. Migrating source_staleness...');
    const stalenessRows = sqlite
      .prepare('SELECT source, karat, lastOkTimestamp, lastOkBuy FROM source_staleness')
      .all() as Array<{
      source: string;
      karat: number; // INTEGER in SQLite
      lastOkTimestamp: number;
      lastOkBuy: number;
    }>;

    console.log(`  Found ${stalenessRows.length} rows in SQLite`);
    
    const stalenessInserted = await migrateTable('source_staleness', stalenessRows, (row) => ({
      source: row.source,
      karat: row.karat, // Keep as integer
      last_ok_timestamp: msToTimestamptz(row.lastOkTimestamp),
      last_ok_buy: row.lastOkBuy,
    }));

    console.log(`  ✓ Inserted ${stalenessInserted} rows into source_staleness`);

    // 3. Migrate market_snapshots
    console.log('\n3. Migrating market_snapshots...');
    const snapshotRows = sqlite
      .prepare(`
        SELECT 
          source,
          createdAt,
          market21Buy,
          market21Sell,
          market24Buy,
          market24Sell,
          market18Buy,
          market18Sell,
          market14Buy,
          market14Sell,
          usdBuy,
          usdSell,
          rawHash,
          error,
          httpStatus,
          url,
          rawResponseSnippet
        FROM market_snapshots
        ORDER BY createdAt ASC
      `)
      .all() as Array<{
      source: string;
      createdAt: number;
      market21Buy: number | null;
      market21Sell: number | null;
      market24Buy: number | null;
      market24Sell: number | null;
      market18Buy: number | null;
      market18Sell: number | null;
      market14Buy: number | null;
      market14Sell: number | null;
      usdBuy: number | null;
      usdSell: number | null;
      rawHash: string | null;
      error: string | null;
      httpStatus: number | null;
      url: string | null;
      rawResponseSnippet: string | null;
    }>;

    console.log(`  Found ${snapshotRows.length} rows in SQLite`);
    
    const snapshotsInserted = await migrateTable('market_snapshots', snapshotRows, (row) => ({
      source: row.source,
      created_at: msToTimestamptz(row.createdAt),
      market21_buy: row.market21Buy,
      market21_sell: row.market21Sell,
      market24_buy: row.market24Buy,
      market24_sell: row.market24Sell,
      market18_buy: row.market18Buy,
      market18_sell: row.market18Sell,
      market14_buy: row.market14Buy,
      market14_sell: row.market14Sell,
      usd_buy: row.usdBuy,
      usd_sell: row.usdSell,
      raw_hash: row.rawHash,
      error: row.error,
      http_status: row.httpStatus,
      url: row.url,
      raw_response_snippet: row.rawResponseSnippet,
    }));

    console.log(`  ✓ Inserted ${snapshotsInserted} rows into market_snapshots`);

    // 4. Migrate egypt_market (legacy)
    console.log('\n4. Migrating egypt_market (legacy)...');
    const egyptMarketRows = sqlite
      .prepare(`
        SELECT 
          source,
          market_21_buy,
          market_21_sell,
          market_24_buy,
          market_24_sell,
          fetched_at,
          status,
          error_message,
          raw_response
        FROM egypt_market
        ORDER BY fetched_at ASC
      `)
      .all() as Array<{
      source: string;
      market_21_buy: number | null;
      market_21_sell: number | null;
      market_24_buy: number | null;
      market_24_sell: number | null;
      fetched_at: number;
      status: string;
      error_message: string | null;
      raw_response: string | null;
    }>;

    console.log(`  Found ${egyptMarketRows.length} rows in SQLite`);
    
    const egyptMarketInserted = await migrateTable('egypt_market', egyptMarketRows, (row) => ({
      source: row.source,
      market_21_buy: row.market_21_buy,
      market_21_sell: row.market_21_sell,
      market_24_buy: row.market_24_buy,
      market_24_sell: row.market_24_sell,
      fetched_at: msToTimestamptz(row.fetched_at),
      status: row.status,
      error_message: row.error_message,
      raw_response: row.raw_response,
    }));

    console.log(`  ✓ Inserted ${egyptMarketInserted} rows into egypt_market`);

    // Verify counts
    console.log('\n=== Verification ===');
    const { count: goldSpotCount } = await supabase
      .from('gold_spot')
      .select('*', { count: 'exact', head: true });
    
    const { count: stalenessCount } = await supabase
      .from('source_staleness')
      .select('*', { count: 'exact', head: true });
    
    const { count: snapshotsCount } = await supabase
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true });
    
    const { count: egyptMarketCount } = await supabase
      .from('egypt_market')
      .select('*', { count: 'exact', head: true });

    console.log(`\nSQLite → Supabase:`);
    console.log(`  gold_spot: ${goldSpotRows.length} → ${goldSpotCount}`);
    console.log(`  source_staleness: ${stalenessRows.length} → ${stalenessCount}`);
    console.log(`  market_snapshots: ${snapshotRows.length} → ${snapshotsCount}`);
    console.log(`  egypt_market: ${egyptMarketRows.length} → ${egyptMarketCount}`);

    console.log('\n✓ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

main();

