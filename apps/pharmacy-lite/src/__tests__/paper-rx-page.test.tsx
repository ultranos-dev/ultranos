import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        session: {
          userId: 'u1',
          practitionerId: 'p1',
          role: 'PHARMACIST',
          sessionId: 's1',
          email: 'pharm@test.com',
        },
        isAuthenticated: true,
      }),
    {
      getState: () => ({
        session: {
          userId: 'u1',
          practitionerId: 'p1',
          role: 'PHARMACIST',
          sessionId: 's1',
          email: 'pharm@test.com',
        },
        isAuthenticated: true,
        getAccessToken: vi.fn().mockResolvedValue('test-token'),
        getPractitionerRef: () => 'Practitioner/p1',
      }),
    },
  ),
}))

// Mock OCR lib
vi.mock('@/lib/ocr', () => ({
  extractPrescriptionFields: vi.fn(),
  fileToBase64: vi.fn().mockResolvedValue('base64data'),
}))

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: () => 'http://localhost:3000/api/trpc',
}))

import PaperRxPage from '@/app/paper-rx/page'
import { extractPrescriptionFields } from '@/lib/ocr'

const mockExtract = extractPrescriptionFields as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // Reset fetch mock
  global.fetch = vi.fn()
  mockExtract.mockResolvedValue({ success: false, fields: [], error: 'OCR_UNAVAILABLE' })
})

