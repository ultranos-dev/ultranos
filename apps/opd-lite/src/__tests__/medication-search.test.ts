import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { searchMedications } from '@/lib/medication-search'
import { seedVocabularyIfEmpty } from '@/lib/vocabulary-seeder'
import { searchDrugCatalog } from '@/lib/trpc'

vi.mock('@/lib/trpc', () => ({
  searchDrugCatalog: vi.fn(),
}))

// Seed vocabulary tables before tests run
beforeAll(async () => {
  await seedVocabularyIfEmpty()
})

describe('searchMedications (Dexie-backed)', () => {
  it('returns empty array for empty query', async () => {
    expect(await searchMedications('')).toEqual([])
  })

  it('returns empty array for single-character query', async () => {
    expect(await searchMedications('A')).toEqual([])
  })

  it('returns empty array for whitespace-only query', async () => {
    expect(await searchMedications('   ')).toEqual([])
  })

  it('finds medications by name', async () => {
    const results = await searchMedications('Amoxicillin')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.display).toBe('Amoxicillin')
  })

  it('returns Name, Dosage Form, and Strength in results', async () => {
    const results = await searchMedications('Amoxicillin')
    expect(results.length).toBeGreaterThan(0)
    const item = results[0].item
    expect(item).toHaveProperty('display')
    expect(item).toHaveProperty('form')
    expect(item).toHaveProperty('strength')
    expect(item.display).toBeTruthy()
    expect(item.form).toBeTruthy()
    expect(item.strength).toBeTruthy()
  })

  it('supports fuzzy matching', async () => {
    const results = await searchMedications('amoxcilin') // misspelled
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.display).toBe('Amoxicillin')
  })

  it('limits results to 20', async () => {
    const results = await searchMedications('Tablet')
    expect(results.length).toBeLessThanOrEqual(20)
  })

  it('includes match indices for highlighting', async () => {
    const results = await searchMedications('Metformin')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].matches).toBeDefined()
    expect(results[0].matches!.length).toBeGreaterThan(0)
  })

  it('finds medications by dosage form', async () => {
    const results = await searchMedications('Inhaler')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.item.form === 'Inhaler')).toBe(true)
  })

  it('responds within 500ms for any query', async () => {
    const start = performance.now()
    await searchMedications('Paracetamol')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})

describe('searchMedications — online (Hub API) path', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.mocked(searchDrugCatalog).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Hub results when online and Hub returns data', async () => {
    vi.mocked(searchDrugCatalog).mockResolvedValueOnce([
      {
        atcCode: 'J01CA04',
        innName: 'Amoxicillin',
        brandNames: ['Amoxil'],
        therapeuticClass: 'Antibacterials',
        doseForms: ['Capsule 500mg'],
        localName: undefined,
      },
    ])
    const results = await searchMedications('amox')
    expect(results).toHaveLength(1)
    expect(results[0].item.code).toBe('J01CA04')
    expect(results[0].item.display).toBe('Amoxicillin')
    expect(results[0].item.form).toBe('Capsule 500mg')
    expect(results[0].item.strength).toBe('')
    expect(results[0].matches).toBeUndefined()
  })

  it('uses localName as display when present', async () => {
    vi.mocked(searchDrugCatalog).mockResolvedValueOnce([
      {
        atcCode: 'N02BE01',
        innName: 'Paracetamol',
        brandNames: [],
        therapeuticClass: 'Analgesics',
        doseForms: ['Tablet'],
        localName: 'پاراستامول',
      },
    ])
    const results = await searchMedications('para')
    expect(results[0].item.display).toBe('پاراستامول')
  })

  it('falls back to local Dexie when Hub throws', async () => {
    vi.mocked(searchDrugCatalog).mockRejectedValueOnce(new Error('Network error'))
    const results = await searchMedications('Amoxicillin')
    expect(searchDrugCatalog).toHaveBeenCalledTimes(1)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.strength).toBeTruthy()
  })

  it('falls back to local Dexie when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const results = await searchMedications('Amoxicillin')
    expect(searchDrugCatalog).not.toHaveBeenCalled()
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.strength).toBeTruthy()  // Dexie results have real strength values
  })
})
