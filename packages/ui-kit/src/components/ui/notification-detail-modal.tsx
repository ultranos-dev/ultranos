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
  /** Labelled detail rows rendered as a <dl> below the body/patient line. */
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
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-xs font-medium text-muted-foreground">{appName}</span>
          </div>
          <DialogTitle>{subject}</DialogTitle>
          {body ? <DialogDescription>{body}</DialogDescription> : <DialogDescription className="sr-only">{subject}</DialogDescription>}
        </DialogHeader>

        {/* Patient line — below subject/body, above details */}
        {patientLoading ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="patient-loading"
            aria-busy="true"
          >
            …
          </p>
        ) : patient ? (
          <p className="text-sm font-medium text-foreground">
            <span className="text-muted-foreground">{patient.label}</span>
            {': '}
            <span>{patient.value}</span>
          </p>
        ) : null}

        {/* Details list */}
        {details && details.length > 0 && (
          <dl className="flex flex-col gap-1">
            {details.map((f) => (
              <div key={f.label} className="flex justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className={f.emphasis ? 'text-destructive font-medium' : 'text-foreground'}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

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
