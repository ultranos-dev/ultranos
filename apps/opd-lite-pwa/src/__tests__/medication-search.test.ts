import { describe, it, expect } from 'vitest'
import { searchMedications, type MedicationSearchResult } from '@/lib/medication-search'

describe('searchMedications', () => {
  it('returns empty array for empty query', () => {
    expect(searchMedications('')).toEqual([])
  })

  it('returns empty array for single-character query', () => {
    expect(searchMedications('A')).toEqual([])
  })

  it('returns empty array for whitespace-only query', () => {
    expect(searchMedications('   ')).toEqual([])
  })

  it('finds medications by name', () => {
    const results = searchMedications('Amoxicillin')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.display).toBe('Amoxicillin')
  })

  it('returns Name, Dosage Form, and Strength in results', () => {
    const results = searchMedications('Amoxicillin')
    expect(results.length).toBeGreaterThan(0)
    const item = results[0].item
    expect(item).toHaveProperty('display')
    expect(item).toHaveProperty('form')
    expect(item).toHaveProperty('strength')
    expect(item.display).toBeTruthy()
    expect(item.form).toBeTruthy()
    expect(item.strength).toBeTruthy()
  })

  it('supports fuzzy matching', () => {
    const results = searchMedications('amoxcilin') // misspelled
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.display).toBe('Amoxicillin')
  })

  it('limits results to 20', () => {
    // Search a broad term that could match many
    const results = searchMedications('Tablet')
    expect(results.length).toBeLessThanOrEqual(20)
  })

  it('includes match indices for highlighting', () => {
    const results = searchMedications('Metformin')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].matches).toBeDefined()
    expect(results[0].matches!.length).toBeGreaterThan(0)
  })

  it('finds medications by dosage form', () => {
    const results = searchMedications('Inhaler')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.item.form === 'Inhaler')).toBe(true)
  })

  it('responds within 500ms for any query', () => {
    const start = performance.now()
    searchMedications('Paracetamol')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})
