'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { useLocationFilter } from '@/hooks/useLocationFilter'
import { TopHeader } from '@/components/TopHeader'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type AlertTab = 'anomalies' | 'clinical-safety'
type StatusFilter = 'ALL' | 'UNREVIEWED' | 'ESCALATED' | 'DISMISSED' | 'SUSPENDED'

interface AlertEntry {
  id: string
  practitionerName: string
  anomalyType: string
  threshold: number
  actualValue: number
  dateRangeStart: string
  dateRangeEnd: string
  severity: string
  status: string
  createdAt: string
}

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  CONTROLLED_SUBSTANCE_VOLUME: 'Controlled Substance Volume',
  DRUG_FREQUENCY: 'Drug Frequency',
}

function SeverityBadge({ severity }: { severity: string }) {
  const variantMap: Record<string, 'destructive' | 'warning' | 'secondary'> = {
    HIGH: 'destructive',
    MEDIUM: 'warning',
  }
  return (
    <Badge variant={variantMap[severity] ?? 'secondary'}>
      {severity}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'warning' | 'secondary' | 'destructive'> = {
    UNREVIEWED: 'warning',
    ESCALATED: 'secondary',
    DISMISSED: 'secondary',
    SUSPENDED: 'destructive',
  }
  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start)
  return `${formatDate(start)} – ${formatDate(end)}`
}

function formatThreshold(type: string, threshold: number, actual: number): string {
  if (type === 'CONTROLLED_SUBSTANCE_VOLUME') {
    return `${actual}/${threshold} Rx/day`
  }
  return `${actual}% / ${threshold}% patients`
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'UNREVIEWED', 'ESCALATED', 'DISMISSED', 'SUSPENDED']
const PAGE_SIZE = 25

// ─── Clinical Safety Section (Story 23.2 AC #10) ───

interface ClinicalSafetyMetrics {
  interactionCheckCompletionRate: number
  completionRateStatus: 'OK' | 'ALERT'
  contraindicatedOverrideRate: number
  overrideRateStatus: 'OK' | 'ALERT'
  unresolvedTier1Conflicts: number
  oldestTier1AgeHours: number | null
  tier1Status: 'OK' | 'WARNING' | 'ALERT'
  totalPrescriptions24h: number
  totalChecks7d: number
  overrides7d: number
}

interface ReportEntry {
  id: string
  month: number
  year: number
  generatedAt: string
}

