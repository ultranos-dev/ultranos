import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../lib/db'

// next-intl context isn't provided in unit tests; components only need the locale.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
import { useAuthSessionStore } from '../stores/auth-session-store'
import type { FhirObservation, FhirCondition, FhirMedicationRequestZod, FhirAllergyIntolerance } from '@ultranos/shared-types'
import type { SoapLedgerEntry } from '../lib/db'

// Mock audit
const mockAuditPhiAccess = vi.fn()
vi.mock('../lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => mockAuditPhiAccess(...args),
  AuditAction: { READ: 'READ' },
  AuditResourceType: { ENCOUNTER: 'ENCOUNTER' },
}))

const { EncounterDetail } = await import('../components/patient/EncounterDetail')

const TEST_PATIENT_ID = '33333333-3333-3333-3333-333333333333'
const ENC_ID = 'cccc1111-1111-1111-1111-111111111111'

function makeSoapEntry(overrides?: Partial<SoapLedgerEntry>): SoapLedgerEntry {
  return {
    id: crypto.randomUUID(),
    encounterId: ENC_ID,
    subjective: 'Patient reports headache',
    objective: 'BP 120/80, alert and oriented',
    plan: 'Prescribe ibuprofen',
    assessorRef: 'Practitioner/pract-1',
    hlcTimestamp: '2024-06-15T10:00:00Z_0001_node1',
    createdAt: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

function makeVital(code: string, value: number, unit: string): FhirObservation {
  return {
    id: crypto.randomUUID(),
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: '1234', display: code }],
      text: code,
    },
    subject: { reference: `Patient/${TEST_PATIENT_ID}` },
    encounter: { reference: `Encounter/${ENC_ID}` },
    valueQuantity: { value, unit, system: 'http://unitsofmeasure.org' },
    _ultranos: { isOfflineCreated: false, hlcTimestamp: '2024-06-15T10:00:00Z_0001_node1', createdAt: '2024-06-15T10:00:00Z' },
    meta: { versionId: '1', lastUpdated: '2024-06-15T10:00:00Z' },
  } as FhirObservation
}

function makeCondition(display: string, icdCode: string): FhirCondition {
  return {
    id: crypto.randomUUID(),
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: icdCode, display }],
      text: display,
    },
    subject: { reference: `Patient/${TEST_PATIENT_ID}` },
    encounter: { reference: `Encounter/${ENC_ID}` },
    _ultranos: { diagnosisRank: 1, isOfflineCreated: false, hlcTimestamp: '2024-06-15T10:00:00Z_0001_node1', createdAt: '2024-06-15T10:00:00Z' },
    meta: { versionId: '1', lastUpdated: '2024-06-15T10:00:00Z' },
  } as FhirCondition
}

function makePrescription(medName: string, dosage: string): FhirMedicationRequestZod {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: 'ultranos', code: 'MED001', display: medName }],
      text: medName,
    },
    subject: { reference: `Patient/${TEST_PATIENT_ID}` },
    encounter: { reference: `Encounter/${ENC_ID}` },
    authoredOn: '2024-06-15T10:00:00Z',
    requester: { reference: 'Practitioner/pract-1' },
    dosageInstruction: [{ text: dosage }],
    _ultranos: {
      isOfflineCreated: false,
      hlcTimestamp: '2024-06-15T10:00:00Z_0001_node1',
      createdAt: '2024-06-15T10:00:00Z',
      interactionCheckResult: 'CLEAR',
    },
    meta: { versionId: '1', lastUpdated: '2024-06-15T10:00:00Z' },
  } as FhirMedicationRequestZod
}

function makeAllergy(substance: string, recordedDate: string): FhirAllergyIntolerance {
  return {
    id: crypto.randomUUID(),
    resourceType: 'AllergyIntolerance',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    type: 'allergy',
    code: { text: substance },
    patient: { reference: `Patient/${TEST_PATIENT_ID}` },
    recordedDate,
    _ultranos: {
      substanceFreeText: substance,
      isOfflineCreated: false,
      hlcTimestamp: `${recordedDate}_0001_node1`,
      createdAt: recordedDate,
    },
    meta: { versionId: '1', lastUpdated: recordedDate },
  } as FhirAllergyIntolerance
}

