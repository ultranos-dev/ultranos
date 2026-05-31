/**
 * Logbook Writer — Story 42.8: Digital Lab Logbook
 *
 * Auto-populates the digital logbook when a result is authorized.
 * Wraps sequence assignment + entry insertion in a single Dexie transaction
 * to prevent gaps or duplicates under concurrent usage.
 *
 * PHI safety:
 *   - resultSummary is stored locally but NEVER logged or included in audit events
 *   - Audit events reference entries by id and seqNo only (no PHI)
 *   - Error messages are generic — never include entry content
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, appendLogbookEntry, appendLogbookAmendment, getLogbookEntryByDiagnosticReportId, enqueueSyncEvent } from './db'
import type { LabLogbookEntry } from './db'
import { getNextSequenceNumber, formatDisplayNumber } from './logbook-sequence'
import { reportLogbookEvent } from './audit-client'

/** Facility prefix used for display numbers. Can be overridden via lab config. */
const DEFAULT_FACILITY_PREFIX = 'LAB'

export interface AuthorizedResultInput {
  diagnosticReportId: string
  date: string                  // ISO 8601 date of authorization
  patientRef: string            // opaque patient ID
  patientFirstName: string      // first name only — CLAUDE.md Rule #7
  patientAge: number
  testType: string              // LOINC display name
  testLoincCode: string
  resultSummary: string         // clinical data — stored but never logged
  technicianId: string
  technicianName: string
  authorizerId: string
  authorizerName: string
  authorizedAt: string          // ISO 8601 timestamp
  facilityPrefix?: string       // defaults to DEFAULT_FACILITY_PREFIX
}

/**
 * Write an authorized result to the digital logbook.
 * Idempotent: if an entry already exists for this diagnosticReportId, returns the existing id.
 * Enqueues to syncQueue immediately after local insert.
 *
 * This function is the integration point for Story 42.5 (Result Authorization Workflow).
 * Call it from the result authorization flow after supervisor approval.
 */
export async function writeAuthorizedResultToLogbook(
  result: AuthorizedResultInput,
): Promise<string> {
  // Duplicate guard: check if logbook entry already exists for this report
  const existing = await getLogbookEntryByDiagnosticReportId(result.diagnosticReportId)
  if (existing) {
    return existing.id
  }

  const db = getDb()
  const facilityPrefix = result.facilityPrefix ?? DEFAULT_FACILITY_PREFIX

  // Sequence assignment + insert in a single transaction to prevent gaps/duplicates
  const entryId = await db.transaction('rw', db.labLogbook, async () => {
    const seqNo = await getNextSequenceNumber()
    const id = uuidv4()
    const entry: LabLogbookEntry = {
      id,
      seqNo,
      facilityPrefix,
      displayNumber: formatDisplayNumber(facilityPrefix, seqNo),
      date: result.date,
      patientRef: result.patientRef,
      patientFirstName: result.patientFirstName,
      patientAge: result.patientAge,
      testType: result.testType,
      testLoincCode: result.testLoincCode,
      resultSummary: result.resultSummary,
      technicianId: result.technicianId,
      technicianName: result.technicianName,
      authorizerId: result.authorizerId,
      authorizerName: result.authorizerName,
      authorizationStatus: 'authorized',
      authorizedAt: result.authorizedAt,
      diagnosticReportId: result.diagnosticReportId,
      entryType: 'original',
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    }
    await appendLogbookEntry(entry)
    return id
  })

  // Enqueue for Hub sync (Tier 2 — clinical data)
  try {
    await enqueueSyncEvent({
      resourceType: 'LabLogbookEntry',
      resourceId: entryId,
      status: 'pending',
      payload: { id: entryId, diagnosticReportId: result.diagnosticReportId },
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      retryCount: 0,
    })
  } catch {
    // Sync queue failure is non-fatal — entry is stored locally and will sync on retry
  }

  // Emit audit event — opaque IDs only, no PHI (CLAUDE.md Rule #6)
  const entry = await getLogbookEntryByDiagnosticReportId(result.diagnosticReportId)
  if (entry) {
    reportLogbookEvent({
      action: 'LOGBOOK_ENTRY_CREATED',
      entryId: entryId,
      seqNo: entry.seqNo,
      technicianId: result.technicianId,
    })
  }

  return entryId
}

export interface AmendmentInput {
  originalEntryId: string
  diagnosticReportId: string
  date: string
  patientRef: string
  patientFirstName: string
  patientAge: number
  testType: string
  testLoincCode: string
  resultSummary: string         // corrected result — stored but never logged
  technicianId: string
  technicianName: string
  authorizerId: string
  authorizerName: string
  authorizedAt: string
  amendmentReason: string       // required for amendments
  facilityPrefix?: string
}

/**
 * Create an amendment entry for a previously authorized logbook entry.
 * The original entry is NOT modified — a new entry is appended with
 * entryType='amendment' and amendmentOf=originalEntryId.
 */
export async function createLogbookAmendment(input: AmendmentInput): Promise<string> {
  const db = getDb()
  const facilityPrefix = input.facilityPrefix ?? DEFAULT_FACILITY_PREFIX

  const amendmentId = await db.transaction('rw', db.labLogbook, async () => {
    const seqNo = await getNextSequenceNumber()
    const id = uuidv4()
    const amendment: LabLogbookEntry & { entryType: 'amendment'; amendmentOf: string; amendmentReason: string } = {
      id,
      seqNo,
      facilityPrefix,
      displayNumber: formatDisplayNumber(facilityPrefix, seqNo),
      date: input.date,
      patientRef: input.patientRef,
      patientFirstName: input.patientFirstName,
      patientAge: input.patientAge,
      testType: input.testType,
      testLoincCode: input.testLoincCode,
      resultSummary: input.resultSummary,
      technicianId: input.technicianId,
      technicianName: input.technicianName,
      authorizerId: input.authorizerId,
      authorizerName: input.authorizerName,
      authorizationStatus: 'amended',
      authorizedAt: input.authorizedAt,
      diagnosticReportId: input.diagnosticReportId,
      entryType: 'amendment',
      amendmentOf: input.originalEntryId,
      amendmentReason: input.amendmentReason,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    }
    await appendLogbookAmendment(amendment)
    return id
  })

  // Enqueue for Hub sync
  try {
    await enqueueSyncEvent({
      resourceType: 'LabLogbookEntry',
      resourceId: amendmentId,
      status: 'pending',
      payload: { id: amendmentId, amendmentOf: input.originalEntryId, diagnosticReportId: input.diagnosticReportId },
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      retryCount: 0,
    })
  } catch {
    // Non-fatal
  }

  // Emit audit event — opaque IDs only, no PHI
  const amendment = await db.labLogbook.get(amendmentId)
  if (amendment) {
    const original = await db.labLogbook.get(input.originalEntryId)
    reportLogbookEvent({
      action: 'LOGBOOK_AMENDMENT_CREATED',
      entryId: amendmentId,
      seqNo: amendment.seqNo,
      originalSeqNo: original?.seqNo,
      technicianId: input.technicianId,
    })
  }

  return amendmentId
}
