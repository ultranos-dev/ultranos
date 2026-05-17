import { describe, it, expect } from 'vitest'
import { searchSOAPMacros } from '@/lib/soap-macros'

describe('searchSOAPMacros', () => {
  it('returns empty array for empty query', () => {
    expect(searchSOAPMacros('')).toEqual([])
  })

  it('returns empty array for short query (< 2 chars)', () => {
    expect(searchSOAPMacros('a')).toEqual([])
  })

  it('returns hypertension template when searching "hypertension"', () => {
    const results = searchSOAPMacros('hypertension')
    expect(results).toHaveLength(1)
    expect(results[0].keyword).toBe('hypertension')
    expect(results[0].label).toBe('Hypertension (HTN)')
    expect(results[0].subjective).toBeTruthy()
    expect(results[0].objective).toBeTruthy()
    expect(results[0].assessment).toBeTruthy()
    expect(results[0].plan).toBeTruthy()
  })

  it('returns diabetes template when searching "diabetes"', () => {
    const results = searchSOAPMacros('diabetes')
    expect(results).toHaveLength(1)
    expect(results[0].keyword).toBe('diabetes')
    expect(results[0].label).toBe('Diabetes Mellitus Type 2')
  })

  it('returns URI template when searching "uri"', () => {
    const results = searchSOAPMacros('uri')
    expect(results.length).toBeGreaterThanOrEqual(1)
    // The exact "uri" keyword template must be included
    const uriTemplate = results.find((t) => t.keyword === 'uri')
    expect(uriTemplate).toBeDefined()
    expect(uriTemplate!.label).toBe('Upper Respiratory Infection')
  })

  it('partial match works (e.g., "hyper" matches hypertension)', () => {
    const results = searchSOAPMacros('hyper')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((t) => t.keyword === 'hypertension')).toBe(true)
  })

  it('case insensitive search', () => {
    const upper = searchSOAPMacros('DIABETES')
    const lower = searchSOAPMacros('diabetes')
    const mixed = searchSOAPMacros('Diabetes')

    expect(upper).toHaveLength(1)
    expect(lower).toHaveLength(1)
    expect(mixed).toHaveLength(1)
    expect(upper[0].keyword).toBe(lower[0].keyword)
    expect(upper[0].keyword).toBe(mixed[0].keyword)
  })

  it('returns empty array for non-matching query', () => {
    const results = searchSOAPMacros('xylophone')
    expect(results).toEqual([])
  })

  it('search completes within 300ms', () => {
    const start = performance.now()
    // Run multiple searches to stress-test
    for (let i = 0; i < 1000; i++) {
      searchSOAPMacros('hypertension')
      searchSOAPMacros('diabetes')
      searchSOAPMacros('uri')
      searchSOAPMacros('nonexistent')
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(300)
  })
})
