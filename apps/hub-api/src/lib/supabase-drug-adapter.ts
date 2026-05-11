import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side DrugDatabaseAdapter backed by Supabase.
 * Uses the request-scoped Supabase client (not a singleton).
 *
 * Queries:
 * - `vocab_interactions` for drug-drug interaction pairs
 * - `vocab_versions` for staleness metadata (keyed by vocab_type = 'interactions')
 */
export function createSupabaseDrugAdapter(supabase: SupabaseClient): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const { data, error } = await supabase
        .from('vocab_interactions')
        .select('drug_a, drug_b, severity, description')

      if (error || !data) return []

      return data.map((row) => ({
        drugA: row.drug_a,
        drugB: row.drug_b,
        severity: row.severity,
        description: row.description,
      }))
    },

    async getMetadata() {
      const { data, error } = await supabase
        .from('vocab_versions')
        .select('last_synced_at, version')
        .eq('vocab_type', 'interactions')
        .maybeSingle()

      if (error) return null

      // No row = fresh deploy with no vocab data → force staleness detection
      if (!data) {
        return { lastUpdatedAt: new Date(0).toISOString(), version: 0 }
      }

      return {
        lastUpdatedAt: data.last_synced_at,
        version: data.version,
      }
    },
  }
}
