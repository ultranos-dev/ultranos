import Dexie, { type EntityTable } from 'dexie'
import type { FhirPatient, FhirEncounterZod, FhirObservation, FhirCondition, FhirMedicationRequestZod, FhirAllergyIntolerance, FhirMedicationStatementZod, AIModelType } from '@ultranos/shared-types'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import type { DataUsageCategory } from '@ultranos/sync-engine'
export type { DataUsageCategory }  // re-export for consumers
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from './dexie-encryption-middleware'

/**
 * Local patient record type — mirrors FhirPatient for Dexie storage.
 * Dexie stores these in IndexedDB with indexed fields for fast lookup.
 */
export type LocalPatient = FhirPatient

export type LocalEncounter = FhirEncounterZod

export interface SoapLedgerEntry {
  id: string
  encounterId: string
  subjective: string
  objective: string
  assessment?: string
  plan?: string
  assessorRef: string
  hlcTimestamp: string
  createdAt: string
  /** Story 24.1: AI versioning fields */
  source?: 'MANUAL' | 'AI_GENERATED' | 'AI_CONFIRMED'
  aiModelVersion?: string
  confirmedBy?: string
  confirmedAt?: string
}

export type LocalObservation = FhirObservation

export type LocalCondition = FhirCondition

export type LocalMedicationRequest = FhirMedicationRequestZod

export type LocalAllergyIntolerance = FhirAllergyIntolerance

export type LocalMedicationStatement = FhirMedicationStatementZod

export interface InteractionAuditEntry {
  id: string
  encounterId: string
  patientId: string
  medicationRequestId: string
  medicationDisplay: string
  checkResult: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactionsFound: number
  overrideReason?: string
  practitionerRef: string
  hlcTimestamp: string
  createdAt: string
}

export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: 'create' | 'update' | 'sync:conflict_resolved' | 'pull-conflict'
  payload: string
  status: 'pending' | 'syncing' | 'failed' | 'synced' | 'resolved'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
  conflictFlag?: boolean
  failureReason?: string
  /** JSON-stringified remote version data from Hub conflict response */
  conflictData?: string
  /** FHIR reference to patient, e.g. "Patient/{uuid}" */
  patientRef?: string
  /** Conflict resolution metadata */
  resolvedAt?: string
  resolutionType?: string
}

export interface SyncMetaEntry {
  patientId: string
  lastPulledHlc: string
  lastPulledAt: string
}

export interface PractitionerKeyEntry {
  publicKey: string          // base64-encoded Ed25519 public key (primary key)
  practitionerId: string
  practitionerName: string
  cachedAt: string           // ISO 8601 timestamp
}

// --- Vocabulary tables (Story 10.3) ---

export interface VocabMedicationEntry {
  code: string       // indexed, unique — e.g. "RX001"
  display: string    // indexed — drug name
  form: string
  strength: string
  atcCode?: string   // optional — for future ATC/RxNorm migration
  version: number
}

export interface VocabIcd10Entry {
  code: string       // indexed, unique — e.g. "A09"
  display: string    // indexed — diagnosis name
  version: number
}

export interface VocabInteractionEntry {
  id?: number        // auto-incremented
  drugA: string      // indexed
  drugB: string      // indexed
  severity: string
  description: string
  version: number
}

// Data Budget types — Story 48.x / Data Connectivity
// ---------------------------------------------------------------------------

export interface DataBudgetConfig {
  id: 'config'
  planSizeMB: number
  billingCycleDay: number   // 1-28: day of month cycle resets
  lowDataMode: boolean
  currentCycleStart: string // ISO 8601 date of current cycle start
}

export interface DataUsageRecord {
  date: string
  category: DataUsageCategory
  bytesOut: number
  bytesIn: number
  requestCount: number
}

// --- AI Model metadata tables (Story 24.4) ---

export interface AIModelMetadataEntry {
  modelId: string         // primary key
  modelType: AIModelType
  version: string
  downloadedAt: string    // ISO 8601
  fileSize: number
  checksum: string
  isStale: boolean
}

// Diagnostic report type — used by LabResultsList/LabResultDetail components.
export interface LocalDiagnosticReport {
  id: string
  resourceType: 'DiagnosticReport'
  status: string
  code: { coding?: { code?: string; display?: string; system?: string }[]; text?: string }
  subject: { reference?: string }
  effectiveDateTime?: string
  issued?: string
  conclusion?: string
  performer?: { display?: string; reference?: string }[]
  presentedForm?: { contentType?: string; url?: string; title?: string; data?: string }[]
  acknowledgedAt?: string
  meta?: { lastUpdated?: string }
}

