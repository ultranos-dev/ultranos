/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/labs/create',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

const mockCreateLab = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      createLab: { mutate: (...args: any[]) => mockCreateLab(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { default: CreateLabPage } = await import('../app/[locale]/labs/create/page')

describe('Create Lab Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form with all fields and buttons', () => {
    render(<CreateLabPage />)
    expect(screen.getByLabelText('Lab Name')).toBeTruthy()
    expect(screen.getByLabelText('License Reference')).toBeTruthy()
    expect(screen.getByLabelText('Accreditation Reference')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create New Lab' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('Create Lab button is disabled when required fields are empty', () => {
    render(<CreateLabPage />)
    expect(screen.getByRole('button', { name: 'Create New Lab' })).toBeDisabled()
  })

  it('Create Lab button enables when both required fields are filled', async () => {
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')

    expect(screen.getByRole('button', { name: 'Create New Lab' })).not.toBeDisabled()
  })

  it('submits with all fields and redirects to /labs', async () => {
    mockCreateLab.mockResolvedValue({ id: 'lab-new-uuid' })
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')
    await user.type(screen.getByLabelText('Accreditation Reference'), 'ACCR-001')
    await user.click(screen.getByRole('button', { name: 'Create New Lab' }))

    await waitFor(() => {
      expect(mockCreateLab).toHaveBeenCalledWith({
        labName: 'Central Lab',
        licenseRef: 'LIC-2026-001',
        accreditationRef: 'ACCR-001',
      })
    })
    expect(mockPush).toHaveBeenCalledWith('/labs')
  })

  it('omits accreditationRef when left blank', async () => {
    mockCreateLab.mockResolvedValue({ id: 'lab-new-uuid' })
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')
    await user.click(screen.getByRole('button', { name: 'Create New Lab' }))

    await waitFor(() => {
      expect(mockCreateLab).toHaveBeenCalledWith({
        labName: 'Central Lab',
        licenseRef: 'LIC-2026-001',
      })
    })
    expect(mockPush).toHaveBeenCalledWith('/labs')
  })

  it('shows error message on failure, does not redirect', async () => {
    mockCreateLab.mockRejectedValue(new Error('Failed to create lab'))
    const user = userEvent.setup()
    render(<CreateLabPage />)

    await user.type(screen.getByLabelText('Lab Name'), 'Central Lab')
    await user.type(screen.getByLabelText('License Reference'), 'LIC-2026-001')
    await user.click(screen.getByRole('button', { name: 'Create New Lab' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to create lab')).toBeTruthy()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('Cancel button navigates to /labs', async () => {
    const user = userEvent.setup()
    render(<CreateLabPage />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockPush).toHaveBeenCalledWith('/labs')
  })
})
