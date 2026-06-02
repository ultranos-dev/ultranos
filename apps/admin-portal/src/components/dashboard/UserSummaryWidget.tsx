'use client'

import { useRouter } from 'next/navigation'

interface UserCounts {
  total: number
  active: number
  suspended: number
  pendingInvite: number
  withoutMfa: number
}

interface UserSummaryWidgetProps {
  counts: UserCounts
}

export function UserSummaryWidget({ counts }: UserSummaryWidgetProps) {
  const router = useRouter()

  return (
    <div
      onClick={() => router.push('/users')}
      className="rounded-2xl bg-popover border border-border p-6 shadow-card cursor-pointer hover:scale-[1.02] transition-transform duration-200"
    >
      <p className="text-sm font-medium text-muted-foreground">Users</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{counts.total}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {counts.active} active, {counts.suspended} suspended, {counts.pendingInvite} pending invite
      </p>
      {counts.withoutMfa > 0 && (
        <p className="mt-2 text-sm font-medium text-warning">
          {counts.withoutMfa} user{counts.withoutMfa !== 1 ? 's' : ''} without MFA
        </p>
      )}
    </div>
  )
}
