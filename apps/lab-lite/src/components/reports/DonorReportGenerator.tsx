'use client'

// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report Generator
// Program selector + period selector + Generate button.
// Shows DonorReportReview once a report is generated.
// Shows DonorReportList for past reports.
//
// PHI safety: all data handled here is aggregate statistics — no PHI.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getActiveDonorPrograms, saveDonorReport, getDonorReportDraft } from '@/lib/db'
import type { DonorProgram, DonorReport } from '@/lib/donor-types'
import { generateDonorReport } from '@/lib/donor-report-generator'
import { reportDonorAuditEvent } from '@/lib/audit-client'
import { Button } from '@/components/ui/Button'
import { DonorReportReview } from './DonorReportReview'
import { DonorReportList } from './DonorReportList'

type View = 'generate' | 'review'

export function DonorReportGenerator() {
  const t = useTranslations('donorReport')
  const session = useAuthSessionStore((s) => s.session)
  const [programs, setPrograms] = useState<DonorProgram[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<DonorReport | null>(null)
  const [view, setView] = useState<View>('generate')
  const [existingDraft, setExistingDraft] = useState<DonorReport | null>(null)

  const loadPrograms = useCallback(async () => {
    const active = await getActiveDonorPrograms()
    setPrograms(active)
    if (active.length === 1) setSelectedCode(active[0]!.programCode)
  }, [])

  useEffect(() => { void loadPrograms() }, [loadPrograms])

  // Default period to current quarter start/end
  useEffect(() => {
    if (periodStart || periodEnd) return
    const now = new Date()
    const q = Math.floor(now.getMonth() / 3)
    const qs = new Date(now.getFullYear(), q * 3, 1)
    const qe = new Date(now.getFullYear(), q * 3 + 3, 0)
    setPeriodStart(qs.toISOString().slice(0, 10))
    setPeriodEnd(qe.toISOString().slice(0, 10))
  }, [periodStart, periodEnd])

  async function handleGenerate() {
    if (!selectedCode) { setError(t('selectProgram')); return }
    if (!periodStart || !periodEnd) { setError(t('selectPeriod')); return }
    if (periodEnd < periodStart) { setError(t('invalidPeriod')); return }

    setGenerating(true)
    setError(null)
    setExistingDraft(null)
    try {
      // Check for existing draft before generating
      const draft = await getDonorReportDraft(selectedCode, periodStart, periodEnd)
      if (draft) {
        setExistingDraft(draft)
        setGenerating(false)
        return
      }

      const generated = await generateDonorReport(
        selectedCode,
        periodStart,
        periodEnd,
        session?.userId ?? 'unknown',
      )
      await saveDonorReport(generated)
      reportDonorAuditEvent({
        action: 'DONOR_REPORT_GENERATED',
        reportId: generated.id,
        programCode: generated.programCode,
        periodStart: generated.periodStart,
        periodEnd: generated.periodEnd,
      })
      setReport(generated)
      setView('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleOverwriteDraft() {
    setExistingDraft(null)
    setGenerating(true)
    setError(null)
    try {
      const generated = await generateDonorReport(
        selectedCode,
        periodStart,
        periodEnd,
        session?.userId ?? 'unknown',
      )
      await saveDonorReport(generated)
      reportDonorAuditEvent({
        action: 'DONOR_REPORT_GENERATED',
        reportId: generated.id,
        programCode: generated.programCode,
        periodStart: generated.periodStart,
        periodEnd: generated.periodEnd,
      })
      setReport(generated)
      setView('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  if (view === 'review' && report) {
    return (
      <DonorReportReview
        report={report}
        onUpdate={setReport}
        onBack={() => setView('generate')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-gray-800">{t('title')}</h1>

      {/* Program selector */}
      <div className="rounded-lg border border-gray-200 bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">{t('generate')}</h2>

        {programs.length === 0 ? (
          <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {t('noPrograms')} <a className="underline" href="/settings">{t('noProgramsHint')}</a>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('selectProgram')}</label>
              <select
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                data-testid="program-selector"
              >
                <option value="">{t('selectProgram')}</option>
                {programs.map((p) => (
                  <option key={p.programCode} value={p.programCode}>{p.programName}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('periodStart')}</label>
                <input
                  type="date"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  data-testid="period-start"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('periodEnd')}</label>
                <input
                  type="date"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  data-testid="period-end"
                />
              </div>
            </div>

            {error && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {existingDraft && (
              <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700 space-y-2">
                <p>{t('existingDraft')}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setReport(existingDraft); setView('review'); setExistingDraft(null) }}>
                    {t('reviewTitle')}
                  </Button>
                  <Button onClick={handleOverwriteDraft}>
                    {t('overwriteDraft')}
                  </Button>
                </div>
              </div>
            )}

            <Button onClick={handleGenerate} disabled={generating || !selectedCode}>
              {generating ? t('generating') : t('generate')}
            </Button>
          </>
        )}
      </div>

      {/* Past reports */}
      <DonorReportList onOpenReport={(r) => { setReport(r); setView('review') }} />
    </div>
  )
}
