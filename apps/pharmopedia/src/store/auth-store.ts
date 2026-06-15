import { create } from 'zustand'
import type * as SQLite from 'expo-sqlite'
import { clearCatalog } from '@/db/drug-catalog'
import { clearBookmarks } from '@/db/bookmarks'
import { useSyncStore } from './sync-store'
import { useBookmarkStore } from './bookmark-store'
import { supabase } from '@/lib/supabase'

export interface AuthUser {
  sub: string
  role: string
  facilityId?: string
}

interface AuthState {
  /** JWT access token — in memory only, never written to AsyncStorage or SecureStore */
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  initialized: boolean
  /**
   * Set session after successful login.
   * token: Supabase session.access_token (JWT RS256)
   */
  login: (token: string, user: AuthUser) => void
  /**
   * Clear session and wipe local drug catalog + sync meta.
   * Role change on next login forces a fresh sync.
   */
  logout: (db: SQLite.SQLiteDatabase) => Promise<void>
  /** Mark as initialized (called by root layout after session check). */
  initialize: () => void
  /** Refresh the Supabase JWT. Updates token in store on success; calls logout on failure. */
  refreshToken: (db: SQLite.SQLiteDatabase) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  initialized: false,

  login: (token, user) => {
    set({ token, user, isAuthenticated: true })
  },

  logout: async (db) => {
    set({ token: null, user: null, isAuthenticated: false })
    useSyncStore.getState().reset()
    useBookmarkStore.getState().reset()
    await clearCatalog(db)
    await clearBookmarks(db)
  },

  initialize: () => {
    set({ initialized: true })
  },

  refreshToken: async (db) => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) {
      // Session expired — force logout and clear local data
      const { logout } = get()
      await logout(db)
      return
    }
    set({
      token: data.session.access_token,
      isAuthenticated: true,
      user: {
        sub: data.session.user.id,
        role: (data.session.user.app_metadata?.['role'] as string) ?? get().user?.role ?? '',
        facilityId: (data.session.user.app_metadata?.['facilityId'] as string | undefined) ?? get().user?.facilityId,
      },
    })
  },
}))
