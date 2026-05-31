/**
 * Tests for Story 42.8: Digital Lab Logbook
 *
 * Covers:
 * - AC 10.1: append succeeds, no update/delete helpers exposed
 * - AC 10.2: sequential numbering — unique, gapless
 * - AC 10.3: auto-population maps all MoPH columns
 * - AC 10.4: duplicate guard prevents double-entry
 * - AC 10.5: amendment creates new entry, original unchanged
 * - AC 10.6: search/filter returns correct subsets
 * - AC 10.8: audit events emitted with correct shapes (no PHI)
 * - AC 10.9: offline — appends and reads work without network
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getDb,
  appendLogbookEntry,
  appendLogbookAmendment,
  getLogbookEntries,
  getLogbookEntryBySeqNo,
  getLogbookEntryById,
  getLogbookEntryByDiagnosticReportId,
  getPendingLogbookSyncEntries,
  markLogbookEntriesSynced,
  upsertSyncedLogbookEntry,
  type LabLogbookEntry,
} from '../lib/db'

import { getNextSequenceNumber, formatDisplayNumber } from '../lib/logbook-sequence'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/audit-client', () => ({
  reportLogbookEvent: vi.fn(),
  reportQueueAuditEvent: vi.fn(),
  reportAuthEvent: vi.fn(),
  reportPaymentEvent: vi.fn(),
  reportWasteEvent: vi.fn(),
  startAuditDrain: vi.fn(),
  stopAuditDrain: vi.fn(),
}))

// enqueueSyncEvent is used by logbook-writer but we don't test it here
// (it writes to syncQueue which also needs a clear before each test)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LabLogbookEntry> = {}): LabLogbookEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    seqNo: 1,
    facilityPrefix: 'TST',
    displayNumber: 'TST-0001',
    date: '2026-05-31',
    patientRef: 'Patient/abc123',
    patientFirstName: 'Ahmad',
    patientAge: 35,
    testType: 'Blood Work — CBC',
    testLoincCode: '58410-2',
    resultSummary: 'WBC 8.2, RBC 4.5',
    technicianId: 'tech-001',
    technicianName: 'Tech One',
    authorizerId: 'auth-001',
    authorizerName: 'Supervisor One',
    authorizationStatus: 'authorized',
    authorizedAt: '2026-05-31T10:00:00Z',
    diagnosticReportId: `dr-${Math.random().toString(36).slice(2)}`,
    entryType: 'original',
    createdAt: '2026-05-31T10:00:00Z',
    syncStatus: 'pending',
    ...overrides,
  }
}

beforeEach(async () => {
  const db = getDb()
  await db.labLogbook.clear()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// AC 10.1: Append-only helpers
// ---------------------------------------------------------------------------

describe('Dexie labLogbook — append-only helpers', () => {
  it('appendLogbookEntry inserts and returns the entry id', async () => {
    const db = getDb()
    const entry = makeEntry({ id: 'entry-ac1-1', seqNo: 1 })
    const returnedId = await appendLogbookEntry(entry)
    expect(returnedId).toBe('entry-ac1-1')

    const stored = await db.labLogbook.get('entry-ac1-1')
    expect(stored).toBeDefined()
    expect(stored!.patientRef).toBe('Patient/abc123')
  })

  it('appendLogbookEntry throws on duplicate id (primary key constraint)', async () => {
    const entry = makeEntry({ id: 'entry-dup' })
    await appendLogbookEntry(entry)
    await expect(appendLogbookEntry(entry)).rejects.toThrow()
  })

  it('no updateLogbookEntry or deleteLogbookEntry exported from db', async () => {
    const dbModule = await import('../lib/db')
    expect((dbModule as Record<string, unknown>).updateLogbookEntry).toBeUndefined()
    expect((dbModule as Record<string, unknown>).deleteLogbookEntry).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// AC 10.2: Sequential numbering
// ---------------------------------------------------------------------------

describe('Sequential numbering', () => {
  it('starts at 1 when table is empty', async () => {
    const seqNo = await getNextSequenceNumber()
    expect(seqNo).toBe(1)
  })

  it('increments with each inserted entry', async () => {
    await appendLogbookEntry(makeEntry({ id: 'seq-1', seqNo: 1 }))
    expect(await getNextSequenceNumber()).toBe(2)
    await appendLogbookEntry(makeEntry({ id: 'seq-2', seqNo: 2 }))
    expect(await getNextSequenceNumber()).toBe(3)
  })

  it('formatDisplayNumber pads to 4 digits', () => {
    expect(formatDisplayNumber('KBL', 1)).toBe('KBL-0001')
    expect(formatDisplayNumber('KBL', 42)).toBe('KBL-0042')
    expect(formatDisplayNumber('KBL', 1000)).toBe('KBL-1000')
  })
})

// ---------------------------------------------------------------------------
// AC 10.3 & 10.4: Auto-population + duplicate guard (via logbook-writer)
// ---------------------------------------------------------------------------

describe('writeAuthorizedResultToLogbook', () => {
  // Re-import after fake-indexeddb is initialized
  async function getWriter() {
    // Reset module state by re-importing
    return import('../lib/logbook-writer').then((m) => m)
  }

  it('creates a logbook entry with all MoPH columns populated', async () => {
    const { writeAuthorizedResultToLogbook } = await getWriter()
    const db = getDb()

    const diagId = `dr-ac3-${Math.random().toString(36).slice(2)}`
    const entryId = await writeAuthorizedResultToLogbook({
      diagnosticReportId: diagId,
      date: '2026-05-31',
      patientRef: 'Patient/abc123',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      testType: 'Blood Work — CBC',
      testLoincCode: '58410-2',
      resultSummary: 'WBC 8.2, RBC 4.5',
      technicianId: 'tech-001',
      technicianName: 'Tech One',
      authorizerId: 'auth-001',
      authorizerName: 'Supervisor One',
      authorizedAt: '2026-05-31T10:00:00Z',
      facilityPrefix: 'TST',
    })

    const entry = await db.labLogbook.get(entryId)
    expect(entry).toBeDefined()
    expect(entry!.seqNo).toBeGreaterThan(0)
    expect(entry!.displayNumber).toMatch(/^TST-\d{4}$/)
    expect(entry!.date).toBe('2026-05-31')
    expect(entry!.patientRef).toBe('Patient/abc123')
    expect(entry!.patientFirstName).toBe('Ahmad')
    expect(entry!.patientAge).toBe(35)
    expect(entry!.testType).toBe('Blood Work — CBC')
    expect(entry!.testLoincCode).toBe('58410-2')
    expect(entry!.resultSummary).toBe('WBC 8.2, RBC 4.5')
    expect(entry!.technicianId).toBe('tech-001')
    expect(entry!.authorizerId).toBe('auth-001')
    expect(entry!.authorizationStatus).toBe('authorized')
    expect(entry!.entryType).toBe('original')
    expect(entry!.syncStatus).toBe('pending')
  })

  it('returns existing entry id when diagnosticReportId already exists (duplicate guard)', async () => {
    const { writeAuthorizedResultToLogbook } = await getWriter()
    const db = getDb()

    const diagId = `dr-dup-guard-${Math.random().toString(36).slice(2)}`
    const input = {
      diagnosticReportId: diagId,
      date: '2026-05-31',
      patientRef: 'Patient/abc123',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      testType: 'HbA1c',
      testLoincCode: '4548-4',
      resultSummary: 'HbA1c 7.2%',
      technicianId: 'tech-001',
      technicianName: 'Tech One',
      authorizerId: 'auth-001',
      authorizerName: 'Supervisor One',
      authorizedAt: '2026-05-31T10:00:00Z',
      facilityPrefix: 'TST',
    }
    const id1 = await writeAuthorizedResultToLogbook(input)
    const id2 = await writeAuthorizedResultToLogbook(input) // second call

    expect(id1).toBe(id2)
    const count = await db.labLogbook.where('diagnosticReportId').equals(diagId).count()
    expect(count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// AC 10.5: Amendment — new entry, original unchanged
// ---------------------------------------------------------------------------

describe('createLogbookAmendment', () => {
  it('creates amendment as new entry; original is unchanged', async () => {
    const { writeAuthorizedResultToLogbook, createLogbookAmendment } = await import('../lib/logbook-writer')
    const db = getDb()

    const diagId = `dr-amend-${Math.random().toString(36).slice(2)}`
    const originalId = await writeAuthorizedResultToLogbook({
      diagnosticReportId: diagId,
      date: '2026-05-31',
      patientRef: 'Patient/abc123',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      testType: 'Blood Work — CBC',
      testLoincCode: '58410-2',
      resultSummary: 'WBC 8.2, RBC 4.5',
      technicianId: 'tech-001',
      technicianName: 'Tech One',
      authorizerId: 'auth-001',
      authorizerName: 'Supervisor One',
      authorizedAt: '2026-05-31T10:00:00Z',
      facilityPrefix: 'TST',
    })

    const original = await db.labLogbook.get(originalId)
    const originalSeqNo = original!.seqNo

    const amendmentId = await createLogbookAmendment({
      originalEntryId: originalId,
      diagnosticReportId: diagId,
      date: '2026-06-01',
      patientRef: 'Patient/abc123',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      testType: 'Blood Work — CBC',
      testLoincCode: '58410-2',
      resultSummary: 'WBC 9.1, RBC 4.8 (corrected)',
      technicianId: 'tech-001',
      technicianName: 'Tech One',
      authorizerId: 'auth-001',
      authorizerName: 'Supervisor One',
      authorizedAt: '2026-06-01T09:00:00Z',
      amendmentReason: 'Transcription error',
      facilityPrefix: 'TST',
    })

    expect(amendmentId).not.toBe(originalId)

    const amendment = await db.labLogbook.get(amendmentId)
    expect(amendment!.entryType).toBe('amendment')
    expect(amendment!.amendmentOf).toBe(originalId)
    expect(amendment!.amendmentReason).toBe('Transcription error')
    expect(amendment!.authorizationStatus).toBe('amended')
    expect(amendment!.seqNo).toBeGreaterThan(originalSeqNo)

    // Original must be unchanged
    const originalAfter = await db.labLogbook.get(originalId)
    expect(originalAfter!.resultSummary).toBe('WBC 8.2, RBC 4.5')
    expect(originalAfter!.authorizationStatus).toBe('authorized')
    expect(originalAfter!.seqNo).toBe(originalSeqNo)
  })
})

// ---------------------------------------------------------------------------
// AC 10.6: Filters return correct subsets
// ---------------------------------------------------------------------------

describe('getLogbookEntries — filters', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.labLogbook.clear()
    await appendLogbookEntry(makeEntry({ id: 'f1', seqNo: 1, date: '2026-05-01', testType: 'HbA1c', patientRef: 'Patient/aaa', technicianId: 'tech-A' }))
    await appendLogbookEntry(makeEntry({ id: 'f2', seqNo: 2, date: '2026-05-15', testType: 'Blood Work — CBC', patientRef: 'Patient/bbb', technicianId: 'tech-B' }))
    await appendLogbookEntry(makeEntry({ id: 'f3', seqNo: 3, date: '2026-06-01', testType: 'HbA1c', patientRef: 'Patient/ccc', technicianId: 'tech-A' }))
  })

  it('returns all entries when no filter applied', async () => {
    const { entries, total } = await getLogbookEntries()
    expect(total).toBe(3)
    expect(entries).toHaveLength(3)
  })

  it('filters by dateFrom', async () => {
    const { entries } = await getLogbookEntries({ dateFrom: '2026-05-15' })
    expect(entries.map((e) => e.id)).toContain('f2')
    expect(entries.map((e) => e.id)).toContain('f3')
    expect(entries.map((e) => e.id)).not.toContain('f1')
  })

  it('filters by dateTo', async () => {
    const { entries } = await getLogbookEntries({ dateTo: '2026-05-15' })
    expect(entries.map((e) => e.id)).toContain('f1')
    expect(entries.map((e) => e.id)).toContain('f2')
    expect(entries.map((e) => e.id)).not.toContain('f3')
  })

  it('filters by testType', async () => {
    const { entries } = await getLogbookEntries({ testType: 'HbA1c' })
    expect(entries).toHaveLength(2)
    expect(entries.every((e) => e.testType === 'HbA1c')).toBe(true)
  })

  it('filters by patientRef (case-insensitive substring)', async () => {
    const { entries } = await getLogbookEntries({ patientRef: 'aaa' })
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('f1')
  })

  it('filters by technicianId', async () => {
    const { entries } = await getLogbookEntries({ technicianId: 'tech-A' })
    expect(entries).toHaveLength(2)
  })

  it('pagination: respects limit and offset', async () => {
    const page1 = await getLogbookEntries(undefined, 0, 2)
    expect(page1.entries).toHaveLength(2)
    expect(page1.total).toBe(3)

    const page2 = await getLogbookEntries(undefined, 2, 2)
    expect(page2.entries).toHaveLength(1)
    expect(page2.entries[0].id).toBe('f3')
  })
})

// ---------------------------------------------------------------------------
// AC 10.8: Audit events — no PHI in metadata
// ---------------------------------------------------------------------------

describe('Audit events — no PHI', () => {
  it('LOGBOOK_ENTRY_CREATED emitted after writeAuthorizedResultToLogbook', async () => {
    const { reportLogbookEvent } = await import('../lib/audit-client')
    const { writeAuthorizedResultToLogbook } = await import('../lib/logbook-writer')

    await writeAuthorizedResultToLogbook({
      diagnosticReportId: `dr-audit-${Math.random().toString(36).slice(2)}`,
      date: '2026-05-31',
      patientRef: 'Patient/abc123',
      patientFirstName: 'Ahmad',
      patientAge: 35,
      testType: 'Blood Work — CBC',
      testLoincCode: '58410-2',
      resultSummary: 'WBC 8.2',
      technicianId: 'tech-001',
      technicianName: 'Tech One',
      authorizerId: 'auth-001',
      authorizerName: 'Supervisor One',
      authorizedAt: '2026-05-31T10:00:00Z',
      facilityPrefix: 'TST',
    })

    const calls = (reportLogbookEvent as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const call = calls[0][0] as Record<string, unknown>
    expect(call.action).toBe('LOGBOOK_ENTRY_CREATED')
    expect(call.entryId).toBeDefined()

    // No PHI in audit event
    expect(call.patientRef).toBeUndefined()
    expect(call.patientFirstName).toBeUndefined()
    expect(call.resultSummary).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// AC 10.9: Offline — Dexie with fake-indexeddb works without network
// ---------------------------------------------------------------------------

describe('Offline operation', () => {
  it('appends and reads entries without network calls', async () => {
    const entry = makeEntry({ id: 'offline-1', seqNo: 1 })
    await appendLogbookEntry(entry)

    const { entries } = await getLogbookEntries()
    expect(entries.some((e) => e.id === 'offline-1')).toBe(true)
  })

  it('upsertSyncedLogbookEntry is idempotent', async () => {
    const db = getDb()
    const entry = makeEntry({ id: 'sync-1', seqNo: 1 })
    await upsertSyncedLogbookEntry(entry)
    await upsertSyncedLogbookEntry(entry) // second call is no-op

    const count = await db.labLogbook.where('id').equals('sync-1').count()
    expect(count).toBe(1)
  })

  it('getPendingLogbookSyncEntries returns only pending entries', async () => {
    await appendLogbookEntry(makeEntry({ id: 'sync-pending', seqNo: 1, syncStatus: 'pending' }))
    await appendLogbookEntry(makeEntry({ id: 'sync-synced', seqNo: 2, syncStatus: 'synced' }))

    const pending = await getPendingLogbookSyncEntries()
    expect(pending.map((e) => e.id)).toContain('sync-pending')
    expect(pending.map((e) => e.id)).not.toContain('sync-synced')
  })

  it('markLogbookEntriesSynced updates syncStatus to synced', async () => {
    const db = getDb()
    await appendLogbookEntry(makeEntry({ id: 'mark-1', seqNo: 1, syncStatus: 'pending' }))
    await markLogbookEntriesSynced(['mark-1'])

    const entry = await db.labLogbook.get('mark-1')
    expect(entry!.syncStatus).toBe('synced')
  })
})
