import type { AdministrativeGender } from '../enums.js'

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
    isActive: boolean
    createdBy?: string       // practitioner UUID
    createdAt: string        // ISO 8601 — Ultranos extension
  }

  // FHIR R4 Meta — canonical field names
  meta: {
    lastUpdated: string      // ISO 8601 instant
    versionId?: string
  }
}

// Shape used when creating a new patient via API
export interface CreatePatientInput {
  nameLocal: string
  nameLatin?: string
  gender: AdministrativeGender
  birthDate?: string
  birthYearOnly?: boolean
  phone?: string
  nationalId?: string // plaintext — hashed server-side, never stored raw
  guardianId?: string
}
