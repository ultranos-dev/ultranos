import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runOpenFdaBulkEtl } from '../run-openfda-bulk.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

describe('runOpenFdaBulkEtl', () => {
  it('writes the 4 fields to rows whose inn_name matches the bulk map (case-insensitive)', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', inn_name: 'Nope' },
    ]
    const bulk = new Map([['metronidazole', { pregnancyClinical: { legacyCategory: 'B' }, contraindications: ['Hypersensitivity.'], administrationNotes: 'Two grams.', warnings: 'Carcinogenic in mice.' }]])
    const res = await runOpenFdaBulkEtl({ supabase: client, catalogRows, bulk })
    expect(res.matched).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect(rows[0].pregnancy_clinical).toMatchObject({ legacyCategory: 'B' })
    expect(rows[0].administration_notes).toEqual({ en: 'Two grams.' })
    expect(rows[0].warnings_summary_plain).toEqual({ en: 'Carcinogenic in mice.' })
    expect(Object.keys(rows[0]).sort()).toEqual(['administration_notes', 'atc_code', 'contraindications', 'inn_name', 'last_etl_refresh', 'pregnancy_clinical', 'warnings_summary_plain'])
  })
})
