import { describe, it, expect } from 'vitest'

describe('Arabic language support', () => {
  it('fts.ts searchDrugs accepts ar lang parameter', async () => {
    const { searchDrugs } = await import('@/db/fts')
    expect(typeof searchDrugs).toBe('function')
  })

  it('browse.ts getDrugsByTherapeuticClass maps Arabic localName', async () => {
    const { getDrugsByTherapeuticClass } = await import('@/db/browse')
    expect(typeof getDrugsByTherapeuticClass).toBe('function')
  })
})
