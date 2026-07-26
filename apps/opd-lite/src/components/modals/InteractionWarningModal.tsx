'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { InteractionResult } from '@/services/interactionService'
import { Button } from '@/components/ui/Button'

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
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset justification when modal opens to prevent stale text from prior interactions
  useEffect(() => {
    if (open) setJustification('')
  }, [open])

  // Focus trap: keep Tab cycling within the modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [onCancel])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    // Focus the first interactive element on open
    const timer = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('textarea')?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [open, handleKeyDown])

  if (!open) return null

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
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interaction-warning-title"
    >
      <style>{`
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-[backdropFadeIn_150ms_ease-out_forwards]"
        aria-hidden="true"
      />
      {/* Modal panel */}
      <div className="relative mx-4 w-full max-w-lg rounded-xl border-2 border-destructive bg-background shadow-2xl animate-[modalSlideIn_200ms_ease-out_forwards]">
        {/* Header */}
        <div className="rounded-t-xl border-b border-destructive/20 bg-destructive/10 px-6 py-4">
          <h2
            id="interaction-warning-title"
            className="text-xl font-semibold text-destructive"
          >
            {modalTitle}
          </h2>
          <p className="mt-1 text-sm font-semibold text-destructive">
            {t('reviewInstructions')}
          </p>
        </div>

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
      </div>
    </div>
  )
}
