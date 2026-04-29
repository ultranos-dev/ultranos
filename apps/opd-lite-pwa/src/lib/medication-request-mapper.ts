import type { FhirMedicationRequestZod } from '@ultranos/shared-types'
import { PrescriptionStatus } from '@ultranos/shared-types'
import type { PrescriptionFormData } from '@/lib/prescription-config'
import { FREQUENCY_OPTIONS } from '@/lib/prescription-config'
import { hlc, serializeHlc } from '@/lib/hlc'

interface MappingContext {
  encounterId: string
  patientId: string
  practitionerRef: string
}

export function mapFormToMedicationRequest(
  form: PrescriptionFormData,
  context: MappingContext,
): FhirMedicationRequestZod {
  if (!context.encounterId?.trim()) {
    throw new Error('encounterId is required')
  }
  if (!context.patientId?.trim()) {
    throw new Error('patientId is required')
  }
  if (!form.medicationCode?.trim()) {
    throw new Error('medicationCode is required')
  }

  const nowIso = new Date().toISOString()
  const ts = hlc.now()

  const freqOption = FREQUENCY_OPTIONS.find((f) => f.code === form.frequencyCode)
  const dosageQty = parseFloat(form.dosageQuantity)
  const durationDays = parseInt(form.durationDays, 10)

  if (!Number.isFinite(dosageQty) || dosageQty <= 0 || dosageQty > 1000) {
    throw new Error('dosageQuantity must be between 0.25 and 1000')
  }
  if (!Number.isFinite(durationDays) || durationDays <= 0 || durationDays > 365) {
    throw new Error('durationDays must be between 1 and 365')
  }

  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [
        {
          system: 'urn:ultranos:formulary',
          code: form.medicationCode,
          display: form.medicationDisplay,
        },
      ],
      text: `${form.medicationDisplay} ${form.medicationStrength} (${form.medicationForm})`,
    },
    subject: {
      reference: `Patient/${context.patientId}`,
    },
    encounter: {
      reference: `Encounter/${context.encounterId}`,
    },
    requester: {
      reference: context.practitionerRef,
    },
    authoredOn: nowIso,
    dosageInstruction: [
      {
        sequence: 1,
        text: freqOption?.asNeeded
          ? `${form.dosageQuantity} ${form.dosageUnit}, ${freqOption.display}`
          : `${form.dosageQuantity} ${form.dosageUnit}, ${freqOption?.display ?? form.frequencyCode}, for ${form.durationDays} days`,
        timing: freqOption && !freqOption.asNeeded
          ? {
              repeat: {
                frequency: freqOption.frequency,
                period: freqOption.period,
                periodUnit: freqOption.periodUnit,
              },
              code: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation',
                    code: freqOption.code,
                    display: freqOption.display,
                  },
                ],
              },
            }
          : undefined,
        asNeededBoolean: freqOption?.asNeeded === true ? true : undefined,
        doseAndRate: [
          {
            doseQuantity: {
              value: dosageQty,
              unit: form.dosageUnit,
            },
          },
        ],
      },
    ],
    dispenseRequest: {
      expectedSupplyDuration: {
        value: durationDays,
        unit: 'd',
      },
    },
    note: form.notes
      ? [{ text: form.notes, time: nowIso }]
      : undefined,
    _ultranos: {
      prescriptionStatus: PrescriptionStatus.ACTIVE,
      interactionCheckResult: 'UNAVAILABLE',
      isOfflineCreated: true,
      hlcTimestamp: serializeHlc(ts),
      createdAt: nowIso,
    },
    meta: {
      lastUpdated: nowIso,
      versionId: '1',
    },
  }
}
