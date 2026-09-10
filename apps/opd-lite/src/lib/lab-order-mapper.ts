import type { FhirServiceRequest } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'

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
