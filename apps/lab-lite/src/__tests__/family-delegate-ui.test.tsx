/**
 * family-delegate-ui.test.tsx — Story 45.3: Family Delegate Result Access
 *
 * Component render tests:
 *  9.4  DelegateRegistration — form render, consent gate, validation, submission, RTL
 *  9.5  RevokeDelegateDialog — render, validation, success, error, RTL
 *  9.4+ DelegateManagementSection — empty state, delegate list, add-button guard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import 'fake-indexeddb/auto'

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mockGetConsentsByPatient = vi.hoisted(() => vi.fn())
const mockAddFamilyDelegate = vi.hoisted(() => vi.fn())
const mockGetDelegatesByPatient = vi.hoisted(() => vi.fn())
const mockRevokeDelegate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  getConsentsByPatient: mockGetConsentsByPatient,
  addFamilyDelegate: mockAddFamilyDelegate,
  getDelegatesByPatient: mockGetDelegatesByPatient,
  revokeDelegate: mockRevokeDelegate,
}))

vi.mock('@/lib/delegate-crypto', () => ({
  encryptText: vi.fn().mockResolvedValue('ENCRYPTED:mock'),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: vi.fn().mockReturnValue({}) },
  serializeHlc: vi.fn().mockReturnValue('2026-06-12T00:00:00.000Z_0000_node1'),
}))

vi.mock('@/lib/audit-client', () => ({
  reportDelegateAuditEvent: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn().mockResolvedValue(undefined),
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/adapters/dexie', () => ({
  DexieAuditAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/drain', () => ({
  AuditDrainWorker: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    vi.fn((selector: (state: any) => any) =>
      selector({ session: { userId: 'tech-1', email: 'tech@lab.test', role: 'LAB_TECH' } }),
    ),
    {
      getState: vi.fn().mockReturnValue({
        session: { userId: 'tech-1', email: 'tech@lab.test', role: 'LAB_TECH' },
      }),
    },
  ),
}))

// Translate keys verbatim so assertions are readable
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      // Simple interpolation: replace {key} with value
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replace(`{${k}}`, String(v)),
        key,
      )
    }
    return key
  },
}))

// Mock ShadCN Dialog — jsdom doesn't support Radix portals well
vi.mock('@ultranos/ui-kit/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))

// Mock ShadCN Select — radix portals don't work in jsdom
vi.mock('@ultranos/ui-kit/components/ui/select', () => ({
  Select: ({ value, onValueChange, children, disabled }: any) => (
    <div data-testid="select" data-value={value} data-disabled={disabled ? 'true' : undefined}>
      {/* Render a plain <select> so tests can interact with it */}
      <select
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        disabled={disabled}
        aria-label="Relationship to Patient"
      >
        <option value="">—</option>
        <option value="spouse">relationship.spouse</option>
        <option value="parent">relationship.parent</option>
        <option value="child">relationship.child</option>
        <option value="sibling">relationship.sibling</option>
        <option value="grandchild">relationship.grandchild</option>
        <option value="in-law">relationship.inLaw</option>
        <option value="other">relationship.other</option>
      </select>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

// ---------------------------------------------------------------------------
// Component imports (after mocks)
// ---------------------------------------------------------------------------

import { DelegateRegistration } from '../components/consent/DelegateRegistration'
import { RevokeDelegateDialog } from '../components/consent/RevokeDelegateDialog'
import { DelegateManagementSection } from '../components/consent/DelegateManagementSection'
import type { ConsentRecord, FamilyDelegate } from '../lib/db'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_CONSENT: ConsentRecord = {
  id: 1,
  patientRef: 'Patient/test-abc',
  method: 'verbal',
  language: 'en',
  consentTextVersion: '1.0.0',
  witnessingTechId: 'tech-1',
  capturedAt: '2026-06-01T10:00:00.000Z',
  hlcTimestamp: '2026-06-01T10:00:00.000Z_0000_node1',
  status: 'active',
  syncStatus: 'pending',
}

