'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  SafetyConcernCategory,
  ReportStatus,
  type SafetyReport,
} from '@/types/safety-reporting'
import {
  acknowledgeReport,
  updateInvestigation,
  closeReport,
} from '@/lib/safety/safety-report-service'
import { getSafetyReports } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useRequireLabRole } from '@/hooks/useLabPermission'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ChevronDown, ClipboardList, FileSearch } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

const STATUS_COLORS: Record<ReportStatus, string> = {
  [ReportStatus.SUBMITTED]: 'bg-warning/10 text-warning',
  [ReportStatus.ACKNOWLEDGED]: 'bg-primary/10 text-primary',
  [ReportStatus.INVESTIGATING]: 'bg-secondary text-secondary-foreground',
  [ReportStatus.CLOSED]: 'bg-success/10 text-success',
}

const CATEGORY_ICONS: Record<SafetyConcernCategory, string> = {
  [SafetyConcernCategory.HAND_HYGIENE]: '🧴',
  [SafetyConcernCategory.PPE_NON_USE]: '🧤',
  [SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL]: '🗑️',
  [SafetyConcernCategory.EQUIPMENT_MISUSE]: '⚠️',
  [SafetyConcernCategory.OTHER]: '📋',
}

interface SafetyReportManagementProps {
  onViewTrends?: () => void
}

export function SafetyReportManagement({ onViewTrends }: SafetyReportManagementProps) {
  const t = useTranslations('safety.reporting')
  const isManager = useRequireLabRole('LAB_MANAGER' as any)
  const session = useAuthSessionStore((s) => s.session)

  const [reports, setReports] = useState<SafetyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<SafetyReport | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<SafetyConcernCategory | 'ALL'>('ALL')
  const [investigationNotes, setInvestigationNotes] = useState('')
  const [resolutionText, setResolutionText] = useState('')
  const [actionInProgress, setActionInProgress] = useState(false)

  const loadReports = useCallback(async () => {
    setLoading(true)
    const all = await getSafetyReports()
    setReports(all)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  if (!isManager) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('managerOnly')}
      </div>
    )
  }

  const managerId = session?.userId ?? 'unknown'
  // No attributable user → disable state-changing actions (audit integrity).
  const hasValidActor = Boolean(session?.userId)

  const filteredReports = reports.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false
    return true
  })

  async function handleAcknowledge(reportId: string) {
    setActionInProgress(true)
    await acknowledgeReport(reportId, managerId)
    await loadReports()
    setSelectedReport(null)
    setActionInProgress(false)
  }

  async function handleInvestigate(reportId: string) {
    if (!investigationNotes.trim()) return
    setActionInProgress(true)
    await updateInvestigation(reportId, managerId, investigationNotes.trim())
    setInvestigationNotes('')
    await loadReports()
    setSelectedReport(null)
    setActionInProgress(false)
  }

  async function handleClose(reportId: string) {
    if (!resolutionText.trim()) return
    setActionInProgress(true)
    await closeReport(reportId, managerId, resolutionText.trim())
    setResolutionText('')
    await loadReports()
    setSelectedReport(null)
    setActionInProgress(false)
  }

  // Detail view
  if (selectedReport) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit px-0" onClick={() => setSelectedReport(null)}>
          ← {t('backToList')}
        </Button>

        <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-2xl">{CATEGORY_ICONS[selectedReport.category]}</span>
            <div>
              <h2 className="text-lg font-semibold">
                {t(`category.${selectedReport.category}`)}
              </h2>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedReport.status]}`}>
                {t(`status.${selectedReport.status}`)}
              </span>
            </div>
          </div>

          <div className="mb-4 text-sm text-muted-foreground">
            {t('submittedLabel')}: {new Date(selectedReport.submittedAt).toLocaleDateString()}
          </div>

          <div className="mb-6 rounded bg-muted/30 p-4 text-sm whitespace-pre-wrap">
            {selectedReport.details}
          </div>

          {selectedReport.investigatorNotes && (
            <div className="mb-4">
              <h3 className="mb-1 text-sm font-medium text-foreground">
                {t('investigationNotes')}
              </h3>
              <p className="rounded bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {selectedReport.investigatorNotes}
              </p>
            </div>
          )}

          {selectedReport.resolution && (
            <div className="mb-4">
              <h3 className="mb-1 text-sm font-medium text-foreground">
                {t('resolutionLabel')}
              </h3>
              <p className="rounded bg-success/10 p-3 text-sm whitespace-pre-wrap">
                {selectedReport.resolution}
              </p>
            </div>
          )}

          {/* Action buttons based on current status */}
          {selectedReport.status === ReportStatus.SUBMITTED && (
            <div className="flex gap-3">
              <Button
                onClick={() => handleAcknowledge(selectedReport.id)}
                disabled={actionInProgress || !hasValidActor}
              >
                {t('acknowledgeButton')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setResolutionText('')
                }}
              >
                {t('closeDirectButton')}
              </Button>
            </div>
          )}

          {selectedReport.status === ReportStatus.ACKNOWLEDGED && (
            <div className="space-y-3">
              <textarea
                value={investigationNotes}
                onChange={(e) => setInvestigationNotes(e.target.value)}
                placeholder={t('investigationNotesPlaceholder')}
                rows={3}
                className="w-full rounded-lg border border-border p-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                onClick={() => handleInvestigate(selectedReport.id)}
                disabled={!investigationNotes.trim() || actionInProgress || !hasValidActor}
              >
                {t('beginInvestigationButton')}
              </Button>
            </div>
          )}

          {(selectedReport.status === ReportStatus.INVESTIGATING ||
            selectedReport.status === ReportStatus.SUBMITTED) && (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <label className="text-sm font-medium text-foreground">
                {t('resolutionLabel')}
              </label>
              <textarea
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder={t('resolutionPlaceholder')}
                rows={3}
                className="w-full rounded-lg border border-border p-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                variant="warning"
                onClick={() => handleClose(selectedReport.id)}
                disabled={!resolutionText.trim() || actionInProgress || !hasValidActor}
              >
                {t('closeReportButton')}
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view
  const filtersActive = statusFilter !== 'ALL' || categoryFilter !== 'ALL'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('managementTitle')}</h1>

      {/* Toolbar: filters + view trends — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReportStatus | 'ALL')}
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
            aria-label={t('filterAllStatuses')}
          >
            <option value="ALL">{t('filterAllStatuses')}</option>
            {Object.values(ReportStatus).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as SafetyConcernCategory | 'ALL')}
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
            aria-label={t('filterAllCategories')}
          >
            <option value="ALL">{t('filterAllCategories')}</option>
            {Object.values(SafetyConcernCategory).map((c) => (
              <option key={c} value={c}>{t(`category.${c}`)}</option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        {onViewTrends && (
          <Button variant="outline" onClick={onViewTrends}>
            {t('viewTrends')}
          </Button>
        )}
      </div>

      {/* Report list — single cohesive box (loading / empty / list) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
            {t('loading')}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : ClipboardList}
              title={t('noReports')}
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedReport(report)}
                className="w-full p-4 text-start transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{CATEGORY_ICONS[report.category]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {t(`category.${report.category}`)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[report.status]}`}>
                        {t(`status.${report.status}`)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {report.details}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(report.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
