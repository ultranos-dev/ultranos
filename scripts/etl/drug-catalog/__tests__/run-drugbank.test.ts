import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runDrugBankEtl } from '../run-drugbank.js'

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drugbank-sample.xml')

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runDrugBankEtl', () => {
  it('rosters the approved drug and upserts one row', async () => {
    const { client, from, upsert } = makeSupabase()
    const res = await runDrugBankEtl(FIX, { supabase: client })
    expect(res.rostered).toBe(1)
    expect(res.rows).toBe(1)
    expect(from).toHaveBeenCalledWith('drug_catalog')
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ onConflict: 'atc_code' }))
  })

  it('upsert payload excludes local enrichment fields', async () => {
    const { client, upsert } = makeSupabase()
    await runDrugBankEtl(FIX, { supabase: client })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row).not.toHaveProperty('local_names')
    expect(row).not.toHaveProperty('dispensing_notes')
    expect(row).not.toHaveProperty('formulary_status')
    expect(row).not.toHaveProperty('unit_cost')
  })

  it('dedupes rows sharing the same atc_code (no ON CONFLICT twice)', async () => {
    const { client, upsert } = makeSupabase()
    const dupFix = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drugbank-dup-atc.xml')
    const res = await runDrugBankEtl(dupFix, { supabase: client })
    expect(res.rostered).toBe(2)
    expect(res.rows).toBe(1) // deduped to one row for the shared ATC
    const chunk = upsert.mock.calls[0][0] as Array<{ atc_code: string }>
    const atcs = chunk.map((r) => r.atc_code)
    expect(new Set(atcs).size).toBe(atcs.length) // no duplicate atc_code in any upsert chunk
  })
})
