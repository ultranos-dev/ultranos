import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 Condition — subset used for diagnosis entry (ICD-10)
// Ref: https://hl7.org/fhir/R4/condition.html

const ConditionClinicalStatusSchema = z.enum([
  'active',
  'recurrence',
  'relapse',
  'inactive',
  'remission',
  'resolved',
])

const ConditionCategorySchema = z.enum([
  'encounter-diagnosis',
  'problem-list-item',
])

export const FhirConditionSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Condition'),
  clinicalStatus: z.object({
    coding: z.array(
      z.object({
        system: z.literal(
          'http://terminology.hl7.org/CodeSystem/condition-clinical',
        ),
        code: ConditionClinicalStatusSchema,
      }),
    ),
  }),
  category: z
    .array(
      z.object({
        coding: z.array(
          z.object({
            system: z.literal(
              'http://terminology.hl7.org/CodeSystem/condition-category',
            ),
            code: ConditionCategorySchema,
          }),
        ),
      }),
    )
    .optional(),
  code: CodeableConceptSchema,
  subject: ReferenceSchema,
  encounter: ReferenceSchema,
  recordedDate: z.string().datetime().optional(),
  _ultranos: z.object({
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
    diagnosisRank: z.enum(['primary', 'secondary']),
  }),
  meta: FhirMetaSchema,
})

export type FhirCondition = z.infer<typeof FhirConditionSchema>
