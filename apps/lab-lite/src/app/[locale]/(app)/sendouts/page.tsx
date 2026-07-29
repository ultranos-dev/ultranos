'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getDb } from '@/lib/db'
import { getOverdueSendOuts } from '@/lib/sendout-tat'
import { StatusUpdateModal } from '@/components/sendout/StatusUpdateModal'
import { ResultImportModal } from '@/components/sendout/ResultImportModal'
import { AlertTriangle, Send, FileSearch } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { Badge } from '@/components/ui/badge'
import type { SendOut, ReferenceLab, SendOutStatus } from '@/types/reference-lab'

type FilterStatus = SendOutStatus | 'all'

const STATUS_ORDER: SendOutStatus[] = ['sent', 'received', 'processing', 'results-available', 'cancelled']

// Map each send-out status to its reusable i18n label key (already defined in the `sendout` namespace).
const STATUS_LABEL_KEY: Record<SendOutStatus, string> = {
  sent: 'statusLabelSent',
  received: 'statusLabelReceived',
  processing: 'statusLabelProcessing',
  'results-available': 'statusLabelResultsAvailable',
  cancelled: 'statusLabelCancelled',
}

// Semantic badge variant per status — no hardcoded palette colors.
const STATUS_VARIANT: Record<SendOutStatus, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  sent: 'default',
  received: 'secondary',
  processing: 'warning',
  'results-available': 'success',
  cancelled: 'outline',
}

export default function SendOutsPage() {
  const t = useTranslations('sendout')
  const session = useAuthSessionStore((s) => s.session)
  const [sendOuts, setSendOuts] = useState<SendOut[]>([])
  const [labs, setLabs] = useState<Map<string, ReferenceLab>>(new Map())
  const [overdueSendOuts, setOverdueSendOuts] = useState<SendOut[]>([])
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterLabId, setFilterLabId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusModal, setStatusModal] = useState<SendOut | null>(null)
  const [resultModal, setResultModal] = useState<SendOut | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()
      const [all, allLabs, overdue] = await Promise.all([
        db.send_outs.orderBy('sentAt').reverse().toArray(),
        db.reference_labs.toArray(),
        getOverdueSendOuts(),
      ])
      setSendOuts(all)
      setLabs(new Map(allLabs.map((l) => [l.id, l])))
      setOverdueSendOuts(overdue)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  if (!session) return null

  const query = search.trim().toLowerCase()
  const filtered = sendOuts.filter((s) => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterLabId && s.referenceLabId !== filterLabId) return false
    if (query) {
      const lab = labs.get(s.referenceLabId)
      const haystack = [s.id, lab?.name, s.testRequested?.loincDisplay, s.testRequested?.loincCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })

  const filtersActive = filterStatus !== 'all' || filterLabId !== '' || query !== ''

  const clearFilters = () => {
    setFilterStatus('all')
    setFilterLabId('')
    setSearch('')
  }

  const elapsedDays = (sentAt: string) => {
    const ms = Date.now() - new Date(sentAt.includes('|') ? Number(sentAt.split('|')[0]) : sentAt).getTime()
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

      {/* Overdue alert banner — semantic warning */}
      {overdueSendOuts.length > 0 && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl bg-warning/10 px-4 py-3 text-sm"
        >
          <AlertTriangle size={18} className="shrink-0 text-warning" />
          <p className="text-foreground">
            <strong>{t('overdueBanner', { count: overdueSendOuts.length })}</strong>{' '}
            <button
              type="button"
              onClick={() => setFilterStatus('sent')}
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {t('viewPending')}
            </button>
          </p>
        </div>
      )}

      {/* Toolbar: search + filters — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('filterStatusAria')}
        >
          <option value="all">{t('filterStatusAll')}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{t(STATUS_LABEL_KEY[s])}</option>
          ))}
        </select>
        <select
          value={filterLabId}
          onChange={(e) => setFilterLabId(e.target.value)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('filterLabAria')}
        >
          <option value="">{t('filterLabAll')}</option>
          {[...labs.values()].map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Content box — single cohesive box (loading / empty / table) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : Send}
              title={t('noResultsTitle')}
              description={t('noResultsDescription')}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTrackingId')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colReferenceLab')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colTestRequested')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colDateSent')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colElapsed')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((sendOut) => {
                  const lab = labs.get(sendOut.referenceLabId)
                  const elapsed = elapsedDays(sendOut.sentAt)
                  const expected = lab?.averageTATDays[sendOut.testRequested.loincCode] ?? 7
                  const isOverdue = elapsed > expected && !['results-available', 'cancelled'].includes(sendOut.status)
                  return (
                    <tr key={sendOut.id} className={`transition-colors ${isOverdue ? 'bg-warning/10 hover:bg-warning/10' : 'hover:bg-muted/50'}`}>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[120px] truncate">
                        {sendOut.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-foreground">{lab?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground">{sendOut.testRequested.loincDisplay}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(Number(sendOut.sentAt.split('|')[0]) || sendOut.sentAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[sendOut.status]}>{t(STATUS_LABEL_KEY[sendOut.status])}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'font-semibold text-warning' : 'text-muted-foreground'}`}>
                          {isOverdue && <AlertTriangle size={12} />}
                          {elapsed}d / {expected}d
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          {sendOut.status !== 'cancelled' && sendOut.status !== 'results-available' && (
                            <button
                              type="button"
                              onClick={() => setStatusModal(sendOut)}
                              className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                            >
                              {t('actionUpdateStatus')}
                            </button>
                          )}
                          {sendOut.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setResultModal(sendOut)}
                              className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                            >
                              {t('actionImportResult')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {statusModal && (
        <StatusUpdateModal
          sendOut={statusModal}
          onClose={() => setStatusModal(null)}
          onSuccess={() => { setStatusModal(null); void loadData() }}
        />
      )}

      {resultModal && (
        <ResultImportModal
          sendOut={resultModal}
          onClose={() => setResultModal(null)}
          onSuccess={() => { setResultModal(null); void loadData() }}
        />
      )}
    </div>
  )
}
