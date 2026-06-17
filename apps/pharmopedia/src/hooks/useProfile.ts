import { useEffect, useState } from 'react'
import { getProfile } from '@/api/users'
import { readProfileCache, writeProfileCache } from '@/lib/profile-cache'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import type { UserProfile } from '@/api/users'

export type ProfileSource = 'cache' | 'network' | 'none'

export function useProfile(): { profile: UserProfile | null; source: ProfileSource; loading: boolean } {
  const token = useAuthStore((s) => s.token)
  const sub = useAuthStore((s) => s.user?.sub)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [source, setSource] = useState<ProfileSource>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const db = getDatabase()
      if (sub) {
        const cached = await readProfileCache(db, sub).catch(() => null)
        if (!cancelled && cached) { setProfile(cached); setSource('cache') }
      }
      if (token && sub) {
        try {
          const fresh = await getProfile(token)
          if (!cancelled) { setProfile(fresh); setSource('network'); await writeProfileCache(db, sub, fresh) }
        } catch {
          // keep cache; if none, source stays 'none'
        }
      }
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [token, sub])

  return { profile, source, loading }
}
