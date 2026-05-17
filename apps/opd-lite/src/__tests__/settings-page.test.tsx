import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock supabase
const mockListFactors = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token:
              'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoiQ0xJTklDSUFOIiwibmFtZSI6IkRyIEFobWVkIn0.fake',
            user: {
              email: 'ahmed@hospital.com',
              user_metadata: { full_name: 'Dr Ahmed' },
            },
          },
        },
      }),
      signOut: vi.fn(),
      mfa: {
        listFactors: mockListFactors,
      },
    },
  }),
}))

// Mock notification API
vi.mock('@/lib/notification-api', () => ({
  fetchNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
  fetchUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
}))

// Mock audit
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    PHI_CLEANUP: 'PHI_CLEANUP',
    PHI_READ: 'PHI_READ',
    DELETE_REQUEST: 'DELETE_REQUEST',
  },
  AuditResourceType: {
    ENCOUNTER: 'ENCOUNTER',
    PATIENT: 'PATIENT',
    SYSTEM: 'SYSTEM',
    LAB_RESULT: 'LAB_RESULT',
  },
}))

// Mock sync-engine
vi.mock('@ultranos/sync-engine', () => ({
  HybridLogicalClock: vi.fn().mockImplementation(() => ({
    now: () => ({ wallTime: Date.now(), counter: 0, nodeId: 'test' }),
  })),
  serializeHlc: () => new Date().toISOString(),
  enqueueSyncAction: vi.fn(),
}))

// Mock Dexie DB
vi.mock('@/lib/db', () => ({
  db: {
    encounters: { orderBy: vi.fn().mockReturnValue({ filter: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }) },
    syncQueue: { filter: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }) },
    patients: { get: vi.fn() },
    observations: { toArray: vi.fn().mockResolvedValue([]) },
    diagnosticReports: { get: vi.fn() },
  },
}))

// Mock sync-queue
vi.mock('@/lib/sync-queue', () => ({
  syncQueue: {},
}))

// Mock encryption/signing stores
vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { wipe: vi.fn(), isReady: () => true },
}))
vi.mock('@/lib/signing-key-store', () => ({
  clearSigningKeys: vi.fn(),
}))
vi.mock('@/lib/phi-cleanup', () => ({
  clearPhiTables: vi.fn().mockResolvedValue(undefined),
}))

// Mock stores that SessionTimeoutWrapper imports
vi.mock('@/stores/encounter-store', () => ({
  useEncounterStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ clearPhiState: vi.fn() }),
  }),
}))
vi.mock('@/stores/vitals-store', () => ({
  useVitalsStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ clearPhiState: vi.fn() }),
  }),
}))
vi.mock('@/stores/diagnosis-store', () => ({
  useDiagnosisStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ clearPhiState: vi.fn() }),
  }),
}))
vi.mock('@/stores/soap-note-store', () => ({
  useSoapNoteStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ clearPhiState: vi.fn() }),
  }),
}))
vi.mock('@/stores/prescription-store', () => ({
  usePrescriptionStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ clearPhiState: vi.fn() }),
  }),
}))
vi.mock('@/stores/allergy-store', () => ({
  useAllergyStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ clearPhiState: vi.fn() }),
  }),
}))

// Mock ui-kit SessionManagerProvider
vi.mock('@ultranos/ui-kit', () => ({
  SessionManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SESSION_DURATIONS: { CLINICIAN: 900_000 },
  INACTIVITY_TIMEOUT: 1_800_000,
}))

import { useAuthSessionStore } from '@/stores/auth-session-store'

function setupAuthSession(overrides?: Partial<Parameters<typeof useAuthSessionStore.getState>['0'] extends never ? never : {
  name: string
  role: string
  email: string
}>) {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'prac-001',
    role: overrides?.role ?? 'CLINICIAN',
    sessionId: 'sess-abc',
    email: overrides?.email ?? 'ahmed@hospital.com',
    name: overrides?.name ?? 'Dr Ahmed',
    token: 'mock-jwt-token',
  })
}

// ─── Task 2: ProfileCard ─────────────────────────────────────────────

