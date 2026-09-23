'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import type { CheckDuplicatesResult } from '@/lib/trpc'

interface MpiResultModalProps {
  result: CheckDuplicatesResult
  onProceed: (token?: string) => void
  /** Receives the candidate's OPAQUE blind-index ref (never a real patient UUID). */
  onSelectExisting: (patientRef: string) => void
  onCancel: () => void
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-red-100 text-red-800'
  if (score >= 60) return 'bg-amber-100 text-amber-800'
  return 'bg-muted text-muted-foreground'
}

/**
 * Modal overlay for MPI duplicate detection results.
 * Shown when checkDuplicates returns WARN or BLOCK.
 *
 * WARN: user can "Add Anyway" with proceedToken or select existing.
 * BLOCK: user must select existing or cancel.
 *
 * Rule #7 (Story 59.1): candidates carry ONLY firstName + age + score keyed by
 * the opaque blind-index ref — father name / gender / district / real UUID are
 * clinician-tier fields the lab surface never receives.
 */
export function MpiResultModal({
  result,
  onProceed,
  onSelectExisting,
  onCancel,
}: MpiResultModalProps) {
  const t = useTranslations('patients')
  const isBlocked = result.decision === 'BLOCK'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h2 className="text-lg font-bold text-foreground">
          {isBlocked ? t('mpiBlocked') : t('mpiWarning')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isBlocked ? t('mpiBlockedDesc') : t('mpiWarningDesc')}
        </p>

        <ul className="mt-4 space-y-3">
          {result.candidates.map((c) => (
            <li
              key={c.ref}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {c.firstName ?? '---'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.age != null ? t('yearsOld', { age: c.age }) : '---'}
                </p>
              </div>
              <span
                className={`ms-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadgeClass(c.mpiScore)}`}
              >
                {c.mpiScore}%
              </span>
              <div className="ms-3 flex shrink-0 flex-col items-end gap-1">
                <Button
                  variant="outline"
                  className="text-xs"
                  onClick={() => onSelectExisting(c.ref)}
                >
                  {t('useExisting')}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
          {!isBlocked && result.proceedToken && (
            <Button
              variant="warning"
              onClick={() => onProceed(result.proceedToken)}
            >
              {t('addAnyway')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
