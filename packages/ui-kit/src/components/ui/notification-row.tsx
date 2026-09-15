'use client'
import type { LucideIcon } from 'lucide-react'
import { Bell, Trash2 } from '../../icons.js'
import { DirectionalIcon } from '../DirectionalIcon.js'

export interface NotificationRowProps {
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  timeAgo: string; unread?: boolean; urgent?: boolean; unreadLabel?: string; onClick?: () => void
  onToggleRead?: () => void
  onDelete?: () => void
  markReadLabel?: string
  markUnreadLabel?: string
  deleteLabel?: string
}

export function NotificationRow({ icon: Icon, appName, subject, timeAgo, unread, urgent, unreadLabel, onClick, onToggleRead, onDelete, markReadLabel, markUnreadLabel, deleteLabel }: NotificationRowProps) {
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      className={`flex items-center gap-3 px-4 py-2.5 outline-none transition-colors cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${unread ? 'bg-primary/10' : ''} ${urgent ? 'ring-1 ring-inset ring-destructive/40' : ''}`}>
      <div className="shrink-0">
        <DirectionalIcon category="medical"><Icon className={`h-4 w-4 ${urgent ? 'text-destructive' : 'text-primary'}`} aria-hidden /></DirectionalIcon>
      </div>
      <div className="min-w-0 flex-1 flex items-baseline gap-1.5 overflow-hidden">
        <span className={`shrink-0 text-xs text-muted-foreground ${unread ? 'font-bold' : 'font-normal'}`}>{appName}</span>
        <span className="text-muted-foreground/60 text-xs select-none" aria-hidden>·</span>
        <span className={`truncate text-sm ${unread ? 'font-bold' : 'font-normal'} ${urgent ? 'text-destructive' : 'text-foreground'}`}>{subject}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ms-auto">
        {unread && <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={unreadLabel} aria-hidden={!unreadLabel} />}
        <span data-slot="notification-time" className="shrink-0 text-xs font-normal text-muted-foreground">{timeAgo}</span>
        {onToggleRead && (
          <button
            type="button"
            aria-label={unread ? markReadLabel : markUnreadLabel}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={e => { e.stopPropagation(); onToggleRead() }}
          >
            {unread
              ? <Bell className="h-4 w-4" fill="currentColor" aria-hidden />
              : <Bell className="h-4 w-4" aria-hidden />}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label={deleteLabel}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
