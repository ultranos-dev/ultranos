'use client'

import { Button } from '@/components/ui/Button'

interface EmptyStateProps {
  icon: 'queue' | 'history' | 'scan' | 'sync' | 'controlled' | 'dispensing'
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

const iconPaths: Record<EmptyStateProps['icon'], string> = {
  queue: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  history: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  scan: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10',
  sync: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M20.49 15a9 9 0 01-14.85 3.36L1 14',
  controlled: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
  dispensing: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z',
}

export function EmptyState({ icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
          <path d={iconPaths[icon]} />
        </svg>
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
