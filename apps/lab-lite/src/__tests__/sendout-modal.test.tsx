/**
 * SendOutModal Component Tests — Story 54.4 / Tasks 14.5, 14.9
 *
 * Covers: form validation, lab selector population, referral preview (data minimization),
 * successful submission flow, and RTL layout snapshot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReferenceLab } from '../types/reference-lab'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetLabsForTest = vi.fn()
const mockInitiateSendOut = vi.fn()
const mockSession = { userId: 'user-001', labRole: 'LAB_TECH' }

vi.mock('../lib/reference-lab-config', () => ({
  getLabsForTest: mockGetLabsForTest,
}))

vi.mock('../lib/sendout-service', () => ({
  initiateSendOut: mockInitiateSendOut,
}))

vi.mock('@/lib/reference-lab-config', () => ({
  getLabsForTest: mockGetLabsForTest,
}))

vi.mock('@/lib/sendout-service', () => ({
  initiateSendOut: mockInitiateSendOut,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession }) => unknown) =>
    selector({ session: mockSession }),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  X: ({ size }: { size: number }) => <span data-testid="close-icon" data-size={size} />,
  Send: ({ size }: { size: number }) => <span data-testid="send-icon" data-size={size} />,
  ExternalLink: ({ size }: { size: number }) => <span data-testid="ext-link-icon" data-size={size} />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLab(overrides: Partial<ReferenceLab> = {}): ReferenceLab {
  const now = new Date().toISOString()
  return {
    id: 'lab-001',
    name: 'Kabul Reference Lab',
    accreditationNumber: 'AFG-LAB-001',
    address: 'Kabul',
    supportedTests: ['2085-9'],
    averageTATDays: { '2085-9': 5 },
    isActive: true,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

const defaultProps = {
  sampleId: 'sample-001',
  loincCode: '2085-9',
  loincDisplay: 'Cholesterol',
  sampleType: 'Blood',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

async function renderModal(props = {}) {
  const { SendOutModal } = await import('../components/sendout/SendOutModal')
  return render(<SendOutModal {...defaultProps} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  defaultProps.onClose = vi.fn()
  defaultProps.onSuccess = vi.fn()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SendOutModal', () => {
  it('renders modal title and test info', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    await renderModal()

    await waitFor(() => {
      expect(screen.getByText('Send to Reference Lab')).toBeInTheDocument()
    })
    expect(screen.getByText('Cholesterol')).toBeInTheDocument()
    expect(screen.getByText(/2085-9/)).toBeInTheDocument()
  })

  it('shows message when no labs are configured for the test', async () => {
    mockGetLabsForTest.mockResolvedValue([])
    await renderModal()

    await waitFor(() => {
      expect(screen.getByText(/No reference labs configured/)).toBeInTheDocument()
    })
  })

  it('renders lab selector when labs are available', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    await renderModal()

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
    expect(screen.getByText(/Kabul Reference Lab/)).toBeInTheDocument()
  })

  it('shows referral form preview after lab selection — only first name + age label', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    await renderModal()

    const select = await waitFor(() => screen.getByRole('combobox'))
    fireEvent.change(select, { target: { value: 'lab-001' } })

    const previewBtn = screen.getByText(/Preview referral form/)
    fireEvent.click(previewBtn)

    await waitFor(() => {
      expect(screen.getByText(/first name \+ age only/i)).toBeInTheDocument()
    })
    // Referral preview should not expose actual patient data
    expect(screen.queryByText(/patient-001/)).not.toBeInTheDocument()
  })

  it('disables submit button when no lab selected', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    await renderModal()

    await waitFor(() => screen.getByRole('combobox'))

    const submitBtn = screen.getByRole('button', { name: /Confirm Send-Out/ })
    expect(submitBtn).toBeDisabled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    const onClose = vi.fn()
    await renderModal({ onClose })

    await waitFor(() => screen.getByRole('combobox'))

    const cancelBtn = screen.getByRole('button', { name: /Cancel/ })
    fireEvent.click(cancelBtn)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onSuccess with send-out id on successful submission', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    mockInitiateSendOut.mockResolvedValue({ id: 'so-new-001' })
    const onSuccess = vi.fn()
    await renderModal({ onSuccess })

    const select = await waitFor(() => screen.getByRole('combobox'))
    fireEvent.change(select, { target: { value: 'lab-001' } })

    const submitBtn = screen.getByRole('button', { name: /Confirm Send-Out/ })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('so-new-001')
    })
  })

  it('shows error message on submission failure', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    mockInitiateSendOut.mockRejectedValue(new Error('network error'))
    await renderModal()

    const select = await waitFor(() => screen.getByRole('combobox'))
    fireEvent.change(select, { target: { value: 'lab-001' } })

    const submitBtn = screen.getByRole('button', { name: /Confirm Send-Out/ })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

describe('SendOutModal — RTL layout (Task 14.9)', () => {
  it('renders correctly in RTL layout', async () => {
    mockGetLabsForTest.mockResolvedValue([makeLab()])
    const { container } = await renderModal()

    await waitFor(() => screen.getByText('Cholesterol'))

    // Wrap in RTL direction for snapshot
    container.setAttribute('dir', 'rtl')
    expect(container).toMatchSnapshot()
  })
})
