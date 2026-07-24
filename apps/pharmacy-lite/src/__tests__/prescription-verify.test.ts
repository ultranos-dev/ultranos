import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import type * as SyncEngineModule from '@ultranos/sync-engine'

// Mock the sync-engine crypto module
vi.mock('@ultranos/sync-engine', async () => {
  const actual = await vi.importActual<typeof SyncEngineModule>('@ultranos/sync-engine')
  return {
    ...actual,
    verifySignature: vi.fn(),
  }
})

// Mock auth session store (required by prescription-verify revalidation path)
const mockGetAccessToken = vi.fn<() => Promise<string | null>>().mockResolvedValue('test-token')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({
      session: { userId: 'u1', practitionerId: 'p1', role: 'PHARMACIST', sessionId: 's1' },
      getAccessToken: mockGetAccessToken,
    })),
  }),
}))

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(() => 'http://hub'),
}))

import { verifySignature } from '@ultranos/sync-engine'
import { verifyPrescriptionQr, fetchAndCachePractitionerKey } from '@/lib/prescription-verify'
import { revalidateKey as _revalidateKey } from '@/lib/practitioner-key-cache'
import type { SignedPrescriptionBundle } from '@/lib/prescription-types'

const mockVerify = vi.mocked(verifySignature)

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function makeBundle(overrides?: Partial<SignedPrescriptionBundle>): SignedPrescriptionBundle {
  const payload = JSON.stringify([
    {
      id: 'rx-001',
      med: 'AMX500',
      medN: 'Amoxicillin',
      medT: 'Amoxicillin 500mg Capsule',
      dos: { qty: 1, unit: 'capsule', freqN: 3, per: 1, perU: 'd' },
      dur: 7,
      req: 'pract-001',
      pat: 'pat-001',
      at: '2026-04-28T10:00:00Z',
    },
  ])

  return {
    payload,
    sig: uint8ToBase64(new Uint8Array(64).fill(1)),
    pub: uint8ToBase64(new Uint8Array(32).fill(2)),
    issued_at: '2026-04-28T10:00:00Z',
    expiry: '2026-05-28T10:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.practitionerKeys.clear()
  // revokedKeys table added in Dexie v3 — clear if available
  try { await db.revokedKeys.clear() } catch { /* table may not exist in older schema tests */ }
})

