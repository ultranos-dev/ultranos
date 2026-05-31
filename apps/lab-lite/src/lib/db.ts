import Dexie from 'dexie'
import type { FhirSpecimen, PatientVerificationRecord } from '@ultranos/shared-types'
import type { CustodyEvent } from '@/types/custody-event'
import type { MentorshipPairing, LearningJournalEntry, CheckInRecord } from '@/lib/mentorship-types'
import type { SOP, SOPAcknowledgment } from '@/lib/sop-types'
import type {
  MicroLearningModule,
  ModuleCompletion,
} from '@/lib/micro-learning-types'
import type { ChecklistItemTemplate, InfectionControlAudit } from '@/types/infection-control-audit'
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/safety/default-checklist'

import type { DailyActivityLog, DailyLogSettings } from '@/lib/daily-log-types'
import type { TokenColor, TokenSymbol } from '@/lib/token-generator'
import type { TestTatProfile } from '@/lib/test-tat-database'
import type { ReferenceRange, RangeVersion } from '@/lib/reference-ranges/types'
import type { WasteContainer, WasteDisposalRecord } from '@/types/waste-tracking'
import type { PatientCulturalPreferences, CulturalFlag } from '@/lib/cultural-flags'
import type { PeerPost, PeerResponse, ModerationFlag } from '@/lib/peer-network-types'
import type { SafetyReport } from '@/types/safety-reporting'
import type { LabLocation } from '@/types/lab-network'
import type { TemperatureReading, TemperatureLocation, TemperatureExcursion } from '@/types/temperature-monitoring'
import type { EncryptedHealthRecord } from '@/types/employee-health'

// Re-export with Dexie-friendly names to avoid collision with result-templates.ts ReferenceRange
export type ReferenceRangeEntry = ReferenceRange
export type RangeVersionEntry = RangeVersion

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

// ---------------------------------------------------------------------------
// Lab Order types (v8) — Stories 42.2, 45.5
// Data minimization: patientFirstName + patientAge ONLY (CLAUDE.md Rule #7)
// ---------------------------------------------------------------------------

export type OrderUrgency = 'routine' | 'urgent' | 'asap' | 'stat'
export type LabOrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface LabOrderEntry {
  orderId: string
  patientFirstName: string // first name ONLY — CLAUDE.md Rule #7
  patientAge: number | null // computed age, NOT DOB
  patientRef: string // opaque Patient/{uuid}
  testsRequested: Array<{ loincCode: string; loincDisplay: string }>
  urgency: OrderUrgency
  orderingPhysicianName: string
  specialInstructions: string | null
  status: LabOrderStatus
  authoredOn: string // ISO datetime — when physician ordered
  receivedAt: string // ISO datetime — when lab acknowledged
  syncedAt: string // ISO datetime — when pulled from Hub
}

// ---------------------------------------------------------------------------
// Patient Queue types (v8) — Story 45.2
// ---------------------------------------------------------------------------

export interface PatientQueueEntry {
  id?: number
  patientRef: string
  patientFirstName: string // first name only — data minimization
  patientAge: number
  tokenColor: TokenColor
  tokenSymbol: TokenSymbol
  tokenDisplayKey: string
  status: 'waiting' | 'serving' | 'completed' | 'no-show'
  registeredAt: string // ISO 8601
  calledAt?: string
  completedAt?: string
  hlcTimestamp: string
  techId: string
  /** Serialized TripAnalysis (JSON) — ephemeral, local only, not synced to Hub */
  tripOptimizationResult?: string
}

// ---------------------------------------------------------------------------
// TAT Override types (v8) — Story 45.5
// Lab-specific overrides to default turnaround time profiles.
// ---------------------------------------------------------------------------

export interface TatOverrideEntry extends TestTatProfile {
  updatedAt: string // ISO 8601 — when the lab manager last changed this value
}

// ---------------------------------------------------------------------------
// Consent Record types (v12) — Story 10.1
// No PHI content stored unencrypted — audio/thumbprint stored as Blob.
// ---------------------------------------------------------------------------

export interface ConsentRecord {
  id?: number
  patientRef: string
  encounterId: string
  method: 'audio' | 'video' | 'both'
  language: string
  consentTextVersion: string
  audioBlob?: Blob
  thumbprintBlob?: Blob
  witnessingTechId: string
  capturedAt: string        // ISO 8601
  hlcTimestamp: string
  status: 'active' | 'withdrawn'
  syncStatus: 'pending' | 'synced' | 'failed'
  withdrawnAt?: string
  withdrawalReason?: string
}

// ---------------------------------------------------------------------------
// Payment types (v12) — Story 41.1
// ---------------------------------------------------------------------------

export type PaymentMethod = 'CASH' | 'CARD' | 'WAIVER' | 'INSURANCE'

export interface PaymentEntry {
  id?: number
  paymentId: string
  patientRef: string
  testsPayedFor: Array<{ testCode: string; testName: string; price: number }>
  amount: number
  paymentMethod: PaymentMethod
  cashierId: string
  receiptNumber: string
  outstandingBalance: number
  relatedPaymentIds: string[]
  hlcTimestamp: string
  createdAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
  waiverReason?: string
  insurancePolicyRef?: string
}

