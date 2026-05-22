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

  telecom?: {
    system: 'phone' | 'email'
    value: string
    use?: 'home' | 'work' | 'mobile'
  }[]

  identifier?: {
    system: string // e.g. 'UAE_NATIONAL_ID', 'PASSPORT'
    value: string  // stored encrypted; hash used for matching
  }[]

  // Ultranos extensions
  _ultranos: {
    nameLocal: string        // name in patient's preferred script (NFD-normalized)
    nameLatin?: string       // ALA-LC romanization (system-derived)
    namePhonetic?: string    // Double Metaphone hash for fuzzy matching
    nationalIdHash?: string  // SHA-256 of national ID for MPI matching
    guardianId?: string      // UUID → another Patient (guardian)
    consentVersion?: string  // version of consent terms at registration
    /** Subscription tier — defaults to 'FREE' on self-registration */
    patient_tier: PatientTier
    /** Patient's preferred language (ISO 639 code: 'en', 'ar', 'prs') */
    preferredLanguage?: string
    isActive: boolean
    createdBy?: string       // practitioner UUID
    createdAt: string        // ISO 8601 — Ultranos extension
    // ── MPI Phase 1 additions ──────────────────────────────────
    /** Structured patronymic chain (given name component) */
    nameGiven?: string
    /** Father's name (patronymic) */
    nameFather?: string
    /** Grandfather's name (patronymic) */
    nameGrandfather?: string
    /** Birth year when exact DOB is unknown */
    birthYear?: number
    /** Geographic origin (stable MPI signal) */
    addressOrigin?: PatientAddress
    /** Current residence (logistics only — not an MPI signal) */
    addressCurrent?: PatientAddress
    /** True for nomadic patients whose current address changes seasonally */
    isNomadic: boolean
    /** SHA-256 of biometric template — for exact-match hard identifier check */
    biometricFingerprintHash?: string
    biometricAlgorithmVersion?: string
    /** Soft MPI score from last duplicate check */
    mpiScore?: number
    /** Structured document identifiers (Tazkira, passport, etc.) */
    identifiers?: PatientIdentifier[]
  }

  // FHIR R4 Meta — canonical field names
  meta: {
    lastUpdated: string      // ISO 8601 instant
    versionId?: string
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
  nationalId?: string
  guardianId?: string
  // ── MPI Phase 1 additions ─────────────────────────────────────
  /** firstName is a deprecated alias for nameGiven — accepted via Zod transform */
  firstName?: string
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
    language: 'en' | 'ar' | 'prs'
    version: string
  }
}
