import {
  checkInteractions as _checkInteractions,
  type InteractionCheckSummary,
  type VocabInteractionEntry,
  type DrugDatabaseAdapter,
} from '@ultranos/drug-db'
import type { DrugInteraction } from '@ultranos/shared-types'
import type * as SQLite from 'expo-sqlite'

/**
 * Runtime drug-interaction checking for Pharmapedia clinical users (Gap #8,
 * decision #4). Pharmapedia has no patient med-history, so the check runs
 * against a med list the clinician enters. Uses the SAME shared checker as
 * OPD-Lite / Pharmacy-Lite (`@ultranos/drug-db`), bridged to Pharmapedia's
 * offline SQLite catalog.
 *
 * CLAUDE.md Rule 3: the shared checker returns `UNAVAILABLE` (never a false
 * "CLEAR") when the local interaction DB is empty or the adapter fails — the UI
 * MUST surface "Interaction check unavailable", never imply no interactions.
 */

/** A drug and its Tier-2 monograph interactions, as read from the SQLite catalog. */
export interface DrugWithInteractions {
  name: string
  interactions: DrugInteraction[]
}

/**
 * Flatten Pharmapedia's per-drug monograph interactions into the bidirectional
 * pairwise entries the shared checker consumes. Pure + deterministic — the
 * unit-testable heart of the RN interaction bridge.
 */
export function flattenInteractionEntries(drugs: DrugWithInteractions[]): VocabInteractionEntry[] {
  return drugs.flatMap((d) =>
    (d.interactions ?? []).map((i) => ({
      drugA: d.name,
      drugB: i.drugName,
      severity: i.severity,
      description: i.mechanism,
    })),
  )
}

/** Adapter built from already-loaded drug entries (no I/O) — used in tests and by the SQLite adapter. */
export function createInteractionAdapterFromDrugs(drugs: DrugWithInteractions[]): DrugDatabaseAdapter {
  const entries = flattenInteractionEntries(drugs)
  return { getInteractions: async () => entries }
}

/** Runtime adapter backed by Pharmapedia's offline SQLite catalog. */
export function createSqliteInteractionAdapter(db: SQLite.SQLiteDatabase): DrugDatabaseAdapter {
  return {
    getInteractions: async () => {
      // Dynamic import so this module stays free of the expo-sqlite dependency
      // chain at load time (keeps flattenInteractionEntries unit-testable in node).
      const { getAllInteractionDrugs } = await import('@/db/drug-catalog')
      return flattenInteractionEntries(await getAllInteractionDrugs(db))
    },
  }
}

/**
 * Check a candidate drug against a clinician-entered med list using the offline
 * SQLite catalog. Returns the shared `InteractionCheckSummary` — callers MUST
 * treat `result: 'UNAVAILABLE'` as "check unavailable" (Rule 3), not as clear.
 */
export async function checkDrugInteractions(
  candidateDrugDisplay: string,
  existingDrugDisplays: string[],
  db: SQLite.SQLiteDatabase,
): Promise<InteractionCheckSummary> {
  return _checkInteractions(
    candidateDrugDisplay,
    existingDrugDisplays,
    undefined,
    createSqliteInteractionAdapter(db),
  )
}
