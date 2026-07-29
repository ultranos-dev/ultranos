'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Truck, FileSearch } from '@ultranos/ui-kit/icons'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import {
  getTransfers,
  approveTransfer,
  shipTransfer,
  receiveTransfer,
  cancelTransfer,
} from '@/lib/transfers/transfer-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { StockTransfer } from '@/lib/transfers/types'
import { TransferCard } from './TransferCard'

const CURRENT_LOCATION_ID = 'default'

type TabKey = 'all' | 'active' | 'completed'

export function TransfersPage() {
  const t = useTranslations('transfers')
  const session = useAuthSessionStore((s) => s.session)
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [tab, setTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')

  const loadTransfers = useCallback(async () => {
    try {
      const data = await getTransfers(CURRENT_LOCATION_ID)
      setTransfers(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTransfers()
  }, [loadTransfers])

  const handleApprove = useCallback(
    async (id: string) => {
      setActionInProgress(true)
      try {
        await approveTransfer(id, session?.userId ?? '')
        await loadTransfers()
      } finally {
        setActionInProgress(false)
      }
    },
    [session, loadTransfers],
  )

  const handleShip = useCallback(
    async (id: string) => {
      setActionInProgress(true)
      try {
        await shipTransfer(id, session?.userId ?? '')
        await loadTransfers()
      } finally {
        setActionInProgress(false)
      }
    },
    [session, loadTransfers],
  )

  const handleReceive = useCallback(
    async (id: string) => {
      setActionInProgress(true)
      try {
        await receiveTransfer(id, session?.userId ?? '', CURRENT_LOCATION_ID)
        await loadTransfers()
      } finally {
        setActionInProgress(false)
      }
    },
    [session, loadTransfers],
  )

  const handleCancel = useCallback(
    async (id: string) => {
      setActionInProgress(true)
      try {
        await cancelTransfer(id, t('cancelledByUser'))
        await loadTransfers()
      } finally {
        setActionInProgress(false)
      }
    },
    [loadTransfers, t],
  )

  const query = search.trim().toLowerCase()
  const matchesSearch = useCallback(
    (tr: StockTransfer) => {
      if (!query) return true
      const haystack = [
        tr.fromLocationName,
        tr.toLocationName,
        ...tr.items.map((it) => it.catalogItemName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    },
    [query],
  )

  const { activeTransfers, completedTransfers } = useMemo(() => {
    const searched = transfers.filter(matchesSearch)
    return {
      activeTransfers: searched.filter(
        (tr) => tr.status !== 'received' && tr.status !== 'cancelled',
      ),
      completedTransfers: searched.filter(
        (tr) => tr.status === 'received' || tr.status === 'cancelled',
      ),
    }
  }, [transfers, matchesSearch])

  const showActive = tab === 'all' || tab === 'active'
  const showCompleted = tab === 'all' || tab === 'completed'
  const visibleCount =
    (showActive ? activeTransfers.length : 0) +
    (showCompleted ? completedTransfers.length : 0)
  const filtersActive = query !== '' || tab !== 'all'

  function clearFilters() {
    setSearch('')
    setTab('all')
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'active', label: t('active') },
    { key: 'completed', label: t('completed') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: status tabs + search — always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              type="button"
              role="tab"
              aria-selected={tab === tb.key}
              onClick={() => setTab(tb.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === tb.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50 text-sm text-muted-foreground">
          {t('loading')}
        </div>
      ) : visibleCount === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <EmptyState
            icon={filtersActive ? FileSearch : Truck}
            title={filtersActive ? t('noResultsTitle') : t('noTransfers')}
            description={filtersActive ? t('noResultsDescription') : undefined}
            action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
          />
        </div>
      ) : (
        <>
          {showActive && activeTransfers.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t('active')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeTransfers.map((tr) => (
                  <TransferCard
                    key={tr.id}
                    transfer={tr}
                    currentLocationId={CURRENT_LOCATION_ID}
                    onApprove={handleApprove}
                    onShip={handleShip}
                    onReceive={handleReceive}
                    onCancel={handleCancel}
                    actionInProgress={actionInProgress}
                  />
                ))}
              </div>
            </section>
          )}

          {showCompleted && completedTransfers.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t('completed')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {completedTransfers.map((tr) => (
                  <TransferCard
                    key={tr.id}
                    transfer={tr}
                    currentLocationId={CURRENT_LOCATION_ID}
                    actionInProgress={false}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
