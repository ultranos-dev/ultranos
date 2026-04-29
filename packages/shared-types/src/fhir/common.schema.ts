import { z } from 'zod'

// Shared FHIR R4 building-block schemas used across resource schemas.
// Single source of truth — import from here, do not re-declare.

export const CodingSchema = z.object({
  system: z.string(),
  code: z.string(),
  display: z.string().optional(),
})

export const CodeableConceptSchema = z
  .object({
    coding: z.array(CodingSchema).optional(),
    text: z.string().optional(),
  })
  .refine((val) => val.coding?.length || val.text, {
    message: 'CodeableConcept must have at least coding or text',
  })

export const ReferenceSchema = z.object({
  reference: z.string(),
  display: z.string().optional(),
})

// FHIR R4 Meta — uses canonical field names per architecture decision (2026-04-28).
// `createdAt` is an Ultranos extension and lives in `_ultranos`, not here.
export const FhirMetaSchema = z.object({
  lastUpdated: z.string().datetime(),
  versionId: z.string().optional(),
})

// FHIR R4 date: YYYY, YYYY-MM, or YYYY-MM-DD
const FHIR_DATE_REGEX = /^\d{4}(-\d{2}(-\d{2})?)?$/
export const FhirDateSchema = z.string().regex(FHIR_DATE_REGEX, {
  message: 'Must be a valid FHIR date (YYYY, YYYY-MM, or YYYY-MM-DD)',
})

// FHIR R4 date or datetime (ISO 8601)
export const FhirDateTimeOrDateSchema = z
  .string()
  .refine(
    (val) => FHIR_DATE_REGEX.test(val) || !Number.isNaN(Date.parse(val)),
    { message: 'Must be a valid FHIR date or datetime' },
  )
