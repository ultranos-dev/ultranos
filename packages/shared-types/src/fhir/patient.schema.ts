import { z } from 'zod'
import { AdministrativeGender } from '../enums.js'
import { FhirMetaSchema, FhirDateSchema } from './common.schema.js'
import { AFGHAN_PROVINCES } from '../reference/afghanistan-geo.js'
import { getDistrictsByProvince } from '../reference/afghanistan-districts.js'

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
}).refine(
  (val) => getDistrictsByProvince(val.province).some(d => d.name === val.district),
  { message: 'District must be valid for the selected province', path: ['district'] }
)

const PatientIdentifierInputSchema = z.object({
  system: z.enum(['AFGHAN_ETAZKIRA', 'AFGHAN_TAZKIRA_PAPER', 'PASSPORT', 'HEALTH_PASSPORT_QR']),
  valueHash: z.string().min(1),
  displayType: z.string().min(1),
  jild: z.string().optional(),
  safa: z.string().optional(),
  shumara: z.string().optional(),
})

export const MaritalStatusSchema = z.enum(['M', 'S', 'D', 'W', 'UNK'])

export const ContactRelationshipSchema = z.enum([
  'SPOUSE', 'PARENT', 'SIBLING', 'CHILD', 'GUARDIAN', 'FRIEND', 'OTHER',
])

export const PatientContactSchema = z.object({
  relationship: ContactRelationshipSchema,
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  gender: z.nativeEnum(AdministrativeGender).optional(),
})

export const DisplacementCategorySchema = z.enum([
  'IDP', 'RETURNEE', 'REFUGEE', 'HOST_COMMUNITY',
])

export const EducationLevelSchema = z.enum([
  'NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN',
])

export const PatientLanguageSchema = z.enum(['en', 'ar', 'prs', 'ps'])

// Type of the presented national identity document. The raw number is never
// stored (only national_id_hash); this categorises WHICH document was shown —
// important in the refugee/IDP/returnee deployment context (Tazkira, e-Tazkira,
// passport, UNHCR/ProGres refugee ID, or other).
export const NationalIdTypeSchema = z.enum([
  'TAZKIRA_PAPER', 'ETAZKIRA', 'PASSPORT', 'UNHCR', 'OTHER',
])
export type NationalIdType = z.infer<typeof NationalIdTypeSchema>

// Lightweight registration-time allergy capture (Safety Rule #4/#5). A free-text
// substance (or a coded "No known allergies" marker) recorded unconfirmed /
// unable-to-assess until a clinician verifies. Fuller AllergyIntolerance detail
// is captured later in the clinical flow.
export const RegistrationAllergyInputSchema = z.object({
  substanceText:   z.string().min(1).max(200),
  substanceCode:   z.string().max(64).optional(),
  substanceSystem: z.string().max(128).optional(),
  criticality:     z.enum(['low', 'high', 'unable-to-assess']).optional(),
})
export type RegistrationAllergyInput = z.infer<typeof RegistrationAllergyInputSchema>

const PatientUltranosExtSchema = z.object({
  nameLocal: z.string(),
  nameLatin: z.string().optional(),
  namePhonetic: z.string().optional(),
  nationalIdHash: z.string().optional(),
  guardianId: z.string().uuid().optional(),
  consentVersion: z.string().optional(),
  patient_tier: PatientTierSchema,
  preferredLanguage: PatientLanguageSchema.optional(),
  isActive: z.boolean(),
  createdBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  // ── MPI Phase 1 additions ──────────────────────────────────
  nameGiven: z.string().optional(),
  nameFather: z.string().optional(),
  nameGrandfather: z.string().optional(),
  nameFamily: z.string().max(200).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  addressOrigin: PatientAddressSchema.optional(),
  addressCurrent: PatientAddressSchema.optional(),
  isNomadic: z.boolean().default(false),
  biometricFingerprintHash: z.string().optional(),
  biometricAlgorithmVersion: z.string().optional(),
  mpiScore: z.number().optional(),
  identifiers: z.array(PatientIdentifierInputSchema).optional(),
  // ── Extended demographics (HMIS Phase) ───────────────
  displacementCategory: DisplacementCategorySchema.optional(),
  nationality: z.string().length(2).optional(),
  occupation: z.string().max(200).optional(),
  educationLevel: EducationLevelSchema.optional(),
  disability: z.boolean().optional(),
  householdId: z.string().max(64).optional(),
  nationalIdType: NationalIdTypeSchema.optional(),
  bloodGroup: z.string().optional(),
  photoUrl: z.string().optional(),
})

export const FhirPatientSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Patient'),
  name: z.array(HumanNameSchema).min(1),
  gender: z.nativeEnum(AdministrativeGender),
  birthDate: FhirDateSchema.optional(),
  birthYearOnly: z.boolean(),
  maritalStatus: MaritalStatusSchema.optional(),
  telecom: z.array(ContactPointSchema).optional(),
  identifier: z.array(IdentifierSchema).optional(),
  contact: z.array(PatientContactSchema).max(10).optional(),
  communication: z.array(z.object({
    language: PatientLanguageSchema,
    preferred: z.boolean(),
  })).optional(),
  deceasedBoolean: z.boolean().optional(),
  deceasedDateTime: z.string().datetime().optional(),
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
  nameFamily: z.string().max(200).optional(),
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
  witnessedBy: z.string().optional(),
  language: PatientLanguageSchema,
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
    nameFamily:        z.string().max(200).optional(),
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
    maritalStatus:        MaritalStatusSchema.optional(),
    contacts:             z.array(PatientContactSchema).max(2).optional(),
    phoneUse:             z.enum(['home', 'work', 'mobile']).optional(),
    displacementCategory: DisplacementCategorySchema.optional(),
    nationality:          z.string().length(2).optional(),
    occupation:           z.string().max(200).optional(),
    educationLevel:       EducationLevelSchema.optional(),
    disability:           z.boolean().optional(),
    preferredLanguage:    PatientLanguageSchema.optional(),
    // Alphanumeric household grouping id (family/tent/case id). Quasi-identifier.
    householdId:          z.string().max(64).regex(/^[A-Za-z0-9-]+$/, 'householdId must be alphanumeric').optional(),
    nationalIdType:       NationalIdTypeSchema.optional(),
    bloodGroup:           z.string().max(20).optional(),
    // Opaque photo storage key/url set server-side; only relevant on the offline
    // sync path (online registration uploads the photo after create).
    photoUrl:             z.string().max(500).optional(),
    // Lightweight registration allergies, persisted atomically with the patient.
    allergies:            z.array(RegistrationAllergyInputSchema).max(32).optional(),
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
    // birthYearOnly=false with no birthDate AND no birthYear is invalid
    if (!val.birthYearOnly && !val.birthDate && !val.birthYear) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'birthDate is required when birthYearOnly is false and no birthYear is provided' })
    }
  })

export type CreatePatientMpiInput = z.infer<typeof CreatePatientMpiInputSchema>