export interface ModelDownloadProgress {
  modelId: string         // primary key
  version: string
  bytesDownloaded: number
  totalBytes: number
  downloadUrl: string
  startedAt: string       // ISO 8601
}

class OpdLiteDatabase extends Dexie {
  patients!: EntityTable<LocalPatient, 'id'>
  encounters!: EntityTable<LocalEncounter, 'id'>
  soapLedger!: EntityTable<SoapLedgerEntry, 'id'>
  observations!: EntityTable<LocalObservation, 'id'>
  conditions!: EntityTable<LocalCondition, 'id'>
  medications!: EntityTable<LocalMedicationRequest, 'id'>
  interactionAuditLog!: EntityTable<InteractionAuditEntry, 'id'>
  practitionerKeys!: EntityTable<PractitionerKeyEntry, 'publicKey'>
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>
  clientAuditLog!: EntityTable<ClientAuditEvent, 'id'>
  allergyIntolerances!: EntityTable<LocalAllergyIntolerance, 'id'>
  medicationStatements!: EntityTable<LocalMedicationStatement, 'id'>
  vocabularyMedications!: EntityTable<VocabMedicationEntry, 'code'>
  vocabularyIcd10!: EntityTable<VocabIcd10Entry, 'code'>
  vocabularyInteractions!: EntityTable<VocabInteractionEntry, 'id'>
  aiModels!: EntityTable<AIModelMetadataEntry, 'modelId'>
  modelDownloadProgress!: EntityTable<ModelDownloadProgress, 'modelId'>
  appointments!: EntityTable<Record<string, unknown>, 'id'>
  slots!: EntityTable<Record<string, unknown>, 'id'>
  diagnosticReports!: EntityTable<LocalDiagnosticReport, 'id'>
  syncMeta!: EntityTable<SyncMetaEntry, 'patientId'>
  dataBudgetConfig!: Dexie.Table<DataBudgetConfig, string>
  dataUsage!: Dexie.Table<DataUsageRecord & { id?: number }, number>

  constructor() {
    super('opd-lite')

    this.version(1).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
    })

    this.version(2).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(3).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
    })

    this.version(4).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(5).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
    })

    this.version(6).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(7).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
    })

    this.version(8).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
    })

    this.version(9).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(10).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      dispenseAuditLog:
        'id, dispenseId, patientRef, pharmacistRef, action, createdAt',
    })

    this.version(11).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      dispenseAuditLog:
        'id, dispenseId, patientRef, pharmacistRef, action, createdAt',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
    })

    // v12: Remove pharmacy-specific tables (dispenses, dispenseAuditLog)
    // Pharmacy fulfillment now lives in pharmacy-lite (Story 4.4)
    this.version(12).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses: null,
      dispenseAuditLog: null,
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
    })

    // v13: Client-side audit ledger (Story 8.1)
    // Not encrypted — contains only opaque IDs, no PHI.
    this.version(13).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
    })

    // v14: Vocabulary tables for Dexie-backed terminology service (Story 10.3)
    // Not encrypted — vocabulary is non-PHI reference data.
    this.version(14).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
    })

    // v15: AllergyIntolerance table (Story 10.2)
    // Tier 1 safety-critical — append-only merge in sync engine.
    // Encrypted: contains substance info (PHI).
    this.version(15).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
      allergyIntolerances:
        'id, patient.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    // v16: MedicationStatement cache for cross-encounter interaction checks (Story 10.1)
    // Encrypted — contains medication names (clinical content).
    this.version(16).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
      allergyIntolerances:
        'id, patient.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      medicationStatements:
        'id, status, subject.reference, _ultranos.sourcePrescriptionId, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    // v17: AI model metadata and download progress (Story 24.4)
    // Not encrypted — model metadata is NOT PHI (just version info).
    this.version(17).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
      allergyIntolerances:
        'id, patient.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      medicationStatements:
        'id, status, subject.reference, _ultranos.sourcePrescriptionId, _ultranos.hlcTimestamp, meta.lastUpdated',
      aiModels:
        '&modelId, modelType, isStale',
      modelDownloadProgress:
        '&modelId',
    })

    // v18: Appointment and slot tables (Epic 37, Story 37.12)
    // Encrypted — appointments reference patients via participant.
    this.version(18).stores({
      appointments: 'id, status, start, _ultranos.hlcTimestamp',
      slots: 'id, status, start, _ultranos.hlcTimestamp',
    })

    // v19: Sync metadata table for pull watermarks (Sync Engine Activation)
    this.version(19).stores({
      syncMeta: '&patientId',
    })

    // v20: DiagnosticReport cache for lab results (Story 20.5)
    // Encrypted — contains clinical content (lab conclusions, performer info).
    this.version(20).stores({
      diagnosticReports:
        'id, status, subject.reference, meta.lastUpdated',
    })

    // v21: Data Budget tables — track network usage per billing cycle (Story 48.x)
    // No PHI — contains only byte counts, dates, and category labels.
    this.version(21).stores({
      dataBudgetConfig: '&id',
      dataUsage: '++id, date, category, [date+category]',
    })
  }
}

