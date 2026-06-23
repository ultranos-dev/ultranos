import { describe, it, expect } from 'vitest'
import { mergeBrandNames, addedBrands, brandProvenancePatch } from '../transforms/brand-merge.js'

describe('mergeBrandNames', () => {
  it('appends new brands after existing ones, preserving existing order', () => {
    expect(mergeBrandNames(['Augmentin', 'Clavamox'], ['Curam', 'Amoclan']))
      .toEqual(['Augmentin', 'Clavamox', 'Curam', 'Amoclan'])
  })

  it('dedupes case-insensitively, keeping the first-seen spelling', () => {
    expect(mergeBrandNames(['Augmentin'], ['AUGMENTIN', 'augmentin', 'Curam']))
      .toEqual(['Augmentin', 'Curam'])
  })

  it('trims whitespace and drops empty / whitespace-only entries', () => {
    expect(mergeBrandNames(['  Augmentin  ', ''], ['  ', 'Curam ', null as unknown as string]))
      .toEqual(['Augmentin', 'Curam'])
  })

  it('does not mutate the input arrays', () => {
    const existing = ['Augmentin']
    const incoming = ['Curam']
    mergeBrandNames(existing, incoming)
    expect(existing).toEqual(['Augmentin'])
    expect(incoming).toEqual(['Curam'])
  })

  it('returns existing unchanged when incoming adds nothing new', () => {
    expect(mergeBrandNames(['Augmentin', 'Curam'], ['augmentin', 'CURAM']))
      .toEqual(['Augmentin', 'Curam'])
  })
})

describe('addedBrands', () => {
  it('returns only the brands present after merge but not before (case-insensitive)', () => {
    const before = ['Augmentin']
    const after = ['Augmentin', 'Curam', 'Amoclan']
    expect(addedBrands(before, after)).toEqual(['Curam', 'Amoclan'])
  })

  it('returns [] when nothing was added', () => {
    expect(addedBrands(['Augmentin'], ['Augmentin'])).toEqual([])
  })
})

describe('brandProvenancePatch', () => {
  it('tags each newly added brand with the source under its lowercased key', () => {
    expect(brandProvenancePatch({}, ['Curam', 'Amoclan'], 'rxnav'))
      .toEqual({ curam: 'rxnav', amoclan: 'rxnav' })
  })

  it('merges into existing provenance without clobbering prior entries', () => {
    expect(brandProvenancePatch({ augmentin: 'drugbank' }, ['Curam'], 'regional:AF'))
      .toEqual({ augmentin: 'drugbank', curam: 'regional:AF' })
  })

  it('does not overwrite an existing brand source if it reappears', () => {
    expect(brandProvenancePatch({ curam: 'drugbank' }, ['Curam'], 'rxnav'))
      .toEqual({ curam: 'drugbank' })
  })
})
