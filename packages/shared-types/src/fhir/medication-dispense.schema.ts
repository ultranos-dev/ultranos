import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 MedicationDispense Zod Schema
// Ref: https://hl7.org/fhir/R4/medicationdispense.html

const MedicationDispenseStatusSchema = z.enum([
  'preparation',
  'in-progress',
  'cancelled',
  'on-hold',
  'completed',
  'entered-in-error',
  'stopped',
  'declined',
  'unknown',
])

const SimpleQuantitySchema = z.object({
  value: z.number(),
  unit: z.string(),
  system: z.string().optional(),
  code: z.string().optional(),
})

const MedicationDispenseUltranosExtSchema = z.object({
  hlcTimestamp: z.string(),
  brandName: z.string().optional(),
  batchLot: z.string().optional(),
  // Controlled-substance schedule (II/III/IV/V) captured at dispense time from the
  // dispensed CatalogItem.controlledSchedule — powers the Controlled Substances register.
  controlledSubstanceSchedule: z.string().optional(),
  // Override details when a pharmacist dispensed past a surfaced interaction/allergy
  // warning. Story 57.2: carries a STRUCTURED reason code + a real supervisor
  // credential (supervisor practitioner id + PIN) the Hub verifies server-side.
  // `supervisorName` is retained as supplementary display detail only. `reason`
  // is supplementary free text. `attestedOffline` marks an override captured while
  // offline — the Hub records it unverified (drain-time verification) rather than
  // rejecting a committed dispense.
  reviewOverride: z
    .object({
      reason: z.string(),
      supervisorName: z.string(),
      reasonCode: z.string(),
      supervisorId: z.string(),
      supervisorPin: z.string(),
      attestedOffline: z.boolean().optional(),
    })
    .optional(),
  isOfflineCreated: z.boolean(),
  createdAt: z.string().datetime(),
  fulfillmentContext: z.string().optional(),
  fulfilledCount: z.number().int().nonnegative().optional(),
  totalCount: z.number().int().nonnegative().optional(),
})

export const FhirMedicationDispenseSchema = z
  .object({
    id: z.string().uuid(),
    resourceType: z.literal('MedicationDispense'),
    status: MedicationDispenseStatusSchema,
    medicationCodeableConcept: CodeableConceptSchema,
    subject: ReferenceSchema,
    performer: z
      .array(
        z.object({
          actor: ReferenceSchema,
        }),
      )
      .optional(),
    authorizingPrescription: z.array(ReferenceSchema).optional(),
    quantity: SimpleQuantitySchema.optional(),
    whenHandedOver: z.string().datetime().optional(),
    dosageInstruction: z.array(z.object({ text: z.string() })).optional(),
    _ultranos: MedicationDispenseUltranosExtSchema,
    meta: FhirMetaSchema,
  })
  .refine(
    (val) => val.status !== 'completed' || val.whenHandedOver !== undefined,
    {
      message: 'whenHandedOver is required when status is completed',
      path: ['whenHandedOver'],
    },
  )

export type FhirMedicationDispense = z.infer<typeof FhirMedicationDispenseSchema>
