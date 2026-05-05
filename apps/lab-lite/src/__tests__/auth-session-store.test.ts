import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthSessionStore } from '../stores/auth-session-store'

describe('useAuthSessionStore', () => {
  beforeEach(() => {
    useAuthSessionStore.getState().clearSession()
  })

  it('starts with null session (unauthenticated)', () => {
    const state = useAuthSessionStore.getState()
    expect(state.session).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('setSession populates session and sets isAuthenticated', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
    })

    const state = useAuthSessionStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.session).toEqual({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
    })
  })

  it('clearSession resets to null and false', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
    })

    useAuthSessionStore.getState().clearSession()
    expect(useAuthSessionStore.getState().session).toBeNull()
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)
  })
})
