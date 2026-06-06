import type { AdministrativeGender } from '../enums.js'
import type { AfghanProvince } from '../reference/afghanistan-geo.js'

/** Patient subscription tier. Defaults to FREE on self-registration. */
export type PatientTier = 'FREE' | 'PREMIUM'

// ── New types for MPI Phase 1 ─────────────────────────────────────────

export interface PatientAddress {
  province: AfghanProvince
  district: string
  village?: string
}

export type PatientIdentifierSystem =
  | 'AFGHAN_ETAZKIRA'
  | 'AFGHAN_TAZKIRA_PAPER'
  | 'PASSPORT'
  | 'HEALTH_PASSPORT_QR'

export interface PatientIdentifier {
  system: PatientIdentifierSystem
  valueHash: string      // HMAC blind index — never raw document number
  displayType: string
  /** Paper Tazkira only — AES-GCM encrypted Jild number */
  jild?: string
  /** Paper Tazkira only — AES-GCM encrypted Safa number */
  safa?: string
  /** Paper Tazkira only — AES-GCM encrypted Shumara number */
  shumara?: string
}

// ── Extended demographics ─────────────────────────────────────────────

/**
 * FHIR R4 marital status value set (v2-0002) — deployment subset.
 * Polygamous ('P') excluded for this deployment context.
 * M=Married, S=Single/Never Married, D=Divorced, W=Widowed
 * UNK=Unknown/Not Disclosed (FHIR NullFlavor — use when status is not known or not shared)
 */
export type MaritalStatus = 'M' | 'S' | 'D' | 'W' | 'UNK'

/** Relationship of an emergency contact to the patient */
export type ContactRelationship =
  | 'SPOUSE'
  | 'PARENT'
  | 'SIBLING'
  | 'CHILD'
  | 'GUARDIAN'
  | 'FRIEND'
  | 'OTHER'

/** FHIR R4 Patient.contact — emergency / next-of-kin contact party */
export interface PatientContact {
  relationship: ContactRelationship
  name: string
  phone?: string
  gender?: AdministrativeGender
}

/**
 * WHO DHIS2 / Afghanistan MoPH population category.
 * Distinct from isNomadic (which is an address-logic flag).
 */
export type DisplacementCategory =
  | 'IDP'            // Internally Displaced Person
  | 'RETURNEE'       // Returned from abroad / repatriated
  | 'REFUGEE'        // Recognized refugee
  | 'HOST_COMMUNITY' // Non-displaced host community member

/**
 * Education level — WHO DHIS2 standard for HMIS disaggregation.
 */
export type EducationLevel = 'NONE' | 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'UNKNOWN'

// ── Supported patient-facing languages ───────────────────────────────
export type PatientLanguage = 'en' | 'ar' | 'prs' | 'ps'

// FHIR R4 Patient resource + Ultranos extensions
// Ref: https://hl7.org/fhir/R4/patient.html
export interface FhirPatient {
  id: string // UUID — system generated, never displayed to users
  resourceType: 'Patient'

  // FHIR R4 name
  name: {
    family?: string
    given?: string[]
    text?: string // full name string
  }[]

  gender: AdministrativeGender
  birthDate?: string // ISO 8601 date or year-only (YYYY)
  birthYearOnly: boolean // true when exact DOB unknown

  /** FHIR R4 Patient.maritalStatus — M/S/D/W/U (no Polygamous in this deployment) */
  maritalStatus?: MaritalStatus

  telecom?: {
    system: 'phone' | 'email'
    value: string
    use?: 'home' | 'work' | 'mobile'
  }[]

  identifier?: {
    system: string // e.g. 'UAE_NATIONAL_ID', 'PASSPORT'
    value: string  // stored encrypted; hash used for matching
  }[]

  /**
   * FHIR R4 Patient.contact — emergency / next-of-kin.
   * Up to 2 contacts captured at registration; more can be added later.
   */
  contact?: PatientContact[]

  /**
   * FHIR R4 Patient.communication — patient language preferences.
   * The `preferredLanguage` field in _ultranos is the single-value shorthand;
   * this array supports multi-language patients in future.
   */
  communication?: { language: PatientLanguage; preferred: boolean }[]

