'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
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
  const t = useTranslations('transfers')
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
        await cancelTransfer(id, t('cancelledByUser'))
        await loadTransfers()
      } finally {
        setActionInProgress(false)
      }
    },
    [loadTransfers, t],
  )

  const activeTransfers = transfers.filter(
    (tr) => tr.status !== 'received' && tr.status !== 'cancelled',
  )
  const completedTransfers = transfers.filter(
    (tr) => tr.status === 'received' || tr.status === 'cancelled',
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <EmptyState title={t('noTransfers')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>

      {/* Active */}
      {activeTransfers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('active')}</h2>
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

      {/* Completed */}
      {completedTransfers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            {t('completed')}
          </h2>
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
    </div>
  )
}
