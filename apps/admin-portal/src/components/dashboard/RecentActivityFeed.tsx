'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Activity as ActivityIcon } from '@ultranos/ui-kit/icons'

interface Activity {
  id: string
  timestamp: string
  actorId: string
  action: string
  resourceType: string
  resourceId: string
  outcome: string
  description: string
}

function dotColor(action: string | undefined | null): string {
  const a = (action ?? '').toLowerCase()
  if (a.includes('approv')) return 'bg-success'
  if (a.includes('suspend') || a.includes('revok')) return 'bg-destructive'
  return 'bg-primary'
}

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function RecentActivityFeed() {
  const router = useRouter()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    trpc.admin.recentActivity
      .query({ limit: 10 })
      .then((res) => setActivities(res.activities))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Recent Activity</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => router.push('/audit')}
          className="p-0 h-auto"
        >
          View All &rarr;
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading activity…</p>
      ) : error ? (
        <div className="mt-4">
          <EmptyState
            size="sm"
            icon={ActivityIcon}
            title="Activity unavailable"
            description="Could not load recent activity."
          />
        </div>
      ) : activities.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No recent activity.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activities.map((activity, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dotColor(activity.action)}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{activity.description}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(activity.timestamp)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
