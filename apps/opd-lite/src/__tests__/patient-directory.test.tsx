import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const messages: Record<string, string> = {
      title: 'Patient Directory',
      searchPlaceholder: 'Search by name or phone...',
      name: 'Name',
      age: 'Age',
      gender: 'Gender',
      phone: 'Phone',
      lastVisit: 'Last Visit',
      status: 'Status',
      allergies: 'Allergies',
      active: 'Active',
      inactive: 'Inactive',
      all: 'All',
      hasAllergies: 'Has Allergies',
      yes: 'Yes',
      no: 'No',
      lastVisitFilter: 'Last Visit',
      today: 'Today',
      thisWeek: 'This Week',
      thisMonth: 'This Month',
      registerNew: 'Register New Patient',
      noPatients: 'No patients registered yet',
      noPatientsDescription: 'Get started by registering your first patient.',
      noResults: 'No patients match your filters',
      previous: 'Previous',
      next: 'Next',
      allergyFlag: 'Has allergies',
    }
    return (key: string, params?: Record<string, unknown>) => {
      const val = messages[key] ?? key
      if (params && val.includes('{')) {
        return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
      }
      return val
    }
  },
}))

// Mock Dexie DB
const mockPatientsToArray = vi.fn()
const mockAllergyToArray = vi.fn()
const mockEncountersToArray = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    patients: { toArray: (...args: unknown[]) => mockPatientsToArray(...args) },
    allergyIntolerances: { toArray: (...args: unknown[]) => mockAllergyToArray(...args) },
    encounters: { toArray: (...args: unknown[]) => mockEncountersToArray(...args) },
  },
}))

function makePatient(overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'p-1',
    resourceType: 'Patient',
    name: [{ given: ['Ahmad'], family: 'Khan' }],
    gender: 'male',
    birthDate: '1990-01-15',
    birthYearOnly: false,
    telecom: [{ system: 'phone', value: '+93701234567' }],
    _ultranos: {
      nameLocal: 'احمد خان',
      nameGiven: 'Ahmad',
      nameFather: 'Khan',
      isActive: true,
      isNomadic: false,
      patient_tier: 'FREE' as const,
      createdAt: '2025-01-01T00:00:00Z',
    },
    meta: { lastUpdated: '2025-01-01T00:00:00Z' },
  }

  // Merge _ultranos separately
  const merged = { ...defaults, ...overrides }
  if (overrides._ultranos) {
    merged._ultranos = { ...defaults._ultranos, ...(overrides._ultranos as Record<string, unknown>) } as typeof defaults._ultranos
  }
  return merged
}

const patient1 = makePatient({ id: 'p-1' })
const patient2 = makePatient({
  id: 'p-2',
  _ultranos: {
    nameLocal: 'فاطمه',
    nameGiven: 'Fatima',
    nameFather: 'Ali',
    isActive: false,
    isNomadic: false,
    patient_tier: 'FREE' as const,
    createdAt: '2025-02-01T00:00:00Z',
  },
  gender: 'female',
  birthDate: '1985-06-20',
  telecom: [{ system: 'phone', value: '+93709876543' }],
})

describe('PatientDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPatientsToArray.mockResolvedValue([patient1, patient2])
    mockAllergyToArray.mockResolvedValue([
      { id: 'a-1', patient: { reference: 'Patient/p-1' } },
    ])
    mockEncountersToArray.mockResolvedValue([])
  })

  it('renders page title', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Patient Directory')).toBeDefined()
    })
  })

  it('renders patient rows from mock data', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText('Fatima')).toBeDefined()
    })
  })

  it('shows allergy flag for patients with allergies', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      const flags = screen.getAllByRole('img', { name: 'Has allergies' })
      expect(flags).toHaveLength(1)
    })
  })

  it('filters by search query', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText('Search by name or phone...')
    fireEvent.change(searchInput, { target: { value: 'Fatima' } })

    // Wait for debounce
    await vi.waitFor(() => {
      expect(screen.queryByText('Ahmad')).toBeNull()
      expect(screen.getByText('Fatima')).toBeDefined()
    }, { timeout: 1000 })
  })

  it('filters by status', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText('Fatima')).toBeDefined()
    })

    const statusSelect = screen.getByLabelText('Status')
    fireEvent.change(statusSelect, { target: { value: 'active' } })

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.queryByText('Fatima')).toBeNull()
    })
  })

  it('shows register button when fewer than 3 results', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      const registerLinks = screen.getAllByText('Register New Patient')
      expect(registerLinks.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders Last Visit from encounter period.start, never "Invalid Date" from the HLC timestamp', async () => {
    mockEncountersToArray.mockResolvedValue([
      {
        id: 'e-1',
        subject: { reference: 'Patient/p-1' },
        period: { start: '2026-06-20T10:00:00Z' },
        // HLC clock string — must NOT be used as the visit date.
        _ultranos: { hlcTimestamp: '000001700000000:00000:node-1' },
        meta: { lastUpdated: '2026-06-20T10:00:00Z' },
      },
    ])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    // Rendered via formatDate(..., 'en') → MENA Gregorian DD/MM/YYYY.
    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      expect(screen.getByText('20/06/2026')).toBeDefined()
    })
    expect(screen.queryByText('Invalid Date')).toBeNull()
  })

  it('refreshes the allergy column on tab re-focus (data pulled while away)', async () => {
    mockAllergyToArray.mockReset()
    mockAllergyToArray.mockResolvedValueOnce([]) // mount: no allergies cached yet
    mockAllergyToArray.mockResolvedValue([
      { id: 'a-1', patient: { reference: 'Patient/p-1' } },
    ]) // later reads: allergy now present in Dexie

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
    })
    expect(screen.queryAllByRole('img', { name: 'Has allergies' })).toHaveLength(0)

    // Returning to the tab re-reads Dexie and surfaces the newly-pulled allergy.
    fireEvent.focus(window)
    await vi.waitFor(() => {
      expect(screen.getAllByRole('img', { name: 'Has allergies' })).toHaveLength(1)
    })
  })

  it('uses the Hub list summary (hasAllergies / lastVisitAt) when local cache is empty', async () => {
    mockAllergyToArray.mockResolvedValue([])    // no local allergies cached
    mockEncountersToArray.mockResolvedValue([])  // no local encounters cached
    mockPatientsToArray.mockResolvedValue([
      makePatient({
        id: 'p-1',
        _ultranos: { hasAllergies: true, lastVisitAt: '2026-06-20T10:00:00Z' },
      }),
    ])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
      // Last Visit from the Hub summary, rendered DD/MM/YYYY.
      expect(screen.getByText('20/06/2026')).toBeDefined()
      // Allergy flag from the Hub summary even with no local allergy records.
      expect(screen.getAllByRole('img', { name: 'Has allergies' })).toHaveLength(1)
    })
  })

  it('shows empty state when no patients exist', async () => {
    mockPatientsToArray.mockResolvedValue([])
    mockAllergyToArray.mockResolvedValue([])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('No patients registered yet')).toBeDefined()
    })
  })
})
