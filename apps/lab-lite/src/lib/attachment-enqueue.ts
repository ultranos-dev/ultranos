/**
 * attachment-enqueue.ts
 *
 * Pure helper for enqueueing result photo/document attachments into the
 * upload queue.  Extracted so that both the enter-result page and tests can
 * exercise the REAL enqueue logic rather than a duplicate re-implementation.
 *
 * PHI rule: nothing about the patient beyond the opaque ref and first name
 * reaches this helper — see CLAUDE.md Rules #1 & #7.
 */

import { addToQueue } from '@/lib/db'
import type { PreparedAttachment } from '@/components/attachments/AttachmentPicker'

export interface EnqueueContext {
  patientRef: string
  patientFirstName: string
  loincCode: string
  loincDisplay: string
  /** May be a full ISO datetime — will be normalised to YYYY-MM-DD internally. */
  collectionDate: string
}

/**
 * Enqueue each attachment into the upload queue.
 *
 * All attachments for one submit share a single generated `diagnosticReportId`
 * so the hub can upsert them into one DiagnosticReport.
 *
 * @returns The shared `diagnosticReportId` on success, or `null` when there is
 *          nothing to enqueue (empty attachment list).
 * @throws  `EmptyPatientRefError` when `ctx.patientRef` is empty — the caller
 *          must surface a user-visible error and must NOT silently enqueue.
 */
export async function enqueueResultAttachments(
  attachments: PreparedAttachment[],
  ctx: EnqueueContext,
): Promise<string | null> {
  if (attachments.length === 0) return null

  if (!ctx.patientRef) {
    throw new EmptyPatientRefError(
      '[attachment-enqueue] patientRef is empty — cannot enqueue attachments (no patient association)',
    )
  }

  // Normalise to date-only (YYYY-MM-DD) regardless of whether a full ISO
  // datetime was supplied.  The hub uploadResult endpoint requires this format.
  const collectionDate = ctx.collectionDate.slice(0, 10)

  const reportId = crypto.randomUUID()

  for (const att of attachments) {
    await addToQueue({
      file: att.blob,
      fileName: att.fileName,
      fileType: att.fileType,
      patientRef: ctx.patientRef,
      patientFirstName: ctx.patientFirstName,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      lastAttemptAt: null,
      metadata: {
        kind: 'result',
        diagnosticReportId: reportId,
        loincCode: ctx.loincCode,
        loincDisplay: ctx.loincDisplay,
        collectionDate,
      },
    })
  }

  return reportId
}

/** Thrown when `patientRef` is empty — caller must surface a user-visible error. */
export class EmptyPatientRefError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptyPatientRefError'
  }
}

/** Thrown when `specimenId` is empty — caller must not enqueue without a specimen target. */
export class EmptySpecimenIdError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptySpecimenIdError'
  }
}

export interface EnqueueSpecimenContext {
  specimenId: string
  patientRef: string
  attachmentContext: 'receipt' | 'rejection'
  patientFirstName?: string
}

/**
 * Enqueue each attachment into the upload queue as `kind:'specimen'` entries.
 *
 * Used after `accessionSample` resolves so `specimenId` (the `labSampleId`) is
 * available.  One call per submit; each attachment becomes an independent queue
 * entry routed to `uploadSpecimenFile` on the hub.
 *
 * @throws `EmptySpecimenIdError` when `ctx.specimenId` is empty.
 * @throws `EmptyPatientRefError` when `ctx.patientRef` is empty.
 */
export async function enqueueSpecimenAttachments(
  attachments: PreparedAttachment[],
  ctx: EnqueueSpecimenContext,
): Promise<void> {
  if (attachments.length === 0) return

  if (!ctx.specimenId) {
    throw new EmptySpecimenIdError(
      '[attachment-enqueue] specimenId is empty — cannot enqueue specimen attachments (no specimen association)',
    )
  }

  if (!ctx.patientRef) {
    throw new EmptyPatientRefError(
      '[attachment-enqueue] patientRef is empty — cannot enqueue specimen attachments (no patient association)',
    )
  }

  const collectionDate = new Date().toISOString().slice(0, 10)

  for (const att of attachments) {
    await addToQueue({
      file: att.blob,
      fileName: att.fileName,
      fileType: att.fileType,
      patientRef: ctx.patientRef,
      patientFirstName: ctx.patientFirstName ?? '',
      queuedAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      lastAttemptAt: null,
      metadata: {
        kind: 'specimen',
        specimenId: ctx.specimenId,
        attachmentContext: ctx.attachmentContext,
        loincCode: '',
        loincDisplay: '',
        collectionDate,
      },
    })
  }
}
