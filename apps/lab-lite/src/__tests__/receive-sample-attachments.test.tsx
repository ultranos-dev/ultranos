/**
 * receive-sample-attachments.test.tsx
 *
 * Task 9: Verify that ReceiveSampleModal calls enqueueSpecimenAttachments with
 * the correct attachmentContext on both acceptable and non-acceptable conditions.
 *
 * Strategy: render the modal past the verification step, add a prepared
 * attachment via state, submit the form, and assert the helper was called with
 * the expected shape.  We mock `enqueueSpecimenAttachments` directly so the test
 * is isolated from the real enqueue/db path.
 *
 * PHI rule: no patient data in assertions — only opaque IDs and shape checks.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// vi.hoisted — variables initialised before the hoisted vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockEnqueueSpecimenAttachments,
  mockAccessionSample,
  mockRejectSample,
  mockSaveVerificationRecord,
  mockReportLabLifecycleEvent,
} = vi.hoisted(() => ({
  mockEnqueueSpecimenAttachments: vi.fn().mockResolvedValue(undefined),
  mockAccessionSample: vi.fn(),
  mockRejectSample: vi.fn().mockResolvedValue(undefined),
  mockSaveVerificationRecord: vi.fn().mockResolvedValue(undefined),
  mockReportLabLifecycleEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/audit-client', () => ({
  reportLabLifecycleEvent: mockReportLabLifecycleEvent,
  reportVerificationEvent: vi.fn(),
}))

vi.mock('@/lib/attachment-enqueue', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    enqueueSpecimenAttachments: mockEnqueueSpecimenAttachments,
  }
})

vi.mock('@/lib/sample-service', () => ({
  accessionSample: mockAccessionSample,
  rejectSample: mockRejectSample,
}))

vi.mock('@/lib/db', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    saveVerificationRecord: mockSaveVerificationRecord,
  }
})

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: { practitionerId: string } }) => unknown) =>
    selector({ session: { practitionerId: 'tech-001' } }),
}))

vi.mock('@/lib/trip-optimizer', () => ({
  analyzeTripRequirements: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/patient-queue', () => ({
  saveTripResult: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Mock AttachmentPicker — intercept value/onChange without real transcode
// ---------------------------------------------------------------------------

vi.mock('@/components/attachments/AttachmentPicker', () => ({
  AttachmentPicker: ({
    value,
    onChange,
  }: {
    value: { blob: Blob; fileName: string; fileType: string; kind: string }[]
    onChange: (next: { blob: Blob; fileName: string; fileType: string; kind: string }[]) => void
  }) => (
    <div data-testid="attachment-picker" data-count={value.length}>
      <button
        type="button"
        data-testid="mock-add-attachment"
        onClick={() =>
          onChange([
            ...value,
            {
              blob: new Blob(['img']),
              fileName: 'photo.webp',
              fileType: 'image/webp',
              kind: 'image',
            },
          ])
        }
      >
        Add attachment
      </button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Mock PatientVerificationForm — auto-complete verification on button click
// ---------------------------------------------------------------------------

const MOCK_VERIFICATION_RECORD = {
  id: 'vr-001',
  sampleId: 'order-test-001',
  patientRef: 'Patient/opaque-ref-001',
  verifiedAt: '2026-09-13T10:00:00.000Z',
  verifiedBy: 'tech-001',
  methods: ['wristband'],
}

vi.mock('@/components/verification/PatientVerificationForm', () => ({
  PatientVerificationForm: ({
    onComplete,
  }: {
    onComplete: (record: typeof MOCK_VERIFICATION_RECORD) => void
  }) => (
    <div data-testid="verification-form">
      <button
        type="button"
        data-testid="complete-verification"
        onClick={() => onComplete(MOCK_VERIFICATION_RECORD)}
      >
        Complete Verification
      </button>
    </div>
  ),
}))

vi.mock('@/lib/verification-service', () => ({
  getDefaultMethodsForSource: vi.fn().mockReturnValue([]),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  X: ({ size }: { size: number }) => <span data-testid="close-icon" data-size={size} />,
}))

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) =>
    (key: string, params?: Record<string, unknown>) => {
      if (!params) return `${ns}.${key}`
      return `${ns}.${key} ${Object.values(params).join(' ')}`
    },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ReceiveSampleModal } from '../components/samples/ReceiveSampleModal'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SPECIMEN = {
  id: 'spec-uuid-001',
  resourceType: 'Specimen',
  status: 'available',
  subject: { reference: 'Patient/opaque-ref-001' },
  request: [{ reference: 'ServiceRequest/order-test-001' }],
  _ultranos: {
    labSampleId: 'LAB-20260913-0001',
    pipelineStatus: 'received',
  },
}

const DEFAULT_PROPS = {
  orderId: 'order-test-001',
  patientRef: 'Patient/opaque-ref-001',
  patientFirstName: 'Ahmad',
  patientAge: 35,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

// ---------------------------------------------------------------------------
// Helper — render the modal and advance past the verification step
// ---------------------------------------------------------------------------

async function renderModalAtSampleDetailsStep(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  render(<ReceiveSampleModal {...props} />)

  // Step 1: complete verification to advance to sampleDetails step
  fireEvent.click(screen.getByTestId('complete-verification'))
  await screen.findByTestId('receive-sample-modal')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReceiveSampleModal — specimen attachment enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccessionSample.mockResolvedValue(MOCK_SPECIMEN)
    mockEnqueueSpecimenAttachments.mockResolvedValue(undefined)
    mockRejectSample.mockResolvedValue(undefined)
    mockSaveVerificationRecord.mockResolvedValue(undefined)
  })

  it('renders the AttachmentPicker in the sample details step', async () => {
    await renderModalAtSampleDetailsStep()
    expect(screen.getByTestId('attachment-picker')).toBeInTheDocument()
  })

  it('calls enqueueSpecimenAttachments with attachmentContext:"receipt" on acceptable condition submit', async () => {
    await renderModalAtSampleDetailsStep()

    // Add one attachment via the mock picker
    fireEvent.click(screen.getByTestId('mock-add-attachment'))

    // condition is 'acceptable' by default — submit
    fireEvent.click(screen.getByTestId('submit-button'))

    await waitFor(() => {
      expect(mockEnqueueSpecimenAttachments).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ fileName: 'photo.webp', fileType: 'image/webp' }),
        ]),
        expect.objectContaining({
          specimenId: 'LAB-20260913-0001',
          patientRef: 'Patient/opaque-ref-001',
          attachmentContext: 'receipt',
        }),
      )
    })

    // Story 43.1 — SAMPLE_RECEIVED audit event must fire on accession (render-level assertion)
    expect(mockReportLabLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'SAMPLE_RECEIVED',
        sampleId: 'spec-uuid-001',
      }),
    )
  })

  it('calls enqueueSpecimenAttachments with attachmentContext:"rejection" on non-acceptable condition submit', async () => {
    await renderModalAtSampleDetailsStep()

    // Set condition to hemolyzed
    fireEvent.click(screen.getByTestId('condition-hemolyzed'))

    // Select a rejection reason
    fireEvent.change(screen.getByTestId('rejection-reason-select'), {
      target: { value: 'Hemolysis detected — unable to process' },
    })

    // Add one attachment
    fireEvent.click(screen.getByTestId('mock-add-attachment'))

    // Submit
    fireEvent.click(screen.getByTestId('submit-button'))

    await waitFor(() => {
      expect(mockEnqueueSpecimenAttachments).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ fileName: 'photo.webp' }),
        ]),
        expect.objectContaining({
          specimenId: 'LAB-20260913-0001',
          attachmentContext: 'rejection',
        }),
      )
    })
  })

  it('calls enqueueSpecimenAttachments with empty array when no attachments added', async () => {
    await renderModalAtSampleDetailsStep()

    // No attachments — submit
    fireEvent.click(screen.getByTestId('submit-button'))

    await waitFor(() => {
      expect(mockAccessionSample).toHaveBeenCalledTimes(1)
      expect(mockEnqueueSpecimenAttachments).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ specimenId: 'LAB-20260913-0001' }),
      )
    })
  })

  it('advances to confirmation and shows non-fatal warning when enqueueSpecimenAttachments rejects', async () => {
    // Enqueue throws — sample record is already committed at this point
    mockEnqueueSpecimenAttachments.mockRejectedValueOnce(new Error('IndexedDB unavailable'))

    await renderModalAtSampleDetailsStep()

    // Add one attachment so the enqueue is actually attempted
    fireEvent.click(screen.getByTestId('mock-add-attachment'))

    // Submit (acceptable condition by default)
    fireEvent.click(screen.getByTestId('submit-button'))

    // Confirmation screen must appear — sample is NOT lost
    await waitFor(() => {
      expect(screen.getByTestId('sample-collection-confirmation')).toBeInTheDocument()
    })

    // onSuccess must NOT have been called yet (user presses Done)
    expect(DEFAULT_PROPS.onSuccess).not.toHaveBeenCalled()

    // Non-fatal warning must be visible
    expect(screen.getByTestId('attachment-warning')).toBeInTheDocument()

    // No fatal error shown (form-error must not exist)
    expect(screen.queryByTestId('form-error')).not.toBeInTheDocument()

    // Pressing Done calls onSuccess with the sample ID
    fireEvent.click(screen.getByTestId('confirmation-done-button'))
    expect(DEFAULT_PROPS.onSuccess).toHaveBeenCalledWith('LAB-20260913-0001')
  })
})
