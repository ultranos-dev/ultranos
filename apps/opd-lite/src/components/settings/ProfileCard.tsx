'use client'

import { useEffect, useState } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getHubTrpcUrl } from '@/lib/hub-url'
import { uploadStaffPhoto, removeStaffPhoto } from '@/lib/staff-photo-api'
import { PhotoAvatarField } from '@ultranos/ui-kit/components/photo/photo-avatar-field'
import { AVATAR_RING } from '@ultranos/ui-kit/components/ui/avatar'

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('')
}

function formatRole(role: string): string {
  if (!role) return 'Clinician'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

interface PractitionerProfile {
  practitionerId?: string
  displayName?: string
  avatarUrl?: string | null
  updatedAt?: string | null
}

export function ProfileCard() {
  const t = useTranslations('settings')
  const session = useAuthSessionStore((s) => s.session)
  const [practitionerProfile, setPractitionerProfile] = useState<PractitionerProfile | null>(null)
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [avatarUpdatedAt, setAvatarUpdatedAt] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        const token = data.session?.access_token
        if (!token) return
        const input = encodeURIComponent(JSON.stringify({ json: {} }))
        const res = await fetch(`${getHubTrpcUrl()}/users.getProfile?input=${input}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const body = await res.json() as { result?: { data?: { json?: PractitionerProfile } } }
        const prof = body?.result?.data?.json
        if (!cancelled && prof) {
          setPractitionerProfile(prof)
          setAvatarKey(prof.avatarUrl ?? null)
          setAvatarUpdatedAt(prof.updatedAt ?? '')
        }
      } catch {
        // Non-blocking — falls back to initials
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!session) return null

  const displayName = practitionerProfile?.displayName || session.email?.split('@')[0] || 'Unknown'
  const initials = getInitials(displayName)
  // Only show PhotoAvatarField once the profile fetch resolves with a practitionerId.
  // While loading (practitionerProfile null), show the initials avatar.
  const resolvedPractitionerId = practitionerProfile?.practitionerId ?? null

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <h3 className="border-b border-border px-[18px] py-4 text-[15px] font-bold text-foreground">
        {t('profile')}
      </h3>

      <div className="p-[18px]">
        <div className="flex items-center gap-[18px]">
          {resolvedPractitionerId ? (
            <PhotoAvatarField
              name={displayName}
              photoKey={avatarKey}
              lastKnownUpdate={avatarUpdatedAt}
              signUrl={async (key) => {
                const { data } = await getSupabaseBrowserClient().storage
                  .from('staff-photos')
                  .createSignedUrl(key, 3600)
                return data?.signedUrl ?? null
              }}
              uploadFn={async (blob, lku) => {
                const result = await uploadStaffPhoto(resolvedPractitionerId, blob, lku)
                return { photoKey: result.photoUrl, lastUpdated: result.lastUpdated }
              }}
              removeFn={async (lku) => {
                return removeStaffPhoto(resolvedPractitionerId, lku)
              }}
              onUpdated={(key, lastUpdated) => {
                setAvatarKey(key)
                setAvatarUpdatedAt(lastUpdated)
              }}
            />
          ) : (
            /* Initials fallback — shown while loading or when no practitioner row */
            <div className={`flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground ${AVATAR_RING}`}>
              {initials}
            </div>
          )}

          <dl className="grid min-w-0 flex-1 grid-cols-[100px_1fr] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground">{t('name')}</dt>
            <dd className="min-w-0 truncate text-foreground" dir="auto">{displayName}</dd>

            <dt className="text-muted-foreground">{t('role')}</dt>
            <dd className="text-foreground">{formatRole(session.role)}</dd>

            <dt className="text-muted-foreground">{t('email')}</dt>
            <dd className="min-w-0 truncate text-foreground">{session.email || '·'}</dd>

            <dt className="text-muted-foreground">{t('practitionerId')}</dt>
            <dd className="min-w-0 truncate font-mono text-xs text-muted-foreground">{session.practitionerId}</dd>
          </dl>
        </div>
      </div>
    </section>
  )
}
