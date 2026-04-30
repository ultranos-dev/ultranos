import {
  ConsentScope,
  ConsentStatus,
  ConsentPurpose,
  GrantorRole,
} from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'

/** Toggle state for a single data category */
export interface ConsentToggleState {
  scope: ConsentScope
  enabled: boolean
  lastUpdated: string | null
}

/** Human-readable data category for the Privacy Settings UI */
export interface DataCategory {
  scope: ConsentScope
  label: string
  description: string
}

/** All data categories the patient can toggle */
export const DATA_CATEGORIES: DataCategory[] = [
  {
    scope: ConsentScope.FULL_RECORD,
    label: 'Full Medical Record',
    description: 'Allow access to your complete health history',
  },
  {
    scope: ConsentScope.PRESCRIPTIONS,
    label: 'Prescriptions',
    description: 'Medication orders and dispensing history',
  },
  {
    scope: ConsentScope.LABS,
    label: 'Lab Results',
    description: 'Laboratory tests and their results',
  },
  {
    scope: ConsentScope.VITALS,
    label: 'Vital Signs',
    description: 'Blood pressure, heart rate, temperature, etc.',
  },
  {
    scope: ConsentScope.CLINICAL_NOTES,
    label: 'Clinical Notes',
    description: 'Doctor visit notes and assessments',
  },
]

interface CreateConsentInput {
  patientId: string
  scope: ConsentScope
  purpose: ConsentPurpose
  hlcTimestamp: string
  grantorRole: GrantorRole
}

interface WithdrawConsentInput extends CreateConsentInput {
  reason?: string
}

/**
 * Compute a SHA-256 hash of a consent record for tamper-evidence.
 * Uses synchronous crypto.subtle where available, with a fallback
 * that produces a hex digest from the built-in crypto API.
 */
async function computeAuditHash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Create a FHIR Consent resource for granting access to a data category. */
export async function createConsent(input: CreateConsentInput): Promise<FhirConsent> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const consent: FhirConsent = {
    id,
    resourceType: 'Consent',
    status: ConsentStatus.ACTIVE,
    scope: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/consentscope',
          code: 'patient-privacy',
        },
      ],
    },
    category: [input.scope],
    patient: { reference: `Patient/${input.patientId}` },
    dateTime: input.hlcTimestamp,
    provision: {
      period: { start: now },
    },
    _ultranos: {
      grantorId: input.patientId,
      grantorRole: input.grantorRole,
      purpose: input.purpose,
      validFrom: now,
      consentVersion: '1.0',
      auditHash: '', // computed below
      createdAt: now,
    },
    meta: {
      lastUpdated: now,
    },
  }

  // Compute tamper-evidence hash over the record content
  consent._ultranos.auditHash = await computeAuditHash(
    JSON.stringify({
      id: consent.id,
      status: consent.status,
      category: consent.category,
      patient: consent.patient,
      dateTime: consent.dateTime,
      grantorId: consent._ultranos.grantorId,
      purpose: consent._ultranos.purpose,
    }),
  )

  return consent
}

/** Create a FHIR Consent resource for withdrawing access to a data category. */
export async function withdrawConsent(input: WithdrawConsentInput): Promise<FhirConsent> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const consent: FhirConsent = {
    id,
    resourceType: 'Consent',
    status: ConsentStatus.WITHDRAWN,
    scope: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/consentscope',
          code: 'patient-privacy',
        },
      ],
    },
    category: [input.scope],
    patient: { reference: `Patient/${input.patientId}` },
    dateTime: input.hlcTimestamp,
    provision: {
      period: { start: now, end: now },
    },
    _ultranos: {
      grantorId: input.patientId,
      grantorRole: input.grantorRole,
      purpose: input.purpose,
      validFrom: now,
      withdrawnAt: now,
      withdrawalReason: input.reason,
      consentVersion: '1.0',
      auditHash: '',
      createdAt: now,
    },
    meta: {
      lastUpdated: now,
    },
  }

  consent._ultranos.auditHash = await computeAuditHash(
    JSON.stringify({
      id: consent.id,
      status: consent.status,
      category: consent.category,
      patient: consent.patient,
      dateTime: consent.dateTime,
      grantorId: consent._ultranos.grantorId,
      purpose: consent._ultranos.purpose,
      withdrawnAt: consent._ultranos.withdrawnAt,
    }),
  )

  return consent
}
