import { create } from 'zustand'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string
  name?: string
  pharmacyName?: string
  licenseRef?: string
  loginAt?: string
}

export type EntitlementStatus = 'active' | 'trial' | 'inactive' | 'checking'

interface AuthSessionState {
  session: AuthSession | null
  isAuthenticated: boolean
  entitlementStatus: EntitlementStatus | null
  setSession: (session: AuthSession) => void
  clearSession: () => void
  getPractitionerRef: () => string
  getAccessToken: () => Promise<string | null>
  setEntitlementStatus: (status: EntitlementStatus) => void
}

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
    return `Practitioner/${session.practitionerId}`
  },

  getAccessToken: async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },
}))
