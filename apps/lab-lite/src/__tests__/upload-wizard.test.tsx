import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'fake-indexeddb/auto'
import { getDb } from '../lib/db'
import { useAuthSessionStore } from '../stores/auth-session-store'

// ── Mocks ──────────────────────────────────────────────

const mockPush = vi.fn()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  }),
}))

const mockVerifyPatient = vi.fn()
const mockAnalyzeUpload = vi.fn()

vi.mock('@/lib/trpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc')>()
  return {
    ...actual,
    verifyPatient: (...args: unknown[]) => mockVerifyPatient(...args),
    analyzeUpload: (...args: unknown[]) => mockAnalyzeUpload(...args),
  }
})

const mockReportQueueAuditEvent = vi.fn()
vi.mock('@/lib/audit-client', () => ({
  reportQueueAuditEvent: (...args: unknown[]) => mockReportQueueAuditEvent(...args),
}))

// Mock html5-qrcode to avoid camera access in tests
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  })),
}))

function setAuthSession() {
  useAuthSessionStore.getState().setSession({
    userId: 'user-1',
    practitionerId: 'prac-1',
    role: 'LAB_TECH',
    sessionId: 'sess-1',
    email: 'tech@lab.com',
    labName: 'Central Diagnostics Lab',
    technicianName: 'Dr. Ahmad',
  })
}

async function renderUploadWizard() {
  const { default: UploadPage } = await import('../app/upload/page')
  return render(<UploadPage />)
}

function createTestFile(name = 'result.pdf', type = 'application/pdf', sizeKB = 100): File {
  const content = new Uint8Array(sizeKB * 1024)
  return new File([content], name, { type })
}