describe('ProfileCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuthSession()
  })

  it('renders practitioner name', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    render(<ProfileCard />)
    expect(screen.getByText('Dr Ahmed')).toBeDefined()
  })

  it('renders practitioner role', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    render(<ProfileCard />)
    expect(screen.getByText('Clinician')).toBeDefined()
  })

  it('renders practitioner ID', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    render(<ProfileCard />)
    expect(screen.getByText('prac-001')).toBeDefined()
  })

  it('renders practitioner email', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    render(<ProfileCard />)
    expect(screen.getByText('ahmed@hospital.com')).toBeDefined()
  })

  it('renders initials-based avatar', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    render(<ProfileCard />)
    // "Dr Ahmed" → initials "DA"
    expect(screen.getByText('DA')).toBeDefined()
  })

  it('is read-only — no edit buttons', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    const { container } = render(<ProfileCard />)
    const editButtons = container.querySelectorAll('button')
    // No edit or save buttons
    expect(editButtons.length).toBe(0)
  })
})

// ─── Task 3: SessionInfoCard ─────────────────────────────────────────

describe('SessionInfoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setupAuthSession()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows session expiry countdown', async () => {
    // Set JWT exp to 10 minutes from now
    const nowSec = Math.floor(Date.now() / 1000)
    useAuthSessionStore.getState().setSession({
      userId: 'user-1',
      practitionerId: 'prac-001',
      role: 'CLINICIAN',
      sessionId: 'sess-abc',
      email: 'ahmed@hospital.com',
      name: 'Dr Ahmed',
      token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp: nowSec + 600, iat: nowSec - 300 })).replace(/=/g, '')}.fake`,
    })

    const { SessionInfoCard } = await import('@/components/settings/SessionInfoCard')
    render(<SessionInfoCard />)
    expect(screen.getByText(/Session Expiry/i)).toBeDefined()
    // Should show a countdown value
    expect(screen.getByTestId('session-countdown')).toBeDefined()
  })

  it('shows green color when >5 min remaining', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    useAuthSessionStore.getState().setSession({
      userId: 'user-1',
      practitionerId: 'prac-001',
      role: 'CLINICIAN',
      sessionId: 'sess-abc',
      email: 'ahmed@hospital.com',
      name: 'Dr Ahmed',
      token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp: nowSec + 600, iat: nowSec - 300 })).replace(/=/g, '')}.fake`,
    })

    const { SessionInfoCard } = await import('@/components/settings/SessionInfoCard')
    const { container } = render(<SessionInfoCard />)
    const countdown = container.querySelector('[data-testid="session-countdown"]')
    expect(countdown?.className).toContain('green')
  })

  it('shows yellow color when 2-5 min remaining', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    useAuthSessionStore.getState().setSession({
      userId: 'user-1',
      practitionerId: 'prac-001',
      role: 'CLINICIAN',
      sessionId: 'sess-abc',
      email: 'ahmed@hospital.com',
      name: 'Dr Ahmed',
      token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp: nowSec + 180, iat: nowSec - 720 })).replace(/=/g, '')}.fake`,
    })

    const { SessionInfoCard } = await import('@/components/settings/SessionInfoCard')
    const { container } = render(<SessionInfoCard />)
    const countdown = container.querySelector('[data-testid="session-countdown"]')
    expect(countdown?.className).toContain('yellow')
  })

  it('shows red color when <2 min remaining', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    useAuthSessionStore.getState().setSession({
      userId: 'user-1',
      practitionerId: 'prac-001',
      role: 'CLINICIAN',
      sessionId: 'sess-abc',
      email: 'ahmed@hospital.com',
      name: 'Dr Ahmed',
      token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp: nowSec + 60, iat: nowSec - 840 })).replace(/=/g, '')}.fake`,
    })

    const { SessionInfoCard } = await import('@/components/settings/SessionInfoCard')
    const { container } = render(<SessionInfoCard />)
    const countdown = container.querySelector('[data-testid="session-countdown"]')
    expect(countdown?.className).toContain('red')
  })
})

// ─── Task 4: MfaManagementCard ───────────────────────────────────────

describe('MfaManagementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuthSession()
  })

  it('shows "Enrolled" badge when TOTP is enrolled', async () => {
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', factorType: 'totp', status: 'verified' }], phone: [] },
      error: null,
    })

    const { MfaManagementCard } = await import('@/components/settings/MfaManagementCard')
    render(<MfaManagementCard />)

    await vi.waitFor(() => {
      expect(screen.getByText('Enrolled')).toBeDefined()
    })
  })

  it('shows "Not Enrolled" badge when TOTP is not enrolled', async () => {
    mockListFactors.mockResolvedValue({
      data: { totp: [], phone: [] },
      error: null,
    })

    const { MfaManagementCard } = await import('@/components/settings/MfaManagementCard')
    render(<MfaManagementCard />)

    await vi.waitFor(() => {
      expect(screen.getByText('Not Enrolled')).toBeDefined()
    })
  })

  it('shows Reconfigure TOTP button when enrolled', async () => {
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', factorType: 'totp', status: 'verified' }], phone: [] },
      error: null,
    })

    const { MfaManagementCard } = await import('@/components/settings/MfaManagementCard')
    render(<MfaManagementCard />)

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /reconfigure totp/i })).toBeDefined()
    })
  })

  it('shows Enroll TOTP button when not enrolled', async () => {
    mockListFactors.mockResolvedValue({
      data: { totp: [], phone: [] },
      error: null,
    })

    const { MfaManagementCard } = await import('@/components/settings/MfaManagementCard')
    render(<MfaManagementCard />)

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /enroll totp/i })).toBeDefined()
    })
  })

  it('shows offline warning when not connected', async () => {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })

    const { MfaManagementCard } = await import('@/components/settings/MfaManagementCard')
    render(<MfaManagementCard />)

    expect(screen.getByText(/offline/i)).toBeDefined()

    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true, configurable: true })
  })
})