// ---------------------------------------------------------------------------
// Priority Override types (v12) — Story 45.3
// ---------------------------------------------------------------------------

export interface PriorityOverrideEntry {
  sampleId: string      // primary key
  manualPosition: number
  overriddenAt: string  // ISO 8601
}

// ---------------------------------------------------------------------------
// Data Budget types (v12) — Story 48.x / Data Connectivity
// ---------------------------------------------------------------------------

export interface DataBudgetConfig {
  id: 'config'         // singleton row — always 'config'
  planSizeMB: number
  billingCycleDay: number  // 1-28: day of month cycle resets
  lowDataMode: boolean
  currentCycleStart: string  // ISO 8601 date of current cycle start
}

export type DataUsageCategory = 'sync' | 'upload' | 'download' | 'other'

export interface DataUsageRecord {
  date: string                 // YYYY-MM-DD
  category: DataUsageCategory
  bytesOut: number
  bytesIn: number
  requestCount: number
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
  patientVerifications!: Dexie.Table<PatientVerificationRecord, string>
  // v7 — Contextual Micro-Learning Modules (Story 46.2)
  lab_results!: Dexie.Table<LabResult, string>
  sops!: Dexie.Table<SOP, string>
  sop_acknowledgments!: Dexie.Table<SOPAcknowledgment, string>
  micro_learning_modules!: Dexie.Table<MicroLearningModule, string>
  module_completions!: Dexie.Table<ModuleCompletion, string>
  // v6 — Mentorship Pairing System (Story 46.5)
  mentorship_pairings!: Dexie.Table<MentorshipPairing, string>
  learning_journal!: Dexie.Table<LearningJournalEntry, string>
  check_in_records!: Dexie.Table<CheckInRecord, string>
  // v7 — Post-Exposure Emergency Protocol (Story 47.1)
  incident_reports!: Dexie.Table<any, string>
  pep_providers!: Dexie.Table<any, string>

  // v7 — Daily Activity Log (Story 50.4)
  dailyLogs!: Dexie.Table<DailyActivityLog, string>
  daily_log_settings!: Dexie.Table<DailyLogSettings, string>
  // v9 — Lab Orders, Patient Queue, TAT overrides (Stories 42.2, 45.2, 45.5)
  orders!: Dexie.Table<LabOrderEntry, string>
  queueEntries!: Dexie.Table<PatientQueueEntry, number>
  tat_overrides!: Dexie.Table<TatOverrideEntry, string>
  // v11 — Localized Reference Ranges (Story 43.8)
  referenceRanges!: Dexie.Table<ReferenceRangeEntry, string>
  rangeVersions!: Dexie.Table<RangeVersionEntry, string>
  // v12 — Consent, Waste, Cultural, Payments, Priority, Peer, Safety, Network, Temp, Health
  consentRecords!: Dexie.Table<ConsentRecord, number>
  waste_containers!: Dexie.Table<WasteContainer, string>
  waste_disposal_records!: Dexie.Table<WasteDisposalRecord, string>
  culturalPreferences!: Dexie.Table<PatientCulturalPreferences, string>
  payments!: Dexie.Table<PaymentEntry, number>
  priorityOverrides!: Dexie.Table<PriorityOverrideEntry, string>
  peer_posts!: Dexie.Table<PeerPost, string>
  peer_responses!: Dexie.Table<PeerResponse, string>
  moderation_flags!: Dexie.Table<ModerationFlag, string>
  safety_reports!: Dexie.Table<SafetyReport, string>
  lab_locations!: Dexie.Table<LabLocation, string>
  temperature_readings!: Dexie.Table<TemperatureReading, string>
  temperature_locations!: Dexie.Table<TemperatureLocation, string>
  temperature_excursions!: Dexie.Table<TemperatureExcursion, string>
  employee_health_records!: Dexie.Table<EncryptedHealthRecord, string>
  dataBudgetConfig!: Dexie.Table<DataBudgetConfig, string>
  dataUsage!: Dexie.Table<DataUsageRecord & { id?: number }, number>
  // v7 — Infection Control Self-Audit (Story 47.7)
  checklist_templates!: Dexie.Table<ChecklistItemTemplate, string>
  infection_control_audits!: Dexie.Table<InfectionControlAudit, string>

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