describe('Paper Prescription Scan Page (Story 24.3)', () => {
  it('renders capture phase with webcam and file upload options', () => {
    render(<PaperRxPage />)

    expect(screen.getByText('Scan Paper Prescription')).toBeInTheDocument()
    expect(screen.getByText('Open Camera')).toBeInTheDocument()
    expect(screen.getByText('Upload File')).toBeInTheDocument()
  })

  it('always shows Manual Verification Required banner', () => {
    render(<PaperRxPage />)

    expect(screen.getByText('Manual Verification Required')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('OCR results pre-populate the review form', async () => {
    mockExtract.mockResolvedValue({
      success: true,
      fields: [
        { name: 'medicationName', value: 'Amoxicillin 500mg', confidence: 0.92 },
        { name: 'dosage', value: '500mg', confidence: 0.90 },
        { name: 'frequency', value: 'twice daily', confidence: 0.88 },
        { name: 'prescriberName', value: 'Dr. Ahmed', confidence: 0.75 },
        { name: 'prescriptionDate', value: '15/05/2026', confidence: 0.95 },
      ],
    })

    render(<PaperRxPage />)

    // Simulate file upload
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'rx.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    // Wait for review phase
    await waitFor(() => {
      expect(screen.getByDisplayValue('Amoxicillin 500mg')).toBeInTheDocument()
    })

    expect(screen.getByDisplayValue('500mg')).toBeInTheDocument()
    expect(screen.getByDisplayValue('twice daily')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dr. Ahmed')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15/05/2026')).toBeInTheDocument()
  })

  it('highlights low-confidence fields (<85%) in yellow with verify indicator', async () => {
    mockExtract.mockResolvedValue({
      success: true,
      fields: [
        { name: 'medicationName', value: 'Paracetamol', confidence: 0.92 },
        { name: 'dosage', value: '500mg', confidence: 0.60 }, // Below 85%
        { name: 'frequency', value: 'OD', confidence: 0.80 }, // Below 85%
        { name: 'prescriberName', value: 'Dr. X', confidence: 0.92 },
        { name: 'prescriptionDate', value: '10/05/2026', confidence: 0.95 },
      ],
    })

    render(<PaperRxPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'rx.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Paracetamol')).toBeInTheDocument()
    })

    // Low confidence fields show "Please verify" indicator
    const verifyBadges = screen.getAllByText('Please verify')
    expect(verifyBadges.length).toBe(2) // dosage + frequency
  })

  it('falls back to manual entry form when OCR fails', async () => {
    mockExtract.mockResolvedValue({
      success: false,
      fields: [],
      error: 'OCR_UNAVAILABLE',
    })

    render(<PaperRxPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'rx.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Manual Entry Mode')).toBeInTheDocument()
    })

    // All fields should be empty (manual entry)
    const inputs = screen.getAllByRole('textbox')
    inputs.forEach((input) => {
      expect((input as HTMLInputElement).value).toBe('')
    })
  })

  it('allows pharmacist to edit all fields regardless of confidence', async () => {
    mockExtract.mockResolvedValue({
      success: true,
      fields: [
        { name: 'medicationName', value: 'Amoxicillin', confidence: 0.99 },
        { name: 'dosage', value: '500mg', confidence: 0.99 },
        { name: 'frequency', value: 'QD', confidence: 0.99 },
        { name: 'prescriberName', value: 'Dr. A', confidence: 0.99 },
        { name: 'prescriptionDate', value: '10/05/2026', confidence: 0.99 },
      ],
    })

    render(<PaperRxPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'rx.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Amoxicillin')).toBeInTheDocument()
    })

    // Edit the field
    const medInput = screen.getByDisplayValue('Amoxicillin')
    fireEvent.change(medInput, { target: { value: 'Amoxicillin 250mg' } })
    expect(screen.getByDisplayValue('Amoxicillin 250mg')).toBeInTheDocument()
  })

  it('submits paper prescription with correct metadata', async () => {
    mockExtract.mockResolvedValue({
      success: true,
      fields: [
        { name: 'medicationName', value: 'Ciprofloxacin', confidence: 0.90 },
        { name: 'dosage', value: '250mg', confidence: 0.85 },
        { name: 'frequency', value: 'BID', confidence: 0.88 },
        { name: 'prescriberName', value: 'Dr. Khan', confidence: 0.92 },
        { name: 'prescriptionDate', value: '2026-05-14', confidence: 0.95 },
      ],
    })

    // Mock fetch for upload URL, upload, and create
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        // getPaperRxUploadUrl
        ok: true,
        json: () => Promise.resolve({
          result: { data: { json: { uploadUrl: 'https://s.example.com/up', storageKey: 'key-123', expiresAt: '2026-05-16T12:00:00Z' } } },
        }),
      })
      .mockResolvedValueOnce({
        // Upload to signed URL
        ok: true,
      })
      .mockResolvedValueOnce({
        // createPaperPrescription
        ok: true,
        json: () => Promise.resolve({
          result: { data: { json: { success: true, prescriptionId: 'rx-001', status: 'LEGACY_PAPER' } } },
        }),
      })
    global.fetch = fetchMock

    render(<PaperRxPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'rx.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Ciprofloxacin')).toBeInTheDocument()
    })

    // Submit
    fireEvent.click(screen.getByText('Confirm & Submit'))

    await waitFor(() => {
      expect(screen.getByText('Paper prescription recorded as LEGACY_PAPER')).toBeInTheDocument()
    })

    // Verify the createPaperPrescription call
    const createCall = fetchMock.mock.calls[2]
    expect(createCall[0]).toContain('medication.createPaperPrescription')
    const body = JSON.parse(createCall[1].body)
    expect(body.json.medicationName).toBe('Ciprofloxacin')
    expect(body.json.imageStorageKey).toBe('key-123')
    expect(body.json.ocrConfidenceScores).toEqual({
      medicationName: 0.90,
      dosage: 0.85,
      frequency: 0.88,
      prescriberName: 0.92,
      prescriptionDate: 0.95,
    })
  })

  // RTL snapshot tests (CLAUDE.md requirement: snapshot tests for every patient-facing component in both LTR and RTL)
  describe('RTL snapshot tests', () => {
    it('matches snapshot in LTR mode', () => {
      const { container } = render(
        <div dir="ltr">
          <PaperRxPage />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL mode', () => {
      const { container } = render(
        <div dir="rtl">
          <PaperRxPage />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })
})
