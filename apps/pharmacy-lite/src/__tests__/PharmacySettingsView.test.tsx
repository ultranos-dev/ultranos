import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// --- Session store mock (configurable per test) ---
let mockSession: Record<string, unknown> | null = {
  userId: 'u1',
  practitionerId: 'p1',
  role: 'PHARMACIST',
  sessionId: 's1',
  email: 'pharm@clinic.example',
  name: 'Dr. Nadia Karimi',
  loginAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  pharmacyName: 'Al-Shifa Pharmacy',
  licenseRef: 'PH-2026-0042',
}

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        session: mockSession,
        isAuthenticated: !!mockSession,
      }),
    {
      getState: () => ({
        session: mockSession,
        isAuthenticated: !!mockSession,
      }),
    },
  ),
}))

// --- Supabase MFA mock ---
const mockListFactors = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      mfa: {
        listFactors: mockListFactors,
      },
    },
  }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'

describe('PharmacySettingsView', () => {
  beforeEach(() => {
    mockSession = {
      userId: 'u1',
      practitionerId: 'p1',
      role: 'PHARMACIST',
      sessionId: 's1',
      email: 'pharm@clinic.example',
      name: 'Dr. Nadia Karimi',
      loginAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      pharmacyName: 'Al-Shifa Pharmacy',
      licenseRef: 'PH-2026-0042',
    }
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }] },
      error: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- 7.1: All four sections render ---
  it('renders all four settings sections', async () => {
    render(<PharmacySettingsView />)

    // Component uses t('profile'), t('pharmacyInfo'), t('sessionInfo'), t('mfaStatus')
    // Global i18n mock returns the key strings
    expect(screen.getByText('profile')).toBeDefined()
    expect(screen.getByText('pharmacyInfo')).toBeDefined()
    expect(screen.getByText('sessionInfo')).toBeDefined()
    expect(screen.getByText('mfaStatus')).toBeDefined()
  })

  // --- Task 2: Profile card ---
  it('displays pharmacist name, role, and email', () => {
    render(<PharmacySettingsView />)

    expect(screen.getByTestId('profile-name').textContent).toBe('Dr. Nadia Karimi')
    expect(screen.getByTestId('profile-role').textContent).toBe('Pharmacist')
    expect(screen.getByTestId('profile-email').textContent).toBe('pharm@clinic.example')
  })

  it('falls back to email prefix when name is not set', () => {
    mockSession = { ...mockSession!, name: undefined }
    render(<PharmacySettingsView />)

    expect(screen.getByTestId('profile-name').textContent).toBe('pharm')
  })

  it('displays role with styled badge', () => {
    render(<PharmacySettingsView />)

    const badge = screen.getByTestId('profile-role')
    expect(badge.textContent).toBe('Pharmacist')
    expect(badge.className).toContain('rounded-full')
  })

  // --- Task 3: Pharmacy info ---
  it('displays pharmacy name and license reference', () => {
    render(<PharmacySettingsView />)

    expect(screen.getByTestId('pharmacy-name').textContent).toBe('Al-Shifa Pharmacy')
    expect(screen.getByTestId('license-ref').textContent).toBe('PH-2026-0042')
  })

  it('shows "notConfigured" when pharmacy fields are missing', () => {
    mockSession = { ...mockSession!, pharmacyName: undefined, licenseRef: undefined }
    render(<PharmacySettingsView />)

    // Component uses t('notConfigured') — i18n mock returns the key string
    expect(screen.getByTestId('pharmacy-name').textContent).toBe('notConfigured')
    expect(screen.getByTestId('license-ref').textContent).toBe('notConfigured')
  })

  // --- Task 4: Session info / countdown ---
  it('displays login time from loginAt', () => {
    render(<PharmacySettingsView />)

    const loginTime = screen.getByTestId('login-time')
    // Should display a time string, not "Unknown"
    expect(loginTime.textContent).not.toBe('Unknown')
  })

  it('displays session expiry countdown', async () => {
    render(<PharmacySettingsView />)

    await waitFor(() => {
      const countdown = screen.getByTestId('session-countdown')
      expect(countdown).toBeDefined()
      // 12 hours max - ~2 hours elapsed = ~10 hours remaining (may be 9:59:xx due to sub-second timing)
      expect(countdown.textContent).toMatch(/^(10:0[0-9]:|9:59:)/)
    })
  })

  it('countdown timer updates periodically', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Login 11 hours 58 minutes ago — ~2 minutes left
    const now = Date.now()
    const loginAt = new Date(now - (11 * 60 + 58) * 60 * 1000).toISOString()
    mockSession = { ...mockSession!, loginAt }

    // Immediately resolved so fake timers don't stall
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }] },
      error: null,
    })

    render(<PharmacySettingsView />)

    // Wait for initial render of countdown
    await vi.waitFor(() => {
      expect(screen.getByTestId('session-countdown')).toBeDefined()
    })

    const before = screen.getByTestId('session-countdown').textContent

    // Advance 1 second to trigger interval update
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    const after = screen.getByTestId('session-countdown').textContent
    expect(after).not.toBe(before)

    vi.useRealTimers()
  })

  // --- Task 5: MFA status ---
  it('shows TOTP enabled badge when enrolled', async () => {
    const { container } = render(<PharmacySettingsView />)

    await waitFor(() => {
      const badge = container.querySelector('[data-testid="mfa-status"]')
      expect(badge).not.toBeNull()
      // Component uses t('totpEnabled') — i18n mock returns key string
      expect(badge!.textContent).toBe('totpEnabled')
      // Component uses bg-success/10 (semantic token, not bg-green-100)
      expect(badge!.className).toContain('bg-success')
    })
  })

  it('shows TOTP not configured badge when not enrolled', async () => {
    mockListFactors.mockResolvedValue({
      data: { totp: [] },
      error: null,
    })

    const { container } = render(<PharmacySettingsView />)

    await waitFor(() => {
      const badge = container.querySelector('[data-testid="mfa-status"]')
      expect(badge).not.toBeNull()
      // Component uses t('totpNotConfigured') — i18n mock returns key string
      expect(badge!.textContent).toBe('totpNotConfigured')
      // Component uses bg-warning/10 (semantic token, not bg-amber-100)
      expect(badge!.className).toContain('bg-warning')
    })
  })

  it('shows loading state while fetching MFA status', () => {
    // Never resolve the listFactors call
    mockListFactors.mockReturnValue(new Promise(() => {}))

    render(<PharmacySettingsView />)

    // Component uses t('loadingMfa') — i18n mock returns key string
    expect(screen.getByText('loadingMfa')).toBeDefined()
  })

  it('shows error message when MFA check fails', async () => {
    mockListFactors.mockRejectedValue(new Error('Network error'))

    render(<PharmacySettingsView />)

    await waitFor(() => {
      // Component uses t('mfaCheckError') — i18n mock returns key string
      expect(screen.getByTestId('mfa-error').textContent).toBe('mfaCheckError')
    })
  })

  it('shows error message when MFA returns error response', async () => {
    mockListFactors.mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized' },
    })

    render(<PharmacySettingsView />)

    await waitFor(() => {
      expect(screen.getByTestId('mfa-error').textContent).toBe('mfaCheckError')
    })
  })
})