    // v7 — Post-Exposure Emergency Protocol (Story 47.1)
    // incident_reports: append-only per CLAUDE.md Tier 1 (safety-critical). Never update, only addenda.
    // pep_providers: admin-configured PEP provider contacts, synced from Hub when online.
    this.version(7).stores({
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
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
      // New in v7:
      incident_reports: '&id, type, techId, occurredAt, sourcePatientRef',
      pep_providers: '&id, name',
      dailyLogs: '&id, techId, date, syncStatus',
      daily_log_settings: '&id',
    })
    // v8 — Contextual Micro-Learning Modules (Story 46.2)
    this.version(8).stores({
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
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
      incident_reports: '&id, type, techId, occurredAt, sourcePatientRef',
      pep_providers: '&id, name',
      dailyLogs: '&id, techId, date, syncStatus',
      daily_log_settings: '&id',
      // New in v8:
      lab_results: '&id, loincCode, enteredBy, enteredAt, status',
      sops: '&id, status, meta.lastUpdated',
      sop_acknowledgments: '&id, sopId, technicianId, syncStatus, [sopId+technicianId]',
      micro_learning_modules: '&id, procedureRef, version, meta.lastUpdated',
      module_completions: '&id, moduleId, technicianId, completedAt, syncStatus, [moduleId+technicianId]',
    })
    // v9 — Lab Orders, Patient Queue, TAT Overrides (Stories 42.2, 45.2, 45.5)
    this.version(9).stores({
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
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
      incident_reports: '&id, type, techId, occurredAt, sourcePatientRef',
      pep_providers: '&id, name',
      dailyLogs: '&id, techId, date, syncStatus',
      daily_log_settings: '&id',
      lab_results: '&id, loincCode, enteredBy, enteredAt, status',
      sops: '&id, status, meta.lastUpdated',
      sop_acknowledgments: '&id, sopId, technicianId, syncStatus, [sopId+technicianId]',
      micro_learning_modules: '&id, procedureRef, version, meta.lastUpdated',
      module_completions: '&id, moduleId, technicianId, completedAt, syncStatus, [moduleId+technicianId]',
      // New in v9:
      orders: '&orderId, status, urgency, patientRef, authoredOn',
      queueEntries: '++id, status, tokenDisplayKey, registeredAt, patientRef',
      tat_overrides: '&loincCode, tatCategory',
    })
    // v10 — Infection Control Self-Audit (Story 47.7)
    this.version(10).stores({
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
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
      incident_reports: '&id, type, techId, occurredAt, sourcePatientRef',
      pep_providers: '&id, name',
      dailyLogs: '&id, techId, date, syncStatus',
      daily_log_settings: '&id',
      lab_results: '&id, loincCode, enteredBy, enteredAt, status',
      sops: '&id, status, meta.lastUpdated',
      sop_acknowledgments: '&id, sopId, technicianId, syncStatus, [sopId+technicianId]',
      micro_learning_modules: '&id, procedureRef, version, meta.lastUpdated',
      module_completions: '&id, moduleId, technicianId, completedAt, syncStatus, [moduleId+technicianId]',
      orders: '&orderId, status, urgency, patientRef, authoredOn',
      queueEntries: '++id, status, tokenDisplayKey, registeredAt, patientRef',
      tat_overrides: '&loincCode, tatCategory',
      // New in v10:
      checklist_templates: '&id, category, order',
      infection_control_audits: '&id, auditMonth, status, conductedBy, completedAt',
    }).upgrade(async (tx) => {
      const existing = await tx.table('checklist_templates').count()
      if (existing === 0) {
        await tx.table('checklist_templates').bulkAdd(DEFAULT_CHECKLIST_ITEMS)
      }
    })
    // v11 — Localized Reference Ranges (Story 43.8)
    this.version(11).stores({
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
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
      incident_reports: '&id, type, techId, occurredAt, sourcePatientRef',
      pep_providers: '&id, name',
      dailyLogs: '&id, techId, date, syncStatus',
      daily_log_settings: '&id',
      lab_results: '&id, loincCode, enteredBy, enteredAt, status',
      sops: '&id, status, meta.lastUpdated',
      sop_acknowledgments: '&id, sopId, technicianId, syncStatus, [sopId+technicianId]',
      micro_learning_modules: '&id, procedureRef, version, meta.lastUpdated',
      module_completions: '&id, moduleId, technicianId, completedAt, syncStatus, [moduleId+technicianId]',
      orders: '&orderId, status, urgency, patientRef, authoredOn',
      queueEntries: '++id, status, tokenDisplayKey, registeredAt, patientRef',
      tat_overrides: '&loincCode, tatCategory',
      checklist_templates: '&id, category, order',
      infection_control_audits: '&id, auditMonth, status, conductedBy, completedAt',
      // New in v11:
      referenceRanges: '&id, loincCode, gender, [loincCode+gender+ageMin], effectiveFrom',
      rangeVersions: '&id, rangeId, version, changedAt',
    })
    // v12 — Consent, Waste Tracking, Cultural Preferences, Payments, Priority Overrides,
    //        Peer Network, Safety Reporting, Lab Locations, Temperature Monitoring,
    //        Employee Health Records (multiple stories)
    this.version(12).stores({
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
      mentorship_pairings: '&id, mentorId, menteeId, status, [mentorId+status], [menteeId+status]',
      learning_journal: '&id, pairingId, authorId, createdAt, syncStatus',
      check_in_records: '&id, pairingId, completedAt, syncStatus',
      incident_reports: '&id, type, techId, occurredAt, sourcePatientRef',
      pep_providers: '&id, name',
      dailyLogs: '&id, techId, date, syncStatus',
      daily_log_settings: '&id',
      lab_results: '&id, loincCode, enteredBy, enteredAt, status',
      sops: '&id, status, meta.lastUpdated',
      sop_acknowledgments: '&id, sopId, technicianId, syncStatus, [sopId+technicianId]',
      micro_learning_modules: '&id, procedureRef, version, meta.lastUpdated',
      module_completions: '&id, moduleId, technicianId, completedAt, syncStatus, [moduleId+technicianId]',
      orders: '&orderId, status, urgency, patientRef, authoredOn',
      queueEntries: '++id, status, tokenDisplayKey, registeredAt, patientRef',
      tat_overrides: '&loincCode, tatCategory',
      checklist_templates: '&id, category, order',
      infection_control_audits: '&id, auditMonth, status, conductedBy, completedAt',
      referenceRanges: '&id, loincCode, gender, [loincCode+gender+ageMin], effectiveFrom',
      rangeVersions: '&id, rangeId, version, changedAt',
      // New in v12:
      consentRecords: '++id, patientRef, encounterId, status, syncStatus',
      waste_containers: '&id, status, location, [location+type], hlcTimestamp',
      waste_disposal_records: '&id, containerId, disposedAt, hlcTimestamp',
      culturalPreferences: '&patientRef, lastUpdatedAt',
      payments: '++id, &paymentId, patientRef, createdAt, syncStatus',
      priorityOverrides: '&sampleId, overriddenAt',
      peer_posts: '&id, status, syncStatus, createdAt, *tags, [status+createdAt]',
      peer_responses: '&id, postId, syncStatus, createdAt',
      moderation_flags: '&id, targetId, targetType, syncStatus, createdAt',
      safety_reports: '&id, status, submittedAt, category',
      lab_locations: '&id, name, type, mode, status',
      temperature_readings: '&id, locationId, timestamp',
      temperature_locations: '&id, name',
      temperature_excursions: '&id, locationId, startTime, acknowledged',
      employee_health_records: '&id, &practitionerId, lastUpdated',
      dataBudgetConfig: '&id',
      dataUsage: '++id, date, category, [date+category]',
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


// ---------------------------------------------------------------------------
// Daily Activity Log helpers (v7) — Story 50.4
// Aggregate-only data — no PHI. Only date, counts, and stats are stored.
// ---------------------------------------------------------------------------

/** Save (insert or replace) a daily activity log. */
export async function saveDailyLog(log: DailyActivityLog): Promise<void> {
  const db = getDb()
  await db.dailyLogs.put(log)
}

/** Retrieve a daily log by its UUID. */
export async function getDailyLog(id: string): Promise<DailyActivityLog | undefined> {
  const db = getDb()
  return db.dailyLogs.get(id)
}

/** Retrieve a daily log by date (YYYY-MM-DD). Returns most recently generated if multiple exist. */
export async function getDailyLogByDate(date: string): Promise<DailyActivityLog | undefined> {
  const db = getDb()
  const logs = await db.dailyLogs.filter((l) => l.logDate === date).toArray()
  return logs.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
}

/** Retrieve daily logs within a date range (inclusive, YYYY-MM-DD). Ordered newest first. */
export async function getDailyLogsByDateRange(
  from: string,
  to: string,
): Promise<DailyActivityLog[]> {
  const db = getDb()
  const logs = await db.dailyLogs.filter((l) => l.logDate >= from && l.logDate <= to).toArray()
  return logs.sort((a, b) => b.logDate.localeCompare(a.logDate))
}

/** Load daily log settings singleton (returns defaults if not yet saved). */
export async function getDailyLogSettings(): Promise<DailyLogSettings> {
  const db = getDb()
  const existing = await db.daily_log_settings.get('config')
  if (existing) return existing
  return {
    id: 'config',
    autoTriggerTime: '17:00',
    lastAutoGenerateDate: '',
    facilityName: 'Lab Lite',
    watermarkText: 'ULTRANOS VERIFIED',
  }
}

/** Save updated daily log settings. */
export async function saveDailyLogSettings(settings: DailyLogSettings): Promise<void> {
  const db = getDb()
  await db.daily_log_settings.put(settings)
}
// ---------------------------------------------------------------------------
// SOP helpers (v8) — required by learning trigger engine
// ---------------------------------------------------------------------------

/** Upsert SOPs into local Dexie cache (bulk). */
export async function putSOPs(sops: SOP[]): Promise<void> {
  const db = getDb()
  await db.sops.bulkPut(sops)
}

/** Get active SOPs, optionally filtered by category. */
export async function getActiveSOPs(category?: string): Promise<SOP[]> {
  const db = getDb()
  const all = await db.sops.where('status').equals('active').toArray()
  if (!category) return all
  return all.filter((s) => s.category === category)
}

/** Get SOP by id. */
export async function getSOPById(id: string): Promise<SOP | undefined> {
  const db = getDb()
  return db.sops.get(id)
}

/** Add an SOP acknowledgment record. */
export async function addSOPAcknowledgment(ack: SOPAcknowledgment): Promise<void> {
  const db = getDb()
  await db.sop_acknowledgments.put(ack)
}

// ---------------------------------------------------------------------------
// Lab result helpers (v8) — required by learning trigger engine
// ---------------------------------------------------------------------------

/** Upsert a lab result (used in tests and by result-entry flow). */
export async function putLabResult(result: LabResult): Promise<void> {
  const db = getDb()
  await db.lab_results.put(result)
}

// ---------------------------------------------------------------------------
// Micro-Learning Module helpers (v8) — Story 46.2
// ---------------------------------------------------------------------------

/** Store a single micro-learning module. */
export async function addMicroLearningModule(
  module: MicroLearningModule,
): Promise<string> {
  const db = getDb()
  return db.micro_learning_modules.put(module)
}

/** Bulk-upsert modules (used by sync). */
export async function upsertMicroLearningModules(
  modules: MicroLearningModule[],
): Promise<void> {
  const db = getDb()
  await db.micro_learning_modules.bulkPut(modules)
}

/** Get module by procedureRef (returns the first match). */
export async function getMicroLearningModuleByProcedure(
  procedureRef: string,
): Promise<MicroLearningModule | undefined> {
  const db = getDb()
  return db.micro_learning_modules
    .where('procedureRef')
    .equals(procedureRef)
    .first()
}

/** Store a module completion record. */
export async function addModuleCompletion(
  completion: ModuleCompletion,
): Promise<string> {
  const db = getDb()
  return db.module_completions.put(completion)
}

/** Get all completions with syncStatus='pending'. */
export async function getPendingModuleCompletions(): Promise<ModuleCompletion[]> {
  const db = getDb()
  return db.module_completions
    .where('syncStatus')
    .equals('pending')
    .toArray()
}

/** Mark completion records as synced. */
export async function markModuleCompletionsSynced(ids: string[]): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.module_completions, async () => {
    for (const id of ids) {
      await db.module_completions.update(id, { syncStatus: 'synced' as const })
    }
  })
}

// ---------------------------------------------------------------------------
// Lab Order helpers (v9) — Story 42.2, 45.5
// ---------------------------------------------------------------------------

/** Upsert a lab order into local Dexie cache. */
export async function putOrder(order: LabOrderEntry): Promise<void> {
  const db = getDb()
  await db.orders.put(order)
}

/** Bulk-upsert lab orders from Hub sync. */
export async function putOrders(orders: LabOrderEntry[]): Promise<void> {
  const db = getDb()
  await db.orders.bulkPut(orders)
}

/** Return all orders, ordered newest-first. */
export async function getOrders(): Promise<LabOrderEntry[]> {
  const db = getDb()
  return db.orders.orderBy('authoredOn').reverse().toArray()
}

/** Return active orders for a specific patient reference. */
export async function getOrdersForPatient(patientRef: string): Promise<LabOrderEntry[]> {
  const db = getDb()
  return db.orders.where('patientRef').equals(patientRef).toArray()
}

// ---------------------------------------------------------------------------
// TAT Override helpers (v9) — Story 45.5
// ---------------------------------------------------------------------------

/** Return all lab-customized TAT overrides as a Record keyed by loincCode. */
export async function getTatOverrides(): Promise<Partial<Record<string, TatOverrideEntry>>> {
  const db = getDb()
  const all = await db.tat_overrides.toArray()
  return Object.fromEntries(all.map((e) => [e.loincCode, e]))
}

/** Upsert a single TAT override. */
export async function putTatOverride(entry: TatOverrideEntry): Promise<void> {
  const db = getDb()
  await db.tat_overrides.put(entry)
}

/** Remove a TAT override (revert to default). */
export async function removeTatOverride(loincCode: string): Promise<void> {
  const db = getDb()
  await db.tat_overrides.delete(loincCode)
}

// ---------------------------------------------------------------------------
// Infection Control Audit helpers (v10) — Story 47.7
// No PHI — conductedBy is an opaque practitioner ID.
// ---------------------------------------------------------------------------

/** Return all active checklist templates ordered by category then order. */
export async function getChecklistTemplates(): Promise<ChecklistItemTemplate[]> {
  const db = getDb()
  const all = await db.checklist_templates.toArray()
  return all
    .filter((t) => t.isActive)
    .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order)
}

