import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  presentationKey,
  parseBrandedDataset,
  runBrandedMedicationsEtl,
} from '../run-branded-medications.js'

const exampleFile = fileURLToPath(new URL('../datasets/branded-medications.example.json', import.meta.url))

describe('presentationKey', () => {
  it('is deterministic and distinguishes presentations of the same brand', () => {
    const a = presentationKey({ strength: '625 mg', doseForm: 'tablet', packSize: 14 })
    const b = presentationKey({ strength: '625 mg', doseForm: 'tablet', packSize: 14 })
    const c = presentationKey({ strength: '228 mg/5 mL', doseForm: 'suspension', volume: '100 mL' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('is case/space-insensitive', () => {
    expect(presentationKey({ strength: ' 625 MG ', doseForm: 'Tablet' }))
      .toBe(presentationKey({ strength: '625 mg', doseForm: 'tablet' }))
  })
})

describe('parseBrandedDataset', () => {
  it('parses nested brand + presentations, camelCase or snake_case', () => {
    const recs = parseBrandedDataset(JSON.stringify([
      {
        genericAtcCode: 'J01CR02', brandName: 'Augmentin', manufacturer: 'GSK',
        presentations: [{ strength: '625 mg', dose_form: 'tablet', pack_size: 14 }],
      },
      { generic_atc_code: 'J01CA04', brand_name: 'Amoxil' },
    ]))
    expect(recs).toHaveLength(2)
    expect(recs[0].brandName).toBe('Augmentin')
    expect(recs[0].presentations[0].doseForm).toBe('tablet')
    expect(recs[1].presentations).toEqual([])
  })

  it('skips records missing genericAtcCode or brandName', () => {
    const recs = parseBrandedDataset(JSON.stringify([
      { brandName: 'Orphan' },                    // no atc
      { genericAtcCode: 'X' },                     // no brand
      { genericAtcCode: 'J01CA04', brandName: 'Amoxil' },
    ]))
    expect(recs).toHaveLength(1)
  })

  it('throws when the JSON root is not an array', () => {
    expect(() => parseBrandedDataset('{}')).toThrow(/array/i)
  })

  it('the committed example dataset template parses into valid records', () => {
    const recs = parseBrandedDataset(readFileSync(exampleFile, 'utf8'))
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.every((r) => r.genericAtcCode && r.brandName)).toBe(true)
    expect(recs[0].presentations.length).toBeGreaterThan(0)
  })
})

describe('runBrandedMedicationsEtl', () => {
  function deps() {
    return {
      upsertBrands: vi.fn(async (rows: Array<Record<string, unknown>>) =>
        rows.map((r, i) => ({ id: `B-${i}`, generic_atc_code: r.generic_atc_code, brand_name: r.brand_name, manufacturer: r.manufacturer }))),
      upsertPresentations: vi.fn(async () => {}),
      fetchCatalogBrandNames: vi.fn(async () => [
        { atc_code: 'J01CR02', brand_names: ['Augmentin'] },
        { atc_code: 'J01CA04', brand_names: [] },
      ]),
      upsertCatalogBrandNames: vi.fn(async () => {}),
    }
  }

  const records = [
    { genericAtcCode: 'J01CR02', brandName: 'Augmentin', manufacturer: 'GSK', presentations: [{ strength: '625 mg', doseForm: 'tablet', packSize: 14, referencePrice: 12.5, currency: 'AFN' }] },
    { genericAtcCode: 'J01CA04', brandName: 'Amoxil', presentations: [] },
  ]

  it('upserts brand rows (empty manufacturer default) and presentation rows keyed to their brand', async () => {
    const d = deps()
    const res = await runBrandedMedicationsEtl({ records, ...d })

    const brandRows = d.upsertBrands.mock.calls[0][0]
    expect(brandRows).toHaveLength(2)
    expect(brandRows.find((b: Record<string, unknown>) => b.brand_name === 'Amoxil')!.manufacturer).toBe('')

    const presRows = d.upsertPresentations.mock.calls[0][0]
    expect(presRows).toHaveLength(1)
    expect(presRows[0].brand_id).toBe('B-0')
    expect(presRows[0].presentation_key).toBe('625 mg|tablet|14||')
    expect(presRows[0].reference_price).toBe(12.5)

    expect(res.brands).toBe(2)
    expect(res.presentations).toBe(1)
  })

  it('updates the drug_catalog.brand_names shadow only where a name was added', async () => {
    const d = deps()
    await runBrandedMedicationsEtl({ records, ...d })

    const updates = d.upsertCatalogBrandNames.mock.calls[0][0]
    // J01CA04 gains "Amoxil"; J01CR02 already has "Augmentin" -> not updated.
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ atc_code: 'J01CA04', brand_names: ['Amoxil'] })
  })
})
