import type { FhirMedicationRequestZod } from '@ultranos/shared-types'
import { PrescriptionStatus } from '@ultranos/shared-types'
import type { PrescriptionFormData } from '@/lib/prescription-config'
import { FREQUENCY_OPTIONS, ROUTE_OPTIONS } from '@/lib/prescription-config'
import { hlc, serializeHlc } from '@/lib/hlc'

interface MappingContext {
  encounterId: string
  patientId: string
  practitionerRef: string
}

export interface InteractionContext {
  interactionCheckResult: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactionOverrideReason?: string
}

/**
 * Read the brand/manufacturer this mapper writes into medicationCodeableConcept.coding.
 * Lets display surfaces (e.g. the pending-prescription list) enrich a row with brand
 * details without re-deriving them. Safe on undefined coding.
 */
export function readBrandFromCoding(
  coding: ReadonlyArray<{ system?: string; code?: string; display?: string }> | undefined,
): { brand?: string; manufacturer?: string } {
  return {
    brand: coding?.find((c) => c.system === 'urn:ultranos:brand')?.display,
    manufacturer: coding?.find((c) => c.system === 'urn:ultranos:manufacturer')?.display,
  }
}

/**
 * Read the pharmacy performer this mapper writes into dispenseRequest.performer.
 * Lets display surfaces enrich a prescription row with the dispensing pharmacy
 * without re-deriving the reference. Safe on undefined dispenseRequest/performer.
 */
export function readPerformerFromDispenseRequest(
  rx: { dispenseRequest?: { performer?: { reference?: string; display?: string } } },
): { pharmacyId?: string; pharmacyName?: string } {
  const ref = rx.dispenseRequest?.performer?.reference
  return {
    pharmacyId: ref?.startsWith('Organization/') ? ref.slice('Organization/'.length) : undefined,
    pharmacyName: rx.dispenseRequest?.performer?.display,
  }
}

export function mapFormToMedicationRequest(
  form: PrescriptionFormData,
  context: MappingContext,
  interactionCtx?: InteractionContext,
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

  const routeOption = form.route ? ROUTE_OPTIONS.find((r) => r.code === form.route) : undefined
  // Build the display text from present parts only — skip an empty strength so it
  // never renders as "Amoxicillin  (Capsule)" with a doubled space.
  const medText = [form.medicationDisplay, form.medicationStrength.trim(), form.medicationForm ? `(${form.medicationForm})` : '']
    .filter((p) => p !== '')
    .join(' ')

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
        ...(form.brandHint
          ? [{ system: 'urn:ultranos:brand', code: form.brandHint, display: form.brandHint }]
          : []),
        ...(form.medicationManufacturer
          ? [{ system: 'urn:ultranos:manufacturer', code: form.medicationManufacturer, display: form.medicationManufacturer }]
          : []),
      ],
      text: medText,
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
        route: routeOption
          ? {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: routeOption.snomedCode,
                  display: routeOption.display,
                },
              ],
            }
          : undefined,
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
      performer: form.pharmacyId ? { reference: 'Organization/' + form.pharmacyId, display: form.pharmacyName } : undefined,
    },
    note: form.notes
      ? [{ text: form.notes, time: nowIso }]
      : undefined,
    _ultranos: {
      prescriptionStatus: PrescriptionStatus.ACTIVE,
      interactionCheckResult: interactionCtx?.interactionCheckResult ?? 'UNAVAILABLE',
      ...(interactionCtx?.interactionOverrideReason
        ? { interactionOverrideReason: interactionCtx.interactionOverrideReason }
        : {}),
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