/** Upsert a checklist template (add or update). */
export async function putChecklistTemplate(template: ChecklistItemTemplate): Promise<void> {
  const db = getDb()
  await db.checklist_templates.put(template)
}

/**
 * Delete a custom (non-default) checklist item.
 * Returns false if item is default or not found.
 */
export async function deleteChecklistTemplate(id: string): Promise<boolean> {
  const db = getDb()
  const item = await db.checklist_templates.get(id)
  if (!item || item.isDefault) return false
  await db.checklist_templates.delete(id)
  return true
}

/** Deactivate a default checklist item (cannot be permanently deleted). */
export async function deactivateChecklistTemplate(id: string): Promise<boolean> {
  const db = getDb()
  const item = await db.checklist_templates.get(id)
  if (!item) return false
  await db.checklist_templates.update(id, { isActive: false })
  return true
}

/** Reset all default items back to active state. */
export async function resetChecklistTemplatesToDefaults(): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.checklist_templates, async () => {
    await db.checklist_templates.bulkPut(DEFAULT_CHECKLIST_ITEMS)
  })
}

/** Create a new audit record. */
export async function createAudit(audit: InfectionControlAudit): Promise<void> {
  const db = getDb()
  await db.infection_control_audits.add(audit)
}

/** Update an audit record. */
export async function updateAudit(id: string, updates: Partial<InfectionControlAudit>): Promise<void> {
  const db = getDb()
  await db.infection_control_audits.update(id, updates)
}

