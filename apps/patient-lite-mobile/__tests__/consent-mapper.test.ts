import { ConsentScope, ConsentStatus, ConsentPurpose, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'
import {
  createConsent,
  withdrawConsent,
  DATA_CATEGORIES,
  type ConsentToggleState,
} from '@/lib/consent-mapper'

// Deterministic mock for crypto.randomUUID
const MOCK_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
jest.spyOn(crypto, 'randomUUID').mockReturnValue(MOCK_UUID as `${string}-${string}-${string}-${string}-${string}`)

describe('consent-mapper', () => {
  const PATIENT_ID = 'patient-001'
  const MOCK_HLC = '000001714400000:00001:node-1'

  describe('DATA_CATEGORIES', () => {
    it('includes all relevant ConsentScope values', () => {
      const scopeValues = DATA_CATEGORIES.map((c) => c.scope)
      expect(scopeValues).toContain(ConsentScope.PRESCRIPTIONS)
      expect(scopeValues).toContain(ConsentScope.LABS)
      expect(scopeValues).toContain(ConsentScope.VITALS)
      expect(scopeValues).toContain(ConsentScope.CLINICAL_NOTES)
      expect(scopeValues).toContain(ConsentScope.FULL_RECORD)
    })

    it('provides human-readable labels for each category', () => {
      for (const cat of DATA_CATEGORIES) {
        expect(cat.label).toBeTruthy()
        expect(typeof cat.label).toBe('string')
      }
    })
  })

  describe('createConsent', () => {
    it('creates a valid FHIR Consent resource for a granted scope', () => {
      const consent = createConsent({
        patientId: PATIENT_ID,
        scope: ConsentScope.PRESCRIPTIONS,
        purpose: ConsentPurpose.TREATMENT,
        hlcTimestamp: MOCK_HLC,
        grantorRole: GrantorRole.SELF,
      })

      expect(consent.resourceType).toBe('Consent')
      expect(consent.id).toBe(MOCK_UUID)
      expect(consent.status).toBe(ConsentStatus.ACTIVE)
      expect(consent.category).toContain(ConsentScope.PRESCRIPTIONS)
      expect(consent.patient.reference).toBe(`Patient/${PATIENT_ID}`)
      expect(consent.provision.period?.start).toBeTruthy()
      expect(consent._ultranos.grantorId).toBe(PATIENT_ID)
      expect(consent._ultranos.grantorRole).toBe(GrantorRole.SELF)
      expect(consent._ultranos.purpose).toBe(ConsentPurpose.TREATMENT)
      expect(consent._ultranos.auditHash).toBeTruthy()
      expect(consent._ultranos.createdAt).toBeTruthy()
      expect(consent.meta.lastUpdated).toBeTruthy()
    })

    it('sets scope coding with FHIR system', () => {
      const consent = createConsent({
        patientId: PATIENT_ID,
        scope: ConsentScope.LABS,
        purpose: ConsentPurpose.TREATMENT,
        hlcTimestamp: MOCK_HLC,
        grantorRole: GrantorRole.SELF,
      })

      expect(consent.scope.coding).toHaveLength(1)
      expect(consent.scope.coding[0].system).toBe(
        'http://terminology.hl7.org/CodeSystem/consentscope',
      )
      expect(consent.scope.coding[0].code).toBe('patient-privacy')
    })

    it('assigns HLC timestamp to dateTime field', () => {
      const consent = createConsent({
        patientId: PATIENT_ID,
        scope: ConsentScope.VITALS,
        purpose: ConsentPurpose.TREATMENT,
        hlcTimestamp: MOCK_HLC,
        grantorRole: GrantorRole.SELF,
      })

      // dateTime should be a valid ISO 8601 string
      expect(() => new Date(consent.dateTime)).not.toThrow()
      expect(consent.meta.lastUpdated).toBeTruthy()
    })

    it('generates a SHA-256 audit hash', () => {
      const consent = createConsent({
        patientId: PATIENT_ID,
        scope: ConsentScope.PRESCRIPTIONS,
        purpose: ConsentPurpose.TREATMENT,
        hlcTimestamp: MOCK_HLC,
        grantorRole: GrantorRole.SELF,
      })

      // Hash should be a 64-char hex string (SHA-256)
      expect(consent._ultranos.auditHash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('withdrawConsent', () => {
    it('creates a WITHDRAWN consent resource', () => {
      const consent = withdrawConsent({
        patientId: PATIENT_ID,
        scope: ConsentScope.PRESCRIPTIONS,
        purpose: ConsentPurpose.TREATMENT,
        hlcTimestamp: MOCK_HLC,
        grantorRole: GrantorRole.SELF,
        reason: 'No longer needed',
      })

      expect(consent.status).toBe(ConsentStatus.WITHDRAWN)
      expect(consent._ultranos.withdrawnAt).toBeTruthy()
      expect(consent._ultranos.withdrawalReason).toBe('No longer needed')
    })

    it('sets provision end date on withdrawal', () => {
      const consent = withdrawConsent({
        patientId: PATIENT_ID,
        scope: ConsentScope.LABS,
        purpose: ConsentPurpose.TREATMENT,
        hlcTimestamp: MOCK_HLC,
        grantorRole: GrantorRole.SELF,
      })

      expect(consent.provision.period?.end).toBeTruthy()
    })
  })
})
