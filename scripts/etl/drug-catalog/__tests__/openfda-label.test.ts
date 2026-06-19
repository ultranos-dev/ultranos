import { describe, it, expect, vi } from 'vitest'
import { openFdaUrl, cleanText, parseOpenFdaLabel, fetchOpenFdaLabel, stripSectionHeader } from '../sources/openfda-label.js'

const RESP = {
  results: [{
    openfda: { generic_name: ['METRONIDAZOLE'] },
    contraindications: ['4 CONTRAINDICATIONS Metronidazole is contraindicated in patients with hypersensitivity. It is also contraindicated in the first trimester.'],
    pregnancy: ['8.1 PREGNANCY RISK SUMMARY There are no adequate studies in pregnant women. Pregnancy Category B applies.'],
    nursing_mothers: ['Metronidazole is present in human milk at concentrations similar to maternal serum.'],
  }],
}

describe('openfda-label', () => {
  it('builds the URL, adds api_key when provided', () => {
    expect(openFdaUrl('metronidazole')).toContain('openfda.generic_name')
    expect(openFdaUrl('metronidazole')).not.toContain('api_key')
    expect(openFdaUrl('metronidazole', 'K')).toContain('api_key=K')
  })
  it('cleanText strips html + collapses ws', () => {
    expect(cleanText('<p>a  b</p>')).toBe('a b')
    expect(cleanText(undefined)).toBeUndefined()
  })
  it('stripSectionHeader removes leading number and ALL-CAPS heading only', () => {
    expect(stripSectionHeader('4 CONTRAINDICATIONS Hypersensitivity to drug.')).toBe('Hypersensitivity to drug.')
    expect(stripSectionHeader('8.1 PREGNANCY RISK SUMMARY text here')).toBe('text here')
    expect(stripSectionHeader('Metronidazole is contraindicated')).toBe('Metronidazole is contraindicated')
  })
  it('parses pregnancyClinical (pregnancy + lactation + legacy category) and contraindications', () => {
    const l = parseOpenFdaLabel(RESP)!
    expect(l.pregnancyClinical?.pregnancy).not.toMatch(/^8\.1/)
    expect(l.pregnancyClinical?.pregnancy).not.toMatch(/^PREGNANCY RISK SUMMARY/)
    expect(l.pregnancyClinical?.pregnancy).toContain('no adequate studies')
    expect(l.pregnancyClinical?.legacyCategory).toBe('B')
    expect(l.contraindications[0]).not.toMatch(/^4 CONTRAINDICATIONS/)
    expect(l.contraindications[0]).toContain('hypersensitivity')
    expect(l.pregnancyClinical?.lactation).toContain('human milk')
  })
  it('returns null when results empty', () => {
    expect(parseOpenFdaLabel({ results: [] })).toBeNull()
    expect(parseOpenFdaLabel({})).toBeNull()
  })
  it('fetch returns parsed on 200, null on 404/500/throw', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => RESP } as Response)
    expect((await fetchOpenFdaLabel('metronidazole', undefined, ok as unknown as typeof fetch))!.contraindications.length).toBeGreaterThan(0)
    const notfound = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)
    expect(await fetchOpenFdaLabel('x', undefined, notfound as unknown as typeof fetch)).toBeNull()
    const threw = vi.fn().mockRejectedValue(new Error('net'))
    expect(await fetchOpenFdaLabel('x', undefined, threw as unknown as typeof fetch)).toBeNull()
  })
})