const ACTIVE_DELEGATE: FamilyDelegate = {
  id: 42,
  patientRef: 'Patient/test-abc',
  delegatePhone: 'ENCRYPTED:+93701234567',
  delegateRelationship: 'spouse',
  consentRecordId: 1,
  status: 'active',
  registeredAt: '2026-06-01T10:00:00.000Z_0000_node1',
  registeredByTechId: 'tech-1',
  hlcTimestamp: '2026-06-01T10:00:00.000Z_0000_node1',
  syncStatus: 'pending',
}

// ---------------------------------------------------------------------------
// 9.4 — DelegateRegistration
// ---------------------------------------------------------------------------

describe('9.4 DelegateRegistration', () => {
  const defaultProps = {
    patientRef: 'Patient/test-abc',
    onRegistered: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state while fetching consent', () => {
    // Consent never resolves during this test
    mockGetConsentsByPatient.mockReturnValue(new Promise(() => {}))

    render(<DelegateRegistration {...defaultProps} />)

    expect(screen.getByText('loadingConsent')).toBeDefined()
  })

  it('renders form fields after consent loads', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
      expect(screen.getByLabelText('Relationship to Patient')).toBeDefined()
      expect(screen.getByLabelText('name')).toBeDefined()
    })
  })

  it('shows consent-linked banner when active consent exists', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      // The banner uses the `consentLinked` key with interpolated method and date
      expect(screen.getByText(/consentLinked/)).toBeDefined()
    })
  })

  it('shows consent-required warning when no active consent', async () => {
    mockGetConsentsByPatient.mockResolvedValue([])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('consentRequired')).toBeDefined()
    })
  })

  it('disables submit button when no active consent', async () => {
    mockGetConsentsByPatient.mockResolvedValue([])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('consentRequired')).toBeDefined()
    })

    const registerBtn = screen.getByText('register')
    expect(registerBtn.closest('button')).toHaveProperty('disabled', true)
  })

  it('shows phone validation error on submit with empty phone', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('register'))
    })

    await waitFor(() => {
      expect(screen.getByText('validation.phoneRequired')).toBeDefined()
    })
  })

  it('shows relationship validation error on submit without selecting relationship', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('phone'), {
      target: { value: '+93701234567' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('register'))
    })

    await waitFor(() => {
      expect(screen.getByText('validation.relationshipRequired')).toBeDefined()
    })
  })

  it('calls onRegistered after successful submission', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])
    mockAddFamilyDelegate.mockResolvedValue(99)

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('phone'), {
      target: { value: '+93701234567' },
    })

    fireEvent.change(screen.getByLabelText('Relationship to Patient'), {
      target: { value: 'spouse' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('register'))
    })

    await waitFor(() => {
      expect(defaultProps.onRegistered).toHaveBeenCalledWith(99)
    })
  })

  it('shows error message when addFamilyDelegate throws', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])
    mockAddFamilyDelegate.mockRejectedValue(new Error('IndexedDB quota'))

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('phone'), {
      target: { value: '+93701234567' },
    })

    fireEvent.change(screen.getByLabelText('Relationship to Patient'), {
      target: { value: 'parent' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('register'))
    })

    await waitFor(() => {
      expect(screen.getByText('registerError')).toBeDefined()
    })
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])

    render(<DelegateRegistration {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('cancel')).toBeDefined()
    })

    fireEvent.click(screen.getByText('cancel'))

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders correctly in RTL direction', async () => {
    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])

    const { container } = render(
      <div dir="rtl">
        <DelegateRegistration {...defaultProps} />
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
    })

    // Phone input must have dir="ltr" so the number reads LTR inside RTL layout
    const phoneInput = screen.getByLabelText('phone')
    expect(phoneInput.getAttribute('dir')).toBe('ltr')

    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// 9.5 — RevokeDelegateDialog
