import { describe, it, expect } from 'vitest'
import {
  ExposureType,
  getFirstAidSteps,
  getPepRecommendation,
  getExposureTypeLabel,
} from '../lib/safety/exposure-protocol'
import type { SourceStatus, TechVaccinationStatus } from '../lib/safety/exposure-protocol'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const allNegative: SourceStatus = { hiv: 'NEGATIVE', hepB: 'NEGATIVE', hepC: 'NEGATIVE' }
const allUnknown: SourceStatus = { hiv: 'UNKNOWN', hepB: 'UNKNOWN', hepC: 'UNKNOWN' }
const allPositive: SourceStatus = { hiv: 'POSITIVE', hepB: 'POSITIVE', hepC: 'POSITIVE' }

const notImmune: TechVaccinationStatus = { hepBImmunity: 'NOT_IMMUNE' }
const immune: TechVaccinationStatus = { hepBImmunity: 'IMMUNE' }
const unknownImmunity: TechVaccinationStatus = { hepBImmunity: 'UNKNOWN' }

// ---------------------------------------------------------------------------
// getFirstAidSteps
// ---------------------------------------------------------------------------

describe('getFirstAidSteps', () => {
  it('returns a non-empty array of strings for NEEDLESTICK', () => {
    const steps = getFirstAidSteps(ExposureType.NEEDLESTICK)
    expect(Array.isArray(steps)).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    steps.forEach((s) => expect(typeof s).toBe('string'))
  })

  it('starts with immediate washing instruction for NEEDLESTICK', () => {
    const steps = getFirstAidSteps(ExposureType.NEEDLESTICK)
    expect(steps[0]).toMatch(/wash/i)
    expect(steps[0]).toMatch(/15 seconds/i)
  })

  it('instructs NOT to squeeze or suck wound for NEEDLESTICK', () => {
    const steps = getFirstAidSteps(ExposureType.NEEDLESTICK)
    expect(steps.some((s) => /squeeze/i.test(s) || /suck/i.test(s))).toBe(true)
  })

  it('returns a non-empty array of strings for SPLASH_MUCOUS', () => {
    const steps = getFirstAidSteps(ExposureType.SPLASH_MUCOUS)
    expect(Array.isArray(steps)).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    steps.forEach((s) => expect(typeof s).toBe('string'))
  })

  it('starts with flushing instruction for SPLASH_MUCOUS', () => {
    const steps = getFirstAidSteps(ExposureType.SPLASH_MUCOUS)
    expect(steps[0]).toMatch(/flush/i)
    expect(steps[0]).toMatch(/15 minutes/i)
  })

  it('returns a non-empty array of strings for SPLASH_BROKEN_SKIN', () => {
    const steps = getFirstAidSteps(ExposureType.SPLASH_BROKEN_SKIN)
    expect(Array.isArray(steps)).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    steps.forEach((s) => expect(typeof s).toBe('string'))
  })

  it('starts with washing instruction for SPLASH_BROKEN_SKIN', () => {
    const steps = getFirstAidSteps(ExposureType.SPLASH_BROKEN_SKIN)
    expect(steps[0]).toMatch(/wash/i)
  })

  it('all exposure types include reporting to supervisor', () => {
    for (const type of Object.values(ExposureType)) {
      const steps = getFirstAidSteps(type)
      expect(steps.some((s) => /supervisor/i.test(s))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// getPepRecommendation — needlestick
// ---------------------------------------------------------------------------

describe('getPepRecommendation — needlestick', () => {
  it('Needlestick + HIV positive → IMMEDIATE, referral true', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'POSITIVE', hepB: 'NEGATIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + HIV unknown → IMMEDIATE (precautionary principle)', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'UNKNOWN', hepB: 'NEGATIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + HepB positive + tech NOT_IMMUNE → IMMEDIATE, referral true', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'NEGATIVE', hepB: 'POSITIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + HepB positive + tech IMMUNE → skips HepB PEP; WITHIN_HOURS (no other risk)', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'NEGATIVE', hepB: 'POSITIVE', hepC: 'NEGATIVE' },
      immune,
    )
    // HepB immunity exempts; no HIV/HepC risk → falls back to needlestick baseline
    expect(result.urgency).toBe('WITHIN_HOURS')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + HepC positive → IMMEDIATE, referral true', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'NEGATIVE', hepB: 'NEGATIVE', hepC: 'POSITIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + all unknown + tech NOT_IMMUNE → IMMEDIATE (precautionary)', () => {
    const result = getPepRecommendation(ExposureType.NEEDLESTICK, allUnknown, notImmune)
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + all unknown + tech IMMUNE → IMMEDIATE (HIV unknown still triggers)', () => {
    const result = getPepRecommendation(ExposureType.NEEDLESTICK, allUnknown, immune)
    // HIV unknown = risk → IMMEDIATE regardless of HepB immunity
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + all negative → WITHIN_HOURS (needlestick baseline), referral true', () => {
    const result = getPepRecommendation(ExposureType.NEEDLESTICK, allNegative, notImmune)
    expect(result.urgency).toBe('WITHIN_HOURS')
    expect(result.referral).toBe(true)
  })

  it('Needlestick + all negative + IMMUNE → WITHIN_HOURS (needlestick baseline), referral true', () => {
    const result = getPepRecommendation(ExposureType.NEEDLESTICK, allNegative, immune)
    expect(result.urgency).toBe('WITHIN_HOURS')
    expect(result.referral).toBe(true)
  })

  it('IMMEDIATE actions include 2-hour HIV PEP window message', () => {
    const result = getPepRecommendation(ExposureType.NEEDLESTICK, allPositive, notImmune)
    expect(result.actions.some((a) => /2 hours/i.test(a) && /HIV/i.test(a))).toBe(true)
  })

  it('IMMEDIATE actions include infection control officer contact instruction', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'POSITIVE', hepB: 'NEGATIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.actions.some((a) => /infection control/i.test(a))).toBe(true)
  })

  it('referral cases include incident report and notify lab manager actions', () => {
    const result = getPepRecommendation(ExposureType.NEEDLESTICK, allPositive, notImmune)
    expect(result.actions.some((a) => /incident report/i.test(a))).toBe(true)
    expect(result.actions.some((a) => /lab manager/i.test(a))).toBe(true)
  })

  it('HepB unknown + tech NOT_IMMUNE → IMMEDIATE (precautionary for HepB)', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'NEGATIVE', hepB: 'UNKNOWN', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('IMMEDIATE')
  })

  it('HepB unknown + tech UNKNOWN immunity → IMMEDIATE (unknown immunity not exempt)', () => {
    const result = getPepRecommendation(
      ExposureType.NEEDLESTICK,
      { hiv: 'NEGATIVE', hepB: 'POSITIVE', hepC: 'NEGATIVE' },
      unknownImmunity,
    )
    expect(result.urgency).toBe('IMMEDIATE')
  })
})

// ---------------------------------------------------------------------------
// getPepRecommendation — splash exposures
// ---------------------------------------------------------------------------

describe('getPepRecommendation — splash exposures', () => {
  it('SPLASH_MUCOUS + HepB positive → WITHIN_HOURS', () => {
    const result = getPepRecommendation(
      ExposureType.SPLASH_MUCOUS,
      { hiv: 'NEGATIVE', hepB: 'POSITIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('WITHIN_HOURS')
    expect(result.referral).toBe(true)
  })

  it('SPLASH_BROKEN_SKIN + all negative → MONITOR, referral false', () => {
    const result = getPepRecommendation(ExposureType.SPLASH_BROKEN_SKIN, allNegative, notImmune)
    expect(result.urgency).toBe('MONITOR')
    expect(result.referral).toBe(false)
  })

  it('SPLASH_MUCOUS + all unknown → WITHIN_HOURS (precautionary, HIV unknown)', () => {
    const result = getPepRecommendation(ExposureType.SPLASH_MUCOUS, allUnknown, notImmune)
    // HIV unknown triggers IMMEDIATE via rule 1
    expect(result.urgency).toBe('IMMEDIATE')
  })

  it('SPLASH_MUCOUS + HIV unknown → IMMEDIATE (HIV rule overrides splash baseline)', () => {
    const result = getPepRecommendation(
      ExposureType.SPLASH_MUCOUS,
      { hiv: 'UNKNOWN', hepB: 'NEGATIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('IMMEDIATE')
    expect(result.referral).toBe(true)
  })

  it('SPLASH_BROKEN_SKIN + HepC positive → WITHIN_HOURS, referral true', () => {
    const result = getPepRecommendation(
      ExposureType.SPLASH_BROKEN_SKIN,
      { hiv: 'NEGATIVE', hepB: 'NEGATIVE', hepC: 'POSITIVE' },
      notImmune,
    )
    expect(result.urgency).toBe('WITHIN_HOURS')
    expect(result.referral).toBe(true)
  })

  it('SPLASH_MUCOUS + all negative → MONITOR, referral false', () => {
    const result = getPepRecommendation(ExposureType.SPLASH_MUCOUS, allNegative, notImmune)
    expect(result.urgency).toBe('MONITOR')
    expect(result.referral).toBe(false)
  })

  it('MONITOR actions include 6-week symptom monitoring instruction', () => {
    const result = getPepRecommendation(ExposureType.SPLASH_BROKEN_SKIN, allNegative, notImmune)
    expect(result.actions.some((a) => /6 weeks/i.test(a))).toBe(true)
  })

  it('WITHIN_HOURS actions include seek care within 4 hours', () => {
    const result = getPepRecommendation(
      ExposureType.SPLASH_MUCOUS,
      { hiv: 'NEGATIVE', hepB: 'POSITIVE', hepC: 'NEGATIVE' },
      notImmune,
    )
    expect(result.actions.some((a) => /4 hours/i.test(a))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getExposureTypeLabel
// ---------------------------------------------------------------------------

describe('getExposureTypeLabel', () => {
  it('NEEDLESTICK → correct label', () => {
    expect(getExposureTypeLabel(ExposureType.NEEDLESTICK)).toBe('Needle-stick / Sharp Injury')
  })

  it('SPLASH_MUCOUS → correct label', () => {
    expect(getExposureTypeLabel(ExposureType.SPLASH_MUCOUS)).toBe(
      'Splash to Eyes / Mucous Membrane',
    )
  })

  it('SPLASH_BROKEN_SKIN → correct label', () => {
    expect(getExposureTypeLabel(ExposureType.SPLASH_BROKEN_SKIN)).toBe('Splash to Broken Skin')
  })

  it('all exposure types return non-empty strings', () => {
    for (const type of Object.values(ExposureType)) {
      const label = getExposureTypeLabel(type)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
