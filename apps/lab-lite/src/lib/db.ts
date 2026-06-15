import Dexie from 'dexie'
import type { DataUsageCategory } from '@ultranos/sync-engine'
export type { DataUsageCategory }  // re-export for existing consumers
import type { FhirSpecimen, PatientVerificationRecord, AmendmentRecord } from '@ultranos/shared-types'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import type { CustodyEvent } from '@/types/custody-event'
import type { MentorshipPairing, LearningJournalEntry, CheckInRecord } from '@/lib/mentorship-types'
import type { SOP, SOPAcknowledgment } from '@/lib/sop-types'
import type {
  MicroLearningModule,
  ModuleCompletion,
} from '@/lib/micro-learning-types'
import type { ChecklistItemTemplate, InfectionControlAudit } from '@/types/infection-control-audit'
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/safety/default-checklist'
import type { CertificationPathway, TechnicianProgress, DigitalCertificate } from '@/lib/certification-types'
import type { SupervisedProcedure } from '@/lib/supervised-procedure-types'

import type { DailyActivityLog, DailyLogSettings } from '@/lib/daily-log-types'
import type { HmisMonthlyReport } from '@/lib/hmis-types'
import type { TokenColor, TokenSymbol } from '@/lib/token-generator'
import type { TestTatProfile } from '@/lib/test-tat-database'
import type { ReferenceRange, RangeVersion } from '@/lib/reference-ranges/types'
import type { WasteContainer, WasteDisposalRecord } from '@/types/waste-tracking'
import type { PatientCulturalPreferences, CulturalFlag } from '@/lib/cultural-flags'
import type { PeerPost, PeerResponse, ModerationFlag } from '@/lib/peer-network-types'
import type { SafetyReport } from '@/types/safety-reporting'
import type { LabLocation, NetworkStatusSnapshot } from '@/types/lab-network'
import type { TransportSession } from '@/types/transport'
import type { TemperatureReading, TemperatureLocation, TemperatureExcursion } from '@/types/temperature-monitoring'
import type { EncryptedHealthRecord } from '@/types/employee-health'
import type { AtlasEntry, AtlasCategory } from '@/lib/visual-atlas'
import type { QcRun, DriftAlert } from '@/lib/qc/types'
import type { SurveillanceAlert, ReportableDiseaseConfig, SurveillanceBaseline, SurveillanceSchedulerConfig } from '@/lib/surveillance-types'
import type { QualityStreak, QualityMetric, Badge, EarnedBadge } from '@/lib/quality-streak-types'
import type { CriticalValueThreshold, CompletedChecklist, ChecklistConfig } from '@/lib/critical-values/types'
import { DEFAULT_CRITICAL_THRESHOLDS } from '@/lib/critical-values/default-thresholds'
import type { SmsQueueEntry, SmsGatewayConfig, SmsEscalationScheduleEntry } from '@/lib/sms/sms-gateway'
import type { CHWSampleCollection, CourierHandoff } from '@/types/chw-mode'
import type { ReferenceLab, SendOut, SendOutStatusTransition } from '@/types/reference-lab'
import type { ConsultationRequest, ConsultationResponse } from '@/lib/consultation'
import type { ConsultationRecipient } from '@/lib/consultation-recipients'
import type { KnowledgeCard, TriggerRule } from '@/lib/knowledge-cards'
import type { GuidanceContent, GuidanceTrigger } from '@/lib/public-health-guidance'

// ---------------------------------------------------------------------------
// Achievement types (v17) — Story 51.7: Gamified Team Quality Engagement
// No PHI — achievements reference tech IDs and operational metrics only.
// ---------------------------------------------------------------------------

export enum AchievementType {
  QC_CHAMPION = 'QC_CHAMPION',
  ZERO_REJECTION_WEEK = 'ZERO_REJECTION_WEEK',
  SPEED_STAR = 'SPEED_STAR',
  CONSISTENCY_AWARD = 'CONSISTENCY_AWARD',
  MENTORSHIP_BADGE = 'MENTORSHIP_BADGE',
  TEAM_MILESTONE_1K = 'TEAM_MILESTONE_1K',
  TEAM_MILESTONE_5K = 'TEAM_MILESTONE_5K',
  TEAM_MILESTONE_10K = 'TEAM_MILESTONE_10K',
}

export interface Achievement {
  id: string                        // UUID
  techId: string                    // opaque practitioner ID
  type: AchievementType
  earnedAt: string                  // ISO 8601
  evaluationPeriod: string          // e.g. "2026-05" monthly, "2026-W22" weekly
  metadata: Record<string, unknown> // type-specific: score, count, etc.
  description: string
}

export interface TeamAchievement {
  id: string
  type: AchievementType
  earnedAt: string
  evaluationPeriod: string
  description: string
  participatingTechIds: string[]
}

export interface AchievementPreferences {
  techId: string
  showOnTeamDashboard: boolean      // default true
}

export interface AchievementSchedulerConfig {
  id: 'achievement-scheduler'       // singleton
  lastMonthlyEvaluation: string | null   // YYYY-MM
  lastWeeklyEvaluation: string | null    // YYYY-WNN
  lastMilestoneCheck: string | null      // YYYY-MM-DD
  gamificationEnabled: boolean           // lab-level toggle
}

// Re-export with Dexie-friendly names to avoid collision with result-templates.ts ReferenceRange
export type ReferenceRangeEntry = ReferenceRange
export type RangeVersionEntry = RangeVersion

// ---------------------------------------------------------------------------
// Sample Lock types (v32) — Story 51.3: Sample Collision Prevention
// No PHI — sampleId is a lab-internal ID, techId is an opaque practitioner ID.
// ---------------------------------------------------------------------------

export type LockStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED'
export type LockReleaseReason = 'MANUAL' | 'REASSIGNED' | 'EXPIRED' | 'RESULT_ENTERED'

export type LockResult =
  | { success: true; alreadyLocked?: boolean }
  | { success: false; lockedBy: string; lockedAt: string }

export interface SampleLock {
  sampleId: string          // primary key
  techId: string
  techName: string          // display label — not PHI (practitioner, not patient)
  lockedAt: string          // ISO 8601
  expiresAt: string         // ISO 8601
  status: LockStatus
  releaseRequestedAt?: string  // ISO 8601 — set when a release has been requested; prevents duplicate requests
}

// ---------------------------------------------------------------------------
// Workload Balancing types (v33) — Story 51.2: Workload Balancing Dashboard
// No PHI — techId is an opaque practitioner ID; no patient data stored.
// ---------------------------------------------------------------------------

export interface TechWorkloadSnapshot {
  id: string               // UUID
  techId: string
  shiftDate: string        // YYYY-MM-DD
  pendingCount: number
  inProgressCount: number
  completedCount: number
  avgTatMinutes: number
  snapshotAt: string       // ISO 8601
}

export interface TechAvailability {
  id: string               // UUID
  techId: string
  status: 'AVAILABLE' | 'BREAK' | 'ABSENT' | 'TRAINING'
  reason: string
  startedAt: string        // ISO 8601
  endedAt: string | null   // null = still unavailable
}

// ---------------------------------------------------------------------------
// Security Alert State types (v29) — Story 49.4: Conflict Zone Security Protocols
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string
  label: string
  checked: boolean
  checkedAt: string | null
}

export interface SecurityAlertStateRecord {
  id: number // singleton record, always id=1
  isActive: boolean
  activatedAt: string | null
  activatedBy: string | null
  readOnlyMode: boolean
  checklistItems: ChecklistItem[]
  backupGenerated: boolean
  wipeCompleted: boolean
}

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
  /** Originating location — set when entry is created from a satellite lab. */
  locationId?: string
}

export interface PractitionerKeyCache {
  practitionerId: string
  publicKey: string // base64-encoded Ed25519 public key
  cachedAt: string // ISO timestamp
}

