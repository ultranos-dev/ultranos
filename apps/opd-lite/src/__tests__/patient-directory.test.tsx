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
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
      expect(screen.getByText('Fatima Ali')).toBeDefined()
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
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
    })

    const searchInput = screen.getByPlaceholderText('Search by name or phone...')
    fireEvent.change(searchInput, { target: { value: 'Fatima' } })

    // Wait for debounce
    await vi.waitFor(() => {
      expect(screen.queryByText('Ahmad Khan')).toBeNull()
      expect(screen.getByText('Fatima Ali')).toBeDefined()
    }, { timeout: 1000 })
  })

  it('filters by status', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
      expect(screen.getByText('Fatima Ali')).toBeDefined()
    })

    const statusSelect = screen.getByLabelText('Status')
    fireEvent.change(statusSelect, { target: { value: 'active' } })

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
      expect(screen.queryByText('Fatima Ali')).toBeNull()
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
