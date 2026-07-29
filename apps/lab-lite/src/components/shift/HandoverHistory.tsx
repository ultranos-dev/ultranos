'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getAllHandoverReports } from '@/lib/db'
import type { HandoverReport } from '@/lib/db'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ClipboardList } from '@ultranos/ui-kit/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/Button'

type StatusFilter = 'ALL' | 'PENDING' | 'ACKNOWLEDGED' | 'EXPIRED'

function StatusBadge({ status }: { status: HandoverReport['status'] }) {
  const variant =
    status === 'ACKNOWLEDGED' ? 'success' : status === 'PENDING' ? 'warning' : 'secondary'
  return <Badge variant={variant}>{status}</Badge>
}

/**
 * Handover History view — accessible to SUPERVISOR and LAB_MANAGER only (AC 5).
 * Rendered inside the shift-handover page route; role gate is enforced at the page level.
 */
export function HandoverHistory() {
  const t = useTranslations('shift')

  const [records, setRecords] = useState<HandoverReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HandoverReport | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  useEffect(() => {
    let active = true
    setIsLoading(true)

    getAllHandoverReports()
      .then((all) => {
        if (active) {
          setRecords(all)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('Failed to load handover history.')
          setIsLoading(false)
        }
      })

    return () => { active = false }
  }, [])

  const filtered =
    statusFilter === 'ALL' ? records : records.filter((r) => r.status === statusFilter)

  if (selected) {
    return <HandoverDetail report={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: title + status filter — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold text-foreground">{t('historyTitle')}</h2>
        <select
          aria-label={t('allFilter')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="ms-auto rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
        >
          <option value="ALL">{t('allFilter')}</option>
          <option value="PENDING">{t('statusPending')}</option>
          <option value="ACKNOWLEDGED">{t('statusAcknowledged')}</option>
          <option value="EXPIRED">{t('statusExpired')}</option>
        </select>
      </div>

      {/* Content box — single cohesive box (loading / error / empty / table) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {isLoading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex min-h-[16rem] items-center justify-center px-4 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={ClipboardList} title={t('noHistory')} description={t('noHistoryHint')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('shiftDate')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('outgoingTech')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('incomingTech')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('statusColumn')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('pendingSamplesColumn')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('actionsColumn')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-foreground">
                      {r.shiftDate}
                      <span className="ms-1 text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.outgoingTechName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.incomingTechName ?? (r.incomingTechId ? r.incomingTechId : '—')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {r.pendingSamples.stat + r.pendingSamples.routine}
                      {r.pendingSamples.stat > 0 && (
                        <span className="ms-1 text-xs font-medium text-destructive">
                          ({r.pendingSamples.stat} STAT)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        {t('viewAction')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function HandoverDetail({
  report,
  onBack,
}: {
  report: HandoverReport
  onBack: () => void
}) {
  const t = useTranslations('shift')

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="w-fit px-0">
        {t('backToHistory')}
      </Button>

      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold text-foreground">{t('handoverReportTitle')}</h2>
        <StatusBadge status={report.status} />
      </div>
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">

      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t('shiftDate')}</dt>
          <dd className="font-medium text-foreground">{report.shiftDate}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('timeLabel')}</dt>
          <dd className="font-medium text-foreground">
            {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('outgoingTech')}</dt>
          <dd className="font-medium text-foreground">{report.outgoingTechName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('acknowledgedAt')}</dt>
          <dd className="font-medium text-foreground">
            {report.acknowledgedAt
              ? new Date(report.acknowledgedAt).toLocaleString()
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="space-y-4">
        <section aria-labelledby="detail-samples">
          <h3 id="detail-samples" className="mb-2 text-sm font-medium text-foreground">
            {t('pendingSamplesLabel')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('statLabel')}: {report.pendingSamples.stat} | {t('routineLabel')}: {report.pendingSamples.routine}
          </p>
          {report.pendingSamples.sampleIds.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('sampleIdsLabel')}: {report.pendingSamples.sampleIds.join(', ')}
            </p>
          )}
        </section>

        {report.equipmentAlerts.length > 0 && (
          <section aria-labelledby="detail-equipment">
            <h3 id="detail-equipment" className="mb-2 text-sm font-medium text-foreground">
              {t('equipmentAlertsLabel')}
            </h3>
            <ul className="space-y-1">
              {report.equipmentAlerts.map((a) => (
                <li key={a.instrumentId} className="text-sm text-destructive">
                  {a.instrumentName} — {a.alertType}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="detail-orders">
          <h3 id="detail-orders" className="mb-2 text-sm font-medium text-foreground">
            {t('incompleteOrdersLabel')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {report.incompleteOrders.length === 0
              ? t('noneLabel')
              : t('ordersAwaiting', { count: report.incompleteOrders.length })}
          </p>
        </section>

        {report.outgoingNotes && (
          <section aria-labelledby="detail-notes-out">
            <h3 id="detail-notes-out" className="mb-1 text-sm font-medium text-foreground">
              {t('outgoingNotesLabel')}
            </h3>
            <p className="rounded-md bg-muted/30 px-3 py-2 text-sm text-foreground">
              {report.outgoingNotes}
            </p>
          </section>
        )}

        {report.incomingNotes && (
          <section aria-labelledby="detail-notes-in">
            <h3 id="detail-notes-in" className="mb-1 text-sm font-medium text-foreground">
              {t('incomingNotesLabel')}
            </h3>
            <p className="rounded-md bg-muted/30 px-3 py-2 text-sm text-foreground">
              {report.incomingNotes}
            </p>
          </section>
        )}
      </div>
      </div>
    </div>
  )
}