// ─── Task 5: PreferencesCard ─────────────────────────────────────────

describe('PreferencesCard', () => {
  it('shows notification preferences as disabled toggles', async () => {
    const { PreferencesCard } = await import('@/components/settings/PreferencesCard')
    const { container } = render(<PreferencesCard />)
    const toggles = container.querySelectorAll('input[type="checkbox"]')
    expect(toggles.length).toBeGreaterThanOrEqual(3)
    toggles.forEach((toggle) => {
      expect((toggle as HTMLInputElement).disabled).toBe(true)
    })
  })

  it('shows "Coming soon" label', async () => {
    const { PreferencesCard } = await import('@/components/settings/PreferencesCard')
    render(<PreferencesCard />)
    expect(screen.getByText(/coming soon/i)).toBeDefined()
  })

  it('shows Lab result alerts, Sync conflict alerts, System notifications', async () => {
    const { PreferencesCard } = await import('@/components/settings/PreferencesCard')
    render(<PreferencesCard />)
    expect(screen.getByText('Lab result alerts')).toBeDefined()
    expect(screen.getByText('Sync conflict alerts')).toBeDefined()
    expect(screen.getByText('System notifications')).toBeDefined()
  })
})

// ─── Task 6: UserDropdown ────────────────────────────────────────────

describe('UserDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuthSession()
  })

  it('renders user initials button', async () => {
    const { UserDropdown } = await import('@/components/UserDropdown')
    render(<UserDropdown />)
    expect(screen.getByTestId('user-dropdown-trigger')).toBeDefined()
    expect(screen.getByText('DA')).toBeDefined() // "Dr Ahmed" → DA
  })

  it('shows dropdown menu on click with Settings and Logout', async () => {
    const user = userEvent.setup()
    const { UserDropdown } = await import('@/components/UserDropdown')
    render(<UserDropdown />)

    await user.click(screen.getByTestId('user-dropdown-trigger'))

    expect(screen.getByTestId('user-dropdown-menu')).toBeDefined()
    expect(screen.getByTestId('settings-link')).toBeDefined()
    expect(screen.getByText('Settings')).toBeDefined()
    expect(screen.getByTestId('logout-btn')).toBeDefined()
    expect(screen.getByText('Logout')).toBeDefined()
  })

  it('Settings link points to /settings', async () => {
    const user = userEvent.setup()
    const { UserDropdown } = await import('@/components/UserDropdown')
    render(<UserDropdown />)

    await user.click(screen.getByTestId('user-dropdown-trigger'))

    const settingsLink = screen.getByTestId('settings-link')
    expect(settingsLink.getAttribute('href')).toBe('/settings')
  })
})

// ─── Task 7 AC #7: No PHI on settings page ──────────────────────────

describe('Settings page — no PHI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuthSession()
    mockListFactors.mockResolvedValue({
      data: { totp: [], phone: [] },
      error: null,
    })
  })

  it('does not display clinical data (no PHI)', async () => {
    const { ProfileCard } = await import('@/components/settings/ProfileCard')
    const { SessionInfoCard } = await import('@/components/settings/SessionInfoCard')
    const { PreferencesCard } = await import('@/components/settings/PreferencesCard')

    const { container } = render(
      <>
        <ProfileCard />
        <SessionInfoCard />
        <PreferencesCard />
      </>
    )

    const text = container.textContent ?? ''
    // Should NOT contain any clinical data terms
    expect(text).not.toContain('Patient')
    expect(text).not.toContain('Diagnosis')
    expect(text).not.toContain('Prescription')
    expect(text).not.toContain('Allergy')
    expect(text).not.toContain('SOAP')
    expect(text).not.toContain('Encounter')
    expect(text).not.toContain('Medication')
  })
})
