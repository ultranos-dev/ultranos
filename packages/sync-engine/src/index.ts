export {
  HybridLogicalClock,
  serializeHlc,
  deserializeHlc,
  compareHlc,
} from './hlc.js'

export type { HlcTimestamp } from './hlc.js'

export {
  generateKeyPair,
  signPayload,
  verifySignature,
} from './crypto.js'

export type { KeyPair } from './crypto.js'

export {
  SYNC_PRIORITY,
  getSyncPriority,
  compareSyncPriority,
} from './sync-priority.js'

export { KRLSyncService } from './krl-sync.js'
export type { KRLEntry, KRLStorage } from './krl-sync.js'

export { getConflictTier } from './conflict-tiers.js'
export type { ConflictTier } from './conflict-tiers.js'

export { resolveConflict } from './conflict-resolver.js'
export type {
  SyncRecord,
  ConflictStrategy,
  ConflictResolution,
} from './conflict-resolver.js'

export { createSyncQueue, getBackoffMs } from './queue.js'
export { enqueueSyncAction } from './enqueue.js'
export type { EnqueueSyncActionInput } from './enqueue.js'
export { DrainWorker } from './drain-worker.js'
export type { SyncResult, DrainWorkerConfig } from './drain-worker.js'
export type {
  SyncQueueEntry,
  EnqueueInput,
  SyncQueueStorage,
  SyncQueue,
} from './queue.js'
