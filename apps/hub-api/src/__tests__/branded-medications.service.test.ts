import { describe, it, expect } from 'vitest'
import {
  mapBrandRow,
  mapPresentationRow,
  mapBrandWithPresentations,
} from '@/services/branded-medications.service'

describe('mapBrandRow', () => {
  it('maps snake_case columns to a DrugBrand', () => {
    const brand = mapBrandRow({
      id: 'b1', generic_atc_code: 'J01CR02', brand_name: 'Augmentin',
      manufacturer: 'GSK', brand_name_local: { ar: 'أوجمنتين' }, rx_status: 'rx',
      version: 42, last_updated: '2026-06-23T00:00:00Z',
    })
    expect(brand).toEqual({
      id: 'b1', genericAtcCode: 'J01CR02', brandName: 'Augmentin',
      manufacturer: 'GSK', brandNameLocal: { ar: 'أوجمنتين' }, rxStatus: 'rx',
      version: 42, lastUpdated: '2026-06-23T00:00:00Z',
    })
  })

  it('defaults empty manufacturer to undefined and falls back rxStatus to unknown', () => {
    const brand = mapBrandRow({ id: 'b2', generic_atc_code: 'X', brand_name: 'Generic-X', manufacturer: '', version: 1, last_updated: 't' })
    expect(brand.manufacturer).toBeUndefined()
    expect(brand.rxStatus).toBe('unknown')
    expect(brand.brandNameLocal).toEqual({})
  })
})

describe('mapPresentationRow', () => {
  it('maps a presentation including numeric reference price', () => {
    const p = mapPresentationRow({
      id: 'p1', brand_id: 'b1', strength: '625 mg', dose_form: 'tablet', route: 'oral',
      pack_size: 14, pack_unit: 'tablets', volume: null, gtin: '5000123',
      registration_number: 'AF-123', registration_status: 'marketed', market: 'AF',
      reference_price: '12.50', currency: 'AFN', packaging_photo_url: null,
      version: 7, last_updated: 't',
    })
    expect(p).toEqual({
      id: 'p1', brandId: 'b1', strength: '625 mg', doseForm: 'tablet', route: 'oral',
      packSize: 14, packUnit: 'tablets', volume: undefined, gtin: '5000123',
      registrationNumber: 'AF-123', registrationStatus: 'marketed', market: 'AF',
      referencePrice: 12.5, currency: 'AFN', packagingPhotoUrl: undefined,
      version: 7, lastUpdated: 't',
    })
  })

  it('leaves referencePrice undefined when absent', () => {
    const p = mapPresentationRow({ id: 'p2', brand_id: 'b1', registration_status: 'unknown', version: 1, last_updated: 't' })
    expect(p.referencePrice).toBeUndefined()
    expect(p.registrationStatus).toBe('unknown')
  })
})

describe('mapBrandWithPresentations', () => {
  it('nests mapped presentations under the brand', () => {
    const bw = mapBrandWithPresentations({
      id: 'b1', generic_atc_code: 'J01CR02', brand_name: 'Augmentin', manufacturer: 'GSK',
      version: 1, last_updated: 't',
      drug_brand_presentations: [
        { id: 'p1', brand_id: 'b1', strength: '625 mg', registration_status: 'marketed', version: 2, last_updated: 't' },
      ],
    })
    expect(bw.brandName).toBe('Augmentin')
    expect(bw.presentations).toHaveLength(1)
    expect(bw.presentations[0].strength).toBe('625 mg')
  })

  it('returns an empty presentations array when none are embedded', () => {
    const bw = mapBrandWithPresentations({ id: 'b1', generic_atc_code: 'X', brand_name: 'Solo', version: 1, last_updated: 't' })
    expect(bw.presentations).toEqual([])
  })
})
