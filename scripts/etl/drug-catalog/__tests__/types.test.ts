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

  it('NormalizedDrugRow does not include local enrichment fields (compile-time type guard)', () => {
    // Protection is enforced at the TypeScript type level — these fields are intentionally
    // absent from the interface. The following type-level assertions will fail to compile
    // if any of these fields are accidentally added to NormalizedDrugRow.
    type AssertNotKey<T, K extends string> = K extends keyof T ? 'FAIL' : 'OK'
    type _A = AssertNotKey<NormalizedDrugRow, 'local_names'>        // must be 'OK'
    type _B = AssertNotKey<NormalizedDrugRow, 'dispensing_notes'>   // must be 'OK'
    type _C = AssertNotKey<NormalizedDrugRow, 'formulary_status'>   // must be 'OK'
    type _D = AssertNotKey<NormalizedDrugRow, 'unit_cost'>          // must be 'OK'
    const _check: [_A, _B, _C, _D] = ['OK', 'OK', 'OK', 'OK']
    expect(_check).toEqual(['OK', 'OK', 'OK', 'OK'])
  })
})
