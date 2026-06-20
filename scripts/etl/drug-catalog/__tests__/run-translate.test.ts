import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runTranslateEtl } from '../run-translate.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

describe('runTranslateEtl', () => {
  it('translates only missing langs and marks them machine', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [{
      atc_code: 'J01XD01', inn_name: 'Metronidazole',
      summary_plain: { en: 'Treats infections.', prs: 'موجود' },
      used_for: [], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {},
      translation_status: {},
    }]
    const translateImpl = vi.fn(async () => ({ ar: 'AR', prs: 'PRS', ps: 'PS' }))
    const res = await runTranslateEtl({ supabase: client, catalogRows, translateImpl })
    expect(res.rowsUpdated).toBe(1)
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row.summary_plain).toEqual({ en: 'Treats infections.', prs: 'موجود', ar: 'AR', ps: 'PS' })
    expect(row.translation_status).toEqual({ summaryPlain: { ar: 'machine', ps: 'machine' } })
    expect(Object.keys(row).sort()).toEqual(['atc_code', 'inn_name', 'last_etl_refresh', 'storage_instructions', 'summary_plain', 'translation_status', 'used_for', 'warnings_summary_plain', 'when_to_seek_help'])
  })
  it('skips a row whose target fields are fully translated or empty', async () => {
    const { client } = makeSupabase()
    const translateImpl = vi.fn(async () => ({ ar: 'AR', prs: 'PRS', ps: 'PS' }))
    const res = await runTranslateEtl({ supabase: client, translateImpl, catalogRows: [
      { atc_code: 'X', inn_name: 'X', summary_plain: {}, used_for: [], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {}, translation_status: {} },
      { atc_code: 'Y', inn_name: 'Y', summary_plain: { en: 'a', ar: 'a', prs: 'a', ps: 'a' }, used_for: [], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {}, translation_status: {} },
    ] })
    expect(res.rowsUpdated).toBe(0)
    expect(translateImpl).not.toHaveBeenCalled()
  })
  it('translates each used_for array element and marks usedFor machine', async () => {
    const { client, upsert } = makeSupabase()
    const translateImpl = vi.fn(async () => ({ ar: 'AR', prs: 'PRS', ps: 'PS' }))
    await runTranslateEtl({ supabase: client, translateImpl, catalogRows: [
      { atc_code: 'Z', inn_name: 'Z', summary_plain: {}, used_for: [{ en: 'fever' }], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {}, translation_status: {} },
    ] })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect((row.used_for as Array<Record<string,string>>)[0]).toEqual({ en: 'fever', ar: 'AR', prs: 'PRS', ps: 'PS' })
    expect(row.translation_status).toEqual({ usedFor: { ar: 'machine', prs: 'machine', ps: 'machine' } })
  })
})
