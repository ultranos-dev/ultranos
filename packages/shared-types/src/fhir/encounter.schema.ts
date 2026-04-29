import { z } from 'zod'
import {
  CodingSchema,
  CodeableConceptSchema,
  FhirMetaSchema,
  FhirDateTimeOrDateSchema,
} from './common.schema.js'

// FHIR R4 Encounter Zod Schema
// Ref: https://hl7.org/fhir/R4/encounter.html

const EncounterStatusSchema = z.enum([
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
  'cancelled',
  'entered-in-error',
  'unknown',
])

const EncounterParticipantSchema = z.object({
  type: z.array(z.object({
    coding: z.array(CodingSchema),
  })).optional(),
  individual: z.object({
    reference: z.string(),
    display: z.string().optional(),
  }),
})

const PeriodSchema = z.object({
  start: FhirDateTimeOrDateSchema.optional(),
  end: FhirDateTimeOrDateSchema.optional(),
})

export const FhirEncounterSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Encounter'),
  status: EncounterStatusSchema,
  class: CodingSchema,
  type: z.array(CodeableConceptSchema).optional(),
  subject: z.object({
    reference: z.string(), // Patient/{id}
    display: z.string().optional(),
  }),
  participant: z.array(EncounterParticipantSchema).optional(),
  period: PeriodSchema,
  reasonCode: z.array(CodeableConceptSchema).optional(),
  diagnosis: z.array(z.object({
    condition: z.object({
      reference: z.string(),
      display: z.string().optional(),
    }),
    use: CodeableConceptSchema.optional(),
    rank: z.number().int().positive().optional(),
  })).optional(),
  _ultranos: z.object({
    clinicId: z.string().optional(),
    soapNoteId: z.string().uuid().optional(),
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
  }),
  meta: FhirMetaSchema,
})

export type FhirEncounterZod = z.infer<typeof FhirEncounterSchema>
