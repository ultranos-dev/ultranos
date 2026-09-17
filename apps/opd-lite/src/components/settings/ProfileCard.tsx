'use client'

import { useEffect, useState } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getHubTrpcUrl } from '@/lib/hub-url'
import { uploadStaffPhoto, removeStaffPhoto } from '@/lib/staff-photo-api'
import { Card } from '@/components/Card'
import { PhotoAvatarField } from '@ultranos/ui-kit/components/photo/photo-avatar-field'

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
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Profile</h2>

      <div className="flex items-start gap-4">
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
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Name</p>
            <p className="text-sm text-foreground">{displayName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Role</p>
            <p className="text-sm text-foreground">{formatRole(session.role)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">ID</p>
            <p className="text-sm font-mono text-foreground">{session.practitionerId}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="text-sm text-foreground">{session.email || '·'}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
