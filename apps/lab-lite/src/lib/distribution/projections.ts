/**
 * Story 42.6 — Write-Once, Distribute-Many: Projection Builders
 *
 * Each of the four functions below produces a destination-specific payload
 * from a ResultReleasedEvent. Every function enforces a strict allow-list —
 * any field not in the list is stripped (with a console.warn shape log).
 *
 * PHI Safety (CLAUDE.md Rules #1, #7):
 *   - OPD-Lite: full clinical projection, subject is opaque patientRef only.
 *   - Patient-Lite: simplified view, no performer/annotations/raw values.
 *   - Logbook: MoPH register columns, patientRef is already minimized.
 *   - Stats: ZERO patient identifiers, ZERO result values.
 */

import type { ResultReleasedEvent } from '../authorization-actions'

// ---------------------------------------------------------------------------
// OPD-Lite projection — full FHIR DiagnosticReport
// ---------------------------------------------------------------------------

export interface OpdProjection {
  id: string
  resourceType: 'DiagnosticReport'
  status: 'final' | 'amended' | 'corrected'
  code: { coding: Array<{ system: string; code: string; display: string }> }
  subject: { reference: string }
  issued: string
  conclusion?: string
  _ultranos: {
    createdAt: string
    hlcTimestamp: string
    isOfflineCreated: boolean
    labId?: string
    templateVersion: string
    flagLevel: 'normal' | 'abnormal' | 'critical'
    sampleId: string
  }
  meta: { lastUpdated: string; versionId: string }
}

const OPD_ALLOW_LIST: ReadonlySet<string> = new Set([
  'id', 'resourceType', 'status', 'code', 'subject', 'issued',
  'conclusion', '_ultranos', 'meta',
])

export function buildOpdProjection(event: ResultReleasedEvent, labId?: string): OpdProjection {
  const now = new Date().toISOString()
  const raw: OpdProjection = {
    id: event.reportId,
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: event.loincCode, display: event.testName }],
    },
    subject: { reference: event.patientRef },
    issued: event.authorizedAt,
    ...(event.conclusion ? { conclusion: event.conclusion } : {}),
    _ultranos: {
      createdAt: now,
      hlcTimestamp: now,
      isOfflineCreated: true,
      ...(labId ? { labId } : {}),
      templateVersion: event.templateVersion,
      flagLevel: event.flagLevel,
      sampleId: event.sampleId,
    },
    meta: { lastUpdated: now, versionId: '1' },
  }

  return enforceAllowList(raw, OPD_ALLOW_LIST, 'OpdProjection') as OpdProjection
}

// ---------------------------------------------------------------------------
// Patient-Lite projection — simplified, privacy-safe
// ---------------------------------------------------------------------------

export interface PatientProjection {
  reportId: string
  testName: string
  resultSummary: string
  flagLevel: 'normal' | 'abnormal' | 'critical'
  issuedDate: string
  labName?: string
}

const PATIENT_ALLOW_LIST: ReadonlySet<string> = new Set([
  'reportId', 'testName', 'resultSummary', 'flagLevel', 'issuedDate', 'labName',
])

export function buildPatientProjection(event: ResultReleasedEvent): PatientProjection {
  const flagSummary: Record<'normal' | 'abnormal' | 'critical', string> = {
    normal: 'Normal',
    abnormal: 'Abnormal',
    critical: 'Critical',
  }

  const raw: PatientProjection = {
    reportId: event.reportId,
    testName: event.testName,
    resultSummary: flagSummary[event.flagLevel],
    flagLevel: event.flagLevel,
    issuedDate: event.authorizedAt.split('T')[0], // date only, no time
    ...(event.labName ? { labName: event.labName } : {}),
  }

  return enforceAllowList(raw, PATIENT_ALLOW_LIST, 'PatientProjection') as PatientProjection
}

// ---------------------------------------------------------------------------
// Logbook projection — MoPH register columns
// ---------------------------------------------------------------------------

export interface LogbookProjection {
  diagnosticReportId: string
  date: string
  patientRef: string
  testType: string
  technicianId: string
  authorizationStatus: string
  sampleId: string
}

const LOGBOOK_ALLOW_LIST: ReadonlySet<string> = new Set([
  'diagnosticReportId', 'date', 'patientRef', 'testType',
  'technicianId', 'authorizationStatus', 'sampleId',
])

export function buildLogbookProjection(event: ResultReleasedEvent): LogbookProjection {
  const raw: LogbookProjection = {
    diagnosticReportId: event.reportId,
    date: event.authorizedAt.split('T')[0],
    patientRef: event.patientRef,
    testType: event.testName,
    technicianId: event.authorizedBy,
    authorizationStatus: `authorized by ${event.authorizedBy}`,
    sampleId: event.sampleId,
  }

  return enforceAllowList(raw, LOGBOOK_ALLOW_LIST, 'LogbookProjection') as LogbookProjection
}

// ---------------------------------------------------------------------------
// Stats projection — ZERO PHI
// ---------------------------------------------------------------------------

export interface StatsProjection {
  loincCode: string
  flagLevel: 'normal' | 'abnormal' | 'critical'
  date: string
  yearMonth: string
  turnaroundMinutes: number
}

const STATS_ALLOW_LIST: ReadonlySet<string> = new Set([
  'loincCode', 'flagLevel', 'date', 'yearMonth', 'turnaroundMinutes',
])

export function buildStatsProjection(event: ResultReleasedEvent): StatsProjection {
  const authorizedDate = new Date(event.authorizedAt)
  const receivedDate = event.receivedAt ? new Date(event.receivedAt) : authorizedDate
  const turnaroundMinutes = Math.round(
    (authorizedDate.getTime() - receivedDate.getTime()) / 60_000,
  )

  const raw: StatsProjection = {
    loincCode: event.loincCode,
    flagLevel: event.flagLevel,
    date: event.authorizedAt.split('T')[0],
    yearMonth: event.authorizedAt.substring(0, 7), // "YYYY-MM"
    turnaroundMinutes: Math.max(0, turnaroundMinutes),
  }

  return enforceAllowList(raw, STATS_ALLOW_LIST, 'StatsProjection') as StatsProjection
}

// ---------------------------------------------------------------------------
// Allow-list enforcement utility
// ---------------------------------------------------------------------------

/**
 * Strip any field not in the allow-list. Logs a shape-only warning (no PHI)
 * when unexpected fields are found.
 */
function enforceAllowList<T extends Record<string, unknown>>(
  obj: T,
  allowList: ReadonlySet<string>,
  projectionName: string,
): Partial<T> {
  const result: Record<string, unknown> = {}
  const stripped: string[] = []

  for (const key of Object.keys(obj)) {
    if (allowList.has(key)) {
      result[key] = obj[key]
    } else {
      stripped.push(key)
    }
  }

  if (stripped.length > 0) {
    console.warn(
      `[distribution/projections] ${projectionName}: stripped ${stripped.length} unexpected field(s): ${stripped.join(', ')}`,
    )
  }

  return result as Partial<T>
}
