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
  if (efficiency >= 0.8 && daysUntilExpiry > 14) return 'text-green-700'
  if (efficiency >= 0.5 && daysUntilExpiry > 7) return 'text-amber-700'
  return 'text-red-700'
}

export function WasteDashboardView() {
  const t = useTranslations('finance.reagent.waste')
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  const [allReagents, setAllReagents] = useState<ReagentInventoryEntry[]>([])
  const [activeReagents, setActiveReagents] = useState<ReagentInventoryEntry[]>([])
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlert[]>([])
  const [period, setPeriod] = useState<Period>('this-month')
  const [loading, setLoading] = useState(true)

  const [sortWasteDesc, setSortWasteDesc] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [all, active] = await Promise.all([getAllReagents(), getActiveReagents()])
      setAllReagents(all)
      setActiveReagents(active)

      // Build expiry alerts
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
      <div className="p-4 text-sm text-gray-500" aria-busy="true">
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {(['this-month', 'last-month', '3-months', '6-months'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
              period === p
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
          >
            {t(`period.${p.replace('-', '_')}`)}
          </button>
        ))}
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
              ? 'text-green-700'
              : overallEfficiency >= 50
                ? 'text-amber-700'
                : 'text-red-700'
          }
        />
        <SummaryCard
          label={t('wasteRate')}
          value={`${wasteRate}%`}
          colorClass={
            wasteRate <= 10
              ? 'text-green-700'
              : wasteRate <= 25
                ? 'text-amber-700'
                : 'text-red-700'
          }
        />
        <SummaryCard
          label={t('financialLoss')}
          value={`${financialLoss.toFixed(0)} AFN`}
          colorClass={financialLoss > 0 ? 'text-red-700' : 'text-green-700'}
        />
      </div>

      {/* Expiry alerts panel */}
      {expiryAlerts.length > 0 && (
        <section aria-labelledby="expiry-alerts-heading">
          <h2
            id="expiry-alerts-heading"
            className="text-base font-semibold mb-2 text-amber-800"
          >
            {t('expiryAlertsHeading')} ({expiryAlerts.length})
          </h2>
          <ul className="space-y-2">
            {expiryAlerts.map((alert) => (
              <li
                key={alert.reagentId}
                className={`rounded border p-3 text-sm ${
                  alert.severity === 'critical'
                    ? 'border-red-300 bg-red-50 text-red-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
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
      <section aria-labelledby="active-reagents-heading">
        <div className="flex items-center justify-between mb-2">
          <h2 id="active-reagents-heading" className="text-base font-semibold">
            {t('activeReagentsHeading')}
          </h2>
          <Button
            variant="primary"
            onClick={() => router.push('/finance/reagents/new')}
          >
            {t('addReagent')}
          </Button>
        </div>

        {activeReagents.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">{t('noActiveReagents')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-start">
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.name')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.lot')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.openDate')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.expiryDate')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.progress')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.efficiency')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.daysLeft')}</th>
                  <th className="py-2 text-start font-medium text-gray-600">{t('col.alert')}</th>
                </tr>
              </thead>
              <tbody>
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
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/finance/reagents/${entry.reagentId}`)}
                    >
                      <td className={`py-2 pe-3 ${colorClass}`}>{entry.name}</td>
                      <td className="py-2 pe-3 text-gray-700">{entry.lotNumber}</td>
                      <td className="py-2 pe-3 text-gray-700">{entry.openDate}</td>
                      <td className="py-2 pe-3 text-gray-700">{entry.expiryDate}</td>
                      <td className="py-2 pe-3 text-gray-700">
                        {entry.testsPerformed}/{entry.expectedTests}
                      </td>
                      <td className={`py-2 pe-3 font-medium ${colorClass}`}>
                        {eff}%
                      </td>
                      <td
                        className={`py-2 pe-3 ${
                          daysLeft <= 7
                            ? 'text-red-700 font-medium'
                            : daysLeft <= 14
                              ? 'text-amber-700'
                              : 'text-gray-700'
                        }`}
                      >
                        {daysLeft}
                      </td>
                      <td className="py-2">
                        {hasAlert && (
                          <span
                            aria-label={t('expiryAlertIcon')}
                            className="inline-block w-2 h-2 rounded-full bg-amber-500"
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
        <section aria-labelledby="waste-history-heading">
          <h2 id="waste-history-heading" className="text-base font-semibold mb-2">
            {t('wasteHistoryHeading')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.name')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.lot')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.openDate')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.disposalDate')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.progress')}</th>
                  <th className="py-2 pe-3 text-start font-medium text-gray-600">{t('col.wasteReason')}</th>
                  <th
                    className="py-2 text-start font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => setSortWasteDesc((p) => !p)}
                  >
                    {t('col.financialLoss')} {sortWasteDesc ? '↓' : '↑'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDisposed.map((entry) => {
                  const loss =
                    entry.remainingAtDisposal != null && entry.remainingAtDisposal > 0
                      ? (
                          (entry.remainingAtDisposal / entry.expectedTests) *
                          entry.costPerUnit
                        ).toFixed(0)
                      : '0'
                  return (
                    <tr key={entry.reagentId} className="border-b border-gray-100">
                      <td className="py-2 pe-3 text-gray-800">{entry.name}</td>
                      <td className="py-2 pe-3 text-gray-700">{entry.lotNumber}</td>
                      <td className="py-2 pe-3 text-gray-700">{entry.openDate}</td>
                      <td className="py-2 pe-3 text-gray-700">{entry.disposalDate ?? '—'}</td>
                      <td className="py-2 pe-3 text-gray-700">
                        {entry.testsPerformed}/{entry.expectedTests}
                      </td>
                      <td className="py-2 pe-3 text-gray-700">{entry.disposalReason ?? '—'}</td>
                      <td
                        className={`py-2 font-medium ${
                          Number(loss) > 0 ? 'text-red-700' : 'text-gray-700'
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
  colorClass = 'text-gray-900',
}: {
  label: string
  value: string
  colorClass?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  )
}
