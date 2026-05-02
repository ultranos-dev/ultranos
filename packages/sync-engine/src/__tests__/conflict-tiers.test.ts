import { describe, it, expect } from 'vitest'
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

  it('defaults unknown resource types to TIER_3', () => {
    expect(getConflictTier('UnknownResource')).toBe('TIER_3')
  })
})
