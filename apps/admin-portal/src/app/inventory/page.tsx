'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { HeatMapGrid } from '@/components/inventory/HeatMapGrid'
import { RedistributionCard } from '@/components/inventory/RedistributionCard'
import { CreatePurchaseOrderModal } from '@/components/inventory/CreatePurchaseOrderModal'
import { OrderStatusPipeline, getNextStatus } from '@/components/inventory/OrderStatusPipeline'
import { PurchaseOrderDetailModal } from '@/components/inventory/PurchaseOrderDetailModal'
import { Button } from '@/components/ui/button'

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
      const [overview, recs] = await Promise.all([
        trpc.admin.getInventoryOverview.query({}),
        trpc.admin.getRedistributionRecommendations.query({}),
      ])
      setLabs(overview.labs)
      setReagentCategories(overview.reagentCategories)
      setCells(overview.cells as InventoryCell[])
      setRecommendations(recs.recommendations as Recommendation[])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load inventory overview')
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load purchase orders')
    } finally {
      setOrdersLoading(false)
    }
  }, [orderCursor])

  const fetchSuppliers = useCallback(async () => {
    try {
      const result = await trpc.admin.listSuppliers.query({ status: 'ACTIVE' })
      setSuppliers(result.suppliers.map((s) => ({ id: s.id, name: s.name })))
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
        newStatus: next as any,
      })
      fetchOrders()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to advance order status')
    } finally {
      setAdvancingId(null)
    }
  }

  const totalPages = Math.ceil(orderTotal / PAGE_SIZE)
  const currentPage = Math.floor(orderCursor / PAGE_SIZE) + 1

  return (
    <>
      <TopHeader title="Inventory Overview" description="Network-wide stock levels and procurement." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Tab toggle + Create PO button */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-full bg-card p-1 w-fit">
            <button
              onClick={() => setTab('heatmap')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'heatmap' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Heat Map
            </button>
            <button
              onClick={() => setTab('orders')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'orders' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Purchase Orders
            </button>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Purchase Order
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Heat Map Tab */}
        {tab === 'heatmap' && (
          <div className="mt-6 space-y-6">
            {heatmapLoading ? (
              <div className="text-muted-foreground">Loading inventory overview...</div>
            ) : (
              <>
                <HeatMapGrid labs={labs} reagentCategories={reagentCategories} cells={cells} />

                {/* Redistribution Recommendations */}
                {recommendations.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Redistribution Recommendations</h2>
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
          <div className="mt-6">
            {ordersLoading ? (
              <div className="text-muted-foreground">Loading purchase orders...</div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground">No purchase orders yet.</p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-black text-white">
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">PO ID</th>
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Supplier</th>
                        <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide">Items</th>
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Created</th>
                        <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide">Details</th>
                        <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-popover">
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
        {showCreateModal && (
          <CreatePurchaseOrderModal
            suppliers={suppliers}
            labs={labs}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false)
              if (tab === 'orders') fetchOrders()
            }}
          />
        )}

        {/* PO Detail Modal */}
        {viewingOrder && (
          <PurchaseOrderDetailModal
            order={viewingOrder}
            labNames={Object.fromEntries(labs.map((l) => [l.id, l.name]))}
            onClose={() => setViewingOrder(null)}
          />
        )}
      </div>
    </>
  )
}
