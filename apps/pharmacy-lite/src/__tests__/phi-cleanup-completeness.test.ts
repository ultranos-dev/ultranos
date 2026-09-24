/**
 * Story 58.3 (mirrors lab-lite Task 2.2) — PHI-cleanup completeness guard.
 *
 * Enumerates every Dexie table on the REAL PharmacyLiteDatabase and asserts each
 * one is classified in EXACTLY ONE of:
 *   - PHI_TABLES     (cleared on logout — blanket or selective)
 *   - PRESERVE_TABLES (durability / financial / audit / reference — must survive)
 *   - NON_PHI_TABLES  (wholesale-B2B / procurement / inventory operational)
 *
 * When a developer adds a new Dexie table WITHOUT deciding whether it holds PHI,
 * this test fails, forcing an explicit cleanup decision. Companion to the
 * existing compile-time guards in phi-cleanup.ts.
 */
import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { PHI_TABLES, PRESERVE_TABLES, NON_PHI_TABLES } from '@/lib/phi-cleanup'

function actualTableNames(): string[] {
  return db.tables.map((t) => t.name).sort()
}

describe('phi-cleanup completeness guard (pharmacy-lite)', () => {
  it('classifies every Dexie table exactly once', () => {
    const classified = new Map<string, string[]>()
    const record = (name: string, list: string) => {
      const existing = classified.get(name) ?? []
      existing.push(list)
      classified.set(name, existing)
    }
    for (const n of PHI_TABLES) record(n, 'PHI_TABLES')
    for (const n of PRESERVE_TABLES) record(n, 'PRESERVE_TABLES')
    for (const n of NON_PHI_TABLES) record(n, 'NON_PHI_TABLES')

    const duplicated = [...classified.entries()].filter(([, lists]) => lists.length > 1)
    expect(
      duplicated,
      `Tables classified in multiple lists: ${JSON.stringify(duplicated)}`,
    ).toEqual([])

    const known = new Set(classified.keys())
    const actual = actualTableNames()

    const unclassified = actual.filter((n) => !known.has(n))
    expect(
      unclassified,
      `Unclassified Dexie tables (add each to PHI_TABLES, PRESERVE_TABLES, or ` +
        `NON_PHI_TABLES with a rationale): ${JSON.stringify(unclassified)}`,
    ).toEqual([])

    const actualSet = new Set(actual)
    const stale = [...known].filter((n) => !actualSet.has(n))
    expect(
      stale,
      `Classified names that are not real Dexie tables (typo or removed table): ${JSON.stringify(stale)}`,
    ).toEqual([])
  })

  it('never classifies syncQueue as PHI (must survive for drain)', () => {
    expect(PHI_TABLES as readonly string[]).not.toContain('syncQueue')
    expect(NON_PHI_TABLES as readonly string[]).not.toContain('syncQueue')
    expect(PRESERVE_TABLES as readonly string[]).toContain('syncQueue')
  })

  it('keeps invoices PRESERVED (financial durability) after med-text de-identification', () => {
    // Story 58.3 (M-PHARM-3): invoice line description no longer carries the
    // medication free-text name (stripped to a generic label + catalogItemId at
    // the write site), so invoices hold no patient-linked clinical text and stay
    // preserved rather than cleared.
    expect(PRESERVE_TABLES as readonly string[]).toContain('invoices')
    expect(PHI_TABLES as readonly string[]).not.toContain('invoices')
    expect(PRESERVE_TABLES as readonly string[]).toContain('ledgerEntries')
    expect(PRESERVE_TABLES as readonly string[]).toContain('patientAccounts')
  })
})
