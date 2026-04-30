'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { InteractionResult } from '@/services/interactionService'

interface InteractionWarningModalProps {
  open: boolean
  interactions: InteractionResult[]
  onCancel: () => void
  onOverride: (justification: string) => void
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  [DrugInteractionSeverity.CONTRAINDICATED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
  },
  [DrugInteractionSeverity.MAJOR]: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  [DrugInteractionSeverity.MODERATE]: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  [DrugInteractionSeverity.MINOR]: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
  },
}

function getSeverityStyle(severity: DrugInteractionSeverity) {
  return SEVERITY_STYLES[severity] ?? SEVERITY_STYLES[DrugInteractionSeverity.MAJOR]
}

export function InteractionWarningModal({
  open,
  interactions,
  onCancel,
  onOverride,
}: InteractionWarningModalProps) {
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
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
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
  const modalTitle = hasContraindicated ? 'Contraindication Detected' : 'Major Drug Interaction Detected'

  const handleOverride = () => {
    if (justification.trim().length > 0) {
      onOverride(justification.trim())
      setJustification('')
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interaction-warning-title"
    >
      <div className="mx-4 w-full max-w-lg rounded-xl border-2 border-red-400 bg-white shadow-2xl">
        {/* Header */}
        <div className="rounded-t-xl border-b border-red-200 bg-red-50 px-6 py-4">
          <h2
            id="interaction-warning-title"
            className="text-xl font-black text-red-800"
          >
            {modalTitle}
          </h2>
          <p className="mt-1 text-sm font-semibold text-red-600">
            Review the following drug interactions before proceeding.
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
                  className={`rounded-lg border ${style.border} ${style.bg} p-3`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-black uppercase ${style.text} ${style.bg}`}
                    >
                      {interaction.severity}
                    </span>
                    <span className="text-sm font-bold text-neutral-900">
                      {interaction.drugA} + {interaction.drugB}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">
                    {interaction.description}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Override justification */}
        <div className="border-t border-neutral-200 px-6 py-4">
          <label
            htmlFor="override-justification"
            className="mb-2 block text-sm font-bold text-neutral-700"
          >
            Override Justification (required to proceed)
          </label>
          <textarea
            id="override-justification"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            rows={2}
            placeholder="Enter clinical justification for overriding this warning..."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 rounded-b-xl border-t border-neutral-200 bg-neutral-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-neutral-200 px-5 py-2.5 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-300"
            aria-label="Cancel prescription"
          >
            Cancel Prescription
          </button>
          <button
            type="button"
            onClick={handleOverride}
            disabled={justification.trim().length === 0}
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Proceed anyway"
          >
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>
  )
}
