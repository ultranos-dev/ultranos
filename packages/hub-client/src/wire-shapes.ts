/**
 * Explicit Hub wire-shape asymmetries the tRPC-inferred types alone don't make
 * obvious — captured so spokes can't mis-assume a symmetric shape (Story 59.2, AC4).
 */

/**
 * HLC timestamp as an OBJECT — the decoded/structured form.
 * Mirrors `HlcTimestamp` in `@ultranos/sync-engine`. This is the shape the Hub
 * RETURNS inside a `sync.push` conflict (`results[].conflict.remoteVersion.hlcTimestamp`).
 */
export interface HlcTimestampObject {
  wallMs: number
  counter: number
  nodeId: string
}

/**
 * HLC timestamp SERIALIZED as a string, format `"{wallMs}:{counter}:{nodeId}"`
 * (see `@ultranos/sync-engine` hlc.ts). This is the shape a spoke SENDS in a
 * `sync.push` request operation (`operations[].hlcTimestamp`).
 */
export type HlcTimestampString = string

/**
 * ⚠️ SYNC.PUSH HLC WIRE ASYMMETRY (audit §9 / Story 59.2 AC4).
 *
 * The `sync.push` procedure is NOT symmetric in how it carries the HLC:
 *
 *   • REQUEST  — each `operations[].hlcTimestamp` is a SERIALIZED STRING
 *                (`"{wallMs}:{counter}:{nodeId}"`), validated by `hlcTimestampSchema`
 *                in the Hub's `SyncOperationSchema` (sync.ts ~:17-24).
 *
 *   • RESPONSE — each conflicting op returns the remote version's `hlcTimestamp`
 *                as a DECODED OBJECT `{ wallMs, counter, nodeId }`
 *                (sync.ts ~:188-197, the `conflict.remoteVersion` shape).
 *
 * A client that assumes the response HLC is a string (or that the request HLC is
 * an object) will silently mis-handle conflict resolution. These aliases document
 * the two shapes at their respective boundaries. The concrete request/response
 * envelope types below use them.
 */

/** One operation in a `sync.push` REQUEST batch (request-side HLC = string). */
export interface SyncPushOperation {
  resourceType: string
  resourceId: string
  action: 'create' | 'update' | 'delete'
  /** superjson-serialized payload string. */
  payload: string
  /** HLC serialized as a string on the wire — NEVER an object here. */
  hlcTimestamp: HlcTimestampString
}

/** The remote version echoed back inside a `sync.push` conflict (response-side HLC = object). */
export interface SyncPushRemoteVersion {
  id: string
  data: Record<string, unknown>
  /** HLC decoded to an object in the response — NEVER a string here. */
  hlcTimestamp: HlcTimestampObject
  version: string
}

/** One per-operation result in a `sync.push` RESPONSE. */
export interface SyncPushOpResult {
  resourceId: string
  success: boolean
  conflict?: { remoteVersion: SyncPushRemoteVersion }
  error?: string
  /** For a rejected duplicate-open-encounter create: the canonical encounter id to adopt. */
  canonicalId?: string
}
