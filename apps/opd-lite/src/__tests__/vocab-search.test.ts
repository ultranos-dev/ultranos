import { describe, it, expect, beforeAll } from 'vitest'
import { searchVocab } from '@/lib/vocab-search'
import { seedVocabularyIfEmpty } from '@/lib/vocabulary-seeder'

beforeAll(async () => {
  await seedVocabularyIfEmpty()
})

describe('searchVocab (Dexie-backed)', () => {
  it('returns empty array for empty query', async () => {
    expect(await searchVocab('')).toEqual([])
  })

  it('returns empty array for single character query', async () => {
    expect(await searchVocab('a')).toEqual([])
  })

  it('finds results by ICD-10 code', async () => {
    const results = await searchVocab('J06')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.code).toBe('J06.9')
  })

  it('finds results by clinical name (fuzzy match)', async () => {
    const results = await searchVocab('diabetes')
    expect(results.length).toBeGreaterThan(0)
    const codes = results.map((r) => r.item.code)
    expect(codes).toContain('E11')
  })

  it('returns match metadata for highlighting', async () => {
    const results = await searchVocab('hypertension')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].matches).toBeDefined()
    expect(results[0].matches!.length).toBeGreaterThan(0)
  })

  it('shows both code and display in results', async () => {
    const results = await searchVocab('pneumonia')
    expect(results.length).toBeGreaterThan(0)
    const first = results[0].item
    expect(first.code).toBeTruthy()
    expect(first.display).toBeTruthy()
  })

  it('limits results to a maximum of 20', async () => {
    const results = await searchVocab('unspecified')
    expect(results.length).toBeLessThanOrEqual(20)
  })

  it('performs search in under 500ms', async () => {
    const start = performance.now()
    await searchVocab('acute respiratory')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })

  it('trims whitespace from query', async () => {
    const results = await searchVocab('  fever  ')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.code).toBe('R50.9')
  })
})
