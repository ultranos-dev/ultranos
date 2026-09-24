/**
 * Story 58.3 (H-LAB-2, AC #2) — PHI-cleanup completeness guard.
 *
 * Enumerates every Dexie table on the REAL LabLiteDatabase and asserts each one
 * is classified in EXACTLY ONE of:
 *   - PHI_TABLES               (cleared on logout)
 *   - DOCUMENTED_RETENTION_TABLES (deliberately retained, with a rationale comment)
 *   - PRESERVE_TABLES          (durability: syncQueue / audit / key cache)
 *   - NON_PHI_TABLES           (operational / reference / config)
 *
 * This is the compile-time-style guard the story asks for: when a developer adds
 * a new Dexie table WITHOUT deciding whether it holds PHI, this test fails,
 * forcing an explicit cleanup decision. It is the lab-lite analogue of the
 * existing sync-queue compile-time guard in phi-cleanup.ts.
 */
import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb } from '@/lib/db'
import {
  PHI_TABLES,
  DOCUMENTED_RETENTION_TABLES,
  PRESERVE_TABLES,
  NON_PHI_TABLES,
} from '@/lib/phi-cleanup'

function actualTableNames(): string[] {
  const db = getDb()
  // Dexie exposes every registered table via `db.tables`.
  return db.tables.map((t) => t.name).sort()
}

describe('phi-cleanup completeness guard (lab-lite)', () => {
  it('classifies every Dexie table exactly once', () => {
    const classified = new Map<string, string[]>()
    const record = (name: string, list: string) => {
      const existing = classified.get(name) ?? []
      existing.push(list)
      classified.set(name, existing)
    }
    for (const n of PHI_TABLES) record(n, 'PHI_TABLES')
    for (const n of DOCUMENTED_RETENTION_TABLES) record(n, 'DOCUMENTED_RETENTION_TABLES')
    for (const n of PRESERVE_TABLES) record(n, 'PRESERVE_TABLES')
    for (const n of NON_PHI_TABLES) record(n, 'NON_PHI_TABLES')

    // No table may be classified in more than one list.
    const duplicated = [...classified.entries()].filter(([, lists]) => lists.length > 1)
    expect(
      duplicated,
      `Tables classified in multiple lists: ${JSON.stringify(duplicated)}`,
    ).toEqual([])

    const known = new Set(classified.keys())
    const actual = actualTableNames()

    // Every real Dexie table must be classified.
    const unclassified = actual.filter((n) => !known.has(n))
    expect(
      unclassified,
      `Unclassified Dexie tables (add each to PHI_TABLES, DOCUMENTED_RETENTION_TABLES, ` +
        `PRESERVE_TABLES, or NON_PHI_TABLES with a rationale): ${JSON.stringify(unclassified)}`,
    ).toEqual([])

    // Every classified name must correspond to a real table (catch typos / stale entries).
    const actualSet = new Set(actual)
    const stale = [...known].filter((n) => !actualSet.has(n))
    expect(
      stale,
      `Classified names that are not real Dexie tables (typo or removed table): ${JSON.stringify(stale)}`,
    ).toEqual([])
  })

  it('never classifies syncQueue as PHI (must survive for drain)', () => {
    expect(PHI_TABLES as readonly string[]).not.toContain('syncQueue')
    expect(DOCUMENTED_RETENTION_TABLES as readonly string[]).not.toContain('syncQueue')
    expect(NON_PHI_TABLES as readonly string[]).not.toContain('syncQueue')
    expect(PRESERVE_TABLES as readonly string[]).toContain('syncQueue')
  })

  it('retains incident_reports with a documented rationale (append-only safety record)', () => {
    expect(DOCUMENTED_RETENTION_TABLES as readonly string[]).toContain('incident_reports')
    expect(PHI_TABLES as readonly string[]).not.toContain('incident_reports')
  })

  it('clears the Story 58.3 (H-LAB-2) previously-omitted patient-linked tables', () => {
    for (const t of ['patients', 'escalation_chains', 'resultSnapshots', 'custody_events', 'distributionQueue']) {
      expect(PHI_TABLES as readonly string[]).toContain(t)
    }
  })
})
