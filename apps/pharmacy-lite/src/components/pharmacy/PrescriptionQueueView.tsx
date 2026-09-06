'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getActiveItems, getCompletedItems, getFailedItems, type QueueItem } from '@/lib/queue-data'
import { syncDispenseToHub } from '@/lib/dispense-sync'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import { QueueItemCard } from './QueueItemCard'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { List, FileSearch } from '@ultranos/ui-kit/icons'

type TabId = 'active' | 'completed' | 'failed'

export function PrescriptionQueueView() {
  const t = useTranslations('queue')
  const router = useRouter()
  const loadPrescriptions = useFulfillmentStore((s) => s.loadPrescriptions)
  const resetFulfillment = useFulfillmentStore((s) => s.reset)

  const [activeTab, setActiveTab] = useState<TabId>('active')
  const [search, setSearch] = useState('')
  const [activeItems, setActiveItems] = useState<QueueItem[]>([])
  const [completedItems, setCompletedItems] = useState<QueueItem[]>([])
  const [failedItems, setFailedItems] = useState<QueueItem[]>([])
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const TABS: { id: TabId; label: string }[] = [
    { id: 'active', label: t('active') },
    { id: 'completed', label: t('completedToday') },
    { id: 'failed', label: t('failed') },
  ]

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [active, completed, failed] = await Promise.all([
        getActiveItems(),
        getCompletedItems(),
        getFailedItems(),
      ])
      setActiveItems(active)
      setCompletedItems(completed)
      setFailedItems(failed)
    } catch (err) {
      setError('Failed to load queue data. Please try refreshing.')
      console.error('[PrescriptionQueueView] loadData failed:', err instanceof Error ? err.message : 'unknown')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSelectActive = useCallback(
    (item: QueueItem) => {
      const dispense = item.dispense
      const ext = dispense._ultranos as Record<string, unknown> | undefined

      // D1: Use stored original prescription if available; otherwise reconstruct
      let verifiedPrescription: VerifiedPrescription
      if (ext?.originalPrescription && typeof ext.originalPrescription === 'object') {
        verifiedPrescription = ext.originalPrescription as VerifiedPrescription
      } else {
        // Fallback reconstruction for dispenses created before this patch
        const rx = dispense.authorizingPrescription?.[0]?.reference?.replace('MedicationRequest/', '') ?? ''
        const coding = dispense.medicationCodeableConcept?.coding?.[0]
        const patientRef = dispense.subject?.reference?.replace('Patient/', '') ?? ''
        verifiedPrescription = {
          id: rx,
          med: coding?.code ?? '',
          medN: coding?.display ?? '',
          medT: dispense.medicationCodeableConcept?.text ?? '',
          dos: { qty: 1, unit: 'tablet' },
          dur: 7,
          req: rx,
          pat: patientRef,
          at: dispense._ultranos?.createdAt ?? '',
        }
      }

      // D2: Use stored patient info if available
      const patientName = typeof ext?.patientDisplayName === 'string'
        ? ext.patientDisplayName
        : item.patientFirstName
      const patientAge = typeof ext?.patientAge === 'number'
        ? ext.patientAge
        : 0

      resetFulfillment()
      loadPrescriptions(
        [verifiedPrescription],
        undefined,
        { name: patientName, age: patientAge },
      )
      router.push('/fulfillment')
    },
    [loadPrescriptions, resetFulfillment, router],
  )

  const handleRetry = useCallback(
    async (item: QueueItem) => {
      setRetryingId(item.id)
      try {
        await syncDispenseToHub(item.dispense)
        await loadData()
      } catch (err) {
        console.error('[PrescriptionQueueView] retry failed:', err instanceof Error ? err.message : 'unknown')
        setError('Retry sync failed. Please try again.')
      } finally {
        setRetryingId(null)
      }
    },
    [loadData],
  )

  const tabItems =
    activeTab === 'active'
      ? activeItems
      : activeTab === 'completed'
        ? completedItems
        : failedItems

  const query = search.trim().toLowerCase()
  const currentItems = query
    ? tabItems.filter((item) =>
        [item.patientFirstName, `${item.medicationCount}`]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    : tabItems

  const emptyMessages: Record<TabId, string> = {
    active: t('noActive'),
    completed: t('noCompleted'),
    failed: t('noFailed'),
  }

  const filtersActive = query !== ''

  function clearFilters() {
    setSearch('')
  }

  return (
    <div data-testid="prescription-queue-view" className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar: tab pill-bar + search — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.id === 'active' && activeItems.length > 0 && (
                <span className="ms-1 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {activeItems.length}
                </span>
              )}
              {tab.id === 'failed' && failedItems.length > 0 && (
                <span className="ms-1 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                  {failedItems.length}
                </span>
              )}
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

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {currentItems.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            <EmptyState
              icon={filtersActive ? FileSearch : List}
              title={filtersActive ? t('noResultsTitle') : emptyMessages[activeTab]}
              description={
                filtersActive
                  ? t('noResultsDescription')
                  : activeTab === 'active'
                    ? t('emptyActiveDescription')
                    : t('emptyOtherDescription')
              }
              action={
                filtersActive
                  ? { label: t('clearFilters'), onClick: clearFilters }
                  : activeTab === 'active'
                    ? { label: t('scanPrescription'), onClick: () => router.push('/scan') }
                    : undefined
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            {currentItems.map((item) => (
              <QueueItemCard
                key={item.id}
                item={item}
                onSelect={activeTab === 'active' ? handleSelectActive : undefined}
                showSyncBadge={activeTab === 'completed' || activeTab === 'failed'}
                onRetry={activeTab === 'failed' ? handleRetry : undefined}
                retrying={retryingId === item.id}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
