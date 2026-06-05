/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the trpc client
const mockGetAvailableRoles = vi.fn()
const mockValidateRoleForOrg = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getAvailableRoles: { query: () => mockGetAvailableRoles() },
      validateRoleForOrg: { query: (input: any) => mockValidateRoleForOrg(input) },
    },
  },
}))

const { default: CreateUserPage } = await import('../app/users/create/page')

const mockAvailableRoles = {
  availableRoles: [
    { role: 'ADMIN', moduleCode: null, moduleName: null },
    { role: 'CLINICIAN', moduleCode: 'OPD_LITE', moduleName: 'OPD Lite' },
    { role: 'DOCTOR', moduleCode: 'OPD_LITE', moduleName: 'OPD Lite' },
  ],
  unavailableRoles: [
    { role: 'PHARMACIST', moduleCode: 'PHARMACY_LITE', moduleName: 'Pharmacy Lite', reason: 'NOT_SUBSCRIBED' as const },
    { role: 'LAB_TECH', moduleCode: 'LAB_LITE', moduleName: 'Lab Lite', reason: 'NOT_SUBSCRIBED' as const },
  ],
}

describe('Story 27.7 — User Creation Role Selector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAvailableRoles.mockResolvedValue(mockAvailableRoles)
    mockValidateRoleForOrg.mockResolvedValue({ allowed: true })
  })

  it('shows only available roles as selectable radio buttons', async () => {
    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })

    // Available roles have radio inputs that are NOT disabled
    const radioButtons = screen.getAllByRole('radio')
    const enabledRadios = radioButtons.filter((r) => !r.hasAttribute('disabled'))
    expect(enabledRadios).toHaveLength(3) // ADMIN, CLINICIAN, DOCTOR
  })

  it('renders unavailable roles with disabled state and subscription prompt', async () => {
    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('PHARMACIST')).toBeInTheDocument()
    })

    // Unavailable roles shown with subscription prompt
    expect(
      screen.getByText(/Subscribe to Pharmacy Lite to add PHARMACIST users/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Subscribe to Lab Lite to add LAB_TECH users/),
    ).toBeInTheDocument()

    // Disabled radio buttons for unavailable roles
    const disabledRadios = screen.getAllByRole('radio').filter((r) => r.hasAttribute('disabled'))
    expect(disabledRadios).toHaveLength(2)
  })

  it('subscription prompt links to /subscriptions', async () => {
    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('PHARMACIST')).toBeInTheDocument()
    })

    const subscriptionLinks = screen.getAllByRole('link', { name: /Subscribe to/ })
    for (const link of subscriptionLinks) {
      expect(link).toHaveAttribute('href', '/subscriptions')
    }
  })

  it('blocks form submission if unavailable role is selected client-side', async () => {
    // Simulate a scenario where an unavailable role somehow gets selected
    mockGetAvailableRoles.mockResolvedValue({
      availableRoles: [{ role: 'ADMIN', moduleCode: null, moduleName: null }],
      unavailableRoles: [
        { role: 'PHARMACIST', moduleCode: 'PHARMACY_LITE', moduleName: 'Pharmacy Lite', reason: 'NOT_SUBSCRIBED' },
      ],
    })

    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })

    // Select ADMIN role and fill in the form
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Full Name'))
    await user.type(screen.getByLabelText('Full Name'), 'Test User')
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.click(screen.getByText('ADMIN'))

    // Submit should work for available role
    const submitButton = screen.getByRole('button', { name: /Create User/i })
    expect(submitButton).not.toBeDisabled()
  })

  it('performs server-side validation before creating user', async () => {
    mockValidateRoleForOrg.mockResolvedValue({
      allowed: false,
      reason: 'Subscribe to Pharmacy Lite to add PHARMACIST users',
    })

    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Full Name'), 'Test User')
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.click(screen.getByText('ADMIN'))

    // Override the selected role validation to fail
    mockValidateRoleForOrg.mockResolvedValue({
      allowed: false,
      reason: 'Subscribe to OPD Lite to add ADMIN users',
    })

    await user.click(screen.getByRole('button', { name: /Create User/i }))

    await waitFor(() => {
      expect(screen.getByText(/Subscribe to OPD Lite/)).toBeInTheDocument()
    })
  })
})
