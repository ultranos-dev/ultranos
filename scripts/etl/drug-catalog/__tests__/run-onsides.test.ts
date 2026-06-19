import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runOnsidesEtl } from '../run-onsides.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'onsides')

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runOnsidesEtl', () => {
  it('writes adverse_events to all atc rows sharing the ingredient cui', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'B01AC06', rxnorm_cui: '1191', inn_name: 'Aspirin' },
      { atc_code: 'N02BA01', rxnorm_cui: '1191', inn_name: 'Aspirin' },
      { atc_code: 'Z99ZZ99', rxnorm_cui: '999999', inn_name: 'X' },
    ]
    const res = await runOnsidesEtl(DIR, { supabase: client, catalogRows })
    expect(res.ingredientsWithEffects).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<{ atc_code: string; adverse_events: unknown[] }>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['B01AC06', 'N02BA01'])
    expect(rows[0].adverse_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: 'Anaphylaxis', severity: 'severe' }),
    ]))
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ onConflict: 'atc_code' }))
  })
  it('upsert payload has only atc_code, inn_name, adverse_events, last_etl_refresh', async () => {
    const { client, upsert } = makeSupabase()
    await runOnsidesEtl(DIR, { supabase: client, catalogRows: [{ atc_code: 'B01AC06', rxnorm_cui: '1191', inn_name: 'Aspirin' }] })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).sort()).toEqual(['adverse_events', 'atc_code', 'inn_name', 'last_etl_refresh'])
  })
})
