'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface MpiWarnBannerProps {
  mpiScore: number
  patientId: string
}

/**
 * Inline amber warning banner displayed on patient views when an MPI
 * duplicate score exceeds the review threshold. Links the clinician
 * to the duplicate review page filtered for this patient.
 */
export function MpiWarnBanner({ mpiScore, patientId }: MpiWarnBannerProps) {
  const t = useTranslations('duplicateReview')

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
    >
      {t.rich('warnBanner', {
        score: mpiScore,
        link: (chunks) => (
          <Link
            href={`/duplicate-review?patient=${patientId}`}
            className="font-medium underline hover:text-warning focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
          >
            {chunks}
          </Link>
        ),
      })}
    </div>
  )
}
