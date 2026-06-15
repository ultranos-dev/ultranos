import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Pharmopedia: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set.')
}

/**
 * Supabase client for authentication only.
 * persistSession: false — tokens never go to AsyncStorage.
 * Token is managed by auth-store (memory only).
 * autoRefreshToken: false — refresh is triggered manually on API 401.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: undefined,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
