/**
 * Send-Out Service — Story 54.4 / Task 4
 *
 * Manages the full lifecycle of samples sent to external reference labs:
 * creation, status transitions, result import, and document generation.
 *
 * Data minimization: referral forms contain ONLY patient first name + age (CLAUDE.md Rule #7).
 * Status pipeline: sent → received → processing → results-available (forward-only).
 * Cancelled is allowed from any status.
 *
 * All mutations emit audit events via reportSendOutAuditEvent.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  getDb,
  createSendOut,
  getSendOutsByStatus,
  getSendOutsForSample,
  addSendOutTransition,
} from './db'
import { hlc, serializeHlc } from './hlc'
import { reportSendOutAuditEvent } from './audit-client'
import type {
  SendOut,
  SendOutStatus,
  SendOutStatusTransition,
  CreateSendOutInput,
  ReferralForm,
  ShippingManifest,
} from '@/types/reference-lab'
import type { ReferenceLab } from '@/types/reference-lab'
import { SENDOUT_ALLOWED_TRANSITIONS } from '@/types/reference-lab'
import type { FhirSpecimen } from '@ultranos/shared-types'

/** Create a new send-out record and generate referral form + shipping manifest IDs. */
export async function initiateSendOut(
  input: CreateSendOutInput,
  actorId: string,
): Promise<SendOut> {
  const now = new Date().toISOString()
  const id = uuidv4()

  const sendOut: SendOut = {
    id,
    sampleId: input.sampleId,
    referenceLabId: input.referenceLabId,
    testRequested: input.testRequested,
    clinicalContext: input.clinicalContext,
    status: 'sent',
    sentAt: serializeHlc(hlc.now()),
    receivedAt: null,
    processingStartedAt: null,
    resultsAvailableAt: null,
    cancelledAt: null,
    shippingManifestId: uuidv4(),
    referralFormId: uuidv4(),
    resultId: null,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: serializeHlc(hlc.now()) },
  }

  await createSendOut(sendOut)

  reportSendOutAuditEvent({
    action: 'SENDOUT_CREATED',
    sendOutId: id,
    referenceLabId: input.referenceLabId,
    actorId,
    timestamp: now,
  })

  return sendOut
}

/**
 * Update a send-out's status through the pipeline.
 * Only forward transitions are allowed; cancelled is always allowed.
 * Throws if the requested transition is invalid.
 */
