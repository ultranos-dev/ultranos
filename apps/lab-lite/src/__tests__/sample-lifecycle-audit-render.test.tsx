/**
 * sample-lifecycle-audit-render.test.tsx
 *
 * Task 11 (review fix): RENDER-LEVEL wiring tests for lab lifecycle audit events.
 *
 * Addresses the false-green finding: the unit tests in sample-lifecycle-audit.test.ts
 * call reportLabLifecycleEvent directly and cannot catch wiring bugs in the component.
 *
 * These tests render real components and simulate user interactions to verify that
 * audit events fire from the correct code paths.
 *
 * PHI rule: no patient names or PHI in any assertion — only opaque IDs.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FhirSpecimen } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// vi.hoisted — mock function refs captured before hoisted vi.mock factories run
// ---------------------------------------------------------------------------

const { mockReportLabLifecycleEvent, mockTransitionSampleStatus, mockAcquireLock } = vi.hoisted(
  () => ({
    mockReportLabLifecycleEvent: vi.fn(),
    mockTransitionSampleStatus: vi.fn().mockResolvedValue(undefined),
    mockAcquireLock: vi.fn().mockResolvedValue({ success: true }),
  }),
)

// ---------------------------------------------------------------------------
// Module mocks — all hoisted by Vitest before any import
// ---------------------------------------------------------------------------

vi.mock('@/lib/audit-client', () => ({
  reportLabLifecycleEvent: mockReportLabLifecycleEvent,
  reportTransportAuditEvent: vi.fn(),
}))

vi.mock('@/lib/sample-service', () => ({
  transitionSampleStatus: mockTransitionSampleStatus,
}))

vi.mock('@/lib/sample-lock-service', () => ({
  acquireLock: mockAcquireLock,
  releaseLock: vi.fn().mockResolvedValue(undefined),
  requestRelease: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/db', () => ({
  getCustodyEventsForSample: vi.fn().mockResolvedValue([]),
  getVerificationBySampleId: vi.fn().mockResolvedValue(null),
  getActiveLock: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/consultation-sync', () => ({
  getConsultationsForSample: vi.fn().mockResolvedValue([]),
  getResponseForRequest: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(
    (selector: (s: { session: { practitionerId: string; userId: string } | null }) => unknown) =>
      selector({ session: { practitionerId: 'tech-001', userId: 'user-001' } }),
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'age' in opts) return `${opts.age} yrs`
      return key
    },
}))

// Child component mocks — visual components not under test here
vi.mock('@/components/samples/SampleStatusBadge', () => ({
  SampleStatusBadge: ({ status }: { status: string }) =>
    React.createElement('span', { 'data-testid': 'status-badge' }, status),
}))
vi.mock('@/components/samples/CustodyTimeline', () => ({
  CustodyTimeline: () => React.createElement('div', { 'data-testid': 'custody-timeline' }),
}))
vi.mock('@/components/samples/RecordHandoffModal', () => ({
  RecordHandoffModal: () => React.createElement('div', { 'data-testid': 'handoff-modal' }),
}))
vi.mock('@/components/samples/LockIndicator', () => ({
  LockIndicator: () => React.createElement('span', { 'data-testid': 'lock-indicator' }),
}))
vi.mock('@/components/samples/SampleLockBlocker', () => ({
  SampleLockBlocker: () => React.createElement('div', { 'data-testid': 'lock-blocker' }),
}))

// ---------------------------------------------------------------------------
// Component import — AFTER mocks
// ---------------------------------------------------------------------------

import { SampleDetailView } from '../components/samples/SampleDetailView'

// ---------------------------------------------------------------------------
// Fixture — received specimen (no transport flags, so Begin Processing is enabled)
// ---------------------------------------------------------------------------

function makeReceivedSpecimen(): FhirSpecimen {
  return {
    id: 'spec-render-001',
    resourceType: 'Specimen',
    status: 'available',
    subject: { reference: 'Patient/opaque-ref-render-001' },
    receivedTime: new Date().toISOString(),
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: {
      labSampleId: 'LAB-RENDER-001',
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
      pipelineStatus: 'received',
      sampleCondition: 'acceptable',
    },
  } as unknown as FhirSpecimen
}

// ---------------------------------------------------------------------------
// Tests — SAMPLE_PROCESSED render-level wiring
// ---------------------------------------------------------------------------

describe('SampleDetailView — SAMPLE_PROCESSED audit wiring (render-level)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransitionSampleStatus.mockResolvedValue(undefined)
    mockAcquireLock.mockResolvedValue({ success: true })
  })

  it('fires reportLabLifecycleEvent with SAMPLE_PROCESSED when Begin Processing is clicked', async () => {
    render(<SampleDetailView specimen={makeReceivedSpecimen()} />)

    const btn = screen.getByTestId('begin-processing-button')
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()

    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockReportLabLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'SAMPLE_PROCESSED',
          sampleId: 'spec-render-001',
        }),
      )
    })
  })

  it('fires SAMPLE_PROCESSED only after transitionSampleStatus resolves (not on lock failure)', async () => {
    // Simulate lock already held by another tech
    mockAcquireLock.mockResolvedValueOnce({
      success: false,
      lockedBy: 'other-tech',
      lockedAt: new Date().toISOString(),
    })

    render(<SampleDetailView specimen={makeReceivedSpecimen()} />)

    fireEvent.click(screen.getByTestId('begin-processing-button'))

    // Wait for async handler to complete
    await waitFor(() => {
      expect(mockAcquireLock).toHaveBeenCalledTimes(1)
    })

    // Audit event must NOT fire when lock acquisition fails
    expect(mockReportLabLifecycleEvent).not.toHaveBeenCalled()
  })

  it('does NOT fire SAMPLE_PROCESSED on handleTransition (mark complete path)', async () => {
    // Render with in-processing specimen so Mark Complete button is visible
    const inProcessingSpecimen = {
      ...makeReceivedSpecimen(),
      _ultranos: {
        ...makeReceivedSpecimen()._ultranos,
        pipelineStatus: 'in-processing' as const,
      },
    } as FhirSpecimen

    render(<SampleDetailView specimen={inProcessingSpecimen} />)

    const markCompleteBtn = screen.getByTestId('mark-complete-button')
    fireEvent.click(markCompleteBtn)

    await waitFor(() => {
      expect(mockTransitionSampleStatus).toHaveBeenCalledWith(
        'spec-render-001',
        'completed',
        expect.any(String),
      )
    })

    // SAMPLE_PROCESSED must NOT fire on the completed transition
    expect(mockReportLabLifecycleEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'SAMPLE_PROCESSED' }),
    )
  })
})
