'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'

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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Healthy
      </span>
    )
  }
  if (valid === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Broken
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-600">
      <span className="h-2 w-2 rounded-full bg-neutral-400" />
      Unknown
    </span>
  )
}

function ResultIcon({ valid }: { valid: boolean | null }) {
  if (valid === true) return <span className="text-emerald-600" title="Pass">&#10003;</span>
  if (valid === false) return <span className="text-red-600" title="Fail">&#10007;</span>
  return <span className="text-neutral-400" title="Job failed">&#8212;</span>
}

const PAGE_SIZE = 30

export default function AuditChainPage() {
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
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight">Audit Log Integrity</h1>
      <p className="mt-1 text-neutral-500">Monitor audit log hash chain integrity and verification history.</p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-6 text-neutral-500">Loading audit chain status...</div>
      ) : (
        <>
          {/* Status cards (AC #8) */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm font-medium text-neutral-500">Chain Status</p>
              <div className="mt-2">
                <ChainStatusBadge valid={status?.chainHealthy ?? null} />
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm font-medium text-neutral-500">Last Verified</p>
              <p className="mt-1 text-lg font-semibold">
                {status?.lastVerifiedAt ? timeAgo(status.lastVerifiedAt) : 'Never'}
              </p>
              {status?.lastVerifiedAt && (
                <p className="text-xs text-neutral-400">{formatDate(status.lastVerifiedAt)}</p>
              )}
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm font-medium text-neutral-500">Entries Verified</p>
              <p className="mt-1 text-lg font-semibold">
                {status?.lastCheckedCount?.toLocaleString() ?? '0'}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm font-medium text-neutral-500">Consecutive Successes</p>
              <p className="mt-1 text-lg font-semibold">
                {status?.consecutiveSuccesses ?? 0}
              </p>
            </div>
          </div>

          {/* 30-day health trend (AC #8) */}
          {trendDays.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-neutral-600">30-Day Health Trend</h2>
              <div className="mt-2 flex items-end gap-0.5">
                {trendDays.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.status}`}
                    className={`h-6 w-2 rounded-sm ${
                      day.status === 'pass' ? 'bg-emerald-500' :
                      day.status === 'fail' ? 'bg-red-500' :
                      day.status === 'error' ? 'bg-amber-400' :
                      'bg-neutral-200'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Pass</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" /> Fail</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> Error</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-neutral-200" /> No data</span>
              </div>
            </div>
          )}

          {/* Full verification button (AC #9) */}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleFullVerification}
              disabled={fullVerifyLoading}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {fullVerifyLoading ? 'Verifying...' : 'Run Full Verification'}
            </button>
            {fullVerifyResult && (
              <p className="text-sm text-neutral-600">{fullVerifyResult}</p>
            )}
          </div>

          {/* Verification history table (AC #6) */}
          <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Date</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Result</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Entries Checked</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Duration</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Type</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Triggered By</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Broken Event ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {verifications.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      No verification history found in the last 30 days.
                    </td>
                  </tr>
                ) : (
                  verifications.map((v) => (
                    <tr key={v.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3">{formatDate(v.verifiedAt)}</td>
                      <td className="px-4 py-3"><ResultIcon valid={v.valid} /></td>
                      <td className="px-4 py-3 text-neutral-600">{v.checkedCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-neutral-600">{v.jobDurationMs}ms</td>
                      <td className="px-4 py-3 text-neutral-600">{v.isFullVerification ? 'Full' : 'Daily'}</td>
                      <td className="px-4 py-3 text-neutral-600">{v.triggeredBy === 'CRON' ? 'Scheduled' : 'Manual'}</td>
                      <td className="px-4 py-3 text-neutral-400 font-mono text-xs">
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
            <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
              <span>
                Showing {cursor + 1}–{Math.min(cursor + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                  disabled={cursor === 0}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 transition-colors"
                >
                  Previous
                </button>
                <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCursor(cursor + PAGE_SIZE)}
                  disabled={cursor + PAGE_SIZE >= total}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-neutral-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
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
