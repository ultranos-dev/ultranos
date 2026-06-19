import { describe, it, expect } from 'vitest'
import { deriveDdiSeverity, DDI_SEVERITY_REVIEWED } from '../transforms/ddi-severity.js'

describe('deriveDdiSeverity', () => {
  it('flags contraindication language', () => {
    expect(deriveDdiSeverity('The concomitant use is contraindicated.')).toBe('CONTRAINDICATED')
    expect(deriveDdiSeverity('Avoid combination; risk of serotonin syndrome.')).toBe('MAJOR')
  })
  it('maps increased-risk / activity language to MODERATE', () => {
    expect(deriveDdiSeverity('Apixaban may increase the anticoagulant activities of Lepirudin.')).toBe('MODERATE')
  })
  it('defaults to MINOR when no signal words present', () => {
    expect(deriveDdiSeverity('The metabolism can be altered.')).toBe('MINOR')
  })
  it('is advisory-only until clinically reviewed', () => {
    expect(DDI_SEVERITY_REVIEWED).toBe(false)
  })
})
