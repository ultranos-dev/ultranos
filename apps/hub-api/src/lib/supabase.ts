import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { toSnakeCase, toCamelCase } from './case-transform'
import {
  encryptRow,
  decryptRow,
  decryptRows,
  getCachedEncryptionKey,
} from './field-encryption'
import { getEncryptionConfig } from '@ultranos/crypto/server'

const SENSITIVE_FIELDS = new Set(getEncryptionConfig().randomizedFields)

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
 * Write path:  camelCase object → snake_case → encrypt PHI fields → DB insert
 * Read path:   DB row (snake_case) → decrypt PHI fields → camelCase → TypeScript
 *
 * Story 7.3b: Encryption is MANDATORY. The encryption key is resolved internally
 * via getCachedEncryptionKey() — callers never handle raw keys. Use toRowRaw()
 * for tables with no PHI columns (requires a reason string for audit traceability).
 */
export const db = {
  /**
   * Transform camelCase object to snake_case for DB insert/update.
   * Automatically encrypts configured PHI fields — no opt-out.
   * The encryption key is resolved internally; callers never pass it.
   */
  toRow<T extends Record<string, unknown>>(data: T): T {
    const snaked = toSnakeCase(data)
    return encryptRow(snaked, getCachedEncryptionKey())
  },

  /**
   * Transform camelCase object to snake_case WITHOUT encryption.
   * Escape hatch for non-PHI tables (notifications, labs, consents, sync_events).
   *
   * @param reason — Required audit trail string explaining why encryption is skipped.
   *   Expected: "non-PHI: notifications", "non-PHI: labs", etc.
   * @throws TypeError if reason is missing or empty.
   */
  toRowRaw<T extends Record<string, unknown>>(data: T, reason: string): T {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new TypeError(
        'db.toRowRaw() requires a non-empty reason string for audit traceability',
      )
    }
    const snaked = toSnakeCase(data)
    for (const key of Object.keys(snaked)) {
      if (SENSITIVE_FIELDS.has(key)) {
        throw new Error(
          `db.toRowRaw() cannot write sensitive field "${key}" — use db.toRow() instead`,
        )
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[db.toRowRaw] plaintext write: ${reason}`)
    }
    return snaked
  },

  /**
   * Transform snake_case DB row to camelCase for TypeScript consumption.
   * Automatically decrypts configured PHI fields.
   */
  fromRow<T>(row: T): T {
    const decrypted = decryptRow(
      row as Record<string, unknown>,
      getCachedEncryptionKey(),
    )
    return toCamelCase(decrypted as T)
  },

  /**
   * Transform snake_case DB row to camelCase WITHOUT decryption.
   * For non-PHI tables where no sensitive fields exist.
   */
  fromRowRaw<T>(row: T): T {
    return toCamelCase(row)
  },

  /**
   * Transform an array of snake_case DB rows to camelCase.
   * Automatically decrypts configured PHI fields.
   */
  fromRows<T>(rows: T[]): T[] {
    const key = getCachedEncryptionKey()
    const decrypted = decryptRows(
      rows as Record<string, unknown>[],
      key,
    )
    return decrypted.map(toCamelCase) as T[]
  },
}
