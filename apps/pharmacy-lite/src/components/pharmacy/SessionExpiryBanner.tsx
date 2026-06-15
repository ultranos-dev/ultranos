'use client'

import { useTranslations } from 'next-intl'
import { useSessionExpiryWarning } from '@/hooks/useSessionExpiryWarning'

export function SessionExpiryBanner() {
  const { remainingMs, showWarning } = useSessionExpiryWarning()
  const t = useTranslations('sessionExpiry')

  if (!showWarning || remainingMs === null) return null

  const minutes = Math.ceil(remainingMs / 60_000)

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning"
      data-testid="session-expiry-banner"
    >
      <span className="font-semibold">{t('expiringIn', { minutes })}</span>
      {' '}{t('saveAndReauth')}
    </div>
  )
}
