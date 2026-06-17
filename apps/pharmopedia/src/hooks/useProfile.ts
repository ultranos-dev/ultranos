import { useEffect, useState } from 'react'
import { getProfile } from '@/api/users'
import { readProfileCache, writeProfileCache } from '@/lib/profile-cache'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import type { UserProfile } from '@/api/users'

export type ProfileSource = 'cache' | 'network' | 'session' | 'none'

/** A profile is "usable" if it carries a real identity (non-empty display name). */
function isUsable(p: UserProfile | null): boolean {
  return !!p && p.displayName.trim().length > 0
}

/**
 * Build a profile from the Supabase session's user_metadata (written during O2
 * signup) when the Hub `users.getProfile` is unavailable or returns an empty
 * shell. Ensures the profile screen always shows real fields offline / before
 * the patient record is linked.
 */
async function sessionFallback(role: string): Promise<UserProfile | null> {
  try {
    const { data } = await supabase.auth.getUser()
    const u = data.user
    if (!u) return null
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>
    const given = (meta.given_name as string) ?? ''
    const family = (meta.family_name as string) ?? ''
    const displayName = [given, family].filter(Boolean).join(' ')

    if (role === 'PATIENT') {
      const addr = (meta.address ?? {}) as Record<string, string | undefined>
      return {
        kind: 'patient',
        displayName,
        givenName: given,
        photoUrl: meta.photo_url as string | undefined,
        phone: u.phone ?? undefined,
        currentAddress: { province: addr.province, district: addr.district, village: addr.village },
        preferredLanguage: meta.preferred_language as string | undefined,
        tier: 'FREE',
      }
    }
    return {
      kind: 'practitioner',
      displayName: displayName || (u.email ?? ''),
      givenName: given,
      familyName: family,
      role,
      email: u.email ?? undefined,
      phone: u.phone ?? undefined,
      status: 'ACTIVE',
    }
  } catch {
    return null
  }
}

export function useProfile(): { profile: UserProfile | null; source: ProfileSource; loading: boolean } {
  const token = useAuthStore((s) => s.token)
  const sub = useAuthStore((s) => s.user?.sub)
  const role = useAuthStore((s) => s.user?.role) ?? 'PATIENT'
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [source, setSource] = useState<ProfileSource>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const db = getDatabase()
      let resolved: UserProfile | null = null

      if (sub) {
        const cached = await readProfileCache(db, sub).catch(() => null)
        if (!cancelled && cached) { resolved = cached; setProfile(cached); setSource('cache') }
      }

      if (token && sub) {
        try {
          const fresh = await getProfile(token)
          if (isUsable(fresh)) {
            resolved = fresh
            if (!cancelled) { setProfile(fresh); setSource('network') }
            await writeProfileCache(db, sub, fresh)
          }
        } catch {
          // fall through to the session fallback
        }
      }

      // No cache and no usable Hub profile → derive from the session metadata.
      if (!cancelled && !isUsable(resolved)) {
        const fb = await sessionFallback(role)
        if (!cancelled && fb) { resolved = fb; setProfile(fb); setSource('session') }
      }

      if (!cancelled) setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [token, sub, role])

  return { profile, source, loading }
}
