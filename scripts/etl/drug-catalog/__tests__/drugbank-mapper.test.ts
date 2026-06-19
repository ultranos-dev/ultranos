import { describe, it, expect } from 'vitest'
import { isInRoster, mapDrugBankToRows } from '../drugbank-mapper.js'
import type { DrugBankRecord } from '../sources/drugbank-xml.js'

const REC: DrugBankRecord = {
  drugbankId: 'DB00001', name: 'Lepirudin', groups: ['approved'], atcCodes: ['B01AE02'], rxcui: ['237057'],
  mechanismOfAction: 'Direct thrombin inhibitor.', indication: 'Anticoagulation in HIT.',
  pharmacokinetics: { halfLife: '10 minutes', proteinBinding: '3%' }, internationalBrands: ['Refludan'],
  interactions: [{ targetDrugbankId: 'DB06605', name: 'Apixaban', description: 'Apixaban may increase the anticoagulant activities of Lepirudin.' }],
  atcClassByCode: { B01AE02: 'Direct thrombin inhibitors' },
  doseForms: ['Injection, solution'],
}

describe('drugbank-mapper', () => {
  it('isInRoster: approved + has ATC', () => {
    expect(isInRoster(REC)).toBe(true)
    expect(isInRoster({ ...REC, groups: ['experimental'] })).toBe(false)
    expect(isInRoster({ ...REC, atcCodes: [] })).toBe(false)
  })
  it('maps one row per ATC with rxcui + cleaned content', () => {
    const rows = mapDrugBankToRows(REC, new Map([['DB06605', 'B01AF02']]), '2026-06-19T00:00:00.000Z')
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.atc_code).toBe('B01AE02')
    expect(r.drugbank_id).toBe('DB00001')
    expect(r.rxnorm_cui).toBe('237057')
    expect(r.inn_name).toBe('Lepirudin')
    expect(r.brand_names).toContain('Refludan')
    expect(r.indications_clinical).toEqual(['Anticoagulation in HIT.'])
    expect(r.etl_source).toBe('drugbank')
  })
  it('resolves interaction target ATC from the index and tags severity', () => {
    const rows = mapDrugBankToRows(REC, new Map([['DB06605', 'B01AF02']]), 'now')
    const i = rows[0].interactions[0]
    expect(i.drugAtcCode).toBe('B01AF02')
    expect(i.drugName).toBe('Apixaban')
    expect(i.severity).toBe('MODERATE')
    expect(i.mechanism).toContain('anticoagulant activities')
  })
  it('drops interactions whose target is not in the catalog index', () => {
    const rows = mapDrugBankToRows(REC, new Map(), 'now')
    expect(rows[0].interactions).toHaveLength(0)
  })
  it('maps therapeutic_class from atcClassByCode and dose_forms from doseForms', () => {
    const rows = mapDrugBankToRows(REC, new Map([['DB06605', 'B01AF02']]), '2026-06-19T00:00:00.000Z')
    expect(rows).toHaveLength(1)
    expect(rows[0].therapeutic_class).toBe('Direct thrombin inhibitors')
    expect(rows[0].dose_forms).toEqual(['Injection, solution'])
  })
  it('caps interactions at 50, severity-first (keeps all CONTRA + MAJOR)', () => {
    const targets = new Map<string, string>()
    const inter: DrugBankRecord['interactions'] = []
    const add = (n: number, db: string, atc: string, desc: string) => {
      for (let i = 0; i < n; i++) { const id = `${db}${i}`; targets.set(id, `${atc}${i}`); inter.push({ targetDrugbankId: id, name: `${db}${i}`, description: desc }) }
    }
    add(3, 'C', 'C', 'The combination is contraindicated.')
    add(5, 'J', 'J', 'These should not be co-administered.')
    add(60, 'M', 'M', 'DrugX may increase the sedative activities of DrugY.')
    add(20, 'N', 'N', 'Metabolism may be altered.')
    const rec: DrugBankRecord = { drugbankId: 'DB00001', name: 'Test', groups: ['approved'], atcCodes: ['Z01ZZ01'], rxcui: ['1'], pharmacokinetics: {}, internationalBrands: [], interactions: inter, atcClassByCode: {}, doseForms: [] }
    const rows = mapDrugBankToRows(rec, targets, 'now')
    const got = rows[0].interactions
    expect(got).toHaveLength(50)
    expect(got.filter((i) => i.severity === 'CONTRAINDICATED')).toHaveLength(3)
    expect(got.filter((i) => i.severity === 'MAJOR')).toHaveLength(5)
    // remaining 42 should be MODERATE (severity-first), no MINOR yet
    expect(got.filter((i) => i.severity === 'MINOR')).toHaveLength(0)
    // ordered: severity rank non-decreasing
    const rank: Record<string, number> = { CONTRAINDICATED: 0, MAJOR: 1, MODERATE: 2, MINOR: 3 }
    for (let i = 1; i < got.length; i++) expect(rank[got[i].severity]).toBeGreaterThanOrEqual(rank[got[i - 1].severity])
  })
})
