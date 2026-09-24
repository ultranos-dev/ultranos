/**
 * failed-sync-panel.test.tsx — Story 60.4 (Task 1 / AC 1, 2).
 *
 * The FailedSyncPanel is the persistent visibility surface for dead-lettered
 * results, failed uploads, and failed order-acks. Tests:
 *  - compact badge renders ONLY when failures exist (worklist badge behavior)
 *  - full panel lists a dead-lettered order-ack + a failed structured record and
 *    offers Retry
 *  - retry resets the Dexie state and triggers the drains
 *  - PHI-safe: no payload / patient data leaks into the rendered rows
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, enqueueOrderAck, recordOrderAckFailure } from '../lib/db'

// ── i18n mock: flat lookup for both failedSync and syncDashboard.failure ──────
const failedSyncMessages: Record<string, string> = {
  title: 'Sync failures',
  badge: '{count} sync failure',
  badgePlural: '{count} sync failures',
  empty: 'No failed syncs',
  resultLabel: 'Lab result',
  specimenLabel: 'Sample record',
  orderAckLabel: 'Order acknowledgement',
  fileLabel: 'Result file',
  reference: 'Ref {ref}',
  retryCount: '{count} attempts',
  retry: 'Retry',
  retryAll: 'Retry all',
  details: 'Details',
  hideDetails: 'Hide details',
  deadLettered: 'Permanently failed — needs attention',
  sectionRecords: 'Structured records',
  sectionOrderAcks: 'Order acknowledgements',
  sectionFiles: 'Result files',
}
const failureMessages: Record<string, string> = {
  serverRejected: 'Server rejected the upload',
  notPermitted: 'Not permitted',
  syncFailed: 'Upload failed — will retry',
  unknown: 'Unknown error',
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    const table = namespace === 'failedSync' ? failedSyncMessages : failureMessages
    const val = table[key] ?? key
    return params ? val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : val
  },
}))

vi.mock('../lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } }),
}))

const drainResult = vi.fn().mockResolvedValue({ synced: 0, failed: 0 })
const drainSpecimen = vi.fn().mockResolvedValue({ synced: 0, failed: 0 })
const drainAck = vi.fn().mockResolvedValue({ acked: 0, failed: 0 })
const triggerUpload = vi.fn()
vi.mock('../lib/result-sync', () => ({ drainResultSyncQueue: (...a: unknown[]) => drainResult(...a) }))
vi.mock('../lib/specimen-sync', () => ({ drainSpecimenSyncQueue: (...a: unknown[]) => drainSpecimen(...a) }))
vi.mock('../lib/order-ack-sync', () => ({ drainOrderAckQueue: (...a: unknown[]) => drainAck(...a) }))
vi.mock('../lib/upload-drain-init', () => ({ triggerUploadDrain: (...a: unknown[]) => triggerUpload(...a) }))

const { FailedSyncPanel } = await import('../components/sync/FailedSyncPanel')

async function clearAll() {
  const db = getDb()
  await db.orderAckQueue.clear()
  await db.syncQueue.clear()
  await db.uploadQueue.clear()
}

beforeEach(async () => {
  vi.clearAllMocks()
  await clearAll()
})
afterEach(() => cleanup())

describe('FailedSyncPanel — compact worklist badge', () => {
  it('renders nothing when there are no failures', async () => {
    const { container } = render(<FailedSyncPanel compact />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="failed-sync-badge"]')).toBeNull()
    })
  })

  it('renders a badge when a dead-lettered order-ack exists', async () => {
    await enqueueOrderAck('order-xyz12345')
    await recordOrderAckFailure('order-xyz12345', 'serverRejected', true)

    render(<FailedSyncPanel compact />)

    await waitFor(() => {
      expect(screen.getByTestId('failed-sync-badge')).toBeTruthy()
    })
    expect(screen.getByText('1 sync failure')).toBeTruthy()
  })
})

describe('FailedSyncPanel — full panel', () => {
  it('lists a dead-lettered order-ack and a failed structured record, PHI-free', async () => {
    const db = getDb()
    await enqueueOrderAck('order-abcd6789')
    await recordOrderAckFailure('order-abcd6789', 'notPermitted', true)
    await db.syncQueue.put({
      id: 'DiagnosticReport-rep-000111222-1',
      resourceType: 'DiagnosticReport',
      resourceId: 'rep-000111222',
      // PHI-shaped payload must NEVER be rendered.
      payload: { patientName: 'Jane Doe', diagnosis: 'Diabetes' },
      status: 'failed',
      failureReason: 'serverRejected',
      createdAt: new Date().toISOString(),
      retryCount: 3,
      hlcTimestamp: 'hlc',
    })

    render(<FailedSyncPanel />)

    // Wait for the async load() to surface the rows (not just the panel shell).
    await waitFor(() => expect(screen.getByTestId('failed-sync-ack')).toBeTruthy())
    // Order-ack row present, referenced by opaque short ref (last 8 of orderId).
    expect(screen.getByText(/Ref abcd6789/)).toBeTruthy()
    // Structured record present, labelled generically (Lab result), no PHI.
    expect(screen.getByTestId('failed-sync-record')).toBeTruthy()
    expect(screen.queryByText(/Jane Doe/)).toBeNull()
    expect(screen.queryByText(/Diabetes/)).toBeNull()
  })

  it('retry-all resets Dexie state and triggers the drains', async () => {
    const db = getDb()
    await enqueueOrderAck('order-retry999')
    await recordOrderAckFailure('order-retry999', 'serverRejected', true)

    render(<FailedSyncPanel />)
    await waitFor(() => expect(screen.getByTestId('failed-sync-retry-all')).toBeTruthy())

    fireEvent.click(screen.getByTestId('failed-sync-retry-all'))

    await waitFor(() => {
      expect(drainAck).toHaveBeenCalled()
    })
    // The dead-lettered ack was reset back to pending for retry.
    const entry = await db.orderAckQueue.get('order-retry999')
    expect(entry?.status).toBe('pending')
  })
})
