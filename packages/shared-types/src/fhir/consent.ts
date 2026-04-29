import type { ConsentPurpose, ConsentScope, ConsentStatus, GrantorRole } from '../enums.js'

// FHIR R4 Consent resource + Ultranos extensions
// Ref: https://hl7.org/fhir/R4/consent.html
// PRD Section 7.2
export interface FhirConsent {
  id: string
  resourceType: 'Consent'

  status: ConsentStatus
  scope: {
    coding: { system: string; code: string }[]
  }
  category: ConsentScope[]

  patient: { reference: string } // Patient/UUID

  dateTime: string // ISO 8601

  provision: {
    period?: { start: string; end?: string }
    actor?: { reference: string; role: string }[]
  }

  // Ultranos extensions
  _ultranos: {
    grantorId: string
    grantorRole: GrantorRole
    purpose: ConsentPurpose
    grantedToId?: string       // provider UUID or null (system-level)
    validFrom: string
    validUntil?: string        // null = persistent until withdrawn
    consentVersion: string     // version of consent terms doc
    withdrawnAt?: string
    withdrawalReason?: string
    auditHash: string          // SHA-256 tamper-evidence hash
    createdAt: string          // ISO 8601 — Ultranos extension
  }

  // FHIR R4 Meta — canonical field names
  meta: {
    lastUpdated: string      // ISO 8601 instant
    versionId?: string
  }
}
