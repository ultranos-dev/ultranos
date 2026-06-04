'use client'

/**
 * Patient Result Timeline (Story 52.4 — Tasks 3, 5, 8, 9, 10)
 *
 * Longitudinal view of a patient's lab results grouped by LOINC test type.
 * Replaces the flat LabResultsList in the patient chart.
 *
 * AC: 1, 2, 3, 4, 5, 7, 8, 9, 10 (Story 52.4)
 *
 * CLAUDE.md Rule #4 (allergy prominence precedent): critical results pinned at top.
 * CLAUDE.md Rule #6: every access audit-logged.
 * CLAUDE.md Rule #7: data minimization handled by the caller (OPD projection).
 * RTL: border-inline-start for left-border indicators, logical CSS throughout.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import type { LocalDiagnosticReport } from '@/lib/db'
import { getPatientReports } from '@/lib/lab-results/report-aggregator'
import { groupReportsByLoinc, type GroupedResults } from '@/lib/lab-results/result-grouper'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { checkLabsConsent } from '@/lib/consent-check'
import { ResultTrendChart, ResultSummaryTable } from '@/components/clinical/ResultTrendChart'
import { LabReportDetail } from '@/components/clinical/LabReportDetail'
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, CircleCheck, WifiOff } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/Button'
import type { TrendDataPoint } from '@/lib/lab-results/result-grouper'

interface PatientResultTimelineProps {
  patientId: string
}

// ─── Flag-level styling ───────────────────────────────────────────────────────
// CLAUDE.md Rule #4 precedent: critical gets maximum visual prominence.

function flagBorderClass(flag?: string): string {
  switch (flag) {
    case 'critical': return 'border-s-4 border-s-red-500 bg-red-50'
    case 'abnormal': return 'border-s-4 border-s-amber-400 bg-amber-50'
    default: return 'border-s border-s-neutral-200'
  }
}

function flagDot(flag?: string) {
  switch (flag) {
    case 'critical':
      return <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
    case 'abnormal':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
    default:
      return <CircleCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
  }
}

function flagLabel(flag?: string): string {
  switch (flag) {
    case 'critical': return 'Critical'
    case 'abnormal': return 'Abnormal'
    default: return 'Normal'
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'preliminary':
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Preliminary</span>
    case 'final':
      return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Final</span>
    case 'amended':
    case 'corrected':
      return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
    default:
      return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{status}</span>
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Critical-result pin logic ────────────────────────────────────────────────
// CLAUDE.md Rule #4: critical lab values within last 7 days cannot scroll off.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function isRecentCritical(report: LocalDiagnosticReport): boolean {
  if (report._ultranos?.flagLevel !== 'critical') return false
  const t = new Date(report.effectiveDateTime ?? report.issued ?? '').getTime()
  return !Number.isNaN(t) && Date.now() - t < SEVEN_DAYS_MS
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onSelectReport,
}: {
  group: GroupedResults
  onSelectReport: (report: LocalDiagnosticReport) => void
}) {
  const [expanded, setExpanded] = useState(group.hasCritical)
  const [hoveredPoint, setHoveredPoint] = useState<TrendDataPoint | null>(null)

  const latestFlag = group.latestResult._ultranos?.flagLevel
  const borderCls = flagBorderClass(group.hasCritical ? 'critical' : group.hasAbnormal ? 'abnormal' : latestFlag)

  // Non-numeric fallback: build summary rows from conclusion text
  const summaryRows = group.results.map((r) => ({
    date: r.effectiveDateTime ?? r.issued ?? '',
    summary: r.conclusion?.split('\n')[0]?.slice(0, 80) ?? r.status,
    flagLevel: r._ultranos?.flagLevel,
  }))

  return (
    <div
      className={`rounded-xl border ${borderCls} overflow-hidden shadow-sm`}
      data-testid={`group-card-${group.loincCode}`}
    >
      {/* Header — always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-black/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`group-body-${group.loincCode}`}
      >
        {flagDot(group.hasCritical ? 'critical' : group.hasAbnormal ? 'abnormal' : latestFlag)}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{group.category}</span>
            {group.hasCritical && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Critical</span>
            )}
            {!group.hasCritical && group.hasAbnormal && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Abnormal</span>
            )}
            {statusBadge(group.latestResult.status)}
          </div>
          <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
            <span>{formatDate(group.latestResult.effectiveDateTime ?? group.latestResult.issued)}</span>
            <span>{group.results.length} result{group.results.length !== 1 ? 's' : ''}</span>
            <span>{group.latestResult.performer?.[0]?.display ?? group.latestResult._ultranos?.labId ?? ''}</span>
          </div>
        </div>

        <DirectionalIcon category="navigation" aria-hidden>
          {expanded
            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          }
        </DirectionalIcon>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          id={`group-body-${group.loincCode}`}
          className="border-t border-neutral-100 px-4 pb-4 pt-3 space-y-3"
        >
          {/* Trend visualization — AC #3 */}
          {group.trendData ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Trend</p>
              <ResultTrendChart
                trendData={group.trendData}
                label={group.category}
                hoveredPoint={hoveredPoint}
                onPointHover={setHoveredPoint}
              />
            </div>
          ) : (
            group.results.length > 1 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">History</p>
                <ResultSummaryTable results={summaryRows} />
              </div>
            )
          )}

          {/* Individual result entries — AC #5 (link to detail) */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Results</p>
            {group.results.map((report) => {
              const flag = report._ultranos?.flagLevel
              return (
                <button
                  key={report.id}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm hover:bg-muted transition-colors ${
                    flag === 'critical'
                      ? 'border-red-200 bg-red-50/50'
                      : flag === 'abnormal'
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-neutral-100 bg-background'
                  }`}
                  onClick={() => onSelectReport(report)}
                  data-testid={`result-entry-${report.id}`}
                >
                  {flagDot(flag)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{flagLabel(flag)}</span>
                      {statusBadge(report.status)}
                      {(report.status === 'amended' || report.status === 'corrected') && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">Amended</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(report.effectiveDateTime ?? report.issued)}</span>
                      <span>{report.performer?.[0]?.display ?? report._ultranos?.labId ?? ''}</span>
                    </div>
                    {report.conclusion && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {report.conclusion.slice(0, 100)}
                      </p>
                    )}
                  </div>
                  <DirectionalIcon category="navigation" aria-hidden>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </DirectionalIcon>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main timeline component ─────────────────────────────────────────────────

export function PatientResultTimeline({ patientId }: PatientResultTimelineProps) {
  const [groups, setGroups] = useState<GroupedResults[]>([])
  const [pinnedCriticals, setPinnedCriticals] = useState<LocalDiagnosticReport[]>([])
  const [loading, setLoading] = useState(true)
  const [consentDenied, setConsentDenied] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [allReports, setAllReports] = useState<LocalDiagnosticReport[]>([])
  const [selectedReport, setSelectedReport] = useState<LocalDiagnosticReport | null>(null)
  const patientRef = `Patient/${patientId}`
  const initialLoadDone = useRef(false)

  const loadPage = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    try {
      // Consent gate — AC #6 data minimization
      const consent = await checkLabsConsent(patientId)
      if (!consent.granted) {
        setConsentDenied(consent.reason ?? 'not_requested')
        setLoading(false)
        return
      }

      const page = await getPatientReports(patientRef, { cursor })
      setLastSyncedAt(page.lastSyncedAt)
      setNextCursor(page.nextCursor)

      setAllReports((prev) => {
        const merged = cursor ? [...prev, ...page.reports] : page.reports
        // Recompute groups from all loaded reports
        const grouped = groupReportsByLoinc(merged)
        setGroups(grouped)
        // Pin critical results from last 7 days — CLAUDE.md Rule #4
        const pinned = merged.filter(isRecentCritical)
        setPinnedCriticals(pinned)
        return merged
      })

      // AC #10: audit timeline view
      if (!initialLoadDone.current && page.reports.length > 0) {
        initialLoadDone.current = true
        auditPhiAccess(
          AuditAction.PHI_READ,
          AuditResourceType.LAB_RESULT,
          patientId,
          patientId,
          {
            phiAccess: 'lab_results_timeline_viewed',
            resultCount: page.reports.length,
          },
        )
      }
    } catch {
      // Offline-tolerant: show whatever is cached
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [patientId, patientRef])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedReport) {
    return (
      <LabReportDetail
        report={selectedReport}
        onBack={() => setSelectedReport(null)}
      />
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground" data-testid="timeline-loading">
        Loading lab results...
      </div>
    )
  }

  // ── Consent denied ───────────────────────────────────────────────────────
  if (consentDenied) {
    return (
      <div
        className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
        data-testid="consent-denied"
      >
        <p className="font-bold text-amber-800">
          {consentDenied === 'expired'
            ? 'Consent has expired — request renewal'
            : 'Patient consent required to view lab results'}
        </p>
        <p className="mt-1 text-amber-700">
          {consentDenied === 'expired'
            ? "The patient's consent to view lab results has expired. Please request a renewed consent."
            : 'The patient has not granted consent for lab data access.'}
        </p>
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (groups.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground" data-testid="timeline-empty">
        No lab results available for this patient.
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="patient-result-timeline">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">
          Lab Results ({allReports.length}{nextCursor ? '+' : ''})
        </h3>
        {lastSyncedAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="last-synced">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            <span>Synced {formatDate(lastSyncedAt)}</span>
          </div>
        )}
      </div>

      {/* Pinned critical results — AC #5, CLAUDE.md Rule #4 precedent */}
      {pinnedCriticals.length > 0 && (
        <div
          className="rounded-xl border-2 border-red-400 bg-red-50 p-3 space-y-2"
          data-testid="pinned-criticals"
          role="alert"
          aria-label="Recent critical lab results"
        >
          <p className="text-sm font-bold text-red-800">
            ⚠ Recent Critical Results (last 7 days)
          </p>
          {pinnedCriticals.map((report) => (
            <button
              key={report.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-background px-3 py-2 text-start hover:bg-red-50 transition-colors"
              onClick={() => setSelectedReport(report)}
              data-testid={`pinned-critical-${report.id}`}
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-red-900">
                  {report.code.coding?.[0]?.display ?? report.code.coding?.[0]?.code ?? 'Unknown Test'}
                </p>
                <p className="text-xs text-red-700">
                  {formatDate(report.effectiveDateTime ?? report.issued)}
                  {' · '}
                  {report.performer?.[0]?.display ?? ''}
                </p>
              </div>
              <DirectionalIcon category="navigation" aria-hidden>
                <ChevronRight className="h-4 w-4 shrink-0 text-red-400" />
              </DirectionalIcon>
            </button>
          ))}
        </div>
      )}

      {/* Grouped test categories */}
      <div className="space-y-2">
        {groups.map((group) => (
          <GroupCard
            key={group.loincCode}
            group={group}
            onSelectReport={setSelectedReport}
          />
        ))}
      </div>

      {/* Load more — AC #8 cursor-based pagination */}
      {nextCursor && (
        <Button
          variant="ghost"
          type="button"
          className="w-full text-sm"
          onClick={() => { void loadPage(nextCursor) }}
          disabled={loadingMore}
          data-testid="load-more"
        >
          {loadingMore ? 'Loading more...' : 'Load older results'}
        </Button>
      )}
    </div>
  )
}
