'use client'

/**
 * Story 49.4 — Security Mode Active Banner
 *
 * Persistent red banner displayed at the top of every page when Security
 * Alert mode is active. Tells the lab manager the device is read-only
 * and prompts them to contact their administrator to restore operations.
 *
 * Designed for high-stress use: large text, red background, no close button.
 * Supports RTL via logical CSS properties.
 */

import { useSecurityAlertStore } from '@/stores/security-alert-store'
import { useTranslations } from 'next-intl'

export function SecurityModeBanner() {
  const isActive = useSecurityAlertStore((s) => s.isActive)
  const t = useTranslations('security')

  if (!isActive) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="security-mode-banner"
      className="
        w-full bg-red-600 text-white
        px-4 py-3
        flex items-center justify-center gap-3
        text-sm font-bold tracking-wide uppercase
        z-50
      "
    >
      <span aria-hidden="true" className="text-lg">⚠</span>
      <span>{t('banner.title')}</span>
      <span className="font-normal normal-case text-red-100">
        — {t('banner.subtitle')}
      </span>
    </div>
  )
}
