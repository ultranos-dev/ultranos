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
