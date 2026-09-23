import { describe, it, expect, vi } from 'vitest'
import { getConflictTier } from '../conflict-tiers.js'

describe('getConflictTier', () => {
  it('maps AllergyIntolerance to TIER_1', () => {
    expect(getConflictTier('AllergyIntolerance')).toBe('TIER_1')
  })

  it('maps MedicationRequest to TIER_1', () => {
    expect(getConflictTier('MedicationRequest')).toBe('TIER_1')
  })

  it('maps Condition to TIER_1', () => {
    expect(getConflictTier('Condition')).toBe('TIER_1')
  })

  it('maps ClinicalImpression to TIER_2', () => {
    expect(getConflictTier('ClinicalImpression')).toBe('TIER_2')
  })

  it('maps DiagnosticReport to TIER_2', () => {
    expect(getConflictTier('DiagnosticReport')).toBe('TIER_2')
  })

  it('maps Observation to TIER_2', () => {
    expect(getConflictTier('Observation')).toBe('TIER_2')
  })

  it('maps Patient to TIER_3', () => {
    expect(getConflictTier('Patient')).toBe('TIER_3')
  })

  it('maps KeyRevocationList to TIER_1', () => {
    expect(getConflictTier('KeyRevocationList')).toBe('TIER_1')
  })

  it('maps MedicationDispense to TIER_2', () => {
    expect(getConflictTier('MedicationDispense')).toBe('TIER_2')
  })

  it('maps Encounter to TIER_2', () => {
    expect(getConflictTier('Encounter')).toBe('TIER_2')
  })

  it('maps Consent to CONSENT', () => {
    expect(getConflictTier('Consent')).toBe('CONSENT')
  })

  it('defaults unknown resource types to TIER_2 (fail-safe: both versions kept, never LWW)', () => {
    // Story 60.2 (AC 4): an unmapped type must never silently fall to LWW.
    expect(getConflictTier('UnknownResource')).toBe('TIER_2')
  })

  it('warns exactly once per unmapped resource type (type name only)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      getConflictTier('NeverMappedTypeA')
      getConflictTier('NeverMappedTypeA')
      getConflictTier('NeverMappedTypeA')
      const callsForType = warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes('NeverMappedTypeA'),
      )
      expect(callsForType).toHaveLength(1)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
