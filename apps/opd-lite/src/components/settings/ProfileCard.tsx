'use client'

import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Card } from '@/components/Card'

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

export function ProfileCard() {
  const session = useAuthSessionStore((s) => s.session)

  if (!session) return null

  const displayName = session.email?.split('@')[0] || 'Unknown'
  const initials = getInitials(displayName)

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-neutral-900">Profile</h2>

      <div className="flex items-start gap-4">
        {/* Initials avatar */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
          {initials}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-medium text-neutral-500">Name</p>
            <p className="text-sm text-neutral-900">{displayName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500">Role</p>
            <p className="text-sm text-neutral-900">{formatRole(session.role)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500">ID</p>
            <p className="text-sm font-mono text-neutral-900">{session.practitionerId}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500">Email</p>
            <p className="text-sm text-neutral-900">{session.email || '—'}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
