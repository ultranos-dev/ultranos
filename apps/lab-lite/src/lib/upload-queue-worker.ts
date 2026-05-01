import { getQueueItems, updateQueueItemStatus, removeQueueItem, type UploadQueueEntry } from './db'
import type { UploadResultInput, UploadResultResponse } from './trpc'

export interface QueueAuditEvent {
  action: 'QUEUE_ENTRY_CREATED' | 'QUEUE_DRAIN_SUCCESS' | 'QUEUE_ITEM_EXPIRED' | 'QUEUE_ITEM_DISCARDED'
  queueEntryId: number
  testCategory: string
  patientRef: string
  timestamp: string
}

export interface DrainDependencies {
  uploadFn: (input: UploadResultInput, token: string) => Promise<UploadResultResponse>
  getToken: () => Promise<string>
  onAuditEvent: (event: QueueAuditEvent) => void
  /** Override for testing — defaults to real setTimeout-based sleep */
  sleep?: (ms: number) => Promise<void>
  /** Override for testing — defaults to real Blob-to-base64 conversion */
  blobToBase64Fn?: (blob: Blob) => Promise<string>
}

const BACKOFF_BASE_MS = 1000
const MAX_RETRIES = 3
let draining = false

function backoffMs(retryCount: number): number {
  // 1s, 4s, 16s (base * 4^retry)
  return BACKOFF_BASE_MS * Math.pow(4, retryCount)
}

async function blobToBase64(blob: Blob): Promise<string> {
  // In Node/test environments, Blob may not have arrayBuffer natively
  // Use FileReader-like approach compatible with both browser and test
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Drain the upload queue in FIFO order.
 * Only processes items with status 'pending'.
 * Retries up to 3 times with exponential backoff on failure.
 */
export async function drainQueue(deps: DrainDependencies): Promise<void> {
  if (draining) return
  draining = true
  try {
    const items = await getQueueItems()
    const drainable = items.filter((item) => item.status === 'pending')

    for (const item of drainable) {
      await drainItem(item, deps)
    }
  } finally {
    draining = false
  }
}

/** Reset drain guard — for testing only. */
export function _resetDrainGuard(): void {
  draining = false
}

async function drainItem(item: UploadQueueEntry, deps: DrainDependencies): Promise<void> {
  const id = item.id!
  let currentRetry = item.retryCount

  while (currentRetry < MAX_RETRIES) {
    try {
      await updateQueueItemStatus(id, 'uploading')

      const token = await deps.getToken()
      const convertFn = deps.blobToBase64Fn ?? blobToBase64
      const fileBase64 = await convertFn(item.file)

      const input: UploadResultInput = {
        fileBase64,
        fileName: item.fileName,
        fileType: item.fileType as UploadResultInput['fileType'],
        patientRef: item.patientRef,
        loincCode: item.metadata.loincCode,
        loincDisplay: item.metadata.loincDisplay,
        collectionDate: item.metadata.collectionDate,
      }

      await deps.uploadFn(input, token)

      // Success — remove from queue and emit audit
      await removeQueueItem(id)
      deps.onAuditEvent({
        action: 'QUEUE_DRAIN_SUCCESS',
        queueEntryId: id,
        testCategory: item.metadata.loincDisplay,
        patientRef: item.patientRef,
        timestamp: new Date().toISOString(),
      })
      return
    } catch {
      currentRetry++
      const now = new Date().toISOString()
      await updateQueueItemStatus(id, currentRetry >= MAX_RETRIES ? 'failed' : 'pending', {
        retryCount: currentRetry,
        lastAttemptAt: now,
      })

      if (currentRetry < MAX_RETRIES) {
        const sleepFn = deps.sleep ?? sleep
        await sleepFn(backoffMs(currentRetry - 1))
      }
    }
  }
}

/**
 * Start listening for online events and drain the queue automatically.
 * Call once on app initialization. Returns a cleanup function.
 */
export function startQueueDrainListener(deps: DrainDependencies): () => void {
  const handler = () => {
    drainQueue(deps)
  }

  window.addEventListener('online', handler)

  // Also attempt drain on startup if already online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    drainQueue(deps)
  }

  return () => {
    window.removeEventListener('online', handler)
  }
}