export interface VerifiedPatientCache {
  patientId: string
  firstName: string // ONLY first name — CLAUDE.md Rule #7 (data minimization)
  fatherName?: string // Afghan standard: father's name used for disambiguation only, never stored as PHI
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

export interface DataUsageRecord {
  date: string                 // YYYY-MM-DD
  category: DataUsageCategory
  bytesOut: number
  bytesIn: number
  requestCount: number
}

// ---------------------------------------------------------------------------
// Shift Handover types (v13) — Story 51.1
// No PHI: outgoingTechName is display name only (not email/ID tied to patient data)
// ---------------------------------------------------------------------------

export interface HandoverReport {
  id: string
  outgoingTechId: string
  outgoingTechName: string  // display name only — NOT email
  incomingTechId: string | null
  incomingTechName: string | null  // display name stored at acknowledgment
  status: 'PENDING' | 'READY' | 'ACKNOWLEDGED' | 'EXPIRED'
  // PENDING = generated, not yet reviewed by outgoing tech
  // READY   = outgoing tech confirmed; awaiting incoming tech acknowledgment
  // ACKNOWLEDGED = incoming tech has acknowledged
  // EXPIRED = unacknowledged past threshold
  createdAt: string
  acknowledgedAt: string | null
  pendingSamples: { stat: number; routine: number; sampleIds: string[] }
  equipmentAlerts: { instrumentId: string; instrumentName: string; alertType: string }[]
  qcStatus: { analyte: string; status: 'PASS' | 'FAIL' | 'NOT_RUN' }[]
  incompleteOrders: { orderId: string; urgency: string; receivedAt: string }[]
  outgoingNotes: string
  incomingNotes: string | null
  shiftDate: string  // YYYY-MM-DD
}

export interface ShiftSession {
  id: string
  techId: string
  startedAt: string
  endedAt: string | null
  status: 'ACTIVE' | 'ENDED'
}

// ---------------------------------------------------------------------------
// Supply Inventory types (v31) — Story 51.5: RAG Readiness Board
// No PHI — supply names, categories, and stock counts are operational data.
// ---------------------------------------------------------------------------

export interface SupplyItem {
  id: string                    // UUID
  name: string
  category: string              // e.g. "Reagent", "Consumable", "Control Material"
  currentStock: number
  unit: string                  // e.g. "tests", "mL", "kits"
  reorderThreshold: number      // stock level triggering Amber
  criticalThreshold: number     // stock level triggering Red (default 0)
  dailyUsageEstimate: number    // for estimated depletion date calculation
  lastUpdated: string           // ISO 8601
  updatedBy: string             // opaque practitioner ID
}

// ---------------------------------------------------------------------------
// Instrument types (v31) — Story 51.5: RAG Readiness Board
// No PHI — instrument names and operational metadata only.
// ---------------------------------------------------------------------------

export interface Instrument {
  id: string                    // UUID
  name: string
  type: string                  // e.g. "Hematology", "Chemistry"
  model: string
  serialNumber: string | null
  avgRunTimeMinutes: number     // rolling average of last 10 runs (Story 51.4)
  status: 'IN_SERVICE' | 'OUT_OF_SERVICE'
  outOfServiceReason: string | null
  nextMaintenanceDue?: string   // ISO 8601 date — used for 7-day Amber check
  lastMaintenanceDate?: string  // ISO 8601 date
  createdAt: string             // ISO 8601
  updatedAt: string             // ISO 8601
}

// ---------------------------------------------------------------------------
// Lab Config types (v31) — key-value store for lab-level settings
// ---------------------------------------------------------------------------

export interface LabConfig {
  key: string   // e.g. "minimumStaffing"
  value: string // stored as string; parse on read
}

// ---------------------------------------------------------------------------
// Equipment Booking & Scheduling types (v34 — Story 51.4)
// No PHI: techId is an opaque practitioner ID; sampleIds are operational refs.
// ---------------------------------------------------------------------------

export interface QueuedBatch {
  id: string                              // UUID
  instrumentId: string
  techId: string                          // opaque practitioner ID
  techName: string                        // display name stored at queue time
  sampleIds: string[]                     // operational sample references, no demographics
  sampleCount: number
  testType: string
  estimatedRunMinutes: number
  position: number                        // 1-based; 1 = currently running/next
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
  cancelReason: string | null             // stored for audit/manager cancellations
  queuedAt: string                        // ISO 8601
  startedAt: string | null               // ISO 8601; set when status → RUNNING
  completedAt: string | null             // ISO 8601; set when status → COMPLETED/CANCELLED
}

export interface InstrumentHistoryEntry {
  id: string                              // UUID
  instrumentId: string
  batchId: string
  techId: string
  sampleCount: number
  runTimeMinutes: number                  // actual run time used for rolling average
  completedAt: string                     // ISO 8601
}

export interface InstrumentNotification {
  id: string                              // UUID
  techId: string                          // recipient tech
  instrumentId: string
  instrumentName: string                  // denormalised for offline display
  batchId: string
  type: 'NEXT_IN_LINE' | 'BATCH_CANCELLED'
  message: string                         // pre-rendered localised message
  estimatedStartTime: string             // ISO 8601
  createdAt: string                       // ISO 8601
  dismissed: boolean
}

// v35 — Power-Aware Workload Scheduler (Story 48.1)
export interface PowerScheduleEntry {
  id: string                    // UUID
  dayOfWeek: number             // 0 = Sunday … 6 = Saturday
  startTime: string             // HH:mm
  durationMinutes: number       // length of power window
  isActive: boolean             // false = schedule disabled for this day
  updatedAt: string             // ISO 8601
}

export interface TestTimeEstimate {
  loincCode: string             // primary key
  displayName: string
  estimatedMinutes: number      // per-batch run time
  requiresPower: boolean        // false = manual / benchtop (no analyzer)
  batchSize: number             // samples per analyzer run
  updatedAt: string             // ISO 8601
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
  // v39 — AI Anomaly Flagging (Story 53.3): structured observation values per result
  lab_observations!: Dexie.Table<LabObservation, string>
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
  // v13 — Shift Handover Protocol (Story 51.1)
  handover_reports!: Dexie.Table<HandoverReport, string>
  shift_sessions!: Dexie.Table<ShiftSession, string>
  // v14 — Amendment & Correction Protocol (Story 43.3)
  amendments!: Dexie.Table<AmendmentRecord, string>
  // v14 — Digital Lab Logbook (Story 42.8)
  labLogbook!: Dexie.Table<LabLogbookEntry, string>
  // v15 — Visual Atlas for Microscopy (Story 53.2)
  atlas_entries!: Dexie.Table<AtlasEntry, string>
  atlas_categories!: Dexie.Table<AtlasCategory, string>
  // v16 — Analyzer Drift Detection (Story 43.6)
  qcRuns!: Dexie.Table<QcRun, string>
  driftAlerts!: Dexie.Table<DriftAlert, string>
  // v17 — Gamified Team Quality Engagement (Story 51.7)
  achievements!: Dexie.Table<Achievement, string>
  team_achievements!: Dexie.Table<TeamAchievement, string>
  achievement_preferences!: Dexie.Table<AchievementPreferences, string>
  achievement_scheduler_config!: Dexie.Table<AchievementSchedulerConfig, string>
  // v18 — Pre-Release Critical Value Checklist (Story 43.7)
  criticalValueThresholds!: Dexie.Table<CriticalValueThreshold, number>
  completedChecklists!: Dexie.Table<CompletedChecklist, string>
  checklistConfig!: Dexie.Table<ChecklistConfig, string>
  // v19 — Personal Quality Streak & Achievement System (Story 46.7)
  quality_streaks!: Dexie.Table<QualityStreak, string>
  quality_metrics!: Dexie.Table<QualityMetric, string>
  badges!: Dexie.Table<Badge, string>
  earned_badges!: Dexie.Table<EarnedBadge, string>
  // v20 — Auto-Compiled HMIS Monthly Report (Story 50.1)
  hmisReports!: Dexie.Table<HmisMonthlyReport, string>
  // v21 — Courier & Sample Transport Tracking (Story 54.3)
  // No PHI: courierId, sampleIds, locationIds are all opaque identifiers.
  transport_sessions!: Dexie.Table<TransportSession, string>
  // v22 — Multi-Donor Report Templates (Story 50.2)
  donorPrograms!: Dexie.Table<import('./donor-types').DonorProgram, string>
  donorReportTemplates!: Dexie.Table<import('./donor-types').DonorReportTemplate, string>
  donorReports!: Dexie.Table<import('./donor-types').DonorReport, string>
  // v24 — Automated Disease Surveillance Alerts (Story 50.3)
  surveillanceAlerts!: Dexie.Table<SurveillanceAlert, string>
  reportableDiseases!: Dexie.Table<ReportableDiseaseConfig, string>
  surveillanceBaselines!: Dexie.Table<SurveillanceBaseline, string>
  surveillanceSchedulerConfig!: Dexie.Table<SurveillanceSchedulerConfig, string>
  // v25 — Certification Pathway Tracker (Story 46.6)
  // No PHI: technicianId is opaque, no patient data in any certification record.
  certification_pathways!: Dexie.Table<CertificationPathway, string>
  technician_progress!: Dexie.Table<TechnicianProgress, string>
  digital_certificates!: Dexie.Table<DigitalCertificate, string>
  supervised_procedures!: Dexie.Table<SupervisedProcedure, string>
  // v26 — Immutable Result Audit Chain (Story 43.1)
  // Append-only audit log for all lab lifecycle events. No PHI — opaque IDs only.
  clientAuditLog!: Dexie.Table<ClientAuditEvent, string>
  // v27 — SMS Fallback for Critical Results (Story 49.2)
  // PHI note: smsQueue contains recipientPhone and messageBody for delivery only — NEVER in audit.
  smsQueue!: Dexie.Table<SmsQueueEntry, number>
  smsGatewayConfig!: Dexie.Table<SmsGatewayConfig, string>
  smsEscalationSchedule!: Dexie.Table<SmsEscalationScheduleEntry, number>
  // v28 — P2P Trusted Devices (Story 49.3)
  // No PHI — deviceId/deviceName are operational only.
  trusted_devices!: Dexie.Table<import('@ultranos/shared-types').TrustedDevice, string>
  // v29 — Conflict Zone Security Protocols (Story 49.4)
  // Persists Security Alert activation state so mode survives browser restart.
  securityAlertState!: Dexie.Table<SecurityAlertStateRecord, number>
  // v32 — Sample Collision Prevention (Story 51.3)
  // No PHI — sampleId and techId are opaque identifiers.
  sample_locks!: Dexie.Table<SampleLock, string>
  // v33 — Workload Balancing Dashboard (Story 51.2)
  // No PHI — techId is opaque; no patient data in workload snapshots or availability records.
  tech_workload_snapshots!: Dexie.Table<TechWorkloadSnapshot, string>
  tech_availability!: Dexie.Table<TechAvailability, string>
  // v31 — RAG Readiness Board (Story 51.5)
  supply_inventory!: Dexie.Table<SupplyItem, string>
  instruments!: Dexie.Table<Instrument, string>
  lab_config!: Dexie.Table<LabConfig, string>
  // v34 — Equipment Booking & Scheduling (Story 51.4)
  instrument_queue!: Dexie.Table<QueuedBatch, string>
  instrument_history!: Dexie.Table<InstrumentHistoryEntry, string>
  instrument_notifications!: Dexie.Table<InstrumentNotification, string>
  // v35 — Power-Aware Workload Scheduler (Story 48.1)
  power_schedules!: Dexie.Table<PowerScheduleEntry, string>
  test_time_estimates!: Dexie.Table<TestTimeEstimate, string>
  // v36 — CHW Collection Module (Story 54.2)
  chw_samples!: Dexie.Table<CHWSampleCollection, string>
  courier_handoffs!: Dexie.Table<CourierHandoff, string>
  // v37 — External Reference Lab Integration (Story 54.4)
  reference_labs!: Dexie.Table<ReferenceLab, string>
  send_outs!: Dexie.Table<SendOut, string>
  send_out_transitions!: Dexie.Table<SendOutStatusTransition, string>
  // v38 — Multi-Branch Lab Network (Story 54.1)
  // network_snapshots: per-location connectivity/operational snapshot set during sync.
  // No PHI — locationId is an opaque UUID; snapshot contains counts and connectivity state only.
  network_snapshots!: Dexie.Table<NetworkStatusSnapshot, string>
  // v39 — Tele-Consultation Request Builder (Story 53.4)
  // No PHI — sampleId, requestId, and recipientId are opaque UUIDs (CLAUDE.md Rule #7).
  consultation_requests!: Dexie.Table<ConsultationRequest, string>
  consultation_responses!: Dexie.Table<ConsultationResponse, string>
  consultation_recipients!: Dexie.Table<ConsultationRecipient, string>
  // v41 — Contextual Knowledge Cards (Story 53.1)
  // No PHI — cards are static physician-authored references; trigger_rules are deterministic
  // threshold definitions. Neither table stores patient data or result values.
  knowledge_cards!: Dexie.Table<KnowledgeCard, string>
  trigger_rules!: Dexie.Table<TriggerRule, string>
  // v43 — Public Health Guidance (Story 53.7)
  // No PHI — static physician-authored guidance content and deterministic trigger rules.
  guidance_content!: Dexie.Table<GuidanceContent, string>
  guidance_triggers!: Dexie.Table<GuidanceTrigger, string>
  // v42 — AI Provenance Trail (Story 53.6)
  // No PHI — inputDescription is structural only; sampleId is an opaque UUID.
  // hlcTimestamp indexed for chain ordering; timestamp indexed for date-range UI queries.
  ai_provenance!: Dexie.Table<any, string>

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
    // v14 — Shift Handover + Amendment Protocol (Stories 51.1, 43.3, 42.8)
    this.version(14).stores({
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
      // New in v14 (Stories 51.1, 43.3, 42.8):
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      // New in v14 (Story 43.3 + 42.8):
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
    })
    // v15 — Visual Atlas for Microscopy (Story 53.2)
    this.version(15).stores({
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
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
      // New in v15 — Visual Atlas (Story 53.2):
      atlas_entries: '&id, categoryId, subcategoryId, *tags, version',
      atlas_categories: '&id',
    })
    // v16 — Analyzer Drift Detection (Story 43.6)
    // QC data is local-first: stored in Dexie, synced to Hub for backup.
    // No PHI — QC runs are instrument control data, not patient data.
    this.version(16).stores({
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
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
      atlas_entries: '&id, categoryId, subcategoryId, *tags, version',
      atlas_categories: '&id',
      // New in v16 — Analyzer Drift Detection (Story 43.6):
      qcRuns: '&id, analyte, loincCode, instrumentId, runDate, [analyte+instrumentId+controlLevel]',
      driftAlerts: '&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt, [analyte+instrumentId+controlLevel]',
    })
    // v17 — Gamified Team Quality Engagement (Story 51.7)
    // No PHI: achievement records reference tech IDs and operational metrics only.
    // Tier 3 (Operational) sync — see CLAUDE.md sync tier table.
    this.version(17).stores({
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
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
      atlas_entries: '&id, categoryId, subcategoryId, *tags, version',
      atlas_categories: '&id',
      qcRuns: '&id, analyte, loincCode, instrumentId, runDate, [analyte+instrumentId+controlLevel]',
      driftAlerts: '&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt, [analyte+instrumentId+controlLevel]',
      // New in v17 — Gamified Team Quality Engagement (Story 51.7):
      achievements: '&id, techId, type, [techId+type], [type+evaluationPeriod]',
      team_achievements: '&id, type, earnedAt, evaluationPeriod',
      achievement_preferences: '&techId',
      achievement_scheduler_config: '&id',
    })
    // v18 — Pre-Release Critical Value Checklist (Story 43.7)
    // criticalValueThresholds: lab-specific overrides; defaults seeded on first install.
    // completedChecklists: append-only audit record per result release with critical values.
    // checklistConfig: per-lab customization of checklist items.
    // No PHI — analyte names are clinical config, resultId is opaque, patientRef never stored.
    this.version(18).stores({
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
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
      atlas_entries: '&id, categoryId, subcategoryId, *tags, version',
      atlas_categories: '&id',
      qcRuns: '&id, analyte, loincCode, instrumentId, runDate, [analyte+instrumentId+controlLevel]',
      driftAlerts: '&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt, [analyte+instrumentId+controlLevel]',
      achievements: '&id, techId, type, [techId+type], [type+evaluationPeriod]',
      team_achievements: '&id, type, earnedAt, evaluationPeriod',
      achievement_preferences: '&techId',
      achievement_scheduler_config: '&id',
      // New in v18 — Pre-Release Critical Value Checklist (Story 43.7):
      criticalValueThresholds: '++id, &loincCode, analyte, isActive',
      completedChecklists: '&id, resultId, completedAt',
      checklistConfig: '&id, labId',
    }).upgrade(async (tx) => {
      // Seed default thresholds only if table is empty (preserves lab overrides on re-upgrade)
      const existing = await tx.table('criticalValueThresholds').count()
      if (existing === 0) {
        await tx.table('criticalValueThresholds').bulkAdd(
          DEFAULT_CRITICAL_THRESHOLDS.map((t) => ({ ...t, id: undefined })),
        )
      }
    })
    // v19 — Personal Quality Streak & Achievement System (Story 46.7)
    // Self-reinforcement: no PHI, no comparative data, no leaderboards.
    this.version(19).stores({
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
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
      atlas_entries: '&id, categoryId, subcategoryId, *tags, version',
      atlas_categories: '&id',
      qcRuns: '&id, analyte, loincCode, instrumentId, runDate, [analyte+instrumentId+controlLevel]',
      driftAlerts: '&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt, [analyte+instrumentId+controlLevel]',
      achievements: '&id, techId, type, [techId+type], [type+evaluationPeriod]',
      team_achievements: '&id, type, earnedAt, evaluationPeriod',
      achievement_preferences: '&techId',
      achievement_scheduler_config: '&id',
      criticalValueThresholds: '++id, &loincCode, analyte, isActive',
      completedChecklists: '&id, resultId, completedAt',
      checklistConfig: '&id, labId',
      // New in v19 — Personal Quality Streak & Achievement System (Story 46.7):
      quality_streaks: '&id, technicianId, streakType, [technicianId+streakType]',
      quality_metrics: '&id, technicianId, metricType, period, [technicianId+period]',
      badges: '&id, category',
      earned_badges: '&id, technicianId, badgeId, earnedAt, syncStatus',
    })

