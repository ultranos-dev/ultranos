'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { generateInspectionPack } from '@/lib/safety/inspection-readiness'
import type { InspectionReadinessPack } from '@/types/infection-control-audit'

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultStartDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return toDateInputValue(d)
}

function defaultEndDate(): string {
  return toDateInputValue(new Date())
}

export function InspectionReadinessView() {
  const t = useTranslations('safety.audit')
  const session = useAuthSessionStore((s) => s.session)

  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [loading, setLoading] = useState(false)
  const [pack, setPack] = useState<InspectionReadinessPack | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (session?.labRole !== LabRole.LAB_MANAGER) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {t('accessRestricted')}
      </div>
    )
  }

  async function handleGenerate() {
    setError(null)
    setLoading(true)
    setPack(null)
    try {
      const result = await generateInspectionPack({ start: startDate, end: endDate })
      setPack(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('generateError'))
    } finally {
      setLoading(false)
    }
  }

  function handleExportJson() {
    if (!pack) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `inspection-pack-${pack.dateRange.start}-to-${pack.dateRange.end}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <h2 className="text-lg font-semibold">{t('inspectionReadinessTitle')}</h2>

      {/* Date range selector */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="inspection-start-date"
            className="text-xs font-medium text-gray-700"
          >
            {t('startDate')}
          </label>
          <input
            id="inspection-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="inspection-end-date"
            className="text-xs font-medium text-gray-700"
          >
            {t('endDate')}
          </label>
          <input
            id="inspection-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            max={toDateInputValue(new Date())}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !startDate || !endDate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {loading ? t('generating') : t('generatePack')}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      )}

      {/* Results */}
      {pack && !loading && (
        <div className="flex flex-col gap-4">
          {/* Generated at + Export */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-gray-500">
              {t('generatedAt')}:{' '}
              <time dateTime={pack.generatedAt}>
                {new Date(pack.generatedAt).toLocaleString()}
              </time>
            </p>
            <button
              type="button"
              onClick={handleExportJson}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              {t('exportJson')}
            </button>
          </div>

          {/* Overall Score — prominent display */}
          <div className="rounded-lg border border-gray-200 bg-card p-6 text-center">
            <p
              className={`text-5xl font-bold ${
                pack.overallComplianceScore >= 80
                  ? 'text-green-600'
                  : pack.overallComplianceScore >= 60
                    ? 'text-amber-500'
                    : 'text-red-600'
              }`}
            >
              {pack.overallComplianceScore.toFixed(1)}%
            </p>
            <p className="mt-1 text-sm text-gray-500">{t('overallComplianceScore')}</p>
          </div>

          {/* Audit Scores */}
          <section
            aria-labelledby="audit-scores-heading"
            className="rounded-lg border border-gray-200 bg-card p-4"
          >
            <h3 id="audit-scores-heading" className="text-sm font-semibold mb-3">
              {t('auditScoresSection')}
            </h3>
            {pack.auditResults.length === 0 ? (
              <p className="text-sm text-gray-500">{t('noAuditData')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pack.auditResults.map((audit) => (
                  <li
                    key={audit.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">
                      {new Date(audit.auditDate).toLocaleDateString()}
                    </span>
                    <span
                      className={`font-medium ${
                        audit.complianceScore === null
                          ? 'text-gray-400'
                          : audit.complianceScore >= 80
                            ? 'text-green-600'
                            : audit.complianceScore >= 60
                              ? 'text-amber-500'
                              : 'text-red-600'
                      }`}
                    >
                      {audit.complianceScore === null
                        ? t('scoreIncomplete')
                        : `${audit.complianceScore.toFixed(1)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Waste Compliance */}
          <section
            aria-labelledby="waste-compliance-heading"
            className="rounded-lg border border-gray-200 bg-card p-4"
          >
            <h3 id="waste-compliance-heading" className="text-sm font-semibold mb-2">
              {t('wasteComplianceSection')}
            </h3>
            {pack.missingSections.includes('wasteSummaries') ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
                {t('wasteNotAvailable')}
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                {t('wasteSummaryCount', { count: pack.wasteSummaries.length })}
              </p>
            )}
          </section>

          {/* Temperature Compliance */}
          <section
            aria-labelledby="temp-compliance-heading"
            className="rounded-lg border border-gray-200 bg-card p-4"
          >
            <h3 id="temp-compliance-heading" className="text-sm font-semibold mb-2">
              {t('temperatureComplianceSection')}
            </h3>
            {pack.missingSections.includes('temperatureCompliance') ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
                {t('temperatureNotAvailable')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xl font-bold text-gray-800">
                    {pack.temperatureCompliance.totalReadings}
                  </p>
                  <p className="text-xs text-gray-500">{t('tempTotalReadings')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-800">
                    {pack.temperatureCompliance.excursionCount}
                  </p>
                  <p className="text-xs text-gray-500">{t('tempExcursions')}</p>
                </div>
                <div>
                  <p
                    className={`text-xl font-bold ${
                      pack.temperatureCompliance.excursionRate <= 5
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {(pack.temperatureCompliance.excursionRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500">{t('tempExcursionRate')}</p>
                </div>
              </div>
            )}
          </section>

          {/* Spill Incidents */}
          <section
            aria-labelledby="spill-incidents-heading"
            className="rounded-lg border border-gray-200 bg-card p-4"
          >
            <h3 id="spill-incidents-heading" className="text-sm font-semibold mb-2">
              {t('spillIncidentsSection')}
            </h3>
            {pack.missingSections.includes('spillIncidents') ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
                {t('spillNotAvailable')}
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                {t('spillCount', { count: (pack.spillIncidents as unknown[]).length })}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
