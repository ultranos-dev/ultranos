import { getDb, enqueueSyncEvent } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import type {
  ExposureType,
  SourceStatus,
  PepRecommendation,
  TechVaccinationStatus,
} from '@/lib/safety/exposure-protocol'

export type { ExposureType, SourceStatus, PepRecommendation, TechVaccinationStatus }

export interface IncidentReport {
  id: string                           // UUID
  type: ExposureType
  occurredAt: string                   // ISO 8601
  location: string                     // Free text
  mechanism: string                    // Free text
  sourcePatientRef: string             // "Patient/<uuid>" — NEVER patient name
  sourceStatus: SourceStatus
  techId: string                       // Practitioner UUID
  techVaccinationStatus: TechVaccinationStatus
  firstAidActions: string[]            // steps confirmed by tech
  pepRecommendation: PepRecommendation
  generatedAt: string                  // ISO 8601
  hlcTimestamp: string                 // HLC serialized
  notifiedRecipients: string[]         // practitioner IDs
}

export interface WorkflowData {
  exposureType: ExposureType
  occurredAt: string
  location: string
  mechanism: string
  sourcePatientRef: string
  sourceStatus: SourceStatus
  techId: string
  techVaccinationStatus: TechVaccinationStatus
  firstAidActions: string[]
  pepRecommendation: PepRecommendation
  labManagerId?: string               // if available from settings
  infectionControlOfficerId?: string  // if available from settings
}

/**
 * Pure function — constructs an IncidentReport from workflow data without persisting.
 * Uses HLC timestamp for causal ordering in the sync engine.
 * NOTE: sourcePatientRef is opaque ("Patient/<uuid>") — never include patient name or demographics.
 */
export function generateIncidentReport(workflowData: WorkflowData): IncidentReport {
  const notifiedRecipients = [
    workflowData.labManagerId,
    workflowData.infectionControlOfficerId,
  ].filter(Boolean) as string[]

  return {
    id: crypto.randomUUID(),
    type: workflowData.exposureType,
    occurredAt: workflowData.occurredAt,
    location: workflowData.location,
    mechanism: workflowData.mechanism,
    sourcePatientRef: workflowData.sourcePatientRef,
    sourceStatus: workflowData.sourceStatus,
    techId: workflowData.techId,
    techVaccinationStatus: workflowData.techVaccinationStatus,
    firstAidActions: workflowData.firstAidActions,
    pepRecommendation: workflowData.pepRecommendation,
    generatedAt: new Date().toISOString(),
    hlcTimestamp: serializeHlc(hlc.now()),
    notifiedRecipients,
  }
}

/**
 * Persists an incident report to local IndexedDB and enqueues it for Hub sync.
 * Incident reports are Tier 1 safety-critical — append-only, never deleted.
 * The sync event ensures the report reaches the Hub when connectivity is restored.
 */
export async function persistIncidentReport(report: IncidentReport): Promise<void> {
  await (getDb() as any).incident_reports.put(report)
  await enqueueSyncEvent({
    resourceType: 'IncidentReport',
    resourceId: report.id,
    payload: report,
    hlcTimestamp: report.hlcTimestamp,
  })
}

/** Returns all incident reports stored locally. */
export async function getIncidentReports(): Promise<IncidentReport[]> {
  return (getDb() as any).incident_reports.toArray()
}

/** Returns a single incident report by ID, or undefined if not found. */
export async function getIncidentReportById(id: string): Promise<IncidentReport | undefined> {
  return (getDb() as any).incident_reports.get(id)
}

/**
 * Upserts an incident report (used for addenda / status updates from Hub sync).
 * Callers must never use this to mutate safety-critical fields — only addenda fields.
 */
export async function putIncidentReport(report: IncidentReport): Promise<void> {
  await (getDb() as any).incident_reports.put(report)
}

/**
 * Builds notification payloads for each recipient in the incident report.
 * Payloads contain NO patient demographics — only opaque IDs and clinical metadata.
 */
export function createExposureNotificationPayloads(
  report: IncidentReport,
): Array<{
  type: string
  incidentId: string
  exposureType: ExposureType
  techId: string
  occurredAt: string
  urgency: string
  recipientId: string
}> {
  return report.notifiedRecipients.map((recipientId) => ({
    type: 'EXPOSURE_INCIDENT',
    incidentId: report.id,
    exposureType: report.type,
    techId: report.techId,
    occurredAt: report.occurredAt,
    urgency: 'URGENT',
    recipientId,
  }))
}

/**
 * Enqueues an async notification for each recipient in the incident report.
 * Notifications are sent via the Hub sync queue — safe to call offline.
 */
export async function queueExposureNotifications(report: IncidentReport): Promise<void> {
  const payloads = createExposureNotificationPayloads(report)
  for (const notificationPayload of payloads) {
    await enqueueSyncEvent({
      resourceType: 'Notification',
      resourceId: crypto.randomUUID(),
      payload: notificationPayload,
      hlcTimestamp: serializeHlc(hlc.now()),
    })
  }
}
