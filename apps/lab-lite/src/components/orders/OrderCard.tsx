'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { LabOrderEntry } from '@/lib/db'
import { getPatientCulturalPreferences } from '@/lib/db'
import type { CulturalFlag } from '@/lib/cultural-flags'
import { CulturalFlagsBanner } from '@/components/patients/CulturalFlagsBanner'
import { CulturalFlagsEditor } from '@/components/patients/CulturalFlagsEditor'

const URGENCY_STYLES: Record<string, string> = {
  stat: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  asap: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  urgent: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  routine: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '<1m' // P9: also clamps negative (future timestamp / clock skew)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function OrderCard({ order }: { order: LabOrderEntry }) {
  const t = useTranslations('orders')
  const [culturalFlags, setCulturalFlags] = useState<CulturalFlag[]>([])
  const [showEditor, setShowEditor] = useState(false)

  useEffect(() => {
    getPatientCulturalPreferences(order.patientRef).then((prefs) => {
      if (prefs) setCulturalFlags(prefs.flags)
    })
  }, [order.patientRef])

  return (
    <div className="rounded-lg border border-gray-200 bg-card p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Patient: first name + age */}
          <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {order.patientFirstName}, {order.patientAge != null ? `${order.patientAge}y` : '?'}
          </p>

          {/* Cultural flags banner — below patient header, above tests (Story 45.6) */}
          <CulturalFlagsBanner
            flags={culturalFlags}
            onEditClick={() => setShowEditor(true)}
          />

          {showEditor && (
            <div className="mt-2">
              <CulturalFlagsEditor
                patientRef={order.patientRef}
                techId=""
                hlcTimestamp=""
                onSave={(prefs) => {
                  setCulturalFlags(prefs.flags)
                  setShowEditor(false)
                }}
                onClose={() => setShowEditor(false)}
              />
            </div>
          )}

          {/* Tests */}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{t('card.testsRequested')}:</span>{' '}
            {order.testsRequested.map((t) => t.loincDisplay).join(', ')}
          </p>

          {/* Ordering physician */}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('card.orderedBy')}: {order.orderingPhysicianName}
          </p>

          {/* Special instructions */}
          {order.specialInstructions && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400">
                {t('card.specialInstructions')}
              </summary>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {order.specialInstructions}
              </p>
            </details>
          )}
        </div>

        {/* Badges + time */}
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${URGENCY_STYLES[order.urgency] ?? URGENCY_STYLES.routine}`}
          >
            {t(`urgency.${order.urgency}`)}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? STATUS_STYLES.RECEIVED}`}
          >
            {t(`filters.${order.status === 'IN_PROGRESS' ? 'inProgress' : order.status.toLowerCase()}`)}
          </span>
          <span className="text-xs text-gray-400" title={order.authoredOn}>
            {t('card.orderedAt')} {timeAgo(order.authoredOn)}
          </span>
        </div>
      </div>
    </div>
  )
}
