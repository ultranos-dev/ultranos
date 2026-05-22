import Dexie from 'dexie'

const QUEUE_LIMIT = 50

export interface UploadQueueMetadata {
  loincCode: string
  loincDisplay: string
  collectionDate: string
}

export type UploadQueueStatus = 'pending' | 'uploading' | 'expired' | 'failed'

export interface UploadQueueEntry {
  id?: number
  file: Blob
  fileName: string
  fileType: string
  metadata: UploadQueueMetadata
  patientRef: string
  patientFirstName: string
  queuedAt: string
  status: UploadQueueStatus
  retryCount: number
  lastAttemptAt: string | null
}

export interface PractitionerKeyCache {
  practitionerId: string
  publicKey: string // base64-encoded Ed25519 public key
  cachedAt: string // ISO timestamp
}

export interface VerifiedPatientCache {
  patientId: string
  firstName: string // ONLY first name — CLAUDE.md Rule #7 (data minimization)
  age: number // computed age, NOT DOB
  verifiedAt: string
}

class LabLiteDatabase extends Dexie {
  uploadQueue!: Dexie.Table<UploadQueueEntry, number>
  practitioner_keys!: Dexie.Table<PractitionerKeyCache, string>
  verified_patients!: Dexie.Table<VerifiedPatientCache, string>

  constructor() {
    super('lab-lite-db')
    this.version(1).stores({
      uploadQueue: '++id, status, queuedAt',
    })
    this.version(2).stores({
      uploadQueue: '++id, status, queuedAt',
      practitioner_keys: '&practitionerId, cachedAt',
      verified_patients: '&patientId, verifiedAt',
    })
  }
}

let dbInstance: LabLiteDatabase | null = null

export function getDb(): LabLiteDatabase {
  if (!dbInstance) {
    dbInstance = new LabLiteDatabase()
  }
  return dbInstance
}

export interface QueueEntryAuditCallback {
  (entryId: number, entry: Omit<UploadQueueEntry, 'id'>): void
}

/**
 * Add an entry to the upload queue.
 * Rejects if the queue already has 50 items (storage constraint).
 * Callers should provide onCreated to emit a QUEUE_ENTRY_CREATED audit event.
 */
export async function addToQueue(
  entry: Omit<UploadQueueEntry, 'id'>,
  onCreated?: QueueEntryAuditCallback,
): Promise<number> {
  const db = getDb()
  const id = await db.transaction('rw', db.uploadQueue, async () => {
    const count = await db.uploadQueue.count()
    if (count >= QUEUE_LIMIT) {
      throw new Error(
        `Upload queue is full (${QUEUE_LIMIT} items). Drain or discard existing items before adding more.`,
      )
    }
    return db.uploadQueue.add(entry as UploadQueueEntry)
  })
  if (onCreated) {
    onCreated(id, entry)
  }
  return id
}

/** Get all queue items ordered by queuedAt (FIFO — oldest first). */
export async function getQueueItems(): Promise<UploadQueueEntry[]> {
  const db = getDb()
  return db.uploadQueue.orderBy('queuedAt').toArray()
}

/** Get current queue count. */
export async function getQueueCount(): Promise<number> {
  const db = getDb()
  return db.uploadQueue.count()
}

/** Update the status of a queue item, optionally setting retry metadata. */
export async function updateQueueItemStatus(
  id: number,
  status: UploadQueueStatus,
  updates?: { retryCount?: number; lastAttemptAt?: string | null },
): Promise<void> {
  const db = getDb()
  await db.uploadQueue.update(id, { status, ...updates })
}

/** Remove a queue item by ID. */
export async function removeQueueItem(id: number): Promise<void> {
  const db = getDb()
  await db.uploadQueue.delete(id)
}
