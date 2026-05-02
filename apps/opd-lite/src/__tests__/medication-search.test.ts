import { describe, it, expect, beforeAll } from 'vitest'
import { searchMedications, type MedicationSearchResult } from '@/lib/medication-search'
import { seedVocabularyIfEmpty } from '@/lib/vocabulary-seeder'

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
