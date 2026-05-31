import Dexie from 'dexie'
import type { FhirSpecimen, PatientVerificationRecord } from '@ultranos/shared-types'
import type { CustodyEvent } from '@/types/custody-event'
import type { MentorshipPairing, LearningJournalEntry, CheckInRecord } from '@/lib/mentorship-types'n  MicroLearningModule,n} from '@/lib/micro-learning-types'

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
  verificationSource?: 'qr' | 'national_id' | 'manual'
}

// ---------------------------------------------------------------------------
// Reagent Inventory types (v4) — Story 44.3 Reagent Waste & Expiry Tracking
// No PHI — reagent data is purely operational/financial.
// ---------------------------------------------------------------------------

export enum ReagentStatus {
  ACTIVE = 'ACTIVE',
  DEPLETED = 'DEPLETED',
  EXPIRED = 'EXPIRED',
  DISPOSED = 'DISPOSED',
}

export type ReagentDisposalReason = 'expired' | 'contaminated' | 'depleted' | 'other'
export type ReagentSyncStatus = 'pending' | 'synced' | 'failed'

export interface ReagentInventoryEntry {
  id?: number
  reagentId: string                   // UUID — sync key
  name: string
  lotNumber: string
  manufacturer?: string
  openDate: string                    // YYYY-MM-DD — when unit was opened
  expiryDate: string                  // YYYY-MM-DD
  expectedTests: number
  testsPerformed: number              // starts at 0
  unit: string                        // e.g. "bottle", "kit"
  costPerUnit: number                 // AFN
  status: ReagentStatus
  disposalDate: string | null
  disposalReason: ReagentDisposalReason | null
  disposalNotes: string | null
  remainingAtDisposal: number | null
  linkedTestCode: string              // LOINC code
  hlcTimestamp: string
  createdAt: string
  syncStatus: ReagentSyncStatus
}

export interface ReagentConsumptionEntry {
  id?: number
  reagentId: string
  testsConsumed: number
  loggedAt: string                    // ISO 8601
  loggedBy: string                    // practitioner ID
  notes: string | null
}

