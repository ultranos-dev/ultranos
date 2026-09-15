import { describe, it, expect } from 'vitest'
import { resolveCanonicalAtc } from '../lib/atc-resolver'

const fakeSupabase = (rows: Record<string, any>) => ({
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null }) }) }),
  }),
}) as any

describe('resolveCanonicalAtc', () => {
  it('returns the ATC when the code matches a catalog row', async () => {
    expect(await resolveCanonicalAtc(fakeSupabase({ drug_catalog: { atc_code: 'B01AA03' } }), 'B01AA03')).toBe('B01AA03')
  })
  it('trusts an ATC-shaped code even when not in the catalog', async () => {
    expect(await resolveCanonicalAtc(fakeSupabase({}), 'N05AN01')).toBe('N05AN01')
  })
  it('returns null for an unresolvable local code', async () => {
    expect(await resolveCanonicalAtc(fakeSupabase({}), 'LOCAL-999')).toBeNull()
  })
})
