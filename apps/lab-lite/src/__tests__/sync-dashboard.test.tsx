/**
 * sync-dashboard.test.tsx
 *
 * Tests for the SyncDashboard component's syncQueue integration:
 * - Failed Specimen/DiagnosticReport entries render with i18n labels (no PHI)
 * - Retry resets status to 'pending' in Dexie
 * - Discard removes the entry from Dexie
 * - loadSyncQueueRecords() pure helper filters correctly
 * - Summary counts include syncQueue entries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb } from '../lib/db'
import { useSyncStore } from '../stores/sync-store'
import { loadSyncQueueRecords } from '../components/SyncDashboard'

// ── i18n mock ─────────────────────────────────────────────────────────────────

const syncDashboardMessages: Record<string, string | Record<string, string>> = {
  title: 'Upload Status',
  ariaLabel: 'Upload Dashboard',
  closeAriaLabel: 'Close upload dashboard',
  pending: 'pending',
  failed: 'failed',
  expired: 'expired',
  lastSync: 'Last upload: {time}',
  syncNow: 'Sync Now',
  syncing: 'Syncing...',
  retryAllFailed: 'Retry All Failed',
  allSynced: 'No pending uploads',
  retry: 'Retry',
  confirm: 'Confirm',
  cancel: 'Cancel',
  discard: 'Discard',
  syncingPhase: 'Uploading result files to Hub...',
  syncComplete: 'Upload complete',
  syncFailedRetry: 'Upload failed — will retry',
  noNetworkConnection: 'No network connection',
  statusPending: 'Pending',
  statusFailed: 'Failed',
  statusUploading: 'Uploading',
  statusExpired: 'Expired',
  recordsSectionLabel: 'Records',
  filesSectionLabel: 'Files',
  resourceTypeSpecimen: 'Sample record',
  resourceTypeDiagnosticReport: 'Lab result',
  failure: {
    conflict: 'Conflict detected — needs review',
    networkError: 'Network error — check connectivity',
    encryptionKey: 'Encryption key unavailable — sign in again',
    notPermitted: 'Not permitted',
    prescriberUnknown: 'Prescriber not recognized',
    clinicNotSetUp: 'Lab not set up',
    unsupportedType: 'Unsupported record type',
    duplicateVisit: 'Duplicate entry',
    serverRejected: 'Server rejected the upload',
    noResponse: 'No response from server — will retry',
    serverError: 'Server error — will retry',
    syncFailed: 'Upload failed — will retry',
    unknown: 'Unknown error',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (namespace === 'syncDashboard') {
      const val = syncDashboardMessages[key]
      if (typeof val === 'string') {
        if (params) {
          return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
        }
        return val
      }
      return `syncDashboard.${key}`
    }
    if (namespace === 'syncDashboard.failure') {
      const failures = syncDashboardMessages['failure'] as Record<string, string>
      return failures[key] ?? `failure.${key}`
    }
    return key
  },
  useLocale: () => 'en',
}))

// ── External dependency mocks ─────────────────────────────────────────────────

vi.mock('@/lib/upload-drain-init', () => ({
  triggerUploadDrain: vi.fn(),
}))

vi.mock('@/lib/result-sync', () => ({
  drainResultSyncQueue: vi.fn().mockResolvedValue({ synced: 0, failed: 0 }),
}))

vi.mock('@/lib/specimen-sync', () => ({
  drainSpecimenSyncQueue: vi.fn().mockResolvedValue({ synced: 0, failed: 0 }),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSyncQueueEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `sync-${Math.random().toString(36).slice(2)}`,
    resourceType: 'Specimen' as const,
    resourceId: 'opaque-resource-id',
    status: 'failed' as const,
    // payload intentionally contains PHI-like content to verify it is never rendered
    payload: {
      id: 'specimen-uuid-123',
      subject: { reference: 'Patient/secret-patient-id' },
      note: [{ text: 'PATIENT CONDITION: severe' }],
      _ultranos: { labSampleId: 'LAB-2026-001' },
    },
    createdAt: new Date().toISOString(),
    retryCount: 1,
    // Drains store the classified category (e.g. classifySyncFailure(`HTTP ${res.status}`)),
    // never the raw HTTP status string. Use the actual stored value here.
    failureReason: 'serverRejected',
    ...overrides,
  }
}

async function insertSyncEntry(overrides: Record<string, unknown> = {}) {
  const db = getDb()
  const entry = makeSyncQueueEntry(overrides)
  await db.syncQueue.add(entry)
  return entry
}

async function renderDashboard() {
  // Open the dashboard via store state
  useSyncStore.getState().setDashboardOpen(true)
  const { SyncDashboard } = await import('../components/SyncDashboard')
  return render(<SyncDashboard />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SyncDashboard — syncQueue integration', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    await db.syncQueue.clear()
    useSyncStore.getState().setDashboardOpen(false)
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useSyncStore.getState().setDashboardOpen(false)
  })

  // ── loadSyncQueueRecords pure helper ────────────────────────────────────────

  describe('loadSyncQueueRecords()', () => {
    it('returns failed/pending Specimen and DiagnosticReport entries', async () => {
      await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
      await insertSyncEntry({ resourceType: 'DiagnosticReport', status: 'pending' })
      const records = await loadSyncQueueRecords()
      expect(records).toHaveLength(2)
      expect(records.some((r) => r.resourceType === 'Specimen')).toBe(true)
      expect(records.some((r) => r.resourceType === 'DiagnosticReport')).toBe(true)
    })

    it('excludes synced entries', async () => {
      await insertSyncEntry({ status: 'synced' })
      const records = await loadSyncQueueRecords()
      expect(records).toHaveLength(0)
    })

    it('excludes syncing entries', async () => {
      await insertSyncEntry({ status: 'syncing' })
      const records = await loadSyncQueueRecords()
      expect(records).toHaveLength(0)
    })

    it('excludes unrecognised resourceTypes (no drainer)', async () => {
      await insertSyncEntry({ resourceType: 'Patient', status: 'pending' })
      const records = await loadSyncQueueRecords()
      expect(records).toHaveLength(0)
    })

    it('never exposes payload in the returned records', async () => {
      await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
      const records = await loadSyncQueueRecords()
      expect(records).toHaveLength(1)
      // The returned shape must NOT include the payload field
      expect(records[0]).not.toHaveProperty('payload')
    })
  })

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders failed Specimen entry with "Sample record" label', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Sample record')).toBeDefined()
    })
  })

  it('renders failed DiagnosticReport entry with "Lab result" label', async () => {
    await insertSyncEntry({ resourceType: 'DiagnosticReport', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Lab result')).toBeDefined()
    })
  })

  it('shows the Records section header when syncQueue entries exist', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Records')).toBeDefined()
    })
  })

  it('shows a StatusBadge for a failed syncQueue entry', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      // The word 'Failed' appears in the status badge
      const badges = screen.getAllByText('Failed')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows categorized failure reason for a failed entry', async () => {
    // Drains store the classified category, not the raw HTTP status. Seed 'serverRejected'
    // (what result-sync.ts and specimen-sync.ts actually write) and assert the specific
    // i18n label. With the old double-classification bug, this would render the generic
    // "Upload failed — will retry" (syncFailed) instead of "Server rejected the upload".
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed', failureReason: 'serverRejected' })
    await renderDashboard()

    await waitFor(() => {
      const el = screen.getByTestId('sync-record-failure-reason')
      expect(el).toBeDefined()
      // Must show the specific reason — NOT the generic 'syncFailed' fallback
      expect(el.textContent).toBe('Server rejected the upload')
    })
  })

  it('does NOT render payload contents — no PHI in the DOM', async () => {
    // The payload in makeSyncQueueEntry has PHI-like strings
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.queryByText(/secret-patient-id/i)).toBeNull()
      expect(screen.queryByText(/PATIENT CONDITION/i)).toBeNull()
      expect(screen.queryByText(/LAB-2026-001/i)).toBeNull()
      expect(screen.queryByText(/specimen-uuid-123/i)).toBeNull()
    })
  })

  it('does NOT render the raw resourceId in the DOM', async () => {
    const entry = await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      // resourceId is opaque but still must not be surfaced
      expect(screen.queryByText(String(entry.resourceId))).toBeNull()
    })
  })

  it('shows Retry button for failed syncQueue entries', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('sync-record-retry-btn')).toBeDefined()
    })
  })

  it('shows Discard button for failed syncQueue entries', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('sync-record-discard-btn')).toBeDefined()
    })
  })

  it('does NOT show Retry/Discard buttons for pending syncQueue entries', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'pending' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Sample record')).toBeDefined()
    })

    expect(screen.queryByTestId('sync-record-retry-btn')).toBeNull()
    expect(screen.queryByTestId('sync-record-discard-btn')).toBeNull()
  })

  // ── Retry ────────────────────────────────────────────────────────────────────

  it('Retry resets entry status to pending in Dexie', async () => {
    const entry = await insertSyncEntry({ resourceType: 'Specimen', status: 'failed', failureReason: 'HTTP 422' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('sync-record-retry-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('sync-record-retry-btn'))

    const db = getDb()
    await waitFor(async () => {
      const updated = await db.syncQueue.get(entry.id as string)
      expect(updated?.status).toBe('pending')
    })
  })

  it('Retry clears failureReason in Dexie', async () => {
    const entry = await insertSyncEntry({ resourceType: 'Specimen', status: 'failed', failureReason: 'HTTP 422' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('sync-record-retry-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('sync-record-retry-btn'))

    const db = getDb()
    await waitFor(async () => {
      const updated = await db.syncQueue.get(entry.id as string)
      expect(updated?.failureReason).toBeUndefined()
    })
  })

  // ── Discard ──────────────────────────────────────────────────────────────────

  it('Discard removes the entry from Dexie after confirmation', async () => {
    const entry = await insertSyncEntry({ resourceType: 'Specimen', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('sync-record-discard-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('sync-record-discard-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('sync-record-confirm-discard-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('sync-record-confirm-discard-btn'))

    const db = getDb()
    await waitFor(async () => {
      const gone = await db.syncQueue.get(entry.id as string)
      expect(gone).toBeUndefined()
    })
  })

  // ── Summary counts ────────────────────────────────────────────────────────────

  it('includes syncQueue failed count in the summary "failed" badge', async () => {
    await insertSyncEntry({ resourceType: 'DiagnosticReport', status: 'failed' })
    await renderDashboard()

    await waitFor(() => {
      // The summary span contains both the count and the label as sibling text nodes
      // e.g. <span>1 failed</span> — use a regex on the container's textContent
      const allSpans = document.querySelectorAll('.rounded-md.bg-destructive\\/10')
      const failedBadge = Array.from(allSpans).find((el) =>
        el.textContent?.includes('failed'),
      )
      expect(failedBadge?.textContent?.trim()).toContain('1')
    })
  })

  it('includes syncQueue pending count in the summary "pending" badge', async () => {
    await insertSyncEntry({ resourceType: 'Specimen', status: 'pending' })
    await renderDashboard()

    await waitFor(() => {
      const allSpans = document.querySelectorAll('.rounded-md.bg-warning\\/10')
      const pendingBadge = Array.from(allSpans).find((el) =>
        el.textContent?.includes('pending'),
      )
      expect(pendingBadge?.textContent?.trim()).toContain('1')
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────────

  it('shows allSynced empty state when both queues are empty', async () => {
    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('No pending uploads')).toBeDefined()
    })
  })
})
