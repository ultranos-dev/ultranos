import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseEnforcement, buildRecallsByDrug } from '../sources/openfda-enforcement.js'

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'enforcement.json')

describe('openfda-enforcement', () => {
  it('parseEnforcement maps fields + formats date + lowercases names', () => {
    const p = parseEnforcement({ recall_number: 'D-1', status: 'Ongoing', reason_for_recall: 'Sterility',
      recall_initiation_date: '20260512', openfda: { generic_name: ['ASPIRIN'] } })!
    expect(p.recall).toEqual({ recallId: 'D-1', description: 'Sterility', initiationDate: '2026-05-12', status: 'Ongoing' })
    expect(p.names).toEqual(['aspirin'])
  })
  it('parseEnforcement returns null without recall_number or openfda names', () => {
    expect(parseEnforcement({ status: 'x', openfda: { generic_name: ['A'] } })).toBeNull()
    expect(parseEnforcement({ recall_number: 'D-2' })).toBeNull()
  })
  it('buildRecallsByDrug groups by canonical, newest-first, drops unmatched', () => {
    const m = buildRecallsByDrug(FILE, new Map([['metronidazole', 'metronidazole']]))
    const recalls = m.get('metronidazole')!
    expect(recalls).toHaveLength(2)
    expect(recalls[0].recallId).toBe('D-0554-2026')  // newest first
    expect(recalls[1].recallId).toBe('D-0100-2025')
    expect(m.size).toBe(1)  // the no-openfda record dropped
  })
})
