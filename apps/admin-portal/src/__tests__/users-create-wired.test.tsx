/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the trpc client
const mockGetAvailableRoles = vi.fn()
const mockValidateRoleForOrg = vi.fn()
const mockCreateUser = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getAvailableRoles: { query: () => mockGetAvailableRoles() },
      validateRoleForOrg: { query: (input: any) => mockValidateRoleForOrg(input) },
    },
    admin: {
      createUser: { mutate: (input: any) => mockCreateUser(input) },
    },
  },
}))

const { default: CreateUserPage } = await import('../app/[locale]/users/create/page')

const mockAvailableRoles = {
  availableRoles: [
    { role: 'ADMIN', moduleCode: null, moduleName: null },
    { role: 'CLINICIAN', moduleCode: 'OPD_LITE', moduleName: 'OPD Lite' },
  ],
  unavailableRoles: [
    { role: 'PHARMACIST', moduleCode: 'PHARMACY_LITE', moduleName: 'Pharmacy Lite', reason: 'NOT_SUBSCRIBED' as const },
  ],
}

describe('Task 7 — User Creation Submit Handler Wired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAvailableRoles.mockResolvedValue(mockAvailableRoles)
    mockValidateRoleForOrg.mockResolvedValue({ allowed: true })
  })

  it('calls createUser with correct args and shows success with setup link', async () => {
    mockCreateUser.mockResolvedValue({
      userId: 'user-123',
      name: 'Fatima Al-Rashid',
      givenName: 'Fatima',
      familyName: 'Al-Rashid',
      email: 'fatima@clinic.org',
      role: 'CLINICIAN',
      status: 'PENDING_INVITE',
      setupLink: 'https://admin.ultranos.com/setup?token=abc123',
      emailSent: false,
    })

    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Given Name'), 'Fatima')
    await user.type(screen.getByLabelText('Family Name / Last Name'), 'Al-Rashid')
    await user.type(screen.getByLabelText('Email'), 'fatima@clinic.org')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123!')
    await user.click(screen.getByText('CLINICIAN'))

    await user.click(screen.getByRole('button', { name: /Create User/i }))

    await waitFor(() => {
      expect(screen.getByText('User created successfully')).toBeInTheDocument()
    })

    // Verify createUser was called with correct args (split-name API)
    expect(mockCreateUser).toHaveBeenCalledWith({
      givenName: 'Fatima',
      familyName: 'Al-Rashid',
      email: 'fatima@clinic.org',
      role: 'CLINICIAN',
      password: expect.any(String),
    })

    // Verify user details shown in confirmation
    expect(screen.getByText(/Fatima Al-Rashid/)).toBeInTheDocument()
    expect(screen.getByText('fatima@clinic.org')).toBeInTheDocument()
    // Role appears in both the radio list and the success summary — confirm at least one is present
    expect(screen.getAllByText('CLINICIAN').length).toBeGreaterThanOrEqual(1)

    // Setup link shown since emailSent is false
    expect(screen.getByText(/Email delivery is not configured/)).toBeInTheDocument()
    expect(screen.getByText('https://admin.ultranos.com/setup?token=abc123')).toBeInTheDocument()
  })

  it('shows invitation email message when emailSent is true', async () => {
    mockCreateUser.mockResolvedValue({
      userId: 'user-456',
      name: 'Ali Hassan',
      givenName: 'Ali',
      familyName: 'Hassan',
      email: 'ali@clinic.org',
      role: 'ADMIN',
      status: 'PENDING_INVITE',
      setupLink: null,
      emailSent: true,
    })

    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Given Name'), 'Ali')
    await user.type(screen.getByLabelText('Family Name / Last Name'), 'Hassan')
    await user.type(screen.getByLabelText('Email'), 'ali@clinic.org')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123!')
    await user.click(screen.getByText('ADMIN'))

    await user.click(screen.getByRole('button', { name: /Create User/i }))

    await waitFor(() => {
      expect(screen.getByText('User created successfully')).toBeInTheDocument()
    })

    expect(screen.getByText(/An invitation email has been sent to ali@clinic.org/)).toBeInTheDocument()
    expect(screen.queryByText(/Email delivery is not configured/)).not.toBeInTheDocument()
  })

  it('shows "Create Another User" and "View All Users" CTAs on success', async () => {
    mockCreateUser.mockResolvedValue({
      userId: 'user-789',
      name: 'Amira Nurse',
      givenName: 'Amira',
      familyName: 'Nurse',
      email: 'amira@clinic.org',
      role: 'CLINICIAN',
      status: 'PENDING_INVITE',
      setupLink: 'https://admin.ultranos.com/setup?token=xyz',
      emailSent: false,
    })

    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('CLINICIAN')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Given Name'), 'Amira')
    await user.type(screen.getByLabelText('Family Name / Last Name'), 'Nurse')
    await user.type(screen.getByLabelText('Email'), 'amira@clinic.org')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123!')
    await user.click(screen.getByText('CLINICIAN'))
    await user.click(screen.getByRole('button', { name: /Create User/i }))

    await waitFor(() => {
      expect(screen.getByText('User created successfully')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Create Another User' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View All Users' })).toHaveAttribute('href', '/users')
  })

  it('resets form state when "Create Another User" is clicked', async () => {
    mockCreateUser.mockResolvedValue({
      userId: 'user-001',
      name: 'Test User',
      givenName: 'Test',
      familyName: 'User',
      email: 'test@clinic.org',
      role: 'ADMIN',
      status: 'PENDING_INVITE',
      setupLink: null,
      emailSent: true,
    })

    render(<CreateUserPage />)

    await waitFor(() => {
      expect(screen.getByText('ADMIN')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Given Name'), 'Test')
    await user.type(screen.getByLabelText('Family Name / Last Name'), 'User')
    await user.type(screen.getByLabelText('Email'), 'test@clinic.org')
    await user.type(screen.getByLabelText('Password'), 'Password123!')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123!')
    await user.click(screen.getByText('ADMIN'))
    await user.click(screen.getByRole('button', { name: /Create User/i }))

    await waitFor(() => {
      expect(screen.getByText('User created successfully')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Create Another User' }))

    // Form should be visible again with empty fields
    expect(screen.getByLabelText('Given Name')).toHaveValue('')
    expect(screen.getByLabelText('Family Name / Last Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument()
    expect(screen.queryByText('User created successfully')).not.toBeInTheDocument()
  })
})
