import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db, type SyncQueueEntry } from '../lib/db'
import {
  resolveConflict,
  isTier1Resource,
  isConflictOverdue,
  getTier1Conflicts,
} from '../lib/conflict-resolution'
import { hasUnresolvedTier1Conflicts } from '../lib/conflict-check'
import { ConflictList } from '../components/conflicts/ConflictList'
import { ConflictDiffView } from '../components/conflicts/ConflictDiffView'

// Mock audit module
vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: {
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE_REQUEST: 'DELETE_REQUEST',
  },
  AuditResourceType: {},
}))

// Mock auth session store
vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        session: {
          practitionerId: 'practitioner-test-123',
          userId: 'user-test-123',
          role: 'physician',
        },
        isAuthenticated: true,
      }),
    {
      getState: () => ({
        session: {
          practitionerId: 'practitioner-test-123',
          userId: 'user-test-123',
          role: 'physician',
        },
        isAuthenticated: true,
      }),
    },
  ),
}))

function makeConflictEntry(
  overrides: Partial<SyncQueueEntry> = {},
): SyncQueueEntry {
  return {
    id: `conflict-${Math.random().toString(36).slice(2, 8)}`,
    resourceType: 'AllergyIntolerance',
    resourceId: 'allergy-abc12345',
    action: 'allergyIntolerance:create',
    payload: JSON.stringify({
      id: 'allergy-abc12345',
      resourceType: 'AllergyIntolerance',
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: { text: 'Penicillin' },
      criticality: 'high',
      patient: { reference: 'Patient/patient-001' },
    }),
    conflictData: JSON.stringify({
      id: 'allergy-abc12345-remote',
      resourceType: 'AllergyIntolerance',
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: { text: 'Amoxicillin' },
      criticality: 'high',
      patient: { reference: 'Patient/patient-001' },
    }),
    status: 'failed',
    conflictFlag: true,
    hlcTimestamp: '000001700000000:00000:node-1',
    createdAt: new Date(Date.now() - 300_000).toISOString(),
    retryCount: 0,
    patientRef: 'Patient/patient-001',
    ...overrides,
  }
}

async function seedQueue(entries: SyncQueueEntry[]) {
  await db.syncQueue.clear()
  await db.syncQueue.bulkPut(entries)
}

// =====================================================
// Unit Tests: conflict-resolution.ts
// =====================================================

describe('conflict-resolution utilities', () => {
  it('isTier1Resource identifies Tier 1 types correctly', () => {
    expect(isTier1Resource('AllergyIntolerance')).toBe(true)
    expect(isTier1Resource('MedicationRequest')).toBe(true)
    expect(isTier1Resource('Condition')).toBe(true)
    expect(isTier1Resource('Encounter')).toBe(false)
    expect(isTier1Resource('Patient')).toBe(false)
  })

  it('isConflictOverdue returns true for conflicts older than 24 hours', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    expect(isConflictOverdue(old)).toBe(true)

    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    expect(isConflictOverdue(recent)).toBe(false)
  })
})

// =====================================================
// Unit Tests: getTier1Conflicts
// =====================================================

describe('getTier1Conflicts', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
  })

  afterEach(async () => {
    await db.syncQueue.clear()
  })

  it('returns only Tier 1 conflicts that are unresolved', async () => {
    await seedQueue([
      makeConflictEntry({
        id: 'c1',
        resourceType: 'AllergyIntolerance',
        conflictFlag: true,
        status: 'failed',
      }),
      makeConflictEntry({
        id: 'c2',
        resourceType: 'Encounter',
        conflictFlag: true,
        status: 'failed',
      }),
      makeConflictEntry({
        id: 'c3',
        resourceType: 'MedicationRequest',
        conflictFlag: true,
        status: 'resolved',
      }),
    ])

    const conflicts = await getTier1Conflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].id).toBe('c1')
  })
})

// =====================================================
// Unit Tests: resolveConflict
// =====================================================

