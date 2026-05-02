import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 AllergyIntolerance Zod Schema
// Ref: https://hl7.org/fhir/R4/allergyintolerance.html

const AllergyIntoleranceClinicalStatusSchema = z.enum([
  'active',
  'inactive',
  'resolved',
])

const AllergyIntoleranceVerificationStatusSchema = z.enum([
  'unconfirmed',
  'confirmed',
])

const AllergyIntoleranceTypeSchema = z.enum([
  'allergy',
  'intolerance',
])

const AllergyIntoleranceCriticalitySchema = z.enum([
  'low',
  'high',
  'unable-to-assess',
])

const AllergyIntoleranceUltranosExtSchema = z.object({
  substanceFreeText: z.string().optional(),
  createdAt: z.string().datetime(),
  recordedByRole: z.string(),
  isOfflineCreated: z.boolean(),
  hlcTimestamp: z.string(),
})

export const FhirAllergyIntoleranceSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('AllergyIntolerance'),
  clinicalStatus: z.object({
    coding: z.array(
      z.object({
        system: z.literal(
          'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        ),
        code: AllergyIntoleranceClinicalStatusSchema,
      }),
    ),
  }),
  verificationStatus: z.object({
    coding: z.array(
      z.object({
        system: z.literal(
          'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
        ),
        code: AllergyIntoleranceVerificationStatusSchema,
      }),
    ),
  }),
  type: AllergyIntoleranceTypeSchema,
  criticality: AllergyIntoleranceCriticalitySchema,
  code: CodeableConceptSchema,
  patient: ReferenceSchema,
  recordedDate: z.string().datetime().optional(),
  recorder: ReferenceSchema.optional(),
  _ultranos: AllergyIntoleranceUltranosExtSchema,
  meta: FhirMetaSchema,
})

export type FhirAllergyIntolerance = z.infer<typeof FhirAllergyIntoleranceSchema>