// ---------------------------------------------------------------------------

describe('9.5 RevokeDelegateDialog', () => {
  const defaultProps = {
    delegateId: 42,
    patientRef: 'Patient/test-abc',
    delegateRelationship: 'spouse',
    onRevoked: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog with reason textarea and action buttons', () => {
    render(<RevokeDelegateDialog {...defaultProps} />)

    expect(screen.getByTestId('dialog')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'revokeDelegate' })).toBeDefined()
    expect(screen.getByPlaceholderText('revokeReasonPlaceholder')).toBeDefined()
    expect(screen.getByText('revokeSubmit')).toBeDefined()
    expect(screen.getByText('cancel')).toBeDefined()
  })

  it('shows validation error when submitting with empty reason', async () => {
    render(<RevokeDelegateDialog {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('revokeSubmit'))
    })

    expect(screen.getByText('revokeReasonRequired')).toBeDefined()
    expect(mockRevokeDelegate).not.toHaveBeenCalled()
  })

  it('shows validation error when reason is only whitespace', async () => {
    render(<RevokeDelegateDialog {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('revokeReasonPlaceholder'), {
      target: { value: '   ' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('revokeSubmit'))
    })

    expect(screen.getByText('revokeReasonRequired')).toBeDefined()
    expect(mockRevokeDelegate).not.toHaveBeenCalled()
  })

  it('calls revokeDelegate with trimmed reason then calls onRevoked', async () => {
    mockRevokeDelegate.mockResolvedValue(undefined)

    render(<RevokeDelegateDialog {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('revokeReasonPlaceholder'), {
      target: { value: '  Patient request  ' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('revokeSubmit'))
    })

    await waitFor(() => {
      expect(mockRevokeDelegate).toHaveBeenCalledWith(42, 'Patient request')
      expect(defaultProps.onRevoked).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error message when revokeDelegate throws', async () => {
    mockRevokeDelegate.mockRejectedValue(new Error('DB error'))

    render(<RevokeDelegateDialog {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('revokeReasonPlaceholder'), {
      target: { value: 'Patient request' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('revokeSubmit'))
    })

    await waitFor(() => {
      expect(screen.getByText('revokeError')).toBeDefined()
    })

    // onRevoked must NOT be called on failure
    expect(defaultProps.onRevoked).not.toHaveBeenCalled()
  })

  it('clears validation error when user starts typing in reason', async () => {
    render(<RevokeDelegateDialog {...defaultProps} />)

    // Trigger the validation error
    await act(async () => {
      fireEvent.click(screen.getByText('revokeSubmit'))
    })

    expect(screen.getByText('revokeReasonRequired')).toBeDefined()

    // Start typing — error should clear
    fireEvent.change(screen.getByPlaceholderText('revokeReasonPlaceholder'), {
      target: { value: 'R' },
    })

    expect(screen.queryByText('revokeReasonRequired')).toBeNull()
  })

  it('calls onCancel when Cancel button is clicked', () => {
    render(<RevokeDelegateDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('cancel'))

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
    expect(mockRevokeDelegate).not.toHaveBeenCalled()
  })

  it('renders correctly in RTL direction', () => {
    const { container } = render(
      <div dir="rtl">
        <RevokeDelegateDialog {...defaultProps} />
      </div>,
    )

    expect(screen.getByTestId('dialog')).toBeDefined()
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// 9.4+ — DelegateManagementSection
// ---------------------------------------------------------------------------

describe('9.4+ DelegateManagementSection', () => {
  const defaultProps = {
    patientRef: 'Patient/test-abc',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no active delegates', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([])

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('noActiveDelegates')).toBeDefined()
    })
  })

  it('shows "Add Delegate" button when no active delegates', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([])

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('addDelegate')).toBeDefined()
    })
  })

  it('hides "Add Delegate" button when an active delegate already exists', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([ACTIVE_DELEGATE])

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.queryByText('addDelegate')).toBeNull()
    })
  })

  it('renders an active delegate row with relationship and revoke button', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([ACTIVE_DELEGATE])

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('relationship.spouse')).toBeDefined()
      expect(screen.getByText('activeLabel')).toBeDefined()
      expect(screen.getByText('revokeDelegate')).toBeDefined()
    })
  })

  it('does NOT render revoked delegates in the active list', async () => {
    const revoked: FamilyDelegate = {
      ...ACTIVE_DELEGATE,
      id: 10,
      status: 'revoked',
      revokedAt: '2026-06-10T00:00:00.000Z',
      revocationReason: 'Old',
    }
    mockGetDelegatesByPatient.mockResolvedValue([revoked])

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      // Revoked delegate should not appear; empty state should show
      expect(screen.getByText('noActiveDelegates')).toBeDefined()
    })

    // And "Add Delegate" should reappear since no active delegate
    expect(screen.getByText('addDelegate')).toBeDefined()
  })

  it('shows error state when getDelegatesByPatient throws', async () => {
    mockGetDelegatesByPatient.mockRejectedValue(new Error('IndexedDB unavailable'))

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('loadError')).toBeDefined()
    })
  })

  it('opens DelegateRegistration form when "Add Delegate" is clicked', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([])
    mockGetConsentsByPatient.mockReturnValue(new Promise(() => {})) // keep loading

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('addDelegate')).toBeDefined()
    })

    fireEvent.click(screen.getByText('addDelegate'))

    await waitFor(() => {
      expect(screen.getByText('loadingConsent')).toBeDefined()
    })
  })

  it('opens RevokeDelegateDialog when Revoke button is clicked', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([ACTIVE_DELEGATE])

    render(<DelegateManagementSection {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('revokeDelegate')).toBeDefined()
    })

    fireEvent.click(screen.getByText('revokeDelegate'))

    expect(screen.getByTestId('dialog')).toBeDefined()
  })

  it('reloads delegate list after successful registration', async () => {
    mockGetDelegatesByPatient
      .mockResolvedValueOnce([])                  // initial load: empty
      .mockResolvedValueOnce([ACTIVE_DELEGATE])   // reload after registration

    mockGetConsentsByPatient.mockResolvedValue([ACTIVE_CONSENT])
    mockAddFamilyDelegate.mockResolvedValue(42)

    render(<DelegateManagementSection {...defaultProps} />)

    // Wait for initial empty state
    await waitFor(() => {
      expect(screen.getByText('addDelegate')).toBeDefined()
    })

    fireEvent.click(screen.getByText('addDelegate'))

    // Fill in the form
    await waitFor(() => {
      expect(screen.getByLabelText('phone')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('phone'), {
      target: { value: '+93701234567' },
    })

    fireEvent.change(screen.getByLabelText('Relationship to Patient'), {
      target: { value: 'spouse' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText('register'))
    })

    // After registration, list should reload and show the delegate
    await waitFor(() => {
      expect(screen.getByText('relationship.spouse')).toBeDefined()
    })

    expect(mockGetDelegatesByPatient).toHaveBeenCalledTimes(2)
  })

  it('renders section correctly in RTL direction (snapshot)', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([ACTIVE_DELEGATE])

    const { container } = render(
      <div dir="rtl">
        <DelegateManagementSection {...defaultProps} />
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText('revokeDelegate')).toBeDefined()
    })

    expect(container).toMatchSnapshot()
  })

  it('renders section in LTR direction (snapshot)', async () => {
    mockGetDelegatesByPatient.mockResolvedValue([ACTIVE_DELEGATE])

    const { container } = render(
      <div dir="ltr">
        <DelegateManagementSection {...defaultProps} />
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText('revokeDelegate')).toBeDefined()
    })

    expect(container).toMatchSnapshot()
  })
})
