import { z } from 'zod'
import { AdministrativeGender } from '../enums.js'
import { FhirMetaSchema, FhirDateSchema } from './common.schema.js'

// FHIR R4 Patient Zod Schema
// Ref: https://hl7.org/fhir/R4/patient.html

const HumanNameSchema = z.object({
  family: z.string().optional(),
  given: z.array(z.string()).optional(),
  text: z.string().optional(),
})

const ContactPointSchema = z.object({
  system: z.enum(['phone', 'email']),
  value: z.string(),
  use: z.enum(['home', 'work', 'mobile']).optional(),
})

const IdentifierSchema = z.object({
  system: z.string(),
  value: z.string(),
})

const PatientUltranosExtSchema = z.object({
  nameLocal: z.string(),
  nameLatin: z.string().optional(),
  namePhonetic: z.string().optional(),
  nationalIdHash: z.string().optional(),
  guardianId: z.string().uuid().optional(),
  consentVersion: z.string().optional(),
  isActive: z.boolean(),
  createdBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
})

export const FhirPatientSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Patient'),
  name: z.array(HumanNameSchema).min(1),
  gender: z.nativeEnum(AdministrativeGender),
  birthDate: FhirDateSchema.optional(),
  birthYearOnly: z.boolean(),
  telecom: z.array(ContactPointSchema).optional(),
  identifier: z.array(IdentifierSchema).optional(),
  _ultranos: PatientUltranosExtSchema,
  meta: FhirMetaSchema,
})

export type FhirPatientZod = z.infer<typeof FhirPatientSchema>

export const CreatePatientInputSchema = z.object({
  nameLocal: z.string().min(1),
  nameLatin: z.string().optional(),
  gender: z.nativeEnum(AdministrativeGender),
  birthDate: FhirDateSchema.optional(),
  birthYearOnly: z.boolean().default(false),
  phone: z.string().optional(),
  nationalId: z.string().optional(),
  guardianId: z.string().uuid().optional(),
})

export type CreatePatientInputZod = z.infer<typeof CreatePatientInputSchema>
