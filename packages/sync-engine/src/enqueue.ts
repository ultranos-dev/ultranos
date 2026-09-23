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
 * Context passed to the enqueue-failure hook. Contains only opaque
 * identifiers and the error NAME — never payload contents (no PHI).
 */
export interface EnqueueErrorInfo {
  resourceType: string
  resourceId: string
  action: 'create' | 'update'
  /** Error class name (e.g. 'QuotaExceededError') — never the message/contents. */
  errorName: string
  /** The original error, for callers that need instanceof checks. */
  error: unknown
}

export interface EnqueueSyncHooks {
  /**
   * Fired when the enqueue fails (quota exceeded, IndexedDB corruption,
   * encryption failure). Lets the platform surface the failure to the UI
   * and emit an audit failure event instead of only a console.warn.
   * Must never throw — errors from the hook are swallowed.
   */
  onEnqueueError?: (info: EnqueueErrorInfo) => void
}

/**
 * Enqueue a sync action. Serializes the payload to JSON.
 * If encryptFn is provided, the JSON payload is encrypted before storage.
 * Deduplication is handled by the underlying queue.
 *
 * Never throws — sync queue failures must not block clinical workflows.
 * Failures are surfaced via hooks.onEnqueueError (when provided) so they are
 * never silently swallowed; the console.warn names the error type (no PHI).
 */
export async function enqueueSyncAction(
  queue: SyncQueue,
  input: EnqueueSyncActionInput,
  encryptFn?: EnqueueEncryptFn,
  hooks?: EnqueueSyncHooks,
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
  } catch (err) {
    // DOMException (e.g. QuotaExceededError) is not an Error instance in
    // every runtime — extract the name structurally.
    const rawName =
      typeof err === 'object' && err !== null && 'name' in err
        ? (err as { name?: unknown }).name
        : undefined
    const errorName =
      typeof rawName === 'string' && rawName.length > 0 ? rawName : 'UnknownError'
    // Surface the failure to the platform (UI + audit) — never only a warn.
    try {
      hooks?.onEnqueueError?.({
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        action: input.action,
        errorName,
        error: err,
      })
    } catch {
      // The hook must never break the caller's clinical workflow.
    }
    console.warn(
      `[sync-engine] Failed to enqueue sync action (${errorName}) — continuing`,
    )
  }
}