describe('resolveConflict', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
    await db.allergyIntolerances.clear()
    await db.medications.clear()
    await db.conditions.clear()
  })

  afterEach(async () => {
    await db.syncQueue.clear()
    await db.allergyIntolerances.clear()
    await db.medications.clear()
    await db.conditions.clear()
  })

  it('resolves with keep-both — updates syncQueue, appends remote to clinical table, emits audit', async () => {
    const { auditPhiAccess } = await import('../lib/audit')
    const entry = makeConflictEntry({ id: 'resolve-1' })
    await db.syncQueue.put(entry)

    // Put the local version in the clinical table
    await db.allergyIntolerances.put({
      id: 'allergy-abc12345',
      resourceType: 'AllergyIntolerance',
      code: { text: 'Penicillin' },
    } as never)

    const result = await resolveConflict({
      entryId: 'resolve-1',
      resolutionType: 'keep-both',
      practitionerRef: 'practitioner-test-123',
    })

    expect(result.success).toBe(true)
    expect(result.resolutionType).toBe('keep-both')

    // Verify syncQueue entry is now resolved
    const updated = await db.syncQueue.get('resolve-1')
    expect(updated?.status).toBe('resolved')
    expect(updated?.conflictFlag).toBe(false)
    expect(updated?.resolutionType).toBe('keep-both')
    expect(updated?.resolvedAt).toBeTruthy()

    // Verify remote version was appended to clinical table (append-only)
    const allAllergies = await db.allergyIntolerances.toArray()
    expect(allAllergies).toHaveLength(2)
    // Original local version preserved
    const local = allAllergies.find((a) => a.id === 'allergy-abc12345')
    expect(local).toBeTruthy()
    expect((local as Record<string, unknown>).code).toEqual({ text: 'Penicillin' })
    // Remote version appended with new ID
    const remote = allAllergies.find((a) => a.id !== 'allergy-abc12345')
    expect(remote).toBeTruthy()
    expect((remote as Record<string, unknown>).code).toEqual({ text: 'Amoxicillin' })

    // Verify audit event was emitted
    expect(auditPhiAccess).toHaveBeenCalledWith(
      'UPDATE',
      'AllergyIntolerance',
      'allergy-abc12345',
      'patient-001',
      expect.objectContaining({
        conflictResolution: 'keep-both',
      }),
    )

    // Verify sync action was enqueued
    const allEntries = await db.syncQueue.toArray()
    const syncActions = allEntries.filter(
      (e) => e.action === 'sync:conflict_resolved',
    )
    expect(syncActions).toHaveLength(1)
  })

  it('resolves with prefer-local — keeps local version unchanged', async () => {
    const entry = makeConflictEntry({ id: 'resolve-local' })
    await db.syncQueue.put(entry)

    const result = await resolveConflict({
      entryId: 'resolve-local',
      resolutionType: 'prefer-local',
      practitionerRef: 'practitioner-test-123',
    })

    expect(result.success).toBe(true)

    const updated = await db.syncQueue.get('resolve-local')
    expect(updated?.status).toBe('resolved')
    expect(updated?.resolutionType).toBe('prefer-local')
  })

  it('resolves with prefer-remote — replaces local with remote data', async () => {
    const entry = makeConflictEntry({
      id: 'resolve-remote',
      resourceType: 'AllergyIntolerance',
    })
    await db.syncQueue.put(entry)

    // Put the local version in the clinical table
    await db.allergyIntolerances.put({
      id: 'allergy-abc12345',
      resourceType: 'AllergyIntolerance',
      code: { text: 'Penicillin' },
    } as never)

    const result = await resolveConflict({
      entryId: 'resolve-remote',
      resolutionType: 'prefer-remote',
      practitionerRef: 'practitioner-test-123',
    })

    expect(result.success).toBe(true)

    // The clinical table should now have the remote version
    const allergy = await db.allergyIntolerances.get('allergy-abc12345')
    expect(allergy).toBeTruthy()
    // Remote version had "Amoxicillin"
    expect((allergy as Record<string, unknown>).code).toEqual({
      text: 'Amoxicillin',
    })
  })

  it('returns failure for non-existent entry', async () => {
    const result = await resolveConflict({
      entryId: 'does-not-exist',
      resolutionType: 'keep-both',
      practitionerRef: 'practitioner-test-123',
    })

    expect(result.success).toBe(false)
  })

  it('returns failure for already-resolved conflict', async () => {
    const entry = makeConflictEntry({
      id: 'already-resolved',
      status: 'resolved',
      conflictFlag: false,
    })
    await db.syncQueue.put(entry)

    const result = await resolveConflict({
      entryId: 'already-resolved',
      resolutionType: 'keep-both',
      practitionerRef: 'practitioner-test-123',
    })

    expect(result.success).toBe(false)
  })
})