export async function updateSendOutStatus(
  sendOutId: string,
  newStatus: SendOutStatus,
  source: 'manual' | 'import',
  actorId: string,
  notes?: string,
): Promise<SendOut> {
  const db = getDb()
  const existing = await db.send_outs.get(sendOutId)
  if (!existing) throw new Error(`Send-out not found: ${sendOutId}`)

  const allowed = SENDOUT_ALLOWED_TRANSITIONS[existing.status]
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${existing.status} → ${newStatus}`,
    )
  }

  const now = new Date().toISOString()
  const hlcNow = serializeHlc(hlc.now())

  const timestampField: Partial<SendOut> = {}
  if (newStatus === 'received') timestampField.receivedAt = hlcNow
  if (newStatus === 'processing') timestampField.processingStartedAt = hlcNow
  if (newStatus === 'results-available') timestampField.resultsAvailableAt = hlcNow
  if (newStatus === 'cancelled') timestampField.cancelledAt = hlcNow

  const updated: SendOut = {
    ...existing,
    ...timestampField,
    status: newStatus,
    meta: {
      lastUpdated: now,
      versionId: String(Number(existing.meta.versionId) + 1),
    },
    _ultranos: {
      ...existing._ultranos,
      hlcTimestamp: hlcNow,
    },
  }

  await db.send_outs.put(updated)

  const transition: SendOutStatusTransition = {
    id: uuidv4(),
    sendOutId,
    fromStatus: existing.status,
    toStatus: newStatus,
    timestamp: hlcNow,
    updatedBy: actorId,
    source,
    notes,
  }

  await addSendOutTransition(transition)

  reportSendOutAuditEvent({
    action: 'SENDOUT_STATUS_UPDATED',
    sendOutId,
    referenceLabId: existing.referenceLabId,
    actorId,
    timestamp: now,
    details: { fromStatus: existing.status, toStatus: newStatus, source },
  })

  return updated
}

/**
 * Import a result for a send-out.
 * Automatically attributes the result to the reference lab and transitions status to results-available.
 * resultData is persisted to lab_results with attribution metadata.
 */
export async function importSendOutResult(
  sendOutId: string,
  resultData: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const db = getDb()
  const sendOut = await db.send_outs.get(sendOutId)
  if (!sendOut) throw new Error(`Send-out not found: ${sendOutId}`)

  const referenceLab = await db.reference_labs.get(sendOut.referenceLabId)
  if (!referenceLab) throw new Error(`Reference lab not found: ${sendOut.referenceLabId}`)

  const now = new Date().toISOString()
  const resultId = uuidv4()
  const attribution = `Performed at: ${referenceLab.name}, Accreditation #${referenceLab.accreditationNumber}`

  // Persist the attributed result to lab_results
  await db.lab_results.put({
    id: resultId,
    loincCode: sendOut.testRequested.loincCode,
    enteredBy: actorId,
    enteredAt: now,
    status: 'final',
    attribution,
    sourceType: 'reference-lab',
    sendOutId,
    referenceLabId: sendOut.referenceLabId,
    ...resultData,
  } as any)

  // Link result to send-out
  const updated: SendOut = {
    ...sendOut,
    resultId,
    meta: {
      lastUpdated: now,
      versionId: String(Number(sendOut.meta.versionId) + 1),
    },
    _ultranos: { ...sendOut._ultranos, hlcTimestamp: serializeHlc(hlc.now()) },
  }
  await db.send_outs.put(updated)

  // Transition to results-available if not already there
  if (sendOut.status !== 'results-available') {
    await updateSendOutStatus(sendOutId, 'results-available', 'import', actorId)
  }

  reportSendOutAuditEvent({
    action: 'SENDOUT_RESULT_IMPORTED',
    sendOutId,
    referenceLabId: sendOut.referenceLabId,
    actorId,
    timestamp: now,
    details: { resultId },
  })
}

/**
 * Generate a data-minimized referral form for a send-out.
 * Contains ONLY: patient first name + age, sample type, test requested,
 * clinical context. NO additional PHI (CLAUDE.md Rule #7).
 */
export function generateReferralForm(
  sendOut: SendOut,
  sample: FhirSpecimen,
  referenceLab: ReferenceLab,
  patientFirstName: string,
  patientAge: number,
  originatingLabName: string,
): ReferralForm {
  const sampleType =
    (sample._ultranos as any)?.sampleType ??
    sample.type?.coding?.[0]?.display ??
    'Unknown'

  return {
    id: sendOut.referralFormId ?? uuidv4(),
    sendOutId: sendOut.id,
    // Data-minimized: first name + age ONLY (CLAUDE.md Rule #7)
    patientFirstName,
    patientAge,
    sampleType,
    testRequested: sendOut.testRequested,
    clinicalContext: sendOut.clinicalContext,
    originatingLabName,
    referenceLabName: referenceLab.name,
    referenceLabAccreditationNumber: referenceLab.accreditationNumber,
    dateSent: sendOut.sentAt,
  }
}

/**
 * Generate a shipping manifest for multiple send-outs going to the same reference lab.
 */
export function generateShippingManifest(
  sendOuts: SendOut[],
  referenceLab: ReferenceLab,
): ShippingManifest {
  return {
    id: sendOuts[0]?.shippingManifestId ?? uuidv4(),
    referenceLabId: referenceLab.id,
    referenceLabName: referenceLab.name,
    sendOutIds: sendOuts.map((s) => s.id),
    items: sendOuts.map((s) => ({
      sendOutId: s.id,
      sampleId: s.sampleId,
      loincCode: s.testRequested.loincCode,
      loincDisplay: s.testRequested.loincDisplay,
    })),
    createdAt: new Date().toISOString(),
  }
}

export { getSendOutsByStatus, getSendOutsForSample }
