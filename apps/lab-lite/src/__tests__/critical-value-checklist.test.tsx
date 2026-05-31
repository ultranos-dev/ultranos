/**
 * Story 43.7 — CriticalValueChecklist Component Tests
 * Tasks 8.5-8.16
 *
 * RTL: snapshots captured in both LTR and RTL document directions.
 * PHI: no patient IDs or numeric result values appear in the component or its audit output.
 * Offline: component degrades gracefully when Dexie config throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks (must be declared before static imports of the component)
// ---------------------------------------------------------------------------

const mockGetChecklistConfig = vi.fn()
const mockAddCompletedChecklist = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db', () => ({
  getChecklistConfig: (...args: unknown[]) => mockGetChecklistConfig(...args),
  addCompletedChecklist: (...args: unknown[]) => mockAddCompletedChecklist(...args),
  getDb: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      title: 'Critical Value Checklist',
      subtitle: 'All items must be checked before releasing',
      releaseButton: 'Release',
      cancelButton: 'Cancel',
      autoVerified: 'Auto-verified',
      notApplicable: 'N/A',
      criticalValuesDetected: 'Critical Values Detected',
      directionHigh: 'HIGH',
      directionLow: 'LOW',
      'items.qc-passed-today': 'QC passed today for this analyte',
      'items.patient-id-verified': 'Patient ID verified (two-identifier)',
      'items.result-plausibility': 'Result reviewed for plausibility',
      'items.delta-check-reviewed': 'Delta check reviewed (if prior result exists)',
      'items.repeat-testing': 'Repeat testing performed (if required by lab policy)',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: 1000, counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '2026-05-31T00:00:00.000Z-0-test-node',
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: { session: { userId: string } }) => unknown) =>
    selector({ session: { userId: 'prac-supervisor-003' } }),
}))

// Static import — vi.mock hoisting ensures mocks are in place before this resolves
import { CriticalValueChecklist } from '@/components/critical-values/CriticalValueChecklist'
import type { CriticalValueMatch, CompletedChecklist, ChecklistConfig } from '@/lib/critical-values/types'
import { DEFAULT_CHECKLIST_CONFIG_ITEMS } from '@/lib/critical-values/default-thresholds'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const criticalValues: CriticalValueMatch[] = [
  { loincCode: '2823-3', analyte: 'Potassium', direction: 'HIGH', threshold: 6.5, unit: 'mEq/L' },
]

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetChecklistConfig.mockResolvedValue(undefined) // default: use in-memory defaults
})

afterEach(() => {
  document.dir = 'ltr'
})

// ---------------------------------------------------------------------------
// Helper: render and wait for loading indicator to clear
// ---------------------------------------------------------------------------

async function renderChecklist(
  props: Partial<React.ComponentProps<typeof CriticalValueChecklist>> = {},
) {
  const onRelease = vi.fn()
  const onCancel = vi.fn()
  const merged = {
    resultId: 'result-uuid-001',
    criticalValues,
    onRelease,
    onCancel,
    ...props,
  }

  const { container } = render(<CriticalValueChecklist {...merged} />)

  // Wait for loading to complete: the first required item must appear
  await waitFor(
    () => screen.getByTestId('checklist-item-qc-passed-today'),
    { timeout: 4000 },
  )
  return { container, onRelease, onCancel }
}

// ---------------------------------------------------------------------------
// Auto-verification tests (8.5 – 8.7)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — auto-verification', () => {
  it('8.5 auto-checks QC item when qcPassedToday=true', async () => {
    await renderChecklist({ autoVerify: { qcPassedToday: true } })

    const qcItem = screen.getByTestId('checklist-item-qc-passed-today')
    const checkbox = qcItem.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(screen.getByTestId('auto-verified-badge-qc-passed-today')).toBeInTheDocument()
  })

  it('8.6 auto-checks patient ID item when patientIdVerified=true', async () => {
    await renderChecklist({ autoVerify: { patientIdVerified: true } })

    const item = screen.getByTestId('checklist-item-patient-id-verified')
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(screen.getByTestId('auto-verified-badge-patient-id-verified')).toBeInTheDocument()
  })

  it('8.7 auto-checks plausibility item when plausibilityOk=true', async () => {
    await renderChecklist({ autoVerify: { plausibilityOk: true } })

    const item = screen.getByTestId('checklist-item-result-plausibility')
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(screen.getByTestId('auto-verified-badge-result-plausibility')).toBeInTheDocument()
  })

  it('auto-checks delta-check item when deltaCheckRan=true', async () => {
    await renderChecklist({ autoVerify: { deltaCheckRan: true } })

    const item = screen.getByTestId('checklist-item-delta-check-reviewed')
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(screen.getByTestId('auto-verified-badge-delta-check-reviewed')).toBeInTheDocument()
  })

  it('marks delta-check as N/A when deltaCheckRan=null (no prior result)', async () => {
    await renderChecklist({ autoVerify: { deltaCheckRan: null } })

    const item = screen.getByTestId('checklist-item-delta-check-reviewed')
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true) // N/A counts as checked
    expect(screen.getByTestId('na-badge-delta-check-reviewed')).toBeInTheDocument()
  })

  it('repeat-testing item is NEVER auto-checked regardless of autoVerify props', async () => {
    await renderChecklist({
      autoVerify: {
        qcPassedToday: true,
        patientIdVerified: true,
        plausibilityOk: true,
        deltaCheckRan: true,
      },
    })

    const item = screen.getByTestId('checklist-item-repeat-testing')
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(screen.queryByTestId('auto-verified-badge-repeat-testing')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Release button gate (8.8)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — release button gate', () => {
  it('8.8 Release button is disabled until all required items are checked', async () => {
    await renderChecklist()

    const releaseBtn = screen.getByTestId('checklist-release-button')
    expect(releaseBtn).toBeDisabled()

    // Check each required item one by one
    fireEvent.click(screen.getByTestId('checklist-item-qc-passed-today').querySelector('input')!)
    expect(releaseBtn).toBeDisabled()

    fireEvent.click(screen.getByTestId('checklist-item-patient-id-verified').querySelector('input')!)
    expect(releaseBtn).toBeDisabled()

    fireEvent.click(screen.getByTestId('checklist-item-result-plausibility').querySelector('input')!)
    expect(releaseBtn).toBeDisabled()

    // Final required item — after this all required items are checked
    fireEvent.click(screen.getByTestId('checklist-item-delta-check-reviewed').querySelector('input')!)

    await waitFor(() => {
      expect(releaseBtn).not.toBeDisabled()
    })
  })

  it('optional repeat-testing does not need to be checked for release', async () => {
    await renderChecklist({
      autoVerify: {
        qcPassedToday: true,
        patientIdVerified: true,
        plausibilityOk: true,
        deltaCheckRan: true,
      },
    })

    // All required items auto-checked; repeat-testing (optional) still unchecked
    const releaseBtn = screen.getByTestId('checklist-release-button')
    await waitFor(() => {
      expect(releaseBtn).not.toBeDisabled()
    })
  })
})

// ---------------------------------------------------------------------------
// CompletedChecklist structure (8.9, 8.11)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — completed checklist structure', () => {
  it('8.9 onRelease called with correctly structured CompletedChecklist', async () => {
    const { onRelease } = await renderChecklist({
      autoVerify: {
        qcPassedToday: true,
        patientIdVerified: true,
        plausibilityOk: true,
        deltaCheckRan: true,
      },
    })

    const releaseBtn = screen.getByTestId('checklist-release-button')
    await waitFor(() => expect(releaseBtn).not.toBeDisabled())
    fireEvent.click(releaseBtn)

    expect(onRelease).toHaveBeenCalledOnce()
    const checklist: CompletedChecklist = onRelease.mock.calls[0][0]

    expect(checklist).toMatchObject({
      resultId: 'result-uuid-001',
      completedBy: 'prac-supervisor-003',
      hlcTimestamp: '2026-05-31T00:00:00.000Z-0-test-node',
      syncStatus: 'local',
    })
    expect(typeof checklist.id).toBe('string')
    expect(checklist.id.length).toBeGreaterThan(0)
    expect(Array.isArray(checklist.items)).toBe(true)
    expect(checklist.items.length).toBeGreaterThan(0)
  })

  it('8.11 checklist items do NOT contain actual numeric result values', async () => {
    const { onRelease } = await renderChecklist({
      autoVerify: {
        qcPassedToday: true,
        patientIdVerified: true,
        plausibilityOk: true,
        deltaCheckRan: true,
      },
    })

    const releaseBtn = screen.getByTestId('checklist-release-button')
    await waitFor(() => expect(releaseBtn).not.toBeDisabled())
    fireEvent.click(releaseBtn)

    const checklist: CompletedChecklist = onRelease.mock.calls[0][0]

    for (const item of checklist.items) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.label).toBe('string')
      expect(typeof item.isRequired).toBe('boolean')
      expect(typeof item.isChecked).toBe('boolean')
      // No PHI or numeric result value fields
      expect('value' in item).toBe(false)
      expect('numericResult' in item).toBe(false)
      expect('patientId' in item).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Custom config items (8.12)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — custom config items', () => {
  it('8.12 custom checklist items from lab config appear in the checklist', async () => {
    const labConfig: ChecklistConfig = {
      id: 'config',
      labId: 'lab-001',
      items: [
        ...DEFAULT_CHECKLIST_CONFIG_ITEMS,
        {
          id: 'custom-reagent-check',
          label: 'Verify reagent lot number',
          isRequired: true,
          isDefault: false,
          order: 6,
        },
      ],
      updatedAt: '2026-01-15T00:00:00.000Z',
      updatedBy: 'lab-manager-001',
    }
    mockGetChecklistConfig.mockResolvedValue(labConfig)

    await renderChecklist()

    expect(screen.getByTestId('checklist-item-custom-reagent-check')).toBeInTheDocument()
    expect(screen.getByText('Verify reagent lot number')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Full render / state test (8.13)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — full render', () => {
  it('8.13 renders all 5 default checklist items with no auto-check states when autoVerify is empty', async () => {
    await renderChecklist()

    expect(screen.getByTestId('checklist-item-qc-passed-today')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-patient-id-verified')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-result-plausibility')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-delta-check-reviewed')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-repeat-testing')).toBeInTheDocument()
    expect(screen.queryAllByText('Auto-verified')).toHaveLength(0)
  })

  it('renders critical value badge for each detected critical value', async () => {
    await renderChecklist()

    expect(screen.getByTestId('critical-badge-Potassium')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Cancel button (8.14)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — cancel button', () => {
  it('8.14 Cancel button calls onCancel without invoking onRelease', async () => {
    const { onCancel, onRelease } = await renderChecklist()

    fireEvent.click(screen.getByTestId('checklist-cancel-button'))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onRelease).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// RTL snapshot test (8.15)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — RTL snapshots', () => {
  it('8.15a renders in LTR', async () => {
    document.dir = 'ltr'
    const { container } = await renderChecklist({ autoVerify: { qcPassedToday: true } })
    expect(container).toMatchSnapshot()
  })

  it('8.15b renders in RTL', async () => {
    document.dir = 'rtl'
    const { container } = await renderChecklist({ autoVerify: { qcPassedToday: true } })
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Offline / graceful degrade test (8.16)
// ---------------------------------------------------------------------------

describe('CriticalValueChecklist — offline', () => {
  it('8.16 degrades gracefully to defaults when getChecklistConfig throws', async () => {
    mockGetChecklistConfig.mockRejectedValue(new Error('IndexedDB unavailable'))

    await renderChecklist()

    // All 5 default items must still appear
    expect(screen.getByTestId('checklist-item-qc-passed-today')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-patient-id-verified')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-result-plausibility')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-delta-check-reviewed')).toBeInTheDocument()
    expect(screen.getByTestId('checklist-item-repeat-testing')).toBeInTheDocument()
  })
})
