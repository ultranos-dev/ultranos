import type { KycStatus, LabRole } from '../enums.js'

// FHIR R4 Practitioner + Ultranos extensions
// Ref: https://hl7.org/fhir/R4/practitioner.html
export interface FhirPractitioner {
  id: string
  resourceType: 'Practitioner'

  name: {
    family: string
    given: string[]
    text?: string
  }[]

  identifier: {
    system: string  // e.g. 'HAAD', 'JMC', 'MOH_UAE', 'SCFHS'
    value: string   // license number
  }[]

  telecom: {
    system: 'phone' | 'email'
    value: string
  }[]

  qualification: {
    code: {
      coding: { system: string; code: string; display: string }[]
    }
    period?: { end?: string } // license expiry
  }[]

  // Ultranos extensions
  _ultranos: {
    licenseExpiry?: string   // ISO 8601 date
    kycStatus: KycStatus
    lastExpiryNotificationAt?: string    // ISO 8601 — last notification sent
    lastExpiryNotificationThreshold?: number // days threshold (7, 30, 60)
    suspendedAt?: string                 // ISO 8601 date — anchors 90-day read-only grace period
    renewalDocumentUrl?: string          // URL of license renewal evidence document
    clinicName?: string
    clinicAddress?: string
    gpsLat?: number
    gpsLng?: number
    consultationLanguages: string[] // e.g. ['en', 'ar']
    specialty?: string
    createdAt: string        // ISO 8601 — Ultranos extension
  }

  // FHIR R4 Meta — canonical field names
  meta: {
    lastUpdated: string      // ISO 8601 instant
    versionId?: string
  }
}

export interface PractitionerSession {
  practitionerId: string
  role: 'DOCTOR' | 'PHARMACIST' | 'LAB_TECH' | 'ADMIN'
  sessionId: string
  deviceId?: string
  /** Lab sub-role within LAB_TECH umbrella. Story 42.1. */
  labRole?: LabRole
}
