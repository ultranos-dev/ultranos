'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getQueueItems,
  removeQueueItem,
  updateQueueItemStatus,
  type UploadQueueEntry,
  type UploadQueueStatus,
} from '../lib/db'
import { reportQueueAuditEvent } from '../lib/queue-audit'

const STATUS_LABELS: Record<UploadQueueStatus, string> = {
  pending: 'Pending',
  uploading: 'Uploading',
  expired: 'Expired',
  failed: 'Failed',
}

const STATUS_STYLES: Record<UploadQueueStatus, string> = {
  pending: 'bg-blue-100 text-blue-700',
  uploading: 'bg-primary-100 text-primary-700',
  expired: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-700',
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UploadQueue() {
  const [items, setItems] = useState<UploadQueueEntry[]>([])
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await getQueueItems()
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleDiscard(id: number) {
    const item = items.find((i) => i.id === id)
    await removeQueueItem(id)
    if (item) {
      reportQueueAuditEvent({
        action: 'QUEUE_ITEM_DISCARDED',
        queueEntryId: id,
        testCategory: item.metadata.loincDisplay,
        patientRef: item.patientRef,
        timestamp: new Date().toISOString(),
      })
    }
    setConfirmingId(null)
    await refresh()
  }

  async function handleReupload(id: number) {
    await updateQueueItemStatus(id, 'pending', {
      retryCount: 0,
      lastAttemptAt: null,
    })
    // Update queuedAt to reset the 48-hour window
    const db = (await import('../lib/db')).getDb()
    await db.uploadQueue.update(id, { queuedAt: new Date().toISOString() })
    await refresh()
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-500">Loading upload queue...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Upload Queue</h2>
        <p className="text-sm text-neutral-500">No pending uploads</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          Upload Queue ({items.length})
        </h2>
      </div>
      <ul className="divide-y divide-neutral-100">
        {items.map((item) => (
          <li
            key={item.id}
            className={`px-4 py-3 ${item.status === 'expired' ? 'bg-yellow-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">
                    {item.patientFirstName}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {item.metadata.loincDisplay}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Queued: {formatTimestamp(item.queuedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {item.status === 'expired' && (
                  <button
                    type="button"
                    onClick={() => handleReupload(item.id!)}
                    aria-label="Re-upload"
                    className="rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                  >
                    Re-upload
                  </button>
                )}
                {(item.status === 'expired' || item.status === 'failed') && (
                  <>
                    {confirmingId === item.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-neutral-600">Are you sure?</span>
                        <button
                          type="button"
                          onClick={() => handleDiscard(item.id!)}
                          aria-label="Confirm discard"
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(item.id!)}
                        aria-label="Discard"
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Discard
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
