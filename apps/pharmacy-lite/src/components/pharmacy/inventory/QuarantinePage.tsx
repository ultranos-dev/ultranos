'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ShieldAlert } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/button'
import { getQuarantinedBatches, releaseFromQuarantine, BatchNotQuarantinedError } from '@/lib/inventory/qc-service'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { StockBatch, StockDisposalReason } from '@/lib/inventory/types'

interface BatchRow extends StockBatch {
  itemName: string
}

type DisposalReason = Extract<StockDisposalReason, 'damaged' | 'contaminated' | 'recalled'>

interface DisposeState {
  reason: DisposalReason
  confirming: boolean
  busy: boolean
  error: string | null
}

export function QuarantinePage() {
  const t = useTranslations('inventory')
  const session = useAuthSessionStore((s) => s.session)
  const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'

  const [rows, setRows] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Per-batch release state: batchId → { busy, error }
  const [releaseState, setReleaseState] = useState<Record<string, { busy: boolean; error: string | null }>>({})

  // Per-batch dispose state: batchId → DisposeState
  const [disposeState, setDisposeState] = useState<Record<string, DisposeState>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const batches = await getQuarantinedBatches()

      // Resolve catalog names
      let nameMap: Record<string, string> = {}
      if (batches.length > 0) {
        try {
          const { db } = await import('@/lib/db')
          const catalogIds = [...new Set(batches.map((b) => b.catalogItemId))]
          const items = await db.catalogItems.where('id').anyOf(catalogIds).toArray()
          nameMap = Object.fromEntries(items.map((item) => [item.id, item.name]))
        } catch {
          // catalog lookup failed — fall back to catalogItemId
        }
      }

      setRows(
        batches.map((b) => ({
          ...b,
          itemName: nameMap[b.catalogItemId] ?? b.catalogItemId,
        })),
      )
    } catch (err) {
      setLoadError(true)
      console.error('[QuarantinePage] load failed:', err instanceof Error ? err.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleRelease(batchId: string) {
    setReleaseState((prev) => ({ ...prev, [batchId]: { busy: true, error: null } }))
    try {
      await releaseFromQuarantine(batchId, performedBy)
      await load()
    } catch (err) {
      const isKnown = err instanceof BatchNotQuarantinedError
      console.error('[QuarantinePage] release failed:', isKnown ? 'BatchNotQuarantinedError' : (err instanceof Error ? err.message : 'unknown'))
      setReleaseState((prev) => ({ ...prev, [batchId]: { busy: false, error: t('quarantineReleaseError') } }))
      return
    }
    setReleaseState((prev) => ({ ...prev, [batchId]: { busy: false, error: null } }))
  }

  function openDispose(batchId: string) {
    setDisposeState((prev) => ({
      ...prev,
      [batchId]: { reason: 'damaged' as DisposalReason, confirming: false, busy: false, error: null },
    }))
  }

  function setDisposeReason(batchId: string, reason: DisposalReason) {
    setDisposeState((prev) => {
      const existing = prev[batchId]
      if (!existing) return prev
      return { ...prev, [batchId]: { ...existing, reason } }
    })
  }

  function confirmDispose(batchId: string) {
    setDisposeState((prev) => {
      const existing = prev[batchId]
      if (!existing) return prev
      return { ...prev, [batchId]: { ...existing, confirming: true } }
    })
  }

  async function executeDispose(batchId: string, quantity: number) {
    const ds = disposeState[batchId]
    if (!ds) return
    setDisposeState((prev) => {
      const existing = prev[batchId]
      if (!existing) return prev
      return { ...prev, [batchId]: { ...existing, busy: true, error: null } }
    })
    try {
      await recordDisposal({ stockBatchId: batchId, quantity, reasonCode: ds.reason, performedBy })
      setDisposeState((prev) => {
        const next = { ...prev }
        delete next[batchId]
        return next
      })
      await load()
    } catch (err) {
      console.error('[QuarantinePage] dispose failed:', err instanceof Error ? err.message : 'unknown')
      setDisposeState((prev) => {
        const existing = prev[batchId]
        if (!existing) return prev
        return { ...prev, [batchId]: { ...existing, busy: false, confirming: false, error: t('quarantineDisposeError') } }
      })
    }
  }

  function cancelDispose(batchId: string) {
    setDisposeState((prev) => {
      const next = { ...prev }
      delete next[batchId]
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('quarantineTitle')}</h1>

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={ShieldAlert} title={t('quarantineLoading')} />
          </div>
        ) : loadError ? (
          <div
            data-testid="quarantine-error"
            className="flex min-h-[16rem] items-center justify-center"
          >
            <EmptyState icon={ShieldAlert} title={t('quarantineLoadError')} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={ShieldAlert}
              title={t('quarantineEmpty')}
              description={t('quarantineEmptyDescription')}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColItem')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColBatch')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColQty')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColExpiry')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColReason')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColReceived')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('quarantineColActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => {
                const rs = releaseState[b.id]
                const ds = disposeState[b.id]
                return (
                  <tr key={b.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{b.itemName}</td>
                    <td className="px-4 py-3 text-foreground">{b.batchNumber}</td>
                    <td className="px-4 py-3 font-numeric tabular-nums text-foreground">{b.quantityOnHand}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(b.expiryDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.heldReason ?? t('quarantineSourceExpiry')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(b.receivedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        {/* Release error */}
                        {rs?.error && (
                          <p className="text-xs text-destructive">{rs.error}</p>
                        )}

                        {/* Release + Dispose trigger buttons */}
                        {!ds && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`release-batch-${b.id}`}
                              disabled={rs?.busy}
                              onClick={() => handleRelease(b.id)}
                            >
                              {rs?.busy ? t('quarantineReleasing') : t('quarantineRelease')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              data-testid={`dispose-batch-${b.id}`}
                              onClick={() => openDispose(b.id)}
                            >
                              {t('quarantineDispose')}
                            </Button>
                          </div>
                        )}

                        {/* Disposal inline panel */}
                        {ds && (
                          <div className="flex flex-col gap-2">
                            {ds.error && (
                              <p className="text-xs text-destructive">{ds.error}</p>
                            )}
                            {!ds.confirming ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-xs text-muted-foreground whitespace-nowrap">
                                  {t('quarantineDisposeReasonLabel')}
                                </label>
                                <select
                                  value={ds.reason}
                                  onChange={(e) => setDisposeReason(b.id, e.target.value as DisposalReason)}
                                  className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
                                >
                                  <option value="damaged">{t('disposalReasonDamaged')}</option>
                                  <option value="contaminated">{t('disposalReasonContaminated')}</option>
                                  <option value="recalled">{t('disposalReasonRecalled')}</option>
                                </select>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => confirmDispose(b.id)}
                                >
                                  {t('quarantineConfirmDispose')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cancelDispose(b.id)}
                                >
                                  {t('quarantineCancel')}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={ds.busy}
                                  onClick={() => executeDispose(b.id, b.quantityOnHand)}
                                >
                                  {ds.busy ? t('quarantineDisposing') : t('quarantineConfirmDispose')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={ds.busy}
                                  onClick={() => cancelDispose(b.id)}
                                >
                                  {t('quarantineCancel')}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
