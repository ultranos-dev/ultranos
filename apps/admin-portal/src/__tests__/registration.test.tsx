import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
  }),
}))

// Mock tRPC
const mockRegisterOrganization = vi.fn()
const mockSelectInitialModules = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    registration: {
      registerOrganization: { mutate: (...args: unknown[]) => mockRegisterOrganization(...args) },
      selectInitialModules: { mutate: (...args: unknown[]) => mockSelectInitialModules(...args) },
    },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    () => ({}),
    {
      getState: () => ({
        setSession: vi.fn(),
        clearSession: vi.fn(),
        isAuthenticated: false,
      }),
    },
  ),
}))

const { default: RegisterPage } = await import('../app/register/page')

describe('Registration Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/register', search: '', href: '' },
      writable: true,
    })
  })

  it('renders step 1 (Organization Details) by default', () => {
    render(<RegisterPage />)

    expect(screen.getByText('Register Your Organization')).toBeTruthy()
    expect(screen.getByLabelText('Organization Name')).toBeTruthy()
    expect(screen.getByLabelText('Country')).toBeTruthy()
    expect(screen.getByLabelText('Billing Email')).toBeTruthy()
  })

  it('validates required fields on step 1 before advancing', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Organization name must be at least 2 characters')).toBeTruthy()
    expect(screen.getByText('Please select a country')).toBeTruthy()
  })

  it('advances to step 2 with valid org details', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByLabelText('Full Name')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('validates password requirements on step 2', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    // Fill step 1
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Try to advance step 2 with short password
    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Password must be at least 12 characters')).toBeTruthy()
  })

  it('validates password confirmation mismatch on step 2', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    // Fill step 1
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Mismatched passwords
    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'different123456')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Passwords do not match')).toBeTruthy()
  })

  it('advances to step 3 (Module Selection) with valid credentials', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    // Fill step 1
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Fill step 2
    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 3 visible
    expect(screen.getByText('OPD Lite')).toBeTruthy()
    expect(screen.getByText('Pharmacy Lite')).toBeTruthy()
    expect(screen.getByText('Lab Lite')).toBeTruthy()
  })

  it('requires at least one module to be selected', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    // Navigate to step 3
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Try to submit with no modules selected
    await user.click(screen.getByRole('button', { name: 'Complete Registration' }))

    expect(screen.getByText('Please select at least one module to continue')).toBeTruthy()
  })

  it('calls registerOrganization and selectInitialModules on successful submission', async () => {
    const user = userEvent.setup()
    mockRegisterOrganization.mockResolvedValue({
      success: true,
      orgId: 'org-123',
      slug: 'test-clinic',
      trialEndsAt: '2026-06-15T00:00:00.000Z',
    })
    mockSignInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSIsInJvbGUiOiJBRE1JTiIsInNlc3Npb25faWQiOiJzMSJ9.sig',
          user: { email: 'admin@test.com' },
        },
      },
      error: null,
    })
    mockSelectInitialModules.mockResolvedValue({ success: true, subscriptions: [] })

    render(<RegisterPage />)

    // Fill step 1
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Fill step 2
    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Select module and submit
    await user.click(screen.getByText('OPD Lite'))
    await user.click(screen.getByRole('button', { name: 'Complete Registration' }))

    await waitFor(() => {
      expect(mockRegisterOrganization).toHaveBeenCalledWith({
        orgName: 'Test Clinic',
        countryCode: 'IQ',
        billingEmail: 'billing@test.com',
        adminName: 'Dr. Test',
        adminEmail: 'admin@test.com',
        adminPassword: 'securepassword123',
      })
    })

    await waitFor(() => {
      expect(mockSelectInitialModules).toHaveBeenCalledWith({
        orgId: 'org-123',
        moduleCodes: ['OPD_LITE'],
      })
    })

    // Redirects to dashboard
    expect(window.location.href).toBe('/dashboard?welcome=true')
  })

  it('shows error when registration fails and does not redirect', async () => {
    const user = userEvent.setup()
    mockRegisterOrganization.mockRejectedValue(
      new Error('Registration failed — please try again or contact support'),
    )

    render(<RegisterPage />)

    // Navigate through steps quickly
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByText('OPD Lite'))
    await user.click(screen.getByRole('button', { name: 'Complete Registration' }))

    await screen.findByText('Registration failed — please try again or contact support')
    expect(window.location.href).not.toBe('/dashboard?welcome=true')
  })

  it('navigates back between steps using Back buttons', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />)

    // Step 1 → Step 2
    await user.type(screen.getByLabelText('Organization Name'), 'Test Clinic')
    await user.selectOptions(screen.getByLabelText('Country'), 'IQ')
    await user.type(screen.getByLabelText('Billing Email'), 'billing@test.com')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Back to step 1
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Organization Name')).toBeTruthy()

    // Step 1 → Step 2 → Step 3
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'securepassword123')
    await user.type(screen.getByLabelText('Confirm Password'), 'securepassword123')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Back to step 2
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Full Name')).toBeTruthy()
  })

  it('shows sign-in link for existing users', () => {
    render(<RegisterPage />)

    expect(screen.getByText('Already have an account?')).toBeTruthy()
    const link = screen.getByText('Sign in')
    expect(link.getAttribute('href')).toBe('/login')
  })
})
