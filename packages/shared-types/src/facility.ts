// ============================================================
// ULTRANOS — ENTERPRISE FACILITY PROFILE INTERFACES
// Shared types for all three facility kinds: Clinical, Pharmacy, Lab.
// Phase 1 (2026-09-15): profile fields, org-scoped, camelCase.
// DB counterparts: clinical_facilities, pharmacy_facilities, labs.
// ============================================================

/** Facility kind for clinical facilities (clinics, hospitals, OPD). */
export type ClinicalFacilityType = 'clinic' | 'hospital' | 'opd'

/**
 * Shared enterprise field set — all three facility kinds carry these.
 * camelCase mirrors the snake_case DB columns.
 */
export interface FacilityProfileBase {
  id: string
  orgId: string
  name: string
  isActive: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string

  // Identity
  logoUrl?: string | null
  description?: string | null
  licenseRef?: string | null
  registrationAuthority?: string | null
  establishedYear?: number | null

  // Contact
  phone?: string | null
  altPhone?: string | null
  email?: string | null
  website?: string | null
  whatsapp?: string | null

  // Location
  address?: string | null
  province?: string | null
  district?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null

  // Contact person
  contactPersonName?: string | null
  contactPersonRole?: string | null
  contactPersonPhone?: string | null

  // Operations
  openingHours?: Record<string, unknown> | null
  timezone?: string | null
  is247?: boolean | null

  // Google (populated in P4; nullable in P1)
  googlePlaceId?: string | null
  googleMapsUrl?: string | null
  googleRating?: number | null
  googleReviewCount?: number | null
  googleHours?: Record<string, unknown> | null
  googleLastSyncedAt?: string | null
}

/** Full profile for a clinical facility (clinic, hospital, or OPD unit). */
export interface ClinicalFacilityProfile extends FacilityProfileBase {
  facilityType: ClinicalFacilityType

  // Clinical-specific
  bedCount?: number | null
  departments?: string[] | null
  specialties?: string[] | null
  emergencyServices?: boolean | null
}

/** Full profile for a pharmacy facility. */
export interface PharmacyProfile extends FacilityProfileBase {
  facilityType?: string | null

  // Pharmacy-specific
  hasDelivery?: boolean | null
  acceptsInsurance?: boolean | null
}

/** Full profile for a lab facility. */
export interface LabProfile extends FacilityProfileBase {
  // Lab-specific (including fields labs already had)
  accreditationRef?: string | null
  specialties?: string[] | null
  turnaroundTimeHours?: number | null
  homeCollection?: boolean | null
  sampleCollection?: boolean | null
  capAccredited?: boolean | null
}
