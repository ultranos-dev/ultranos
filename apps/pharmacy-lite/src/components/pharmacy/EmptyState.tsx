'use client'

import { List, Clock, Scan, RefreshCw, ShieldAlert, Bookmark } from '@ultranos/ui-kit/icons'
import type { LucideIcon } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

interface EmptyStateProps {
  icon: 'queue' | 'history' | 'scan' | 'sync' | 'controlled' | 'dispensing'
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

const ICON_MAP: Record<EmptyStateProps['icon'], LucideIcon> = {
  queue: List,
  history: Clock,
  scan: Scan,
  sync: RefreshCw,
  controlled: ShieldAlert,
  dispensing: Bookmark,
}

export function EmptyState({ icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  const Icon = ICON_MAP[icon]

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
        <Icon size={28} className="text-primary-600" />
      </div>
      <h3 className="text-sm font-semibold text-neutral-800 mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 max-w-xs mb-4">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        actionHref ? (
          <a href={actionHref}>
            <Button variant="primary" type="button">{actionLabel}</Button>
          </a>
        ) : (
          <Button variant="primary" type="button" onClick={onAction}>{actionLabel}</Button>
        )
      )}
    </div>
  )
}
