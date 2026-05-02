import { describe, it, expect } from 'vitest'
import { resolveConflict, type SyncRecord } from '../conflict-resolver.js'
import type { HlcTimestamp } from '../hlc.js'

/** Helper: create a SyncRecord with sensible defaults. */
function makeSyncRecord(overrides: Partial<SyncRecord> & { hlcTimestamp: HlcTimestamp }): SyncRecord {
  return {
    id: 'rec-1',
    data: {},
    version: '1',
    ...overrides,
  }
}

function hlc(wallMs: number, counter: number, nodeId: string): HlcTimestamp {
  return { wallMs, counter, nodeId }
}

// ─── Tier 1: Safety-Critical (Append-Only) ───────────────────────────

describe('Tier 1 — Safety-Critical (Append-Only)', () => {
  const baseTime = 1_700_000_000_000

  it('AllergyIntolerance: both versions kept, conflict flagged, prescription blocked', () => {
    const local = makeSyncRecord({
      data: { resourceType: 'AllergyIntolerance', substance: 'Penicillin' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { resourceType: 'AllergyIntolerance', substance: 'Amoxicillin' },
      hlcTimestamp: hlc(baseTime + 5000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'AllergyIntolerance')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.kept).toHaveLength(2)
    expect(result.kept).toContain(local)
    expect(result.kept).toContain(remote)
    expect(result.conflictFlag).toBe(true)
    expect(result.blocksPrescription).toBe(true)
    expect(result.winner).toBeUndefined()
  })

  it('active MedicationRequest: append-only with prescription blocking', () => {
    const local = makeSyncRecord({
      data: { status: 'active', medication: 'Metformin' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { status: 'active', medication: 'Metformin 1000mg' },
      hlcTimestamp: hlc(baseTime + 1000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'MedicationRequest')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.kept).toHaveLength(2)
    expect(result.conflictFlag).toBe(true)
    expect(result.blocksPrescription).toBe(true)
  })

  it('active Condition: append-only with prescription blocking', () => {
    const local = makeSyncRecord({
      data: { clinicalStatus: 'active', code: 'Diabetes' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { clinicalStatus: 'active', code: 'Diabetes Type 2' },
      hlcTimestamp: hlc(baseTime + 2000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Condition')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.kept).toHaveLength(2)
    expect(result.conflictFlag).toBe(true)
    expect(result.blocksPrescription).toBe(true)
  })

  it('completed MedicationRequest falls to Tier 2 (not safety-critical)', () => {
    const local = makeSyncRecord({
      data: { status: 'completed', medication: 'Ibuprofen' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { status: 'completed', medication: 'Ibuprofen 400mg' },
      hlcTimestamp: hlc(baseTime + 5000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'MedicationRequest')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.blocksPrescription).toBe(false)
  })

  it('resolved Condition falls to Tier 2', () => {
    const local = makeSyncRecord({
      data: { clinicalStatus: 'resolved', code: 'Flu' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { clinicalStatus: 'resolved', code: 'Flu - recovered' },
      hlcTimestamp: hlc(baseTime + 3000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Condition')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.blocksPrescription).toBe(false)
  })

  it('mixed active/inactive MedicationRequest uses higher safety (Tier 1)', () => {
    const local = makeSyncRecord({
      data: { status: 'active', medication: 'Warfarin' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { status: 'completed', medication: 'Warfarin' },
      hlcTimestamp: hlc(baseTime + 1000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'MedicationRequest')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.conflictFlag).toBe(true)
    expect(result.blocksPrescription).toBe(true)
  })

  it('Condition with FHIR CodeableConcept clinicalStatus', () => {
    const local = makeSyncRecord({
      data: {
        clinicalStatus: {
          coding: [{ system: 'http://hl7.org/fhir/condition-clinical', code: 'active' }],
        },
      },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: {
        clinicalStatus: {
          coding: [{ system: 'http://hl7.org/fhir/condition-clinical', code: 'active' }],
        },
      },
      hlcTimestamp: hlc(baseTime + 1000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Condition')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.blocksPrescription).toBe(true)
  })

  it('Condition with CodeableConcept text-only (no coding array) treated as active', () => {
    const local = makeSyncRecord({
      data: {
        clinicalStatus: { text: 'active' },
      },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: {
        clinicalStatus: { text: 'active' },
      },
      hlcTimestamp: hlc(baseTime + 1000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Condition')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.blocksPrescription).toBe(true)
  })

  it('Condition with missing clinicalStatus errs on side of safety (Tier 1)', () => {
    const local = makeSyncRecord({
      data: { code: 'SomeCondition' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { code: 'SomeCondition' },
      hlcTimestamp: hlc(baseTime + 1000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Condition')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.blocksPrescription).toBe(true)
  })
})

// ─── Tier 2: Clinical (Timestamp-Based) ──────────────────────────────

describe('Tier 2 — Clinical (Timestamp-Based)', () => {
  const baseTime = 1_700_000_000_000

  it('newer HLC wins, both versions kept as addenda, no flag', () => {
    const local = makeSyncRecord({
      data: { note: 'Initial assessment' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { note: 'Updated assessment' },
      hlcTimestamp: hlc(baseTime + 120_000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'ClinicalImpression')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.winner).toBe('remote')
    expect(result.kept).toHaveLength(2)
    expect(result.kept).toContain(local)
    expect(result.kept).toContain(remote)
    expect(result.conflictFlag).toBe(false)
    expect(result.blocksPrescription).toBe(false)
  })

  it('local wins when it has a newer HLC', () => {
    const local = makeSyncRecord({
      data: { value: 120 },
      hlcTimestamp: hlc(baseTime + 200_000, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { value: 118 },
      hlcTimestamp: hlc(baseTime, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Observation')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.winner).toBe('local')
    expect(result.kept).toHaveLength(2)
  })

  it('DiagnosticReport uses timestamp-based resolution', () => {
    const local = makeSyncRecord({
      data: { conclusion: 'Normal' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { conclusion: 'Abnormal' },
      hlcTimestamp: hlc(baseTime + 90_000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'DiagnosticReport')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.winner).toBe('remote')
  })
})

// ─── Tier 3: Operational (Last-Write-Wins) ───────────────────────────

describe('Tier 3 — Operational (Last-Write-Wins)', () => {
  const baseTime = 1_700_000_000_000

  it('newer HLC wins, loser discarded, no flag', () => {
    const local = makeSyncRecord({
      data: { name: 'John Doe', phone: '555-0100' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { name: 'John Doe', phone: '555-0200' },
      hlcTimestamp: hlc(baseTime + 300_000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Patient')

    expect(result.strategy).toBe('LWW')
    expect(result.winner).toBe('remote')
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]).toBe(remote)
    expect(result.conflictFlag).toBe(false)
    expect(result.blocksPrescription).toBe(false)
  })

  it('local wins when newer', () => {
    const local = makeSyncRecord({
      data: { name: 'Jane Doe' },
      hlcTimestamp: hlc(baseTime + 100_000, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { name: 'Jane Smith' },
      hlcTimestamp: hlc(baseTime, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Patient')

    expect(result.strategy).toBe('LWW')
    expect(result.winner).toBe('local')
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]).toBe(local)
  })

  it('unknown resource types default to Tier 3 LWW', () => {
    const local = makeSyncRecord({
      data: { value: 'old' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { value: 'new' },
      hlcTimestamp: hlc(baseTime + 1000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'CustomResource')

    expect(result.strategy).toBe('LWW')
    expect(result.winner).toBe('remote')
    expect(result.kept).toHaveLength(1)
  })
})

// ─── Consent (Append-Only Ledger) ────────────────────────────────────

describe('Consent — Append-Only Ledger', () => {
  const baseTime = 1_700_000_000_000

  it('both versions kept, conflict flagged, prescription NOT blocked', () => {
    const local = makeSyncRecord({
      data: { scope: 'patient-privacy', status: 'active' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { scope: 'patient-privacy', status: 'inactive' },
      hlcTimestamp: hlc(baseTime + 5000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Consent')

    expect(result.strategy).toBe('APPEND_ONLY')
    expect(result.kept).toHaveLength(2)
    expect(result.kept).toContain(local)
    expect(result.kept).toContain(remote)
    expect(result.conflictFlag).toBe(true)
    expect(result.blocksPrescription).toBe(false)
    expect(result.winner).toBeUndefined()
  })
})

// ─── 60-Second Conflict Window ───────────────────────────────────────

describe('60-second conflict window', () => {
  const baseTime = 1_700_000_000_000

  it('Tier 2 within 60s window → conflictFlag true', () => {
    const local = makeSyncRecord({
      data: { note: 'version A' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { note: 'version B' },
      hlcTimestamp: hlc(baseTime + 30_000, 0, 'node-B'), // 30s apart
    })

    const result = resolveConflict(local, remote, 'Observation')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.conflictFlag).toBe(true) // within 60s
  })

  it('Tier 2 outside 60s window → conflictFlag false', () => {
    const local = makeSyncRecord({
      data: { note: 'version A' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { note: 'version B' },
      hlcTimestamp: hlc(baseTime + 120_000, 0, 'node-B'), // 120s apart
    })

    const result = resolveConflict(local, remote, 'Observation')

    expect(result.strategy).toBe('TIMESTAMP_WINS')
    expect(result.conflictFlag).toBe(false) // outside 60s
  })

  it('Tier 3 within 60s window → conflictFlag true', () => {
    const local = makeSyncRecord({
      data: { name: 'A' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { name: 'B' },
      hlcTimestamp: hlc(baseTime + 45_000, 0, 'node-B'), // 45s apart
    })

    const result = resolveConflict(local, remote, 'Patient')

    expect(result.strategy).toBe('LWW')
    expect(result.conflictFlag).toBe(true) // within 60s
  })

  it('exactly 60s apart → within window (inclusive boundary)', () => {
    const local = makeSyncRecord({
      data: {},
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: {},
      hlcTimestamp: hlc(baseTime + 60_000, 0, 'node-B'), // exactly 60s
    })

    const result = resolveConflict(local, remote, 'Observation')

    expect(result.conflictFlag).toBe(true) // boundary is inclusive
  })

  it('61s apart → outside window', () => {
    const local = makeSyncRecord({
      data: {},
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: {},
      hlcTimestamp: hlc(baseTime + 61_000, 0, 'node-B'),
    })

    const result = resolveConflict(local, remote, 'Observation')

    expect(result.conflictFlag).toBe(false)
  })

  it('Tier 1 always flags regardless of window (append-only)', () => {
    const local = makeSyncRecord({
      data: { substance: 'Penicillin' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { substance: 'Penicillin' },
      hlcTimestamp: hlc(baseTime + 500_000, 0, 'node-B'), // 8+ minutes apart
    })

    const result = resolveConflict(local, remote, 'AllergyIntolerance')

    expect(result.conflictFlag).toBe(true) // always flagged for Tier 1
    expect(result.blocksPrescription).toBe(true)
  })
})

// ─── Deterministic Tie-Breaking ──────────────────────────────────────

describe('Deterministic tie-breaking', () => {
  const baseTime = 1_700_000_000_000

  it('identical HLC timestamps → tie-break by nodeId (higher nodeId wins)', () => {
    const local = makeSyncRecord({
      data: { value: 'local-val' },
      hlcTimestamp: hlc(baseTime, 5, 'node-B'), // B > A lexicographically
    })
    const remote = makeSyncRecord({
      data: { value: 'remote-val' },
      hlcTimestamp: hlc(baseTime, 5, 'node-A'),
    })

    const result = resolveConflict(local, remote, 'Patient')

    expect(result.strategy).toBe('LWW')
    expect(result.winner).toBe('local') // node-B > node-A
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]).toBe(local)
  })

  it('same wallMs, different counter → higher counter wins', () => {
    const local = makeSyncRecord({
      data: { value: 'local' },
      hlcTimestamp: hlc(baseTime, 10, 'node-A'),
    })
    const remote = makeSyncRecord({
      data: { value: 'remote' },
      hlcTimestamp: hlc(baseTime, 5, 'node-A'),
    })

    const result = resolveConflict(local, remote, 'Patient')

    expect(result.winner).toBe('local') // counter 10 > 5
  })
})

// ─── No-Conflict Pass-Through ────────────────────────────────────────

describe('Pass-through (no real conflict)', () => {
  const baseTime = 1_700_000_000_000

  it('identical records still produce valid resolution', () => {
    const record = makeSyncRecord({
      data: { value: 'same' },
      hlcTimestamp: hlc(baseTime, 0, 'node-A'),
    })

    // Same record on both sides — still produces a resolution
    const result = resolveConflict(record, record, 'Patient')

    expect(result.strategy).toBe('LWW')
    expect(result.winner).toBe('local') // tie-break: equal nodeId → compareHlc returns 0 → local wins
    expect(result.kept).toHaveLength(1)
    expect(result.conflictFlag).toBe(true) // within 60s (0ms diff)
  })
})
