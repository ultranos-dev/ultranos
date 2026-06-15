/**
 * Anonymous Safety Report Service — Story 47.6
 *
 * ANONYMITY GUARANTEE:
 * - No reporter identity is recorded (no userId, sessionId, practitionerId).
 * - submittedAt is rounded to the nearest hour to prevent time-based correlation.
 * - Report IDs are UUIDv4 — random, not sequential.
 * - No audit event is emitted for report submission (see exception below).
 * - Sync payload does NOT include auth headers or user identifiers.
 *
 * INTENTIONAL EXCEPTION to CLAUDE.md Rule #6:
 * Anonymous safety reports are NOT audit-logged at submission time.
 * Audit logging would create a correlation between the authenticated user
 * and the report timestamp, compromising the anonymity guarantee.
 * Manager actions on reports (acknowledge, investigate, close) ARE audited.
 * This exception was approved as part of Story 47.6 design review.
 */

import {
  SafetyConcernCategory,
  ReportStatus,
  type SafetyReport,
} from '@/types/safety-reporting'
import {
  addSafetyReport,
  getSafetyReportById,
  updateReportStatus,
  enqueueSyncEvent,
} from '@/lib/db'
import { reportSafetyManagerEvent } from '@/lib/audit-client'

/**
 * Round a Date to the nearest hour (minutes, seconds, ms → 0).
 * Prevents time-based correlation with login sessions or activity logs.
 */
function roundToNearestHour(date: Date): Date {
  const rounded = new Date(date)
  rounded.setMinutes(0, 0, 0)
  return rounded
}

/**
 * Submit an anonymous safety report.
 *
 * - Creates report with rounded timestamp, random UUID, no reporter identity.
 * - Queues report for sync with resourceType 'SafetyReport'.
 * - The sync payload does NOT include auth session data.
 * - No audit event is emitted (anonymity exception).
 *
 * Returns the report ID for confirmation display.
 */
export async function submitAnonymousReport(input: {
  category: SafetyConcernCategory
  details: string
}): Promise<string> {
  const roundedTime = roundToNearestHour(new Date())

  const report: SafetyReport = {
    id: crypto.randomUUID(),
    category: input.category,
    details: input.details,
    submittedAt: roundedTime.toISOString(),
    status: ReportStatus.SUBMITTED,
    resolution: null,
    acknowledgedAt: null,
    closedAt: null,
    investigatorNotes: null,
  }

  await addSafetyReport(report)

  // Queue for sync — payload explicitly excludes any auth/user information.
  // Using a fixed HLC placeholder since we cannot use the real HLC
  // (it would leak the node ID which is tied to the user session).
  await enqueueSyncEvent({
    resourceType: 'SafetyReport',
    resourceId: report.id,
    payload: {
      id: report.id,
      category: report.category,
      details: report.details,
      submittedAt: report.submittedAt,
      status: report.status,
      // NO auth headers, NO user identifiers, NO session references
    },
    hlcTimestamp: `anon-${roundedTime.getTime()}`,
  })

  // INTENTIONAL: No audit event emitted here — anonymity protection.

  // Queue notification for lab manager — payload contains NO reporter identity.
  await enqueueSyncEvent({
    resourceType: 'SafetyConcernNotification',
    resourceId: `notif-${report.id}`,
    payload: {
      type: 'SAFETY_CONCERN_REPORTED',
      reportId: report.id,
      category: report.category,
      submittedAt: report.submittedAt,
      // Explicitly NO reporter identity
    },
    hlcTimestamp: `anon-notif-${roundedTime.getTime()}`,
  })

  return report.id
}

/**
 * Acknowledge a safety report (lab manager action).
 * Sets status to ACKNOWLEDGED. This action IS audit-logged.
 */
export async function acknowledgeReport(
  reportId: string,
  managerId: string,
): Promise<void> {
  const report = await getSafetyReportById(reportId)
  if (!report) throw new Error('Report not found')

  const now = new Date().toISOString()
  await updateReportStatus(reportId, {
    status: ReportStatus.ACKNOWLEDGED,
    acknowledgedAt: now,
  })

  reportSafetyManagerEvent({
    action: 'SAFETY_REPORT_ACKNOWLEDGED',
    reportId,
    category: report.category,
    managerId,
  })
}

/**
 * Update investigation notes on a safety report (lab manager action).
 * Sets status to INVESTIGATING. This action IS audit-logged.
 */
export async function updateInvestigation(
  reportId: string,
  managerId: string,
  notes: string,
): Promise<void> {
  const report = await getSafetyReportById(reportId)
  if (!report) throw new Error('Report not found')

  await updateReportStatus(reportId, {
    status: ReportStatus.INVESTIGATING,
    investigatorNotes: notes,
  })

  reportSafetyManagerEvent({
    action: 'SAFETY_REPORT_INVESTIGATED',
    reportId,
    category: report.category,
    managerId,
  })
}

/**
 * Close a safety report with resolution text (lab manager action).
 * Sets status to CLOSED. This action IS audit-logged.
 */
export async function closeReport(
  reportId: string,
  managerId: string,
  resolution: string,
): Promise<void> {
  const report = await getSafetyReportById(reportId)
  if (!report) throw new Error('Report not found')

  const now = new Date().toISOString()
  await updateReportStatus(reportId, {
    status: ReportStatus.CLOSED,
    resolution,
    closedAt: now,
  })

  reportSafetyManagerEvent({
    action: 'SAFETY_REPORT_CLOSED',
    reportId,
    category: report.category,
    managerId,
  })
}

export { SafetyConcernCategory, ReportStatus }
