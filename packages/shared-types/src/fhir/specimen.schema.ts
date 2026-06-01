import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 Specimen Zod Schema
// Ref: https://hl7.org/fhir/R4/specimen.html

export const SpecimenStatusSchema = z.enum([
  'available',
  'unavailable',
  'unsatisfactory',
  'entered-in-error',
])

export type SpecimenStatus = z.infer<typeof SpecimenStatusSchema>

/**
 * Pipeline status tracks lab workflow state — separate from FHIR status which
 * tracks specimen viability.
 */
export const PipelineStatusSchema = z.enum([
  'received',
  'in-processing',
  'completed',
  'reported',
  'rejected',
])

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>

export const SampleConditionSchema = z.enum([
  'acceptable',
  'hemolyzed',
  'clotted',
  'insufficient',
  'mislabeled',
])

export type SampleCondition = z.infer<typeof SampleConditionSchema>

/** Transit status for samples moving between network locations. Story 54.1 / Task 10 */
export const TransitStatusSchema = z.enum([
  'at-origin',
  'in-transit',
  'received-at-main',
  'result-routed-back',
])

export type TransitStatus = z.infer<typeof TransitStatusSchema>

const SpecimenUltranosExtSchema = z.object({
  labSampleId: z.string(), // format: LAB-YYYYMMDD-NNNN
  hlcTimestamp: z.string(),
  createdAt: z.string().datetime(),
  isOfflineCreated: z.boolean(),
  pipelineStatus: PipelineStatusSchema,
  sampleCondition: SampleConditionSchema,
  rejectionReason: z.string().optional(),
  // Story 54.1 / Task 10 — multi-branch routing fields
  originLocationId: z.string().optional(),       // lab location where sample was collected
  destinationLocationId: z.string().optional(),  // lab location where results will be routed back
  transitStatus: TransitStatusSchema.optional(), // tracks routing lifecycle
  // Story 54.3 / Task 9 — pre-analytical transport flags requiring technician acknowledgement
  transportFlags: z.array(z.object({
    sampleId: z.string(),
    labSampleId: z.string(),
    flagType: z.enum(['stability-exceeded', 'temperature-excursion', 'damaged']),
    message: z.string(),
    timestamp: z.string(),
  })).optional(),
})

const AnnotationSchema = z.object({
  text: z.string(),
  time: z.string().optional(),
})

export const FhirSpecimenSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Specimen'),
  status: SpecimenStatusSchema,
  type: CodeableConceptSchema.optional(),
  subject: ReferenceSchema, // Patient/<uuid> — never the patient name
  receivedTime: z.string().datetime(),
  request: z.array(ReferenceSchema).optional(), // ServiceRequest references (orders)
  collection: z
    .object({
      collector: ReferenceSchema.optional(), // person who collected / handed over
    })
    .optional(),
  condition: z.array(CodeableConceptSchema).optional(),
  note: z.array(AnnotationSchema).optional(),
  meta: FhirMetaSchema,
  _ultranos: SpecimenUltranosExtSchema,
})

export type FhirSpecimen = z.infer<typeof FhirSpecimenSchema>
