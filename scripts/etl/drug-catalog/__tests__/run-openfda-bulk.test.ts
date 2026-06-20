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

  it('includes all 4 content fields with empty objects when absent: a bulk entry with only contraindications produces a row with pregnancy_clinical:{}, administration_notes:{}, warnings_summary_plain:{}', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'B01AC06', inn_name: 'Acetylsalicylic acid' },
    ]
    const bulk = new Map([
      ['acetylsalicylic acid', { contraindications: ['Do not use in children with viral infections.'], pregnancyClinical: undefined, administrationNotes: undefined, warnings: undefined }],
    ])
    const res = await runOpenFdaBulkEtl({ supabase: client, catalogRows, bulk })
    expect(res.matched).toBe(1)
    expect(res.rowsUpdated).toBe(1)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows).toHaveLength(1)
    expect(rows[0].atc_code).toBe('B01AC06')
    expect(rows[0].inn_name).toBe('Acetylsalicylic acid')
    expect(rows[0].contraindications).toEqual(['Do not use in children with viral infections.'])
    expect(rows[0].pregnancy_clinical).toEqual({})
    expect(rows[0].administration_notes).toEqual({})
    expect(rows[0].warnings_summary_plain).toEqual({})
    expect(Object.keys(rows[0]).sort()).toEqual(['administration_notes', 'atc_code', 'contraindications', 'inn_name', 'last_etl_refresh', 'pregnancy_clinical', 'warnings_summary_plain'])
  })

  it('includes rows even when all content fields are empty (homogeneous payload requires all fields)', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'X00XX00', inn_name: 'Somedrug' },
    ]
    // bulk entry has no content — all empty/undefined
    const bulk = new Map([
      ['somedrug', { contraindications: [], pregnancyClinical: undefined, administrationNotes: undefined, warnings: undefined }],
    ])
    const res = await runOpenFdaBulkEtl({ supabase: client, catalogRows, bulk })
    // matched is 1 (bulk had an entry), and rowsUpdated is 1 (homogeneous payload includes all fields)
    expect(res.matched).toBe(1)
    expect(res.rowsUpdated).toBe(1)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows).toHaveLength(1)
    expect(rows[0].contraindications).toEqual([])
    expect(rows[0].pregnancy_clinical).toEqual({})
    expect(rows[0].administration_notes).toEqual({})
    expect(rows[0].warnings_summary_plain).toEqual({})
  })
})
