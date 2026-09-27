import { describe, it, expect } from 'vitest'
import {
  capabilitiesForTier,
  fullFormCapabilities,
  minimizedFormCapabilities,
  readOnlyFormCapabilities,
  isSectionVisible,
  isSectionEditable,
} from '../capabilities.js'
import type { PatientFormSection } from '../types.js'

const ALL: PatientFormSection[] = [
  'photo', 'identity', 'demographics', 'nationalId',
  'contact', 'address', 'social', 'allergies', 'vitals', 'consent',
]

describe('capabilitiesForTier', () => {
  it('FULL and CLINICAL make every section editable (same-org, incl. lab)', () => {
    for (const tier of ['FULL', 'CLINICAL'] as const) {
      const caps = capabilitiesForTier(tier)!
      expect(caps).toBe(fullFormCapabilities)
      for (const s of ALL) expect(isSectionEditable(caps, s)).toBe(true)
      expect(caps.runDuplicateCheck).toBe(true)
    }
  })

  it('MINIMIZED (cross-org lab) exposes only MPI-registration fields, hides clinical records', () => {
    const caps = capabilitiesForTier('MINIMIZED')!
    expect(caps).toBe(minimizedFormCapabilities)
    // MPI/registration fields editable
    for (const s of ['identity', 'demographics', 'nationalId', 'contact'] as const) {
      expect(isSectionEditable(caps, s)).toBe(true)
    }
    // Clinical sub-records must NOT be capturable by a cross-org lab
    for (const s of ['vitals', 'consent', 'allergies', 'social', 'photo'] as const) {
      expect(isSectionVisible(caps, s)).toBe(false)
    }
    expect(caps.runDuplicateCheck).toBe(true)
  })

  it('CONTINUITY (cross-org consented) is fully read-only, no dedupe', () => {
    const caps = capabilitiesForTier('CONTINUITY')!
    expect(caps).toBe(readOnlyFormCapabilities)
    for (const s of ALL) {
      expect(isSectionVisible(caps, s)).toBe(true)
      expect(isSectionEditable(caps, s)).toBe(false)
    }
    expect(caps.runDuplicateCheck).toBe(false)
  })

  it('NONE does not render the form', () => {
    expect(capabilitiesForTier('NONE')).toBeNull()
  })

  it('presets are independent objects (no shared section mutation)', () => {
    expect(fullFormCapabilities.sections).not.toBe(minimizedFormCapabilities.sections)
    minimizedFormCapabilities.sections.identity // read — must not throw
    expect(fullFormCapabilities.sections.identity).toBe('edit')
  })
})
