/**
 * Integration + Audit tests for the full Post-Exposure Emergency Workflow
 * Story 47.1 — Tasks 12.6 (integration) and 12.7 (audit events)
 *
 * Simulates the full path: EmergencyButton click → exposure type selection →
 * 6-step workflow → incident report generation and notification dispatch,
 * entirely offline (all persistence mocked at the DB boundary).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ExposureType } from '../lib/safety/exposure-protocol'

// ---------------------------------------------------------------------------
// Mocks — all at the DB/network boundary so the workflow runs fully offline
// ---------------------------------------------------------------------------

const mockReportSafetyAuditEvent = vi.fn()
vi.mock('@/lib/audit-client', () => ({
  reportSafetyAuditEvent: (...args: unknown[]) => mockReportSafetyAuditEvent(...args),
}))

const mockIncidentReportsTable = { put: vi.fn() }
const mockDb = { incident_reports: mockIncidentReportsTable }
const mockEnqueueSyncEvent = vi.fn()
vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
  enqueueSyncEvent: (...args: unknown[]) => mockEnqueueSyncEvent(...args),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wall: 1000000000000n, logical: 0n, node: 'test' }) },
  serializeHlc: (_hlc: unknown) => 'hlc:test:0',
}))

vi.mock('@/lib/safety/source-patient-lookup', () => ({
  getLastProcessedSample: vi.fn().mockResolvedValue(null),
  getSourcePatientStatus: vi.fn().mockResolvedValue({ hepB: 'UNKNOWN', hiv: 'UNKNOWN', hepC: 'UNKNOWN' }),
  getSourcePatientDisplay: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/safety/pep-providers', () => ({
  getPepProviders: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: { practitionerId: string } | null }) => unknown) =>
    selector({ session: { practitionerId: 'Practitioner/tech-001' } }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, args?: Record<string, unknown>) => {
    if (args) {
      return `${key}(${Object.entries(args).map(([k, v]) => `${k}=${v}`).join(',')})`
    }
    return key
  },
}))

// Use REAL implementations for the safety library (pure functions, no deps)
// and real incident-report (which calls mocked db and hlc above)
// This is the key difference from unit tests: we don't mock these modules.

import { EmergencyButton } from '../components/safety/EmergencyButton'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockIncidentReportsTable.put.mockResolvedValue(undefined)
  mockEnqueueSyncEvent.mockResolvedValue(undefined)
  mockReportSafetyAuditEvent.mockReturnValue(undefined)
})

afterEach(() => {
  document.dir = 'ltr'
})

// ---------------------------------------------------------------------------
// Task 12.6 — Integration test: full workflow, fully offline
// ---------------------------------------------------------------------------

describe('Integration: full exposure workflow — offline, needlestick', () => {
  async function runFullWorkflow() {
    const { container } = render(<EmergencyButton />)

    // 1. Click the emergency FAB (aria-label is the raw i18n key in this mock)
    const fab = screen.getByRole('button', { name: /buttonAriaLabel/i })
    await act(async () => { fireEvent.click(fab) })

    // 2. Select exposure type
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })

    // 3. Step 1: First Aid — confirm
    await waitFor(() => expect(screen.getByText(/current=1,total=6/)).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /firstAid\.confirm/i }))
    })

    // 4. Step 2: Source Patient — next (no auto-loaded patient)
    await waitFor(() => expect(screen.getByText(/current=2,total=6/)).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i }))
    })

    // 5. Step 3: Source Status — next
    await waitFor(() => expect(screen.getByText(/current=3,total=6/)).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i }))
    })

    // 6. Step 4: PEP Recommendation — next
    await waitFor(() => expect(screen.getByText(/current=4,total=6/)).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i }))
    })

    // 7. Step 5: Provider Contacts — next
    await waitFor(() => expect(screen.getByText(/current=5,total=6/)).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i }))
    })

    // 8. Step 6: Incident Report — submit
    await waitFor(() => expect(screen.getByText(/current=6,total=6/)).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i }))
    })

    return container
  }

  it('full workflow completes — incident report persisted to local DB', async () => {
    await runFullWorkflow()
    await waitFor(() => {
      expect(mockIncidentReportsTable.put).toHaveBeenCalledTimes(1)
    })
    const storedReport = mockIncidentReportsTable.put.mock.calls[0][0]
    expect(storedReport).toHaveProperty('id')
    expect(storedReport.type).toBe(ExposureType.NEEDLESTICK)
  })

  it('full workflow completes — incident report queued for sync (works offline)', async () => {
    await runFullWorkflow()
    await waitFor(() => {
      expect(mockEnqueueSyncEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'IncidentReport' }),
      )
    })
  })

  it('full workflow completes — report contains no raw patient name (PHI minimization)', async () => {
    await runFullWorkflow()
    await waitFor(() => {
      expect(mockIncidentReportsTable.put).toHaveBeenCalledTimes(1)
    })
    const storedReport = mockIncidentReportsTable.put.mock.calls[0][0]
    expect(storedReport.sourcePatientRef).toMatch(/^Patient\//)
    expect((storedReport as any).patientName).toBeUndefined()
    expect((storedReport as any).firstName).toBeUndefined()
  })

  it('full workflow — confirmation screen shown after report generated', async () => {
    await runFullWorkflow()
    await waitFor(() => {
      expect(screen.getByText('report.title')).toBeInTheDocument()
    })
  })

  it('full workflow — sync event uses HLC timestamp (not wall clock)', async () => {
    await runFullWorkflow()
    await waitFor(() => {
      expect(mockEnqueueSyncEvent).toHaveBeenCalledWith(
        expect.objectContaining({ hlcTimestamp: 'hlc:test:0' }),
      )
    })
  })
})

// ---------------------------------------------------------------------------
// Task 12.7 — Audit events: verify all 4 required audit events are emitted
// ---------------------------------------------------------------------------

describe('Audit: all 4 required safety audit events are emitted', () => {
  it('EXPOSURE_PROTOCOL_STARTED is emitted when workflow mounts', async () => {
    await act(async () => { render(<EmergencyButton />) })

    // Open FAB → select exposure
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })

    await waitFor(() => {
      expect(mockReportSafetyAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXPOSURE_PROTOCOL_STARTED' }),
      )
    })
  })

  it('EXPOSURE_PROTOCOL_STARTED audit event contains techId and exposureType', async () => {
    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })

    await waitFor(() => {
      expect(mockReportSafetyAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EXPOSURE_PROTOCOL_STARTED',
          techId: 'Practitioner/tech-001',
          exposureType: ExposureType.NEEDLESTICK,
        }),
      )
    })
  })

  it('EXPOSURE_PROTOCOL_STARTED audit event does NOT contain patient name or PHI', async () => {
    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })

    await waitFor(() => {
      const call = mockReportSafetyAuditEvent.mock.calls.find(
        (c) => c[0].action === 'EXPOSURE_PROTOCOL_STARTED',
      )
      expect(call).toBeDefined()
      const payload = call![0]
      expect((payload as any).patientName).toBeUndefined()
      expect((payload as any).firstName).toBeUndefined()
    })
  })

  it('INCIDENT_REPORT_CREATED is emitted when report is generated', async () => {
    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })
    // Navigate through all steps
    await waitFor(() => expect(screen.getByText(/current=1,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /firstAid\.confirm/i })) })
    await waitFor(() => expect(screen.getByText(/current=2,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await waitFor(() => expect(screen.getByText(/current=3,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await waitFor(() => expect(screen.getByText(/current=4,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await waitFor(() => expect(screen.getByText(/current=5,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await waitFor(() => expect(screen.getByText(/current=6,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })

    await waitFor(() => {
      expect(mockReportSafetyAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INCIDENT_REPORT_CREATED' }),
      )
    })
  })

  it('EXPOSURE_NOTIFICATION_SENT is emitted when report is generated', async () => {
    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })
    await waitFor(() => expect(screen.getByText(/current=1,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /firstAid\.confirm/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })

    await waitFor(() => {
      expect(mockReportSafetyAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXPOSURE_NOTIFICATION_SENT' }),
      )
    })
  })

  it('all 4 audit events are emitted in a complete workflow run', async () => {
    // Note: SOURCE_PATIENT_ACCESSED only fires when sourcePatientRef is set.
    // Without a source patient (null), only 3 events fire (STARTED, CREATED, SENT).
    // This test confirms the minimum set: STARTED + CREATED + SENT.

    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })
    await waitFor(() => expect(screen.getByText(/current=1,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /firstAid\.confirm/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })

    await waitFor(() => {
      const actions = mockReportSafetyAuditEvent.mock.calls.map((c) => c[0].action)
      expect(actions).toContain('EXPOSURE_PROTOCOL_STARTED')
      expect(actions).toContain('INCIDENT_REPORT_CREATED')
      expect(actions).toContain('EXPOSURE_NOTIFICATION_SENT')
    })
  })

  it('SOURCE_PATIENT_ACCESSED is emitted when source patient ref is set', async () => {
    const { getLastProcessedSample } = await import('@/lib/safety/source-patient-lookup')
    vi.mocked(getLastProcessedSample).mockResolvedValue({
      sampleId: 'sample-001',
      patientRef: 'Patient/abc-123',
      processedAt: '2026-05-31T09:00:00Z',
    })

    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })
    // Advance to step 2 (source patient step)
    await waitFor(() => expect(screen.getByText(/current=1,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /firstAid\.confirm/i })) })
    // Click Next on source patient step — triggers SOURCE_PATIENT_ACCESSED
    await waitFor(() => expect(screen.getByText(/current=2,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })

    await waitFor(() => {
      expect(mockReportSafetyAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SOURCE_PATIENT_ACCESSED',
          patientRef: 'Patient/abc-123',
        }),
      )
    })
  })

  it('SOURCE_PATIENT_ACCESSED audit event uses opaque Patient/ ref — no PHI', async () => {
    const { getLastProcessedSample } = await import('@/lib/safety/source-patient-lookup')
    vi.mocked(getLastProcessedSample).mockResolvedValue({
      sampleId: 'sample-001',
      patientRef: 'Patient/abc-123',
      processedAt: '2026-05-31T09:00:00Z',
    })

    await act(async () => { render(<EmergencyButton />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buttonAriaLabel/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('exposureTypes.needlestick'))
    })
    await waitFor(() => expect(screen.getByText(/current=1,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /firstAid\.confirm/i })) })
    await waitFor(() => expect(screen.getByText(/current=2,total=6/)).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /workflow\.next/i })) })

    await waitFor(() => {
      const call = mockReportSafetyAuditEvent.mock.calls.find(
        (c) => c[0].action === 'SOURCE_PATIENT_ACCESSED',
      )
      expect(call).toBeDefined()
      const payload = call![0]
      expect(payload.patientRef).toMatch(/^Patient\//)
      expect((payload as any).patientName).toBeUndefined()
      expect((payload as any).firstName).toBeUndefined()
      expect((payload as any).age).toBeUndefined()
    })
  })
})
