import { describe, it, expect, vi } from 'vitest'
import { stripHtml, extractUses, parseMedlinePlus, medlinePlusUrl, fetchMedlinePlusProse } from '../sources/medlineplus.js'

const FEED = {
  feed: {
    entry: [
      {
        title: { _value: 'Metronidazole' },
        summary: { _value: '<p>Metronidazole is used to treat infections.</p><p>It is used to:</p><ul><li>treat bacterial infections</li><li>treat parasites</li></ul>', _type: 'html' },
        link: [{ href: 'https://medlineplus.gov/druginfo/meds/a689011.html' }],
      },
      { title: { _value: 'Antibiotics' }, summary: { _value: '<p>other topic</p>' }, link: [{ href: 'x' }] },
    ],
  },
}

describe('medlineplus', () => {
  it('builds the Connect URL with the RxNorm OID', () => {
    expect(medlinePlusUrl('6922')).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.88')
    expect(medlinePlusUrl('6922')).toContain('mainSearchCriteria.v.c=6922')
    expect(medlinePlusUrl('6922')).toContain('knowledgeResponseType=application/json')
  })
  it('stripHtml removes tags and entities, collapses whitespace', () => {
    expect(stripHtml('<p>a&amp;b</p>  <b>c</b>')).toBe('a b c')
  })
  it('extractUses pulls <li> items', () => {
    expect(extractUses('<ul><li>treat infections</li><li>treat parasites</li></ul>')).toEqual(['treat infections', 'treat parasites'])
  })
  it('parseMedlinePlus uses entry[0], strips summary, extracts uses', () => {
    const p = parseMedlinePlus(FEED)!
    expect(p.summary).toContain('Metronidazole is used to treat infections')
    expect(p.summary).not.toContain('<')
    expect(p.uses).toEqual(['treat bacterial infections', 'treat parasites'])
    expect(p.url).toContain('a689011')
  })
  it('parseMedlinePlus returns null when no entries', () => {
    expect(parseMedlinePlus({ feed: {} })).toBeNull()
    expect(parseMedlinePlus({ feed: { entry: [] } })).toBeNull()
  })
  it('parseMedlinePlus normalizes a single-object entry', () => {
    const single = { feed: { entry: { title: { _value: 'X' }, summary: { _value: '<p>hi</p>' }, link: [{ href: 'u' }] } } }
    expect(parseMedlinePlus(single)!.summary).toBe('hi')
  })
  it('fetchMedlinePlusProse returns parsed prose on 200, null on error', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => FEED } as Response)
    expect((await fetchMedlinePlusProse('6922', ok as unknown as typeof fetch))!.uses.length).toBe(2)
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchMedlinePlusProse('6922', bad as unknown as typeof fetch)).toBeNull()
    const threw = vi.fn().mockRejectedValue(new Error('net'))
    expect(await fetchMedlinePlusProse('6922', threw as unknown as typeof fetch)).toBeNull()
  })
})
