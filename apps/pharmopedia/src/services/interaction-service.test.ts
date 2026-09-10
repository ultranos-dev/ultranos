import { describe, it, expect, beforeEach } from 'vitest'
import { checkInteractions, invalidateCache } from '@ultranos/drug-db'
import {
  flattenInteractionEntries,
  createInteractionAdapterFromDrugs,
  type DrugWithInteractions,
} from '@/services/interaction-service'

const WARFARIN: DrugWithInteractions = {
  name: 'Warfarin',
  interactions: [
    { drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MAJOR', mechanism: 'Increased bleeding risk' },
    { drugAtcCode: 'J01CA04', drugName: 'Amoxicillin', severity: 'MODERATE', mechanism: 'INR elevation' },
  ],
}

describe('flattenInteractionEntries', () => {
  it('flattens per-drug monograph interactions into bidirectional pairwise entries', () => {
    expect(flattenInteractionEntries([WARFARIN])).toEqual([
      { drugA: 'Warfarin', drugB: 'Aspirin', severity: 'MAJOR', description: 'Increased bleeding risk' },
      { drugA: 'Warfarin', drugB: 'Amoxicillin', severity: 'MODERATE', description: 'INR elevation' },
    ])
  })

  it('tolerates drugs with no interactions', () => {
    expect(flattenInteractionEntries([{ name: 'Paracetamol', interactions: [] }])).toEqual([])
  })
})

describe('Pharmapedia interaction check (shared @ultranos/drug-db checker)', () => {
  // The checker caches its lookup map at module level — reset between cases so
  // each test builds a fresh map from its own adapter.
  beforeEach(() => invalidateCache())

  it('detects a known interaction between a candidate drug and the entered med list', async () => {
    const adapter = createInteractionAdapterFromDrugs([WARFARIN])
    const summary = await checkInteractions('Warfarin', ['Aspirin'], undefined, adapter)
    expect(summary.result).not.toBe('CLEAR')
    expect(summary.interactions.length).toBeGreaterThan(0)
  })

  it('Rule 3: returns UNAVAILABLE (never a false CLEAR) when the local interaction DB is empty', async () => {
    const emptyAdapter = createInteractionAdapterFromDrugs([])
    const summary = await checkInteractions('Warfarin', ['Aspirin'], undefined, emptyAdapter)
    expect(summary.result).toBe('UNAVAILABLE')
  })
})
