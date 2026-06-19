import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadOnsidesLookups, buildAdverseEventsByIngredient } from '../sources/onsides.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'onsides')

describe('onsides', () => {
  it('loads lookups', async () => {
    const lk = await loadOnsidesLookups(DIR)
    expect(lk.labelToProducts.get('500')).toEqual(['9000', '9001'])
    expect(lk.productToIngredients.get('9000')).toEqual(['1191'])
    expect(lk.meddraName.get('10002218')).toBe('Anaphylaxis')
  })
  it('builds capped, deduped, severity-ranked adverse events for catalog ingredients', async () => {
    const lk = await loadOnsidesLookups(DIR)
    const byIng = await buildAdverseEventsByIngredient(DIR, lk, new Set(['1191']))
    const evs = byIng.get('1191')!
    expect(evs).toBeTruthy()
    expect(evs.map((e) => e.effect)).toEqual(['Anaphylaxis', 'Bradycardia', 'Acne'])
    expect(evs.map((e) => e.effect)).not.toContain('Cu')
    expect(evs[0]).toEqual({ effect: 'Anaphylaxis', frequency: 'unknown', severity: 'severe' })
    expect(evs.every((e) => e.frequency === 'unknown')).toBe(true)
  })
  it('ignores ingredients not in the catalog set', async () => {
    const lk = await loadOnsidesLookups(DIR)
    const byIng = await buildAdverseEventsByIngredient(DIR, lk, new Set(['999999']))
    expect(byIng.size).toBe(0)
  })
})
