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
      lastUpdatedCol: 'Last Updated',
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
      noResultsDescription: 'Try adjusting your search or filters.',
      clearFilters: 'Clear filters',
      previous: 'Previous',
      next: 'Next',
      allergyFlag: 'Has allergies',
      nidMissingBadge: 'NID Missing',
      syncing: 'Syncing...',
      statTotal: 'Total patients',
      statActive: 'Active',
      statWithAllergies: 'With allergies',
      statRecentlyUpdated: 'Recently updated',
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

// Mock EmptyState from ui-kit so we don't pull in the ui-kit Button/icon chain
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string
    description?: string
    action?: { label: string; onClick: () => void }
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description && <p>{description}</p>}
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}))

// Mock Lucide icons from ui-kit
vi.mock('@ultranos/ui-kit/icons', () => ({
  Users: () => <svg data-testid="icon-users" />,
  UserCheck: () => <svg data-testid="icon-user-check" />,
  AlertTriangle: ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) => <svg data-testid="icon-alert-triangle" className={className} aria-hidden={ariaHidden} />,
  Clock: () => <svg data-testid="icon-clock" />,
  FileSearch: () => <svg data-testid="icon-file-search" />,
  ChevronUp: ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) => <svg data-testid="icon-chevron-up" className={className} aria-hidden={ariaHidden} />,
  ChevronDown: ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) => <svg data-testid="icon-chevron-down" className={className} aria-hidden={ariaHidden} />,
}))

// Mock ui-kit Input so we don't pull in the full ui-kit chain
vi.mock('@ultranos/ui-kit/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

// Mock app-local Card
vi.mock('@/components/Card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="stat-card" className={className}>
      {children}
    </div>
  ),
}))

// Mock formatDate / formatRelativeTime
vi.mock('@ultranos/ui-kit', () => ({
  formatDate: (_iso: string, _locale: string) => {
    // Parse the ISO date and return DD/MM/YYYY matching the real formatDate('en') output
    const d = new Date(_iso)
    if (isNaN(d.getTime())) return 'Invalid Date'
    const day = String(d.getUTCDate()).padStart(2, '0')
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const year = d.getUTCFullYear()
    return `${day}/${month}/${year}`
  },
  formatRelativeTime: (iso: string) => iso,
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

// Mock use-patient-list-sync
vi.mock('@/lib/use-patient-list-sync', () => ({
  usePatientListSync: () => ({
    syncAll: vi.fn().mockResolvedValue([]),
    cancel: vi.fn(),
  }),
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
      // Allergy signal is now a labelled destructive pill (text visible + aria-label)
      const flags = screen.getAllByLabelText('Has allergies')
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

  it('filters by status via pill tab-bar', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
      expect(screen.getByText('Fatima Ali')).toBeDefined()
    })

    // Click the "Active" pill tab
    const activeTab = screen.getByRole('button', { name: 'Active' })
    fireEvent.click(activeTab)

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
      const registerBtns = screen.getAllByText('Register New Patient')
      expect(registerBtns.length).toBeGreaterThanOrEqual(1)
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

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
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
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
    })
    // Allergy pill has aria-label; before re-focus there should be none
    expect(screen.queryAllByLabelText('Has allergies')).toHaveLength(0)

    // Returning to the tab re-reads Dexie and surfaces the newly-pulled allergy.
    fireEvent.focus(window)
    await vi.waitFor(() => {
      expect(screen.getAllByLabelText('Has allergies')).toHaveLength(1)
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
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
      // Last Visit from the Hub summary, rendered DD/MM/YYYY.
      expect(screen.getByText('20/06/2026')).toBeDefined()
      // Allergy pill from the Hub summary even with no local allergy records.
      expect(screen.getAllByLabelText('Has allergies')).toHaveLength(1)
    })
  })

  // ─── New: EmptyState ──────────────────────────────────────────────────────

  it('shows EmptyState (zero-data) when no patients exist', async () => {
    mockPatientsToArray.mockResolvedValue([])
    mockAllergyToArray.mockResolvedValue([])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined()
      expect(screen.getByText('No patients registered yet')).toBeDefined()
    })
  })

  it('zero-data EmptyState renders a Register New Patient action', async () => {
    mockPatientsToArray.mockResolvedValue([])
    mockAllergyToArray.mockResolvedValue([])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      // Both the header CTA and the EmptyState action render "Register New Patient"
      const btns = screen.getAllByRole('button', { name: 'Register New Patient' })
      expect(btns.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows EmptyState (no-results) when filters produce empty result', async () => {
    // patient1 is active, patient2 is inactive — 3 active patients needed to hide register btn
    const p3 = makePatient({ id: 'p-3', _ultranos: { nameGiven: 'Omar', isActive: true } })
    mockPatientsToArray.mockResolvedValue([patient1, p3, makePatient({ id: 'p-4', _ultranos: { nameGiven: 'Sara', isActive: true } })])
    mockAllergyToArray.mockResolvedValue([])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
    })

    // Click "Inactive" tab — all patients are active so result is empty
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }))

    await vi.waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined()
      expect(screen.getByText('No patients match your filters')).toBeDefined()
    })
  })

  it('no-results EmptyState renders a Clear filters action', async () => {
    const p3 = makePatient({ id: 'p-3', _ultranos: { nameGiven: 'Omar', isActive: true } })
    mockPatientsToArray.mockResolvedValue([patient1, p3, makePatient({ id: 'p-4', _ultranos: { nameGiven: 'Sara', isActive: true } })])
    mockAllergyToArray.mockResolvedValue([])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDefined()
    })
  })

  // ─── New: Stat strip ──────────────────────────────────────────────────────

  it('renders stat strip with total count when patients exist', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByTestId('stat-strip')).toBeDefined()
      // patient1 + patient2 = 2 total
      expect(screen.getByTestId('stat-total').textContent).toBe('2')
    })
  })

  it('stat strip shows correct active count', async () => {
    // patient1 active, patient2 inactive
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByTestId('stat-active').textContent).toBe('1')
    })
  })

  it('stat strip shows correct with-allergies count', async () => {
    // patient1 has allergy (from allergyIntolerances mock), patient2 does not
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByTestId('stat-allergies').textContent).toBe('1')
    })
  })

  it('stat strip does NOT render when there are no patients', async () => {
    mockPatientsToArray.mockResolvedValue([])
    mockAllergyToArray.mockResolvedValue([])

    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined()
    })

    expect(screen.queryByTestId('stat-strip')).toBeNull()
  })

  // ─── New: Status pill tab-bar ─────────────────────────────────────────────

  it('status tab-bar renders All / Active / Inactive tabs', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
    })

    expect(screen.getByRole('button', { name: 'All' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Active' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeDefined()
  })

  it('"All" tab is aria-pressed initially', async () => {
    const { PatientDirectory } = await import(
      '@/components/patients/PatientDirectory'
    )
    render(<PatientDirectory />)

    await vi.waitFor(() => {
      expect(screen.getByText('Ahmad Khan')).toBeDefined()
    })

    const allTab = screen.getByRole('button', { name: 'All' }) as HTMLButtonElement
    expect(allTab.getAttribute('aria-pressed')).toBe('true')
  })
})
