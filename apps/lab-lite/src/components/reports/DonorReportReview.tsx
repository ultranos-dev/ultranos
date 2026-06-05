'use client'

// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report Review Screen
// Renders the generated report in donor template format.
// Allows minor corrections (same pattern as Story 50.1 HMIS review).
// Finalize + Export (PDF) + Share actions.
//
// PHI safety: all values are aggregate statistics — no PHI rendered.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { finalizeDonorReport, saveDonorReport } from '@/lib/db'
import type { DonorReport, ReportCorrection } from '@/lib/donor-types'
import { reportDonorAuditEvent } from '@/lib/audit-client'
import { exportDonorPdf } from '@/lib/donor-report-pdf'
import { shareFile } from '@/lib/share-file'
import { Button } from '@/components/ui/Button'

interface Props {
  report: DonorReport
  onUpdate: (r: DonorReport) => void
  onBack: () => void
}

export function DonorReportReview({ report, onUpdate, onBack }: Props) {
  const t = useTranslations('donorReport')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)
  const [finalizing, setFinalizing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isFinalized = report.status === 'finalized'

  async function handleFinalize() {
    if (!confirmFinalize) { setConfirmFinalize(true); return }
    setFinalizing(true)
    setError(null)
    try {
      const finalized = await finalizeDonorReport(report.id, session?.userId ?? 'unknown')
      reportDonorAuditEvent({
        action: 'DONOR_REPORT_FINALIZED',
        reportId: report.id,
        programCode: report.programCode,
        finalizerId: session?.userId ?? 'unknown',
      })
      onUpdate(finalized)
      setConfirmFinalize(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Finalize failed')
    } finally {
      setFinalizing(false)
    }
  }

  async function handleExportPdf() {
    setExporting(true)
    setError(null)
    try {
      const blob = await exportDonorPdf(report, locale)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `donor-report-${report.programCode}-${report.periodStart}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      reportDonorAuditEvent({
        action: 'DONOR_REPORT_EXPORTED',
        reportId: report.id,
        format: 'pdf',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleShare() {
    setSharing(true)
    setError(null)
    try {
      const blob = await exportDonorPdf(report, locale)
      const filename = `donor-report-${report.programCode}-${report.periodStart}.pdf`
      const result = await shareFile(blob, filename, {
        title: `${report.programName} — ${report.periodStart} to ${report.periodEnd}`,
        text: `Donor report for ${report.programName}`,
      })
      if (result !== 'cancelled') {
        reportDonorAuditEvent({
          action: 'DONOR_REPORT_EXPORTED',
          reportId: report.id,
          format: result === 'shared' ? 'share' : 'download',
        })
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message)
      }
    } finally {
      setSharing(false)
    }
  }

  async function handleCorrection(
    sectionIdx: number,
    rowIdx: number,
    field: string,
    newValue: string | number,
  ) {
    const section = report.sections[sectionIdx]
    if (!section) return
    const original = section.rows[rowIdx]?.[field]
    if (original === undefined || original === newValue) return

    const correction: ReportCorrection = {
      fieldPath: `sections[${sectionIdx}].rows[${rowIdx}].${field}`,
      originalValue: original as string | number,
      correctedValue: newValue,
      correctedBy: session?.userId ?? 'unknown',
      correctedAt: new Date().toISOString(),
    }

    const updatedSections = report.sections.map((s, si) => {
      if (si !== sectionIdx) return s
      return {
        ...s,
        rows: s.rows.map((r, ri) =>
          ri === rowIdx ? { ...r, [field]: newValue } : r,
        ),
      }
    })

    const updated: DonorReport = {
      ...report,
      sections: updatedSections,
      corrections: [...report.corrections, correction],
    }
    await saveDonorReport(updated)
    reportDonorAuditEvent({
      action: 'DONOR_REPORT_CORRECTED',
      reportId: report.id,
      programCode: report.programCode,
      fieldPath: correction.fieldPath,
      correctedBy: correction.correctedBy,
    })
    onUpdate(updated)
  }

  return (
    <div className="space-y-4 p-4" data-testid="donor-report-review">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">←</button>
        <h2 className="text-base font-semibold text-gray-800">{t('reviewTitle')}</h2>
        <span className={`ms-auto rounded-full px-2 py-0.5 text-xs font-medium ${isFinalized ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {isFinalized ? t('statusFinalized') : t('statusDraft')}
        </span>
      </div>

      {/* Report meta */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
        <p><span className="font-medium">{t('programName')}:</span> {report.programName}</p>
        <p><span className="font-medium">{t('selectPeriod')}:</span> {report.periodStart} — {report.periodEnd}</p>
        <p><span className="font-medium">Generated:</span> {new Date(report.generatedAt).toLocaleDateString()}</p>
        {report.warnings.includes('no_data') && (
          <p className="text-amber-700">⚠ {t('noDataForPeriod')}</p>
        )}
        {report.warnings.includes('partial_data') && (
          <p className="text-amber-600">⚠ {t('partialData')}</p>
        )}
      </div>

      {/* Sections */}
      {report.sections.map((section, sectionIdx) => (
        <div key={section.sectionId} className="rounded-lg border border-gray-200 bg-card overflow-hidden">
          <div className="bg-blue-600 px-3 py-2">
            <h3 className="text-sm font-semibold text-white">{section.sectionTitle}</h3>
          </div>
          {section.rows.length === 0 ? (
            <p className="p-3 text-sm text-gray-500 italic">{t('noDataForPeriod')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {Object.keys(section.rows[0] ?? {}).filter((k) => k !== 'loincCode').map((k) => (
                    <th key={k} className="px-3 py-2 text-start text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-gray-100 last:border-0">
                    {Object.entries(row)
                      .filter(([k]) => k !== 'loincCode')
                      .map(([k, v]) => (
                        <td key={k} className="px-3 py-2 text-gray-700">
                          {!isFinalized && typeof v === 'number' ? (
                            <input
                              key={`${sectionIdx}-${rowIdx}-${k}-${v}`}
                              type="number"
                              className="w-20 rounded border border-gray-200 px-1 py-0.5 text-sm text-end"
                              defaultValue={v}
                              onBlur={(e) => {
                                const n = Number(e.target.value)
                                if (!isNaN(n) && n !== v) handleCorrection(sectionIdx, rowIdx, k, n)
                              }}
                              data-testid={`correction-${sectionIdx}-${rowIdx}-${k}`}
                            />
                          ) : (
                            String(v)
                          )}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Reimbursement summary */}
      {report.reimbursement && (
        <div className="rounded-lg border border-gray-200 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{t('reimbursement')}</h3>
          {report.reimbursement.lineItems.map((item) => (
            <div key={item.loincCode} className="flex justify-between text-sm">
              <span className="text-gray-600">{item.testLabel} × {item.count}</span>
              <span className="font-medium">{report.reimbursement!.currency} {item.subtotal.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-semibold">
            <span>{t('grandTotal')}</span>
            <span>{report.reimbursement.currency} {report.reimbursement.grandTotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Corrections note */}
      {report.corrections.length > 0 && (
        <p className="text-xs text-gray-500 italic">
          {t('corrections')}: {report.corrections.length} field(s) corrected
        </p>
      )}

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isFinalized && (
          <>
            {confirmFinalize ? (
              <>
                <p className="w-full text-sm text-amber-700">{t('finalizeConfirm')}</p>
                <Button onClick={handleFinalize} disabled={finalizing}>
                  {finalizing ? '…' : t('finalize')}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmFinalize(false)}>Cancel</Button>
              </>
            ) : (
              <Button onClick={() => setConfirmFinalize(true)}>{t('finalize')}</Button>
            )}
          </>
        )}
        <Button variant="secondary" onClick={handleExportPdf} disabled={exporting}>
          {exporting ? '…' : t('exportPdf')}
        </Button>
        <Button variant="secondary" onClick={handleShare} disabled={sharing}>
          {sharing ? t('sharing') : t('share')}
        </Button>
      </div>
    </div>
  )
}
