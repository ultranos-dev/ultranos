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
  /** Undefined/null while dashboard stats are still loading. */
  counts?: UserCounts | null
}

/**
 * Users stat card — matches the dashboard top-row stat-card idiom so it sits
 * uniformly beside the other KPI cards. An MFA gap is conveyed with a warning
 * ring (not an extra line) to keep card heights equal.
 */
export function UserSummaryWidget({ counts }: UserSummaryWidgetProps) {
  const router = useRouter()
  const hasMfaGap = !!counts && counts.withoutMfa > 0

  return (
    <button
      type="button"
      onClick={() => router.push('/users')}
      title={hasMfaGap ? `${counts!.withoutMfa} user${counts!.withoutMfa !== 1 ? 's' : ''} without MFA` : undefined}
      className={`flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] transition-colors hover:bg-muted/40 ${
        hasMfaGap ? 'ring-2 ring-warning/50' : 'ring-border/50'
      }`}
    >
      <p className="text-sm font-medium text-muted-foreground">Users</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{counts?.total ?? '—'}</p>
      <p className={`mt-1 text-sm font-medium ${hasMfaGap ? 'text-warning' : 'text-muted-foreground'}`}>
        {counts ? `${counts.active} active, ${counts.suspended} suspended, ${counts.pendingInvite} pending invite` : ' '}
      </p>
    </button>
  )
}
