import { create } from 'zustand'
import { getSupabaseBrowserClient } from '@/lib/supabase'

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
  getAccessToken: () => Promise<string | null>
}

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
    return `Practitioner/${session.practitionerId}`
  },

  getAccessToken: async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },
}))
