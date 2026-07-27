'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { InteractionResult } from '@/services/interactionService'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'

interface InteractionWarningModalProps {
  open: boolean
  interactions: InteractionResult[]
  onCancel: () => void
  onOverride: (justification: string) => void
}

const SEVERITY_STYLES: Record<
  string,
  { bg: string; text: string; border: string; badge: string; label?: string }
> = {
  // Highest severity: patient-specific allergy match. Strongest destructive
  // treatment (solid badge + full-strength border) so it never reads as a
  // generic drug–drug interaction, and a plain "ALLERGY" label.
  [DrugInteractionSeverity.ALLERGY_MATCH]: {
    bg: 'bg-destructive/20',
    text: 'text-destructive',
    border: 'border-destructive',
    badge: 'bg-destructive text-destructive-foreground',
    label: 'ALLERGY',
  },
  [DrugInteractionSeverity.CONTRAINDICATED]: {
    bg: 'bg-destructive/20',
    text: 'text-destructive',
    border: 'border-destructive/30',
    badge: 'bg-destructive/20 text-destructive',
  },
  [DrugInteractionSeverity.MAJOR]: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/20',
    badge: 'bg-destructive/10 text-destructive',
  },
  [DrugInteractionSeverity.MODERATE]: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/20',
    badge: 'bg-warning/10 text-warning',
  },
  [DrugInteractionSeverity.MINOR]: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/20',
    badge: 'bg-warning/10 text-warning',
  },
}

function getSeverityStyle(severity: DrugInteractionSeverity) {
  return (SEVERITY_STYLES[severity] ?? SEVERITY_STYLES[DrugInteractionSeverity.MAJOR])!
}

export function InteractionWarningModal({
  open,
  interactions,
  onCancel,
  onOverride,
}: InteractionWarningModalProps) {
  const t = useTranslations('interactionModal')
  const [justification, setJustification] = useState('')

  // Reset justification when modal opens to prevent stale text from prior interactions
  useEffect(() => {
    if (open) setJustification('')
  }, [open])

  const hasContraindicated = interactions.some(
    (i) => i.severity === DrugInteractionSeverity.CONTRAINDICATED || i.severity === DrugInteractionSeverity.ALLERGY_MATCH,
  )
  const modalTitle = hasContraindicated ? t('contraindicationDetected') : t('majorInteractionDetected')

  const handleOverride = () => {
    if (justification.trim().length > 0) {
      onOverride(justification.trim())
      setJustification('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className="max-w-lg p-0 gap-0 overflow-hidden border-2 border-destructive"
      >
        {/* Header */}
        <DialogHeader className="border-b border-destructive/20 bg-destructive/10 px-6 py-4">
          <DialogTitle className="text-xl font-semibold text-destructive">
            {modalTitle}
          </DialogTitle>
          <p className="mt-1 text-sm font-semibold text-destructive">
            {t('reviewInstructions')}
          </p>
        </DialogHeader>

        {/* Interaction list */}
        <div className="max-h-64 overflow-y-auto px-6 py-4">
          <ul className="space-y-3">
            {interactions.map((interaction, idx) => {
              const style = getSeverityStyle(interaction.severity)
              return (
                <li
                  key={`${interaction.drugA}-${interaction.drugB}-${idx}`}
                  className={`rounded-xl border ${style.border} ${style.bg} p-3`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${style.badge}`}
                    >
                      {interaction.severity === DrugInteractionSeverity.ALLERGY_MATCH
                        ? t('severityAllergy')
                        : (style.label ?? interaction.severity)}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {interaction.drugA} + {interaction.drugB}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {interaction.description}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Override justification */}
        <div className="border-t border-border px-6 py-4">
          <label
            htmlFor="override-justification"
            className="mb-2 block text-sm font-bold text-foreground"
          >
            {t('justificationLabel')}
          </label>
          <textarea
            id="override-justification"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive"
            rows={2}
            placeholder={t('justificationPlaceholder')}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
          <Button
            variant="secondary"
            type="button"
            onClick={onCancel}
            aria-label={t('cancelPrescription')}
          >
            {t('cancelPrescription')}
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleOverride}
            disabled={justification.trim().length === 0}
            aria-label={t('proceedAnyway')}
          >
            {t('proceedAnyway')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
