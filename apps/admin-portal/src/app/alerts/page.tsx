'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

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
  const colorMap: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-800',
    MEDIUM: 'bg-orange-100 text-orange-800',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[severity] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    UNREVIEWED: 'bg-amber-100 text-amber-800',
    ESCALATED: 'bg-purple-100 text-purple-800',
    DISMISSED: 'bg-neutral-100 text-neutral-600',
    SUSPENDED: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
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
    OK: 'border-green-200 bg-green-50',
    WARNING: 'border-amber-200 bg-amber-50',
    ALERT: 'border-red-200 bg-red-50',
  }
  const dotColor = {
    OK: 'bg-green-500',
    WARNING: 'bg-amber-500',
    ALERT: 'bg-red-500',
  }

  return (
    <div className={`rounded-3xl border p-4 ${statusColor[status]}`}>
      <div className="flex items-center gap-2">
        <div className={`h-2.5 w-2.5 rounded-full ${dotColor[status]}`} />
        <span className="text-sm font-medium text-neutral-700">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-text-muted">{detail}</p>}
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
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load clinical safety metrics')
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

  if (loading) return <div className="mt-6 text-text-muted">Loading clinical safety metrics...</div>
  if (error) return <div className="mt-6 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
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
        <h3 className="text-lg font-semibold text-neutral-900">Monthly Reports</h3>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No monthly reports generated yet.</p>
        ) : (
          <div className="mt-2 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Period</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {reports.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => viewReport(r.month, r.year)}
                    className="cursor-pointer hover:bg-brand-lime/5 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {new Date(r.year, r.month - 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(r.generatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report detail panel */}
        {reportLoading && <p className="mt-3 text-sm text-text-muted">Loading report...</p>}
        {selectedReport && !reportLoading && (
          <div className="mt-4 rounded-3xl border border-border bg-white p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-neutral-900">Report Detail</h4>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-sm text-text-muted hover:text-black transition-colors"
              >
                Close
              </button>
            </div>
            <pre className="mt-3 max-h-96 overflow-auto rounded bg-neutral-50 p-3 text-xs text-neutral-700">
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
      const result = await trpc.admin.listAnomalyAlerts.query({
        status: filter,
        cursor,
        limit: PAGE_SIZE,
      })
      setAlerts(result.alerts)
      setTotal(result.total)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load anomaly alerts')
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
    <div className="max-w-6xl">
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">Alerts & Safety</h1>
      <p className="mt-4 text-text-muted">Review prescribing anomalies and clinical safety metrics.</p>

      {/* Section tabs — Story 23.2 AC #10 */}
      <div className="mt-6 flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'anomalies'
              ? 'border-brand-lime text-black'
              : 'border-transparent text-text-muted hover:text-black'
          }`}
        >
          Prescribing Anomalies
        </button>
        <button
          onClick={() => setActiveTab('clinical-safety')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'clinical-safety'
              ? 'border-brand-lime text-black'
              : 'border-transparent text-text-muted hover:text-black'
          }`}
        >
          Clinical Safety
        </button>
      </div>

      {activeTab === 'clinical-safety' ? (
        <ClinicalSafetySection />
      ) : (
      <>
      {/* Filter tabs — AC #11 */}
      <div className="mt-6 flex gap-1 rounded-full bg-black p-1 w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-brand-lime text-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 text-text-muted">Loading anomaly alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="mt-6 rounded-3xl border-2 border-dashed border-border bg-neutral-50 p-8 text-center">
          <p className="text-text-muted">No anomaly alerts found{filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.</p>
        </div>
      ) : (
        <>
          {/* Alert queue table — AC #1, #2 */}
          <div className="mt-4 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Provider Name</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Anomaly Type</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Threshold Breached</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Date Range</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {alerts.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => router.push(`/alerts/${alert.id}`)}
                    className="cursor-pointer hover:bg-brand-lime/5 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{alert.practitionerName}</td>
                    <td className="px-4 py-3 text-text-muted">{ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType}</td>
                    <td className="px-4 py-3 text-text-muted">{formatThreshold(alert.anomalyType, alert.threshold, alert.actualValue)}</td>
                    <td className="px-4 py-3 text-text-muted">{formatDateRange(alert.dateRangeStart, alert.dateRangeEnd)}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={alert.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
              <span>
                Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                  disabled={cursor === 0}
                  className="rounded-full border border-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:scale-[1.02] transition-all"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCursor(cursor + PAGE_SIZE)}
                  disabled={cursor + PAGE_SIZE >= total}
                  className="rounded-full border border-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:scale-[1.02] transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  )
}
