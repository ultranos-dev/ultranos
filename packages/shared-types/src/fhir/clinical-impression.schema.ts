import { z } from 'zod'
import { ReferenceSchema, FhirMetaSchema } from './common.schema.js'

// FHIR R4 ClinicalImpression (subset for SOAP notes)
// Ref: https://hl7.org/fhir/R4/clinicalimpression.html

const ClinicalImpressionStatusSchema = z.enum([
  'in-progress',
  'completed',
  'entered-in-error',
])

const AnnotationSchema = z.object({
  authorReference: ReferenceSchema.optional(),
  time: z.string().datetime().optional(),
  text: z.string().min(1),
})

export const ClinicalImpressionNoteSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('ClinicalImpression'),
  status: ClinicalImpressionStatusSchema,
  subject: ReferenceSchema,
  encounter: ReferenceSchema,
  assessor: ReferenceSchema.optional(),
  date: z.string().datetime().optional(),
  note: z.array(AnnotationSchema).optional(),
  _ultranos: z.object({
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
  }),
  meta: FhirMetaSchema,
})

export type ClinicalImpressionNote = z.infer<typeof ClinicalImpressionNoteSchema>
