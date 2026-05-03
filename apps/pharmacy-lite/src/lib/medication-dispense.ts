import { hlc, serializeHlc } from '@/lib/hlc'
import type { FulfillmentItem } from '@/stores/fulfillment-store'
import type { FhirMedicationDispense } from '@ultranos/shared-types'

export type LocalMedicationDispense = FhirMedicationDispense

/**
 * Maps a fulfilled prescription item to a FHIR R4 MedicationDispense resource.
 * Each selected FulfillmentItem becomes one MedicationDispense record.
 */
export function createMedicationDispense(
  item: FulfillmentItem,
  pharmacistId: string,
  fulfillmentContext?: { fulfilledCount: number; totalCount: number },
): FhirMedicationDispense {
  const { prescription, brandName, batchLot } = item
  const now = new Date().toISOString()
  const ts = hlc.now()
  const hlcString = serializeHlc(ts)

  const dosageText = [
    `${prescription.dos.qty} ${prescription.dos.unit}`,
    prescription.dos.freqN ? `${prescription.dos.freqN}× per ${prescription.dos.perU === 'd' ? 'day' : prescription.dos.perU ?? 'day'}` : null,
    `for ${prescription.dur} days`,
  ].filter(Boolean).join(', ')

  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    status: 'completed',
    medicationCodeableConcept: {
      coding: [
        {
          system: 'urn:ultranos:medication',
          code: prescription.med,
          display: prescription.medN,
        },
      ],
      text: prescription.medT,
    },
    subject: { reference: `Patient/${prescription.pat}` },
    performer: [
      { actor: { reference: `Practitioner/${pharmacistId}` } },
    ],
    authorizingPrescription: [
      { reference: `MedicationRequest/${prescription.id}` },
    ],
    whenHandedOver: now,
    dosageInstruction: [{ text: dosageText }],
    _ultranos: {
      hlcTimestamp: hlcString,
      createdAt: now,
      ...(brandName ? { brandName } : {}),
      ...(batchLot ? { batchLot } : {}),
      isOfflineCreated: typeof navigator !== 'undefined' ? !navigator.onLine : true,
      ...(fulfillmentContext ? {
        fulfilledCount: fulfillmentContext.fulfilledCount,
        totalCount: fulfillmentContext.totalCount,
      } : {}),
    },
    meta: {
      lastUpdated: now,
      versionId: '1',
    },
  }
}