function resetStores() {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'pract-1',
    role: 'physician',
    email: 'doc@test.com',
    token: 'test-token',
  })
}

describe('EncounterDetail', () => {
  beforeEach(async () => {
    mockAuditPhiAccess.mockClear()
    await db.soapLedger.clear()
    await db.observations.clear()
    await db.conditions.clear()
    await db.medications.clear()
    await db.allergyIntolerances.clear()
    resetStores()
  })

  it('renders vital signs', async () => {
    await db.observations.put(makeVital('Weight', 75, 'kg'))
    await db.observations.put(makeVital('Temperature', 37.2, '°C'))

    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const vitals = screen.getAllByTestId('vital-item')
      expect(vitals.length).toBe(2)
      expect(screen.getByText('75 kg')).toBeTruthy()
      expect(screen.getByText('37.2 °C')).toBeTruthy()
    })
  })

  it('renders full SOAP notes (S, O, P sections)', async () => {
    await db.soapLedger.put(makeSoapEntry())

    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('S — Subjective')).toBeTruthy()
      expect(screen.getByText('Patient reports headache')).toBeTruthy()
      expect(screen.getByText('O — Objective')).toBeTruthy()
      expect(screen.getByText('BP 120/80, alert and oriented')).toBeTruthy()
      expect(screen.getByText('P — Plan')).toBeTruthy()
      expect(screen.getByText('Prescribe ibuprofen')).toBeTruthy()
    })
  })

  it('handles missing plan field gracefully', async () => {
    await db.soapLedger.put(makeSoapEntry({ plan: undefined }))

    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('S — Subjective')).toBeTruthy()
      expect(screen.queryByText('P — Plan')).toBeNull()
    })
  })

  it('renders diagnoses', async () => {
    await db.conditions.put(makeCondition('Acute Gastritis', 'K29.0'))

    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const item = screen.getByTestId('diagnosis-item')
      expect(item.textContent).toContain('K29.0')
      expect(item.textContent).toContain('Acute Gastritis')
    })
  })

  it('renders prescriptions with dosage', async () => {
    await db.medications.put(makePrescription('Ibuprofen 400mg', '1 tablet 3x daily'))

    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      const item = screen.getByTestId('prescription-item')
      expect(item.textContent).toContain('Ibuprofen 400mg')
      expect(item.textContent).toContain('1 tablet 3x daily')
    })
  })

  it('shows allergy snapshot filtered by encounter date', async () => {
    // Allergy recorded BEFORE encounter
    await db.allergyIntolerances.put(makeAllergy('Penicillin', '2024-01-01T00:00:00Z'))
    // Allergy recorded AFTER encounter — should be excluded
    await db.allergyIntolerances.put(makeAllergy('Aspirin', '2024-12-01T00:00:00Z'))

    render(
      <EncounterDetail
        encounterId={ENC_ID}
        encounterDate="2024-06-15T10:00:00Z"
        patientId={TEST_PATIENT_ID}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Penicillin')).toBeTruthy()
      expect(screen.queryByText('Aspirin')).toBeNull()
    })
  })

  it('emits PHI READ audit event for detailed access', async () => {
    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(mockAuditPhiAccess).toHaveBeenCalledWith(
        'READ',
        'ENCOUNTER',
        ENC_ID,
        TEST_PATIENT_ID,
        expect.objectContaining({ phiAccess: 'encounter_detail_expansion' }),
      )
    })
  })

  it('shows empty state when no clinical data exists', async () => {
    render(<EncounterDetail encounterId={ENC_ID} patientId={TEST_PATIENT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/no clinical data recorded/i)).toBeTruthy()
    })
  })
})
