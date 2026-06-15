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
import { Button } from '@/components/ui/Button'

const STATUS_COLORS: Record<ReportStatus, string> = {
  [ReportStatus.SUBMITTED]: 'bg-amber-100 text-amber-800',
  [ReportStatus.ACKNOWLEDGED]: 'bg-blue-100 text-blue-800',
  [ReportStatus.INVESTIGATING]: 'bg-purple-100 text-purple-800',
  [ReportStatus.CLOSED]: 'bg-green-100 text-green-800',
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
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelectedReport(null)}
          className="text-sm text-primary-600 hover:underline"
        >
          ← {t('backToList')}
        </button>

        <div className="rounded-lg border border-border p-6">
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
              <p className="rounded bg-purple-50 p-3 text-sm whitespace-pre-wrap">
                {selectedReport.investigatorNotes}
              </p>
            </div>
          )}

          {selectedReport.resolution && (
            <div className="mb-4">
              <h3 className="mb-1 text-sm font-medium text-foreground">
                {t('resolutionLabel')}
              </h3>
              <p className="rounded bg-green-50 p-3 text-sm whitespace-pre-wrap">
                {selectedReport.resolution}
              </p>
            </div>
          )}

          {/* Action buttons based on current status */}
          {selectedReport.status === ReportStatus.SUBMITTED && (
            <div className="flex gap-3">
              <Button
                onClick={() => handleAcknowledge(selectedReport.id)}
                disabled={actionInProgress}
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
                className="w-full rounded-lg border border-border p-3 text-sm placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <Button
                onClick={() => handleInvestigate(selectedReport.id)}
                disabled={!investigationNotes.trim() || actionInProgress}
              >
                {t('beginInvestigationButton')}
              </Button>
            </div>
          )}

          {(selectedReport.status === ReportStatus.INVESTIGATING ||
            selectedReport.status === ReportStatus.SUBMITTED) &&
            selectedReport.status !== ReportStatus.CLOSED && (
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <label className="text-sm font-medium text-foreground">
                {t('resolutionLabel')}
              </label>
              <textarea
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder={t('resolutionPlaceholder')}
                rows={3}
                className="w-full rounded-lg border border-border p-3 text-sm placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <Button
                variant="warning"
                onClick={() => handleClose(selectedReport.id)}
                disabled={!resolutionText.trim() || actionInProgress}
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
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('managementTitle')}</h1>
        {onViewTrends && (
          <Button variant="outline" onClick={onViewTrends}>
            {t('viewTrends')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReportStatus | 'ALL')}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          <option value="ALL">{t('filterAllStatuses')}</option>
          {Object.values(ReportStatus).map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as SafetyConcernCategory | 'ALL')}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          <option value="ALL">{t('filterAllCategories')}</option>
          {Object.values(SafetyConcernCategory).map((c) => (
            <option key={c} value={c}>{t(`category.${c}`)}</option>
          ))}
        </select>
      </div>

      {/* Report list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : filteredReports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noReports')}</p>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedReport(report)}
              className="w-full rounded-lg border border-border p-4 text-start transition-colors hover:bg-muted/30"
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
  )
}
