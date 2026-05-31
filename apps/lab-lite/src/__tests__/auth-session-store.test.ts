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
      labRole: null,
    })

    const state = useAuthSessionStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.session).toEqual({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
      labRole: null,
    })
  })

  it('clearSession resets to null and false', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
      labRole: null,
    })

    useAuthSessionStore.getState().clearSession()
    expect(useAuthSessionStore.getState().session).toBeNull()
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)
  })

  // Story 42.1 AC 3, 6: labRole in session
  it('setSession stores labRole', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
      labRole: 'SUPERVISOR' as any,
    })

    expect(useAuthSessionStore.getState().session?.labRole).toBe('SUPERVISOR')
  })

  it('labRole defaults to null and is cleared on logout', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'auth-uuid-123',
      practitionerId: 'Practitioner/prac-001',
      role: 'LAB_TECH',
      sessionId: 'sess-abc',
      email: 'tech@lab.example',
      labRole: 'LAB_MANAGER' as any,
    })

    useAuthSessionStore.getState().clearSession()
    expect(useAuthSessionStore.getState().session?.labRole).toBeUndefined()
  })
})
