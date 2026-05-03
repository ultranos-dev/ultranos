import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'

// FHIR R4 DiagnosticReport Zod Schema
// Ref: https://hl7.org/fhir/R4/diagnosticreport.html

const DiagnosticReportStatusSchema = z.enum([
  'registered',
  'partial',
  'preliminary',
  'final',
  'amended',
  'corrected',
  'appended',
  'cancelled',
  'entered-in-error',
  'unknown',
])

const AttachmentSchema = z.object({
  contentType: z.string().optional(),
  data: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
})

const DiagnosticReportUltranosExtSchema = z.object({
  createdAt: z.string().datetime(),
  hlcTimestamp: z.string(),
  isOfflineCreated: z.boolean(),
  labId: z.string().uuid().optional(),
  virusScanStatus: z.enum(['pending', 'clean', 'infected', 'error']).optional(),
  ocrMetadataVerified: z.boolean().optional(),
})

export const FhirDiagnosticReportSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('DiagnosticReport'),
  status: DiagnosticReportStatusSchema,
  code: CodeableConceptSchema,
  category: z.array(CodeableConceptSchema).optional(),
  subject: ReferenceSchema,
  encounter: ReferenceSchema.optional(),
  effectiveDateTime: z.string().datetime().optional(),
  issued: z.string().datetime(),
  performer: z.array(ReferenceSchema).optional(),
  result: z.array(ReferenceSchema).optional(),
  conclusion: z.string().optional(),
  presentedForm: z.array(AttachmentSchema).optional(),
  _ultranos: DiagnosticReportUltranosExtSchema,
  meta: FhirMetaSchema,
})

export type FhirDiagnosticReport = z.infer<typeof FhirDiagnosticReportSchema>
