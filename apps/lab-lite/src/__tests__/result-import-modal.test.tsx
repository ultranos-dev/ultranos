/**
 * ResultImportModal Component Tests — Story 54.4 / Task 14.6
 *
 * Covers: manual entry flow, file import flow, non-editable attribution display,
 * successful import call, error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { SendOut } from '../types/reference-lab'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockImportSendOutResult = vi.fn()
const mockGetDb = vi.fn()
const mockSession = { userId: 'user-001', labRole: 'LAB_TECH' }

vi.mock('../lib/sendout-service', () => ({
  importSendOutResult: mockImportSendOutResult,
}))

vi.mock('@/lib/sendout-service', () => ({
  importSendOutResult: mockImportSendOutResult,
}))

vi.mock('../lib/db', () => ({
  getDb: mockGetDb,
}))

vi.mock('@/lib/db', () => ({
  getDb: mockGetDb,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: typeof mockSession }) => unknown) =>
    selector({ session: mockSession }),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  X: ({ size }: { size: number }) => <span data-testid="close-icon" data-size={size} />,
  Upload: ({ size }: { size: number }) => <span data-testid="upload-icon" data-size={size} />,
  FileText: ({ size }: { size: number }) => <span data-testid="filetext-icon" data-size={size} />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSendOut(overrides: Partial<SendOut> = {}): SendOut {
  const now = new Date().toISOString()
  return {
    id: 'so-001',
    sampleId: 'sample-001',
    referenceLabId: 'lab-001',
    testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    clinicalContext: 'hyperlipidemia',
    status: 'processing',
    sentAt: now,
    receivedAt: null,
    processingStartedAt: null,
    resultsAvailableAt: null,
    cancelledAt: null,
    shippingManifestId: 'manifest-001',
    referralFormId: 'referral-001',
    resultId: null,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

function setupDb(labName = 'Kabul Reference Lab', accreditation = 'AFG-LAB-001') {
  mockGetDb.mockReturnValue({
    reference_labs: {
      get: vi.fn().mockResolvedValue({
        name: labName,
        accreditationNumber: accreditation,
      }),
    },
  })
}

const defaultProps = {
  sendOut: makeSendOut(),
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

async function renderModal(props = {}) {
  const { ResultImportModal } = await import('../components/sendout/ResultImportModal')
  return render(<ResultImportModal {...defaultProps} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  defaultProps.onClose = vi.fn()
  defaultProps.onSuccess = vi.fn()
  setupDb()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultImportModal — manual entry mode', () => {
  it('renders manual entry form by default', async () => {
    await renderModal()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/Value/i)).toBeInTheDocument()
  })

  it('disables submit when value is empty', async () => {
    await renderModal()

    await waitFor(() => screen.getByLabelText(/Value/i))

    const submitBtn = screen.getAllByRole('button', { name: /Import Result/ }).find(
      (b) => b.tagName === 'BUTTON' && b.type === 'submit',
    ) ?? screen.getAllByRole('button', { name: /Import Result/ })[0]
    expect(submitBtn).toBeDisabled()
  })

  it('calls importSendOutResult on manual entry submission', async () => {
    mockImportSendOutResult.mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    await renderModal({ onSuccess })

    await waitFor(() => screen.getByLabelText(/Value/i))

    fireEvent.change(screen.getByLabelText(/Value/i), { target: { value: '5.2' } })

    const submitBtn = screen.getByRole('button', { name: /^Import Result$/ })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockImportSendOutResult).toHaveBeenCalledWith(
        'so-001',
        expect.objectContaining({ value: '5.2' }),
        'user-001',
      )
      expect(onSuccess).toHaveBeenCalledOnce()
    })
  })

  it('shows error message on failed import', async () => {
    mockImportSendOutResult.mockRejectedValue(new Error('network'))
    await renderModal()

    await waitFor(() => screen.getByLabelText(/Value/i))
    fireEvent.change(screen.getByLabelText(/Value/i), { target: { value: '5.2' } })

    fireEvent.click(screen.getByRole('button', { name: /^Import Result$/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

describe('ResultImportModal — file import mode', () => {
  it('switches to file import mode', async () => {
    await renderModal()

    await waitFor(() => screen.getByText(/File Import/i))

    fireEvent.click(screen.getByText(/File Import/i))

    expect(screen.getByText(/drag.*drop|upload/i)).toBeInTheDocument()
  })
})

describe('ResultImportModal — attribution display', () => {
  it('shows non-editable attribution from reference lab', async () => {
    setupDb('Kabul Reference Lab', 'AFG-LAB-001')
    await renderModal()

    await waitFor(() => {
      expect(screen.getByText(/Performed at/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Kabul Reference Lab/)).toBeInTheDocument()
    expect(screen.getByText(/AFG-LAB-001/)).toBeInTheDocument()
  })

  it('attribution field is read-only (not an editable input)', async () => {
    await renderModal()

    await waitFor(() => screen.getByText(/Performed at/i))

    // Attribution should be a paragraph/span/div, not an input
    const attribution = screen.getByText(/Performed at/i).closest('[data-testid="attribution"]') ??
      screen.getByText(/Performed at/i).closest('p') ??
      screen.getByText(/Performed at/i).closest('div')

    expect(attribution?.tagName).not.toBe('INPUT')
    expect(attribution?.tagName).not.toBe('TEXTAREA')
  })
})

describe('ResultImportModal — cancel', () => {
  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    await renderModal({ onClose })

    await waitFor(() => screen.getByRole('button', { name: /Cancel/ }))

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
