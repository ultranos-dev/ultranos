'use client'

import { useTranslations } from 'next-intl'

/**
 * Amber warning banner displayed when a patient has no national ID on file.
 * Matches the visual treatment of MpiWarnBanner.
 */
export function NidMissingBanner() {
  const t = useTranslations('patient')

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      {t('nidMissing')}
    </div>
  )
}
