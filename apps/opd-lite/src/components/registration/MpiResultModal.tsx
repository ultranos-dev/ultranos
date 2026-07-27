'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
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

  const isBlock = decision === 'BLOCK'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent
        className={`max-w-xl p-0 gap-0 overflow-hidden rounded-xl border-2 bg-background ${
          isBlock ? 'border-destructive' : 'border-warning'
        }`}
      >
        {/* Header */}
        <DialogHeader
          className={`rounded-t-xl border-b px-6 py-4 space-y-1 ${
            isBlock
              ? 'border-destructive/20 bg-destructive/10'
              : 'border-warning/20 bg-warning/10'
          }`}
        >
          <DialogTitle
            className={`text-xl font-semibold ${
              isBlock ? 'text-destructive' : 'text-warning'
            }`}
          >
            {isBlock ? t('mpiBlockTitle') : t('mpiWarnTitle')}
          </DialogTitle>
          <p
            className={`text-sm font-semibold ${
              isBlock ? 'text-destructive' : 'text-warning'
            }`}
          >
            {isBlock ? t('mpiBlockDescription') : t('mpiWarnDescription')}
          </p>
        </DialogHeader>

        {/* Candidate list — accordion, one at a time */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          <ul className="space-y-2" aria-label={t('mpiCandidates')}>
            {candidates.map((candidate) => {
              const isExpanded = expandedId === candidate.id
              const nameParts = [candidate.nameGiven, candidate.nameFather].filter(Boolean) as string[]

              return (
                <li
                  key={candidate.id}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    isBlock ? 'border-destructive/20' : 'border-warning/20'
                  } ${isExpanded ? (isBlock ? 'bg-destructive/10' : 'bg-warning/10') : 'bg-background'}`}
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
                        {nameParts.length > 0
                          ? nameParts.map((seg, i) => (
                              <span key={i}>
                                {i > 0 && (
                                  <span
                                    className="mx-2 inline-block h-2 w-2 rounded-full border-2 border-muted-foreground/40 align-middle select-none"
                                    aria-hidden="true"
                                  />
                                )}
                                {seg}
                              </span>
                            ))
                          : t('mpiUnknownName')}
                      </span>
                    </div>

                    {/* Score badge */}
                    <span
                      className={`shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
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
                    <div className="border-t border-border px-4 pb-4 pt-3">
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
                        <div className="mt-3 pt-3 border-t border-border">
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
        <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
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
      </DialogContent>
    </Dialog>
  )
}
