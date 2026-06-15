'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { aggregateMonthlyData } from '@/lib/hmis-aggregator'
import { saveHmisReport, getHmisReportsByYear, getDailyLogSettings } from '@/lib/db'
import { reportHmisAuditEvent } from '@/lib/audit-client'
import { HmisReportReview } from './HmisReportReview'
import { HmisReportList } from './HmisReportList'
import type { HmisMonthlyReport } from '@/lib/hmis-types'

type PageState = 'idle' | 'generating' | 'review' | 'error'

export function HmisReportGenerator() {
  const t = useTranslations('hmisReport')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)

  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const [month, setMonth] = useState<number>(() => new Date().getMonth() + 1)
  const [state, setState] = useState<PageState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [report, setReport] = useState<HmisMonthlyReport | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const generatingRef = useRef(false)

  const handleGenerate = useCallback(async () => {
    if (generatingRef.current) return
    generatingRef.current = true
    setState('generating')
    setErrorMsg('')
    try {
      const settings = await getDailyLogSettings().catch(() => null)
      const facilityName = settings?.facilityName ?? 'Lab Lite'
      const practitionerId = session?.practitionerId ?? session?.userId ?? 'unknown'

      // Duplicate guard: check if a report already exists for this month
      const existing = await getHmisReportsByYear(year)
      const duplicate = existing.find((r) => r.reportMonth === month)
      if (duplicate) {
        // Re-open existing report
        setReport(duplicate)
        setState('review')
        return
      }

      const partial = await aggregateMonthlyData(
        year, month, practitionerId, facilityName,
        '', // facilityProvince — set via settings in future
        '', // facilityDistrict — set via settings in future
      )
      const newReport: HmisMonthlyReport = {
        ...partial,
        id: crypto.randomUUID(),
        syncStatus: 'pending',
      }

      await saveHmisReport(newReport)

      reportHmisAuditEvent({
        action: 'HMIS_REPORT_GENERATED',
        reportId: newReport.id,
        reportMonth: month,
        reportYear: year,
      })

      setReport(newReport)
      setState('review')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    } finally {
      generatingRef.current = false
    }
  }, [year, month, session])

  const handleReportUpdated = useCallback((updated: HmisMonthlyReport) => {
    setReport(updated)
  }, [])

  const handleBack = useCallback(() => {
    setReport(null)
    setState('idle')
  }, [])

  if (state === 'review' && report) {
    return (
      <HmisReportReview
        report={report}
        onUpdate={handleReportUpdated}
        onBack={handleBack}
      />
    )
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {state === 'error' && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {errorMsg || t('generateError')}
        </div>
      )}

      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="report-year" className="block text-sm font-medium mb-1">
              {t('selectYear')}
            </label>
            <select
              id="report-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="report-month" className="block text-sm font-medium mb-1">
              {t('selectMonth')}
            </label>
            <select
              id="report-month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString(locale, { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={state === 'generating'}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors"
          aria-busy={state === 'generating'}
        >
          {state === 'generating' ? t('generating') : t('generateReport')}
        </button>
      </div>

      <div className="mt-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-primary underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('reportHistory')}
        </button>
        {showHistory && (
          <HmisReportList
            year={year}
            onSelect={(r) => { setReport(r); setState('review') }}
          />
        )}
      </div>
    </div>
  )
}
