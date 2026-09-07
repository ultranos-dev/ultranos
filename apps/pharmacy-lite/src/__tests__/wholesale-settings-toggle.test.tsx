import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock auth-session-store (required by ProfileCard, PharmacyInfoCard, SessionInfoCard)
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        session: {
          userId: 'u1',
          role: 'PHARMACIST',
          email: 'pharm@clinic.example',
          name: 'Dr. Test',
          loginAt: new Date(Date.now() - 60_000).toISOString(),
          pharmacyName: 'Test Pharmacy',
          licenseRef: 'PH-001',
        },
        isAuthenticated: true,
      }),
    {
      getState: () => ({
        session: null,
        isAuthenticated: false,
      }),
    },
  ),
}))

// Mock Supabase (required by MfaStatusCard)
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }),
      },
    },
  }),
}))

// Mock next/link (required by DataBudgetCard)
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => <a href={href} {...props}>{children}</a>,
}))

// Mock db — provide pharmacySettings table + all module-level helpers used by data-budget-store
const mockToArray = vi.fn()
const mockPut = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toArray: (...args: unknown[]) => mockToArray(...args),
      put: (...args: unknown[]) => mockPut(...args),
    },
  },
  checkAndRolloverCycle: vi.fn().mockResolvedValue(false),
  getDataBudgetConfig: vi.fn().mockResolvedValue({
    id: 'config',
    planSizeMB: 500,
    billingCycleDay: 1,
    lowDataMode: false,
    currentCycleStart: '2026-09-01',
  }),
  recordDataUsage: vi.fn().mockResolvedValue(undefined),
  getUsageByDay: vi.fn().mockResolvedValue([]),
  getUsageForCycle: vi.fn().mockResolvedValue([]),
  updateDataBudgetConfig: vi.fn().mockResolvedValue(undefined),
}))

import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'

beforeEach(() => {
  mockToArray.mockResolvedValue([])
  mockPut.mockResolvedValue(undefined)
})

describe('wholesale settings toggle', () => {
  it('renders an enable-wholesale control', () => {
    render(<PharmacySettingsView />)
    expect(screen.getByTestId('toggle-wholesale')).toBeInTheDocument()
  })
})
