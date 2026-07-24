import { describe, it, expect, vi, beforeEach } from 'vitest'

// Guards the client/server contract for the labs consent pre-check: it must call
// the Hub's `consent.check` (NOT the non-existent `consent.checkAccess`) with
// { patientId, resourceType: 'DiagnosticReport' } and read `permitted`.

vi.mock('@/lib/hub-url', () => ({ getHubTrpcUrl: () => 'http://hub.test/api/trpc' }))
// consent-check now gets its token from the canonical hub-auth helper (Supabase
// session), not the auth-session store.
vi.mock('@/lib/hub-auth', () => ({
  getAuthHeaders: async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer TESTTOKEN' }),
}))

import { checkLabsConsent, clearConsentCache } from '@/lib/consent-check'

// Distinct patient id per test avoids the 5-minute in-memory cache masking calls.
let n = 0
const nextPid = () => `00000000-0000-0000-0000-0000000000${String(++n).padStart(2, '0')}`

function mockFetch(res: { ok: boolean; status: number; json?: () => unknown }) {
  const fn = vi.fn().mockResolvedValue({ status: res.status, ok: res.ok, json: async () => res.json?.() })
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('checkLabsConsent', () => {
  beforeEach(() => { vi.clearAllMocks(); clearConsentCache() })

  it('calls consent.check with { patientId, resourceType: DiagnosticReport } + bearer', async () => {
    const pid = nextPid()
    const fetchMock = mockFetch({ ok: true, status: 200, json: () => ({ result: { data: { json: { permitted: true } } } }) })

    const result = await checkLabsConsent(pid)
    expect(result).toEqual({ granted: true })

    const url = new URL((fetchMock.mock.calls[0]![0] as string))
    expect(url.pathname).toBe('/api/trpc/consent.check')
    const input = JSON.parse(url.searchParams.get('input')!)
    expect(input).toEqual({ json: { patientId: pid, resourceType: 'DiagnosticReport' } })
    // Regression guard: the request MUST carry the bearer token (the old code read
    // a nonexistent auth-session field and sent none, causing a 401).
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer TESTTOKEN')
  })

  it('maps permitted:false to granted:false / no_consent', async () => {
    mockFetch({ ok: true, status: 200, json: () => ({ result: { data: { json: { permitted: false } } } }) })
    expect(await checkLabsConsent(nextPid())).toEqual({ granted: false, reason: 'no_consent' })
  })

  it('treats a 404 as granted (server enforces consent as the real gate)', async () => {
    mockFetch({ ok: false, status: 404 })
    expect(await checkLabsConsent(nextPid())).toEqual({ granted: true })
  })

  it('treats a 403 as consent denied', async () => {
    mockFetch({ ok: false, status: 403 })
    expect(await checkLabsConsent(nextPid())).toEqual({ granted: false, reason: 'no_consent' })
  })
})
