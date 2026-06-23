import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  parseRegionalBrands,
  buildBrandIndex,
  matchRegionalBrands,
} from '../sources/regional-brands.js'

const datasetDir = fileURLToPath(new URL('../datasets/', import.meta.url))

describe('parseRegionalBrands — JSON', () => {
  it('accepts both camelCase and snake_case keys and single/array brand fields', () => {
    const json = JSON.stringify([
      { atcCode: 'J01CR02', innName: 'Amoxicillin/clavulanate', brandNames: ['Augmentin', 'Curam'], market: 'AF', source: 'MoPH' },
      { atc_code: 'J01CA04', inn_name: 'Amoxicillin', brand_name: 'Amoxil' },
    ])
    const recs = parseRegionalBrands(json, 'json')
    expect(recs).toHaveLength(2)
    expect(recs[0]).toEqual({ atcCode: 'J01CR02', innName: 'Amoxicillin/clavulanate', brandNames: ['Augmentin', 'Curam'], market: 'AF', source: 'MoPH' })
    expect(recs[1].brandNames).toEqual(['Amoxil'])
  })

  it('throws when the JSON root is not an array', () => {
    expect(() => parseRegionalBrands('{"foo":1}', 'json')).toThrow(/array/i)
  })

  it('skips records with no brands or no atc/inn key', () => {
    const json = JSON.stringify([
      { atcCode: 'J01CA04', brandNames: [] },        // no brands
      { brandNames: ['Orphan'] },                     // no key
      { innName: 'Metronidazole', brandNames: ['Flagyl'] }, // valid
    ])
    const recs = parseRegionalBrands(json, 'json')
    expect(recs).toHaveLength(1)
    expect(recs[0].innName).toBe('Metronidazole')
  })
})

describe('parseRegionalBrands — CSV', () => {
  it('parses a header + rows, handling quoted fields with commas', () => {
    const csv = [
      'atc_code,inn_name,brand_name,market,source',
      'J01CA04,Amoxicillin,Amoxil,AF,MoPH',
      'C09AA05,Ramipril,"Tritace, 5mg",PK,DRAP',
    ].join('\n')
    const recs = parseRegionalBrands(csv, 'csv')
    expect(recs).toHaveLength(2)
    expect(recs[0]).toEqual({ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'], market: 'AF', source: 'MoPH' })
    expect(recs[1].brandNames).toEqual(['Tritace, 5mg'])
  })

  it('splits a delimited brand_names column', () => {
    const csv = ['atc_code,inn_name,brand_names', 'J01CA04,Amoxicillin,Amoxil;Moxatag|Trimox'].join('\n')
    const recs = parseRegionalBrands(csv, 'csv')
    expect(recs[0].brandNames).toEqual(['Amoxil', 'Moxatag', 'Trimox'])
  })
})

describe('matchRegionalBrands', () => {
  it('matches a catalog drug by ATC code', () => {
    const idx = buildBrandIndex(parseRegionalBrands(JSON.stringify([
      { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil', 'Trimox'] },
    ]), 'json'))
    expect(matchRegionalBrands('J01CA04', 'Amoxicillin', idx)).toEqual(['Amoxil', 'Trimox'])
  })

  it('matches by INN name case-insensitively when ATC differs/absent', () => {
    const idx = buildBrandIndex(parseRegionalBrands(JSON.stringify([
      { innName: 'Metronidazole', brandNames: ['Flagyl'] },
    ]), 'json'))
    expect(matchRegionalBrands(null, 'METRONIDAZOLE', idx)).toEqual(['Flagyl'])
  })

  it('matches across the INN↔USAN alias map (dataset USAN ↔ catalog WHO INN)', () => {
    const idx = buildBrandIndex(parseRegionalBrands(JSON.stringify([
      { innName: 'acetaminophen', brandNames: ['Tylenol', 'Panadol'] },
    ]), 'json'))
    // Catalog keeps the WHO INN "paracetamol"; must still resolve the USAN record.
    expect(matchRegionalBrands('N02BE01', 'paracetamol', idx)).toEqual(['Tylenol', 'Panadol'])
  })

  it('aggregates brands from multiple records for the same drug and dedupes', () => {
    const idx = buildBrandIndex(parseRegionalBrands(JSON.stringify([
      { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'] },
      { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['AMOXIL', 'Ospamox'] },
    ]), 'json'))
    expect(matchRegionalBrands('J01CA04', 'Amoxicillin', idx)).toEqual(['Amoxil', 'Ospamox'])
  })

  it('returns [] when nothing matches', () => {
    const idx = buildBrandIndex([])
    expect(matchRegionalBrands('Z99ZZ99', 'Nonexistol', idx)).toEqual([])
  })
})

describe('committed example dataset templates', () => {
  it('regional-brands.example.json parses into valid records', () => {
    const recs = parseRegionalBrands(readFileSync(`${datasetDir}regional-brands.example.json`, 'utf8'), 'json')
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.every((r) => r.brandNames.length > 0 && (r.atcCode || r.innName))).toBe(true)
    // Smoke: a brand search resolves through the example data.
    const idx = buildBrandIndex(recs)
    expect(matchRegionalBrands('J01CR02', 'amoxicillin/clavulanate', idx)).toContain('Augmentin')
  })

  it('regional-brands.example.csv parses into valid records', () => {
    const recs = parseRegionalBrands(readFileSync(`${datasetDir}regional-brands.example.csv`, 'utf8'), 'csv')
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.every((r) => r.brandNames.length > 0 && (r.atcCode || r.innName))).toBe(true)
  })
})
