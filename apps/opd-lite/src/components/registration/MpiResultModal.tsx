'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'

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
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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
        className={`relative mx-4 w-full max-w-xl rounded-xl border-2 bg-white shadow-2xl ${
          isBlock ? 'border-red-400' : 'border-amber-400'
        }`}
      >
        {/* Header */}
        <div
          className={`rounded-t-xl border-b px-6 py-4 ${
            isBlock
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <h2
            id="mpi-result-title"
            className={`text-xl font-black ${
              isBlock ? 'text-red-800' : 'text-amber-800'
            }`}
          >
            {isBlock ? t('mpiBlockTitle') : t('mpiWarnTitle')}
          </h2>
          <p
            className={`mt-1 text-sm font-semibold ${
              isBlock ? 'text-red-600' : 'text-amber-600'
            }`}
          >
            {isBlock ? t('mpiBlockDescription') : t('mpiWarnDescription')}
          </p>
        </div>

        {/* Candidate list */}
        <div className="max-h-80 overflow-y-auto px-6 py-4">
          <ul className="space-y-3" aria-label={t('mpiCandidates')}>
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className={`rounded-lg border p-4 ${
                  isBlock ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-neutral-900">
                      {[candidate.nameGiven, candidate.nameFather]
                        .filter(Boolean)
                        .join(' ') || t('mpiUnknownName')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                      {candidate.birthYear && (
                        <span>
                          {t('mpiBirthYear')}: {candidate.birthYear}
                        </span>
                      )}
                      {candidate.gender && (
                        <span>
                          {t('mpiGender')}: {candidate.gender}
                        </span>
                      )}
                      {candidate.districtOrigin && (
                        <span>
                          {t('mpiDistrict')}: {candidate.districtOrigin}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-end shrink-0">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-black ${
                        candidate.mpiScore >= 80
                          ? 'bg-red-100 text-red-800'
                          : candidate.mpiScore >= 60
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {t('mpiScore')}: {candidate.mpiScore}
                    </span>
                  </div>
                </div>

                {/* Score breakdown */}
                {Object.keys(candidate.scoreBreakdown).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-neutral-500 [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-700">
                      {t('mpiScoreBreakdown')}
                    </summary>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-neutral-600">
                      {Object.entries(candidate.scoreBreakdown).map(
                        ([field, score]) => (
                          <div key={field} className="flex justify-between">
                            <span>{field}</span>
                            <span className="font-mono">{score}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </details>
                )}

                {/* Go to patient button for BLOCK decision */}
                {isBlock && (
                  <button
                    type="button"
                    onClick={() => onGoToPatient(candidate.id)}
                    className="mt-3 w-full min-h-[44px] rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-all duration-150 [@media(hover:hover)and(pointer:fine)]:hover:bg-blue-700 active:scale-[0.97]"
                  >
                    {t('mpiGoToPatient')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 rounded-b-xl border-t border-neutral-200 bg-neutral-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg bg-neutral-200 px-5 py-2.5 text-sm font-bold text-neutral-700 transition-all duration-150 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-300 active:scale-[0.97]"
          >
            {t('cancel')}
          </button>

          {decision === 'WARN' && proceedToken && (
            <button
              type="button"
              onClick={() => onProceed(proceedToken)}
              className="min-h-[44px] rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-all duration-150 [@media(hover:hover)and(pointer:fine)]:hover:bg-amber-700 active:scale-[0.97]"
            >
              {t('mpiProceedAnyway')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
