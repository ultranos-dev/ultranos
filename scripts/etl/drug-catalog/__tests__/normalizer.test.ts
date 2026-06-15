import { describe, it, expect } from 'vitest'
import { normalizeDrug } from '../normalizer.js'
import type { EmlDrugEntry, SourceDrugData } from '../types.js'

const ENTRY: EmlDrugEntry = { atcCode: 'J01CA04', innName: 'amoxicillin' }

describe('normalizeDrug', () => {
  it('sets atc_code and inn_name from EmlDrugEntry regardless of sources', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(row.atc_code).toBe('J01CA04')
    expect(row.inn_name).toBe('amoxicillin')
  })

  it('prefers drugbank over openfda over nlm for scalar fields', () => {
    const sources: SourceDrugData[] = [
      { source: 'nlm', atcCode: 'J01CA04', rxnormCui: 'nlm-cui', therapeuticClass: 'NLM class' },
      { source: 'openfda', atcCode: 'J01CA04', rxnormCui: 'fda-cui', therapeuticClass: 'FDA class' },
      { source: 'drugbank', atcCode: 'J01CA04', rxnormCui: 'db-cui', therapeuticClass: 'DB class' },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.rxnorm_cui).toBe('db-cui')
    expect(row.therapeutic_class).toBe('DB class')
  })

  it('falls back to lower priority when higher priority is undefined', () => {
    const sources: SourceDrugData[] = [
      { source: 'nlm', atcCode: 'J01CA04', rxnormCui: '723' },
      { source: 'openfda', atcCode: 'J01CA04' },
      { source: 'drugbank', atcCode: 'J01CA04' },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.rxnorm_cui).toBe('723')
  })

  it('prefers drugbank brand_names over openfda when drugbank has data', () => {
    const sources: SourceDrugData[] = [
      { source: 'openfda', atcCode: 'J01CA04', brandNames: ['AMOXIL'] },
      { source: 'drugbank', atcCode: 'J01CA04', brandNames: ['TRIMOX', 'POLYMOX'] },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.brand_names).toEqual(['TRIMOX', 'POLYMOX'])
  })

  it('falls back to openfda brand_names when drugbank array is empty', () => {
    const sources: SourceDrugData[] = [
      { source: 'openfda', atcCode: 'J01CA04', brandNames: ['AMOXIL'] },
      { source: 'drugbank', atcCode: 'J01CA04', brandNames: [] },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.brand_names).toEqual(['AMOXIL'])
  })

  it('returns empty arrays for array fields when no source provides them', () => {
    const row = normalizeDrug(ENTRY, [{ source: 'nlm', atcCode: 'J01CA04' }])
    expect(row.brand_names).toEqual([])
    expect(row.adverse_events).toEqual([])
    expect(row.contraindications).toEqual([])
    expect(row.interactions).toEqual([])
  })

  it('returns empty objects for JSONB object fields when no source provides them', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(row.summary_plain).toEqual({})
    expect(row.administration_notes).toEqual({})
    expect(row.pharmacokinetics).toEqual({})
  })

  it('sets therapeutic_class to empty string when no source provides it', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(row.therapeutic_class).toBe('')
  })

  it('includes etl_source listing all sources used', () => {
    const sources: SourceDrugData[] = [
      { source: 'nlm', atcCode: 'J01CA04' },
      { source: 'openfda', atcCode: 'J01CA04' },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.etl_source).toContain('openfda')
    expect(row.etl_source).toContain('nlm')
  })

  it('sets last_etl_refresh to a valid ISO 8601 timestamp', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(() => new Date(row.last_etl_refresh)).not.toThrow()
    expect(new Date(row.last_etl_refresh).toISOString()).toBe(row.last_etl_refresh)
  })

  it('never includes local enrichment fields in output', () => {
    const row = normalizeDrug(ENTRY, []) as Record<string, unknown>
    expect(Object.keys(row)).not.toContain('local_names')
    expect(Object.keys(row)).not.toContain('dispensing_notes')
    expect(Object.keys(row)).not.toContain('formulary_status')
    expect(Object.keys(row)).not.toContain('unit_cost')
  })
})
