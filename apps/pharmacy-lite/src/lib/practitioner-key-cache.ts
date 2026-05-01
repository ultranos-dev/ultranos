import { db } from './db'

/** Maximum cache age for practitioner keys: 24 hours */
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface CachedKeyResult {
  practitionerId: string
  practitionerName: string
  publicKey: string
  stale: boolean
}

export interface RevalidationResult {
  status: 'active' | 'revoked' | 'expired'
  practitionerId: string
  publicKey: string
  revokedAt: string | null
  expiresAt: string
}

/**
 * Look up a practitioner key in the local IndexedDB cache.
 * Returns the cached entry with a `stale` flag indicating whether
 * the TTL has expired and revalidation is needed.
 *
 * AC 1: Cached keys have a 24h TTL.
 */
export async function getCachedKey(
  pubKeyBase64: string,
): Promise<CachedKeyResult | null> {
  try {
    const entry = await db.practitionerKeys.get(pubKeyBase64)
    if (!entry) return null

    const cachedAge = Date.now() - new Date(entry.cachedAt).getTime()
    const stale = cachedAge > KEY_CACHE_TTL_MS

    return {
      practitionerId: entry.practitionerId,
      practitionerName: entry.practitionerName,
      publicKey: entry.publicKey,
      stale,
    }
  } catch {
    return null
  }
}

/**
 * Re-fetch a practitioner key's status from the Hub API.
 * Updates the local cache on success; deletes it if the key is revoked.
 *
 * AC 2: Upon TTL expiry, re-fetch from Hub API.
 * Fail-Closed: returns null on network failure — caller must treat as untrusted.
 */
export async function revalidateKey(
  pubKeyBase64: string,
  hubBaseUrl: string,
  authToken: string,
): Promise<RevalidationResult | null> {
  try {
    const res = await fetch(
      `${hubBaseUrl}/api/trpc/practitionerKey.getKeyStatus?input=${encodeURIComponent(JSON.stringify({ publicKey: pubKeyBase64 }))}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    )

    if (!res.ok) return null

    const json = (await res.json()) as Record<string, unknown>

    // Support both tRPC envelope ({ result: { data: ... } }) and direct response
    const envelope = json.result as Record<string, unknown> | undefined
    const data = (envelope?.data ?? json) as RevalidationResult
    if (!data || !data.status) return null

    // If revoked, remove from local cache immediately
    if (data.status === 'revoked') {
      await db.practitionerKeys.delete(pubKeyBase64)
      return data
    }

    // If active, update the cache with fresh timestamp
    if (data.status === 'active' && data.practitionerId) {
      const existing = await db.practitionerKeys.get(pubKeyBase64)
      const name =
        ((data as Record<string, unknown>).practitionerName as string | undefined) ??
        existing?.practitionerName ??
        ''
      await db.practitionerKeys.put({
        publicKey: pubKeyBase64,
        practitionerId: data.practitionerId,
        practitionerName: name,
        cachedAt: new Date().toISOString(),
      })
    }

    return data
  } catch {
    // Fail-closed: network failure → null → caller treats as untrusted
    return null
  }
}
