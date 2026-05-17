'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getActiveItems, getCompletedItems, getFailedItems, type QueueItem } from '@/lib/queue-data'
import { syncDispenseToHub } from '@/lib/dispense-sync'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import { QueueItemCard } from './QueueItemCard'

type TabId = 'active' | 'completed' | 'failed'

const TABS: { id: TabId; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed (Today)' },
  { id: 'failed', label: 'Failed' },
]

export function PrescriptionQueueView() {
  const router = useRouter()
  const loadPrescriptions = useFulfillmentStore((s) => s.loadPrescriptions)
  const resetFulfillment = useFulfillmentStore((s) => s.reset)

  const [activeTab, setActiveTab] = useState<TabId>('active')
  const [activeItems, setActiveItems] = useState<QueueItem[]>([])
  const [completedItems, setCompletedItems] = useState<QueueItem[]>([])
  const [failedItems, setFailedItems] = useState<QueueItem[]>([])
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      // eslint-disable-next-line no-console
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
      router.push('/scan')
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
        // eslint-disable-next-line no-console
        console.error('[PrescriptionQueueView] retry failed:', err instanceof Error ? err.message : 'unknown')
        setError('Retry sync failed. Please try again.')
      } finally {
        setRetryingId(null)
      }
    },
    [loadData],
  )

  const currentItems =
    activeTab === 'active'
      ? activeItems
      : activeTab === 'completed'
        ? completedItems
        : failedItems

  const emptyMessages: Record<TabId, string> = {
    active: 'No active prescriptions in queue',
    completed: 'No completed prescriptions today',
    failed: 'No failed sync items',
  }

  return (
    <div data-testid="prescription-queue-view" className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div role="tablist" className="flex border-b border-neutral-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[#163300] text-[#163300]'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'active' && activeItems.length > 0 && (
              <span className="ms-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                {activeItems.length}
              </span>
            )}
            {tab.id === 'failed' && failedItems.length > 0 && (
              <span className="ms-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                {failedItems.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {currentItems.length === 0 ? (
          <p className="text-sm text-neutral-400 py-8 text-center">
            {emptyMessages[activeTab]}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden">
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
