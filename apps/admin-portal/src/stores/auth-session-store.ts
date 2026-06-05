import { create } from 'zustand'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string
  name: string
}

interface AuthSessionState {
  session: AuthSession | null
  isAuthenticated: boolean

  setSession: (session: AuthSession) => void
  clearSession: () => void
}

/**
 * Admin auth session store — holds the authenticated admin user's session.
 * Session data is kept in memory only (never localStorage/sessionStorage per CLAUDE.md).
 * Tab close → state cleared automatically.
 */
export const useAuthSessionStore = create<AuthSessionState>()((set) => ({
  session: null,
  isAuthenticated: false,

  setSession: (session) => set({ session, isAuthenticated: true }),

  clearSession: () => set({ session: null, isAuthenticated: false }),
}))
