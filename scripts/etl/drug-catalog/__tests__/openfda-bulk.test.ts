import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractBulkLabel, streamPartition, buildOpenFdaBulk, candidateNamesFor, INN_US_ALIASES } from '../sources/openfda-bulk.js'

const DIRX = dirname(fileURLToPath(import.meta.url))
const DIR = join(DIRX, 'fixtures', 'openfda-bulk')
const PART = join(DIR, 'drug-label-0001-of-0013.json')

describe('openfda-bulk', () => {
  it('extractBulkLabel pulls all four fields, headers stripped', () => {
    const f = extractBulkLabel({
      pregnancy: ['8.1 Pregnancy Risk Summary no adequate studies. Category B applies.'],
      nursing_mothers: ['present in milk.'],
      contraindications: ['4 CONTRAINDICATIONS Hypersensitivity to drug.'],
      dosage_and_administration: ['2 DOSAGE AND ADMINISTRATION Two grams orally.'],
      boxed_warning: ['WARNING: CARCINOGENICITY carcinogenic in mice.'],
    })!
    expect(f.pregnancyClinical?.pregnancy).toContain('no adequate studies')
    expect(f.pregnancyClinical?.lactation).toBe('present in milk.')
    expect(f.pregnancyClinical?.legacyCategory).toBe('B')
    expect(f.contraindications[0]).not.toMatch(/^4 CONTRAINDICATIONS/)
    expect(f.contraindications[0]).toContain('Hypersensitivity')
    expect(f.administrationNotes).toContain('Two grams orally')
    expect(f.administrationNotes).not.toMatch(/^2 DOSAGE/)
    expect(f.warnings).toContain('carcinogenic in mice')
  })
  it('extractBulkLabel returns null when nothing useful', () => {
    expect(extractBulkLabel({ openfda: { generic_name: ['X'] } })).toBeNull()
  })
  it('streamPartition yields each result with its generic names', async () => {
    const seen: string[] = []
    const n = await streamPartition(PART, (names) => seen.push(names.join('|')))
    expect(n).toBe(4)
    expect(seen).toContain('METRONIDAZOLE')
  })
  it('buildOpenFdaBulk matches catalog names (lowercased) via nameToCanonical Map, merges across labels', async () => {
    const m = await buildOpenFdaBulk(DIR, new Map([['metronidazole', 'metronidazole']]))
    const f = m.get('metronidazole')!
    expect(f).toBeTruthy()
    expect(f.pregnancyClinical?.legacyCategory).toBe('B')
    expect(f.warnings).toContain('carcinogenic')
    expect(f.administrationNotes).toContain('Two grams')
    expect(m.has('budesonide and formoterol fumarate')).toBe(false)
  })
  it('buildOpenFdaBulk resolves INN→USAN alias: ASPIRIN label maps to acetylsalicylic acid canonical', async () => {
    // nameToCanonical maps both the INN and the USAN alias to the canonical INN
    const nameToCanonical = new Map([
      ['aspirin', 'acetylsalicylic acid'],
      ['acetylsalicylic acid', 'acetylsalicylic acid'],
    ])
    const m = await buildOpenFdaBulk(DIR, nameToCanonical)
    expect(m.has('acetylsalicylic acid')).toBe(true)
    const f = m.get('acetylsalicylic acid')!
    expect(f.contraindications.length).toBeGreaterThan(0)
  })
  it('INN_US_ALIASES and candidateNamesFor are exported and correct', () => {
    expect(INN_US_ALIASES['acetylsalicylic acid']).toBe('aspirin')
    expect(INN_US_ALIASES['paracetamol']).toBe('acetaminophen')
    expect(candidateNamesFor('acetylsalicylic acid')).toEqual(['acetylsalicylic acid', 'aspirin'])
    expect(candidateNamesFor('metronidazole')).toEqual(['metronidazole'])
  })
})
