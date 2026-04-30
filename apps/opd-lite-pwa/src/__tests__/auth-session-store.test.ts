import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Dexie DB
vi.mock('@/lib/db', () => ({
  db: {
    encounters: { toArray: vi.fn().mockResolvedValue([]), put: vi.fn(), get: vi.fn() },
    patients: { get: vi.fn() },
  },
}))

describe('useAuthSessionStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('starts with null session (unauthenticated)', async () => {
    const { useAuthSessionStore } = await import('../stores/auth-session-store')
    const state = useAuthSessionStore.getState()
    expect(state.session).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('setSession populates practitioner info', async () => {
    const { useAuthSessionStore } = await import('../stores/auth-session-store')
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'DOCTOR',
      sessionId: 'sess-abc',
    })

    const state = useAuthSessionStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.session).toEqual({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'DOCTOR',
      sessionId: 'sess-abc',
    })
  })

  it('getPractitionerRef returns the FHIR Practitioner reference', async () => {
    const { useAuthSessionStore } = await import('../stores/auth-session-store')
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'DOCTOR',
      sessionId: 'sess-abc',
    })

    expect(useAuthSessionStore.getState().getPractitionerRef()).toBe('Practitioner/prac-001')
  })

  it('getPractitionerRef throws when not authenticated', async () => {
    const { useAuthSessionStore } = await import('../stores/auth-session-store')
    expect(() => useAuthSessionStore.getState().getPractitionerRef()).toThrow(
      'No authenticated session',
    )
  })

  it('clearSession resets to unauthenticated', async () => {
    const { useAuthSessionStore } = await import('../stores/auth-session-store')
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'DOCTOR',
      sessionId: 'sess-abc',
    })

    useAuthSessionStore.getState().clearSession()
    expect(useAuthSessionStore.getState().session).toBeNull()
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)
  })
})
