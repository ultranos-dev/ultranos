import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseDrugBankXml, cleanProse, type DrugBankRecord } from '../sources/drugbank-xml.js'

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drugbank-sample.xml')

describe('parseDrugBankXml', () => {
  it('emits exactly one top-level drug (ignores nested pathway <drug>)', async () => {
    const drugs: DrugBankRecord[] = []
    const { count } = await parseDrugBankXml(FIX, (d) => drugs.push(d))
    expect(count).toBe(1)
    expect(drugs).toHaveLength(1)
  })
  it('extracts primary id, atc, rxcui, brands, interactions', async () => {
    const drugs: DrugBankRecord[] = []
    await parseDrugBankXml(FIX, (d) => drugs.push(d))
    const d = drugs[0]
    expect(d.drugbankId).toBe('DB00001')
    expect(d.name).toBe('Lepirudin')
    expect(d.groups).toContain('approved')
    expect(d.atcCodes).toEqual(['B01AE02'])
    expect(d.rxcui).toEqual(['237057'])
    expect(d.internationalBrands).toContain('Refludan')
    expect(d.interactions[0]).toMatchObject({ targetDrugbankId: 'DB06605', name: 'Apixaban' })
  })
  it('cleans HTML tags and citation markers from prose', async () => {
    const drugs: DrugBankRecord[] = []
    await parseDrugBankXml(FIX, (d) => drugs.push(d))
    const d = drugs[0]
    expect(d.mechanismOfAction).toBe('Lepirudin is a direct thrombin inhibitor.')
    expect(d.pharmacokinetics.proteinBinding).toBe('Approximately 3%.')
    expect(d.pharmacokinetics.volumeOfDistribution).toBe('12.2 L/m2 at steady state.')
    expect(d.pharmacokinetics.excretion).toBe('Renal, about 48% of the dose.')
  })
  it('cleanProse strips <sup> and [REF] markers', () => {
    expect(cleanProse('12.2 L/m<sup>2</sup>.[L41]')).toBe('12.2 L/m2.')
    expect(cleanProse(undefined)).toBeUndefined()
  })
  it('cleanProse keeps "<NN" dosing thresholds while stripping real tags', () => {
    expect(cleanProse('Reduce dose if CrCl <30 mL/min.<sup>1</sup>')).toBe('Reduce dose if CrCl <30 mL/min.1')
    expect(cleanProse('<p>Use with caution if CrCl <30 mL/min</p>')).toBe('Use with caution if CrCl <30 mL/min')
  })
  it('does not let nested target/polypeptide <name> overwrite the drug name', async () => {
    const drugs: DrugBankRecord[] = []
    await parseDrugBankXml(FIX, (d) => drugs.push(d))
    expect(drugs[0].name).toBe('Lepirudin')
    expect(drugs[0].atcCodes).toEqual(['B01AE02'])
    expect(drugs[0].rxcui).toEqual(['237057'])
    expect(drugs[0].interactions[0]).toMatchObject({ targetDrugbankId: 'DB06605', name: 'Apixaban' })
  })
  it('derives therapeutic class from the most-specific ATC level and distinct dose forms', async () => {
    const drugs: DrugBankRecord[] = []
    await parseDrugBankXml(FIX, (d) => drugs.push(d))
    expect(drugs[0].atcClassByCode['B01AE02']).toBe('Direct thrombin inhibitors')
    expect(drugs[0].doseForms).toEqual(['Injection, solution, concentrate'])
  })
})
