import { create } from 'zustand'
import type { LabRole } from '@ultranos/shared-types'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string
  /** Display name derived from user metadata (full_name/name/given+family). Optional; may be empty. */
  name?: string
  /** Lab name from settings/config; not populated by setSession today. Optional. */
  labName?: string
  /** Lab identifier from settings/config; not populated by setSession today. Optional. */
  labId?: string
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
