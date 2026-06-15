import { describe, it, expect } from 'vitest'
import { haversineDistanceKm, sortPrices } from '@/services/drug-prices.service'
import type { PharmacyPrice } from '@ultranos/shared-types'

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceKm(34.5, 69.2, 34.5, 69.2)).toBe(0)
  })

  it('calculates approximate distance between Kabul and Parwan (~80km)', () => {
    // Kabul: 34.5260, 69.1763 — Charikar (Parwan): 35.0136, 69.1678
    const km = haversineDistanceKm(34.526, 69.1763, 35.0136, 69.1678)
    expect(km).toBeGreaterThan(50)
    expect(km).toBeLessThan(100)
  })

  it('returns a positive value when coordinates differ', () => {
    expect(haversineDistanceKm(34.0, 69.0, 35.0, 70.0)).toBeGreaterThan(0)
  })
})

const PRICES: PharmacyPrice[] = [
  { facilityId: 'f1', pharmacyName: 'Alpha', distanceKm: 2.5, retailPrice: 95, stockSignal: 'in_stock' },
  { facilityId: 'f2', pharmacyName: 'Beta', distanceKm: 0.4, retailPrice: 120, stockSignal: 'in_stock' },
  { facilityId: 'f3', pharmacyName: 'Gamma', distanceKm: 5.1, retailPrice: 80, stockSignal: 'low_stock' },
]

describe('sortPrices', () => {
  it('sorts by distance ascending when sort=distance', () => {
    const sorted = sortPrices(PRICES, 'distance')
    expect(sorted[0].pharmacyName).toBe('Beta')   // 0.4 km
    expect(sorted[1].pharmacyName).toBe('Alpha')  // 2.5 km
    expect(sorted[2].pharmacyName).toBe('Gamma')  // 5.1 km
  })

  it('sorts by price ascending when sort=price', () => {
    const sorted = sortPrices(PRICES, 'price')
    expect(sorted[0].pharmacyName).toBe('Gamma')  // 80 AFN
    expect(sorted[1].pharmacyName).toBe('Alpha')  // 95 AFN
    expect(sorted[2].pharmacyName).toBe('Beta')   // 120 AFN
  })

  it('does not mutate the original array', () => {
    const original = [...PRICES]
    sortPrices(PRICES, 'distance')
    expect(PRICES).toEqual(original)
  })
})
