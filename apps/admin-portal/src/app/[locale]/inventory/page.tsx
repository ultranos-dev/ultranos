'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { useLocationFilter } from '@/hooks/useLocationFilter'
import { HeatMapGrid } from '@/components/inventory/HeatMapGrid'
import { RedistributionCard } from '@/components/inventory/RedistributionCard'
import { CreatePurchaseOrderModal } from '@/components/inventory/CreatePurchaseOrderModal'
import { OrderStatusPipeline, getNextStatus } from '@/components/inventory/OrderStatusPipeline'
import { PurchaseOrderDetailModal } from '@/components/inventory/PurchaseOrderDetailModal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Package, TrendingUp } from '@ultranos/ui-kit/icons'

type ActiveTab = 'heatmap' | 'orders'

interface InventoryCell {
  labId: string
  labName: string
  reagentCategory: string
  quantity: number
  unit: string
  reportedAt: string
  stockLevel: 'GREEN' | 'YELLOW' | 'AMBER' | 'RED'
}

interface Recommendation {
  targetLabId: string
  targetLabName: string
  sourceLabId: string
  sourceLabName: string
  reagentCategory: string
  sourceQuantity: number
  distanceKm: number | null
}

interface PurchaseOrder {
  id: string
  supplierId: string
  supplierName: string
  items: Array<{ lab_id: string; reagent_category: string; quantity: number; unit: string }>
  status: string
  totalItems: number
  notes: string | null
  createdAt: string
}

interface Supplier {
  id: string
  name: string
}

