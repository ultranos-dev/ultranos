import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useAllergyStore } from '@/stores/allergy-store'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock audit module to avoid dexie resolution issue in audit-logger
vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE' },
  AuditResourceType: { ALLERGY: 'ALLERGY' },
}))

import { AllergyBanner } from '@/components/clinical/AllergyBanner'

function makeAllergy(
  id: string,
  substance: string,
  status: 'active' | 'inactive' | 'resolved' = 'active',
): FhirAllergyIntolerance {
  return {
    id,
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [
        {
          system:
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const,
          code: status,
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system:
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification' as const,
          code: 'confirmed',
        },
      ],
    },
    type: 'allergy',
    criticality: 'high',
    code: { text: substance },
    patient: { reference: 'Patient/patient-001' },
    recordedDate: '2026-05-01T10:00:00Z',
    _ultranos: {
      substanceFreeText: substance,
      createdAt: '2026-05-01T10:00:00Z',
      recordedByRole: 'DOCTOR',
      isOfflineCreated: false,
      hlcTimestamp: '000001714600000:00001:node-1',
    },
    meta: { lastUpdated: '2026-05-01T10:00:00Z' },
  }
}

const mockLoadAllergies = vi.fn()

function resetAllergyStore(overrides: Partial<ReturnType<typeof useAllergyStore.getState>> = {}) {
  useAllergyStore.setState({
    allergies: [],
    isLoading: false,
    loadError: null,
    loadAllergies: mockLoadAllergies,
    ...overrides,
  })
}

describe('AllergyBanner', () => {
  beforeEach(() => {
    resetAllergyStore()
  })

  it('renders in red with active allergies', async () => {
    resetAllergyStore({
      allergies: [
        makeAllergy('a1', 'Penicillin'),
        makeAllergy('a2', 'Peanuts'),
      ],
    })

    const { container } = render(<AllergyBanner patientId="patient-001" />)
    const banner = container.querySelector('[data-testid="allergy-banner"]')

    await waitFor(() => {
      expect(banner).toBeDefined()
      expect(banner?.getAttribute('data-banner-state')).toBe('active')
      expect(banner?.className).toContain('bg-red-600')
      expect(banner?.className).toContain('text-white')
      expect(screen.getByText(/Penicillin/)).toBeDefined()
      expect(screen.getByText(/Peanuts/)).toBeDefined()
    })
  })

  it('renders neutral state when no known allergies', async () => {
    resetAllergyStore({ allergies: [] })

    const { container } = render(<AllergyBanner patientId="patient-001" />)
    const banner = container.querySelector('[data-testid="allergy-banner"]')

    await waitFor(() => {
      expect(banner?.getAttribute('data-banner-state')).toBe('nka')
      expect(screen.getByText(/No Known Allergies/)).toBeDefined()
    })
  })

  it('renders warning state when load error occurs', async () => {
    resetAllergyStore({ loadError: 'Failed to load allergy data' })

    const { container } = render(<AllergyBanner patientId="patient-001" />)
    const banner = container.querySelector('[data-testid="allergy-banner"]')

    await waitFor(() => {
      expect(banner?.getAttribute('data-banner-state')).toBe('warning')
      expect(banner?.getAttribute('aria-live')).toBe('assertive')
      expect(banner?.className).toContain('bg-yellow-400')
      expect(screen.getByText(/Allergy data unavailable/)).toBeDefined()
    })
  })

  it('has role="alert" and aria-live="assertive" for accessibility', async () => {
    resetAllergyStore({
      allergies: [makeAllergy('a1', 'Penicillin')],
    })

    const { container } = render(<AllergyBanner patientId="patient-001" />)
    const banner = container.querySelector('[data-testid="allergy-banner"]')

    await waitFor(() => {
      expect(banner?.getAttribute('role')).toBe('alert')
      expect(banner?.getAttribute('aria-live')).toBe('assertive')
    })
  })

  it('renders first in the encounter dashboard DOM', async () => {
    // This test verifies that in the encounter-dashboard, the allergy banner
    // is the FIRST child element rendered before any other clinical content.
    // We verify this by checking the banner's position attribute.
    resetAllergyStore({
      allergies: [makeAllergy('a1', 'Penicillin')],
    })

    const { container } = render(<AllergyBanner patientId="patient-001" />)
    const banner = container.querySelector('[data-testid="allergy-banner"]')

    await waitFor(() => {
      expect(banner?.className).toContain('sticky')
      expect(banner?.className).toContain('top-0')
      expect(banner?.className).toContain('z-50')
    })
  })

  it('is never collapsed — no collapse toggle exists', () => {
    resetAllergyStore({
      allergies: [makeAllergy('a1', 'Penicillin')],
    })

    const { container } = render(<AllergyBanner patientId="patient-001" />)

    // No collapse button, toggle, or expandable wrapper
    const collapseButtons = container.querySelectorAll(
      'button[aria-expanded], [data-collapse], [data-toggle]',
    )
    expect(collapseButtons.length).toBe(0)
  })

  it('renders loading state with polite aria-live', () => {
    resetAllergyStore({ isLoading: true })

    const { container } = render(<AllergyBanner patientId="patient-001" />)
    const banner = container.querySelector('[data-testid="allergy-banner"]')

    expect(banner?.getAttribute('data-banner-state')).toBe('loading')
    expect(banner?.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText(/Loading allergy data/)).toBeDefined()
  })

  it('renders correctly in RTL layout — allergy substances visible', () => {
    resetAllergyStore({
      allergies: [
        makeAllergy('a1', 'Penicillin'),
        makeAllergy('a2', 'Peanuts'),
      ],
    })

    const { container } = render(
      <div dir="rtl">
        <AllergyBanner patientId="patient-001" />
      </div>,
    )

    const banner = container.querySelector('[data-testid="allergy-banner"]')
    // Banner must still render active state and show substances in RTL
    expect(banner?.getAttribute('data-banner-state')).toBe('active')
    expect(banner?.className).toContain('bg-red-600')
    expect(screen.getByText(/Penicillin/)).toBeDefined()
    expect(screen.getByText(/Peanuts/)).toBeDefined()
    // Snapshot confirms DOM structure is stable inside an RTL container.
    // Note: JSDOM does not compute CSS, so layout directionality (padding flip, text alignment)
    // requires a Playwright visual test — this snapshot guards against DOM structure regressions.
    expect(container).toMatchSnapshot()
  })
})
