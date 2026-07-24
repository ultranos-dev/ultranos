'use client'

import { useTranslations } from 'next-intl'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'

/**
 * Amber warning banner displayed when a patient has no national ID on file.
 * Matches the visual treatment of MpiWarnBanner.
 */
export function NidMissingBanner() {
  const t = useTranslations('patient')

  return (
    <Alert variant="warning" role="status" className="mb-4">
      {t('nidMissing')}
    </Alert>
  )
}
