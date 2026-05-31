'use client'

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
  onClose: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function PurchaseOrderDetailModal({ order, labNames, onClose }: PurchaseOrderDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Purchase Order Details</h2>
            <p className="mt-0.5 text-xs font-mono text-text-secondary">{order.id}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-surface text-text-secondary transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-text-secondary">Supplier</dt>
            <dd className="font-medium text-text-primary">{order.supplierName}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Status</dt>
            <dd className="font-medium text-text-primary">{order.status}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Created</dt>
            <dd className="text-text-primary">{formatDate(order.createdAt)}</dd>
          </div>
          {order.notes && (
            <div className="col-span-2">
              <dt className="text-text-secondary">Notes</dt>
              <dd className="text-text-primary">{order.notes}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-text-primary">Line Items ({order.items.length})</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black text-white">
                  <th className="px-4 py-2.5 text-start text-xs font-medium uppercase tracking-wide">Lab</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium uppercase tracking-wide">Reagent Category</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-2.5 text-start text-xs font-medium uppercase tracking-wide">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2.5 font-medium">{labNames[item.lab_id] ?? item.lab_id.slice(0, 8) + '…'}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{item.reagent_category}</td>
                    <td className="px-4 py-2.5 text-center font-mono">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
