import type { FhirServiceRequest } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'
import { LAB_TEST_CATALOG, type LabOrderPriority } from '@/lib/lab-test-catalog'

/**
 * Minimal input a clinician provides to order a lab test. The order-entry UI
 * collects these; the mapper turns them into a FHIR R4 ServiceRequest.
 *
 * PHI note: `reasonText` and `note` are clinical PHI — synced encrypted at the
 * Hub (order_reason_code / order_note) and never returned to Lab-Lite.
 * `specialInstructions` is an operational lab-handling field that DOES reach the
 * lab via lab.pullOrders — must not contain patient identifiers.
 */
export interface LabOrderInput {
  testCode: string
  testDisplay: string
  /** Coding system for the test code — defaults to LOINC. */
  testSystem?: string
  priority?: 'routine' | 'urgent' | 'asap' | 'stat'
  reasonText?: string
  note?: string
  specialInstructions?: string
  /** Optional assigned lab (non-binding routing hint) — sets ServiceRequest.performer. */
  labId?: string
  labName?: string
}

interface MappingContext {
  encounterId: string
  patientId: string
  practitionerRef: string
}

export function mapInputToServiceRequest(
  input: LabOrderInput,
  context: MappingContext,
): FhirServiceRequest {
  if (!context.encounterId?.trim()) {
    throw new Error('encounterId is required')
  }
  if (!context.patientId?.trim()) {
    throw new Error('patientId is required')
  }
  if (!input.testCode?.trim()) {
    throw new Error('testCode is required')
  }

  const nowIso = new Date().toISOString()
  const ts = hlc.now()

  return {
    id: crypto.randomUUID(),
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    ...(input.priority ? { priority: input.priority } : {}),
    code: {
      coding: [
        {
          system: input.testSystem ?? 'http://loinc.org',
          code: input.testCode,
          display: input.testDisplay,
        },
      ],
      text: input.testDisplay,
    },
    subject: { reference: `Patient/${context.patientId}` },
    encounter: { reference: `Encounter/${context.encounterId}` },
    requester: { reference: context.practitionerRef },
    ...(input.labId
      ? { performer: { reference: `Organization/${input.labId}`, display: input.labName } }
      : {}),
    authoredOn: nowIso,
    ...(input.reasonText?.trim() ? { reasonCode: [{ text: input.reasonText }] } : {}),
    ...(input.note?.trim() ? { note: [{ text: input.note, time: nowIso }] } : {}),
    _ultranos: {
      isOfflineCreated: true,
      hlcTimestamp: serializeHlc(ts),
      createdAt: nowIso,
      ...(input.specialInstructions?.trim()
        ? { specialInstructions: input.specialInstructions }
        : {}),
    },
    meta: {
      lastUpdated: nowIso,
      versionId: '1',
    },
  }
}

/**
 * Read the assigned lab this mapper writes into ServiceRequest.performer. Lets
 * display surfaces surface the chosen lab without re-deriving it. Safe on
 * undefined performer. Mirrors readPerformerFromDispenseRequest for prescriptions.
 */
export function readLabFromServiceRequest(
  sr: { performer?: { reference?: string; display?: string } },
): { labId?: string; labName?: string } {
  const ref = sr.performer?.reference
  return {
    labId: ref?.startsWith('Organization/') ? ref.slice('Organization/'.length) : undefined,
    labName: sr.performer?.display,
  }
}

/** Enriched, display-ready view of a lab order — the lab analogue of the enriched
 *  prescription row. Derived purely from the ServiceRequest; no PHI leaves it. */
export interface LabOrderDisplay {
  testName: string
  code?: string
  category?: string
  priority: LabOrderPriority
  reason?: string
  specialInstructions?: string
  note?: string
  labName?: string
  status: string
  locked: boolean
}

const CATEGORY_BY_CODE = new Map<string, string>(LAB_TEST_CATALOG.map((i) => [i.code, i.category]))

/**
 * A lab order is locked (read-only) once a lab has started work on it — signalled
 * by a non-`active` status (e.g. `on-hold` after lab.acknowledgeOrder) or a
 * `receivedAt` stamp. Editing a started order is not allowed.
 */
export function isLabOrderLocked(sr: FhirServiceRequest): boolean {
  return sr.status !== 'active' || !!sr._ultranos.receivedAt
}

/** Project a ServiceRequest into the enriched row view model. */
export function readLabOrderDisplay(sr: FhirServiceRequest): LabOrderDisplay {
  const coding = sr.code.coding?.[0]
  const code = coding?.code
  const category = code ? CATEGORY_BY_CODE.get(code) : undefined
  return {
    testName: sr.code.text ?? coding?.display ?? code ?? '',
    ...(code ? { code } : {}),
    ...(category ? { category } : {}),
    priority: (sr.priority ?? 'routine') as LabOrderPriority,
    ...(sr.reasonCode?.[0]?.text ? { reason: sr.reasonCode[0].text } : {}),
    ...(sr._ultranos.specialInstructions ? { specialInstructions: sr._ultranos.specialInstructions } : {}),
    ...(sr.note?.[0]?.text ? { note: sr.note[0].text } : {}),
    ...(sr.performer?.display ? { labName: sr.performer.display } : {}),
    status: sr.status,
    locked: isLabOrderLocked(sr),
  }
}

/**
 * Apply an edit to an existing lab order: replace the editable clinical fields
 * (test code, priority, reason, note, special instructions) while preserving the
 * order's identity, provenance, assigned lab, and any lab-received state. Bumps
 * the version and stamps a fresh HLC so the edit wins by Tier-2 timestamp merge.
 * Pure — the store persists + syncs the result.
 */
export function applyInputToServiceRequest(
  existing: FhirServiceRequest,
  input: LabOrderInput,
): FhirServiceRequest {
  const nowIso = new Date().toISOString()
  const ts = hlc.now()
  const nextVersion = String((parseInt(existing.meta.versionId ?? '0', 10) || 0) + 1)

  return {
    ...existing,
    priority: input.priority,
    code: {
      coding: [
        {
          system: input.testSystem ?? 'http://loinc.org',
          code: input.testCode,
          display: input.testDisplay,
        },
      ],
      text: input.testDisplay,
    },
    reasonCode: input.reasonText?.trim() ? [{ text: input.reasonText }] : undefined,
    note: input.note?.trim() ? [{ text: input.note, time: nowIso }] : undefined,
    _ultranos: {
      ...existing._ultranos,
      hlcTimestamp: serializeHlc(ts),
      specialInstructions: input.specialInstructions?.trim() ? input.specialInstructions : undefined,
    },
    meta: {
      ...existing.meta,
      lastUpdated: nowIso,
      versionId: nextVersion,
    },
  }
}