    // v20 — Auto-Compiled HMIS Monthly Report (Story 50.1)
    // Aggregate-only statistics — no PHI stored.
    // Indexed for month/year lookup, status filtering, and sync queue queries.
    this.version(20).stores({
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
      handover_reports: '&id, outgoingTechId, incomingTechId, status, createdAt, shiftDate',
      shift_sessions: '&id, techId, startedAt, endedAt, status',
      amendments: '&id, originalReportId, amendedReportId, initiatedAt',
      labLogbook: '&id, seqNo, diagnosticReportId, date, syncStatus, entryType',
      atlas_entries: '&id, categoryId, subcategoryId, *tags, version',
      atlas_categories: '&id',
      qcRuns: '&id, analyte, loincCode, instrumentId, runDate, [analyte+instrumentId+controlLevel]',
      driftAlerts: '&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt, [analyte+instrumentId+controlLevel]',
      achievements: '&id, techId, type, [techId+type], [type+evaluationPeriod]',
      team_achievements: '&id, type, earnedAt, evaluationPeriod',
      achievement_preferences: '&techId',
      achievement_scheduler_config: '&id',
      criticalValueThresholds: '++id, &loincCode, analyte, isActive',
      completedChecklists: '&id, resultId, completedAt',
      checklistConfig: '&id, labId',
      quality_streaks: '&id, technicianId, streakType, [technicianId+streakType]',
      quality_metrics: '&id, technicianId, metricType, period, [technicianId+period]',
      badges: '&id, category',
      earned_badges: '&id, technicianId, badgeId, earnedAt, syncStatus',
      // New in v20 — HMIS Monthly Report (Story 50.1)
      hmisReports: '&id, [reportYear+reportMonth], status, finalizedAt, syncStatus',
    })
    // v21 — Courier & Sample Transport Tracking (Story 54.3)
    // No PHI: courierId, sampleIds, locationIds are all opaque identifiers.
    // transport_sessions indexed by courierId and status for active-transport queries.
    this.version(21).stores({
      transport_sessions: '&id, courierId, status, [courierId+status], pickupTimestamp',
    })
    // v22 — Multi-Donor Report Templates (Story 50.2)
    this.version(22).stores({
      donorPrograms: '&id, &programCode, status, templateCode',
      donorReportTemplates: '&templateCode, reportingFrequency',
      donorReports: '&id, programCode, status, periodStart, periodEnd, generatedAt',
    })
    // v23 — no-op placeholder (Story 50.3 uses v24)
    this.version(23).stores({})
    // v24 — Automated Disease Surveillance Alerts (Story 50.3)
    this.version(24).stores({
      surveillanceAlerts: '&id, alertType, diseaseCode, createdAt, transmissionStatus, [diseaseCode+alertType]',
      reportableDiseases: '&diseaseCode, isActive',
      surveillanceBaselines: '&id, diseaseCode, asOfDate, [diseaseCode+asOfDate]',
      surveillanceSchedulerConfig: '&id',
    })
    // v25 — Certification Pathway Tracker (Story 46.6)
    // certification_pathways: pathway definitions pulled from Hub; jurisdictionCode for locale filtering.
    // technician_progress: local-first progress aggregated from modules, competencies, supervised procedures.
    // digital_certificates: certificate metadata + Blob; Blob not synced, metadata synced to Hub registry.
    // supervised_procedures: supervisor-confirmed procedure log (no patient data — LOINC codes only).
    // No PHI in any of these tables.
    this.version(25).stores({
      certification_pathways: '&id, jurisdictionCode, version',
      technician_progress: '&id, technicianId, pathwayId, [technicianId+pathwayId]',
      digital_certificates: '&id, technicianId, pathwayId, issuedAt, syncStatus',
      supervised_procedures: '&id, technicianId, procedureRef, performedAt, syncStatus',
    })
    // v26 — Immutable Result Audit Chain (Story 43.1)
    // clientAuditLog: append-only audit events for the full lab sample lifecycle.
    // Indexed for FIFO drain and status-based queries by the AuditDrainWorker.
    // No PHI — all metadata fields are opaque IDs and action codes only.
    this.version(26).stores({
      clientAuditLog: 'id, status, queuedAt, [status+queuedAt]',
    })
    // v27 — SMS Fallback for Critical Results (Story 49.2)
    // smsQueue: offline SMS delivery queue with rate limiting indexes.
    // smsGatewayConfig: singleton config for SMS provider credentials (encrypted at rest).
    // smsEscalationSchedule: durable escalation timers (survive tab close).
    this.version(27).stores({
      smsQueue: '++id, status, confirmCode, criticalResultRef, [criticalResultRef+escalationStep], createdAt',
      smsGatewayConfig: 'id',
      smsEscalationSchedule: '++id, criticalResultRef, escalationStep, scheduledAt, fired',
    })
    // v28 — P2P Trusted Devices (Story 49.3)
    // Stores paired device records for skip-pairing on reconnect. No PHI.
    this.version(28).stores({
      trusted_devices: 'deviceId, appType',
    })
    // v29 — Conflict Zone Security Protocols (Story 49.4)
    // securityAlertState: singleton record persisting Security Alert activation across restarts.
    // No PHI — stores activation metadata only (userId, timestamps, checklist state).
    this.version(29).stores({
      securityAlertState: '&id',
    })
    // v30 — Fix dailyLogs indexes (Story 50.4 code review): index actual fields from
    // DailyActivityLog (logDate, generatedBy, status) and add unique constraint on logDate
    // to prevent duplicate auto-generation across concurrent tabs.
    this.version(30).stores({
      dailyLogs: '&id, &logDate, generatedBy, status',
    })
    // v31 — RAG Readiness Board (Story 51.5)
    // supply_inventory: manually maintained stock counts for consumables & reagents.
    // instruments: operational instrument list with maintenance tracking.
    // lab_config: key-value store for lab-level operational settings (e.g. minimumStaffing).
    // No PHI — operational data only.
    this.version(31).stores({
      supply_inventory: '&id, name, category',
      instruments: '&id, name, status, nextMaintenanceDue',
      lab_config: '&key',
    })
    // v32 — Sample Collision Prevention (Story 51.3)
    // sample_locks: one record per sample; primary key is sampleId for direct lookup.
    // Indexed by techId + status + lockedAt + expiresAt per spec Task 1.
    this.version(32).stores({
      sample_locks: '&sampleId, techId, status, lockedAt, expiresAt, [techId+status]',
    })
    // v33 — Workload Balancing Dashboard (Story 51.2)
    // tech_workload_snapshots: indexed by [techId+shiftDate] for per-tech history queries.
    // tech_availability: indexed by techId + endedAt for "open records" queries (endedAt null).
    this.version(33).stores({
      tech_workload_snapshots: '&id, techId, shiftDate, [techId+shiftDate]',
      tech_availability: '&id, techId, endedAt, [techId+endedAt]',
    })
    // v34 — Equipment Booking & Scheduling (Story 51.4)
    // instrument_queue: active batch queue per instrument. Compound index [instrumentId+position]
    //   enables efficient ordered queries for a single instrument's queue.
    // instrument_history: append-only run history. Indexed by instrumentId for rolling-avg queries.
    // instrument_notifications: next-in-line alerts per tech. Indexed by techId for quick lookup.
    // No PHI — techId/sampleIds are opaque operational identifiers; no patient demographics.
    this.version(34).stores({
      instrument_queue: '&id, instrumentId, techId, status, position, [instrumentId+position], [instrumentId+status]',
      instrument_history: '&id, instrumentId, techId, completedAt, [instrumentId+completedAt]',
      instrument_notifications: '&id, techId, instrumentId, dismissed, [techId+dismissed]',
    })
    // v35 — Power-Aware Workload Scheduler (Story 48.1)
    // power_schedules: one record per weekday. dayOfWeek indexed for getActiveScheduleForDay lookup.
    // test_time_estimates: keyed by loincCode; all fields indexed for scheduler queries.
    // No PHI — operational scheduling data only.
    this.version(35).stores({
      power_schedules: '&id, dayOfWeek, isActive',
      test_time_estimates: '&loincCode, requiresPower',
    })
    // v36 — CHW Collection Module (Story 54.2)
    // chw_samples: one record per collected sample; syncStatus index for pending-drain queries.
    // courier_handoffs: one record per courier pickup; syncStatus index for pending-drain queries.
    // No PHI beyond firstName + age (CLAUDE.md Rule #7 compliance enforced at service layer).
    this.version(36).stores({
      chw_samples: '&id, patientRef, sampleType, labelNumber, collectedAt, syncStatus',
      courier_handoffs: '&id, courierId, pickupTimestamp, syncStatus',
    })
    // v37 — External Reference Lab Integration (Story 54.4)
    // reference_labs: configurable registry of external labs; isActive index for active-only queries.
    // send_outs: full lifecycle of samples sent externally; status + referenceLabId indexes for TAT queries.
    // send_out_transitions: append-only status audit trail per send-out.
    // No PHI beyond sampleId (opaque UUID) — patient identity never stored here (CLAUDE.md Rule #7).
    this.version(37).stores({
      reference_labs: '&id, name, isActive',
      send_outs: '&id, sampleId, referenceLabId, status, sentAt',
      send_out_transitions: '&id, sendOutId, timestamp',
    })
    // v38 — Multi-Branch Lab Network index fixes (Story 54.1 code review)
    // - uploadQueue: adds locationId index for per-location pending/failed count queries.
    // - orders: adds receivedAt index so today's sample queries can use Dexie index instead of full scan.
    // - network_snapshots: new table for per-location connectivity/operational snapshots set during sync.
    // No PHI — locationId is opaque UUID; orders index is on a timestamp field only.
    this.version(38).stores({
      uploadQueue: '++id, status, queuedAt, locationId',
      orders: '&orderId, status, urgency, patientRef, authoredOn, receivedAt',
      network_snapshots: '&locationId',
    })
    // v39 — Tele-Consultation Request Builder (Story 53.4)
    // consultation_requests: indexed by sampleId (to query by result), syncStatus (pending drain), status (lifecycle).
    // consultation_responses: indexed by requestId (join from request to its response).
    // consultation_recipients: indexed by type ('pathologist' | 'reference_lab') for filtered queries.
    // No PHI — sampleId, requestId, and recipientId are opaque UUIDs.
    this.version(39).stores({
      consultation_requests: '&id, sampleId, syncStatus, status, createdAt',
      consultation_responses: '&id, requestId, receivedAt',
      consultation_recipients: '&id, type',
    })
    // v40 — AI Anomaly Flagging (Story 53.3 code review patch)
    // Adds lab_observations table for per-field structured result values (delta detection).
    // Re-indexes lab_results with patientRef so getPriorResult() can use indexed query.
    // No PHI — patientRef is opaque Patient/{uuid}; fieldCode and numeric value only.
    this.version(40).stores({
      lab_observations: '&id, resultId',
      lab_results: '&id, loincCode, enteredBy, enteredAt, status, patientRef',
    })
    // v41 — Contextual Knowledge Cards (Story 53.1)
    // knowledge_cards: unique key on id; severity indexed for UI filtering; tags multi-entry index.
    // trigger_rules: unique key on id; cardId indexed for rule→card join in seedKnowledgeCards.
    // No PHI — static physician-authored references and deterministic threshold rules only.
    this.version(41).stores({
      knowledge_cards: '&id, version, severity, *tags',
      trigger_rules: '&id, cardId',
    })
    // v42 — AI Provenance Trail (Story 53.6)
    // ai_provenance: append-only hash-chained records for every AI-assisted clinical decision.
    // - hlcTimestamp indexed for chain ordering (monotonic across offline devices).
    // - timestamp indexed for user-facing date-range queries.
    // - syncStatus indexed for pending-record drain queries.
    // - [hlcTimestamp+sourceFeature] compound index for per-feature chain queries.
    // No PHI — inputDescription is structural only; sampleId is an opaque UUID.
    this.version(42).stores({
      ai_provenance: '&id, hlcTimestamp, timestamp, syncStatus, sourceFeature, sampleId, [hlcTimestamp+sourceFeature]',
    })
    // v43 — Public Health Guidance (Story 53.7)
    // guidance_content: physician-authored guidance per condition; conditionCode indexed for trigger
    //   engine lookup; version indexed for update-on-upgrade logic in seedGuidance().
    // guidance_triggers: deterministic trigger rules mapping result field values to condition codes.
    //   conditionCode + templateLoincCode indexed for filtered lookups.
    // No PHI — static physician-authored content and threshold rules only.
    this.version(43).stores({
      guidance_content: '&id, conditionCode, version',
      guidance_triggers: '&id, conditionCode, templateLoincCode',
    })
  }
}