describe('verifyPrescriptionQr', () => {
  it('returns parse_error for invalid JSON', async () => {
    const result = await verifyPrescriptionQr('not-json')
    expect(result.status).toBe('parse_error')
  })

  it('returns parse_error for incomplete bundle', async () => {
    const result = await verifyPrescriptionQr(JSON.stringify({ payload: 'x' }))
    expect(result.status).toBe('parse_error')
  })

  it('returns expired when prescription is past expiry', async () => {
    const bundle = makeBundle({ expiry: '2020-01-01T00:00:00Z' })
    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('expired')
    if (result.status === 'expired') {
      expect(result.expiry).toBe('2020-01-01T00:00:00Z')
    }
  })

  it('returns invalid_signature when verification fails (AC 3: Fraud Warning)', async () => {
    mockVerify.mockResolvedValue(false)
    const bundle = makeBundle()

    // Seed a fresh (non-stale) key so we reach the signature verification step
    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('invalid_signature')
  })

  it('returns invalid_signature when crypto throws', async () => {
    mockVerify.mockRejectedValue(new Error('crypto error'))
    const bundle = makeBundle()

    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('invalid_signature')
  })

  it('returns unknown_clinician when public key not in local cache', async () => {
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('unknown_clinician')
  })

  it('returns verified with prescriptions when signature valid and key in cache (AC 2, 5)', async () => {
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    // Seed local practitioner key cache
    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('verified')
    if (result.status === 'verified') {
      expect(result.prescriptions).toHaveLength(1)
      expect(result.prescriptions[0]!.medN).toBe('Amoxicillin')
      expect(result.practitionerName).toBe('Dr. Ahmad')
    }
  })

  it('calls verifySignature with correct arguments', async () => {
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    await verifyPrescriptionQr(JSON.stringify(bundle))

    expect(mockVerify).toHaveBeenCalledWith(
      bundle.payload,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
    )
  })

  it('rejects signatures from keys in the local KRL (Story 7.4 AC 4)', async () => {
    mockVerify.mockResolvedValue(true) // signature is technically valid
    const bundle = makeBundle()

    // Key is cached and not expired
    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    // But the key is in the local KRL (revoked)
    await db.revokedKeys.put({
      publicKey: bundle.pub,
      revokedAt: '2026-06-01T00:00:00Z',
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('key_revoked')
  })

  it('works entirely offline without Hub connectivity for non-stale keys (AC 5)', async () => {
    // No fetch calls should be made during verification of fresh keys
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('verified')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('non-stale key skips revalidation, verification proceeds immediately (26.7 AC 5.5)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()

    // Seed with a FRESH key (not stale)
    await db.practitionerKeys.put({
      publicKey: bundle.pub,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: new Date().toISOString(),
    })

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('verified')
    // No Hub API calls should have been made
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('Practitioner key revalidation (Story 26.7)', () => {
  /** Seed a STALE key (TTL expired >24h ago) */
  async function seedStaleKey(pubKeyBase64: string) {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h ago
    await db.practitionerKeys.put({
      publicKey: pubKeyBase64,
      practitionerId: 'pract-001',
      practitionerName: 'Dr. Ahmad',
      cachedAt: staleDate,
    })
  }

  it('stale key triggers revalidateKey before verification (AC 1, 5.1)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        result: {
          data: {
            status: 'active',
            practitionerId: 'pract-001',
            publicKey: 'key',
            practitionerName: 'Dr. Ahmad',
            revokedAt: null,
            expiresAt: '2027-01-01T00:00:00Z',
          },
        },
      }), { status: 200 }),
    )

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))

    // Revalidation should have been called (fetch to Hub)
    expect(fetchSpy).toHaveBeenCalled()
    // Key is active, so verification should succeed
    expect(result.status).toBe('verified')
    fetchSpy.mockRestore()
  })

  it('active key response refreshes cache, verification succeeds (AC 2, 5.2)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        result: {
          data: {
            status: 'active',
            practitionerId: 'pract-001',
            publicKey: 'key',
            practitionerName: 'Dr. Ahmad',
            revokedAt: null,
            expiresAt: '2027-01-01T00:00:00Z',
          },
        },
      }), { status: 200 }),
    )

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('verified')

    // Verify the cache was refreshed (cachedAt should be recent)
    const refreshedEntry = await db.practitionerKeys.get(bundle.pub)
    expect(refreshedEntry).toBeTruthy()
    const cacheAge = Date.now() - new Date(refreshedEntry!.cachedAt).getTime()
    expect(cacheAge).toBeLessThan(5000) // refreshed within last 5 seconds

    vi.mocked(globalThis.fetch).mockRestore()
  })

  it('revoked key response deletes cache, returns key_revoked (AC 3, 5.3)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        result: {
          data: {
            status: 'revoked',
            practitionerId: 'pract-001',
            publicKey: 'key',
            revokedAt: '2026-05-10T00:00:00Z',
            expiresAt: '2027-01-01T00:00:00Z',
          },
        },
      }), { status: 200 }),
    )

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('key_revoked')

    // Verify the cache entry was deleted
    const entry = await db.practitionerKeys.get(bundle.pub)
    expect(entry).toBeUndefined()

    vi.mocked(globalThis.fetch).mockRestore()
  })

  it('expired key response returns key_revoked — fail-closed (Review Fix 1)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        result: {
          data: {
            status: 'expired',
            practitionerId: 'pract-001',
            publicKey: 'key',
            revokedAt: null,
            expiresAt: '2026-01-01T00:00:00Z',
          },
        },
      }), { status: 200 }),
    )

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('key_revoked')

    vi.mocked(globalThis.fetch).mockRestore()
  })

  it('network failure returns key_untrusted_offline, blocks dispensing (AC 4, 5.4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('key_untrusted_offline')

    vi.mocked(globalThis.fetch).mockRestore()
  })

  it('returns key_untrusted_offline when auth token is unavailable (AC 4)', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null)

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('key_untrusted_offline')
  })

  it('returns key_untrusted_offline when Hub returns non-200 (AC 4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    )

    mockVerify.mockResolvedValue(true)
    const bundle = makeBundle()
    await seedStaleKey(bundle.pub)

    const result = await verifyPrescriptionQr(JSON.stringify(bundle))
    expect(result.status).toBe('key_untrusted_offline')

    vi.mocked(globalThis.fetch).mockRestore()
  })
})

describe('fetchAndCachePractitionerKey', () => {
  it('fetches from practitionerKey.getKeyStatus and caches an active key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            data: {
              status: 'active',
              practitionerId: 'prac-9',
              practitionerName: 'Dr. Nine',
              publicKey: 'key-nine-b64',
            },
          },
        }),
        { status: 200 },
      ),
    )

    const result = await fetchAndCachePractitionerKey('key-nine-b64', 'http://hub', 'token-9')

    expect(result).toEqual({ id: 'prac-9', name: 'Dr. Nine' })

    // Hits the real tRPC procedure, NOT the non-existent /api/practitioners/by-public-key route.
    const calledUrl = String(fetchSpy.mock.calls[0]![0])
    expect(calledUrl).toContain('/practitionerKey.getKeyStatus')
    expect(calledUrl).not.toContain('by-public-key')
    expect(calledUrl).not.toContain('/api/trpc/api/trpc')

    const cached = await db.practitionerKeys.get('key-nine-b64')
    expect(cached).toBeDefined()
    expect(cached!.practitionerName).toBe('Dr. Nine')

    vi.mocked(globalThis.fetch).mockRestore()
  })

  it('does NOT cache a revoked key (fail-closed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            data: {
              status: 'revoked',
              practitionerId: 'prac-9',
              practitionerName: 'Dr. Nine',
              publicKey: 'revoked-key-b64',
            },
          },
        }),
        { status: 200 },
      ),
    )

    const result = await fetchAndCachePractitionerKey('revoked-key-b64', 'http://hub', 'token-9')

    expect(result).toBeNull()
    const cached = await db.practitionerKeys.get('revoked-key-b64')
    expect(cached).toBeUndefined()

    vi.mocked(globalThis.fetch).mockRestore()
  })
})