/** Retrieve audits for a specific month (YYYY-MM). */
export async function getAuditsByMonth(month: string): Promise<InfectionControlAudit[]> {
  const db = getDb()
  return db.infection_control_audits.where('auditMonth').equals(month).toArray()
}

/** Retrieve completed audit history ordered newest first. */
export async function getAuditHistory(limit = 24): Promise<InfectionControlAudit[]> {
  const db = getDb()
  const audits = await db.infection_control_audits.where('status').equals('COMPLETED').toArray()
  return audits
    .sort((a, b) => b.auditDate.localeCompare(a.auditDate))
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Reference Range helpers (v11) — Story 43.8
// No PHI — ranges are purely clinical configuration data.
// ---------------------------------------------------------------------------

/** Return all custom reference ranges for a LOINC code (including superseded). */
export async function getRangesByLoinc(loincCode: string): Promise<ReferenceRangeEntry[]> {
  const db = getDb()
  return db.referenceRanges.where('loincCode').equals(loincCode).toArray()
}

/** Return all active (non-superseded) custom reference ranges. */
export async function getActiveCustomRanges(): Promise<ReferenceRangeEntry[]> {
  const db = getDb()
  const all = await db.referenceRanges.toArray()
  return all.filter((r) => !r.effectiveTo)
}

/** Save a reference range (insert or replace). */
export async function putReferenceRange(range: ReferenceRangeEntry): Promise<void> {
  const db = getDb()
  await db.referenceRanges.put(range)
}

/** Supersede a range by setting its effectiveTo date. */
export async function supersedeRange(id: string, effectiveTo: string): Promise<void> {
  const db = getDb()
  await db.referenceRanges.update(id, { effectiveTo })
}

/** Save a range version record (audit trail). */
export async function putRangeVersion(version: RangeVersionEntry): Promise<void> {
  const db = getDb()
  await db.rangeVersions.put(version)
}

/** Get all version history for a range. */
export async function getRangeVersionHistory(rangeId: string): Promise<RangeVersionEntry[]> {
  const db = getDb()
  return db.rangeVersions.where('rangeId').equals(rangeId).sortBy('version')
}

// ---------------------------------------------------------------------------
// Consent Record helpers (v12) — Story 10.1
// Append-only: records are never deleted, only withdrawn (status change).
// ---------------------------------------------------------------------------

/** Add a new consent record. Returns the auto-generated ID. */
export async function addConsentRecord(
  record: Omit<ConsentRecord, 'id'>,
): Promise<number> {
  const db = getDb()
  return db.consentRecords.add(record as ConsentRecord)
}

/** Return all consent records for a patient reference. */
export async function getConsentsByPatient(patientRef: string): Promise<ConsentRecord[]> {
  const db = getDb()
  return db.consentRecords.where('patientRef').equals(patientRef).toArray()
}

/** Return all consent records for a specific encounter. */
export async function getConsentByEncounter(encounterId: string): Promise<ConsentRecord[]> {
  const db = getDb()
  return db.consentRecords.where('encounterId').equals(encounterId).toArray()
}

/** Withdraw consent — does NOT delete, only marks withdrawn. */
export async function withdrawConsent(
  id: number,
  withdrawalReason: string,
): Promise<void> {
  const db = getDb()
  await db.consentRecords.update(id, {
    status: 'withdrawn',
    withdrawnAt: new Date().toISOString(),
    withdrawalReason,
  })
}

// ---------------------------------------------------------------------------
// Cultural Preferences helpers (v12) — Story 38.x
// ---------------------------------------------------------------------------

/** Return cultural preferences for a patient (undefined if none set). */
export async function getPatientCulturalPreferences(
  patientRef: string,
): Promise<PatientCulturalPreferences | undefined> {
  const db = getDb()
  return db.culturalPreferences.get(patientRef)
}

/** Upsert cultural preferences for a patient. */
export async function setPatientCulturalPreferences(
  prefs: PatientCulturalPreferences,
): Promise<void> {
  const db = getDb()
  await db.culturalPreferences.put(prefs)
}

/** Add a cultural flag to a patient's preferences (upserts preferences record). */
export async function addCulturalFlag(
  patientRef: string,
  flag: CulturalFlag,
  techId: string,
  hlcTimestamp: string,
): Promise<void> {
  const db = getDb()
  const existing = await db.culturalPreferences.get(patientRef)
  const now = new Date().toISOString()
  if (existing) {
    await db.culturalPreferences.update(patientRef, {
      flags: [...existing.flags, flag],
      lastUpdatedAt: now,
      lastUpdatedByTechId: techId,
      hlcTimestamp,
    })
  } else {
    await db.culturalPreferences.put({
      patientRef,
      flags: [flag],
      lastUpdatedAt: now,
      lastUpdatedByTechId: techId,
      hlcTimestamp,
    })
  }
}

/** Remove a cultural flag from a patient's preferences. */
export async function removeCulturalFlag(
  patientRef: string,
  flagType: string,
  techId: string,
  hlcTimestamp: string,
): Promise<void> {
  const db = getDb()
  const existing = await db.culturalPreferences.get(patientRef)
  if (!existing) return
  const now = new Date().toISOString()
  await db.culturalPreferences.update(patientRef, {
    flags: existing.flags.filter((f) => f.type !== flagType),
    lastUpdatedAt: now,
    lastUpdatedByTechId: techId,
    hlcTimestamp,
  })
}

/** Update a specific cultural flag for a patient. */
export async function updateCulturalFlag(
  patientRef: string,
  flagType: string,
  updates: Partial<CulturalFlag>,
  techId: string,
  hlcTimestamp: string,
): Promise<void> {
  const db = getDb()
  const existing = await db.culturalPreferences.get(patientRef)
  if (!existing) return
  const now = new Date().toISOString()
  await db.culturalPreferences.update(patientRef, {
    flags: existing.flags.map((f) =>
      f.type === flagType ? { ...f, ...updates, setByTechId: techId } : f,
    ),
    lastUpdatedAt: now,
    lastUpdatedByTechId: techId,
    hlcTimestamp,
  })
}

// ---------------------------------------------------------------------------
// Waste Tracking helpers (v12) — Story 42.1 / 44.1
// No PHI — operational/safety data only.
// ---------------------------------------------------------------------------

/** Upsert a waste container record. */
export async function putWasteContainer(container: WasteContainer): Promise<void> {
  const db = getDb()
  await db.waste_containers.put(container)
}

/** Return a waste container by ID. */
export async function getWasteContainerById(id: string): Promise<WasteContainer | undefined> {
  const db = getDb()
  return db.waste_containers.get(id)
}

/** Return all containers not yet disposed. */
export async function getActiveContainers(): Promise<WasteContainer[]> {
  const db = getDb()
  return db.waste_containers.where('status').notEqual('DISPOSED').toArray()
}

/** Return all DISPOSED containers for a given location and type (fill history). */
export async function getContainerHistory(location: string, type: string): Promise<WasteContainer[]> {
  const db = getDb()
  const all = await db.waste_containers
    .where('[location+type]')
    .equals([location, type])
    .toArray()
  return all.filter((c) => c.status === 'DISPOSED')
}

/** Return all containers. */
export async function getAllContainers(): Promise<WasteContainer[]> {
  const db = getDb()
  return db.waste_containers.toArray()
}

/** Append a disposal record. */
export async function addDisposalRecord(record: WasteDisposalRecord): Promise<void> {
  const db = getDb()
  await db.waste_disposal_records.put(record)
}

/** Return all disposal records, newest first. */
export async function getDisposalRecords(): Promise<WasteDisposalRecord[]> {
  const db = getDb()
  return db.waste_disposal_records.orderBy('disposedAt').reverse().toArray()
}

// ---------------------------------------------------------------------------
// Payment helpers (v12) — Story 41.1
// No PHI — patientRef is an opaque reference only.
// ---------------------------------------------------------------------------

/** Record a payment. Returns the auto-generated ID. */
export async function recordPaymentEntry(entry: Omit<PaymentEntry, 'id'>): Promise<number> {
  const db = getDb()
  return db.payments.add(entry as PaymentEntry)
}

/** Return all payments for a patient reference. */
export async function getPaymentsByPatientRef(patientRef: string): Promise<PaymentEntry[]> {
  const db = getDb()
  return db.payments.where('patientRef').equals(patientRef).toArray()
}

/** Return all payments recorded on a specific ISO date (YYYY-MM-DD). */
export async function getPaymentsByDateEntry(date: string): Promise<PaymentEntry[]> {
  const db = getDb()
  const all = await db.payments.where('createdAt').startsWith(date).toArray()
  return all
}

// ---------------------------------------------------------------------------
// Priority Override helpers (v12) — Story 45.3
// No PHI — sampleId is an opaque reference.
// ---------------------------------------------------------------------------

/** Return all manual position overrides as a map keyed by sampleId. */
export async function getPriorityOverrides(): Promise<PriorityOverrideEntry[]> {
  const db = getDb()
  return db.priorityOverrides.toArray()
}

/** Set (upsert) a manual priority position for a sample. */
export async function setPriorityOverride(
  sampleId: string,
  manualPosition: number,
): Promise<void> {
  const db = getDb()
  await db.priorityOverrides.put({
    sampleId,
    manualPosition,
    overriddenAt: new Date().toISOString(),
  })
}

/** Remove a manual override for a sample. */
export async function clearPriorityOverride(sampleId: string): Promise<void> {
  const db = getDb()
  await db.priorityOverrides.delete(sampleId)
}

/** Remove all manual overrides. */
export async function clearAllPriorityOverrides(): Promise<void> {
  const db = getDb()
  await db.priorityOverrides.clear()
}

// ---------------------------------------------------------------------------
// Safety Report helpers (v12) — Story 49.x
// No PHI — reports are operational safety data only.
// ---------------------------------------------------------------------------

/** Add a new safety report. */
export async function addSafetyReport(report: SafetyReport): Promise<void> {
  const db = getDb()
  await db.safety_reports.add(report)
}

/** Return all safety reports, newest first. */
export async function getSafetyReports(): Promise<SafetyReport[]> {
  const db = getDb()
  return db.safety_reports.orderBy('submittedAt').reverse().toArray()
}

/** Return reports filtered by status. */
export async function getSafetyReportsByStatus(status: SafetyReport['status']): Promise<SafetyReport[]> {
  const db = getDb()
  return db.safety_reports.where('status').equals(status).toArray()
}

/** Return a single report by ID. */
export async function getSafetyReportById(id: string): Promise<SafetyReport | undefined> {
  const db = getDb()
  return db.safety_reports.get(id)
}

/** Update a safety report's status and related fields. */
export async function updateReportStatus(
  id: string,
  updates: Partial<SafetyReport>,
): Promise<void> {
  const db = getDb()
  await db.safety_reports.update(id, updates)
}

// ---------------------------------------------------------------------------
// Lab Location helpers (v12) — Story 48.x
// No PHI — facility/location configuration data.
// ---------------------------------------------------------------------------

/** Upsert a lab location. */
export async function putLabLocation(location: LabLocation): Promise<void> {
  const db = getDb()
  await db.lab_locations.put(location)
}

/** Return all active lab locations. */
export async function getActiveLocations(): Promise<LabLocation[]> {
  const db = getDb()
  return db.lab_locations.where('status').equals('active').toArray()
}

/** Return a location by ID. */
export async function getLocationById(id: string): Promise<LabLocation | undefined> {
  const db = getDb()
  return db.lab_locations.get(id)
}

// ---------------------------------------------------------------------------
// Data Budget helpers (v12) — Story 48.x
// No PHI — network usage metrics only.
// ---------------------------------------------------------------------------

const DATA_BUDGET_CONFIG_ID = 'config' as const

const DEFAULT_DATA_BUDGET_CONFIG: DataBudgetConfig = {
  id: DATA_BUDGET_CONFIG_ID,
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleStart: new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString().slice(0, 10),
}

/** Return the current data budget configuration (returns default if none stored). */
export async function getDataBudgetConfig(): Promise<DataBudgetConfig> {
  const db = getDb()
  const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
  return stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
}

/** Update data budget configuration fields (upserts). */
export async function updateDataBudgetConfig(
  updates: Partial<Omit<DataBudgetConfig, 'id'>>,
): Promise<void> {
  const db = getDb()
  const current = await getDataBudgetConfig()
  await db.dataBudgetConfig.put({ ...current, ...updates, id: DATA_BUDGET_CONFIG_ID })
}

/** Record a network usage entry for a specific date + category. */
export async function recordDataUsage(record: DataUsageRecord): Promise<void> {
  const db = getDb()
  await db.dataUsage.add(record)
}

/** Return all usage records within a date range (inclusive). */
export async function getUsageByDay(startDate: string, endDate: string): Promise<DataUsageRecord[]> {
  const db = getDb()
  return db.dataUsage
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray()
}

/** Return all usage records for the current billing cycle. */
export async function getUsageForCycle(): Promise<DataUsageRecord[]> {
  const db = getDb()
  const config = await getDataBudgetConfig()
  const today = new Date().toISOString().slice(0, 10)
  return db.dataUsage
    .where('date')
    .between(config.currentCycleStart, today, true, true)
    .toArray()
}

/**
 * Check if billing cycle has expired and roll it over if so.
 * Returns true if a rollover happened.
 */
export async function checkAndRolloverCycle(): Promise<boolean> {
  const db = getDb()
  const config = await getDataBudgetConfig()
  const today = new Date()
  const cycleStart = new Date(config.currentCycleStart)

  // Has a full calendar month passed since cycle start?
  const nextCycleDate = new Date(
    cycleStart.getFullYear(),
    cycleStart.getMonth() + 1,
    config.billingCycleDay,
  )

  if (today >= nextCycleDate) {
    const newCycleStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      config.billingCycleDay,
    )
    // If cycle day hasn't arrived this month yet, use last month
    if (newCycleStart > today) {
      newCycleStart.setMonth(newCycleStart.getMonth() - 1)
    }
    await db.dataBudgetConfig.put({
      ...config,
      currentCycleStart: newCycleStart.toISOString().slice(0, 10),
    })
    return true
  }
  return false
}
