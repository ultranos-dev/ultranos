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
      <h2 className="mb-4 text-sm font-semibold text-foreground">Profile</h2>

      <div className="flex items-start gap-4">
        {/* Initials avatar */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {initials}
        </div>

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