function MetricCard({ label, value, status, detail }: {
  label: string
  value: string
  status: 'OK' | 'WARNING' | 'ALERT'
  detail?: string
}) {
  const statusColor = {
    OK: 'border-success/20 bg-success/10',
    WARNING: 'border-warning/20 bg-warning/10',
    ALERT: 'border-destructive/20 bg-destructive/10',
  }
  const dotColor = {
    OK: 'bg-success',
    WARNING: 'bg-warning',
    ALERT: 'bg-destructive',
  }

  return (
    <div className={`rounded-2xl border p-4 ${statusColor[status]}`}>
      <div className="flex items-center gap-2">
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor[status]}`} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
}

function ClinicalSafetySection() {
  const [metrics, setMetrics] = useState<ClinicalSafetyMetrics | null>(null)
  const [reports, setReports] = useState<ReportEntry[]>([])
  const [selectedReport, setSelectedReport] = useState<Record<string, unknown> | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [metricsResult, reportsResult] = await Promise.all([
          trpc.admin.getClinicalSafetyMetrics.query(),
          trpc.admin.listClinicalSafetyReports.query({ limit: 12 }),
        ])
        setMetrics(metricsResult)
        setReports(reportsResult.reports)
      } catch (err: unknown) {
        setError((err as Error)?.message ?? 'Failed to load clinical safety metrics')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function viewReport(month: number, year: number) {
    try {
      setReportLoading(true)
      const result = await trpc.admin.getClinicalSafetyReport.query({ month, year })
      setSelectedReport(result.report as Record<string, unknown>)
    } catch {
      setSelectedReport(null)
    } finally {
      setReportLoading(false)
    }
  }

  if (loading) return <div className="mt-6 text-muted-foreground">Loading clinical safety metrics...</div>
  if (error) return <div className="mt-6 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
  if (!metrics) return null

  return (
    <div className="mt-6 space-y-6">
      {/* Current metrics cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Interaction Check Completion (24h)"
          value={`${metrics.interactionCheckCompletionRate}%`}
          status={metrics.completionRateStatus}
          detail={`${metrics.totalPrescriptions24h} prescriptions in last 24h`}
        />
        <MetricCard
          label="CONTRAINDICATED Override Rate (7d)"
          value={`${metrics.contraindicatedOverrideRate}%`}
          status={metrics.overrideRateStatus}
          detail={`${metrics.overrides7d} overrides / ${metrics.totalChecks7d} checks`}
        />
        <MetricCard
          label="Unresolved Tier 1 Conflicts"
          value={String(metrics.unresolvedTier1Conflicts)}
          status={metrics.tier1Status}
          detail={metrics.oldestTier1AgeHours !== null
            ? `Oldest: ${metrics.oldestTier1AgeHours}h`
            : 'No unresolved conflicts'}
        />
      </div>

      {/* Monthly reports list */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">Monthly Reports</h3>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No monthly reports generated yet.</p>
        ) : (
          <div className="mt-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Period</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-popover">
                {reports.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => viewReport(r.month, r.year)}
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {new Date(r.year, r.month - 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.generatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report detail panel */}
        {reportLoading && <p className="mt-3 text-sm text-muted-foreground">Loading report...</p>}
        {selectedReport && !reportLoading && (
          <div className="mt-4 rounded-2xl border border-border bg-popover p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground">Report Detail</h4>
              <Button variant="ghost" size="sm" onClick={() => setSelectedReport(null)}>
                Close
              </Button>
            </div>
            <pre className="mt-3 max-h-96 overflow-auto rounded bg-card p-3 text-xs text-foreground">
              {JSON.stringify(selectedReport, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Alerts Page ───

export default function AlertsPage() {
  const router = useRouter()
  const { locationId } = useLocationFilter()
  const [activeTab, setActiveTab] = useState<AlertTab>('anomalies')
  const [alerts, setAlerts] = useState<AlertEntry[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // TODO: Pass locationId to filter by selected location once backend supports it
      const result = await trpc.admin.listAnomalyAlerts.query({
        status: filter,
        cursor,
        limit: PAGE_SIZE,
      })
      setAlerts(result.alerts)
      setTotal(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to load anomaly alerts')
    } finally {
      setLoading(false)
    }
  }, [filter, cursor])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  function handleFilterChange(newFilter: StatusFilter) {
    setFilter(newFilter)
    setCursor(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  return (
    <>
      <TopHeader title="Alerts & Safety" description="Review prescribing anomalies and clinical safety metrics." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Section tabs — Story 23.2 AC #10 */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab('anomalies')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'anomalies'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Prescribing Anomalies
          </button>
          <button
            onClick={() => setActiveTab('clinical-safety')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'clinical-safety'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Clinical Safety
          </button>
        </div>

        {activeTab === 'clinical-safety' ? (
          <ClinicalSafetySection />
        ) : (
        <>
        {/* Filter tabs + Export — AC #11 */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex gap-1 rounded-full bg-card p-1 w-fit">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === s
                    ? 'bg-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <ExportButton exportFn={() => trpc.admin.exportAlerts.query()} filters={{}} />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading anomaly alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No anomaly alerts found{filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.</p>
          </div>
        ) : (
          <>
            {/* Alert queue table — AC #1, #2 */}
            <div className="mt-4 rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Provider Name</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Anomaly Type</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Threshold Breached</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Date Range</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Severity</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {alerts.map((alert) => (
                    <tr
                      key={alert.id}
                      onClick={() => router.push(`/alerts/${alert.id}`)}
                      className="cursor-pointer hover:bg-primary/10 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{alert.practitionerName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatThreshold(alert.anomalyType, alert.threshold, alert.actualValue)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateRange(alert.dateRangeStart, alert.dateRangeEnd)}</td>
                      <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                      <td className="px-4 py-3"><StatusBadge status={alert.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                    disabled={cursor === 0}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor(cursor + PAGE_SIZE)}
                    disabled={cursor + PAGE_SIZE >= total}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>
    </>
  )
}
