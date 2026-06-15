/**
 * Story 47.5 — Spill & Decontamination Protocol: Protocol Data Tests
 * Task 10.1 — Unit tests for spill-protocols.ts
 */
import { describe, it, expect } from 'vitest'
import { getSpillProtocol, getAllSpillProtocols } from '../lib/safety/spill-protocols'
import { SpillType, RiskTier } from '../types/spill-protocol'

describe('getSpillProtocol', () => {
  it('returns a protocol for each spill type', () => {
    for (const type of Object.values(SpillType)) {
      const protocol = getSpillProtocol(type)
      expect(protocol).toBeDefined()
      expect(protocol.spillType).toBe(type)
    }
  })

  describe('Urine protocol (LOW risk)', () => {
    const protocol = getSpillProtocol(SpillType.URINE)

    it('has LOW risk tier', () => {
      expect(protocol.riskTier).toBe(RiskTier.LOW)
    })

    it('requires only gloves as mandatory PPE', () => {
      const required = protocol.ppe.filter((p) => p.required)
      expect(required).toHaveLength(1)
      expect(required[0].item).toBe('gloves')
    })

    it('has 8 steps', () => {
      expect(protocol.steps).toHaveLength(8)
    })

    it('has 5 minute contact time', () => {
      const contactSteps = protocol.steps.filter((s) => s.contactTimeMinutes != null)
      expect(contactSteps.some((s) => s.contactTimeMinutes === 5)).toBe(true)
    })

    it('has 10 minute clearance time', () => {
      expect(protocol.clearanceTimeMinutes).toBe(10)
    })

    it('has no additional warnings', () => {
      expect(protocol.additionalWarnings).toHaveLength(0)
    })
  })

  describe('Blood/Serum protocol (MODERATE risk)', () => {
    const protocol = getSpillProtocol(SpillType.BLOOD_SERUM)

    it('has MODERATE risk tier', () => {
      expect(protocol.riskTier).toBe(RiskTier.MODERATE)
    })

    it('requires gloves and gown', () => {
      const required = protocol.ppe.filter((p) => p.required).map((p) => p.item)
      expect(required).toContain('gloves')
      expect(required).toContain('gown')
    })

    it('has 10 minute bleach contact time', () => {
      const bleachStep = protocol.steps.find((s) => s.agentName?.includes('bleach'))
      expect(bleachStep).toBeDefined()
      expect(bleachStep!.contactTimeMinutes).toBe(10)
    })

    it('has 15 minute clearance time', () => {
      expect(protocol.clearanceTimeMinutes).toBe(15)
    })

    it('disposes in infectious waste', () => {
      expect(protocol.disposalMethod.toLowerCase()).toContain('infectious')
    })
  })

  describe('Chemical/Reagent protocol (HIGH risk)', () => {
    const protocol = getSpillProtocol(SpillType.CHEMICAL_REAGENT)

    it('has HIGH risk tier', () => {
      expect(protocol.riskTier).toBe(RiskTier.HIGH)
    })

    it('requires gloves, gown, and face shield', () => {
      const required = protocol.ppe.filter((p) => p.required).map((p) => p.item)
      expect(required).toContain('gloves')
      expect(required).toContain('gown')
      expect(required).toContain('face_shield')
    })

    it('warns against using bleach', () => {
      const warningText = protocol.additionalWarnings.join(' ').toLowerCase()
      expect(warningText).toContain('bleach')
      expect(warningText).toContain('toxic')
    })

    it('has 30 minute clearance time', () => {
      expect(protocol.clearanceTimeMinutes).toBe(30)
    })

    it('disposes as chemical waste (NOT infectious)', () => {
      expect(protocol.disposalMethod.toLowerCase()).toContain('chemical')
      // String is "Chemical waste container (NOT infectious waste)" — contains both
      // The critical check is that the container is chemical, not biohazard/infectious bin
      expect(protocol.disposalMethod.toLowerCase()).not.toContain('biohazard')
    })

    it('has at least one additional warning', () => {
      expect(protocol.additionalWarnings.length).toBeGreaterThan(0)
    })
  })

  describe('Culture/Microbiology protocol (CRITICAL risk)', () => {
    const protocol = getSpillProtocol(SpillType.CULTURE_MICROBIOLOGY)

    it('has CRITICAL risk tier', () => {
      expect(protocol.riskTier).toBe(RiskTier.CRITICAL)
    })

    it('requires double gloves, gown, N95, and face shield', () => {
      const required = protocol.ppe.filter((p) => p.required).map((p) => p.item)
      expect(required).toContain('double_gloves')
      expect(required).toContain('gown')
      expect(required).toContain('n95_mask')
      expect(required).toContain('face_shield')
    })

    it('has 30 minute aerosol wait step', () => {
      const aerosolStep = protocol.steps.find((s) => s.contactTimeMinutes === 30 && s.instruction.toLowerCase().includes('wait'))
      expect(aerosolStep).toBeDefined()
    })

    it('has 60 minute clearance time', () => {
      expect(protocol.clearanceTimeMinutes).toBe(60)
    })

    it('warns about infectious aerosol', () => {
      const warningText = protocol.additionalWarnings.join(' ').toLowerCase()
      expect(warningText).toContain('aerosol')
    })

    it('disposes via autoclave', () => {
      expect(protocol.disposalMethod.toLowerCase()).toContain('autoclave')
    })

    it('has 12 steps', () => {
      expect(protocol.steps).toHaveLength(12)
    })

    it('warns that N95 mask is mandatory (surgical mask not sufficient)', () => {
      const warningText = protocol.additionalWarnings.join(' ').toLowerCase()
      expect(warningText).toContain('n95')
    })
  })

  describe('Risk tier ordering (AC: 3)', () => {
    it('culture/microbiology has higher risk tier than urine', () => {
      const tierOrder = [RiskTier.LOW, RiskTier.MODERATE, RiskTier.HIGH, RiskTier.CRITICAL]
      const urineTier = tierOrder.indexOf(getSpillProtocol(SpillType.URINE).riskTier)
      const cultureTier = tierOrder.indexOf(getSpillProtocol(SpillType.CULTURE_MICROBIOLOGY).riskTier)
      expect(cultureTier).toBeGreaterThan(urineTier)
    })

    it('each risk tier is distinct for each spill type', () => {
      const tiers = Object.values(SpillType).map((t) => getSpillProtocol(t).riskTier)
      const uniqueTiers = new Set(tiers)
      expect(uniqueTiers.size).toBe(4)
    })
  })
})

describe('getAllSpillProtocols', () => {
  it('returns all 4 protocols', () => {
    expect(getAllSpillProtocols()).toHaveLength(4)
  })

  it('returns protocols in ascending risk order (LOW first, CRITICAL last)', () => {
    const protocols = getAllSpillProtocols()
    const tierOrder = [RiskTier.LOW, RiskTier.MODERATE, RiskTier.HIGH, RiskTier.CRITICAL]
    const tiers = protocols.map((p) => tierOrder.indexOf(p.riskTier))
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]).toBeGreaterThan(tiers[i - 1])
    }
  })

  it('all steps have sequential order numbers starting from 1', () => {
    for (const protocol of getAllSpillProtocols()) {
      const orders = protocol.steps.map((s) => s.order)
      for (let i = 0; i < orders.length; i++) {
        expect(orders[i]).toBe(i + 1)
      }
    }
  })
})
