'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { saveHmisReport, finalizeHmisReport } from '@/lib/db'
import { reportHmisAuditEvent } from '@/lib/audit-client'
import { exportHmisPdf } from '@/lib/hmis-pdf'
import { exportToDhis2Json, exportToDhis2Csv } from '@/lib/hmis-dhis2-export'
import { formatReportingPeriod } from '@/lib/hmis-template'
import type { HmisMonthlyReport, ReportCorrection } from '@/lib/hmis-types'

interface HmisReportReviewProps {
  report: HmisMonthlyReport
  onUpdate: (updated: HmisMonthlyReport) => void
  onBack: () => void
}

/** Inline-editable numeric field. Highlights in amber when manually corrected. */
function EditableField({
  value,
  originalValue,
  fieldPath,
  label,
  onCorrect,
  onRevert,
  isCorrected,
  disabled,
}: {
  value: number | string
  originalValue: number | string
  fieldPath: string
  label: string
  onCorrect: (path: string, newValue: number | string) => void
  onRevert: (path: string) => void
  isCorrected: boolean
  disabled: boolean
}) {
  const t = useTranslations('hmisReport')
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => onCorrect(fieldPath, Number(e.target.value))}
        disabled={disabled}
        className={`w-24 rounded-md border px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
          isCorrected ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'border-input bg-background'
        }`}
      />
      {isCorrected && !disabled && (
        <button
          onClick={() => onRevert(fieldPath)}
          className="text-xs text-amber-700 dark:text-amber-400 underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          title={t('revertToComputed')}
        >
          {t('revertToComputed')}
        </button>
      )}
      {isCorrected && (
        <span className="text-xs text-muted-foreground">
          ({t('correctionsMade')}: {originalValue})
        </span>
      )}
    </div>
  )
}