/**
 * PHI tables that require field-level encryption via AES-256-GCM.
 * Indexed fields remain in cleartext for Dexie queries; all other
 * fields are encrypted into a single `_enc` blob in IndexedDB.
 *
 * Non-PHI tables (syncQueue, practitionerKeys) are NOT encrypted —
 * they contain operational data (opaque IDs, timestamps) rather than
 * clinical content. Audit tables are encrypted because they contain
 * medicationDisplay and patient references (clinical content).
 */
const PHI_TABLE_CONFIGS: EncryptionTableConfig[] = [
  {
    tableName: 'patients',
    indexedFields: [
      'id',
      '_ultranos.nameLocal',
      '_ultranos.nationalIdHash',
      '_ultranos.nameLatin',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'encounters',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'soapLedger',
    indexedFields: ['id', 'encounterId', 'hlcTimestamp'],
  },
  {
    tableName: 'observations',
    indexedFields: [
      'id',
      'encounter.reference',
      'subject.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'conditions',
    indexedFields: [
      'id',
      'encounter.reference',
      'subject.reference',
      '_ultranos.diagnosisRank',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'medications',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      'encounter.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'allergyIntolerances',
    indexedFields: [
      'id',
      'patient.reference',
      'clinicalStatus.coding[0].code',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'medicationStatements',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      '_ultranos.sourcePrescriptionId',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'interactionAuditLog',
    indexedFields: [
      'id',
      'encounterId',
      'patientId',
      'medicationRequestId',
      'checkResult',
      'createdAt',
    ],
  },
  {
    tableName: 'appointments',
    indexedFields: ['id', 'status', 'start', '_ultranos.hlcTimestamp'],
  },
]

export const db = new OpdLiteDatabase()

applyEncryptionMiddleware(db, PHI_TABLE_CONFIGS)

// ---------------------------------------------------------------------------
// Data Budget helpers (v21) — Story 48.x
// No PHI — network usage metrics only.
// ---------------------------------------------------------------------------

const DATA_BUDGET_CONFIG_ID = 'config' as const

const DEFAULT_DATA_BUDGET_CONFIG: DataBudgetConfig = {
  id: DATA_BUDGET_CONFIG_ID,
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleStart: (() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })(),
}

export async function getDataBudgetConfig(): Promise<DataBudgetConfig> {
  const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
  return stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
}

export async function updateDataBudgetConfig(
  updates: Partial<Omit<DataBudgetConfig, 'id'>>,
): Promise<void> {
  const current = await getDataBudgetConfig()
  await db.dataBudgetConfig.put({ ...current, ...updates, id: DATA_BUDGET_CONFIG_ID })
}

export async function recordDataUsage(record: DataUsageRecord): Promise<void> {
  await db.dataUsage.add(record)
}

export async function getUsageByDay(startDate: string, endDate: string): Promise<DataUsageRecord[]> {
  return db.dataUsage
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray()
}

export async function getUsageForCycle(): Promise<DataUsageRecord[]> {
  const config = await getDataBudgetConfig()
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return db.dataUsage
    .where('date')
    .between(config.currentCycleStart, today, true, true)
    .toArray()
}

/** Parse an ISO date string (YYYY-MM-DD) as a local-time Date at midnight. */
function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number)
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!)
}

export async function checkAndRolloverCycle(): Promise<boolean> {
  return db.transaction('rw', db.dataBudgetConfig, async () => {
    const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
    const config = stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
    const today = new Date()
    const cycleStart = parseDateLocal(config.currentCycleStart)
    const nextCycleDate = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth() + 1,
      Math.min(config.billingCycleDay, 28),
    )
    if (today >= nextCycleDate) {
      const newCycleStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        Math.min(config.billingCycleDay, 28),
      )
      if (newCycleStart > today) {
        newCycleStart.setMonth(newCycleStart.getMonth() - 1)
      }
      await db.dataBudgetConfig.put({
        ...config,
        currentCycleStart: `${newCycleStart.getFullYear()}-${String(newCycleStart.getMonth() + 1).padStart(2, '0')}-${String(newCycleStart.getDate()).padStart(2, '0')}`,
      })
      return true
    }
    return false
  })
}
