import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runEnforcementEtl } from '../run-enforcement.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

describe('runEnforcementEtl', () => {
  it('writes recall_alerts to rows whose inn_name matches (canonical)', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', inn_name: 'Nope' },
    ]
    const recalls = new Map([['metronidazole', [{ recallId: 'D-1', description: 'Sterility', initiationDate: '2026-05-12', status: 'Ongoing' }]]])
    const res = await runEnforcementEtl({ supabase: client, catalogRows, recalls })
    expect(res.drugsWithRecalls).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect((rows[0].recall_alerts as unknown[])).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['atc_code', 'inn_name', 'last_etl_refresh', 'recall_alerts'])
  })
})