export function HmisReportReview({ report, onUpdate, onBack }: HmisReportReviewProps) {
  const t = useTranslations('hmisReport')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)

  const [localReport, setLocalReport] = useState<HmisMonthlyReport>(report)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'dhis2-json' | 'dhis2-csv' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const isFinalized = localReport.status === 'finalized'

  /** Get original value for a field (before any correction). */
  const getOriginalValue = (fieldPath: string, currentValue: number | string): number | string => {
    const existing = localReport.corrections.find((c) => c.fieldPath === fieldPath)
    return existing?.originalValue ?? currentValue
  }

  const isCorrected = (fieldPath: string): boolean =>
    localReport.corrections.some((c) => c.fieldPath === fieldPath)

  const handleCorrect = useCallback(
    async (fieldPath: string, newValue: number | string) => {
      const practitionerId = session?.practitionerId ?? session?.userId ?? 'unknown'
      const now = new Date().toISOString()

      // Find the original value — use the first correction's originalValue, or the current value
      const existingCorrection = localReport.corrections.find((c) => c.fieldPath === fieldPath)
      const originalValue = existingCorrection?.originalValue ?? newValue

      const updatedCorrections: ReportCorrection[] = [
        ...localReport.corrections.filter((c) => c.fieldPath !== fieldPath),
        { fieldPath, originalValue, correctedValue: newValue, correctedBy: practitionerId, correctedAt: now },
      ]

      // Apply the correction to the report data structure
      const updated = applyCorrection({ ...localReport, corrections: updatedCorrections }, fieldPath, newValue)
      setLocalReport(updated)

      reportHmisAuditEvent({
        action: 'HMIS_REPORT_CORRECTED',
        reportId: localReport.id,
        fieldPath,
        reportMonth: localReport.reportMonth,
        reportYear: localReport.reportYear,
      })

      await saveHmisReport(updated)
      onUpdate(updated)
    },
    [localReport, session, onUpdate],
  )

  const handleRevert = useCallback(
    async (fieldPath: string) => {
      const correction = localReport.corrections.find((c) => c.fieldPath === fieldPath)
      if (!correction) return

      const updated: HmisMonthlyReport = {
        ...localReport,
        corrections: localReport.corrections.filter((c) => c.fieldPath !== fieldPath),
      }
      const reverted = applyCorrection(updated, fieldPath, correction.originalValue)
      setLocalReport(reverted)
      await saveHmisReport(reverted)
      onUpdate(reverted)
    },
    [localReport, onUpdate],
  )

  const handleFinalize = useCallback(async () => {
    setSaving(true)
    setErrorMsg('')
    try {
      const practitionerId = session?.practitionerId ?? session?.userId ?? 'unknown'
      await finalizeHmisReport(localReport.id, practitionerId)
      const finalized: HmisMonthlyReport = {
        ...localReport,
        status: 'finalized',
        finalizedBy: practitionerId,
        finalizedAt: new Date().toISOString(),
      }
      setLocalReport(finalized)
      setConfirmFinalize(false)

      reportHmisAuditEvent({
        action: 'HMIS_REPORT_FINALIZED',
        reportId: localReport.id,
        reportMonth: localReport.reportMonth,
        reportYear: localReport.reportYear,
      })

      onUpdate(finalized)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Finalization failed')
    } finally {
      setSaving(false)
    }
  }, [localReport, session, onUpdate])

  const handleExportPdf = useCallback(async () => {
    setExporting('pdf')
    try {
      const blob = await exportHmisPdf(localReport, locale)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `HMIS-${localReport.reportYear}-${String(localReport.reportMonth).padStart(2, '0')}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      reportHmisAuditEvent({
        action: 'HMIS_REPORT_EXPORTED',
        reportId: localReport.id,
        reportMonth: localReport.reportMonth,
        reportYear: localReport.reportYear,
        format: 'pdf',
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF export failed')
    } finally {
      setExporting(null)
    }
  }, [localReport, locale])

  const handleExportDhis2 = useCallback(
    async (format: 'json' | 'csv') => {
      setExporting(format === 'json' ? 'dhis2-json' : 'dhis2-csv')
      try {
        const orgUnit = 'ORG_UNIT_PLACEHOLDER'
        let content: string
        let filename: string
        let mime: string
        if (format === 'json') {
          content = JSON.stringify(exportToDhis2Json(localReport, orgUnit), null, 2)
          filename = `HMIS-DHIS2-${localReport.reportYear}-${String(localReport.reportMonth).padStart(2, '0')}.json`
          mime = 'application/json'
        } else {
          content = exportToDhis2Csv(localReport, orgUnit)
          filename = `HMIS-DHIS2-${localReport.reportYear}-${String(localReport.reportMonth).padStart(2, '0')}.csv`
          mime = 'text/csv'
        }
        const blob = new Blob([content], { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)

        reportHmisAuditEvent({
          action: 'HMIS_REPORT_EXPORTED',
          reportId: localReport.id,
          reportMonth: localReport.reportMonth,
          reportYear: localReport.reportYear,
          format: `dhis2-${format}`,
        })
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'DHIS2 export failed')
      } finally {
        setExporting(null)
      }
    },
    [localReport],
  )

  const period = formatReportingPeriod(localReport.reportYear, localReport.reportMonth)

  return (
    <main className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('reviewTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {localReport.facilityName} — {period}
            {isFinalized && (
              <span className="ms-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {t('statusFinalized')}
              </span>
            )}
            {!isFinalized && (
              <span className="ms-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                {t('statusDraft')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          ← {t('back')}
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* Section A: Facility Information */}
      <section className="mb-6 rounded-lg border border-border p-4">
        <h2 className="font-semibold mb-3">{t('sectionA')} — Facility Information</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('facilityName')}</dt>
          <dd>{localReport.facilityName}</dd>
          <dt className="text-muted-foreground">{t('facilityProvince')}</dt>
          <dd>{localReport.facilityProvince || '—'}</dd>
          <dt className="text-muted-foreground">{t('facilityDistrict')}</dt>
          <dd>{localReport.facilityDistrict || '—'}</dd>
          <dt className="text-muted-foreground">Reporting Period</dt>
          <dd>{period}</dd>
        </dl>
      </section>

      {/* Section B: Test Volume Summary */}
      <section className="mb-6 rounded-lg border border-border p-4">
        <h2 className="font-semibold mb-3">{t('sectionB')} — Test Volume Summary</h2>
        {localReport.testCategorySummary.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noReports')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 pe-4 font-medium text-muted-foreground">Test Category</th>
                  <th className="text-end py-2 px-2 font-medium text-muted-foreground">{t('totalTests')}</th>
                  <th className="text-end py-2 px-2 font-medium text-muted-foreground">Positive</th>
                  <th className="text-end py-2 px-2 font-medium text-muted-foreground">Negative</th>
                  <th className="text-end py-2 ps-2 font-medium text-muted-foreground">{t('positivityRate')} %</th>
                </tr>
              </thead>
              <tbody>
                {localReport.testCategorySummary.map((cat, idx) => (
                  <tr key={cat.loincCode} className="border-b border-border/50">
                    <td className="py-2 pe-4">{cat.categoryLabel}</td>
                    <td className="py-2 px-2 text-end">
                      <EditableField
                        value={cat.totalPerformed}
                        originalValue={getOriginalValue(`testCategorySummary[${idx}].totalPerformed`, cat.totalPerformed)}
                        fieldPath={`testCategorySummary[${idx}].totalPerformed`}
                        label={`Total performed for ${cat.categoryLabel}`}
                        onCorrect={handleCorrect}
                        onRevert={handleRevert}
                        isCorrected={isCorrected(`testCategorySummary[${idx}].totalPerformed`)}
                        disabled={isFinalized}
                      />
                    </td>
                    <td className="py-2 px-2 text-end">{cat.totalPositive}</td>
                    <td className="py-2 px-2 text-end">{cat.totalNegative}</td>
                    <td className="py-2 ps-2 text-end">{cat.positivityRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section C: Reportable Disease Surveillance */}
      <section className="mb-6 rounded-lg border border-border p-4">
        <h2 className="font-semibold mb-3">{t('sectionC')} — Reportable Disease Surveillance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start py-2 pe-4 font-medium text-muted-foreground">Disease</th>
                <th className="text-end py-2 px-2 font-medium text-muted-foreground">Tested</th>
                <th className="text-end py-2 px-2 font-medium text-muted-foreground">Positive</th>
                <th className="text-end py-2 px-2 font-medium text-muted-foreground">{t('positivityRate')} %</th>
                <th className="text-end py-2 ps-2 font-medium text-muted-foreground">{t('previousMonth')}</th>
              </tr>
            </thead>
            <tbody>
              {localReport.positivityRates.map((d) => (
                <tr key={d.diseaseCode} className="border-b border-border/50">
                  <td className="py-2 pe-4">{d.diseaseLabel}</td>
                  <td className="py-2 px-2 text-end">{d.totalTested}</td>
                  <td className="py-2 px-2 text-end">{d.totalPositive}</td>
                  <td className="py-2 px-2 text-end">{d.positivityRate}%</td>
                  <td className="py-2 ps-2 text-end text-muted-foreground">
                    {d.previousMonthRate != null ? `${d.previousMonthRate}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section D: Demographic Distribution */}
      <section className="mb-6 rounded-lg border border-border p-4">
        <h2 className="font-semibold mb-3">{t('sectionD')} — Demographic Distribution</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start py-2 pe-4 font-medium text-muted-foreground">{t('ageGroup')}</th>
                <th className="text-end py-2 px-2 font-medium text-muted-foreground">{t('male')}</th>
                <th className="text-end py-2 px-2 font-medium text-muted-foreground">{t('female')}</th>
                <th className="text-end py-2 px-2 font-medium text-muted-foreground">{t('unknown')}</th>
                <th className="text-end py-2 ps-2 font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {localReport.demographics.map((d) => (
                <tr key={d.ageGroup} className="border-b border-border/50">
                  <td className="py-2 pe-4">{d.ageGroup}</td>
                  <td className="py-2 px-2 text-end">{d.male}</td>
                  <td className="py-2 px-2 text-end">{d.female}</td>
                  <td className="py-2 px-2 text-end">{d.unknown}</td>
                  <td className="py-2 ps-2 text-end font-medium">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section E: Reagent Consumption */}
      <section className="mb-6 rounded-lg border border-border p-4">
        <h2 className="font-semibold mb-3">{t('sectionE')} — Reagent &amp; Supply Consumption</h2>
        {localReport.reagentConsumption.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reagent data — manual entry required.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 pe-4 font-medium text-muted-foreground">{t('reagent')}</th>
                  <th className="text-end py-2 px-2 font-medium text-muted-foreground">{t('consumption')}</th>
                  <th className="text-end py-2 ps-2 font-medium text-muted-foreground">Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                {localReport.reagentConsumption.map((r) => (
                  <tr key={r.reagentName} className="border-b border-border/50">
                    <td className="py-2 pe-4">{r.reagentName}</td>
                    <td className="py-2 px-2 text-end">{r.unitsConsumed}</td>
                    <td className="py-2 ps-2 text-end">{r.estimatedDaysRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section F: Quality Indicators */}
      <section className="mb-6 rounded-lg border border-border p-4">
        <h2 className="font-semibold mb-3">{t('sectionF')} — Quality Indicators</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('totalTests')}</dt>
          <dd>{localReport.qualityIndicators.totalSamplesReceived}</dd>
          <dt className="text-muted-foreground">{t('rejectedSamples')}</dt>
          <dd>{localReport.qualityIndicators.rejectedSamples}</dd>
          <dt className="text-muted-foreground">Rejection Rate</dt>
          <dd>{localReport.qualityIndicators.rejectionRate}%</dd>
          <dt className="text-muted-foreground">{t('qcPassRate')}</dt>
          <dd>{localReport.qualityIndicators.qcPassRate}%</dd>
          <dt className="text-muted-foreground">{t('averageTat')}</dt>
          <dd>{localReport.qualityIndicators.averageTatHours}h</dd>
        </dl>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleExportPdf}
          disabled={exporting !== null}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors"
        >
          {exporting === 'pdf' ? 'Exporting…' : t('exportPdf')}
        </button>

        <button
          onClick={() => handleExportDhis2('json')}
          disabled={exporting !== null}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors"
        >
          {exporting === 'dhis2-json' ? 'Exporting…' : t('exportDhis2Json')}
        </button>

        <button
          onClick={() => handleExportDhis2('csv')}
          disabled={exporting !== null}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors"
        >
          {exporting === 'dhis2-csv' ? 'Exporting…' : t('exportDhis2Csv')}
        </button>

        {!isFinalized && (
          <button
            onClick={() => setConfirmFinalize(true)}
            disabled={saving}
            className="ms-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors"
          >
            {t('finalize')}
          </button>
        )}
      </div>

      {/* Finalization confirmation dialog */}
      {confirmFinalize && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="rounded-lg bg-background border border-border p-6 max-w-sm w-full mx-4 shadow-lg">
            <h2 id="finalize-dialog-title" className="font-semibold text-lg mb-3">{t('finalizeConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">{t('finalizeConfirmBody')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmFinalize(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {saving ? 'Finalizing…' : t('finalize')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Corrections summary */}
      {localReport.corrections.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {t('correctionsMade')}: {localReport.corrections.length} field(s) manually adjusted
          </p>
        </div>
      )}
    </main>
  )
}

/** Apply a correction to the report data structure by field path. */
function applyCorrection(report: HmisMonthlyReport, fieldPath: string, value: number | string): HmisMonthlyReport {
  const result = { ...report }

  // testCategorySummary[N].field
  const testCatMatch = fieldPath.match(/^testCategorySummary\[(\d+)\]\.(\w+)$/)
  if (testCatMatch) {
    const idx = Number(testCatMatch[1])
    const field = testCatMatch[2] as keyof (typeof result.testCategorySummary)[number]
    result.testCategorySummary = result.testCategorySummary.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item,
    )
    return result
  }

  // positivityRates[N].field
  const posRateMatch = fieldPath.match(/^positivityRates\[(\d+)\]\.(\w+)$/)
  if (posRateMatch) {
    const idx = Number(posRateMatch[1])
    const field = posRateMatch[2] as keyof (typeof result.positivityRates)[number]
    result.positivityRates = result.positivityRates.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item,
    )
    return result
  }

  return result
}
