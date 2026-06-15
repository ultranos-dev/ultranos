/**
 * pre-analytical-flag.test.tsx — Story 54.3, Task 9
 *
 * Integration tests for the pre-analytical transport flag banner in SampleDetailView.
 * Verifies: banner renders, message displayed, acknowledge hides banner, empty/undefined cases.
 * PHI rule: no patient PHI in assertions; test data uses opaque IDs only.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FhirSpecimen } from '@ultranos/shared-types'
import { SampleDetailView } from '../components/samples/SampleDetailView'

// Mock db imports used by SampleDetailView
vi.mock('@/lib/db', () => ({
  getCustodyEventsForSample: vi.fn(() => Promise.resolve([])),
  getVerificationBySampleId: vi.fn(() => Promise.resolve(null)),
  getActiveLock: vi.fn(() => Promise.resolve(null)),
}))

// Mock sample-lock-service (SampleDetailView acquires/releases locks)
vi.mock('@/lib/sample-lock-service', () => ({
  acquireLock: vi.fn(() => Promise.resolve({ success: true })),
  releaseLock: vi.fn(() => Promise.resolve()),
  requestRelease: vi.fn(() => Promise.resolve()),
}))

// Mock LockIndicator and SampleLockBlocker — visual components not under test here
vi.mock('@/components/samples/LockIndicator', () => ({
  LockIndicator: () => React.createElement('span', { 'data-testid': 'lock-indicator' }),
}))
vi.mock('@/components/samples/SampleLockBlocker', () => ({
  SampleLockBlocker: () => React.createElement('div', { 'data-testid': 'lock-blocker' }),
}))

// Mock audit client — prevent real audit emissions during tests
vi.mock('@/lib/audit-client', () => ({
  reportTransportAuditEvent: vi.fn(),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    if (opts && 'age' in opts) return `${opts.age} yrs`
    return key
  },
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn((selector: (s: { session: { practitionerId: string } | null }) => unknown) =>
    selector({ session: { practitionerId: 'tech-1' } })
  ),
}))

// Mock sample-service
vi.mock('@/lib/sample-service', () => ({
  transitionSampleStatus: vi.fn(),
}))

// Mock child components that are not under test.
// Use the same relative path that SampleDetailView uses so Vitest's module
// registry matches correctly after alias resolution.
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

// ── Factories ────────────────────────────────────────────────────────────────

function makeSpecimenWithFlags(): FhirSpecimen {
  return {
    id: 'spec-1',
    resourceType: 'Specimen',
    status: 'available',
    subject: { reference: 'Patient/opaque-1' },
    receivedTime: new Date().toISOString(),
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: {
      labSampleId: 'L2026-001',
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
      pipelineStatus: 'received',
      sampleCondition: 'acceptable',
      transportFlags: [
        {
          sampleId: 'spec-1',
          labSampleId: 'L2026-001',
          flagType: 'stability-exceeded',
          message: 'Sample L2026-001 exceeded 6-hour stability window. Flag for pre-analytical error.',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  } as unknown as FhirSpecimen
}

function makeSpecimenNoFlags(emptyArray = false): FhirSpecimen {
  return {
    id: 'spec-2',
    resourceType: 'Specimen',
    status: 'available',
    subject: { reference: 'Patient/opaque-2' },
    receivedTime: new Date().toISOString(),
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: {
      labSampleId: 'L2026-002',
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
      pipelineStatus: 'received',
      sampleCondition: 'acceptable',
      ...(emptyArray ? { transportFlags: [] } : {}),
    },
  } as unknown as FhirSpecimen
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SampleDetailView — pre-analytical transport flag banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the pre-analytical flag banner when transportFlags has entries', () => {
    render(<SampleDetailView specimen={makeSpecimenWithFlags()} />)

    const banner = screen.getByTestId('pre-analytical-flag-banner')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveAttribute('role', 'alert')
  })

  it('shows the flag message text inside the banner', () => {
    render(<SampleDetailView specimen={makeSpecimenWithFlags()} />)

    expect(
      screen.getByText('Sample L2026-001 exceeded 6-hour stability window. Flag for pre-analytical error.')
    ).toBeInTheDocument()
  })

  it('shows the acknowledge button inside the banner', () => {
    render(<SampleDetailView specimen={makeSpecimenWithFlags()} />)

    const btn = screen.getByTestId('acknowledge-transport-flag-button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('I acknowledge this sample has a pre-analytical concern')
  })

  it('hides the banner after the acknowledge button is clicked', () => {
    render(<SampleDetailView specimen={makeSpecimenWithFlags()} />)

    expect(screen.getByTestId('pre-analytical-flag-banner')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('acknowledge-transport-flag-button'))

    expect(screen.queryByTestId('pre-analytical-flag-banner')).not.toBeInTheDocument()
  })

  it('does not show the banner when transportFlags is an empty array', () => {
    render(<SampleDetailView specimen={makeSpecimenNoFlags(true)} />)

    expect(screen.queryByTestId('pre-analytical-flag-banner')).not.toBeInTheDocument()
  })

  it('does not show the banner when transportFlags is undefined', () => {
    render(<SampleDetailView specimen={makeSpecimenNoFlags(false)} />)

    expect(screen.queryByTestId('pre-analytical-flag-banner')).not.toBeInTheDocument()
  })

  it('Begin Processing button is disabled while transport flags are unacknowledged', () => {
    render(<SampleDetailView specimen={makeSpecimenWithFlags()} />)

    const btn = screen.getByTestId('begin-processing-button')
    expect(btn).toBeDisabled()
  })

  it('Begin Processing button is enabled after transport flags are acknowledged', () => {
    render(<SampleDetailView specimen={makeSpecimenWithFlags()} />)

    fireEvent.click(screen.getByTestId('acknowledge-transport-flag-button'))

    const btn = screen.getByTestId('begin-processing-button')
    expect(btn).not.toBeDisabled()
  })
})
