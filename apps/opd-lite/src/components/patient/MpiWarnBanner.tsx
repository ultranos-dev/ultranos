'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'

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
    <Alert variant="warning" role="alert" className="mb-4">
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
    </Alert>
  )
}