// =====================================================
// Unit Tests: conflict-check.ts (prescription blocking)
// =====================================================

describe('hasUnresolvedTier1Conflicts', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
  })

  afterEach(async () => {
    await db.syncQueue.clear()
  })

  it('returns true when patient has unresolved Tier 1 conflicts', async () => {
    await seedQueue([
      makeConflictEntry({
        id: 'block-1',
        resourceType: 'AllergyIntolerance',
        conflictFlag: true,
        status: 'failed',
        patientRef: 'Patient/patient-block',
      }),
    ])

    const result = await hasUnresolvedTier1Conflicts('patient-block')
    expect(result).toBe(true)
  })

  it('returns false when no conflicts exist for patient', async () => {
    const result = await hasUnresolvedTier1Conflicts('patient-clean')
    expect(result).toBe(false)
  })

  it('returns false when conflicts are resolved', async () => {
    await seedQueue([
      makeConflictEntry({
        id: 'resolved-1',
        resourceType: 'AllergyIntolerance',
        conflictFlag: true,
        status: 'resolved',
        patientRef: 'Patient/patient-resolved',
      }),
    ])

    const result = await hasUnresolvedTier1Conflicts('patient-resolved')
    expect(result).toBe(false)
  })

  it('returns false when conflicts are non-Tier 1 resources', async () => {
    await seedQueue([
      makeConflictEntry({
        id: 'tier2-1',
        resourceType: 'Encounter',
        conflictFlag: true,
        status: 'failed',
        patientRef: 'Patient/patient-tier2',
      }),
    ])

    const result = await hasUnresolvedTier1Conflicts('patient-tier2')
    expect(result).toBe(false)
  })
})

// =====================================================
// Component Tests: ConflictList
// =====================================================

describe('ConflictList', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
  })

  afterEach(async () => {
    await db.syncQueue.clear()
  })

  it('renders conflicts from syncQueue', async () => {
    await seedQueue([
      makeConflictEntry({
        id: 'list-1',
        resourceType: 'AllergyIntolerance',
        conflictFlag: true,
        status: 'failed',
      }),
      makeConflictEntry({
        id: 'list-2',
        resourceType: 'MedicationRequest',
        conflictFlag: true,
        status: 'failed',
      }),
    ])

    render(<ConflictList />)

    await waitFor(() => {
      expect(screen.getByText('Allergy')).toBeInTheDocument()
      expect(screen.getByText('Medication')).toBeInTheDocument()
    })

    expect(screen.getByText('2 unresolved conflicts')).toBeInTheDocument()
  })

  it('shows "No unresolved conflicts" when queue is empty', async () => {
    render(<ConflictList />)

    await waitFor(() => {
      expect(screen.getByTestId('no-conflicts')).toBeInTheDocument()
    })
  })

  it('shows OVERDUE badge for conflicts older than 24 hours', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

    await seedQueue([
      makeConflictEntry({
        id: 'overdue-1',
        resourceType: 'AllergyIntolerance',
        conflictFlag: true,
        status: 'failed',
        createdAt: oldDate,
      }),
    ])

    render(<ConflictList />)

    await waitFor(() => {
      expect(screen.getByTestId('overdue-badge')).toBeInTheDocument()
      expect(screen.getByText('OVERDUE')).toBeInTheDocument()
    })
  })

  it('does not show OVERDUE badge for recent conflicts', async () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()

    await seedQueue([
      makeConflictEntry({
        id: 'recent-1',
        resourceType: 'AllergyIntolerance',
        conflictFlag: true,
        status: 'failed',
        createdAt: recentDate,
      }),
    ])

    render(<ConflictList />)

    await waitFor(() => {
      expect(screen.getByText('Allergy')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('overdue-badge')).not.toBeInTheDocument()
  })
})

// =====================================================
// Component Tests: ConflictDiffView
// =====================================================

