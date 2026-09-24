import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// session.getKeyWrappingSecret — Story 61.2 (AC #1)
// The hub issues a per-user, deterministic-yet-secret key-wrapping value derived
// from an env-only master secret via HMAC-SHA256(master, sub). Verifies:
//   - a valid authenticated caller receives a 64-hex secret,
//   - the value is deterministic for the same sub and differs per sub,
//   - the raw master secret is never returned,
//   - the endpoint errors when the master secret is not configured.
// ============================================================

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))
vi.stubEnv('HUB_KEY_WRAPPING_MASTER_SECRET', 'm'.repeat(48))

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const createCaller = createCallerFactory(appRouter)

function callerFor(sub: string) {
  return createCaller({
    supabase: {},
    // orgId: null → enforceMfaPolicy has nothing to enforce (bypass).
    user: { sub, role: 'DOCTOR', sessionId: 'sess-1', orgId: null, facilityId: null, status: 'ACTIVE', aal: null },
    headers: new Headers(),
  } as never)
}

describe('session.getKeyWrappingSecret', () => {
  beforeEach(() => {
    vi.stubEnv('HUB_KEY_WRAPPING_MASTER_SECRET', 'm'.repeat(48))
  })

  it('returns a 64-hex per-user secret for an authenticated caller', async () => {
    const { secret } = await callerFor('user-A').session.getKeyWrappingSecret()
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same sub', async () => {
    const a1 = await callerFor('user-A').session.getKeyWrappingSecret()
    const a2 = await callerFor('user-A').session.getKeyWrappingSecret()
    expect(a1.secret).toBe(a2.secret)
  })

  it('differs per sub', async () => {
    const a = await callerFor('user-A').session.getKeyWrappingSecret()
    const b = await callerFor('user-B').session.getKeyWrappingSecret()
    expect(a.secret).not.toBe(b.secret)
  })

  it('never returns the raw master secret', async () => {
    const { secret } = await callerFor('user-A').session.getKeyWrappingSecret()
    expect(secret).not.toContain('m'.repeat(48))
  })

  it('errors when the master secret is not configured', async () => {
    vi.stubEnv('HUB_KEY_WRAPPING_MASTER_SECRET', '')
    await expect(callerFor('user-A').session.getKeyWrappingSecret()).rejects.toThrow()
  })
})
