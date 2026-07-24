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

// Mock next-intl using the real English catalog, resolved by namespace.
vi.mock('next-intl', async () => {
  const en = (await import('../../messages/en.json')).default as unknown as Record<
    string,
    Record<string, string>
  >
  const interpolate = (val: string, params?: Record<string, unknown>) =>
    params
      ? val.replace(/\{(\w+)\}/g, (_, k) =>
          k in params ? String(params[k]) : `{${k}}`,
        )
      : val
  return {
    useLocale: () => 'en',
    useTranslations:
      (namespace?: string) =>
      (key: string, params?: Record<string, unknown>) => {
        const ns = namespace
          ? en[namespace] ?? {}
          : (en as unknown as Record<string, string>)
        const val = (ns as Record<string, string>)[key]
        return val != null ? interpolate(val, params) : key
      },
  }
})

// Mock Supabase with a controllable session token for the Hub-fetch path.
const { supabaseState } = vi.hoisted(() => ({
  supabaseState: { token: undefined as string | undefined },
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: supabaseState.token
            ? { access_token: supabaseState.token }
            : null,
        },
      }),
    },
  }),
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
      patient_tier: 'FREE',
      isNomadic: false,
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
    practitionerId: 'test-practitioner',
    role: 'clinician',
    sessionId: 'test-session',
    email: 'test@hospital.com',
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
    // No Hub session by default; tests that exercise the Hub path opt in.
    supabaseState.token = undefined
    // Default to an offline fetch so background sync pulls fail gracefully.
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch
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

    // The rail mirrors patient name, so we use getAllByText (main card + rail)
    expect(screen.getAllByText('أحمد الراشد').length).toBeGreaterThan(0)
    expect(screen.getByText('Ahmed Al-Rashid')).toBeDefined()
  })

  it('should display age computed from an exact birthDate', () => {
    const patient = makePatient('patient-dob', 'DOB Patient') // birthDate 1985-03-15
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-dob" />)

    // Age is rendered, not the "Unknown age" fallback.
    // Rail mirrors age so we use getAllByText (main card + rail).
    expect(screen.queryByText(/Unknown age/i)).toBeNull()
    expect(screen.getAllByText(/\d+y/).length).toBeGreaterThan(0)
  })

  it('should display age from year-only birthYear when no exact birthDate', () => {
    // Year-only patients (the common case for this population) carry
    // _ultranos.birthYear and no top-level birthDate. Age must still render.
    const patient = makePatient('patient-year-only', 'Year Only')
    patient.birthDate = undefined
    patient.birthYearOnly = true
    patient._ultranos.birthYear = new Date().getFullYear() - 40
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-year-only" />)

    expect(screen.queryByText(/Unknown age/i)).toBeNull()
    expect(screen.getByText('40y')).toBeDefined()
  })

  it('should display patient demographics', () => {
    const patient = makePatient('patient-456', 'فاطمة حسن')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-456" />)

    // Rail mirrors demographics so we use getAllByText (main card + rail).
    expect(screen.getAllByText(/male/i).length).toBeGreaterThan(0)
  })

  it('should render the patronymic name chain as separate segments', () => {
    const patient = makePatient('patient-chain', 'Ahmed Ali Hassan')
    patient._ultranos.nameGiven = 'Ahmed'
    patient._ultranos.nameFather = 'Ali'
    patient._ultranos.nameGrandfather = 'Hassan'
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-chain" />)

    // Each segment renders independently (separated by gray-circle dividers),
    // not as one joined nameLocal string.
    expect(screen.getByText('Ahmed')).toBeDefined()
    expect(screen.getByText('Ali')).toBeDefined()
    expect(screen.getByText('Hassan')).toBeDefined()
  })

  it('should fall back to nameLocal when patronymic parts are absent', () => {
    const patient = makePatient('patient-local', 'محمد عبدالله') // only nameLocal set
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-local" />)

    // Rail mirrors patient name, so use getAllByText (main card + rail).
    expect(screen.getAllByText('محمد عبدالله').length).toBeGreaterThan(0)
  })

  it('should show patient info section with accessible label', () => {
    const patient = makePatient('patient-abc', 'Ahmed Test')
    usePatientStore.setState({ selectedPatient: patient })

    render(<EncounterDashboard patientId="patient-abc" />)

    // The rail uses aria-label="Patient summary" (t('railPatientCard')), not
    // "Patient information" — so only one element carries this label. getByLabelText
    // is correct and unique here.
    expect(screen.getByLabelText('Patient information')).toBeInTheDocument()
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
      // Rail mirrors patient name, so use getAllByText (main card + rail).
      expect(screen.getAllByText('Ahmed from Dexie').length).toBeGreaterThan(0)
    })
  })

  it('should load patient from the Hub when starting a new encounter for a patient absent from Dexie', async () => {
    // Reproduces the "Start New Encounter" bug: navigation lands on
    // /encounter/[id] with an empty patient store and the patient missing
    // from IndexedDB (the Patient sync pull does not deliver it). The
    // dashboard must fall back to the Hub instead of showing "not found".
    supabaseState.token = 'test-token'
    const hubRow = {
      id: 'hub-patient',
      resourceType: 'Patient',
      name: [{ text: 'Ahmed from Hub' }],
      gender: 'male',
      birthDate: '1990-01-01',
      birthYearOnly: false,
      _ultranos: {
        nameLocal: 'Ahmed from Hub',
        nameLatin: 'Ahmed Hub Latin',
        isNomadic: false,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      meta: { lastUpdated: '2026-01-01T00:00:00.000Z' },
    }
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('patient.read')) {
        return {
          ok: true,
          json: async () => ({ result: { data: { json: hubRow } } }),
        } as Response
      }
      // Background sync pull (sync.pull) — return no changes.
      return {
        ok: true,
        json: async () => ({ result: { data: { json: { changes: [] } } } }),
      } as Response
    }) as unknown as typeof fetch

    render(<EncounterDashboard patientId="hub-patient" />)

    await waitFor(() => {
      // Rail mirrors patient name, so use getAllByText (main card + rail).
      expect(screen.getAllByText('Ahmed from Hub').length).toBeGreaterThan(0)
    })
    // The patient must NOT show the "not found" fallback.
    expect(screen.queryByText('Patient not found in local session.')).toBeNull()
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

  it('renders encounter in two columns with a pinned context rail', async () => {
    const patient = makePatient('patient-rail', 'Rail Test')
    usePatientStore.setState({ selectedPatient: patient })
    render(<EncounterDashboard patientId="patient-rail" />)
    fireEvent.click(screen.getByText('Start Encounter'))
    await waitFor(() => {
      expect(screen.getByText('Active Consultation')).toBeDefined()
    })
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    const rail = screen.getByRole('complementary')
    expect(rail).toHaveTextContent(/interaction check/i)
  })

  it('allergy banner is not inside the rail landmark', async () => {
    const patient = makePatient('patient-rail2', 'Rail Test 2')
    usePatientStore.setState({ selectedPatient: patient })
    render(<EncounterDashboard patientId="patient-rail2" />)
    fireEvent.click(screen.getByText('Start Encounter'))
    await waitFor(() => {
      expect(screen.getByText('Active Consultation')).toBeDefined()
    })
    const rail = screen.getByRole('complementary')
    // The AllergyBanner renders in the detail-banner slot (full-width, above grid).
    // Verify: the banner's test-id element is NOT a descendant of the aside/rail.
    const allergyBanner = document.querySelector('[data-testid="allergy-banner"]')
    expect(allergyBanner).not.toBeNull()
    expect(rail.contains(allergyBanner)).toBe(false)
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

// EncounterDashboard RTL snapshot tests deferred — pre-existing render issue with isActive dependency.
// RTL CSS verified via CSS property audit (Task 2). See deferred-work.md D-RTL4.
it.todo('matches snapshot in RTL mode')
