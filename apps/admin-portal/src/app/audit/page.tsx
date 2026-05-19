'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { EventBrowser } from '@/components/audit/EventBrowser'

interface Verification {
  id: string
  verifiedAt: string
  checkedCount: number
  valid: boolean | null
  brokenAtEventId: string | null
  jobDurationMs: number
  errorReason: string | null
  isFullVerification: boolean
  triggeredBy: string
}

interface ChainStatus {
  lastVerifiedAt: string | null
  lastResult: boolean | null
  chainHealthy: boolean | null
  consecutiveSuccesses: number
  lastCheckedCount: number
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'Less than 1 hour ago'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function ChainStatusBadge({ valid }: { valid: boolean | null }) {
  if (valid === true) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-sm font-medium text-success">
        <span className="h-2 w-2 rounded-full bg-success" />
        Healthy
      </span>
    )
  }
  if (valid === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-subtle px-3 py-1 text-sm font-medium text-danger">
        <span className="h-2 w-2 rounded-full bg-danger" />
        Broken
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-medium text-text-secondary">
      <span className="h-2 w-2 rounded-full bg-text-secondary" />
      Unknown
    </span>
  )
}

function ResultIcon({ valid }: { valid: boolean | null }) {
  if (valid === true) return <span className="text-success" title="Pass">&#10003;</span>
  if (valid === false) return <span className="text-danger" title="Fail">&#10007;</span>
  return <span className="text-text-secondary" title="Job failed">&#8212;</span>
}

const PAGE_SIZE = 30

