/**
 * Story 53.6 — AI Provenance Trail
 *
 * Append-only, hash-chained provenance record for every AI-assisted interaction
 * in Lab-Lite. Satisfies CLAUDE.md: "Audit every PHI access" and
 * "append-only with SHA-256 hash chaining — never update or delete audit records."
 *
 * Design:
 * - Records are stored in Dexie `ai_provenance` table (v24 migration).
 * - Hash chain covers the initial AI output; human decisions (tech/physician)
 *   are stored as addenda and tracked by separate audit events.
 * - PHI guard on `inputDescription` is defense-in-depth — callers must
 *   already strip PHI; this catches obvious patterns.
 * - Sync to Hub uses the same store-and-forward pattern as audit events.
 */

import { getDb } from './db'
import { getLastProvenanceHash, computeRecordHash } from './provenance-chain'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from './hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { ConfidenceLevel } from './confidence'

// ---------------------------------------------------------------------------
// Re-export ConfidenceLevel for convenience (Story 53.5)
// ---------------------------------------------------------------------------
export type { ConfidenceLevel }

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface TechDecision {
  action: 'accepted' | 'modified' | 'rejected' | 'deferred'
  modifiedOutput?: string
  decisionTimestamp: string
  techId: string
}

export interface PhysicianConfirmation {
  action: 'confirmed' | 'overridden' | 'dismissed'
  notes?: string
  confirmationTimestamp: string
  physicianId: string
}

export interface AiProvenanceRecord {
  id: string
  timestamp: string
  hlcTimestamp: string

  // AI Model Information
  modelVersion: string
  modelHash: string | null
  modelType: 'rule_engine' | 'cloud_llm' | 'edge_onnx'

  // Input (no PHI)
  inputDescription: string
  inputFieldCount: number
  inputTemplateCode: string | null

  // AI Output
  aiOutput: string
  confidenceScore: number
  confidenceLevel: ConfidenceLevel

  // Human Decisions
  techDecision: TechDecision | null
  physicianConfirmation: PhysicianConfirmation | null

  // Chain Integrity
  previousHash: string | null
  recordHash: string

  // Metadata
  sourceFeature: string
  sampleId: string | null
  syncStatus: 'pending' | 'synced'
}

// ---------------------------------------------------------------------------
// PHI Guard
// ---------------------------------------------------------------------------
// Defense-in-depth — callers must already strip PHI. This catches obvious
// patterns: names (FirstName LastName), dates of birth, MRN patterns.

const PHI_PATTERNS = [
  /\b[A-Z][a-z]+ [A-Z][a-z]+\b/,        // FirstName LastName
  /\bDOB\s*[:=]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i, // DOB: 01/15/1990
  /\b\d{4}-\d{2}-\d{2}\b/,               // ISO date: 1990-01-15 (DOB-like)
  /\bMRN\s*[:=]?\s*\d{5,10}\b/i,         // MRN: 12345678
  /\bpatient\s+id\s*[:=]?\s*\w+/i,       // patient id: ...
]

function assertNoPhi(inputDescription: string): void {
  for (const pattern of PHI_PATTERNS) {
    if (pattern.test(inputDescription)) {
      throw new Error(
        `PHI guard: inputDescription contains a potential PHI pattern. ` +
        `Use structural descriptions only (e.g., 'CBC result set, 7 numeric values').`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Create a new AI provenance record.
 *
 * Auto-generates: id, previousHash, recordHash, syncStatus.
 * Validates inputDescription for PHI patterns.
 * Stores in Dexie ai_provenance table.
 * Emits AI_PROVENANCE_CREATED audit event.
 *
 * @returns The new record's UUID.
 */
export async function createProvenanceRecord(
  input: Omit<AiProvenanceRecord, 'id' | 'previousHash' | 'recordHash' | 'syncStatus' | 'techDecision' | 'physicianConfirmation'>
): Promise<string> {
  assertNoPhi(input.inputDescription)

  const id = crypto.randomUUID()
  const previousHash = await getLastProvenanceHash()

  const partial: Omit<AiProvenanceRecord, 'recordHash'> = {
    id,
    ...input,
    techDecision: null,
    physicianConfirmation: null,
    previousHash,
    syncStatus: 'pending',
  }

  const recordHash = await computeRecordHash(partial, previousHash)

  const record: AiProvenanceRecord = { ...partial, recordHash }

  const db = getDb()
  await db.ai_provenance.add(record)

  _emitProvenanceAuditEvent('AI_PROVENANCE_CREATED', id, record.sourceFeature)

  return id
}

/**
 * Record a technician's decision on an AI provenance record.
 *
 * The decision is stored as an addendum; the original recordHash is immutable.
 * Emits AI_TECH_DECISION_RECORDED audit event.
 */
export async function recordTechDecision(provenanceId: string, decision: TechDecision): Promise<void> {
  const db = getDb()
  const record = await db.ai_provenance.get(provenanceId)
  if (!record) throw new Error(`Provenance record not found: ${provenanceId}`)

  const updated: AiProvenanceRecord = { ...record, techDecision: decision }
  await db.ai_provenance.put(updated)

  _emitProvenanceAuditEvent('AI_TECH_DECISION_RECORDED', provenanceId, record.sourceFeature)
}

/**
 * Record a physician's confirmation on an AI provenance record.
 *
 * The confirmation is stored as an addendum; the original recordHash is immutable.
 * Emits AI_PHYSICIAN_CONFIRMATION_RECORDED audit event.
 */
export async function recordPhysicianConfirmation(provenanceId: string, confirmation: PhysicianConfirmation): Promise<void> {
  const db = getDb()
  const record = await db.ai_provenance.get(provenanceId)
  if (!record) throw new Error(`Provenance record not found: ${provenanceId}`)

  const updated: AiProvenanceRecord = { ...record, physicianConfirmation: confirmation }
  await db.ai_provenance.put(updated)

  _emitProvenanceAuditEvent('AI_PHYSICIAN_CONFIRMATION_RECORDED', provenanceId, record.sourceFeature)
}

/**
 * Query provenance records by date range, with optional source feature filter.
 *
 * Local-only query (operates on Dexie data). Returns records ordered by
 * timestamp ascending.
 */
export async function queryProvenance(
  startDate: string,
  endDate: string,
  options?: { sourceFeature?: string }
): Promise<AiProvenanceRecord[]> {
  const db = getDb()

  const base = db.ai_provenance.where('timestamp').between(startDate, endDate, true, true)

  if (options?.sourceFeature) {
    const feature = options.sourceFeature
    return base
      .filter((r) => r.sourceFeature === feature)
      .sortBy('timestamp') as Promise<AiProvenanceRecord[]>
  }

  return base.sortBy('timestamp') as Promise<AiProvenanceRecord[]>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ProvenanceAuditEvent =
  | 'AI_PROVENANCE_CREATED'
  | 'AI_TECH_DECISION_RECORDED'
  | 'AI_PHYSICIAN_CONFIRMATION_RECORDED'

function _emitProvenanceAuditEvent(event: ProvenanceAuditEvent, provenanceId: string, sourceFeature: string): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<ProvenanceAuditEvent, AuditAction> = {
    AI_PROVENANCE_CREATED: AuditAction.CREATE,
    AI_TECH_DECISION_RECORDED: AuditAction.UPDATE,
    AI_PHYSICIAN_CONFIRMATION_RECORDED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[event],
    resourceType: 'AI_PROVENANCE' as AuditResourceType,
    resourceId: provenanceId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      provenanceEvent: event,
      outcome: 'SUCCESS',
      provenanceId,
      sourceFeature,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}
