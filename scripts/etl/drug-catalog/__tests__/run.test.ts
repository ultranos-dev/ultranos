import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// All module mocks must be declared before imports of the mocked modules
vi.mock('../sources/nlm.js')
vi.mock('../sources/openfda.js')
vi.mock('../sources/drugbank.js')

import { fetchFromNlm } from '../sources/nlm.js'
import { fetchFromOpenFda } from '../sources/openfda.js'
import { fetchFromDrugBank } from '../sources/drugbank.js'
import { runEtl } from '../run.js'
import type { EmlDrugEntry } from '../types.js'

const makeSupabaseMock = () => {
  const upsertFn = vi.fn().mockResolvedValue({ error: null })
  const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn })
  const client = { from: fromFn } as unknown as SupabaseClient
  return { client, upsertFn, fromFn }
}

const NLM_EMPTY = (atcCode: string) => ({ source: 'nlm' as const, atcCode })
const FDA_EMPTY = (atcCode: string) => ({ source: 'openfda' as const, atcCode })
const DB_EMPTY = (atcCode: string) => ({ source: 'drugbank' as const, atcCode })

describe('runEtl', () => {
  beforeEach(() => {
    vi.mocked(fetchFromNlm).mockImplementation(async (atcCode) => NLM_EMPTY(atcCode))
    vi.mocked(fetchFromOpenFda).mockImplementation(async (atcCode) => FDA_EMPTY(atcCode))
    vi.mocked(fetchFromDrugBank).mockImplementation(async (atcCode) => DB_EMPTY(atcCode))
  })

  it('returns processed=N, failed=0 for N successful entries', async () => {
    const { client } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [
      { atcCode: 'J01CA04', innName: 'amoxicillin' },
      { atcCode: 'N02BE01', innName: 'paracetamol' },
    ]

    const result = await runEtl(entries, { supabase: client })

    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('counts a drug as failed when source fetch throws, without throwing itself', async () => {
    vi.mocked(fetchFromNlm).mockRejectedValueOnce(new Error('network timeout'))

    const { client } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    const result = await runEtl(entries, { supabase: client })

    expect(result.failed).toBe(1)
    expect(result.processed).toBe(0)
  })

  it('calls supabase.from("drug_catalog").upsert with correct conflict target', async () => {
    const { client, fromFn, upsertFn } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    await runEtl(entries, { supabase: client })

    expect(fromFn).toHaveBeenCalledWith('drug_catalog')
    expect(upsertFn).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ onConflict: 'atc_code' })
    )
  })

  it('upserts in chunks of 50 — 100 entries triggers 2 upserts', async () => {
    const { client, upsertFn } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = Array.from({ length: 100 }, (_, i) => ({
      atcCode: `X${String(i).padStart(7, '0')}`,
      innName: `drug${i}`,
    }))

    await runEtl(entries, { supabase: client })

    expect(upsertFn).toHaveBeenCalledTimes(2)
  })

  it('throws when Supabase upsert returns an error', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: { message: 'foreign key violation' } })
    const client = {
      from: vi.fn().mockReturnValue({ upsert: upsertFn }),
    } as unknown as SupabaseClient

    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    await expect(runEtl(entries, { supabase: client })).rejects.toThrow('Upsert failed')
  })

  it('upsert payload does not include local enrichment fields', async () => {
    const { client, upsertFn } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    await runEtl(entries, { supabase: client })

    const rows = upsertFn.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows[0]).not.toHaveProperty('local_names')
    expect(rows[0]).not.toHaveProperty('dispensing_notes')
    expect(rows[0]).not.toHaveProperty('formulary_status')
    expect(rows[0]).not.toHaveProperty('unit_cost')
  })
})