export default function AuditChainPage() {
  const [tab, setTab] = useState<'integrity' | 'events'>('integrity')
  const [status, setStatus] = useState<ChainStatus | null>(null)
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<Verification[]>([])
  const [fullVerifyLoading, setFullVerifyLoading] = useState(false)
  const [fullVerifyResult, setFullVerifyResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [statusResult, historyResult, trendResult] = await Promise.all([
        trpc.admin.getAuditChainStatus.query(),
        trpc.admin.listAuditChainVerifications.query({
          cursor,
          limit: PAGE_SIZE,
          daysBack: 30,
        }),
        // Dedicated unpaginated query for 30-day trend (only verified_at + valid)
        trpc.admin.listAuditChainVerifications.query({
          cursor: 0,
          limit: 100,
          daysBack: 30,
        }),
      ])
      setStatus(statusResult)
      setVerifications(historyResult.verifications)
      setTotal(historyResult.total)
      setTrendData(trendResult.verifications)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load audit chain status')
    } finally {
      setLoading(false)
    }
  }, [cursor])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleFullVerification() {
    setFullVerifyLoading(true)
    setFullVerifyResult(null)
    try {
      const result = await trpc.admin.triggerFullChainVerification.mutate()
      if (result.valid === true) {
        setFullVerifyResult(`Full verification passed. ${result.checkedCount} entries checked in ${result.jobDurationMs}ms.`)
      } else if (result.valid === false) {
        setFullVerifyResult(`Chain broken at event ${result.brokenAtEventId}. ${result.checkedCount} entries checked.`)
      } else {
        setFullVerifyResult(`Verification failed: ${result.errorReason}`)
      }
      // Refresh data after verification
      fetchData()
    } catch (err: any) {
      setFullVerifyResult(`Error: ${err?.message ?? 'Full verification failed'}`)
    } finally {
      setFullVerifyLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  // Build 30-day health trend from dedicated trend query (not paginated table data)
  const trendDays = buildTrend(trendData)

  return (
    <>
      <TopHeader title="Audit Log Integrity" description="Monitor audit log hash chain integrity and verification history." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Tab bar */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('integrity')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'integrity' ? 'bg-brand-lime text-black' : 'border border-border text-text-muted hover:bg-surface'
            }`}
          >
            Chain Integrity
          </button>
          <button
            onClick={() => setTab('events')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'events' ? 'bg-brand-lime text-black' : 'border border-border text-text-muted hover:bg-surface'
            }`}
          >
            Event Browser
          </button>
        </div>

        {tab === 'events' && <EventBrowser />}

        {tab === 'integrity' && (<>
        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-text-secondary">Loading audit chain status...</div>
        ) : (
          <>
            {/* Status cards (AC #8) */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-surface-raised p-4 border border-border shadow-card">
                <p className="text-sm font-medium text-text-secondary">Chain Status</p>
                <div className="mt-2">
                  <ChainStatusBadge valid={status?.chainHealthy ?? null} />
                </div>
              </div>

              <div className="rounded-2xl bg-surface-raised p-4 border border-border shadow-card">
                <p className="text-sm font-medium text-text-secondary">Last Verified</p>
                <p className="mt-1 text-lg font-semibold">
                  {status?.lastVerifiedAt ? timeAgo(status.lastVerifiedAt) : 'Never'}
                </p>
                {status?.lastVerifiedAt && (
                  <p className="text-xs text-text-secondary">{formatDate(status.lastVerifiedAt)}</p>
                )}
              </div>

              <div className="rounded-2xl bg-surface-raised p-4 border border-border shadow-card">
                <p className="text-sm font-medium text-text-secondary">Entries Verified</p>
                <p className="mt-1 text-lg font-semibold">
                  {status?.lastCheckedCount?.toLocaleString() ?? '0'}
                </p>
              </div>

              <div className="rounded-2xl bg-surface-raised p-4 border border-border shadow-card">
                <p className="text-sm font-medium text-text-secondary">Consecutive Successes</p>
                <p className="mt-1 text-lg font-semibold">
                  {status?.consecutiveSuccesses ?? 0}
                </p>
              </div>
            </div>

            {/* 30-day health trend (AC #8) */}
            {trendDays.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-medium text-text-secondary">30-Day Health Trend</h2>
                <div className="mt-2 flex items-end gap-0.5">
                  {trendDays.map((day) => (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.status}`}
                      className={`h-6 w-2 rounded-sm ${
                        day.status === 'pass' ? 'bg-success' :
                        day.status === 'fail' ? 'bg-danger' :
                        day.status === 'error' ? 'bg-warning' :
                        'bg-border'
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex gap-4 text-xs text-text-secondary">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-success" /> Pass</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-danger" /> Fail</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-warning" /> Error</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-border" /> No data</span>
                </div>
              </div>
            )}

            {/* Full verification button (AC #9) */}
            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={handleFullVerification}
                disabled={fullVerifyLoading}
                className="rounded-full bg-text-primary px-6 py-2.5 text-sm font-semibold text-canvas hover:opacity-90 hover:scale-[1.02] disabled:opacity-50 transition-transform duration-200"
              >
                {fullVerifyLoading ? 'Verifying...' : 'Run Full Verification'}
              </button>
              {fullVerifyResult && (
                <p className="text-sm text-text-secondary">{fullVerifyResult}</p>
              )}
            </div>

            {/* Verification history table (AC #6) */}
            <div className="mt-6 rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Result</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Entries Checked</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Duration</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Triggered By</th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary text-xs uppercase tracking-wide">Broken Event ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {verifications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-secondary">
                        No verification history found in the last 30 days.
                      </td>
                    </tr>
                  ) : (
                    verifications.map((v) => (
                      <tr key={v.id} className="hover:bg-accent-subtle transition-colors">
                        <td className="px-4 py-3">{formatDate(v.verifiedAt)}</td>
                        <td className="px-4 py-3"><ResultIcon valid={v.valid} /></td>
                        <td className="px-4 py-3 text-text-secondary">{v.checkedCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-text-secondary">{v.jobDurationMs}ms</td>
                        <td className="px-4 py-3 text-text-secondary">{v.isFullVerification ? 'Full' : 'Daily'}</td>
                        <td className="px-4 py-3 text-text-secondary">{v.triggeredBy === 'CRON' ? 'Scheduled' : 'Manual'}</td>
                        <td className="px-4 py-3 text-text-secondary font-mono text-xs">
                          {v.brokenAtEventId ? v.brokenAtEventId.slice(0, 8) + '...' : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
                <span>
                  Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                    disabled={cursor === 0}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
                  >
                    Previous
                  </button>
                  <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCursor(cursor + PAGE_SIZE)}
                    disabled={cursor + PAGE_SIZE >= total}
                    className="rounded-full border border-border px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </>)}
      </div>
    </>
  )
}

/**
 * Build a 30-day trend from verification results.
 * Each day gets the worst result from that day: fail > error > pass > no-data.
 */
function buildTrend(verifications: Verification[]): Array<{ date: string; status: string }> {
  const dayMap = new Map<string, string>()

  for (const v of verifications) {
    const day = v.verifiedAt.slice(0, 10)
    const current = dayMap.get(day)
    if (v.valid === false) {
      dayMap.set(day, 'fail')
    } else if (v.valid === null && current !== 'fail') {
      dayMap.set(day, 'error')
    } else if (v.valid === true && !current) {
      dayMap.set(day, 'pass')
    }
  }

  const days: Array<{ date: string; status: string }> = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    days.push({ date: dateStr, status: dayMap.get(dateStr) ?? 'no-data' })
  }

  return days
}
