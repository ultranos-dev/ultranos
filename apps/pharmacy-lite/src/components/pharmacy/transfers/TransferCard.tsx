'use client'

import { Button } from '@/components/ui/Button'
import type { StockTransfer } from '@/lib/transfers/types'

interface TransferCardProps {
  transfer: StockTransfer
  currentLocationId: string
  onApprove?: (id: string) => void
  onShip?: (id: string) => void
  onReceive?: (id: string) => void
  onCancel?: (id: string) => void
  actionInProgress?: boolean
}

const statusColors: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-neutral-100 text-neutral-500',
}

export function TransferCard({
  transfer,
  currentLocationId,
  onApprove,
  onShip,
  onReceive,
  onCancel,
  actionInProgress = false,
}: TransferCardProps) {
  const isOutgoing = transfer.fromLocationId === currentLocationId
  const direction = isOutgoing ? 'Outgoing' : 'Incoming'
  const directionColor = isOutgoing
    ? 'bg-orange-100 text-orange-800'
    : 'bg-teal-100 text-teal-800'

  const itemsSummary =
    transfer.items.length === 1
      ? transfer.items[0]!.catalogItemName
      : `${transfer.items.length} items`

  const displayDate =
    transfer.shippedAt ?? transfer.approvedAt ?? transfer.requestedAt

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      {/* Header badges */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${directionColor}`}
        >
          {direction}
        </span>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[transfer.status] ?? ''}`}
        >
          {transfer.status}
        </span>
      </div>

      {/* From / To */}
      <div className="mb-2 text-sm text-neutral-700">
        <p>
          <span className="font-medium">From:</span> {transfer.fromLocationName}
        </p>
        <p>
          <span className="font-medium">To:</span> {transfer.toLocationName}
        </p>
      </div>

      {/* Items summary */}
      <p className="mb-1 text-sm text-neutral-600">{itemsSummary}</p>

      {/* Date */}
      <p className="mb-3 text-xs tabular-nums text-neutral-400">
        {new Date(displayDate).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {transfer.status === 'requested' && isOutgoing && onApprove && (
          <Button
            variant="primary"
            disabled={actionInProgress}
            onClick={() => onApprove(transfer.id)}
            className="text-xs"
          >
            Approve
          </Button>
        )}
        {transfer.status === 'approved' && isOutgoing && onShip && (
          <Button
            variant="primary"
            disabled={actionInProgress}
            onClick={() => onShip(transfer.id)}
            className="text-xs"
          >
            Ship
          </Button>
        )}
        {transfer.status === 'shipped' && !isOutgoing && onReceive && (
          <Button
            variant="primary"
            disabled={actionInProgress}
            onClick={() => onReceive(transfer.id)}
            className="text-xs"
          >
            Receive
          </Button>
        )}
        {(transfer.status === 'requested' || transfer.status === 'approved') &&
          onCancel && (
            <Button
              variant="danger"
              disabled={actionInProgress}
              onClick={() => onCancel(transfer.id)}
              className="text-xs"
            >
              Cancel
            </Button>
          )}
      </div>
    </div>
  )
}
