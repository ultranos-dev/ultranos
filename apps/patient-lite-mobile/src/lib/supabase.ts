/**
 * Supabase client for Patient Lite Mobile.
 *
 * Story 18.2, Task 1: OTP Authentication
 *
 * Security constraints (AC #12, CLAUDE.md):
 * - Access token stored in memory only (never AsyncStorage or SecureStore)
 * - Refresh token stored in expo-secure-store with WHEN_PASSCODE_SET_THIS_DEVICE_ONLY
 * - Phone number never logged or stored outside of Supabase Auth
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set')
}

const REFRESH_TOKEN_KEY = 'ultranos_supabase_refresh_token'

/**
 * Custom storage adapter that intercepts the Supabase session JSON blob.
 *
 * Supabase JS v2 stores the entire session (access_token + refresh_token + user)
 * under a single key (e.g. "supabase.auth.token"). This adapter:
 * - Extracts the refresh_token from the JSON and stores it in SecureStore
 * - Keeps the rest of the session (with refresh_token stripped) in memory only
 * - On read, re-injects the refresh_token from SecureStore into the session JSON
 *
 * This satisfies the CLAUDE.md requirement:
 * "Access tokens: JWT RS256, stored in memory only (never localStorage)"
 */
const memoryTokens: Record<string, string> = {}

const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const inMemory = memoryTokens[key] ?? null
    if (!inMemory) return null

    // Re-inject the refresh token from SecureStore into the session JSON
    try {
      const parsed = JSON.parse(inMemory)
      if (parsed && typeof parsed === 'object') {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
        if (refreshToken) {
          parsed.refresh_token = refreshToken
        }
        return JSON.stringify(parsed)
      }
    } catch {
      // Not JSON — return as-is
    }
    return inMemory
  },

  async setItem(key: string, value: string): Promise<void> {
    // Extract refresh_token from the session JSON and store it in SecureStore
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && parsed.refresh_token) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, parsed.refresh_token, {
          keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
        })
        // Store the session in memory WITHOUT the refresh token
        const { refresh_token: _rt, ...rest } = parsed
        memoryTokens[key] = JSON.stringify(rest)
        return
      }
    } catch {
      // Not JSON — store as-is in memory
    }
    memoryTokens[key] = value
  },

  async removeItem(key: string): Promise<void> {
    delete memoryTokens[key]
    // Also clear the refresh token from SecureStore
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {})
  },
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/**
 * Clear all in-memory tokens and the refresh token from SecureStore.
 * Called on session expiry or logout.
 */
export async function clearAuthTokens(): Promise<void> {
  for (const key of Object.keys(memoryTokens)) {
    delete memoryTokens[key]
  }
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {})
}
