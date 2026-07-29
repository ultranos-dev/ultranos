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
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t('empty')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="mb-4 text-xl font-bold">{t('trackerTitle')}</h2>
      <div className="space-y-4">
        {rows.map(({ sop, acknowledgments }) => (
          <div
            key={sop.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">
                  {sop.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  v{sop.version} — {new Date(sop.effectiveDate).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {t('ackCount', { count: acknowledgments.length })}
              </span>
            </div>

            {acknowledgments.length > 0 && (
              <div className="mt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs text-muted-foreground dark:text-muted-foreground">
                      <th className="pb-2 font-medium">{t('technicianCol')}</th>
                      <th className="pb-2 font-medium">{t('acknowledgedAtCol')}</th>
                      <th className="pb-2 font-medium">{t('syncStatusCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acknowledgments.map((ack) => (
                      <tr
                        key={ack.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-2 text-foreground">
                          {ack.technicianId}
                        </td>
                        <td className="py-2 text-muted-foreground">
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
              <p className="mt-3 text-sm text-muted-foreground">
                {t('noAcknowledgments')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
