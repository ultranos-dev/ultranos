import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { toSnakeCase, toCamelCase } from './case-transform'

let _client: SupabaseClient | null = null

/**
 * Returns a singleton Supabase admin client (service_role key).
 * The Hub API is the authority — it bypasses RLS and enforces RBAC at the app layer.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables',
    )
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return _client
}

/**
 * Creates a fresh Supabase client (useful for testing or per-request isolation).
 */
export function createSupabaseClient(
  url: string,
  key: string,
): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Database helpers — apply camelCase↔snake_case at the Supabase query boundary.
 * Use these instead of raw supabase calls when reading/writing domain objects.
 *
 * Architecture doc: "Apply snake_case mapping when writing to Supabase,
 * but use camelCase in the TypeScript UI logic."
 */
export const db = {
  /** Transform camelCase object to snake_case for DB insert/update. */
  toRow<T extends Record<string, unknown>>(data: T): T {
    return toSnakeCase(data)
  },
  /** Transform snake_case DB row to camelCase for TypeScript consumption. */
  fromRow<T>(row: T): T {
    return toCamelCase(row)
  },
  /** Transform an array of snake_case DB rows to camelCase. */
  fromRows<T>(rows: T[]): T[] {
    return rows.map(toCamelCase)
  },
}
