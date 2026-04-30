import { create } from 'zustand'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
}

interface AuthSessionState {
  session: AuthSession | null
  isAuthenticated: boolean

  setSession: (session: AuthSession) => void
  clearSession: () => void
  getPractitionerRef: () => string
}

/**
 * Auth session store — holds the authenticated user's FHIR Practitioner reference.
 * Replaces the hardcoded 'Practitioner/current-user' constant (AC 4, D29, D44, D52).
 *
 * Session data is kept in memory only (never localStorage/sessionStorage for PHI safety).
 * Tab close → state cleared automatically.
 */
export const useAuthSessionStore = create<AuthSessionState>()((set, get) => ({
  session: null,
  isAuthenticated: false,

  setSession: (session) => set({ session, isAuthenticated: true }),

  clearSession: () => set({ session: null, isAuthenticated: false }),

  getPractitionerRef: () => {
    const { session } = get()
    if (!session) {
      throw new Error('No authenticated session — cannot resolve Practitioner reference')
    }
    return session.practitionerId
  },
}))
