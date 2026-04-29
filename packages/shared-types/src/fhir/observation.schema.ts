import { z } from 'zod'
import {
  CodingSchema,
  CodeableConceptSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 Observation — subset used for vital signs charting
// Ref: https://hl7.org/fhir/R4/observation.html

const ObservationStatusSchema = z.enum([
  'registered',
  'preliminary',
  'final',
  'amended',
  'corrected',
  'cancelled',
  'entered-in-error',
  'unknown',
])

const QuantitySchema = z.object({
  value: z.number(),
  unit: z.string(),
  system: z.string().optional(),
  code: z.string().optional(),
})

const ObservationComponentSchema = z.object({
  code: CodeableConceptSchema,
  valueQuantity: QuantitySchema.optional(),
})

export const FhirObservationSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Observation'),
  status: ObservationStatusSchema,
  category: z.array(CodeableConceptSchema).optional(),
  code: CodeableConceptSchema,
  subject: z.object({
    reference: z.string(),
    display: z.string().optional(),
  }),
  encounter: z.object({
    reference: z.string(),
    display: z.string().optional(),
  }),
  effectiveDateTime: z.string().datetime(),
  valueQuantity: QuantitySchema.optional(),
  component: z.array(ObservationComponentSchema).optional(),
  _ultranos: z.object({
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
  }),
  meta: FhirMetaSchema,
})

export type FhirObservation = z.infer<typeof FhirObservationSchema>
