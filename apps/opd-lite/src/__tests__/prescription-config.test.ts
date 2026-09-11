import { describe, it, expect } from 'vitest'
import { ROUTE_OPTIONS, formToRouteDefault, formToDosageUnit, EMPTY_PRESCRIPTION_FORM } from '@/lib/prescription-config'

describe('ROUTE_OPTIONS', () => {
  it('exposes the oral route with its SNOMED CT code', () => {
    const oral = ROUTE_OPTIONS.find((r) => r.code === 'PO')
    expect(oral).toBeDefined()
    expect(oral!.snomedCode).toBe('26643006')
    expect(oral!.display).toMatch(/oral/i)
  })

  it('every option carries a SNOMED CT code and display', () => {
    for (const opt of ROUTE_OPTIONS) {
      expect(opt.snomedCode).toMatch(/^\d+$/)
      expect(opt.display.length).toBeGreaterThan(0)
    }
  })
})

describe('formToRouteDefault', () => {
  it('infers oral for solid oral forms', () => {
    expect(formToRouteDefault('Capsule')).toBe('PO')
    expect(formToRouteDefault('Film-coated tablet')).toBe('PO')
  })

  it('infers oral for oral liquids', () => {
    expect(formToRouteDefault('Oral Suspension')).toBe('PO')
  })

  it('infers inhaled for inhalers', () => {
    expect(formToRouteDefault('Inhaler')).toBe('INHALED')
    expect(formToRouteDefault('Metered dose inhalation')).toBe('INHALED')
  })

  it('infers topical for patches and creams', () => {
    expect(formToRouteDefault('Transdermal patch')).toBe('TOP')
    expect(formToRouteDefault('Cream')).toBe('TOP')
  })

  it('infers rectal for suppositories', () => {
    expect(formToRouteDefault('Suppository')).toBe('PR')
  })

  it('infers ophthalmic for eye drops', () => {
    expect(formToRouteDefault('Eye drops')).toBe('OPHTH')
  })

  it('infers intravenous for injectables', () => {
    expect(formToRouteDefault('Solution for injection')).toBe('IV')
  })

  it('falls back to oral for unknown forms', () => {
    expect(formToRouteDefault('')).toBe('PO')
    expect(formToRouteDefault('Something novel')).toBe('PO')
  })

  it('every inferred code resolves to a real ROUTE_OPTIONS entry', () => {
    const codes = new Set(ROUTE_OPTIONS.map((r) => r.code))
    for (const form of ['Capsule', 'Inhaler', 'Cream', 'Suppository', 'Eye drops', 'Solution for injection', '']) {
      expect(codes.has(formToRouteDefault(form))).toBe(true)
    }
  })
})

describe('formToDosageUnit', () => {
  it('uses "capsule" for capsules (not "tablet")', () => {
    expect(formToDosageUnit('Capsule')).toBe('capsule')
    expect(formToDosageUnit('Hard capsule')).toBe('capsule')
  })

  it('uses "tablet" for tablets', () => {
    expect(formToDosageUnit('Film-coated tablet')).toBe('tablet')
  })

  it('treats a compound "Tablet for Oral Solution" as a tablet, not mL', () => {
    expect(formToDosageUnit('Tablet for Oral Solution')).toBe('tablet')
  })

  it('uses mL for oral liquids', () => {
    expect(formToDosageUnit('Oral Suspension')).toBe('mL')
    expect(formToDosageUnit('Syrup')).toBe('mL')
  })

  it('uses form-specific units for drops, patches, and inhalers', () => {
    expect(formToDosageUnit('Eye drops')).toBe('drop')
    expect(formToDosageUnit('Transdermal patch')).toBe('patch')
    expect(formToDosageUnit('Inhaler')).toBe('puff')
  })

  it('falls back to "dose" for unknown forms', () => {
    expect(formToDosageUnit('')).toBe('dose')
    expect(formToDosageUnit('Something novel')).toBe('dose')
  })
})

describe('EMPTY_PRESCRIPTION_FORM', () => {
  it('defaults the route to oral', () => {
    expect(EMPTY_PRESCRIPTION_FORM.route).toBe('PO')
  })
})
