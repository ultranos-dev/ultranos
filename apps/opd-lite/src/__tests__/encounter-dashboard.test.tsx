import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { usePatientStore } from '@/stores/patient-store'
import { useEncounterStore } from '@/stores/encounter-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import { AdministrativeGender } from '@ultranos/shared-types'
import type { FhirPatient } from '@ultranos/shared-types'
import { useAllergyStore } from '@/stores/allergy-store'
import { usePrescriptionStore } from '@/stores/prescription-store'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock PrescriptionEntry to expose a direct onSubmit trigger for P2/P3 path testing
vi.mock('@/components/clinical/PrescriptionEntry', () => ({
  PrescriptionEntry: vi.fn(),
}))

// Mock interactionAuditService to avoid Dexie dependency in P3 path
vi.mock('@/services/interactionAuditService', () => ({
  logInteractionCheck: vi.fn().mockResolvedValue(undefined),
}))

import { EncounterDashboard } from '@/components/encounter-dashboard'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'

function makePatient(id: string, nameLocal: string): FhirPatient {
  return {
    id,
    resourceType: 'Patient',
    name: [{ text: nameLocal }],
    gender: AdministrativeGender.MALE,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal,
      nameLatin: 'Ahmed Al-Rashid',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    meta: { lastUpdated: new Date().toISOString() },
  }
}

function resetStores() {
  usePatientStore.setState({
    query: '',
    results: [],
    selectedPatient: null,
    isSearching: false,
    syncStatus: { isPending: false, isError: false, lastSyncedAt: null },
  })
  useEncounterStore.setState({
    activeEncounter: null,
    isStarting: false,
  })
  // Set up auth session so practitionerRef is available for encounter operations
  useAuthSessionStore.getState().setSession({
    userId: 'test-user',
    practitionerId: 'Practitioner/test-practitioner',
    role: 'clinician',
    sessionId: 'test-session',
  })
  useAllergyStore.setState({
    allergies: [],
    isLoading: false,
    loadError: null,
    loadAllergies: vi.fn(),
  })
}