  /**
   * FHIR R4 Patient.deceased.
   * Set post-registration; never captured at initial registration.
   */
  deceasedBoolean?: boolean
  deceasedDateTime?: string

  // Ultranos extensions
  _ultranos: {
    nameLocal: string        // name in patient's preferred script (NFD-normalized)
    nameLatin?: string       // ALA-LC romanization — DEFERRED: system-derived server-side
    namePhonetic?: string    // Double Metaphone hash — DEFERRED: system-derived server-side
    nationalIdHash?: string  // SHA-256 of national ID for MPI matching
    guardianId?: string      // UUID → another Patient (guardian)
    consentVersion?: string  // version of consent terms at registration
    /** Subscription tier — defaults to 'FREE' on self-registration */
    patient_tier: PatientTier
    /** Patient's preferred language */
    preferredLanguage?: PatientLanguage
    isActive: boolean
    createdBy?: string       // practitioner UUID
    createdAt: string        // ISO 8601 — Ultranos extension
    // ── MPI Phase 1 additions ──────────────────────────────────
    nameGiven?: string
    nameFather?: string
    nameGrandfather?: string
    birthYear?: number
    addressOrigin?: PatientAddress
    addressCurrent?: PatientAddress
    isNomadic: boolean
    /** SHA-256 of biometric template — DEFERRED: V2 biometric workflow */
    biometricFingerprintHash?: string
    biometricAlgorithmVersion?: string
    /** Soft MPI score — DEFERRED: computed by MPI engine */
    mpiScore?: number
    identifiers?: PatientIdentifier[]
    /** Patient photo path — DEFERRED: separate photo capture workflow */
    photoUrl?: string
    bloodGroup?: string
    /** Display name of last updater — DEFERRED: resolved at read time */
    updatedByName?: string
    /** Role of last updater — DEFERRED: resolved at read time */
    updatedByRole?: string
    // ── Extended demographics (HMIS Phase) ────────────────────
    /** WHO DHIS2 / MoPH population/displacement category */
    displacementCategory?: DisplacementCategory
    /** ISO 3166-1 alpha-2 country code (e.g. 'AF', 'PK', 'IR') */
    nationality?: string
    /** Free-text occupation for HMIS occupational disease surveillance */
    occupation?: string
    /** WHO DHIS2 education level for health literacy stratification */
    educationLevel?: EducationLevel
    /** True if patient self-reports a disability */
    disability?: boolean
  }

  // FHIR R4 Meta — canonical field names
  meta: {
    lastUpdated: string      // ISO 8601 instant
    versionId?: string       // DEFERRED: managed by DB trigger
  }
}

// Shape used when creating a new patient via API
export interface CreatePatientInput {
  // ── Existing fields (unchanged) ──────────────────────────────
  nameLocal: string
  nameLatin?: string
  gender: AdministrativeGender
  birthDate?: string
  birthYearOnly?: boolean
  phone?: string
  phoneUse?: 'home' | 'work' | 'mobile'
  nationalId?: string
  guardianId?: string
  // ── MPI Phase 1 additions ─────────────────────────────────────
  firstName?: string  // deprecated alias for nameGiven
  nameGiven?: string
  nameFather?: string
  nameGrandfather?: string
  birthYear?: number
  addressOrigin?: PatientAddress
  addressCurrent?: PatientAddress
  isNomadic?: boolean
  biometricFingerprintHash?: string
  biometricAlgorithmVersion?: string
  identifiers?: PatientIdentifier[]
  mpiProceedToken?: string
  consent: {
    method: 'WRITTEN' | 'VERBAL_WITNESSED'
    witnessedBy?: string
    language: PatientLanguage
    version: string
  }
  // ── Extended demographics (HMIS Phase) ────────────────────────
  maritalStatus?: MaritalStatus
  contacts?: PatientContact[]
  displacementCategory?: DisplacementCategory
  nationality?: string
  occupation?: string
  educationLevel?: EducationLevel
  disability?: boolean
  preferredLanguage?: PatientLanguage
}
