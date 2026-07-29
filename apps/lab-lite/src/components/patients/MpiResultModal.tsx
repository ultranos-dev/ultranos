'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import type { CheckDuplicatesResult } from '@/lib/trpc'

interface MpiResultModalProps {
  result: CheckDuplicatesResult
  onProceed: (token?: string) => void
  onSelectExisting: (patientId: string) => void
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
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {(() => {
                    const parts = [c.nameGiven, c.nameFather].filter(Boolean) as string[]
                    return parts.length > 0
                      ? parts.map((seg, i) => (
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
                      : '---'
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    c.gender,
                    c.birthYear ? String(c.birthYear) : null,
                    c.districtOrigin,
                  ]
                    .filter(Boolean)
                    .join(' \u00B7 ')}
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
                  onClick={() => onSelectExisting(c.id)}
                >
                  {t('useExisting')}
                </Button>
                <Link
                  href={`/patients/${c.id}`}
                  className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  {t('viewRecord')}
                </Link>
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