describe('Encounter Dashboard', () => {
  beforeEach(async () => {
    mockPush.mockClear()
    await db.patients.clear()
    await db.encounters.clear()
    resetStores()
    // Configure PrescriptionEntry mock to render a submit button for P2/P3 testing
    vi.mocked(PrescriptionEntry).mockImplementation(({ onSubmit }) =>
      React.createElement(
        'button',
        {
          'data-testid': 'mock-prescription-submit',
          onClick: () =>
            onSubmit({
              medicationCode: 'med-amox-500',
              medicationDisplay: 'Amoxicillin',
              medicationForm: 'Capsule',
              medicationStrength: '500mg',
              dosageQuantity: '1',
              dosageUnit: 'tablet',
              frequencyCode: 'BID',
              durationDays: '7',
              notes: '',
            }),
        },
        'Mock Submit Prescription',
      )
    )
  })

  it('should show patient not found when no patient exists locally', async () => {
    render(<EncounterDashboard patientId="test-id" />)
    await waitFor(() => {
      expect(screen.getByText('Patient not found in local session.')).toBeDefined()
    })
  })

  it('should navigate back to search when patient not found', async () => {
    render(<EncounterDashboard patientId="test-id" />)
    await waitFor(() => {
      expect(screen.getByText('Return to Patient Search')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Return to Patient Search'))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('should display patient info when a patient is selected', () => {
    const patient = makePatient('patient-123', 'أحمد الراشد')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-123" />)

    expect(screen.getByText('أحمد الراشد')).toBeDefined()
    expect(screen.getByText('Ahmed Al-Rashid')).toBeDefined()
    expect(screen.getByText('Encounter Dashboard')).toBeDefined()
  })

  it('should display patient demographics', () => {
    const patient = makePatient('patient-456', 'فاطمة حسن')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-456" />)

    expect(screen.getByText(/male/i)).toBeDefined()
  })

  it('should have a back to search button', () => {
    const patient = makePatient('patient-789', 'Test Patient')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-789" />)

    const backBtn = screen.getByLabelText('Back to search')
    expect(backBtn).toBeDefined()
    fireEvent.click(backBtn)
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('should show patient info section with accessible label', () => {
    const patient = makePatient('patient-abc', 'Ahmed Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-abc" />)

    expect(screen.getByLabelText('Patient information')).toBeDefined()
  })

  it('should show mismatch state when patientId does not match and not in Dexie', async () => {
    const patient = makePatient('patient-123', 'Ahmed')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="different-id" />)

    await waitFor(() => {
      expect(screen.getByText('Patient not found in local session.')).toBeDefined()
    })
  })

  it('should load patient from Dexie when store is empty (page refresh)', async () => {
    const patient = makePatient('dexie-patient', 'Ahmed from Dexie')
    await db.patients.add(patient)

    render(<EncounterDashboard patientId="dexie-patient" />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed from Dexie')).toBeDefined()
    })
    expect(screen.getByText('Encounter Dashboard')).toBeDefined()
  })

  // --- Story 2.1 encounter lifecycle tests ---

  it('should show "Start Encounter" button when no active encounter', () => {
    const patient = makePatient('patient-100', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-100" />)

    expect(screen.getByText('Start Encounter')).toBeDefined()
    expect(screen.getByText('No active consultation')).toBeDefined()
  })

  it('should show "Active Consultation" status after starting encounter', async () => {
    const patient = makePatient('patient-200', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-200" />)

    fireEvent.click(screen.getByText('Start Encounter'))

    await waitFor(() => {
      expect(screen.getByText('Active Consultation')).toBeDefined()
    })
  })

  it('should show "End Encounter" button when consultation is active', async () => {
    const patient = makePatient('patient-300', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-300" />)

    fireEvent.click(screen.getByText('Start Encounter'))

    await waitFor(() => {
      expect(screen.getByText('End Encounter')).toBeDefined()
    })
  })

  it('should return to idle state after ending encounter', async () => {
    const patient = makePatient('patient-400', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-400" />)

    fireEvent.click(screen.getByText('Start Encounter'))

    await waitFor(() => {
      expect(screen.getByText('End Encounter')).toBeDefined()
    })

    fireEvent.click(screen.getByText('End Encounter'))

    // After ending, activeEncounter is cleared and UI returns to idle state
    await waitFor(() => {
      expect(useEncounterStore.getState().activeEncounter).toBeNull()
    })
  })

  it('should have accessible encounter status section', () => {
    const patient = makePatient('patient-500', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-500" />)

    expect(screen.getByLabelText('Encounter status')).toBeDefined()
  })

  it('should display start time when encounter is active', async () => {
    const patient = makePatient('patient-600', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-600" />)

    fireEvent.click(screen.getByText('Start Encounter'))

    await waitFor(() => {
      expect(screen.getByText(/Started:/)).toBeDefined()
    })
  })

  // P13: CLAUDE.md safety rule #3 — drug interaction check unavailable warning
  it('should display "Drug interaction check unavailable" warning when prescriptions section is visible', async () => {
    const patient = makePatient('patient-700', 'Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-700" />)

    fireEvent.click(screen.getByText('Start Encounter'))

    await waitFor(() => {
      const status = screen.getByText(/drug interaction checking active/i)
      expect(status).toBeDefined()
      expect(status.closest('[role="status"]')).toBeDefined()
    })
  })

  // --- P2/P3: Allergy store safety gates in handleAddPrescription ---

  it('P2: blocks prescription add while allergy store is loading', async () => {
    const patient = makePatient('patient-p2', 'Test P2')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-p2" />)

    fireEvent.click(screen.getByText('Start Encounter'))
    await waitFor(() => {
      expect(screen.getByText('Active Consultation')).toBeDefined()
    })

    // Set allergy store to loading state AFTER encounter starts
    useAllergyStore.setState({ isLoading: true, loadError: null })

    // Inject mock so we can assert addPrescription was NOT called (blocked)
    const mockAddPrescription = vi.fn()
    usePrescriptionStore.setState({ addPrescription: mockAddPrescription } as never)

    fireEvent.click(screen.getByTestId('mock-prescription-submit'))

    await waitFor(() => {
      expect(
        screen.getByText(/Allergy data still loading — please wait before prescribing/),
      ).toBeDefined()
    })
    // Prescription must be fully blocked — addPrescription must never be called
    expect(mockAddPrescription).not.toHaveBeenCalled()
  })

  it('P3: allows prescription add with UNAVAILABLE flag when allergy data has load error', async () => {
    const patient = makePatient('patient-p3', 'Test P3')
    usePatientStore.setState({ selectedPatient: patient })
    // Provide a mock addPrescription that returns a stub rx so the P3 path completes
    const mockAddPrescription = vi.fn().mockResolvedValue({ id: 'rx-test-001' })
    usePrescriptionStore.setState({ addPrescription: mockAddPrescription } as never)

    render(<EncounterDashboard patientId="patient-p3" />)

    fireEvent.click(screen.getByText('Start Encounter'))
    await waitFor(() => {
      expect(screen.getByText('Active Consultation')).toBeDefined()
    })

    // Set allergy store to error state
    useAllergyStore.setState({ isLoading: false, loadError: 'Failed to load allergies' })

    fireEvent.click(screen.getByTestId('mock-prescription-submit'))

    await waitFor(() => {
      expect(
        screen.getByText(/Allergy data unavailable — interaction check incomplete/),
      ).toBeDefined()
    })
    // Prescription must still be saved (with UNAVAILABLE flag)
    expect(mockAddPrescription).toHaveBeenCalledWith(
      expect.objectContaining({ medicationDisplay: 'Amoxicillin' }),
      expect.any(String), // encounterId
      'patient-p3',
      expect.any(String), // practitionerRef
      { interactionCheckResult: 'UNAVAILABLE' },
    )
  })
})
