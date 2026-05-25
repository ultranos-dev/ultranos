'use client'

import { useCallback, useEffect, useState } from 'react'
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

export function TransfersPage() {
  const session = useAuthSessionStore((s) => s.session)
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState(false)

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
        await cancelTransfer(id, 'Cancelled by user')
        await loadTransfers()
      } finally {
        setActionInProgress(false)
      }
    },
    [loadTransfers],
  )

  const activeTransfers = transfers.filter(
    (t) => t.status !== 'received' && t.status !== 'cancelled',
  )
  const completedTransfers = transfers.filter(
    (t) => t.status === 'received' || t.status === 'cancelled',
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-neutral-500">
        Loading transfers...
      </div>
    )
  }

  if (transfers.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900">Transfers</h1>
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 py-12 text-center text-sm text-neutral-500">
          No transfers found.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Transfers</h1>

      {/* Active */}
      {activeTransfers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-600">Active</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeTransfers.map((t) => (
              <TransferCard
                key={t.id}
                transfer={t}
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

      {/* Completed */}
      {completedTransfers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-600">
            Completed
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {completedTransfers.map((t) => (
              <TransferCard
                key={t.id}
                transfer={t}
                currentLocationId={CURRENT_LOCATION_ID}
                actionInProgress={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
