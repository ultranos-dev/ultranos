import { z } from 'zod'
import { AdministrativeGender } from '../enums.js'
import { FhirMetaSchema, FhirDateSchema } from './common.schema.js'
import { AFGHAN_PROVINCES } from '../reference/afghanistan-geo.js'

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

const PatientTierSchema = z.enum(['FREE', 'PREMIUM'])

// ── MPI Phase 1 building blocks (defined before PatientUltranosExtSchema) ────

const PatientAddressSchema = z.object({
  province: z.enum(AFGHAN_PROVINCES),
  district: z.string().min(1).max(100),
  village: z.string().max(200).optional(),
})

const PatientIdentifierInputSchema = z.object({
  system: z.enum(['AFGHAN_ETAZKIRA', 'AFGHAN_TAZKIRA_PAPER', 'PASSPORT', 'HEALTH_PASSPORT_QR']),
  valueHash: z.string().min(1),
  displayType: z.string().min(1),
  jild: z.string().optional(),
  safa: z.string().optional(),
  shumara: z.string().optional(),
})

const PatientUltranosExtSchema = z.object({
  nameLocal: z.string(),
  nameLatin: z.string().optional(),
  namePhonetic: z.string().optional(),
  nationalIdHash: z.string().optional(),
  guardianId: z.string().uuid().optional(),
  consentVersion: z.string().optional(),
  patient_tier: PatientTierSchema,
  preferredLanguage: z.string().optional(),
  isActive: z.boolean(),
  createdBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  // ── MPI Phase 1 additions ──────────────────────────────────
  nameGiven: z.string().optional(),
  nameFather: z.string().optional(),
  nameGrandfather: z.string().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  addressOrigin: PatientAddressSchema.optional(),
  addressCurrent: PatientAddressSchema.optional(),
  isNomadic: z.boolean().default(false),
  biometricFingerprintHash: z.string().optional(),
  biometricAlgorithmVersion: z.string().optional(),
  mpiScore: z.number().optional(),
  identifiers: z.array(PatientIdentifierInputSchema).optional(),
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

/**
 * @deprecated Use CreatePatientMpiInputSchema for all new patient creation.
 * This schema predates MPI Phase 1 and does not include consent or patronymic fields.
 */
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

// ── MPI Phase 1: new input schema with cross-field validation ───────────────

const ConsentInputSchema = z.object({
  method: z.enum(['WRITTEN', 'VERBAL_WITNESSED']),
  witnessedBy: z.string().uuid().optional(),
  language: z.enum(['en', 'ar', 'prs']),
  version: z.string().min(1),
})

const currentYear = new Date().getFullYear()

export const CreatePatientMpiInputSchema = z
  .object({
    nameLocal:         z.string().min(1).max(500),
    nameLatin:         z.string().max(500).optional(),
    // firstName accepted as deprecated alias for nameGiven (Patient Lite backward compat)
    firstName:         z.string().min(1).max(200).optional(),
    nameGiven:         z.string().min(1).max(200).optional(),
    nameFather:        z.string().min(1).max(200).optional(),
    nameGrandfather:   z.string().min(1).max(200).optional(),
    gender:            z.nativeEnum(AdministrativeGender).optional(),
    birthDate:         FhirDateSchema.optional(),
    birthYearOnly:     z.boolean().default(false),
    birthYear:         z.number().int().min(1900).max(currentYear).optional(),
    phone:             z.string().max(50).optional(),
    nationalId:        z.string().max(200).optional(),
    guardianId:        z.string().uuid().optional(),
    addressOrigin:     PatientAddressSchema.optional(),
    addressCurrent:    PatientAddressSchema.optional(),
    isNomadic:         z.boolean().default(false),
    biometricFingerprintHash:   z.string().max(500).optional(),
    biometricAlgorithmVersion:  z.string().max(50).optional(),
    identifiers:       z.array(PatientIdentifierInputSchema).optional(),
    mpiProceedToken:   z.string().optional(),
    consent:           ConsentInputSchema,
  })
  // Transform: firstName alias → nameGiven (firstName stripped from output)
  .transform(({ firstName, ...rest }) => ({
    ...rest,
    nameGiven: rest.nameGiven ?? firstName,
  }))
  // Cross-field validation
  .superRefine((val, ctx) => {
    // birthDate and birthYearOnly=true cannot coexist
    if (val.birthYearOnly && val.birthDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'birthDate must be absent when birthYearOnly is true' })
    }
    // At least one of birthDate or birthYear must be present
    if (!val.birthDate && !val.birthYear) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthYear'], message: 'Either birthDate or birthYear is required' })
    }
    // VERBAL_WITNESSED consent requires a witness
    if (val.consent.method === 'VERBAL_WITNESSED' && !val.consent.witnessedBy) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consent', 'witnessedBy'], message: 'witnessedBy is required for VERBAL_WITNESSED consent' })
    }
    // birthYearOnly=false means caller is claiming full DOB — require birthDate
    if (!val.birthYearOnly && !val.birthDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'birthDate is required when birthYearOnly is false' })
    }
  })

export type CreatePatientMpiInput = z.infer<typeof CreatePatientMpiInputSchema>
