import { describe, it, expect } from 'vitest'
import { searchVocab } from '@/lib/vocab-search'

describe('searchVocab', () => {
  it('returns empty array for empty query', () => {
    expect(searchVocab('')).toEqual([])
  })

  it('returns empty array for single character query', () => {
    expect(searchVocab('a')).toEqual([])
  })

  it('finds results by ICD-10 code', () => {
    const results = searchVocab('J06')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.code).toBe('J06.9')
  })

  it('finds results by clinical name (fuzzy match)', () => {
    const results = searchVocab('diabetes')
    expect(results.length).toBeGreaterThan(0)
    const codes = results.map((r) => r.item.code)
    expect(codes).toContain('E11')
  })

  it('returns match metadata for highlighting', () => {
    const results = searchVocab('hypertension')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].matches).toBeDefined()
    expect(results[0].matches!.length).toBeGreaterThan(0)
  })

  it('shows both code and display in results', () => {
    const results = searchVocab('pneumonia')
    expect(results.length).toBeGreaterThan(0)
    const first = results[0].item
    expect(first.code).toBeTruthy()
    expect(first.display).toBeTruthy()
  })

  it('limits results to a maximum of 20', () => {
    // broad query that could match many items
    const results = searchVocab('unspecified')
    expect(results.length).toBeLessThanOrEqual(20)
  })

  it('performs search in under 500ms', () => {
    const start = performance.now()
    searchVocab('acute respiratory')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })

  it('trims whitespace from query', () => {
    const results = searchVocab('  fever  ')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.code).toBe('R50.9')
  })
})
