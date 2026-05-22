import { describe, it, expect } from 'vitest'
import { AFGHAN_DISTRICTS, getDistrictsByProvince, type AfghanDistrict } from '../reference/afghanistan-districts.js'
import { AFGHAN_PROVINCES, type AfghanProvince } from '../reference/afghanistan-geo.js'

describe('AFGHAN_DISTRICTS', () => {
  it('contains at least 100 districts', () => {
    expect(AFGHAN_DISTRICTS.length).toBeGreaterThanOrEqual(100)
  })

  it('every district has a valid parent province', () => {
    const provinceSet = new Set<string>(AFGHAN_PROVINCES)
    for (const district of AFGHAN_DISTRICTS) {
      expect(provinceSet.has(district.province), `District "${district.name}" has invalid province "${district.province}"`).toBe(true)
    }
  })

  it('no duplicate district names within the same province', () => {
    const seen = new Map<string, Set<string>>()
    for (const d of AFGHAN_DISTRICTS) {
      if (!seen.has(d.province)) seen.set(d.province, new Set())
      const provinceDistricts = seen.get(d.province)!
      expect(provinceDistricts.has(d.name), `Duplicate district "${d.name}" in province "${d.province}"`).toBe(false)
      provinceDistricts.add(d.name)
    }
  })

  it('every district has a non-empty nameLocal', () => {
    for (const d of AFGHAN_DISTRICTS) {
      expect(d.nameLocal.length, `District "${d.name}" has empty nameLocal`).toBeGreaterThan(0)
    }
  })

  it('every province has at least one district', () => {
    const provincesWithDistricts = new Set(AFGHAN_DISTRICTS.map(d => d.province))
    for (const province of AFGHAN_PROVINCES) {
      expect(provincesWithDistricts.has(province), `Province "${province}" has no districts`).toBe(true)
    }
  })
})

describe('getDistrictsByProvince', () => {
  it('returns only districts for the specified province', () => {
    const kabulDistricts = getDistrictsByProvince('Kabul')
    expect(kabulDistricts.length).toBeGreaterThan(0)
    for (const d of kabulDistricts) {
      expect(d.province).toBe('Kabul')
    }
  })

  it('returns empty array for invalid province', () => {
    const result = getDistrictsByProvince('NonExistent' as AfghanProvince)
    expect(result).toHaveLength(0)
  })
})
