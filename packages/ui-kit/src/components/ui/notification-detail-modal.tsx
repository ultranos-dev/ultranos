'use client'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog.js'
import { Button } from './button.js'

export interface NotificationDetailField {
  label: string
  value: string
  emphasis?: boolean
}

export interface NotificationDetailModalProps {
  open: boolean; onOpenChange: (o: boolean) => void
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  exactTimestamp: string; action?: { label: string; onClick: () => void }
  /** Labelled detail rows rendered as a <dl> below the patient line. */
  details?: NotificationDetailField[]
  /** Resolved patient label+value to display prominently below the subject. Pass null to hide. */
  patient?: { label: string; value: string } | null
  /** When true, show a loading placeholder instead of the patient value. */
  patientLoading?: boolean
}

export function NotificationDetailModal({
  open, onOpenChange, icon: Icon, appName, subject, body, notes,
  exactTimestamp, action, details, patient, patientLoading,
}: NotificationDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex flex-col gap-4">
          {/* Header: icon + appName micro-label */}
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-xs font-medium text-muted-foreground">{appName}</span>
            </div>
            <DialogTitle className="text-base font-semibold text-foreground">{subject}</DialogTitle>
            {body ? <DialogDescription>{body}</DialogDescription> : <DialogDescription className="sr-only">{subject}</DialogDescription>}
          </DialogHeader>

          {/* Patient line — prominent, emphasized */}
          {patientLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="patient-loading"
              role="status"
            >
              …
            </p>
          ) : patient ? (
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <p className="text-sm font-semibold text-foreground">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide me-2">{patient.label}</span>
                <span>{patient.value}</span>
              </p>
            </div>
          ) : null}

          {/* Details list — aligned grid */}
          {details && details.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              {details.map((f, index) => (
                <div key={`${f.label}-${index}`} className="contents">
                  <dt className="text-xs font-medium text-muted-foreground self-center">{f.label}</dt>
                  <dd className={`text-sm ${f.emphasis ? 'text-destructive font-medium' : 'text-foreground'}`}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* Notes — distinct block with separator */}
          {notes && (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">{notes}</p>
          )}

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground">{exactTimestamp}</p>
        </div>

        {action && (
          <DialogFooter>
            <Button onClick={action.onClick}>{action.label}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
