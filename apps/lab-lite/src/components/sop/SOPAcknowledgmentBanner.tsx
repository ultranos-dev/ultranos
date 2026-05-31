'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t('bannerTitle', { count: unacked.length })}
          </p>
          <ul className="mt-1 space-y-1">
            {unacked.slice(0, 3).map((sop) => (
              <li key={sop.id} className="text-sm text-amber-700 dark:text-amber-300">
                {t('bannerItem', { title: sop.title })}
              </li>
            ))}
            {unacked.length > 3 && (
              <li className="text-sm text-amber-600 dark:text-amber-400">
                {t('bannerMore', { count: unacked.length - 3 })}
              </li>
            )}
          </ul>
          <Link
            href="/sops"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            {t('reviewNow')}
          </Link>
        </div>
      </div>
    </div>
  )
}
