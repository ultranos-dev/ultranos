'use client'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog.js'
import { Button } from './button.js'

export interface NotificationDetailModalProps {
  open: boolean; onOpenChange: (o: boolean) => void
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  exactTimestamp: string; action?: { label: string; onClick: () => void }
}

export function NotificationDetailModal({ open, onOpenChange, icon: Icon, appName, subject, body, notes, exactTimestamp, action }: NotificationDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-xs font-medium text-muted-foreground">{appName}</span>
          </div>
          <DialogTitle>{subject}</DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        {notes && <p className="text-sm text-muted-foreground">{notes}</p>}
        <p className="text-xs text-muted-foreground">{exactTimestamp}</p>
        {action && (
          <DialogFooter>
            <Button onClick={action.onClick}>{action.label}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
