'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { getAllReagents, getActiveReagents, getConsumptionLogForReagent } from '@/lib/db'
import { ReagentStatus } from '@/lib/db'
import type { ReagentInventoryEntry } from '@/lib/db'
import {
  calculateConsumptionEfficiency,
  calculateWasteRate,
  calculateFinancialLoss,
  calculateFinancialLossByPeriod,
  projectExpiryBeforeDepletion,
} from '@/lib/reagent-waste-service'
import type { ExpiryAlert } from '@/lib/reagent-waste-service'
import { generateExpiryAlert } from '@/lib/reagent-waste-service'

type Period = 'this-month' | 'last-month' | '3-months' | '6-months'

function getPeriodDates(period: Period): { start: string; end: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  if (period === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return { start, end: today }
  }
  if (period === 'last-month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return {
      start: first.toISOString().slice(0, 10),
      end: last.toISOString().slice(0, 10),
    }
  }
  if (period === '3-months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
    return { start, end: today }
  }
  // 6-months
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10)
  return { start, end: today }
}

function getRowColorClass(entry: ReagentInventoryEntry, today: string): string {
  const efficiency = calculateConsumptionEfficiency(entry)
  const daysUntilExpiry = Math.round(
    (new Date(entry.expiryDate).getTime() - new Date(today).getTime()) /
      86_400_000,
  )
  if (efficiency >= 0.8 && daysUntilExpiry > 14) return 'text-success'
  if (efficiency >= 0.5 && daysUntilExpiry > 7) return 'text-warning'
  return 'text-destructive'
}

