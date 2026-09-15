'use client'
import React from 'react'
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

          {/* Unified details list — patient row (light-green) always first, then detail rows */}
          {(patientLoading || patient || (details && details.length > 0)) && (
            <dl className="grid grid-cols-[auto_1fr] gap-y-1">
              {/* Patient row — continuous light-green background band */}
              {patientLoading ? (
                <React.Fragment>
                  <dt className="bg-primary/10 rounded-s-md flex items-center py-2 ps-3 pe-4 text-xs font-medium text-muted-foreground" />
                  <dd
                    className="bg-primary/10 rounded-e-md flex items-center py-2 pe-3 text-sm"
                    role="status"
                    data-testid="patient-loading"
                  >
                    <span className="inline-block h-4 w-32 animate-pulse rounded bg-primary/20" />
                  </dd>
                </React.Fragment>
              ) : patient ? (
                <React.Fragment>
                  <dt className="bg-primary/10 rounded-s-md flex items-center py-2 ps-3 pe-4 text-xs font-medium text-muted-foreground">{patient.label}</dt>
                  <dd className="bg-primary/10 rounded-e-md flex items-center py-2 pe-3 text-sm font-semibold text-foreground">{patient.value}</dd>
                </React.Fragment>
              ) : null}

              {/* Detail rows — matching column alignment via same padding */}
              {details && details.map((f) => (
                <React.Fragment key={f.label}>
                  <dt className="py-1 ps-3 pe-4 text-xs font-medium text-muted-foreground self-center">{f.label}</dt>
                  <dd className={`py-1 pe-3 text-sm ${f.emphasis ? 'text-destructive font-medium' : 'text-foreground'}`}>
                    {f.value}
                  </dd>
                </React.Fragment>
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