let dbInstance: LabLiteDatabase | null = null

export function getDb(): LabLiteDatabase {
  if (!dbInstance) {
    dbInstance = new LabLiteDatabase()
    // Auto-install the read-only guard (Story 49.4) — idempotent, safe to call multiple times.
    import('@/lib/security/read-only-guard').then(({ installReadOnlyGuard }) => {
      if (dbInstance) installReadOnlyGuard(dbInstance)
    }).catch(() => { /* best-effort — guard is a defense-in-depth layer */ })
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
  loincCode?: string      // procedure identifier — used by trigger engine + anomaly detection
  patientRef?: string     // opaque Patient/{uuid} — used only for prior-result lookup (Story 53.3)
  reportComment?: string  // optional free-text comment on the result
}

/**
 * Structured observation (field-level) record for a lab result.
 * One record per analyte per result. Indexed by resultId for fast lookup.
 * PHI guard: fieldCode is a template code; value is numeric. No patient identifiers stored here.
 */
export interface LabObservation {
  id: string              // UUID
  resultId: string        // FK to LabResult.id
  fieldCode: string       // template field code (e.g. 'wbc', 'hgb', 'platelets')
  value: number | string | null  // observed value (number for quantitative analytes)
  flag?: 'L' | 'H' | 'LL' | 'HH' | 'A' | null  // reference-range flag
  unit?: string           // unit of measure (e.g. 'g/dL', '×10³/µL')
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

/** Retrieve a daily log by date (YYYY-MM-DD). Uses logDate index (v30+). */
export async function getDailyLogByDate(date: string): Promise<DailyActivityLog | undefined> {
  const db = getDb()
  return db.dailyLogs.where('logDate').equals(date).first()
}

/** Retrieve daily logs within a date range (inclusive, YYYY-MM-DD). Ordered newest first. */
export async function getDailyLogsByDateRange(
  from: string,
  to: string,
): Promise<DailyActivityLog[]> {
  const db = getDb()
  const logs = await db.dailyLogs.where('logDate').between(from, to, true, true).toArray()
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

/**
 * Return the most recent draft result for a given sample, or null if none exists.
 * Used by the result entry page to pre-populate an in-progress entry.
 */
export async function getDraftResultForSample(sampleId: string): Promise<LabResult | null> {
  const db = getDb()
  const drafts = await db.lab_results
    .where('sampleId')
    .equals(sampleId)
    .filter((r) => r.status === 'draft')
    .toArray()
  if (drafts.length === 0) return null
  // Return most recently entered draft (descending enteredAt)
  return drafts.sort((a, b) => (b.enteredAt < a.enteredAt ? -1 : 1))[0] ?? null
}

/**
 * Return all observations for a given result ID.
 * PHI guard: returns field codes and numeric values only — no patient identifiers.
 */
export async function getObservationsForResult(resultId: string): Promise<LabObservation[]> {
  const db = getDb()
  return db.lab_observations.where('resultId').equals(resultId).toArray()
}

/**
 * Bulk-upsert observations for a result (replaces any existing observations with the same ID).
 * Called by the result entry page after saving a result.
 */
export async function putLabObservations(observations: LabObservation[]): Promise<void> {
  if (observations.length === 0) return
  const db = getDb()
  await db.lab_observations.bulkPut(observations)
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

/** Return the stored network snapshot for a location, or undefined if none exists yet. */
export async function getNetworkSnapshot(locationId: string): Promise<NetworkStatusSnapshot | undefined> {
  const db = getDb()
  return db.network_snapshots.get(locationId)
}

/** Upsert a network snapshot for a location (called during sync). */
export async function putNetworkSnapshot(snapshot: NetworkStatusSnapshot): Promise<void> {
  const db = getDb()
  await db.network_snapshots.put(snapshot)
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
 * Wrapped in a Dexie transaction to prevent TOCTOU races across tabs.
 */
export async function checkAndRolloverCycle(): Promise<boolean> {
  const db = getDb()
  return db.transaction('rw', db.dataBudgetConfig, async () => {
    const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
    const config = stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
    const today = new Date()
    const cycleStart = new Date(config.currentCycleStart)

    // Has a full calendar month passed since cycle start?
    const nextCycleDate = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth() + 1,
      Math.min(config.billingCycleDay, 28), // clamp to 28 for safety
    )

    if (today >= nextCycleDate) {
      const newCycleStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        Math.min(config.billingCycleDay, 28),
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
  })
}

// ---------------------------------------------------------------------------
// Handover helpers (v13) — Story 51.1
// ---------------------------------------------------------------------------

export async function putHandoverReport(report: HandoverReport): Promise<void> {
  const db = getDb()
  await db.handover_reports.put(report)
}

export async function getHandoverReport(id: string): Promise<HandoverReport | undefined> {
  const db = getDb()
  return db.handover_reports.get(id)
}

export async function getPendingHandoverReports(): Promise<HandoverReport[]> {
  const db = getDb()
  return db.handover_reports.where('status').equals('PENDING').toArray()
}

export async function getAllHandoverReports(): Promise<HandoverReport[]> {
  const db = getDb()
  return db.handover_reports.orderBy('createdAt').reverse().toArray()
}

export async function putShiftSession(session: ShiftSession): Promise<void> {
  const db = getDb()
  await db.shift_sessions.put(session)
}

export async function getActiveShiftSession(techId: string): Promise<ShiftSession | undefined> {
  const db = getDb()
  return db.shift_sessions
    .where('[techId+status]')
    .equals([techId, 'ACTIVE'])
    .first()
    .catch(() =>
      db.shift_sessions
        .where('techId')
        .equals(techId)
        .filter((s) => s.status === 'ACTIVE')
        .first(),
    )
}

// ---------------------------------------------------------------------------
// Lab Logbook types (v14) — Story 42.8: Digital Lab Logbook
// Clinical data — stored locally, synced to Hub.
// patientFirstName is stored (data minimization: first name only, CLAUDE.md Rule #7).
// ---------------------------------------------------------------------------

export interface LabLogbookEntry {
  id: string
  seqNo: number
  facilityPrefix: string
  displayNumber: string
  date: string                   // ISO date YYYY-MM-DD
  patientRef: string             // opaque Patient/{uuid}
  patientFirstName: string       // first name only — CLAUDE.md Rule #7
  patientAge: number
  testType: string               // LOINC display name
  testLoincCode: string
  resultSummary: string          // clinical data — stored locally, never logged
  resultCode?: 'positive' | 'negative' | 'indeterminate'  // structured result classification (Story 50.2 review patch)
  technicianId: string
  technicianName: string
  authorizerId: string
  authorizerName: string
  authorizationStatus: 'authorized' | 'amended'
  authorizedAt: string           // ISO 8601
  diagnosticReportId: string
  entryType: 'original' | 'amendment'
  amendmentOf?: string           // set when entryType='amendment'
  amendmentReason?: string       // set when entryType='amendment'
  createdAt: string              // ISO 8601
  syncStatus: 'pending' | 'synced' | 'failed'
  programTags?: string[]         // v22 — donor program codes (Story 50.2)
  submittedBy?: string           // alias for technicianId for backward compatibility
  facilityId?: string
  updatedAt?: string
}

// ---------------------------------------------------------------------------
// Lab Logbook helpers (v14) — Story 42.8: Digital Lab Logbook
// Append-only: entries are never modified or deleted after creation.
// ---------------------------------------------------------------------------

/** Append a new logbook entry (original). */
export async function appendLogbookEntry(entry: LabLogbookEntry): Promise<void> {
  const db = getDb()
  await db.labLogbook.add(entry)
}

/** Append a logbook amendment entry. */
export async function appendLogbookAmendment(
  entry: LabLogbookEntry & { entryType: 'amendment'; amendmentOf: string; amendmentReason: string },
): Promise<void> {
  const db = getDb()
  await db.labLogbook.add(entry)
}

/** Look up a logbook entry by diagnosticReportId (original entries only). Returns undefined if not found. */
export async function getLogbookEntryByDiagnosticReportId(
  diagnosticReportId: string,
): Promise<LabLogbookEntry | undefined> {
  const db = getDb()
  const results = await db.labLogbook
    .where('diagnosticReportId')
    .equals(diagnosticReportId)
    .filter((e) => e.entryType === 'original')
    .toArray()
  return results[0]
}

/** Return all logbook entries ordered by seqNo ascending. */
export async function getAllLogbookEntries(): Promise<LabLogbookEntry[]> {
  const db = getDb()
  return db.labLogbook.orderBy('seqNo').toArray()
}

// ---------------------------------------------------------------------------
// Visual Atlas helpers (v15) — Story 53.2
// ---------------------------------------------------------------------------

/** Returns true if semver string `a` is strictly newer than `b`. */
export function semverIsNewer(a: string, b: string): boolean {
  const parse = (s: string) => s.split('.').map((n) => parseInt(n, 10) || 0)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj > bMaj
  if (aMin !== bMin) return aMin > bMin
  return aPat > bPat
}

/**
 * Seed the atlas tables with built-in category/entry data.
 * Version-checks each entry before upserting — only updates if the
 * bundled version is newer than what's already stored offline.
 * Never throws — atlas seeding failures must not break the app.
 */
export async function seedAtlas(): Promise<void> {
  try {
    const { ALL_SEED_ENTRIES } = await import('@/lib/atlas-seed-data')
    const { ATLAS_CATEGORY_TREE } = await import('@/lib/visual-atlas')
    const db = getDb()
    for (const category of ATLAS_CATEGORY_TREE) {
      await db.atlas_categories.put(category)
    }
    for (const entry of ALL_SEED_ENTRIES) {
      const stored = await db.atlas_entries.get(entry.id)
      if (!stored || semverIsNewer(entry.version, stored.version)) {
        await db.atlas_entries.put(entry)
      }
    }
  } catch {
    // Never throw — atlas seeding failures must not break the app
  }
}

// ---------------------------------------------------------------------------
// Achievement helpers (v17) — Story 51.7: Gamified Team Quality Engagement
// ---------------------------------------------------------------------------

/** Put (upsert) an individual achievement. */
export async function putAchievement(achievement: Achievement): Promise<void> {
  const db = getDb()
  await db.achievements.put(achievement)
}

/** Bulk-put achievement records (used by evaluation engine). */
export async function putAchievements(records: Achievement[]): Promise<void> {
  const db = getDb()
  await db.achievements.bulkPut(records)
}

/** Get all achievements for a specific tech (for portfolio). */
export async function getAchievementsForTech(techId: string): Promise<Achievement[]> {
  const db = getDb()
  return db.achievements.where('techId').equals(techId).toArray()
}

/** Check if an achievement of a given type already exists for a period (dedup guard). */
export async function getAchievementByPeriod(
  type: AchievementType,
  evaluationPeriod: string,
  techId?: string,
): Promise<Achievement | undefined> {
  const db = getDb()
  if (techId) {
    const results = await db.achievements
      .where('[type+evaluationPeriod]')
      .equals([type, evaluationPeriod])
      .filter((a) => a.techId === techId)
      .toArray()
    return results[0]
  }
  return db.achievements
    .where('[type+evaluationPeriod]')
    .equals([type, evaluationPeriod])
    .first()
}

/** Put (upsert) a team achievement. */
export async function putTeamAchievement(achievement: TeamAchievement): Promise<void> {
  const db = getDb()
  await db.team_achievements.put(achievement)
}

/** Get team achievements ordered by earnedAt descending. */
export async function getTeamAchievements(months: number): Promise<TeamAchievement[]> {
  const db = getDb()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffIso = cutoff.toISOString()
  const all = await db.team_achievements.orderBy('earnedAt').reverse().toArray()
  return all.filter((a) => a.earnedAt >= cutoffIso)
}

/** Check if a team achievement already exists for a given type+period (dedup guard). */
export async function getTeamAchievementByPeriod(
  type: AchievementType,
  evaluationPeriod: string,
): Promise<TeamAchievement | undefined> {
  const db = getDb()
  return db.team_achievements
    .where('[type+evaluationPeriod]')
    .equals([type, evaluationPeriod])
    .first()
}

/** Get all team achievements of a specific type (for milestone dedup). */
export async function getTeamAchievementsByType(type: AchievementType): Promise<TeamAchievement[]> {
  const db = getDb()
  return db.team_achievements.where('type').equals(type).toArray()
}

/** Get achievement preferences for a tech (returns default if not set). */
export async function getAchievementPreferences(techId: string): Promise<AchievementPreferences> {
  const db = getDb()
  const prefs = await db.achievement_preferences.get(techId)
  return prefs ?? { techId, showOnTeamDashboard: true }
}

/** Save achievement preferences for a tech. */
export async function putAchievementPreferences(prefs: AchievementPreferences): Promise<void> {
  const db = getDb()
  await db.achievement_preferences.put(prefs)
}

/** Get the achievement scheduler config singleton. */
export async function getAchievementSchedulerConfig(): Promise<AchievementSchedulerConfig> {
  const db = getDb()
  const config = await db.achievement_scheduler_config.get('achievement-scheduler')
  return config ?? {
    id: 'achievement-scheduler',
    lastMonthlyEvaluation: null,
    lastWeeklyEvaluation: null,
    lastMilestoneCheck: null,
    gamificationEnabled: false,
  }
}

/** Save the achievement scheduler config singleton. */
export async function putAchievementSchedulerConfig(
  config: AchievementSchedulerConfig,
): Promise<void> {
  const db = getDb()
  await db.achievement_scheduler_config.put(config)
}

// ---------------------------------------------------------------------------
// Critical Value Threshold helpers (v18) — Story 43.7
// No PHI — analyte names and LOINC codes are clinical configuration, not patient data.
// ---------------------------------------------------------------------------

/**
 * Retrieve a critical value threshold for a given (loincCode, analyte) pair.
 * Used by the critical value engine (Story 48.4) and the pre-release checklist (Story 43.7).
 *
 * Returns undefined when no matching active threshold exists.
 * Never throws — callers must handle undefined and treat as "not configured".
 */
export async function getCriticalThresholdByAnalyte(
  loincCode: string,
  analyte: string,
): Promise<CriticalValueThreshold | undefined> {
  const db = getDb()
  // Try LOINC-primary lookup first (most precise)
  const byLoinc = await db.criticalValueThresholds.where('loincCode').equals(loincCode).first()
  if (byLoinc) return byLoinc
  // Fallback: match by analyte name (covers cases where LOINC codes differ across instruments)
  const byAnalyte = await db.criticalValueThresholds.where('analyte').equals(analyte).first()
  return byAnalyte
}

/** Upsert a critical value threshold (lab override). */
export async function putCriticalValueThreshold(
  threshold: Omit<CriticalValueThreshold, 'id'>,
): Promise<void> {
  const db = getDb()
  const existing = await db.criticalValueThresholds.where('loincCode').equals(threshold.loincCode).first()
  if (existing?.id != null) {
    await db.criticalValueThresholds.update(existing.id, threshold)
  } else {
    await db.criticalValueThresholds.add(threshold as CriticalValueThreshold)
  }
}

/** Return all active critical value thresholds. */
export async function getAllCriticalValueThresholds(): Promise<CriticalValueThreshold[]> {
  const db = getDb()
  return db.criticalValueThresholds.where('isActive').equals(1).toArray()
}

// ---------------------------------------------------------------------------
// Completed Checklist helpers (v18) — Story 43.7
// completedChecklists is append-only per CLAUDE.md audit rules.
// resultId is opaque — no PHI stored directly.
// ---------------------------------------------------------------------------

/** Store a completed checklist. Append-only — never updated. */
export async function addCompletedChecklist(checklist: CompletedChecklist): Promise<void> {
  const db = getDb()
  await db.completedChecklists.add(checklist)
}

/** Retrieve the completed checklist for a given result. */
export async function getCompletedChecklistForResult(
  resultId: string,
): Promise<CompletedChecklist | undefined> {
  const db = getDb()
  return db.completedChecklists.where('resultId').equals(resultId).first()
}

// ---------------------------------------------------------------------------
// Checklist Config helpers (v18) — Story 43.7 (AC #4 — configurable per lab)
// ---------------------------------------------------------------------------

/** Load the lab's checklist configuration, or undefined if not yet configured. */
export async function getChecklistConfig(): Promise<ChecklistConfig | undefined> {
  const db = getDb()
  return db.checklistConfig.get('config')
}

/** Save (insert or replace) the lab's checklist configuration. */
export async function putChecklistConfig(config: ChecklistConfig): Promise<void> {
  const db = getDb()
  await db.checklistConfig.put(config)
}

// ---------------------------------------------------------------------------
// HMIS Monthly Report helpers (v20) — Story 50.1
// Aggregate-only statistics — no PHI stored in any of these helpers.
// ---------------------------------------------------------------------------

/** Save (insert or replace) an HMIS monthly report. */
export async function saveHmisReport(report: HmisMonthlyReport): Promise<void> {
  const db = getDb()
  await db.hmisReports.put(report)
}

/** Get a single HMIS report by id. Returns undefined if not found. */
export async function getHmisReport(id: string): Promise<HmisMonthlyReport | undefined> {
  const db = getDb()
  return db.hmisReports.get(id)
}

/** Get all HMIS reports for a given year, ordered by month ascending. */
export async function getHmisReportsByYear(year: number): Promise<HmisMonthlyReport[]> {
  const db = getDb()
  return db.hmisReports.where('reportYear').equals(year).sortBy('reportMonth')
}

/**
 * Finalize an HMIS report.
 * - Transitions status from 'draft' → 'finalized'
 * - Records finalizedBy and finalizedAt
 * - Enqueues the report for Hub sync (Tier 3 — operational data, LWW)
 * - Throws if report not found or already finalized
 */
export async function finalizeHmisReport(id: string, finalizedBy: string): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.transaction('rw', [db.hmisReports, db.syncQueue], async () => {
    const report = await db.hmisReports.get(id)
    if (!report) throw new Error(`HMIS report not found: ${id}`)
    if (report.status === 'finalized') {
      throw new Error(`HMIS report ${id} is already finalized`)
    }
    const updated = {
      ...report,
      status: 'finalized' as const,
      finalizedBy,
      finalizedAt: now,
    }
    await db.hmisReports.put(updated)

    // Enqueue for Hub sync inside the same transaction
    await enqueueSyncEvent({
      resourceType: 'HmisReport',
      resourceId: id,
      status: 'pending',
      payload: updated,
      createdAt: now,
      lastAttemptAt: null,
      retryCount: 0,
    })
  })
}

// ---------------------------------------------------------------------------
// Transport Session helpers (v21) — Story 54.3: Courier & Sample Transport Tracking
// No PHI: courierId, sampleIds, locationIds are all opaque identifiers.
// ---------------------------------------------------------------------------

/** Save a new transport session. */
export async function createTransportSession(session: TransportSession): Promise<void> {
  const db = getDb()
  await db.transport_sessions.put(session)
}

/** Look up a transport session by UUID. Returns undefined if not found. */
export async function getTransportSession(id: string): Promise<TransportSession | undefined> {
  const db = getDb()
  return db.transport_sessions.get(id)
}

/** Apply partial updates to an existing transport session. */
export async function updateTransportSession(
  id: string,
  updates: Partial<TransportSession>,
): Promise<void> {
  const db = getDb()
  await db.transport_sessions.update(id, updates)
}

/** Return all sessions with status 'in-transit' across all couriers. */
export async function getActiveTransports(): Promise<TransportSession[]> {
  const db = getDb()
  return db.transport_sessions.where('status').equals('in-transit').toArray()
}

/** Return all sessions (all statuses) for a given courierId. */
export async function getTransportsByCourier(courierId: string): Promise<TransportSession[]> {
  const db = getDb()
  return db.transport_sessions.where('courierId').equals(courierId).toArray()
}

// ---------------------------------------------------------------------------
// Donor Program helpers (v22) — Story 50.2: Multi-Donor Report Templates
// No PHI: program codes, template codes, financial rates only.
// ---------------------------------------------------------------------------

import type { DonorProgram, DonorReport, DonorReportTemplate } from './donor-types'

/** Upsert a donor program (add or overwrite). */
export async function saveDonorProgram(program: DonorProgram): Promise<void> {
  const db = getDb()
  await db.donorPrograms.put(program)
}

/** Get all donor programs. */
export async function getDonorPrograms(): Promise<DonorProgram[]> {
  const db = getDb()
  return db.donorPrograms.toArray()
}

/** Get only active donor programs. */
export async function getActiveDonorPrograms(): Promise<DonorProgram[]> {
  const db = getDb()
  return db.donorPrograms.where('status').equals('active').toArray()
}

/** Look up a single program by code. Returns undefined if not found. */
export async function getDonorProgramByCode(programCode: string): Promise<DonorProgram | undefined> {
  const db = getDb()
  return db.donorPrograms.where('programCode').equals(programCode).first()
}

/** Upsert a custom donor report template. */
export async function saveDonorReportTemplate(template: DonorReportTemplate): Promise<void> {
  const db = getDb()
  await db.donorReportTemplates.put(template)
}

/** Get all custom (user-defined) donor report templates stored in Dexie. */
export async function getCustomDonorTemplates(): Promise<DonorReportTemplate[]> {
  const db = getDb()
  return db.donorReportTemplates.filter((t) => t.isCustom === true).toArray()
}

/** Upsert a donor report. */
export async function saveDonorReport(report: DonorReport): Promise<void> {
  const db = getDb()
  await db.donorReports.put(report)
}

/** Get a single donor report by ID. */
export async function getDonorReport(id: string): Promise<DonorReport | undefined> {
  const db = getDb()
  return db.donorReports.get(id)
}

/**
 * Get donor reports, optionally filtered by program code.
 * Returns newest-first by generatedAt.
 */
export async function getDonorReports(programCode?: string): Promise<DonorReport[]> {
  const db = getDb()
  const query = programCode
    ? db.donorReports.where('programCode').equals(programCode)
    : db.donorReports.toCollection()
  const reports = await query.sortBy('generatedAt')
  return reports.reverse()
}

/**
 * Finalize a donor report.
 * - Transitions status draft → finalized
 * - Records finalizedBy and finalizedAt
 * - Enqueues for Hub sync (Tier 3 — operational/financial, LWW)
 */
export async function finalizeDonorReport(id: string, finalizedBy: string): Promise<DonorReport> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.transaction('rw', db.donorReports, async () => {
    const report = await db.donorReports.get(id)
    if (!report) throw new Error(`Donor report not found: ${id}`)
    if (report.status === 'finalized') throw new Error(`Donor report ${id} is already finalized`)
    await db.donorReports.update(id, { status: 'finalized', finalizedBy, finalizedAt: now })
  })

  const finalized = (await db.donorReports.get(id))!

  // Enqueue for Hub sync — Tier 3 (financial operational data, LWW)
  try {
    await enqueueSyncEvent({
      resourceType: 'DonorReport',
      resourceId: id,
      status: 'pending',
      payload: finalized,
      createdAt: now,
      lastAttemptAt: null,
      retryCount: 0,
    })
  } catch {
    // Sync enqueue failure must not block finalization
  }

  return finalized
}

/**
 * Find an existing draft donor report for a given program and period.
 * Returns the first draft found, or undefined if none exists.
 */
export async function getDonorReportDraft(
  programCode: string,
  periodStart: string,
  periodEnd: string,
): Promise<DonorReport | undefined> {
  const db = getDb()
  return db.donorReports
    .where('[programCode+periodStart+periodEnd]')
    .equals([programCode, periodStart, periodEnd])
    .filter((r) => r.status === 'draft')
    .first()
    .catch(() =>
      // Fallback if compound index unavailable — full scan with JS filter
      db.donorReports
        .filter(
          (r) =>
            r.programCode === programCode &&
            r.periodStart === periodStart &&
            r.periodEnd === periodEnd &&
            r.status === 'draft',
        )
        .first(),
    )
}

// ---------------------------------------------------------------------------
// Story 50.3 — Surveillance Alert helpers
// PHI Safety: All functions operate on aggregate data only — no patient fields.
// ---------------------------------------------------------------------------

/** Save (upsert) a SurveillanceAlert. */
export async function saveSurveillanceAlert(alert: SurveillanceAlert): Promise<void> {
  const db = getDb()
  await db.surveillanceAlerts.put(alert)
}

/** Get all surveillance alerts, newest first. */
export async function getSurveillanceAlerts(): Promise<SurveillanceAlert[]> {
  const db = getDb()
  return db.surveillanceAlerts.orderBy('createdAt').reverse().toArray()
}

/** Get surveillance alerts within a date range (by createdAt). */
export async function getAlertsByDateRange(
  fromISO: string,
  toISO: string,
): Promise<SurveillanceAlert[]> {
  const db = getDb()
  return db.surveillanceAlerts
    .where('createdAt')
    .between(fromISO, toISO, true, true)
    .sortBy('createdAt')
    .then((items) => items.reverse())
}

/** Update alert transmission status. */
export async function updateAlertTransmissionStatus(
  id: string,
  status: SurveillanceAlert['transmissionStatus'],
  transmittedAt?: string,
): Promise<void> {
  const db = getDb()
  await db.surveillanceAlerts.update(id, {
    transmissionStatus: status,
    ...(transmittedAt ? { transmittedAt } : {}),
  })
}

/** Increment transmission attempts counter. */
export async function incrementAlertTransmissionAttempts(id: string): Promise<void> {
  const db = getDb()
  const alert = await db.surveillanceAlerts.get(id)
  if (alert) {
    await db.surveillanceAlerts.update(id, {
      transmissionAttempts: (alert.transmissionAttempts ?? 0) + 1,
    })
  }
}

// ---------------------------------------------------------------------------
// Story 50.3 — Reportable Disease Config helpers
// ---------------------------------------------------------------------------

/** Get all reportable disease configs. */
export async function getAllReportableDiseases(): Promise<ReportableDiseaseConfig[]> {
  const db = getDb()
  return db.reportableDiseases.toArray()
}

/** Get only active reportable disease configs. */
export async function getActiveReportableDiseases(): Promise<ReportableDiseaseConfig[]> {
  const db = getDb()
  return db.reportableDiseases.filter((d) => d.isActive === true).toArray()
}

/** Upsert a single reportable disease config. */
export async function putReportableDisease(disease: ReportableDiseaseConfig): Promise<void> {
  const db = getDb()
  await db.reportableDiseases.put(disease)
}

/** Upsert multiple reportable disease configs. */
export async function putReportableDiseases(diseases: ReportableDiseaseConfig[]): Promise<void> {
  const db = getDb()
  await db.reportableDiseases.bulkPut(diseases)
}

// ---------------------------------------------------------------------------
// Story 50.3 — Surveillance Baseline helpers
// ---------------------------------------------------------------------------

/** Get cached baseline for a disease+date. */
export async function getSurveillanceBaseline(
  diseaseCode: string,
  asOfDate: string,
): Promise<SurveillanceBaseline | undefined> {
  const db = getDb()
  return db.surveillanceBaselines.get(`${diseaseCode}_${asOfDate}`)
}

/** Upsert a surveillance baseline. */
export async function putSurveillanceBaseline(baseline: SurveillanceBaseline): Promise<void> {
  const db = getDb()
  await db.surveillanceBaselines.put(baseline)
}

// ---------------------------------------------------------------------------
// Story 50.3 — Scheduler Config helpers
// ---------------------------------------------------------------------------

const SCHEDULER_CONFIG_DEFAULTS: SurveillanceSchedulerConfig = {
  id: 'surveillance-scheduler',
  lastSpikeCheckAt: null,
  lastClusterCheckAt: null,
  dailyCheckHour: 8,
  isEnabled: true,
}

/** Get scheduler config (with defaults if not yet stored). */
export async function getSurveillanceSchedulerConfig(): Promise<SurveillanceSchedulerConfig> {
  const db = getDb()
  const stored = await db.surveillanceSchedulerConfig.get('surveillance-scheduler')
  return stored ?? SCHEDULER_CONFIG_DEFAULTS
}

/** Upsert scheduler config. */
export async function putSurveillanceSchedulerConfig(
  config: SurveillanceSchedulerConfig,
): Promise<void> {
  const db = getDb()
  await db.surveillanceSchedulerConfig.put(config)
}

// ---------------------------------------------------------------------------
// Story 50.3 — Cluster deduplication helper
// ---------------------------------------------------------------------------

/**
 * Get recent cluster alerts for a disease since a given ISO timestamp.
 * Used to check for duplicate cluster alerts before generating a new one.
 */
export async function getRecentClusterAlerts(
  diseaseCode: string,
  sinceISO: string,
): Promise<SurveillanceAlert[]> {
  const db = getDb()
  return db.surveillanceAlerts
    .where('[diseaseCode+alertType]')
    .equals([diseaseCode, 'cluster'])
    .filter((a) => a.createdAt >= sinceISO)
    .toArray()
}

// ---------------------------------------------------------------------------
// Supply Inventory helpers (v31) — Story 51.5: RAG Readiness Board
// ---------------------------------------------------------------------------

/** Return all supply items. */
export async function getAllSupplyItems(): Promise<SupplyItem[]> {
  const db = getDb()
  return db.supply_inventory.toArray()
}

/** Upsert a supply item. */
export async function putSupplyItem(item: SupplyItem): Promise<void> {
  const db = getDb()
  await db.supply_inventory.put(item)
}

/** Update specific fields on a supply item by ID. */
export async function updateSupplyItem(
  id: string,
  updates: Partial<SupplyItem>,
): Promise<void> {
  const db = getDb()
  await db.supply_inventory.update(id, updates)
}

/** Delete a supply item by ID. */
export async function deleteSupplyItem(id: string): Promise<void> {
  const db = getDb()
  await db.supply_inventory.delete(id)
}

// ---------------------------------------------------------------------------
// Lab Config helpers (v31) — Story 51.5: RAG Readiness Board
// ---------------------------------------------------------------------------

const DEFAULT_MINIMUM_STAFFING = 2

/** Return the configured minimum staffing level (default: 2). */
export async function getMinimumStaffing(): Promise<number> {
  const db = getDb()
  const config = await db.lab_config.get('minimumStaffing')
  if (!config) return DEFAULT_MINIMUM_STAFFING
  const parsed = parseInt(config.value, 10)
  return isNaN(parsed) || parsed < 1 ? DEFAULT_MINIMUM_STAFFING : parsed
}

/** Set the minimum staffing level. */
export async function setMinimumStaffing(value: number): Promise<void> {
  const db = getDb()
  await db.lab_config.put({ key: 'minimumStaffing', value: String(value) })
}

// ---------------------------------------------------------------------------
// Sample Lock helpers (v32) — Story 51.3: Sample Collision Prevention
// ---------------------------------------------------------------------------

/** Get the currently ACTIVE lock for a sample, or undefined if none/expired. */
export async function getActiveLock(sampleId: string): Promise<SampleLock | undefined> {
  const db = getDb()
  const lock = await db.sample_locks.get(sampleId)
  if (!lock || lock.status !== 'ACTIVE') return undefined
  // Read-time expiry guard: treat past-expiresAt locks as gone even before the checker runs.
  if (lock.expiresAt < new Date().toISOString()) return undefined
  return lock
}

/** Upsert a sample lock record. */
export async function putSampleLock(lock: SampleLock): Promise<void> {
  const db = getDb()
  await db.sample_locks.put(lock)
}

/** Return ACTIVE locks whose expiresAt is before the given ISO timestamp. */
export async function getExpiredActiveLocks(nowIso: string): Promise<SampleLock[]> {
  const db = getDb()
  const active = await db.sample_locks.where('status').equals('ACTIVE').toArray()
  return active.filter((l) => l.expiresAt < nowIso)
}

/** Return the configured lock timeout in hours (default 4h). */
export async function getLockTimeoutHours(): Promise<number> {
  const db = getDb()
  const cfg = await db.lab_config.get('lockTimeoutHours')
  if (!cfg) return 4
  const parsed = parseFloat(cfg.value)
  return isNaN(parsed) || parsed <= 0 ? 4 : parsed
}

// ---------------------------------------------------------------------------
// Workload snapshot helpers (v33) — Story 51.2: Workload Balancing Dashboard
// ---------------------------------------------------------------------------

/** Upsert a workload snapshot record. */
export async function putWorkloadSnapshot(snapshot: TechWorkloadSnapshot): Promise<void> {
  const db = getDb()
  await db.tech_workload_snapshots.put(snapshot)
}

/** Get all snapshots for a date range (YYYY-MM-DD inclusive). */
export async function getWorkloadSnapshotsByDateRange(
  from: string,
  to: string,
): Promise<TechWorkloadSnapshot[]> {
  const db = getDb()
  // Dexie range on shiftDate (lexicographic, works for YYYY-MM-DD strings)
  return db.tech_workload_snapshots
    .where('shiftDate')
    .between(from, to, true, true)
    .toArray()
}

/** Get the current open (endedAt=null) availability record for a tech, or undefined. */
export async function getOpenAvailabilityForTech(techId: string): Promise<TechAvailability | undefined> {
  const db = getDb()
  // Filter by techId, then find the one with endedAt null (open record)
  const records = await db.tech_availability.where('techId').equals(techId).toArray()
  return records.find((r) => r.endedAt === null)
}

/** Add a new availability record. */
export async function addTechAvailability(record: TechAvailability): Promise<void> {
  const db = getDb()
  await db.tech_availability.put(record)
}

/** Close an open availability record by setting its endedAt timestamp. */
export async function closeAvailabilityRecord(id: string, endedAt: string): Promise<void> {
  const db = getDb()
  await db.tech_availability.update(id, { endedAt })
}

// ---------------------------------------------------------------------------
// Power-Aware Workload Scheduler (Story 48.1)
// ---------------------------------------------------------------------------

/**
 * Return the active power schedule for a given weekday, or undefined if none.
 * dayOfWeek follows JS Date.getDay() convention: 0 = Sunday … 6 = Saturday.
 */
export async function getActiveScheduleForDay(
  dayOfWeek: number,
): Promise<PowerScheduleEntry | undefined> {
  const db = getDb()
  const entries = await db.power_schedules
    .where('dayOfWeek')
    .equals(dayOfWeek)
    .filter((s) => s.isActive)
    .first()
  return entries
}

/**
 * Return the time estimate for a given LOINC code, or undefined if not seeded.
 */
export async function getTestTimeEstimate(
  loincCode: string,
): Promise<TestTimeEstimate | undefined> {
  const db = getDb()
  return db.test_time_estimates.get(loincCode)
}

// ---------------------------------------------------------------------------
// CHW Collection Module helpers (v36) — Story 54.2
// collectedAt is a serialized HLC string: wallMs_padded:counter:nodeId
// "Today" filtering parses the numeric wallMs from the prefix.
// No PHI exposed here — callers enforce CLAUDE.md Rule #7 at the service layer.
// ---------------------------------------------------------------------------

/** Return today's epoch ms bounds [start, end] for HLC wallMs filtering. */
function todayEpochBounds(): { start: number; end: number } {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const start = d.getTime()
  d.setHours(23, 59, 59, 999)
  const end = d.getTime()
  return { start, end }
}

/** Return all CHW samples collected today (filtered by HLC wallMs). */
export async function getTodayCHWSamples(): Promise<CHWSampleCollection[]> {
  const db = getDb()
  const { start, end } = todayEpochBounds()
  return db.chw_samples
    .filter((s) => {
      const wallMs = parseInt(s.collectedAt.split(':')[0]!, 10)
      return wallMs >= start && wallMs <= end
    })
    .toArray()
}

/**
 * Atomically assign the next today's label number and persist the new sample.
 * Reading existing labels and writing the new record happen inside a single
 * Dexie transaction — prevents duplicate labels under concurrent collection (F7).
 */
export async function addCHWSampleAtomic(
  partialSample: Omit<CHWSampleCollection, 'labelNumber'>,
): Promise<CHWSampleCollection> {
  const db = getDb()

  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const monthDay = `${mm}${dd}`
  const prefix = `CHW-${monthDay}-`

  return db.transaction('rw', db.chw_samples, async () => {
    const { start, end } = todayEpochBounds()
    const todaySamples = await db.chw_samples
      .filter((s) => {
        const wallMs = parseInt(s.collectedAt.split(':')[0]!, 10)
        return wallMs >= start && wallMs <= end
      })
      .toArray()

    const usedNumbers = new Set(
      todaySamples.map((s) => s.labelNumber).filter((n) => n.startsWith(prefix)),
    )

    let seq = 1
    while (usedNumbers.has(`CHW-${monthDay}-${String(seq).padStart(3, '0')}`)) {
      seq++
      if (seq > 999) {
        throw new Error('CHW label sequence exhausted for today (>999 samples). Contact lab support.')
      }
    }
    const labelNumber = `CHW-${monthDay}-${String(seq).padStart(3, '0')}`

    const sample: CHWSampleCollection = { ...partialSample, labelNumber }
    await db.chw_samples.add(sample)
    return sample
  })
}

/** Add a pre-built CHW sample record directly (no label generation). */
export async function addCHWSample(sample: CHWSampleCollection): Promise<void> {
  const db = getDb()
  await db.chw_samples.add(sample)
}

/** Persist a courier handoff record. */
export async function addCourierHandoff(handoff: CourierHandoff): Promise<void> {
  const db = getDb()
  await db.courier_handoffs.add(handoff)
}

/**
 * Retrieve CHW samples by IDs, restricted to today's records only (F11).
 * Samples from previous days are excluded — prevents cross-day handoff forgery.
 */
export async function getCHWSamplesByIds(ids: string[]): Promise<CHWSampleCollection[]> {
  if (ids.length === 0) return []
  const db = getDb()
  const { start, end } = todayEpochBounds()
  const results = await db.chw_samples.bulkGet(ids)
  return results.filter((s): s is CHWSampleCollection => {
    if (!s) return false
    const wallMs = parseInt(s.collectedAt.split(':')[0]!, 10)
    return wallMs >= start && wallMs <= end
  })
}

/**
 * Return all CHW samples and courier handoffs with syncStatus 'pending'.
 * Used by the upload worker to drain offline-collected CHW data to the Hub.
 */
export async function getPendingSyncItems(): Promise<Array<CHWSampleCollection | CourierHandoff>> {
  const db = getDb()
  const [samples, handoffs] = await Promise.all([
    db.chw_samples.where('syncStatus').equals('pending').toArray(),
    db.courier_handoffs.where('syncStatus').equals('pending').toArray(),
  ])
  return [...samples, ...handoffs]
}

// ---------------------------------------------------------------------------
// Reference Lab helpers (v37) — Story 54.4: External Reference Lab Integration
// No PHI — reference labs are institutional records only.
// ---------------------------------------------------------------------------

/** Upsert a reference lab record. */
export async function putReferenceLab(lab: ReferenceLab): Promise<void> {
  const db = getDb()
  await db.reference_labs.put(lab)
}

/** Return all active (isActive = true) reference labs. */
export async function getActiveReferenceLabs(): Promise<ReferenceLab[]> {
  const db = getDb()
  return db.reference_labs.where('isActive').equals(1).toArray()
}

/** Create a new send-out record. */
export async function createSendOut(sendOut: SendOut): Promise<void> {
  const db = getDb()
  await db.send_outs.put(sendOut)
}

/** Return send-outs by status. */
export async function getSendOutsByStatus(status: SendOut['status']): Promise<SendOut[]> {
  const db = getDb()
  return db.send_outs.where('status').equals(status).toArray()
}

/** Return all send-outs for a given sample (by sampleId). */
export async function getSendOutsForSample(sampleId: string): Promise<SendOut[]> {
  const db = getDb()
  return db.send_outs.where('sampleId').equals(sampleId).toArray()
}

/** Append a status transition record. */
export async function addSendOutTransition(transition: SendOutStatusTransition): Promise<void> {
  const db = getDb()
  await db.send_out_transitions.put(transition)
}

// ---------------------------------------------------------------------------
// Story 53.1 — Knowledge Card seeding
// ---------------------------------------------------------------------------

/**
 * Seed (or update) all physician-authored knowledge cards and trigger rules into Dexie.
 *
 * Cards are bundled in the app build. On each call we compare the bundled card
 * version against the stored version: if the bundled version is greater or the
 * card does not exist yet, we overwrite the stored record.
 *
 * Trigger rules are always replaced in bulk — they are deterministic code, not
 * user-editable data, so full replacement on every seed is safe.
 *
 * No PHI: no patient data involved — these are static reference objects.
 */
export async function seedKnowledgeCards(): Promise<void> {
  const { KNOWLEDGE_CARD_REGISTRY, TRIGGER_RULES } = await import('@/lib/knowledge-cards')
  const db = getDb()

  await db.transaction('rw', [db.knowledge_cards, db.trigger_rules], async () => {
    for (const [, card] of KNOWLEDGE_CARD_REGISTRY) {
      const stored = await db.knowledge_cards.get(card.id)
      if (!stored || isNewerVersion(card.version, stored.version)) {
        await db.knowledge_cards.put(card)
      }
    }
    await db.trigger_rules.bulkPut(TRIGGER_RULES)
  })
}

function isNewerVersion(incoming: string, stored: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10))
  const [iMaj, iMin, iPat] = parse(incoming)
  const [sMaj, sMin, sPat] = parse(stored)
  if (iMaj !== sMaj) return iMaj > sMaj
  if (iMin !== sMin) return iMin > sMin
  return iPat > sPat
}

/**
 * Seed (or update) all physician-authored public health guidance content and trigger rules.
 *
 * Guidance content is versioned: if the bundled version is greater than the stored version
 * (or no record exists), the stored record is overwritten.
 *
 * Trigger rules are always bulk-replaced — they are deterministic code, not user-editable data.
 *
 * No PHI: no patient data involved — these are static physician-authored reference objects.
 */
export async function seedGuidance(): Promise<void> {
  const { GUIDANCE_SEED } = await import('@/lib/guidance-seed-data')
  const { GUIDANCE_TRIGGER_RULES } = await import('@/lib/guidance-trigger')
  const db = getDb()

  await db.transaction('rw', [db.guidance_content, db.guidance_triggers], async () => {
    for (const content of GUIDANCE_SEED) {
      const stored = await db.guidance_content.get(content.id)
      if (!stored || isNewerVersion(content.version, stored.version)) {
        await db.guidance_content.put(content)
      }
    }
    await db.guidance_triggers.bulkPut(GUIDANCE_TRIGGER_RULES)
  })
}
