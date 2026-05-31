import { create } from 'zustand'
import type { LabRole } from '@ultranos/shared-types'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string
  /** Lab sub-role within LAB_TECH umbrella. Story 42.1. */
  labRole: LabRole | null
}

export type EntitlementStatus = 'active' | 'trial' | 'inactive' | 'checking'

interface AuthSessionState {
  session: AuthSession | null
  isAuthenticated: boolean
  entitlementStatus: EntitlementStatus | null
  setSession: (session: AuthSession) => void
  clearSession: () => void
  setEntitlementStatus: (status: EntitlementStatus) => void
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  session: null,
  isAuthenticated: false,
  entitlementStatus: null,
  setSession: (session) => set({ session, isAuthenticated: true }),
  clearSession: () => set({ session: null, isAuthenticated: false, entitlementStatus: null }),
  setEntitlementStatus: (status) => set({ entitlementStatus: status }),
}))
