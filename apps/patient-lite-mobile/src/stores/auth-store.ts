/**
 * Auth Store — Zustand store for patient authentication state.
 *
 * Story 18.2, Task 2: Manages OTP session lifecycle.
 *
 * State tracks:
 * - Authentication status and user ID
 * - Session expiry (90-day duration per PRD Section 10.1)
 * - First login flag (drives biometric enrollment + language onboarding)
 * - Biometric enrollment status
 *
 * Security: userId is the Supabase user UUID — no phone numbers stored (AC #12).
 */
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const AUTH_META_KEY = 'ultranos_auth_meta'

interface AuthMeta {
  userId: string
  sessionExpiresAt: string
  biometricEnrolled: boolean
}

export interface AuthState {
  /** Whether a valid session exists */
  isAuthenticated: boolean
  /** Supabase user UUID (never phone number) */
  userId: string | null
  /** ISO timestamp when the 90-day session expires */
  sessionExpiresAt: string | null
  /** True on the very first successful login */
  isFirstLogin: boolean
  /** Whether the user has enrolled biometrics for this session */
  biometricEnrolled: boolean
  /** Whether session restoration has completed */
  initialized: boolean

  /** Set session after successful OTP verification */
  setSession: (userId: string, expiresAt: string, isFirstLogin: boolean) => Promise<void> | void
  /** Clear session on expiry or logout */
  clearSession: () => void
  /** Mark biometric as enrolled */
  setBiometricEnrolled: () => void
  /** Restore session from secure storage on app launch */
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  userId: null,
  sessionExpiresAt: null,
  isFirstLogin: false,
  biometricEnrolled: false,
  initialized: false,

  setSession: async (userId, expiresAt, isFirstLogin) => {
    // Preserve existing biometric enrollment for returning users (P3 fix)
    const existingBiometric = get().biometricEnrolled
    set({
      isAuthenticated: true,
      userId,
      sessionExpiresAt: expiresAt,
      isFirstLogin,
      biometricEnrolled: existingBiometric,
    })
    // Persist auth metadata to secure store (no PHI — only user UUID + timestamps)
    persistAuthMeta({ userId, sessionExpiresAt: expiresAt, biometricEnrolled: existingBiometric })
  },

  clearSession: () => {
    set({
      isAuthenticated: false,
      userId: null,
      sessionExpiresAt: null,
      isFirstLogin: false,
      biometricEnrolled: false,
    })
    SecureStore.deleteItemAsync(AUTH_META_KEY).catch(() => {
      // Best-effort cleanup
    })
  },

  setBiometricEnrolled: () => {
    const { userId, sessionExpiresAt } = get()
    set({ biometricEnrolled: true })
    if (userId && sessionExpiresAt) {
      persistAuthMeta({ userId, sessionExpiresAt, biometricEnrolled: true })
    }
  },

  restoreSession: async () => {
    try {
      const raw = await SecureStore.getItemAsync(AUTH_META_KEY)
      if (!raw) {
        set({ initialized: true })
        return
      }

      const meta: AuthMeta = JSON.parse(raw)

      // Check if session has expired
      if (new Date(meta.sessionExpiresAt) <= new Date()) {
        await SecureStore.deleteItemAsync(AUTH_META_KEY)
        set({ initialized: true })
        return
      }

      set({
        isAuthenticated: true,
        userId: meta.userId,
        sessionExpiresAt: meta.sessionExpiresAt,
        isFirstLogin: false,
        biometricEnrolled: meta.biometricEnrolled,
        initialized: true,
      })
    } catch {
      // Corrupted data — start fresh
      set({ initialized: true })
    }
  },
}))

function persistAuthMeta(meta: AuthMeta): void {
  SecureStore.setItemAsync(AUTH_META_KEY, JSON.stringify(meta), {
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  }).catch(() => {
    // Best-effort — session will still work from memory
  })
}
