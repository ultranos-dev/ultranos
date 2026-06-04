'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

interface MpiCandidate {
  id: string
  nameGiven?: string
  nameFather?: string
  birthYear?: number
  gender?: string
  districtOrigin?: string
  mpiScore: number
  scoreBreakdown: Record<string, number>
}

interface MpiResultModalProps {
  open: boolean
  decision: 'WARN' | 'BLOCK'
  candidates: MpiCandidate[]
  proceedToken?: string
  onProceed: (token: string) => void
  onCancel: () => void
  onGoToPatient: (patientId: string) => void
}

export function MpiResultModal({
  open,
  decision,
  candidates,
  proceedToken,
  onProceed,
  onCancel,
  onGoToPatient,
}: MpiResultModalProps) {
  const t = useTranslations('registration')
  const dialogRef = useRef<HTMLDivElement>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Auto-expand first candidate when modal opens
  useEffect(() => {
    if (open && candidates.length > 0) {
      setExpandedId(candidates[0]!.id)
    } else {
      setExpandedId(null)
    }
  }, [open, candidates])

  // Accordion toggle — only one at a time
  const toggleCandidate = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  // Focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    },
    [onCancel],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    const timer = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const isBlock = decision === 'BLOCK'

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mpi-result-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* Modal panel */}
      <div
        className={`relative mx-4 w-full max-w-xl rounded-xl border-2 bg-background shadow-2xl ${
          isBlock ? 'border-destructive' : 'border-warning'
        }`}
      >
        {/* Header */}
        <div
          className={`rounded-t-xl border-b px-6 py-4 ${
            isBlock
              ? 'border-destructive/20 bg-destructive/10'
              : 'border-warning/20 bg-warning/10'
          }`}
        >
          <h2
            id="mpi-result-title"
            className={`text-xl font-black ${
              isBlock ? 'text-destructive' : 'text-warning'
            }`}
          >
            {isBlock ? t('mpiBlockTitle') : t('mpiWarnTitle')}
          </h2>
          <p
            className={`mt-1 text-sm font-semibold ${
              isBlock ? 'text-destructive' : 'text-warning'
            }`}
          >
            {isBlock ? t('mpiBlockDescription') : t('mpiWarnDescription')}
          </p>
        </div>

        {/* Candidate list — accordion, one at a time */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          <ul className="space-y-2" aria-label={t('mpiCandidates')}>
            {candidates.map((candidate) => {
              const isExpanded = expandedId === candidate.id
              const name =
                [candidate.nameGiven, candidate.nameFather]
                  .filter(Boolean)
                  .join(' ') || t('mpiUnknownName')

              return (
                <li
                  key={candidate.id}
                  className={`rounded-lg border overflow-hidden transition-colors ${
                    isBlock ? 'border-destructive/20' : 'border-warning/20'
                  } ${isExpanded ? (isBlock ? 'bg-destructive/10' : 'bg-warning/10/50') : 'bg-background'}`}
                >
                  {/* Collapsible header — always visible */}
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => toggleCandidate(candidate.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-muted"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Chevron */}
                      <ChevronRight
                        size={16}
                        className={`shrink-0 text-muted-foreground transition-transform duration-200 ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />

                      <span className="text-sm font-bold text-foreground truncate">
                        {name}
                      </span>
                    </div>

                    {/* Score badge */}
                    <span
                      className={`shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-black ${
                        candidate.mpiScore >= 80
                          ? 'bg-destructive/20 text-destructive'
                          : candidate.mpiScore >= 60
                            ? 'bg-warning/20 text-warning'
                            : 'bg-muted text-foreground'
                      }`}
                    >
                      {t('mpiScore')}: {candidate.mpiScore}
                    </span>
                  </Button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
                      {/* Patient details */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {candidate.nameGiven && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">{t('mpiNameGiven')}</span>
                            <p className="font-semibold text-foreground">{candidate.nameGiven}</p>
                          </div>
                        )}
                        {candidate.nameFather && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">{t('mpiNameFather')}</span>
                            <p className="font-semibold text-foreground">{candidate.nameFather}</p>
                          </div>
                        )}
                        {candidate.birthYear && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">{t('mpiBirthYear')}</span>
                            <p className="font-semibold text-foreground">{candidate.birthYear}</p>
                          </div>
                        )}
                        {candidate.gender && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">{t('mpiGender')}</span>
                            <p className="font-semibold text-foreground capitalize">{candidate.gender}</p>
                          </div>
                        )}
                        {candidate.districtOrigin && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">{t('mpiDistrict')}</span>
                            <p className="font-semibold text-foreground">{candidate.districtOrigin}</p>
                          </div>
                        )}
                      </div>

                      {/* Score breakdown */}
                      {Object.keys(candidate.scoreBreakdown).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-neutral-100">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            {t('mpiScoreBreakdown')}
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {Object.entries(candidate.scoreBreakdown).map(
                              ([field, score]) => (
                                <div key={field} className="flex justify-between">
                                  <span>{field}</span>
                                  <span className="font-mono font-semibold">{score}</span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {/* Go to patient button */}
                      <Button
                        variant="primary"
                        fullWidth
                        className="mt-3"
                        type="button"
                        onClick={() => onGoToPatient(candidate.id)}
                      >
                        {t('mpiGoToPatient')}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 rounded-b-xl border-t border-neutral-200 bg-muted px-6 py-4">
          <Button
            variant="secondary"
            type="button"
            onClick={onCancel}
          >
            {t('cancel')}
          </Button>

          {decision === 'WARN' && proceedToken && (
            <Button
              variant="warning"
              type="button"
              onClick={() => onProceed(proceedToken)}
            >
              {t('mpiAddAnyway')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