describe('Upload Wizard (Story 17.2)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    setAuthSession()
    mockVerifyPatient.mockReset()
    mockAnalyzeUpload.mockReset()
    mockReportQueueAuditEvent.mockReset()
    mockPush.mockReset()
    mockReplace.mockReset()
    mockAnalyzeUpload.mockResolvedValue({
      suggestions: [],
      processingTimeMs: 0,
      available: false,
      provider: 'none',
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
  })

  // AC #1: Wizard renders 4-step progress indicator
  it('renders a multi-step wizard with 4-step progress indicator', async () => {
    await renderUploadWizard()

    expect(screen.getByText('Verify Patient')).toBeDefined()
    expect(screen.getByText('Upload File')).toBeDefined()
    expect(screen.getByText('Tag Metadata')).toBeDefined()
    expect(screen.getByText('Review & Submit')).toBeDefined()

    // Step 1 should be active
    const stepIndicator = screen.getByTestId('step-indicator')
    expect(stepIndicator).toBeDefined()
  })

  // AC #2: Step 1 renders patient verification with manual/QR choice
  it('renders Step 1 with Manual ID and QR Scan toggle', async () => {
    await renderUploadWizard()

    expect(screen.getByText('Manual ID')).toBeDefined()
    expect(screen.getByText('QR Scan')).toBeDefined()
  })

  // AC #6: Cannot skip steps — Next disabled until step complete
  it('cannot skip steps — no Next button before verification', async () => {
    await renderUploadWizard()

    // On step 1, there should be no enabled forward button
    const nextButton = screen.queryByRole('button', { name: /next/i })
    expect(nextButton).toBeNull()
  })

  // AC #2, #3: Step 1 → Step 2 transition after patient verified
  it('transitions from Step 1 to Step 2 after patient verification', async () => {
    const user = userEvent.setup()

    mockVerifyPatient.mockResolvedValue({
      firstName: 'Ahmad',
      age: 34,
      patientRef: 'pat-opaque-ref',
    })

    await renderUploadWizard()

    // Enter national ID
    const idInput = screen.getByPlaceholderText('Enter patient National ID')
    await user.type(idInput, '1234567890')
    await user.click(screen.getByText('Look Up Patient'))

    // Wait for verification result card
    await waitFor(() => {
      expect(screen.getByText('Patient Verified')).toBeDefined()
    })

    // Confirm patient
    await user.click(screen.getByText('Confirm Patient'))

    // Should advance to Step 2
    await waitFor(() => {
      expect(screen.getByText(/drag and drop/i)).toBeDefined()
    })
  })

  // AC #3: Step 2 carries patientRef forward
  it('Step 2 renders ResultUpload only after patient verification', async () => {
    const user = userEvent.setup()

    mockVerifyPatient.mockResolvedValue({
      firstName: 'Ahmad',
      age: 34,
      patientRef: 'pat-opaque-ref',
    })

    await renderUploadWizard()

    // Step 1: verify patient
    const idInput = screen.getByPlaceholderText('Enter patient National ID')
    await user.type(idInput, '1234567890')
    await user.click(screen.getByText('Look Up Patient'))
    await waitFor(() => expect(screen.getByText('Patient Verified')).toBeDefined())
    await user.click(screen.getByText('Confirm Patient'))

    // Step 2 should show upload zone
    await waitFor(() => {
      expect(screen.getByLabelText('Upload lab result file')).toBeDefined()
    })
  })

  // AC #6: Back button preserves state (no data loss)
  it('preserves wizard state when navigating back', async () => {
    const user = userEvent.setup()

    mockVerifyPatient.mockResolvedValue({
      firstName: 'Ahmad',
      age: 34,
      patientRef: 'pat-opaque-ref',
    })

    await renderUploadWizard()

    // Complete Step 1
    const idInput = screen.getByPlaceholderText('Enter patient National ID')
    await user.type(idInput, '1234567890')
    await user.click(screen.getByText('Look Up Patient'))
    await waitFor(() => expect(screen.getByText('Patient Verified')).toBeDefined())
    await user.click(screen.getByText('Confirm Patient'))

    // Wait for Step 2
    await waitFor(() => {
      expect(screen.getByLabelText('Upload lab result file')).toBeDefined()
    })

    // Go back
    await user.click(screen.getByRole('button', { name: /back/i }))

    // Should show Step 1 with preserved patient info
    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeDefined()
    })
  })

  // AC #5: Review step shows all collected data
  it('Review step displays patient name, test category, file name, collection date', async () => {
    const user = userEvent.setup()

    mockVerifyPatient.mockResolvedValue({
      firstName: 'Ahmad',
      age: 34,
      patientRef: 'pat-opaque-ref',
    })

    await renderUploadWizard()

    // Step 1: verify patient
    await user.type(screen.getByPlaceholderText('Enter patient National ID'), '1234567890')
    await user.click(screen.getByText('Look Up Patient'))
    await waitFor(() => expect(screen.getByText('Patient Verified')).toBeDefined())
    await user.click(screen.getByText('Confirm Patient'))

    // Step 2: upload file
    await waitFor(() => expect(screen.getByLabelText('Upload lab result file')).toBeDefined())
    const file = createTestFile()
    const dropZone = screen.getByLabelText('Upload lab result file')
    const input = dropZone.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    // Wait for file to be selected, then click Next
    await waitFor(() => expect(screen.getByText('result.pdf')).toBeDefined())
    await user.click(screen.getByRole('button', { name: /next/i }))

    // Step 3: metadata
    await waitFor(() => expect(screen.getByLabelText('Test Category')).toBeDefined())
    await user.selectOptions(screen.getByLabelText('Test Category'), '58410-2')
    await user.type(screen.getByLabelText('Sample Collection Date'), '2026-05-10')
    await user.click(screen.getByText('Submit Results'))

    // Step 4: review
    await waitFor(() => {
      expect(screen.getByText('Review & Confirm')).toBeDefined()
    })
    expect(screen.getByText('Ahmad, 34 years')).toBeDefined()
    expect(screen.getByText(/result\.pdf/)).toBeDefined()
    expect(screen.getByText(/blood work/i)).toBeDefined()
  })

  // AC #7, #8: Submit queues to Dexie and redirects
  it('queues to Dexie on submit and redirects to dashboard', async () => {
    const user = userEvent.setup()

    mockVerifyPatient.mockResolvedValue({
      firstName: 'Ahmad',
      age: 34,
      patientRef: 'pat-opaque-ref',
    })

    await renderUploadWizard()

    // Step 1: verify
    await user.type(screen.getByPlaceholderText('Enter patient National ID'), '1234567890')
    await user.click(screen.getByText('Look Up Patient'))
    await waitFor(() => expect(screen.getByText('Patient Verified')).toBeDefined())
    await user.click(screen.getByText('Confirm Patient'))

    // Step 2: upload
    await waitFor(() => expect(screen.getByLabelText('Upload lab result file')).toBeDefined())
    const file = createTestFile()
    const dropZone = screen.getByLabelText('Upload lab result file')
    const input = dropZone.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    await waitFor(() => expect(screen.getByText('result.pdf')).toBeDefined())
    await user.click(screen.getByRole('button', { name: /next/i }))

    // Step 3: metadata
    await waitFor(() => expect(screen.getByLabelText('Test Category')).toBeDefined())
    await user.selectOptions(screen.getByLabelText('Test Category'), '58410-2')
    await user.type(screen.getByLabelText('Sample Collection Date'), '2026-05-10')
    await user.click(screen.getByText('Submit Results'))

    // Step 4: review & submit
    await waitFor(() => expect(screen.getByText('Review & Confirm')).toBeDefined())
    await user.click(screen.getByText('Confirm & Submit'))

    // Verify queue entry created in Dexie
    await waitFor(async () => {
      const db = getDb()
      const items = await db.uploadQueue.toArray()
      expect(items.length).toBe(1)
      expect(items[0].patientRef).toBe('pat-opaque-ref')
      expect(items[0].patientFirstName).toBe('Ahmad')
      expect(items[0].status).toBe('pending')
      expect(items[0].metadata.loincCode).toBe('58410-2')
    })

    // Verify redirect to dashboard
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/?uploaded=true')
    })

    // Verify audit event was emitted via canonical logger
    expect(mockReportQueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QUEUE_ENTRY_CREATED',
        patientRef: 'pat-opaque-ref',
        technicianId: 'prac-1',
      }),
    )
  })

  // AC #6: Cannot skip steps
  it('does not render step 3 content while on step 2', async () => {
    const user = userEvent.setup()

    mockVerifyPatient.mockResolvedValue({
      firstName: 'Ahmad',
      age: 34,
      patientRef: 'pat-opaque-ref',
    })

    await renderUploadWizard()

    // Complete Step 1
    await user.type(screen.getByPlaceholderText('Enter patient National ID'), '1234567890')
    await user.click(screen.getByText('Look Up Patient'))
    await waitFor(() => expect(screen.getByText('Patient Verified')).toBeDefined())
    await user.click(screen.getByText('Confirm Patient'))

    // Should be on Step 2 — no metadata form visible
    await waitFor(() => expect(screen.getByLabelText('Upload lab result file')).toBeDefined())
    expect(screen.queryByLabelText('Test Category')).toBeNull()
  })
})
