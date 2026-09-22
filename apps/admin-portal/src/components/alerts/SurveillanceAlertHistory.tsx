'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { AcknowledgeAlertModal } from './AcknowledgeAlertModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchInput } from '@/components/ui/search-input'
import { Bell, FileSearch } from '@ultranos/ui-kit/icons'

type FilterTab = 'ALL' | 'UNACKNOWLEDGED' | 'ACKNOWLEDGED'

const FILTER_LABEL_KEYS: Record<FilterTab, string> = {
  ALL: 'filterAll',
  UNACKNOWLEDGED: 'filterUnacknowledged',
  ACKNOWLEDGED: 'filterAcknowledged',
}

interface Alert {
  id: string
  configId: string
  labId: string
  labName: string
  testCategory: string
  currentRate: number
  threshold: number
  triggeredAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  notes: string | null
}

const PAGE_SIZE = 25

function formatDateTime(iso: string | null | undefined, unknownLabel: string): string {
  if (!iso) return unknownLabel
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return unknownLabel
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return unknownLabel
  }
}

export function SurveillanceAlertHistory() {
  const t = useTranslations('alerts.alertHistory')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState<FilterTab>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ackAlert, setAckAlert] = useState<Alert | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const acknowledged =
        filter === 'UNACKNOWLEDGED' ? false : filter === 'ACKNOWLEDGED' ? true : undefined
      const result = await trpc.admin.listSurveillanceAlerts.query({
        acknowledged,
        cursor,
        limit: PAGE_SIZE,
      })
      setAlerts(result.alerts)
      setTotal(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [filter, cursor, t])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  function handleFilterChange(newFilter: FilterTab) {
    setFilter(newFilter)
    setCursor(0)
  }

  function handleAckSuccess() {
    setAckAlert(null)
    fetchAlerts()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1
  const FILTERS: FilterTab[] = ['ALL', 'UNACKNOWLEDGED', 'ACKNOWLEDGED']

  const q = search.trim().toLowerCase()
  const visibleAlerts = q
    ? alerts.filter(
        (a) =>
          a.labName.toLowerCase().includes(q) ||
          a.testCategory.toLowerCase().includes(q),
      )
    : alerts

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-foreground">{t('heading')}</h3>

      {/* Toolbar: search + status filter — one row */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchAriaLabel')}
        />
        <div className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => handleFilterChange(f)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(FILTER_LABEL_KEYS[f])}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50 text-sm text-muted-foreground">{t('loadingAlerts')}</div>
      ) : !error && visibleAlerts.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <EmptyState
            icon={q || filter !== 'ALL' ? FileSearch : Bell}
            title={
              filter === 'ALL'
                ? t('emptyTitle')
                : t('emptyTitleWithStatus', { status: t(FILTER_LABEL_KEYS[filter]) })
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colDateTime')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colLab')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTestCategory')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colPositivityRate')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-numeric">{formatDateTime(alert.triggeredAt, t('unknown'))}</td>
                    <td className="px-4 py-3 font-medium">{alert.labName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{alert.testCategory}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-destructive">{alert.currentRate}%</span>
                      <span className="text-muted-foreground"> / {alert.threshold}%</span>
                    </td>
                    <td className="px-4 py-3">
                      {alert.acknowledgedAt ? (
                        <Badge variant="success">{t('statusAcknowledged')}</Badge>
                      ) : (
                        <Badge variant="destructive">{t('statusUnacknowledged')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {!alert.acknowledgedAt && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setAckAlert(alert)}
                        >
                          {t('acknowledge')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t('paginationShowing', {
                  from: cursor + 1,
                  to: Math.min(cursor + PAGE_SIZE, total),
                  total,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                  disabled={cursor === 0}
                >
                  {t('paginationPrevious')}
                </Button>
                <span className="flex items-center px-2">
                  {t('paginationPageOf', { current: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCursor(cursor + PAGE_SIZE)}
                  disabled={cursor + PAGE_SIZE >= total}
                >
                  {t('paginationNext')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Acknowledge modal */}
      <AcknowledgeAlertModal
        alertId={ackAlert?.id ?? ''}
        labName={ackAlert?.labName ?? ''}
        testCategory={ackAlert?.testCategory ?? ''}
        open={ackAlert !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAckAlert(null)
            fetchAlerts()
          }
        }}
        onSuccess={handleAckSuccess}
      />
    </div>
  )
}
