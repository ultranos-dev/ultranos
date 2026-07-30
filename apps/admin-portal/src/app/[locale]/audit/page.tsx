'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { EventBrowser } from '@/components/audit/EventBrowser'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ClipboardList } from '@ultranos/ui-kit/icons'

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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
        <span className="h-2 w-2 rounded-full bg-success" />
        Healthy
      </span>
    )
  }
  if (valid === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        Broken
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
      Unknown
    </span>
  )
}

function ResultIcon({ valid }: { valid: boolean | null }) {
  if (valid === true) return <span className="text-success" title="Pass">&#10003;</span>
  if (valid === false) return <span className="text-destructive" title="Fail">&#10007;</span>
  return <span className="text-muted-foreground" title="Job failed">&#8212;</span>
}

const PAGE_SIZE = 30

export default function AuditChainPage() {
  const t = useTranslations('audit')
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
      // TODO: Pass locationId to filter by selected location once backend supports it
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
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
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
        setFullVerifyResult(t('verificationComplete'))
      } else if (result.valid === false) {
        setFullVerifyResult(t('verificationFailed'))
      } else {
        setFullVerifyResult(t('verificationFailed'))
      }
      // Refresh data after verification
      fetchData()
    } catch (err: unknown) {
      setFullVerifyResult((err as Error)?.message ?? t('verificationFailed'))
    } finally {
      setFullVerifyLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  // Build 30-day health trend from dedicated trend query (not paginated table data)
  const trendDays = buildTrend(trendData)

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          <button
            type="button"
            aria-pressed={tab === 'integrity'}
            onClick={() => setTab('integrity')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'integrity' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('tabChainIntegrity')}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'events'}
            onClick={() => setTab('events')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'events' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('tabEventBrowser')}
          </button>
        </div>

        {tab === 'events' && <EventBrowser />}

        {tab === 'integrity' && (<>
        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="text-muted-foreground">{t('verificationRunning')}</div>
        ) : (
          <>
            {/* Status cards (AC #8) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
                <p className="text-sm font-medium text-muted-foreground">{t('chainStatus')}</p>
                <div className="mt-2">
                  <ChainStatusBadge valid={status?.chainHealthy ?? null} />
                </div>
              </div>

              <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
                <p className="text-sm font-medium text-muted-foreground">{t('lastVerified')}</p>
                <p className="mt-1 text-lg font-semibold">
                  {status?.lastVerifiedAt ? timeAgo(status.lastVerifiedAt) : 'Never'}
                </p>
                {status?.lastVerifiedAt && (
                  <p className="text-xs text-muted-foreground">{formatDate(status.lastVerifiedAt)}</p>
                )}
              </div>

              <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
                <p className="text-sm font-medium text-muted-foreground">{t('entriesVerified')}</p>
                <p className="mt-1 text-lg font-semibold">
                  {status?.lastCheckedCount?.toLocaleString() ?? '0'}
                </p>
              </div>

              <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
                <p className="text-sm font-medium text-muted-foreground">{t('consecutiveSuccesses')}</p>
                <p className="mt-1 text-lg font-semibold">
                  {status?.consecutiveSuccesses ?? 0}
                </p>
              </div>
            </div>

            {/* 30-day health trend (AC #8) */}
            {trendDays.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground">{t('healthTrend30d')}</h2>
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex flex-1 items-end gap-0.5">
                  {trendDays.map((day) => (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.status}`}
                      className={`h-6 flex-1 rounded-sm ${
                        day.status === 'pass' ? 'bg-success' :
                        day.status === 'fail' ? 'bg-destructive' :
                        day.status === 'error' ? 'bg-warning' :
                        'bg-border'
                      }`}
                    />
                  ))}
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <Button onClick={handleFullVerification} disabled={fullVerifyLoading}>
                      {fullVerifyLoading ? t('verificationRunning') : t('runFullVerification')}
                    </Button>
                    {fullVerifyResult && (
                      <p className="text-xs text-muted-foreground text-center">{fullVerifyResult}</p>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-success" /> Pass</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-destructive" /> Fail</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-warning" /> Error</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-border" /> No data</span>
                </div>
              </div>
            )}

            {/* Verification history table (AC #6) */}
            <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            {verifications.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center">
                <EmptyState
                  icon={ClipboardList}
                  title={t('noHistory')}
                  description={t('noHistoryDescription')}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colVerifiedAt')}</th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colEntriesChecked')}</th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colDuration')}</th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Triggered By</th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Broken Event ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {verifications.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3">{formatDate(v.verifiedAt)}</td>
                        <td className="px-4 py-3"><ResultIcon valid={v.valid} /></td>
                        <td className="px-4 py-3 text-muted-foreground">{v.checkedCount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.jobDurationMs}ms</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.isFullVerification ? 'Full' : 'Daily'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.triggeredBy === 'CRON' ? 'Scheduled' : 'Manual'}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {v.brokenAtEventId ? v.brokenAtEventId.slice(0, 8) + '...' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
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
        </>)}
      </div>
  )
}

/**
 * Build a 30-day trend from verification results.
 * Each day gets the worst result from that day: fail > error > pass > no-data.
 */
function localDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

function buildTrend(verifications: Verification[]): Array<{ date: string; status: string }> {
  const dayMap = new Map<string, string>()

  for (const v of verifications) {
    const day = localDay(new Date(v.verifiedAt))
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
    const dateStr = localDay(d)
    days.push({ date: dateStr, status: dayMap.get(dateStr) ?? 'no-data' })
  }

  return days
}