class LabLiteDatabase extends Dexie {
  uploadQueue!: Dexie.Table<UploadQueueEntry, number>
  practitioner_keys!: Dexie.Table<PractitionerKeyCache, string>
  verified_patients!: Dexie.Table<VerifiedPatientCache, string>
  patients!: Dexie.Table<any, string>
  syncQueue!: Dexie.Table<any, string>
  // v4 — Reagent Waste & Expiry Tracking (Story 44.3)
  reagent_inventory!: Dexie.Table<ReagentInventoryEntry, number>
  reagent_consumption_log!: Dexie.Table<ReagentConsumptionEntry, number>
  // v5 -- Sample Accessioning & Patient ID Verification (Stories 42.3, 43.4)
  samples!: Dexie.Table<FhirSpecimen, string>
  custody_events!: Dexie.Table<CustodyEvent, string>
  patientVerifications!: Dexie.Table<PatientVerificationRecord, string>n  lab_results!: Dexie.Table<LabResult, string>n  sop_acknowledgments!: Dexie.Table<SOPAcknowledgment, string>n  module_completions!: Dexie.Table<ModuleCompletion, string>
  // v6 — Mentorship Pairing System (Story 46.5)
  mentorship_pairings!: Dexie.Table<MentorshipPairing, string>
  learning_journal!: Dexie.Table<LearningJournalEntry, string>
  check_in_records!: Dexie.Table<CheckInRecord, string>

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
    this.version(3).stores({
      uploadQueue: '++id, status, queuedAt',
      practitioner_keys: '&practitionerId, cachedAt',
      verified_patients: '&patientId, verifiedAt',
      patients: '&id, _ultranos.nameLocal, _ultranos.nameLatin, meta.lastUpdated',
      syncQueue: '&id, resourceType, resourceId, status, createdAt',
    })
    // v4 — Reagent Waste & Expiry Tracking (Story 44.3)
    this.version(4).stores({
      uploadQueue: '++id, status, queuedAt',
      practitioner_keys: '&practitionerId, cachedAt',
      verified_patients: '&patientId, verifiedAt',
      patients: '&id, _ultranos.nameLocal, _ultranos.nameLatin, meta.lastUpdated',
      syncQueue: '&id, resourceType, resourceId, status, createdAt',
      reagent_inventory: '++id, &reagentId, linkedTestCode, status, expiryDate, syncStatus',
      reagent_consumption_log: '++id, reagentId, loggedAt',
    })
    // v5 — Sample Accessioning & Patient ID Verification (Stories 42.3, 43.4)
    this.version(5).stores({
      uploadQueue: '++id, status, queuedAt',
      practitioner_keys: '&practitionerId, cachedAt',
      verified_patients: '&patientId, verifiedAt',
      patients: '&id, _ultranos.nameLocal, _ultranos.nameLatin, meta.lastUpdated',
      syncQueue: '&id, resourceType, resourceId, status, createdAt',
      reagent_inventory: '++id, &reagentId, linkedTestCode, status, expiryDate, syncStatus',
      reagent_consumption_log: '++id, reagentId, loggedAt',
      // New in v5:
      samples: '&id, _ultranos.labSampleId, _ultranos.pipelineStatus, subject.reference, meta.lastUpdated',
      custody_events: '&id, sampleId, eventType, timestamp',
      patientVerifications: '&id, sampleId, patientRef, verifiedAt',
    })
    // v6 — Mentorship Pairing System (Story 46.5)
    this.version(6).stores({
      uploadQueue: '++id, status, queuedAt',
      practitioner_keys: '&practitionerId, cachedAt',
      verified_patients: '&patientId, verifiedAt',
      patients: '&id, _ultranos.nameLocal, _ultranos.nameLatin, meta.lastUpdated',
      syncQueue: '&id, resourceType, resourceId, status, createdAt',
      reagent_inventory: '++id, &reagentId, linkedTestCode, status, expiryDate, syncStatus',
      reagent_consumption_log: '++id, reagentId, loggedAt',
      samples: '&id, _ultranos.labSampleId, _ultranos.pipelineStatus, subject.reference, meta.lastUpdated',
      custody_events: '&id, sampleId, eventType, timestamp',
      patientVerifications: '&id, sampleId, patientRef, verifiedAt',
      // New in v6:
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
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

// ---------------------------------------------------------------------------
// Patient cache helpers (v3)
// Patient objects follow FHIR Patient structure with _ultranos extensions.
// Using `any` until shared-types is directly importable from lab-lite.
// ---------------------------------------------------------------------------

/** Return all cached patients. */
export async function getPatients(): Promise<any[]> {
  const db = getDb()
  return db.table('patients').toArray()
}

/** Upsert a single patient into the local cache. */
export async function putPatient(patient: any): Promise<void> {
  const db = getDb()
  await db.table('patients').put(patient)
}

/** Bulk-upsert an array of patients into the local cache. */
export async function putPatients(patients: any[]): Promise<void> {
  const db = getDb()
  await db.table('patients').bulkPut(patients)
}

/** Look up a cached patient by FHIR id. Returns undefined if not found. */
export async function getPatientById(id: string): Promise<any | undefined> {
  const db = getDb()
  return db.table('patients').get(id)
}

// ---------------------------------------------------------------------------
// Sync queue helper (v3+)
// ---------------------------------------------------------------------------

export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  payload: unknown
  createdAt: string
  lastAttemptAt: string | null
  retryCount: number
}

/** Enqueue a resource change for sync to the Hub. */
export async function enqueueSyncEvent(entry: Omit<SyncQueueEntry, 'id'>): Promise<void> {
  const db = getDb()
  const id = `${entry.resourceType}-${entry.resourceId}-${Date.now()}`
  await db.table('syncQueue').put({ id, ...entry })
}

// ---------------------------------------------------------------------------
// Reagent Inventory helpers (v4) — Story 44.3
// ---------------------------------------------------------------------------

/** Add a new reagent inventory entry. Returns the auto-assigned numeric id. */
export async function addReagentInventory(
  entry: Omit<ReagentInventoryEntry, 'id'>,
): Promise<number> {
  const db = getDb()
  return db.reagent_inventory.add(entry as ReagentInventoryEntry)
}

/** Look up a reagent by its UUID reagentId. Returns undefined if not found. */
export async function getReagentByReagentId(
  reagentId: string,
): Promise<ReagentInventoryEntry | undefined> {
  const db = getDb()
  return db.reagent_inventory.where('reagentId').equals(reagentId).first()
}

/** Return all ACTIVE reagents ordered by expiryDate ascending. */
export async function getActiveReagents(): Promise<ReagentInventoryEntry[]> {
  const db = getDb()
  return db.reagent_inventory
    .where('status')
    .equals(ReagentStatus.ACTIVE)
    .sortBy('expiryDate')
}

/** Return all reagent entries (all statuses). */
export async function getAllReagents(): Promise<ReagentInventoryEntry[]> {
  const db = getDb()
  return db.reagent_inventory.toArray()
}

/** Return all reagents linked to a specific LOINC test code. */
export async function getReagentsByTestCode(
  testCode: string,
): Promise<ReagentInventoryEntry[]> {
  const db = getDb()
  return db.reagent_inventory.where('linkedTestCode').equals(testCode).toArray()
}

/** Update fields on an existing reagent entry. */
export async function updateReagent(
  reagentId: string,
  updates: Partial<ReagentInventoryEntry>,
): Promise<void> {
  const db = getDb()
  await db.reagent_inventory.where('reagentId').equals(reagentId).modify(updates)
}

/**
 * Auto-expire ACTIVE reagents whose expiryDate < today.
 * Returns the reagentIds of all entries that were transitioned to EXPIRED.
 */
export async function autoExpireReagents(today: string): Promise<string[]> {
  const db = getDb()
  const expiredIds: string[] = []

  await db.transaction('rw', db.reagent_inventory, async () => {
    const candidates = await db.reagent_inventory
      .where('status')
      .equals(ReagentStatus.ACTIVE)
      .toArray()

    for (const entry of candidates) {
      if (entry.expiryDate < today) {
        await db.reagent_inventory
          .where('reagentId')
          .equals(entry.reagentId)
          .modify({ status: ReagentStatus.EXPIRED })
        expiredIds.push(entry.reagentId)
      }
    }
  })

  return expiredIds
}

/** Return reagents that have not yet been synced to the Hub. */
export async function getPendingReagentSyncEntries(): Promise<ReagentInventoryEntry[]> {
  const db = getDb()
  return db.reagent_inventory.where('syncStatus').equals('pending').toArray()
}

/** Mark a set of reagents as synced. */
export async function markReagentsSynced(reagentIds: string[]): Promise<void> {
  const db = getDb()
  await db.reagent_inventory
    .where('reagentId')
    .anyOf(reagentIds)
    .modify({ syncStatus: 'synced' } satisfies Partial<ReagentInventoryEntry>)
}

// ---------------------------------------------------------------------------
// Reagent Consumption Log helpers (v4)
// ---------------------------------------------------------------------------

/** Add a consumption log entry and increment testsPerformed on the parent reagent. */
export async function addReagentConsumptionLog(
  entry: Omit<ReagentConsumptionEntry, 'id'>,
): Promise<number> {
  const db = getDb()
  return db.transaction('rw', db.reagent_inventory, db.reagent_consumption_log, async () => {
    const logId = await db.reagent_consumption_log.add(entry as ReagentConsumptionEntry)
    await db.reagent_inventory
      .where('reagentId')
      .equals(entry.reagentId)
      .modify((r: ReagentInventoryEntry) => {
        r.testsPerformed += entry.testsConsumed
      })
    return logId
  })
}

/** Return all consumption log entries for a given reagentId, ordered oldest-first. */
export async function getConsumptionLogForReagent(
  reagentId: string,
): Promise<ReagentConsumptionEntry[]> {
  const db = getDb()
  return db.reagent_consumption_log
    .where('reagentId')
    .equals(reagentId)
    .sortBy('loggedAt')
}

/**
 * Return all consumption log entries across all reagents within a date range.
 * startDate and endDate are YYYY-MM-DD strings; comparison is on loggedAt ISO string prefix.
 */
export async function getConsumptionLogByDateRange(
  startDate: string,
  endDate: string,
): Promise<ReagentConsumptionEntry[]> {
  const db = getDb()
  const all = await db.reagent_consumption_log.toArray()
  return all.filter((e) => e.loggedAt >= startDate && e.loggedAt <= endDate + 'T23:59:59.999Z')
}

// ---------------------------------------------------------------------------
// Sample helpers (v5) — Story 42.3: Sample Accessioning & Chain of Custody
// ---------------------------------------------------------------------------

export async function putSample(sample: FhirSpecimen): Promise<void> {
  const db = getDb()
  await db.samples.put(sample)
}

export async function getSampleById(id: string): Promise<FhirSpecimen | undefined> {
  const db = getDb()
  return db.samples.get(id)
}

export async function getSamplesByStatus(status: string): Promise<FhirSpecimen[]> {
  const db = getDb()
  return db.samples.where('_ultranos.pipelineStatus').equals(status).toArray()
}

// ---------------------------------------------------------------------------
// Custody event helpers (v5) — append-only: no update/delete helpers provided
// ---------------------------------------------------------------------------

export async function addCustodyEvent(event: CustodyEvent): Promise<string> {
  const db = getDb()
  await db.custody_events.add(event)
  return event.id
}

export async function getCustodyEventsForSample(sampleId: string): Promise<CustodyEvent[]> {
  const db = getDb()
  return db.custody_events.where('sampleId').equals(sampleId).sortBy('timestamp')
}

// ---------------------------------------------------------------------------
// Patient verification helpers (v5) — Story 43.4: Patient ID Verification Logging
// Append-only: verifications are immutable after creation (chain-of-custody).
// ---------------------------------------------------------------------------

export async function saveVerificationRecord(record: PatientVerificationRecord): Promise<void> {
  const db = getDb()
  await db.patientVerifications.put(record)
}

export async function getVerificationBySampleId(
  sampleId: string,
): Promise<PatientVerificationRecord | undefined> {
  const db = getDb()
  const results = await db.patientVerifications.where('sampleId').equals(sampleId).toArray()
  return results[0]
}

export async function getIncompleteVerifications(): Promise<PatientVerificationRecord[]> {
  const db = getDb()
  return db.patientVerifications.filter((r) => !r.isComplete).toArray()
}

export async function markVerificationSynced(id: string): Promise<void> {
  const db = getDb()
  await db.patientVerifications.update(id, { syncStatus: 'synced' })
}

// ---------------------------------------------------------------------------
// Verified patient cache helpers
// ---------------------------------------------------------------------------

export async function getCachedPatient(patientId: string): Promise<VerifiedPatientCache | undefined> {
  const db = getDb()
  return db.verified_patients.get(patientId)
}

export async function putVerifiedPatient(patient: VerifiedPatientCache): Promise<void> {
  const db = getDb()
  await db.verified_patients.put(patient)
}

// ---------------------------------------------------------------------------
// Lab Results type (v6) — minimal interface for trigger engine queries
// Data minimization: only non-PHI operational fields stored locally.
// ---------------------------------------------------------------------------

export interface LabResult {
  id: string              // UUID
  sampleId: string
  templateId: string
  templateVersion: string
  status: 'draft' | 'completed'
  enteredBy: string       // technician practitioner ID
  enteredAt: string       // ISO timestamp
  updatedAt: string       // ISO timestamp
  loincCode?: string      // procedure identifier — used by trigger engine
}
