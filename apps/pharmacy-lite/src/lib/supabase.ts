import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
  )
}

/**
 * Singleton Supabase browser client for Pharmacy Lite.
 * Used for authentication (Supabase Auth) only.
 * Pharmacy Lite clinical data access goes through Hub API — not directly via Supabase.
 */
/**
 * App-specific auth cookie name. All Ultranos web apps share one Supabase
 * project; without a distinct name they'd share the default `sb-<ref>-auth-token`
 * cookie, which is shared across ports on `localhost` (cookies ignore port),
 * causing the last login in any app to leak into every other app's tab.
 */
export const AUTH_COOKIE_NAME = 'sb-pharmacy-auth'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(supabaseUrl!, supabaseAnonKey!, {
      cookieOptions: { name: AUTH_COOKIE_NAME },
    })
  }
  return client
}