describe('ConflictDiffView', () => {
  beforeEach(async () => {
    await db.syncQueue.clear()
  })

  afterEach(async () => {
    await db.syncQueue.clear()
  })

  it('highlights differences between local and remote versions', async () => {
    const entry = makeConflictEntry({ id: 'diff-1' })
    await db.syncQueue.put(entry)

    const onResolved = vi.fn()
    render(<ConflictDiffView entry={entry} onResolved={onResolved} />)

    expect(screen.getByTestId('diff-grid')).toBeInTheDocument()
    expect(screen.getByText('Local Version')).toBeInTheDocument()
    expect(screen.getByText('Remote Version')).toBeInTheDocument()
  })

  it('"Keep Both" is default and emphasized for Tier 1 resources', () => {
    const entry = makeConflictEntry({
      id: 'tier1-default',
      resourceType: 'AllergyIntolerance',
    })

    const onResolved = vi.fn()
    render(<ConflictDiffView entry={entry} onResolved={onResolved} />)

    const keepBothBtn = screen.getByTestId('resolve-keep-both')
    expect(keepBothBtn).toBeInTheDocument()
    expect(keepBothBtn.textContent).toContain('Recommended')
    expect(keepBothBtn.textContent).toContain('Keep Both')

    // Check green border styling (Tier 1 emphasis)
    expect(keepBothBtn.className).toContain('border-green-500')
  })

  it('shows three resolution options', () => {
    const entry = makeConflictEntry({ id: 'options-1' })

    const onResolved = vi.fn()
    render(<ConflictDiffView entry={entry} onResolved={onResolved} />)

    expect(screen.getByTestId('resolve-keep-both')).toBeInTheDocument()
    expect(screen.getByTestId('resolve-prefer-local')).toBeInTheDocument()
    expect(screen.getByTestId('resolve-prefer-remote')).toBeInTheDocument()
  })

  it('calls onResolved after successful resolution', async () => {
    const entry = makeConflictEntry({ id: 'resolve-cb-1' })
    await db.syncQueue.put(entry)

    const onResolved = vi.fn()
    render(<ConflictDiffView entry={entry} onResolved={onResolved} />)

    fireEvent.click(screen.getByTestId('resolve-keep-both'))

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalled()
    })
  })

  it('shows safety warning for Tier 1 resources', () => {
    const entry = makeConflictEntry({
      id: 'safety-1',
      resourceType: 'AllergyIntolerance',
    })

    const onResolved = vi.fn()
    render(<ConflictDiffView entry={entry} onResolved={onResolved} />)

    expect(
      screen.getByText(/Safety-Critical Resource/),
    ).toBeInTheDocument()
  })

  it('shows message when remote data is missing', () => {
    const entry = makeConflictEntry({
      id: 'no-remote-1',
      conflictData: undefined,
    })

    const onResolved = vi.fn()
    render(<ConflictDiffView entry={entry} onResolved={onResolved} />)

    expect(
      screen.getByText(/Remote version data is not available/),
    ).toBeInTheDocument()
  })
})

// =====================================================
// RTL snapshot tests
// =====================================================

describe('ConflictDiffView RTL layout', () => {
  it('uses CSS Grid with two-column layout that supports RTL', () => {
    const entry = makeConflictEntry({ id: 'rtl-1' })

    const onResolved = vi.fn()
    const { container } = render(
      <div dir="rtl">
        <ConflictDiffView entry={entry} onResolved={onResolved} />
      </div>,
    )

    const grid = container.querySelector('[data-testid="diff-grid"]')
    expect(grid).toBeTruthy()
    // Grid uses grid-cols-[1fr_1fr] which swaps columns in RTL via CSS Grid auto behavior
    expect(grid?.className).toContain('grid-cols-[1fr_1fr]')
    // Verify logical CSS properties are used (ps-/pe- instead of px-)
    expect(grid?.innerHTML).not.toContain('px-')
  })

  it('snapshot: two-column diff view layout (LTR)', () => {
    const entry = makeConflictEntry({
      id: 'snapshot-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const onResolved = vi.fn()
    const { container } = render(
      <ConflictDiffView entry={entry} onResolved={onResolved} />,
    )

    expect(container.firstChild).toMatchSnapshot()
  })

  it('snapshot: two-column diff view layout (RTL)', () => {
    const entry = makeConflictEntry({
      id: 'snapshot-rtl-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const onResolved = vi.fn()
    const { container } = render(
      <div dir="rtl">
        <ConflictDiffView entry={entry} onResolved={onResolved} />
      </div>,
    )

    expect(container.firstChild).toMatchSnapshot()
  })
})
