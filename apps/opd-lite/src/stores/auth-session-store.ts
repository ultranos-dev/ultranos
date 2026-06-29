import { create } from 'zustand'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string
  /** Full display name from Supabase user_metadata (e.g. "Dr. Toor Khan"). */
  name?: string
  kycStatus?: string
}

export type EntitlementStatus = 'active' | 'trial' | 'inactive' | 'checking'

interface AuthSessionState {
  session: AuthSession | null
  isAuthenticated: boolean
  entitlementStatus: EntitlementStatus | null

  setSession: (session: AuthSession) => void
  clearSession: () => void
  getPractitionerRef: () => string
  setEntitlementStatus: (status: EntitlementStatus) => void
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
  entitlementStatus: null,

  setSession: (session) => set({ session, isAuthenticated: true }),

  clearSession: () => set({ session: null, isAuthenticated: false, entitlementStatus: null }),

  setEntitlementStatus: (status) => set({ entitlementStatus: status }),

  getPractitionerRef: () => {
    const { session } = get()
    if (!session) {
      throw new Error('No authenticated session — cannot resolve Practitioner reference')
    }
    return session.practitionerId
  },
}))
