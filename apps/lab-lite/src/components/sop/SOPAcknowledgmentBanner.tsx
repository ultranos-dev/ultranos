'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getUnacknowledgedSOPs } from '@/lib/sop-sync'
import type { SOP } from '@/lib/sop-types'

/**
 * Banner shown when unacknowledged SOPs exist.
 * Displays on dashboard/other pages to alert technicians.
 * AC 4: "New SOP: [title]. Please review and confirm."
 */
export function SOPAcknowledgmentBanner() {
  const t = useTranslations('sop')
  const session = useAuthSessionStore((s) => s.session)
  const technicianId = session?.userId ?? session?.email ?? ''
  const [unacked, setUnacked] = useState<SOP[]>([])

  useEffect(() => {
    if (!technicianId) return
    let active = true

    async function check() {
      try {
        const result = await getUnacknowledgedSOPs(technicianId)
        if (active) setUnacked(result)
      } catch {
        // Dexie unavailable
      }
    }

    check()
    const interval = setInterval(check, 30_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [technicianId])

  if (unacked.length === 0) return null

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 dark:border-warning dark:bg-warning/20">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-warning dark:text-warning" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-warning dark:text-warning">
            {t('bannerTitle', { count: unacked.length })}
          </p>
          <ul className="mt-1 space-y-1">
            {unacked.slice(0, 3).map((sop) => (
              <li key={sop.id} className="text-sm text-warning dark:text-warning">
                {t('bannerItem', { title: sop.title })}
              </li>
            ))}
            {unacked.length > 3 && (
              <li className="text-sm text-warning dark:text-warning">
                {t('bannerMore', { count: unacked.length - 3 })}
              </li>
            )}
          </ul>
          <Link
            href="/sops"
            className="mt-2 inline-block text-sm font-medium text-primary hover:text-primary/80 dark:text-primary"
          >
            {t('reviewNow')}
          </Link>
        </div>
      </div>
    </div>
  )
}
