import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 MedicationStatement Zod Schema
// Ref: https://hl7.org/fhir/R4/medicationstatement.html

const MedicationStatementStatusSchema = z.enum([
  'active',
  'completed',
  'entered-in-error',
  'intended',
  'stopped',
  'on-hold',
])

const EffectivePeriodSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime().optional(),
})

export const FhirMedicationStatementSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('MedicationStatement'),
  status: MedicationStatementStatusSchema,
  medicationCodeableConcept: CodeableConceptSchema,
  subject: ReferenceSchema,
  effectivePeriod: EffectivePeriodSchema.optional(),
  dateAsserted: z.string().datetime(),
  informationSource: ReferenceSchema.optional(),
  _ultranos: z.object({
    createdAt: z.string().datetime(),
    sourceEncounterId: z.string().uuid().optional(),
    sourcePrescriptionId: z.string().uuid().optional(),
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
  }),
  meta: FhirMetaSchema,
})

export type FhirMedicationStatementZod = z.infer<typeof FhirMedicationStatementSchema>
