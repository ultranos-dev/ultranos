'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { SOP, SOPAcknowledgment } from '@/lib/sop-types'

interface AcknowledgmentRow {
  sop: SOP
  acknowledgments: SOPAcknowledgment[]
}

/**
 * Supervisor view showing who acknowledged each SOP, when, and who hasn't.
 * AC 5: Acknowledgment tracking with who/when/pending.
 * AC 6: Records serve as inspection readiness documentation.
 */
export function SOPAcknowledgmentTracker() {
  const t = useTranslations('sop')
  const [rows, setRows] = useState<AcknowledgmentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const db = getDb()
        const activeSops = await db.sops.where('status').equals('active').toArray()
        const allAcks = await db.sop_acknowledgments.toArray()

        const acksBySop = new Map<string, SOPAcknowledgment[]>()
        for (const ack of allAcks) {
          const key = ack.sopId
          if (!acksBySop.has(key)) acksBySop.set(key, [])
          acksBySop.get(key)!.push(ack)
        }

        const result: AcknowledgmentRow[] = activeSops.map((sop) => ({
          sop,
          acknowledgments: (acksBySop.get(sop.id) ?? []).filter(
            (a) => a.sopVersion === sop.version,
          ),
        }))

        if (active) setRows(result)
      } catch {
        // Dexie unavailable
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        {t('loading')}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        {t('empty')}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h2 className="mb-4 text-xl font-bold">{t('trackerTitle')}</h2>
      <div className="space-y-4">
        {rows.map(({ sop, acknowledgments }) => (
          <div
            key={sop.id}
            className="rounded-lg border border-gray-200 bg-card p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {sop.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  v{sop.version} — {new Date(sop.effectiveDate).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {t('ackCount', { count: acknowledgments.length })}
              </span>
            </div>

            {acknowledgments.length > 0 && (
              <div className="mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-start text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <th className="pb-2 font-medium">{t('technicianCol')}</th>
                      <th className="pb-2 font-medium">{t('acknowledgedAtCol')}</th>
                      <th className="pb-2 font-medium">{t('syncStatusCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acknowledgments.map((ack) => (
                      <tr
                        key={ack.id}
                        className="border-b border-gray-100 last:border-0 dark:border-gray-700"
                      >
                        <td className="py-2 text-gray-900 dark:text-gray-100">
                          {ack.technicianId}
                        </td>
                        <td className="py-2 text-gray-600 dark:text-gray-400">
                          {new Date(ack.acknowledgedAt).toLocaleString()}
                        </td>
                        <td className="py-2">
                          {ack.syncStatus === 'synced' ? (
                            <span className="text-green-600 dark:text-green-400">
                              {t('synced')}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              {t('pendingSync')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {acknowledgments.length === 0 && (
              <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
                {t('noAcknowledgments')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
