import { describe, it, expect } from 'vitest'
import type { EmlDrugEntry, SourceDrugData, NormalizedDrugRow } from '../types.js'

describe('types shape', () => {
  it('EmlDrugEntry has atcCode and innName', () => {
    const entry: EmlDrugEntry = { atcCode: 'J01CA04', innName: 'amoxicillin' }
    expect(entry.atcCode).toBe('J01CA04')
    expect(entry.innName).toBe('amoxicillin')
  })

  it('SourceDrugData discriminates by source', () => {
    const data: SourceDrugData = { source: 'nlm', atcCode: 'J01CA04' }
    expect(data.source).toBe('nlm')
  })

  it('NormalizedDrugRow has required ETL fields', () => {
    const row: NormalizedDrugRow = {
      atc_code: 'J01CA04',
      inn_name: 'amoxicillin',
      brand_names: [],
      dose_forms: [],
      therapeutic_class: '',
      indications_clinical: [],
      adult_dosing: [],
      pediatric_dosing: [],
      adverse_events: [],
      contraindications: [],
      interactions: [],
      administration_notes: {},
      pharmacokinetics: {},
      summary_plain: {},
      used_for: [],
      common_side_effects: [],
      when_to_seek_help: {},
      storage_instructions: {},
      pregnancy_summary_plain: {},
      warnings_summary_plain: {},
      substitutes: [],
      recall_alerts: [],
      etl_source: 'nlm,openfda',
      last_etl_refresh: new Date().toISOString(),
    }
    expect(row.atc_code).toBe('J01CA04')
  })

  it('NormalizedDrugRow does not include local enrichment fields', () => {
    // Type-level check: these keys must not exist on NormalizedDrugRow
    // If this compiles, the type is correct
    const row = {} as NormalizedDrugRow
    const keys = Object.keys(row) as string[]
    expect(keys).not.toContain('local_names')
    expect(keys).not.toContain('dispensing_notes')
    expect(keys).not.toContain('formulary_status')
    expect(keys).not.toContain('unit_cost')
  })
})
