import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
} from './common.schema.js'
import type { PatientVerificationMethod } from '../enums.js'

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

/**
 * Patient identity verification record — stored per sample collection.
 * Story 43.4: Records HOW patient identity was verified, never the data itself.
 * Data minimization: no patient name, no full ID number, no QR payload content.
 * CLAUDE.md Rule #7: Lab Portal can only see patient name + age — verification
 * records use opaque patientRef only.
 */
export interface PatientVerificationRecord {
  /** UUID — primary key and sync key */
  id: string
  /** Reference to the FhirSpecimen from story 42.3 accessioning */
  sampleId: string
  /** Opaque Patient/<uuid> reference — never a name or demographic */
  patientRef: string
  /** Array of verification methods used — must have >=2 for isComplete=true */
  methods: PatientVerificationMethod[]
  /** Free-text description required when OTHER is in methods array */
  otherDescription?: string
  /** Practitioner ID of the verifying technician */
  verifiedBy: string
  /** ISO 8601 timestamp of verification */
  verifiedAt: string
  /** Hybrid Logical Clock timestamp for offline sync ordering */
  hlcTimestamp: string
  /** true if methods.length >= 2 (WHO two-identifier minimum) */
  isComplete: boolean
  /**
   * Populated when isComplete=false (single-identifier override).
   * Required for legal compliance — minimum 10 characters.
   */
  deviationReason?: string
  /** Sync status for offline queue */
  syncStatus: 'pending' | 'synced'
}