export function WasteDashboardView() {
  const t = useTranslations('finance.reagent.waste')
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  const [allReagents, setAllReagents] = useState<ReagentInventoryEntry[]>([])
  const [activeReagents, setActiveReagents] = useState<ReagentInventoryEntry[]>([])
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlert[]>([])
  const [expiryLoadError, setExpiryLoadError] = useState(false)
  const [period, setPeriod] = useState<Period>('this-month')
  const [loading, setLoading] = useState(true)

  const [sortWasteDesc, setSortWasteDesc] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    setExpiryLoadError(false)
    try {
      const [all, active] = await Promise.all([getAllReagents(), getActiveReagents()])
      setAllReagents(all)
      setActiveReagents(active)

      // Build expiry alerts — catch separately so a DB error here renders
      // "unavailable" rather than silently showing zero expiry alerts.
      try {
        const alerts: ExpiryAlert[] = []
        for (const entry of active) {
          const log = await getConsumptionLogForReagent(entry.reagentId)
          const projection = projectExpiryBeforeDepletion(entry, log, today)
          if (projection) {
            alerts.push(generateExpiryAlert(entry, projection))
          }
        }
        // Sort: critical first, then by daysUntilExpiry ascending
        alerts.sort((a, b) => {
          if (a.severity !== b.severity) {
            return a.severity === 'critical' ? -1 : 1
          }
          return a.daysUntilExpiry - b.daysUntilExpiry
        })
        setExpiryAlerts(alerts)
      } catch {
        setExpiryLoadError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    loadData()
  }, [loadData])

  const { start, end } = getPeriodDates(period)
  const disposedReagents = allReagents.filter(
    (e) => e.status !== ReagentStatus.ACTIVE,
  )
  const overallEfficiency = Math.round(
    (activeReagents.length > 0
      ? activeReagents.reduce((s, e) => s + calculateConsumptionEfficiency(e), 0) /
        activeReagents.length
      : 0) * 100,
  )
  const wasteRate = Math.round(calculateWasteRate(disposedReagents) * 100)
  const financialLoss = calculateFinancialLossByPeriod(allReagents, start, end)

  // Sort waste history by financial loss
  const sortedDisposed = [...disposedReagents].sort((a, b) => {
    const lossA =
      a.remainingAtDisposal != null
        ? (a.remainingAtDisposal / a.expectedTests) * a.costPerUnit
        : 0
    const lossB =
      b.remainingAtDisposal != null
        ? (b.remainingAtDisposal / b.expectedTests) * b.costPerUnit
        : 0
    return sortWasteDesc ? lossB - lossA : lossA - lossB
  })

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground" aria-busy="true">
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: period pills + add reagent — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['this-month', 'last-month', '3-months', '6-months'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`period.${p.replace('-', '_')}`)}
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          onClick={() => router.push('/finance/reagents/new')}
        >
          {t('addReagent')}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label={t('totalTracked')}
          value={String(allReagents.length)}
        />
        <SummaryCard
          label={t('overallEfficiency')}
          value={`${overallEfficiency}%`}
          colorClass={
            overallEfficiency >= 80
              ? 'text-success'
              : overallEfficiency >= 50
                ? 'text-warning'
                : 'text-destructive'
          }
        />
        <SummaryCard
          label={t('wasteRate')}
          value={`${wasteRate}%`}
          colorClass={
            wasteRate <= 10
              ? 'text-success'
              : wasteRate <= 25
                ? 'text-warning'
                : 'text-destructive'
          }
        />
        <SummaryCard
          label={t('financialLoss')}
          value={`${financialLoss.toFixed(0)} AFN`}
          colorClass={financialLoss > 0 ? 'text-destructive' : 'text-success'}
        />
      </div>

      {/* Expiry alerts panel — show unavailable on error, alerts on success */}
      {expiryLoadError && (
        <div
          className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
          role="alert"
          aria-live="polite"
          data-testid="expiry-alerts-unavailable"
        >
          {t('expiryAlertsUnavailable')}
        </div>
      )}
      {!expiryLoadError && expiryAlerts.length > 0 && (
        <section aria-labelledby="expiry-alerts-heading">
          <h2
            id="expiry-alerts-heading"
            className="text-base font-semibold mb-2 text-warning"
          >
            {t('expiryAlertsHeading')} ({expiryAlerts.length})
          </h2>
          <ul className="space-y-2">
            {expiryAlerts.map((alert) => (
              <li
                key={alert.reagentId}
                className={`rounded border p-3 text-sm ${
                  alert.severity === 'critical'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-warning/30 bg-warning/10 text-warning'
                }`}
              >
                <strong>{alert.reagentName}</strong>{' '}
                {t('alerts.expiryWarning', {
                  reagentName: alert.reagentName,
                  openDate: alert.openDate,
                  remainingTests: alert.remainingTests,
                  daysUntilExpiry: alert.daysUntilExpiry,
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active reagents table */}
      <section aria-labelledby="active-reagents-heading" className="flex flex-col gap-2">
        <h2 id="active-reagents-heading" className="text-base font-semibold">
          {t('activeReagentsHeading')}
        </h2>

        {activeReagents.length === 0 ? (
          <div className="flex min-h-[8rem] items-center justify-center rounded-xl bg-card text-sm text-muted-foreground shadow-card ring-[0.65px] ring-border/50">
            {t('noActiveReagents')}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.name')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.lot')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.openDate')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.expiryDate')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.progress')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.efficiency')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.daysLeft')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.alert')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeReagents.map((entry) => {
                  const eff = Math.round(calculateConsumptionEfficiency(entry) * 100)
                  const daysLeft = Math.round(
                    (new Date(entry.expiryDate).getTime() - new Date(today).getTime()) /
                      86_400_000,
                  )
                  const hasAlert = expiryAlerts.some(
                    (a) => a.reagentId === entry.reagentId,
                  )
                  const colorClass = getRowColorClass(entry, today)
                  return (
                    <tr
                      key={entry.reagentId}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => router.push(`/finance/reagents/${entry.reagentId}`)}
                    >
                      <td className={`px-4 py-3 ${colorClass}`}>{entry.name}</td>
                      <td className="px-4 py-3 text-foreground">{entry.lotNumber}</td>
                      <td className="px-4 py-3 text-foreground">{entry.openDate}</td>
                      <td className="px-4 py-3 text-foreground">{entry.expiryDate}</td>
                      <td className="px-4 py-3 text-foreground">
                        {entry.testsPerformed}/{entry.expectedTests}
                      </td>
                      <td className={`px-4 py-3 font-medium ${colorClass}`}>
                        {eff}%
                      </td>
                      <td
                        className={`px-4 py-3 ${
                          daysLeft <= 7
                            ? 'text-destructive font-medium'
                            : daysLeft <= 14
                              ? 'text-warning'
                              : 'text-foreground'
                        }`}
                      >
                        {daysLeft}
                      </td>
                      <td className="px-4 py-3">
                        {hasAlert && (
                          <span
                            aria-label={t('expiryAlertIcon')}
                            className="inline-block w-2 h-2 rounded-full bg-warning"
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Waste history table */}
      {disposedReagents.length > 0 && (
        <section aria-labelledby="waste-history-heading" className="flex flex-col gap-2">
          <h2 id="waste-history-heading" className="text-base font-semibold">
            {t('wasteHistoryHeading')}
          </h2>
          <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.name')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.lot')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.openDate')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.disposalDate')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.progress')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('col.wasteReason')}</th>
                  <th
                    className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide cursor-pointer select-none"
                    onClick={() => setSortWasteDesc((p) => !p)}
                  >
                    {t('col.financialLoss')} {sortWasteDesc ? '↓' : '↑'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedDisposed.map((entry) => {
                  const loss =
                    entry.remainingAtDisposal != null && entry.remainingAtDisposal > 0
                      ? (
                          (entry.remainingAtDisposal / entry.expectedTests) *
                          entry.costPerUnit
                        ).toFixed(0)
                      : '0'
                  return (
                    <tr key={entry.reagentId} className="transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">{entry.name}</td>
                      <td className="px-4 py-3 text-foreground">{entry.lotNumber}</td>
                      <td className="px-4 py-3 text-foreground">{entry.openDate}</td>
                      <td className="px-4 py-3 text-foreground">{entry.disposalDate ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground">
                        {entry.testsPerformed}/{entry.expectedTests}
                      </td>
                      <td className="px-4 py-3 text-foreground">{entry.disposalReason ?? '—'}</td>
                      <td
                        className={`px-4 py-3 font-medium font-numeric ${
                          Number(loss) > 0 ? 'text-destructive' : 'text-foreground'
                        }`}
                      >
                        {loss} AFN
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  colorClass = 'text-foreground',
}: {
  label: string
  value: string
  colorClass?: string
}) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold font-numeric ${colorClass}`}>{value}</p>
    </div>
  )
}
