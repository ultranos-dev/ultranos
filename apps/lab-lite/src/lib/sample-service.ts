/**
 * Sample Accessioning Service — Story 42.3
 *
 * Handles: sample creation (accession), status pipeline transitions,
 * rejection with physician notification, and custody handoff recording.
 *
 * PHI rules (CLAUDE.md Rule #7):
 *  - subject.reference stored as Patient/<uuid> — never the patient name.
 *  - Audit metadata uses opaque IDs — never patient name or diagnosis.
 *  - Rejection notifications contain only IDs and rejection reason.
 */

import type { FhirSpecimen, SampleCondition } from '@ultranos/shared-types'
import type { PipelineStatus } from '@ultranos/shared-types'
import type { CustodyEvent } from '@/types/custody-event'
import {
  putSample,
  getSampleById,
  addCustodyEvent,
  enqueueSyncEvent,
  updateOrderStatus,
  getDb,
  getReceivedSampleForOrder,
  isSampleArchived,
  setArchivedFlag,
} from './db'
import { generateSampleId } from './sample-id'
import { hlc, serializeHlc } from './hlc'
import { reportSampleAuditEvent } from './audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface AccessionInput {
  /** FHIR ServiceRequest id (the order this sample belongs to) */
  orderId: string
  /** Sample specimen type (blood / urine / swab / csf / stool / other) */
  sampleType: string
  /** Condition at receipt */
  condition: SampleCondition
  /** Opaque practitioner id of the person who handed over the sample */
  receivedFromId: string
  /** Optional tech notes — never include patient name */
  notes?: string
  /** Opaque Patient/<uuid> reference — never a raw patient name */
  patientRef: string
  /** Lab-configurable ID prefix (defaults to 'LAB') */
  idPrefix?: string
  /**
   * Data-minimized patient display copy (first name + age ONLY — CLAUDE.md Rule #7)
   * stamped onto the specimen so the worklist can render it without the order row.
   */
  patientFirstName?: string
  patientAge?: number | null
  /** Ordered test(s) copied from the paired order — used for worklist + template resolution. */
  orderedTests?: Array<{ loincCode: string; loincDisplay: string }>
}

// ---------------------------------------------------------------------------
// Allowed pipeline transitions
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  received: ['in-processing'],
  'in-processing': ['completed'],
  completed: ['reported'],
  reported: [],
  rejected: [],
}

function isAllowedTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentActorId(): string {
  return useAuthSessionStore.getState().session?.practitionerId ?? 'unknown'
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Accession an incoming sample.
 * Generates a unique sample ID, creates the FHIR Specimen resource in Dexie,
 * logs the initial custody event, emits an audit event, and enqueues for sync.
 */
export async function accessionSample(input: AccessionInput): Promise<FhirSpecimen> {
  const actorId = getCurrentActorId()
  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  // Generate unique sample ID (inside Dexie transaction)
  const labSampleId = await generateSampleId(input.idPrefix ?? 'LAB')

  const specimenId = crypto.randomUUID()

  const specimen: FhirSpecimen = {
    id: specimenId,
    resourceType: 'Specimen',
    status: 'available',
    type: input.sampleType
      ? { coding: [{ system: 'http://snomed.info/sct', code: input.sampleType, display: input.sampleType }] }
      : undefined,
    subject: { reference: input.patientRef },
    receivedTime: now,
    request: [{ reference: `ServiceRequest/${input.orderId}` }],
    collection: input.receivedFromId
      ? { collector: { reference: `Practitioner/${input.receivedFromId}` } }
      : undefined,
    condition: input.condition !== 'acceptable'
      ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0493', code: input.condition }] }]
      : undefined,
    note: input.notes ? [{ text: input.notes, time: now }] : undefined,
    meta: {
      lastUpdated: now,
      versionId: '1',
    },
    _ultranos: {
      labSampleId,
      hlcTimestamp: hlcTs,
      createdAt: now,
      isOfflineCreated: !navigator.onLine,
      pipelineStatus: 'received',
      sampleCondition: input.condition,
      // Data-minimized display copy so the worklist survives loss of the order row.
      ...(input.patientFirstName ? { patientFirstName: input.patientFirstName } : {}),
      ...(input.patientAge != null ? { patientAge: input.patientAge } : {}),
      ...(input.orderedTests && input.orderedTests.length > 0
        ? { orderedTests: input.orderedTests }
        : {}),
    },
  }

  // Supersede any existing non-rejected specimen for this order so the worklist
  // never shows two active rows after a re-collection.
  // First-time accession (no prior specimen) → lookup returns undefined → no-op.
  //
  // CRITICAL INVARIANT: if the status-write (putSample) for the prior specimen
  // fails, we MUST NOT create the new specimen — that would leave two active rows
  // for the same order.  Let any error from putSample propagate so the caller
  // (ReceiveSampleModal) surfaces it.  Side-effects (custody event, audit, sync)
  // run only after the status-write succeeds and are individually best-effort.
  const priorSpecimen = await getReceivedSampleForOrder(input.orderId)
  if (priorSpecimen) {
    const supersedeNow = new Date().toISOString()
    const supersedeHlcTs = serializeHlc(hlc.now())
    const superseded: FhirSpecimen = {
      ...priorSpecimen,
      status: 'unsatisfactory',
      meta: {
        ...priorSpecimen.meta,
        lastUpdated: supersedeNow,
        versionId: String(parseInt(priorSpecimen.meta.versionId ?? '1') + 1),
      },
      _ultranos: {
        ...priorSpecimen._ultranos,
        pipelineStatus: 'rejected',
        rejectionReason: 'superseded-by-recollection',
        hlcTimestamp: supersedeHlcTs,
      },
    }

    // CRITICAL: propagates on failure — new specimen must NOT be created if this throws.
    await putSample(superseded)

    // Side-effects — best-effort; a failure here must not block the workflow.
    try {
      const supersedeCustodyEvent: CustodyEvent = {
        id: crypto.randomUUID(),
        sampleId: priorSpecimen.id,
        eventType: 'rejection',
        fromActorId: actorId,
        toActorId: actorId,
        timestamp: supersedeHlcTs,
        notes: 'superseded-by-recollection',
        fromStatus: priorSpecimen._ultranos.pipelineStatus,
        toStatus: 'rejected',
      }
      await addCustodyEvent(supersedeCustodyEvent)

      reportSampleAuditEvent({
        action: 'SAMPLE_REJECTED',
        sampleId: priorSpecimen.id,
        labSampleId: priorSpecimen._ultranos.labSampleId,
        actorId,
        patientRef: priorSpecimen.subject.reference,
      })

      await enqueueSyncEvent({
        resourceType: 'Specimen',
        resourceId: priorSpecimen.id,
        payload: superseded,
        hlcTimestamp: supersedeHlcTs,
      })
    } catch {
      // Non-fatal: custody event / audit / sync failure must not block creation
      // of the new specimen now that the prior specimen is already marked rejected.
    }
  }

  await putSample(specimen)

  // Best-effort: advance the linked order off RECEIVED so the tombstone
  // reconciliation in useOrderSync cannot cancel an order that now has a
  // physical sample. Non-fatal — accession succeeds even if the order isn't
  // cached locally (e.g. order was pulled by a different device).
  try { await updateOrderStatus(input.orderId, 'IN_PROGRESS') } catch { /* non-fatal */ }

  // Initial custody event: received
  const custodyEvent: CustodyEvent = {
    id: crypto.randomUUID(),
    sampleId: specimenId,
    eventType: 'received',
    fromActorId: input.receivedFromId,
    toActorId: actorId,
    timestamp: hlcTs,
    notes: input.notes,
  }
  await addCustodyEvent(custodyEvent)

  // Audit event — AC 7
  reportSampleAuditEvent({
    action: 'SAMPLE_ACCESSIONED',
    sampleId: specimenId,
    labSampleId,
    actorId,
    patientRef: input.patientRef,
  })

  // Sync queue — AC 8
  await enqueueSyncEvent({
    resourceType: 'Specimen',
    resourceId: specimenId,
    payload: specimen,
    hlcTimestamp: hlcTs,
  })

  return specimen
}

/**
 * Transition a sample through the pipeline.
 * Enforces allowed transitions (received→in-processing→completed→reported).
 * Backward transitions are rejected unless SUPERVISOR/LAB_MANAGER role
 * (RBAC story 42.1; simplified here — future integration point).
 */
export async function transitionSampleStatus(
  sampleId: string,
  newStatus: PipelineStatus,
  actorId: string,
): Promise<void> {
  const specimen = await getSampleById(sampleId)
  if (!specimen) throw new Error(`Sample not found: ${sampleId}`)

  const currentStatus = specimen._ultranos.pipelineStatus
  if (!isAllowedTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${ALLOWED_TRANSITIONS[currentStatus].join(', ') || 'none'}`,
    )
  }

  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  const updated: FhirSpecimen = {
    ...specimen,
    meta: { ...specimen.meta, lastUpdated: now, versionId: String(parseInt(specimen.meta.versionId ?? '1') + 1) },
    _ultranos: { ...specimen._ultranos, pipelineStatus: newStatus, hlcTimestamp: hlcTs },
  }
  await putSample(updated)

  const custodyEvent: CustodyEvent = {
    id: crypto.randomUUID(),
    sampleId,
    eventType: 'status-change',
    fromActorId: actorId,
    toActorId: actorId,
    timestamp: hlcTs,
    fromStatus: currentStatus,
    toStatus: newStatus,
  }
  await addCustodyEvent(custodyEvent)

  reportSampleAuditEvent({
    action: 'SAMPLE_STATUS_CHANGED',
    sampleId,
    labSampleId: specimen._ultranos.labSampleId,
    actorId,
    patientRef: specimen.subject.reference,
    fromStatus: currentStatus,
    toStatus: newStatus,
  })

  await enqueueSyncEvent({
    resourceType: 'Specimen',
    resourceId: sampleId,
    payload: updated,
    hlcTimestamp: hlcTs,
  })
}

/**
 * Archive or unarchive a sample.
 *
 * Archiving moves a sample off the active worklist into the Archived shelf
 * without changing its pipeline status — the flag is orthogonal and fully
 * reversible. Writes a custody event, emits an audit event (Rule #6), and
 * enqueues a sync event so the change propagates to the Hub.
 */
export async function setSampleArchived(
  sampleId: string,
  archived: boolean,
  actorId: string,
): Promise<void> {
  const specimen = await getSampleById(sampleId)
  if (!specimen) throw new Error(`Sample not found: ${sampleId}`)

  // Archive state is authoritative in the dedicated archived_samples table — it
  // survives the samples-table wipe + hub re-hydration that happens every boot
  // (a row-level _ultranos.archived flag does NOT). No-op if already in state.
  const currentlyArchived = await isSampleArchived(sampleId)
  if (currentlyArchived === archived) return

  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  // 1. Authoritative write — the durable marker table.
  await setArchivedFlag(sampleId, archived)

  // 2. Mirror onto the specimen row for immediate display + the sync payload.
  //    (This copy is transient — re-hydration may drop it — hence step 1.)
  const updated: FhirSpecimen = {
    ...specimen,
    meta: {
      ...specimen.meta,
      lastUpdated: now,
      versionId: String(parseInt(specimen.meta.versionId ?? '1') + 1),
    },
    _ultranos: { ...specimen._ultranos, archived, hlcTimestamp: hlcTs },
  }
  await putSample(updated)

  const custodyEvent: CustodyEvent = {
    id: crypto.randomUUID(),
    sampleId,
    eventType: archived ? 'archive' : 'unarchive',
    fromActorId: actorId,
    toActorId: actorId,
    timestamp: hlcTs,
  }
  await addCustodyEvent(custodyEvent)

  reportSampleAuditEvent({
    action: archived ? 'SAMPLE_ARCHIVED' : 'SAMPLE_UNARCHIVED',
    sampleId,
    labSampleId: specimen._ultranos.labSampleId,
    actorId,
    patientRef: specimen.subject.reference,
  })

  await enqueueSyncEvent({
    resourceType: 'Specimen',
    resourceId: sampleId,
    payload: updated,
    hlcTimestamp: hlcTs,
  })
}

/**
 * Reject a sample with a reason.
 * Sets FHIR status to 'unsatisfactory', pipeline status to 'rejected',
 * creates a custody event, and queues a rejection notification to the
 * ordering physician (dispatched via syncQueue).
 */
export async function rejectSample(
  sampleId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const specimen = await getSampleById(sampleId)
  if (!specimen) throw new Error(`Sample not found: ${sampleId}`)

  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  const updated: FhirSpecimen = {
    ...specimen,
    status: 'unsatisfactory',
    meta: { ...specimen.meta, lastUpdated: now, versionId: String(parseInt(specimen.meta.versionId ?? '1') + 1) },
    _ultranos: {
      ...specimen._ultranos,
      pipelineStatus: 'rejected',
      rejectionReason: reason,
      hlcTimestamp: hlcTs,
    },
  }
  await putSample(updated)

  const custodyEvent: CustodyEvent = {
    id: crypto.randomUUID(),
    sampleId,
    eventType: 'rejection',
    fromActorId: actorId,
    toActorId: actorId,
    timestamp: hlcTs,
    notes: reason,
    fromStatus: specimen._ultranos.pipelineStatus,
    toStatus: 'rejected',
  }
  await addCustodyEvent(custodyEvent)

  reportSampleAuditEvent({
    action: 'SAMPLE_REJECTED',
    sampleId,
    labSampleId: specimen._ultranos.labSampleId,
    actorId,
    patientRef: specimen.subject.reference,
  })

  // Extract orderId from FHIR request reference
  const orderRef = specimen.request?.[0]?.reference ?? ''
  const orderId = orderRef.replace('ServiceRequest/', '')

  // Queue rejection notification to ordering physician — data-minimized payload
  // (no patient name, no diagnosis, only IDs and rejection reason)
  await enqueueSyncEvent({
    resourceType: 'RejectionNotification',
    resourceId: sampleId,
    payload: {
      type: 'SAMPLE_REJECTED',
      orderId,
      sampleId,
      labSampleId: specimen._ultranos.labSampleId,
      reason,
      rejectedBy: actorId,
      timestamp: hlcTs,
    },
    hlcTimestamp: hlcTs,
  })

  await enqueueSyncEvent({
    resourceType: 'Specimen',
    resourceId: sampleId,
    payload: updated,
    hlcTimestamp: hlcTs,
  })
}

/**
 * Record a custody handoff between two lab staff members.
 */
export async function recordHandoff(
  sampleId: string,
  fromActorId: string,
  toActorId: string,
  notes?: string,
): Promise<void> {
  const specimen = await getSampleById(sampleId)
  if (!specimen) throw new Error(`Sample not found: ${sampleId}`)

  const hlcTs = serializeHlc(hlc.now())

  const custodyEvent: CustodyEvent = {
    id: crypto.randomUUID(),
    sampleId,
    eventType: 'handoff',
    fromActorId,
    toActorId,
    timestamp: hlcTs,
    notes,
  }
  await addCustodyEvent(custodyEvent)

  reportSampleAuditEvent({
    action: 'SAMPLE_HANDOFF',
    sampleId,
    labSampleId: specimen._ultranos.labSampleId,
    actorId: fromActorId,
    patientRef: specimen.subject.reference,
  })

  await enqueueSyncEvent({
    resourceType: 'CustodyEvent',
    resourceId: custodyEvent.id,
    payload: custodyEvent,
    hlcTimestamp: hlcTs,
  })
}

// Re-export for use in tests and UI
export type { PipelineStatus, SampleCondition }
