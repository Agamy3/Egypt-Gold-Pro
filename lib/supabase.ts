/**
 * Unified Supabase Database Client
 *
 * Replaces SQLite (lib/db.ts) with Supabase Postgres
 * Uses service role key for server-side operations
 * Preserves existing table and column names from SQLite schema
 */

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const debugAuth = process.env.SUPABASE_AUTH_DEBUG === '1' || process.env.NODE_ENV === 'development';

  if (!supabaseUrl) {
    throw new Error(
      'Missing Supabase URL: SUPABASE_URL must be set in .env.local'
    );
  }

  // Writes/admin operations require the service role key, but reads can work with
  // the public anon key (assuming your RLS policies allow it). This prevents
  // the whole app from breaking when SUPABASE_SERVICE_ROLE_KEY isn't configured
  // in the Workers environment.
  if (supabaseServiceRoleKey) {
    if (debugAuth) {
      console.log('[Supabase] init', {
        host: (() => {
          try {
            return new URL(supabaseUrl).host;
          } catch {
            return supabaseUrl;
          }
        })(),
        keyType: 'service_role',
      });
    }
    return { supabaseUrl, supabaseKey: supabaseServiceRoleKey as string, usingServiceRole: true };
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'Missing Supabase keys: set SUPABASE_SERVICE_ROLE_KEY (server-only) or SUPABASE_ANON_KEY for reads'
    );
  }

  if (debugAuth) {
    console.log('[Supabase] init', {
      host: (() => {
        try {
          return new URL(supabaseUrl).host;
        } catch {
          return supabaseUrl;
        }
      })(),
      keyType: 'anon',
    });
  }
  return { supabaseUrl, supabaseKey: supabaseAnonKey as string, usingServiceRole: false };
}

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const { supabaseUrl, supabaseKey } = getSupabaseConfig();
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabase;
}

/**
 * Database client interface matching SQLite usage patterns
 * Provides helper methods that mirror SQLite's prepare().get() and prepare().run() patterns
 */
const db = {
  /**
   * Execute a query and return first result (like db.prepare().get())
   * Note: This is a simplified wrapper - for complex queries, use db.supabase directly
   */
  async get<T = unknown>(query: string, ...params: unknown[]): Promise<T | undefined> {
    void query;
    void params;
    // For now, delegate to direct Supabase client for complex queries
    // This method signature is kept for compatibility but should be replaced with direct Supabase calls
    console.warn('db.get() called with raw SQL - consider using db.supabase directly for better type safety');
    throw new Error('db.get() with raw SQL is not supported. Use db.supabase.from(table).select() directly.');
  },

  /**
   * Execute a query and return all results (like db.prepare().all())
   * Note: This is a simplified wrapper - for complex queries, use db.supabase directly
   */
  async all<T = unknown>(query: string, ...params: unknown[]): Promise<T[]> {
    void query;
    void params;
    console.warn('db.all() called with raw SQL - consider using db.supabase directly for better type safety');
    throw new Error('db.all() with raw SQL is not supported. Use db.supabase.from(table).select() directly.');
  },

  /**
   * Execute a query without returning results (like db.prepare().run())
   * Note: This is a simplified wrapper - for complex queries, use db.supabase directly
   */
  async run(query: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowid?: number }> {
    void query;
    void params;
    console.warn('db.run() called with raw SQL - consider using db.supabase directly for better type safety');
    throw new Error('db.run() with raw SQL is not supported. Use db.supabase.from(table).insert()/update()/delete() directly.');
  },

  /**
   * Execute raw SQL (like db.exec())
   * Note: Supabase doesn't support arbitrary SQL execution via JS client
   * This is mainly for schema initialization which should be done via migrations
   */
  async exec(sql: string): Promise<void> {
    void sql;
    console.warn('db.exec() called - Supabase does not support arbitrary SQL execution. Use migrations instead.');
    // Schema initialization should be done via Supabase migrations, not here
  },

  /**
   * Direct access to Supabase client for all queries
   * Use this for all database operations
   */
  get supabase() {
    return getSupabase();
  },
};

export default db;
