import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// --- PurchaseOrdersPage mocks ---
const mockGetPurchaseOrders = vi.fn()
const mockPharmacySettingsFirst = vi.fn()

vi.mock('@/lib/procurement/purchase-order-service', () => ({
  getPurchaseOrders: (...a: unknown[]) => mockGetPurchaseOrders(...a),
}))

// --- db mock (shared by both tests) ---
const mockToArray = vi.fn()
const mockPut = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({ first: () => mockPharmacySettingsFirst() }),
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

// --- Auth session store mock (required by ProfileCard, PharmacyInfoCard, SessionInfoCard) ---
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

// --- Supabase mock (required by MfaStatusCard) ---
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }),
      },
    },
  }),
}))

// --- next/link mock (required by DataBudgetCard) ---
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

import { PurchaseOrdersPage } from '@/components/pharmacy/procurement/PurchaseOrdersPage'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPurchaseOrders.mockResolvedValue([])
  mockPharmacySettingsFirst.mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 })
  mockToArray.mockResolvedValue([{ ...DEFAULT_PHARMACY_SETTINGS, poApprovalThreshold: 0 }])
  mockPut.mockResolvedValue(undefined)
})

describe('PO approval — list pill tab', () => {
  it('renders a pending_approval pill tab in PurchaseOrdersPage', () => {
    render(<PurchaseOrdersPage />)
    // next-intl mock returns the key string; tabPendingApproval is always rendered (tabs are unconditional)
    expect(screen.getByText('tabPendingApproval')).toBeInTheDocument()
  })
})

describe('PO approval — settings threshold field', () => {
  it('renders the po-approval-threshold input in PharmacySettingsView', async () => {
    render(<PharmacySettingsView />)
    const input = await screen.findByTestId('setting-po-approval-threshold')
    expect(input).toBeInTheDocument()
  })
})
