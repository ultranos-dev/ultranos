import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression: applying a pulled Patient must not crash when the LOCAL record has
// an `_ultranos` block with no `hlcTimestamp` (patients are Tier-3 / LWW, not
// HLC-versioned). Previously `deserializeHlc(undefined)` → `undefined.split(':')`
// threw, the Patient failed to apply, and it surfaced as a misleading
// "Couldn't reach the Hub" banner.

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

const patientsGet = vi.fn()
const patientsPut = vi.fn().mockResolvedValue(undefined)
const syncMetaGet = vi.fn().mockResolvedValue({ patientId: PID, lastPulledHlc: '0', lastPulledAt: '' })
const syncMetaPut = vi.fn().mockResolvedValue(undefined)
const syncQueuePut = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db', () => ({
  db: {
    syncMeta: { get: (...a: unknown[]) => syncMetaGet(...a), put: (...a: unknown[]) => syncMetaPut(...a) },
    patients: { get: (...a: unknown[]) => patientsGet(...a), put: (...a: unknown[]) => patientsPut(...a) },
    syncQueue: { put: (...a: unknown[]) => syncQueuePut(...a) },
  },
}))
vi.mock('@/lib/hlc', () => ({ hlc: { receive: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ' },
}))
vi.mock('@/lib/hub-url', () => ({ getHubTrpcUrl: () => 'http://hub.test/api/trpc' }))
// Keep deserializeHlc/compareHlc REAL (they are what crashed) — only stub resolveConflict.
vi.mock('@ultranos/sync-engine', async (importActual) => ({
  ...(await importActual<typeof import('@ultranos/sync-engine')>()),
  resolveConflict: () => ({ strategy: 'LWW', winner: 'remote', conflictFlag: false, kept: [] }),
}))

import { pullPatientChanges } from '@/lib/sync-pull'

describe('pullPatientChanges — HLC guard on apply', () => {
  beforeEach(() => vi.clearAllMocks())

  it('applies a pulled Patient without crashing when the local record has no hlcTimestamp', async () => {
    // Local patient exists, has _ultranos, but NO hlcTimestamp (the crash trigger).
    patientsGet.mockResolvedValue({
      id: PID,
      resourceType: 'Patient',
      _ultranos: { nameLocal: 'Local', isActive: true }, // note: no hlcTimestamp
      meta: { lastUpdated: '2026-05-01T00:00:00Z', versionId: '1' },
    })

    // Hub returns a Patient change whose hlcTimestamp is an ISO string (as the
    // patients table actually stores), not a real HLC.
    const changes = [{
      resourceType: 'Patient',
      resourceId: PID,
      data: { id: PID, _ultranos: { nameLocal: 'Remote' }, meta: { lastUpdated: '2026-05-24T17:18:38Z' } },
      hlcTimestamp: '2026-05-24T17:18:38.872337Z',
    }]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: { json: { changes } } } }),
    }) as unknown as typeof fetch

    const result = await pullPatientChanges(PID, () => 'TESTTOKEN')

    // No crash, the remote demographics were applied (Hub-authoritative LWW)…
    expect(result.errors).toEqual([])
    expect(patientsPut).toHaveBeenCalled()
    // …and — the reported symptom — NO spurious Demographics conflict was raised.
    expect(result.conflictsDetected).toBe(0)
    expect(syncQueuePut).not.toHaveBeenCalled()
  })
})