interface Lab {
  id: string
  name: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const PAGE_SIZE = 25

export default function InventoryPage() {
  const t = useTranslations('inventory')
  const { locationId } = useLocationFilter()
  const [tab, setTab] = useState<ActiveTab>('heatmap')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Heat map state
  const [labs, setLabs] = useState<Lab[]>([])
  const [reagentCategories, setReagentCategories] = useState<string[]>([])
  const [cells, setCells] = useState<InventoryCell[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [heatmapLoading, setHeatmapLoading] = useState(true)

  // PO state
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [orderTotal, setOrderTotal] = useState(0)
  const [orderCursor, setOrderCursor] = useState(0)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null)

  // Suppliers (for PO creation modal)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [error, setError] = useState<string | null>(null)

  const fetchHeatmap = useCallback(async () => {
    try {
      setHeatmapLoading(true)
      setError(null)
      // TODO: Pass locationId to filter by selected location once backend supports it
      const [overview, recs] = await Promise.all([
        trpc.admin.getInventoryOverview.query({}),
        trpc.admin.getRedistributionRecommendations.query({}),
      ])
      setLabs(overview.labs)
      setReagentCategories(overview.reagentCategories)
      setCells(overview.cells as InventoryCell[])
      setRecommendations(recs.recommendations as Recommendation[])
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setHeatmapLoading(false)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      setOrdersLoading(true)
      setError(null)
      const result = await trpc.admin.listPurchaseOrders.query({
        cursor: orderCursor,
        limit: PAGE_SIZE,
      })
      setOrders(result.orders as PurchaseOrder[])
      setOrderTotal(result.total)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setOrdersLoading(false)
    }
  }, [orderCursor])

  const fetchSuppliers = useCallback(async () => {
    try {
      const result = await trpc.admin.listSuppliers.query({ status: 'ACTIVE' })
      setSuppliers(result.suppliers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
    } catch {
      // Non-blocking
    }
  }, [])

  useEffect(() => {
    fetchHeatmap()
    fetchSuppliers()
  }, [fetchHeatmap, fetchSuppliers])

  useEffect(() => {
    if (tab === 'orders') fetchOrders()
  }, [tab, fetchOrders])

  async function handleAdvanceStatus(orderId: string, currentStatus: string) {
    const next = getNextStatus(currentStatus)
    if (!next) return

    if (!window.confirm(`Advance order status to ${next}?`)) return

    try {
      setAdvancingId(orderId)
      await trpc.admin.updateOrderStatus.mutate({
        orderId,
        newStatus: next as 'APPROVED' | 'ORDERED' | 'SHIPPED' | 'DELIVERED',
      })
      fetchOrders()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to advance order status')
    } finally {
      setAdvancingId(null)
    }
  }

  const totalPages = Math.ceil(orderTotal / PAGE_SIZE)
  const currentPage = Math.floor(orderCursor / PAGE_SIZE) + 1

  return (
    <div className="flex flex-col gap-4">
        {/* Header + tab toggle + Create PO button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
              <button
                type="button"
                aria-pressed={tab === 'heatmap'}
                onClick={() => setTab('heatmap')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === 'heatmap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('tabHeatMap')}
              </button>
              <button
                type="button"
                aria-pressed={tab === 'orders'}
                onClick={() => setTab('orders')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === 'orders' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('tabPurchaseOrders')}
              </button>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              {t('createPurchaseOrder')}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Heat Map Tab */}
        {tab === 'heatmap' && (
          <div className="space-y-4">
            {heatmapLoading ? (
              <div className="text-muted-foreground">Loading inventory overview...</div>
            ) : labs.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
                <EmptyState
                  icon={TrendingUp}
                  title={t('noHeatmapData')}
                  description={t('noHeatmapDescription')}
                />
              </div>
            ) : (
              <>
                <HeatMapGrid labs={labs} reagentCategories={reagentCategories} cells={cells} />

                {/* Redistribution Recommendations */}
                {recommendations.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{t('redistributionTitle')}</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {recommendations.map((rec, idx) => (
                        <RedistributionCard key={idx} recommendation={rec} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Purchase Orders Tab */}
        {tab === 'orders' && (
          <div>
            {ordersLoading ? (
              <div className="text-muted-foreground">Loading purchase orders...</div>
            ) : orders.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
                <EmptyState
                  icon={Package}
                  title={t('noPurchaseOrders')}
                  description={t('noPurchaseOrdersDescription')}
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">PO ID</th>
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">Supplier</th>
                        <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">Items</th>
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">Created</th>
                        <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">Details</th>
                        <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {orders.map((order) => {
                        const next = getNextStatus(order.status)
                        return (
                          <tr key={order.id}>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{order.id.slice(0, 8)}...</td>
                            <td className="px-4 py-3 font-medium">{order.supplierName}</td>
                            <td className="px-4 py-3 text-center">{order.totalItems}</td>
                            <td className="px-4 py-3">
                              <OrderStatusPipeline currentStatus={order.status} />
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(order.createdAt)}</td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => setViewingOrder(order)}
                              >
                                View
                              </Button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {next && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handleAdvanceStatus(order.id, order.status)}
                                  disabled={advancingId === order.id}
                                >
                                  {advancingId === order.id ? '...' : `→ ${next}`}
                                </Button>
                              )}
                              {!next && (
                                <span className="text-xs text-success font-medium">Complete</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Showing {orderCursor + 1}–{Math.min(orderCursor + PAGE_SIZE, orderTotal)} of {orderTotal}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOrderCursor(Math.max(0, orderCursor - PAGE_SIZE))}
                        disabled={orderCursor === 0}
                      >
                        Previous
                      </Button>
                      <span className="flex items-center px-2">Page {currentPage} of {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOrderCursor(orderCursor + PAGE_SIZE)}
                        disabled={orderCursor + PAGE_SIZE >= orderTotal}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Create PO Modal */}
        <CreatePurchaseOrderModal
          suppliers={suppliers}
          labs={labs}
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          onSuccess={() => {
            setShowCreateModal(false)
            if (tab === 'orders') fetchOrders()
          }}
        />

        {/* PO Detail Modal */}
        <PurchaseOrderDetailModal
          order={viewingOrder ?? { id: '', supplierName: '', status: '', notes: null, createdAt: '', items: [] }}
          labNames={Object.fromEntries(labs.map((l) => [l.id, l.name]))}
          open={viewingOrder !== null}
          onOpenChange={(open) => { if (!open) setViewingOrder(null) }}
        />
      </div>
  )
}
