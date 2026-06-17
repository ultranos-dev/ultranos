import { describe, it, expect, vi, beforeEach } from 'vitest'

// expo-sqlite is a native module that can't run in Node — mock it at the module level
// so that migrations.ts can be imported. The actual DB operations use the better-sqlite3
// adapter passed as existingDb to openDatabase(), so SQLiteDatabase methods are never called.
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

vi.mock('@/lib/secure-crypto', () => ({
  encryptJson: async (o: unknown) => ({ ciphertext: 'ct:' + JSON.stringify(o), iv: 'iv' }),
  decryptJson: async (b: { ciphertext: string }) => JSON.parse(b.ciphertext.replace(/^ct:/, '')),
  clearCacheKey: vi.fn(),
}))

import Database from 'better-sqlite3'
import { openDatabase } from '@/db/migrations'
import { writeProfileCache, readProfileCache, clearProfileCache } from '@/lib/profile-cache'
import type { UserProfile } from '@/api/users'

/**
 * Wrap a better-sqlite3 in-memory instance in the async expo-sqlite surface
 * that migrations.ts and profile-cache.ts rely on:
 *   db.getFirstAsync<T>(sql, params?)   → T | null
 *   db.runAsync(sql, params)            → void
 *   db.execAsync(sql)                   → void
 *   db.withExclusiveTransactionAsync(fn) → calls fn(txn) where txn.execAsync(sql)
 */
function makeExpoSqliteAdapter(raw: InstanceType<typeof Database>) {
  const txn = {
    execAsync: async (sql: string) => { raw.exec(sql) },
  }
  return {
    getFirstAsync: async <T>(sql: string, params?: unknown[]): Promise<T | null> => {
      const stmt = raw.prepare(sql)
      const row = params ? stmt.get(...params as Parameters<typeof stmt.get>) : stmt.get()
      return (row ?? null) as T | null
    },
    runAsync: async (sql: string, params?: unknown[]): Promise<void> => {
      const stmt = raw.prepare(sql)
      if (params) stmt.run(...params as Parameters<typeof stmt.run>)
      else stmt.run()
    },
    execAsync: async (sql: string): Promise<void> => { raw.exec(sql) },
    withExclusiveTransactionAsync: async (fn: (t: typeof txn) => Promise<void>): Promise<void> => {
      await fn(txn)
    },
  }
}

describe('profile-cache', () => {
  let db: ReturnType<typeof makeExpoSqliteAdapter>

  beforeEach(async () => {
    const raw = new Database(':memory:')
    db = makeExpoSqliteAdapter(raw)
    // openDatabase with an existingDb skips SQLite.openDatabaseAsync and runs migrations
    await openDatabase(':memory:', db as never)
  })

  it('writes then reads back the profile', async () => {
    const profile: UserProfile = { kind: 'patient', displayName: 'Sara', givenName: 'Sara', tier: 'FREE' }
    await writeProfileCache(db as never, 'auth-1', profile)
    const result = await readProfileCache(db as never, 'auth-1')
    expect(result).toEqual(profile)
  })

  it('returns null for a missing sub', async () => {
    const result = await readProfileCache(db as never, 'nope')
    expect(result).toBeNull()
  })

  it('clearProfileCache wipes all rows', async () => {
    const profile: UserProfile = { kind: 'patient', displayName: 'X', givenName: 'X', tier: 'FREE' }
    await writeProfileCache(db as never, 'auth-1', profile)
    await clearProfileCache(db as never)
    const result = await readProfileCache(db as never, 'auth-1')
    expect(result).toBeNull()
  })
})
