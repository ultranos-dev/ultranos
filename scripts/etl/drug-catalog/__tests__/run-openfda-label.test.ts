import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runOpenFdaLabelEtl } from '../run-openfda-label.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runOpenFdaLabelEtl', () => {
  it('writes pregnancy_clinical + contraindications to all atc rows sharing inn_name', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', inn_name: 'Nope' },
    ]
    const fetchLabel = vi.fn(async (name: string) =>
      name === 'Metronidazole'
        ? { pregnancyClinical: { pregnancy: 'no adequate studies', lactation: 'in milk', legacyCategory: 'B' }, contraindications: ['Hypersensitivity to metronidazole.'] }
        : null)
    const res = await runOpenFdaLabelEtl({ supabase: client, catalogRows, fetchLabel })
    expect(res.withLabel).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    expect(res.failed).toBe(1)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect(rows[0].pregnancy_clinical).toMatchObject({ legacyCategory: 'B' })
    expect(rows[0].contraindications).toEqual(['Hypersensitivity to metronidazole.'])
  })
  it('upsert payload has only the intended columns', async () => {
    const { client, upsert } = makeSupabase()
    const fetchLabel = vi.fn(async () => ({ pregnancyClinical: { legacyCategory: 'B' }, contraindications: [] }))
    await runOpenFdaLabelEtl({ supabase: client, catalogRows: [{ atc_code: 'J01XD01', inn_name: 'M' }], fetchLabel })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).sort()).toEqual(['atc_code', 'contraindications', 'inn_name', 'last_etl_refresh', 'pregnancy_clinical'])
  })
})
