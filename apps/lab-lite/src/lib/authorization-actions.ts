/**
 * Story 42.5 — Authorization Action Handlers
 * Task 6: approveResult, rejectResult, holdResult
 *
 * All actions:
 * 1. Update Dexie lab_results table locally (optimistic)
 * 2. Append to authorizationActions audit trail table
 * 3. Emit structured audit event via audit-client
 * 4. Queue sync event for Hub
 *
 * Critical value approval requires criticalValueAcknowledged=true.
 * Rejection requires non-empty rejectionComments.
 */
import { getDb } from './db'
import { hlc, serializeHlc } from './hlc'
import { reportAuthorizationAuditEvent } from './audit-client'
import { dispatchResultRelease } from './result-release'
import { checkAndInitiateEscalation } from './escalation-integration'
import {
  AuthorizationStatus,
  AuthorizationActionType,
} from '../types/authorization'
import type { LabResultForAuthorization } from '../types/authorization'
import { isCriticalResult } from './permissions'

interface ApproveOptions {
  result: LabResultForAuthorization
  actorId: string
  actorRole: string
  /** Required if result has LL or HH flags. Must be true to proceed. */
  criticalValueAcknowledged?: boolean
}

interface RejectOptions {
  result: LabResultForAuthorization
  actorId: string
  actorRole: string
  /** Mandatory — rejection without a reason is not permitted. */
  rejectionComments: string
}

interface HoldOptions {
  result: LabResultForAuthorization
  actorId: string
  actorRole: string
  holdComments?: string
}

/**
 * Approve (release) a lab result.
 * Critical results require criticalValueAcknowledged=true.
 */
export async function approveResult(options: ApproveOptions): Promise<void> {
  const { result, actorId, actorRole, criticalValueAcknowledged = false } = options
  const db = getDb()
  const nowHlc = serializeHlc(hlc.now())
  const nowIso = new Date().toISOString()

  // Critical value gate: require explicit acknowledgment before approval
  if (isCriticalResult(result.abnormalityFlags) && !criticalValueAcknowledged) {
    throw new Error(
      'Critical value acknowledgment is required before approving this result.',
    )
  }

  // 1. Update Dexie result record
  await db.lab_results.update(result.id, {
    authorizationStatus: AuthorizationStatus.APPROVED,
    authorizedBy: actorId,
    authorizedAt: nowHlc,
    releasedAt: nowIso,
    syncStatus: 'local',
  })

  // 2. Append authorization action record
  await db.authorizationActions.add({
    resultId: result.id,
    action: AuthorizationActionType.APPROVE,
    actorId,
    actorRole,
    timestamp: nowHlc,
    criticalValueAcknowledged,
    syncStatus: 'local',
  })

  // 3. Audit event (never throws)
  reportAuthorizationAuditEvent({
    action: 'RESULT_APPROVED',
    resultId: result.id,
    actorId,
    actorRole,
    autoVerified: false,
  })

  // If critical value was acknowledged, log that separately too
  if (isCriticalResult(result.abnormalityFlags) && criticalValueAcknowledged) {
    reportAuthorizationAuditEvent({
      action: 'CRITICAL_VALUE_ACKNOWLEDGED',
      resultId: result.id,
      actorId,
      actorRole,
      flags: result.abnormalityFlags,
    })
  }

  // 4. Dispatch notification to ordering physician (queues offline if needed)
  void dispatchResultRelease(result)

  // 5. Check for critical values and initiate escalation chain if needed (Story 48.4)
  void checkAndInitiateEscalation({
    resultId: result.id,
    loincCode: result.loincCode,
    analyte: result.testCategory,
    patientRef: result.patientRef,
    orderingPhysicianId: result.authorizedBy ?? actorId,
    abnormalityFlags: result.abnormalityFlags,
  })
}

/**
 * Reject a result and return it to the entering technician.
 * Rejection comments are mandatory.
 */
export async function rejectResult(options: RejectOptions): Promise<void> {
  const { result, actorId, actorRole, rejectionComments } = options

  if (!rejectionComments || rejectionComments.trim().length === 0) {
    throw new Error('Rejection comments are required when rejecting a result.')
  }

  const db = getDb()
  const nowHlc = serializeHlc(hlc.now())

  // 1. Update Dexie result record
  await db.lab_results.update(result.id, {
    authorizationStatus: AuthorizationStatus.REJECTED,
    rejectionComments: rejectionComments.trim(),
    authorizedBy: actorId,
    authorizedAt: nowHlc,
    syncStatus: 'local',
  })

  // 2. Append authorization action record
  await db.authorizationActions.add({
    resultId: result.id,
    action: AuthorizationActionType.REJECT,
    actorId,
    actorRole,
    timestamp: nowHlc,
    comments: rejectionComments.trim(),
    syncStatus: 'local',
  })

  // 3. Audit event with rejection reason (never throws)
  reportAuthorizationAuditEvent({
    action: 'RESULT_REJECTED',
    resultId: result.id,
    actorId,
    actorRole,
    reason: rejectionComments.trim(),
  })

  // 4. Queue sync to Hub
  const db2 = getDb()
  await db2.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'labResultAuthorization',
    resourceId: result.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    hlcTimestamp: nowHlc,
    payload: {
      action: AuthorizationActionType.REJECT,
      resultId: result.id,
      actorId,
      actorRole,
      rejectionComments: rejectionComments.trim(),
    },
  })
}

/**
 * Place a result on hold for team discussion.
 * Hold comments are optional.
 */
export async function holdResult(options: HoldOptions): Promise<void> {
  const { result, actorId, actorRole, holdComments } = options
  const db = getDb()
  const nowHlc = serializeHlc(hlc.now())

  // 1. Update Dexie result record
  await db.lab_results.update(result.id, {
    authorizationStatus: AuthorizationStatus.HELD,
    ...(holdComments ? { holdComments: holdComments.trim() } : {}),
    syncStatus: 'local',
  })

  // 2. Append authorization action record
  await db.authorizationActions.add({
    resultId: result.id,
    action: AuthorizationActionType.HOLD,
    actorId,
    actorRole,
    timestamp: nowHlc,
    ...(holdComments ? { comments: holdComments.trim() } : {}),
    syncStatus: 'local',
  })

  // 3. Audit event (never throws)
  reportAuthorizationAuditEvent({
    action: 'RESULT_HELD',
    resultId: result.id,
    actorId,
    actorRole,
  })

  // 4. Queue sync to Hub
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'labResultAuthorization',
    resourceId: result.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    hlcTimestamp: nowHlc,
    payload: {
      action: AuthorizationActionType.HOLD,
      resultId: result.id,
      actorId,
      actorRole,
      ...(holdComments ? { holdComments: holdComments.trim() } : {}),
    },
  })
}
