/**
 * Medication-Lab Map — ATC key tests (Task 8 TDD)
 *
 * TDD: these tests are written BEFORE the map is re-keyed to ATC.
 * They fail against RxNorm keys, then pass once the map is updated.
 */

import { describe, it, expect } from 'vitest'
import { getMedicationMapping } from '../lib/monitoring/medication-lab-map'

describe('medication-lab-map ATC keys', () => {
  it('warfarin resolves by ATC B01AA03 → INR', () => {
    const m = getMedicationMapping('B01AA03')
    expect(m?.requiredTests[0]?.loincCode).toBe('6301-6')
  })

  it('does not resolve the old RxNorm key for warfarin', () => {
    expect(getMedicationMapping('RxNorm:11289')).toBeNull()
  })

  it('metformin resolves by ATC A10BA02 → Creatinine + eGFR', () => {
    const m = getMedicationMapping('A10BA02')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('2160-0')   // Creatinine
    expect(loincs).toContain('62238-1')  // eGFR
  })

  it('lithium resolves by ATC N05AN01 → Lithium level + TSH + Creatinine', () => {
    const m = getMedicationMapping('N05AN01')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('14334-7')  // Lithium serum
    expect(loincs).toContain('3016-3')   // TSH
    expect(loincs).toContain('2160-0')   // Creatinine
  })

  it('methotrexate resolves under oncology ATC L01BA01 → CBC + LFTs', () => {
    const m = getMedicationMapping('L01BA01')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('58410-2')  // CBC
    expect(loincs).toContain('24325-3')  // LFTs
  })

  it('methotrexate resolves under rheumatology ATC L04AX03 → CBC + LFTs', () => {
    const m = getMedicationMapping('L04AX03')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('58410-2')  // CBC
    expect(loincs).toContain('24325-3')  // LFTs
  })

  it('enalapril (ACE inhibitor) resolves by ATC C09AA02 → Potassium + Creatinine', () => {
    const m = getMedicationMapping('C09AA02')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('2823-3')   // Potassium
    expect(loincs).toContain('2160-0')   // Creatinine
  })

  it('carbamazepine resolves by ATC N03AF01 → CBC + LFTs + drug level', () => {
    const m = getMedicationMapping('N03AF01')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('58410-2')  // CBC
    expect(loincs).toContain('24325-3')  // LFTs
    expect(loincs).toContain('3428-0')   // Carbamazepine level
  })

  it('amiodarone resolves by ATC C01BD01 → TSH + LFTs', () => {
    const m = getMedicationMapping('C01BD01')
    expect(m).not.toBeNull()
    const loincs = m!.requiredTests.map((t) => t.loincCode)
    expect(loincs).toContain('3016-3')   // TSH
    expect(loincs).toContain('24325-3')  // LFTs
  })

  it('returns null for any RxNorm key (old coding system no longer accepted)', () => {
    const rxNormKeys = [
      'RxNorm:11289',  // Warfarin
      'RxNorm:6809',   // Metformin
      'RxNorm:6448',   // Lithium
      'RxNorm:7235',   // Methotrexate
      'RxNorm:3827',   // Enalapril
      'RxNorm:2002',   // Carbamazepine
      'RxNorm:703',    // Amiodarone
    ]
    for (const code of rxNormKeys) {
      expect(getMedicationMapping(code)).toBeNull()
    }
  })

  it('returns null for unknown ATC code', () => {
    expect(getMedicationMapping('Z99ZZ99')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getMedicationMapping('')).toBeNull()
  })

  it('hub overrides keyed by ATC take precedence over bundled defaults', () => {
    // Build a mock override keyed by ATC
    const hubOverrides = new Map([
      ['B01AA03', {
        atcCode: 'B01AA03',
        medicationDisplay: 'Warfarin (updated)',
        version: 2,
        requiredTests: [
          {
            loincCode: '6301-6',
            testDisplay: 'INR (updated)',
            frequencyDays: 7,
            initialDelayDays: 2,
            priority: 'urgent' as const,
          },
        ],
      }],
    ])
    const m = getMedicationMapping('B01AA03', hubOverrides)
    expect(m!.medicationDisplay).toBe('Warfarin (updated)')
    expect(m!.requiredTests[0]!.frequencyDays).toBe(7)
  })
})
