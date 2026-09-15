'use client'
import type { LucideIcon } from 'lucide-react'
import { DirectionalIcon } from '../DirectionalIcon.js'

export interface NotificationRowProps {
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  timeAgo: string; unread?: boolean; urgent?: boolean; onClick?: () => void
}

export function NotificationRow({ icon: Icon, appName, subject, body, notes, timeAgo, unread, urgent, onClick }: NotificationRowProps) {
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
      className={`flex items-start gap-3 px-4 py-3 outline-none transition-colors cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${unread ? 'bg-primary/10' : ''} ${urgent ? 'ring-1 ring-inset ring-destructive/40' : ''}`}>
      <div className="mt-0.5 shrink-0">
        <DirectionalIcon category="medical"><Icon className={`h-5 w-5 ${urgent ? 'text-destructive' : 'text-primary'}`} aria-hidden /></DirectionalIcon>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`text-sm font-medium ${urgent ? 'text-destructive' : 'text-foreground'}`}>{appName}</p>
          {unread && <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          <span data-slot="notification-time" className="ms-auto shrink-0 text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="mt-0.5 text-sm text-foreground">{subject}</p>
        {body && <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>}
        {notes && <p className="mt-0.5 text-xs text-muted-foreground/80">{notes}</p>}
      </div>
    </div>
  )
}
