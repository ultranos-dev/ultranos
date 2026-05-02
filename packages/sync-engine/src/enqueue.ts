/**
 * Enqueue helper for sync operations.
 *
 * Wraps the generic queue's enqueue with serialization.
 * Platform-specific audit emission and HLC stamping are
 * handled by the caller (store layer).
 */

import type { SyncQueue } from './queue.js'

export interface EnqueueSyncActionInput {
  resourceType: string
  resourceId: string
  action: 'create' | 'update'
  payload: Record<string, unknown>
  hlcTimestamp: string
}

/**
 * Enqueue a sync action. Serializes the payload to JSON.
 * Deduplication is handled by the underlying queue.
 *
 * Never throws — sync queue failures must not block clinical workflows.
 */
export async function enqueueSyncAction(
  queue: SyncQueue,
  input: EnqueueSyncActionInput,
): Promise<void> {
  try {
    await queue.enqueue({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      payload: JSON.stringify(input.payload),
      hlcTimestamp: input.hlcTimestamp,
    })
  } catch {
    console.warn('[sync-engine] Failed to enqueue sync action — continuing')
  }
}
