import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runMedlinePlusEtl } from '../run-medlineplus.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runMedlinePlusEtl', () => {
  it('writes summary_plain + used_for to all atc rows sharing the cui', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', rxnorm_cui: '6922', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', rxnorm_cui: '6922', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', rxnorm_cui: '404', inn_name: 'Nope' },
    ]
    const fetchProse = vi.fn(async (cui: string) =>
      cui === '6922' ? { summary: 'Metronidazole treats infections.', uses: ['treat infections'], url: 'u' } : null)
    const res = await runMedlinePlusEtl({ supabase: client, catalogRows, fetchProse })
    expect(res.withProse).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    expect(res.failed).toBe(1)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect(rows[0].summary_plain).toEqual({ en: 'Metronidazole treats infections.' })
    expect(rows[0].used_for).toEqual([{ en: 'treat infections' }])
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ onConflict: 'atc_code' }))
  })
  it('upsert payload has only the intended columns', async () => {
    const { client, upsert } = makeSupabase()
    const fetchProse = vi.fn(async () => ({ summary: 's', uses: [], url: undefined }))
    await runMedlinePlusEtl({ supabase: client, catalogRows: [{ atc_code: 'J01XD01', rxnorm_cui: '6922', inn_name: 'M' }], fetchProse })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).sort()).toEqual(['atc_code', 'inn_name', 'last_etl_refresh', 'summary_plain', 'used_for'])
  })
})
