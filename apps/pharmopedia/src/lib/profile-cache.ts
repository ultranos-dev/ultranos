import type * as SQLite from 'expo-sqlite'
import type { UserProfile } from '@/api/users'
import { encryptJson, decryptJson } from '@/lib/secure-crypto'

export async function writeProfileCache(db: SQLite.SQLiteDatabase, sub: string, profile: UserProfile): Promise<void> {
  const { ciphertext, iv } = await encryptJson(profile)
  await db.runAsync(
    `INSERT OR REPLACE INTO profile_cache (sub, ciphertext, iv, updated_at) VALUES (?, ?, ?, ?)`,
    [sub, ciphertext, iv, new Date().toISOString()],
  )
}

export async function readProfileCache(db: SQLite.SQLiteDatabase, sub: string): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<{ ciphertext: string; iv: string }>(
    `SELECT ciphertext, iv FROM profile_cache WHERE sub = ?`,
    [sub],
  )
  if (!row) return null
  try {
    return await decryptJson<UserProfile>({ ciphertext: row.ciphertext, iv: row.iv })
  } catch {
    return null
  }
}

export async function clearProfileCache(db: SQLite.SQLiteDatabase): Promise<void> {
  // Intentional full-table delete (not per-sub): defense-in-depth alongside the
  // SecureStore key rotation on logout (clearCacheKey), which renders any surviving
  // ciphertext undecryptable. Do not "optimize" to WHERE sub = ? — that would risk
  // cross-account ciphertext residue on a shared singleton DB.
  await db.runAsync(`DELETE FROM profile_cache`)
}
