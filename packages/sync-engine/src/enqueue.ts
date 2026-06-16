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
 * Optional encrypt function. Takes the JSON-serialized payload string and
 * returns an encrypted string (must include the enc:v1: prefix).
 * When provided, the stored payload field will be encrypted at rest.
 */
export type EnqueueEncryptFn = (jsonPayload: string) => Promise<string>

/**
 * Enqueue a sync action. Serializes the payload to JSON.
 * If encryptFn is provided, the JSON payload is encrypted before storage.
 * Deduplication is handled by the underlying queue.
 *
 * Never throws — sync queue failures must not block clinical workflows.
 */
export async function enqueueSyncAction(
  queue: SyncQueue,
  input: EnqueueSyncActionInput,
  encryptFn?: EnqueueEncryptFn,
): Promise<void> {
  try {
    const jsonPayload = JSON.stringify(input.payload)
    const payload = encryptFn ? await encryptFn(jsonPayload) : jsonPayload

    await queue.enqueue({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      payload,
      hlcTimestamp: input.hlcTimestamp,
    })
  } catch {
    console.warn('[sync-engine] Failed to enqueue sync action — continuing')
  }
}
