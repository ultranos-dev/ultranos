/**
 * Readiness Recommendations Tests — Story 48.3 Task 7
 *
 * Unit tests for generateRecommendations().
 */

import { describe, it, expect } from 'vitest'
import { generateRecommendations } from '../lib/readiness-recommendations'

describe('generateRecommendations', () => {
  // -----------------------------------------------------------------------
  // Green always empty
  // -----------------------------------------------------------------------
  it('returns empty array for green personnel', () => {
    expect(generateRecommendations('personnel', 'green', {})).toEqual([])
  })

  it('returns empty array for green reagents', () => {
    expect(generateRecommendations('reagents', 'green', {})).toEqual([])
  })

  it('returns empty array for green pendingOrders', () => {
    expect(generateRecommendations('pendingOrders', 'green', {})).toEqual([])
  })

  it('returns empty array for green power', () => {
    expect(generateRecommendations('power', 'green', {})).toEqual([])
  })

  it('returns empty array for green equipment', () => {
    expect(generateRecommendations('equipment', 'green', {})).toEqual([])
  })

  // -----------------------------------------------------------------------
  // Personnel
  // -----------------------------------------------------------------------
  it('returns red recommendation for personnel red', () => {
    const items = generateRecommendations('personnel', 'red', {})
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.personnelRed')
  })

  it('returns amber recommendation for personnel amber', () => {
    const items = generateRecommendations('personnel', 'amber', {})
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.personnelAmber')
  })

  // -----------------------------------------------------------------------
  // Reagents — single-issue context
  // -----------------------------------------------------------------------
  it('returns red reagent recommendation with correct args', () => {
    const ctx = { reagentName: 'Chemistry strips', testType: 'CHEM', supplierName: 'BioSupply' }
    const items = generateRecommendations('reagents', 'red', ctx)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].key).toBe('readiness.recommendations.reagentsRed')
    expect(items[0].args?.reagentName).toBe('Chemistry strips')
    expect(items[0].args?.supplierName).toBe('BioSupply')
  })

  it('returns amber reagent recommendation with daysRemaining', () => {
    const ctx = { reagentName: 'Hematology kit', testType: 'CBC', daysRemaining: 10 }
    const items = generateRecommendations('reagents', 'amber', ctx)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].key).toBe('readiness.recommendations.reagentsAmber')
    expect(items[0].args?.daysRemaining).toBe(10)
  })

  it('handles multiple reagent issues via issues array', () => {
    const ctx = {
      issues: [
        { reagentName: 'R1', testType: 'T1', supplierName: 'S1', isRed: true },
        { reagentName: 'R2', testType: 'T2', daysRemaining: 8, isRed: false },
        { reagentName: 'R3', testType: 'T3', supplierName: 'S3', isRed: true },
        { reagentName: 'R4', testType: 'T4', supplierName: 'S4', isRed: true }, // should be sliced
      ],
    }
    const items = generateRecommendations('reagents', 'red', ctx)
    expect(items.length).toBeLessThanOrEqual(3)
  })

  // -----------------------------------------------------------------------
  // Equipment
  // -----------------------------------------------------------------------
  it('returns amber recommendation for equipment amber', () => {
    const items = generateRecommendations('equipment', 'amber', {})
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.equipmentAmber')
  })

  it('returns red recommendation for equipment red with args', () => {
    const ctx = { equipmentName: 'Hematology Analyzer', affectedTests: 'CBC, Diff' }
    const items = generateRecommendations('equipment', 'red', ctx)
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.equipmentRed')
    expect(items[0].args?.equipmentName).toBe('Hematology Analyzer')
  })

  // -----------------------------------------------------------------------
  // Pending orders
  // -----------------------------------------------------------------------
  it('returns red order recommendation with urgentCount', () => {
    const items = generateRecommendations('pendingOrders', 'red', { urgentCount: 3 })
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.ordersRed')
    expect(items[0].args?.urgentCount).toBe(3)
  })

  it('returns amber order recommendation with pendingCount', () => {
    const items = generateRecommendations('pendingOrders', 'amber', { pendingCount: 5 })
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.ordersAmber')
    expect(items[0].args?.pendingCount).toBe(5)
  })

  // -----------------------------------------------------------------------
  // Power
  // -----------------------------------------------------------------------
  it('returns red power recommendation', () => {
    const items = generateRecommendations('power', 'red', {})
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.powerRed')
  })

  it('returns partial amber when percentElapsed is provided', () => {
    const items = generateRecommendations('power', 'amber', { percentElapsed: 60, remainingMinutes: 90 })
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.powerPartialAmber')
    expect(items[0].args?.percentElapsed).toBe(60)
    expect(items[0].args?.remainingMinutes).toBe(90)
  })

  it('returns plain amber when no percentElapsed', () => {
    const items = generateRecommendations('power', 'amber', {})
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('readiness.recommendations.powerAmber')
  })
})
