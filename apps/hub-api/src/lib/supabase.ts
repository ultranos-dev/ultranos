import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { toSnakeCase, toCamelCase } from './case-transform'
import { encryptRow, decryptRow, decryptRows } from './field-encryption'

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
 * Database helpers — apply camelCase↔snake_case and field-level encryption
 * at the Supabase query boundary.
 *
 * Write path:  camelCase object → encrypt PHI fields → snake_case → DB insert
 * Read path:   DB row (snake_case) → decrypt PHI fields → camelCase → TypeScript
 *
 * Architecture doc: "Apply snake_case mapping when writing to Supabase,
 * but use camelCase in the TypeScript UI logic."
 */
export const db = {
  /**
   * Transform camelCase object to snake_case for DB insert/update.
   * Encrypts configured PHI fields before the case transform.
   */
  toRow<T extends Record<string, unknown>>(data: T, encryptionKey?: string): T {
    const snaked = toSnakeCase(data)
    if (!encryptionKey) return snaked
    return encryptRow(snaked, encryptionKey)
  },

  /**
   * Transform snake_case DB row to camelCase for TypeScript consumption.
   * Decrypts configured PHI fields after the case transform boundary
   * (decryption operates on snake_case field names before case transform).
   */
  fromRow<T>(row: T, encryptionKey?: string): T {
    if (encryptionKey) {
      const decrypted = decryptRow(row as Record<string, unknown>, encryptionKey)
      return toCamelCase(decrypted as T)
    }
    return toCamelCase(row)
  },

  /**
   * Transform an array of snake_case DB rows to camelCase.
   * Decrypts configured PHI fields.
   */
  fromRows<T>(rows: T[], encryptionKey?: string): T[] {
    if (encryptionKey) {
      const decrypted = decryptRows(rows as Record<string, unknown>[], encryptionKey)
      return decrypted.map(toCamelCase) as T[]
    }
    return rows.map(toCamelCase)
  },
}
