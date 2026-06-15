'use client'

import { useEffect, useState, useCallback } from 'react'
import { db, type LocalDiagnosticReport } from '@/lib/db'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/Button'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { checkLabsConsent, type ConsentCheckResult } from '@/lib/consent-check'

interface LabResultsListProps {
  patientId: string
  onSelectReport: (report: LocalDiagnosticReport) => void
}

const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

function statusBadge(status: string) {
  switch (status) {
    case 'preliminary':
      return (
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
          Preliminary
        </span>
      )
    case 'final':
      return (
        <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success">
          Final
        </span>
      )
    case 'amended':
    case 'corrected':
      return (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      )
    default:
      return (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
          {status}
        </span>
      )
  }
}

function isUrgent(report: LocalDiagnosticReport): boolean {
  // AC #4: "24h+ unacknowledged" — both conditions must hold
  if (report.acknowledgedAt) return false
  if (!report.issued) return false
  const issued = new Date(report.issued).getTime()
  if (Number.isNaN(issued)) return false
  const age = Date.now() - issued
  return age > URGENT_THRESHOLD_MS
}

function formatDate(iso?: string): string {
  if (!iso) return 'Unknown'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function LabResultsList({ patientId, onSelectReport }: LabResultsListProps) {
  const [reports, setReports] = useState<LocalDiagnosticReport[]>([])
  const [loading, setLoading] = useState(true)
  const [consentResult, setConsentResult] = useState<ConsentCheckResult | null>(null)

  const loadReports = useCallback(async () => {
    try {
      // AC #5 / Task 6: Consent enforcement before displaying results
      const consent = await checkLabsConsent(patientId)
      setConsentResult(consent)
      if (!consent.granted) {
        setLoading(false)
        return
      }

      const patientRef = `Patient/${patientId}`
      const results = await db.diagnosticReports
        .where('subject.reference')
        .equals(patientRef)
        .toArray()

      // Sort by effectiveDateTime descending, fallback to issued
      results.sort((a, b) => {
        const dateA = new Date(a.effectiveDateTime ?? a.issued ?? 0).getTime()
        const dateB = new Date(b.effectiveDateTime ?? b.issued ?? 0).getTime()
        return dateB - dateA
      })

      setReports(results)

      // AC #5: Audit PHI READ on list load
      if (results.length > 0) {
        auditPhiAccess(
          AuditAction.PHI_READ,
          AuditResourceType.LAB_RESULT,
          patientId,
          patientId,
          { phiAccess: 'lab_results_list', resultCount: results.length },
        )
      }
    } catch {
      // Offline-tolerant: show empty state
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        Loading lab results...
      </div>
    )
  }

  // Task 6.3: No consent message
  if (consentResult && !consentResult.granted) {
    if (consentResult.reason === 'expired') {
      return (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm" data-testid="consent-expired">
          <p className="font-bold text-warning">Consent has expired — request renewal</p>
          <p className="mt-1 text-warning">
            The patient&apos;s consent to view lab results has expired. Please request a renewed consent before accessing lab data.
          </p>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm" data-testid="consent-required">
        <p className="font-bold text-warning">Patient consent required to view lab results</p>
        <p className="mt-1 text-warning">
          The patient has not granted consent for lab data access. Please obtain consent before viewing lab results.
        </p>
      </div>
    )
  }

  // Consent unverified warning (offline/network error — still showing cached data)
  const consentUnverified = consentResult?.granted && consentResult.unverified

  if (reports.length === 0) {
    return <EmptyState title="No lab results available for this patient." size="sm" />
  }

  return (
    <div className="space-y-2" data-testid="lab-results-list">
      {consentUnverified && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm" data-testid="consent-unverified">
          <p className="font-bold text-warning">Consent status could not be verified</p>
          <p className="mt-1 text-warning">
            Showing cached results. Consent will be re-checked when connectivity is restored.
          </p>
        </div>
      )}
      <h3 className="text-lg font-bold text-foreground">
        Lab Results ({reports.length})
      </h3>
      <ul className="space-y-2" aria-label="Lab results list">
        {reports.map((report) => {
          const urgent = isUrgent(report)
          const loincDisplay =
            report.code.coding?.[0]?.display ?? report.code.coding?.[0]?.code ?? 'Unknown Test'
          const labName = report.performer?.[0]?.display ?? 'Unknown Lab'
          const collectionDate = formatDate(report.effectiveDateTime ?? report.issued)

          return (
            <li key={report.id}>
              <Button
                variant="ghost"
                type="button"
                onClick={() => onSelectReport(report)}
                className={`w-full rounded-lg border px-4 py-3 text-start hover:bg-muted ${
                  urgent
                    ? 'border-destructive/30 bg-destructive/10'
                    : 'border-border bg-background'
                }`}
                aria-label={`View ${loincDisplay} from ${labName}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {loincDisplay}
                      </span>
                      {statusBadge(report.status)}
                      {urgent && (
                        <span
                          className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white"
                          data-testid="urgent-indicator"
                        >
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span>{collectionDate}</span>
                      <span>{labName}</span>
                    </div>
                  </div>
                  <DirectionalIcon category="navigation" aria-hidden={true}>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </DirectionalIcon>
                </div>
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
