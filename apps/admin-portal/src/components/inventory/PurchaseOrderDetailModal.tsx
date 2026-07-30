'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface PurchaseOrderItem {
  lab_id: string
  reagent_category: string
  quantity: number
  unit: string
}

interface PurchaseOrder {
  id: string
  supplierName: string
  status: string
  notes: string | null
  createdAt: string
  items: PurchaseOrderItem[]
}

interface PurchaseOrderDetailModalProps {
  order: PurchaseOrder
  labNames: Record<string, string>
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function PurchaseOrderDetailModal({ order, labNames, open, onOpenChange }: PurchaseOrderDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase Order Details</DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground">{order.id}</DialogDescription>
        </DialogHeader>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Supplier</dt>
            <dd className="font-medium text-foreground">{order.supplierName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">{order.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-foreground">{formatDate(order.createdAt)}</dd>
          </div>
          {order.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="text-foreground">{order.notes}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">Line Items ({order.items.length})</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-2.5 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">Lab</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">Reagent Category</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Qty</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2.5 font-medium">{labNames[item.lab_id] ?? item.lab_id.slice(0, 8) + '…'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.reagent_category}</td>
                    <td className="px-4 py-2.5 text-center font-mono">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
