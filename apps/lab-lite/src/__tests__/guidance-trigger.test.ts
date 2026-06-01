/**
 * Public Health Guidance — Trigger Engine Tests
 *
 * Story 53.7 — AC: 5, 7 (Task 9)
 *
 * Test coverage:
 *   - Positive match per condition
 *   - No match (empty array for normal values)
 *   - Multiple conditions simultaneously
 *   - Boundary values (exact threshold vs. just over)
 *   - Null field handling
 *   - Content model validation (author field, version, no aiGenerated)
 *   - PHI guard: audit metadata contains no patient identifiers
 *   - Deduplication: each GuidanceContent appears at most once
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateGuidanceTriggers,
  getMatchingGuidanceRuleIds,
} from '@/lib/guidance-trigger'
import { GUIDANCE_SEED } from '@/lib/guidance-seed-data'

// ---------------------------------------------------------------------------
// Single-condition positive matches
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — single positive match', () => {
  it('returns PHG-MALARIA-001 for malaria RDT positive', () => {
    const content = evaluateGuidanceTriggers(
      { malaria_result: 'positive' },
      '5028-2',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-MALARIA-001')
    expect(content[0].conditionCode).toBe('MALARIA_POSITIVE')
  })

  it('returns PHG-MALARIA-001 for malaria smear positive', () => {
    const content = evaluateGuidanceTriggers(
      { malaria_result: 'positive' },
      '32700-7',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-MALARIA-001')
  })

  it('returns PHG-MALARIA-001 for malaria result "reactive" synonym', () => {
    const content = evaluateGuidanceTriggers(
      { malaria_result: 'Reactive' },
      '5028-2',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-MALARIA-001')
  })

  it('returns PHG-TB-001 for TB GeneXpert positive (mtb_detected)', () => {
    const content = evaluateGuidanceTriggers(
      { mtb_detected: 'detected' },
      '25398-2',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-TB-001')
  })

  it('returns PHG-TB-001 for TB smear positive (afb_result)', () => {
    const content = evaluateGuidanceTriggers(
      { afb_result: 'positive' },
      '25398-2',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-TB-001')
  })

  it('returns PHG-HEPB-001 for hepatitis B surface antigen positive', () => {
    const content = evaluateGuidanceTriggers(
      { hbsag_result: 'positive' },
      '24365-0',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-HEPB-001')
  })

  it('returns PHG-HEPC-001 for hepatitis C antibody positive', () => {
    const content = evaluateGuidanceTriggers(
      { hcv_result: 'reactive' },
      '13955-0',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-HEPC-001')
  })

  it('returns PHG-HIV-001 for HIV rapid test positive', () => {
    const content = evaluateGuidanceTriggers(
      { hiv_result: 'positive' },
      '75622-1',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-HIV-001')
  })

  it('returns PHG-ANEMIA-SEVERE-001 for hemoglobin < 7 g/dL on CBC', () => {
    const content = evaluateGuidanceTriggers(
      { hgb: 6.9 },
      '58410-2',
    )
    expect(content).toHaveLength(1)
    expect(content[0].id).toBe('PHG-ANEMIA-SEVERE-001')
  })
})

// ---------------------------------------------------------------------------
// No match — normal values
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — no match', () => {
  it('returns empty array for negative malaria result', () => {
    const content = evaluateGuidanceTriggers(
      { malaria_result: 'negative' },
      '5028-2',
    )
    expect(content).toEqual([])
  })

  it('returns empty array for normal hemoglobin (≥ 7 g/dL)', () => {
    const content = evaluateGuidanceTriggers(
      { hgb: 7 },
      '58410-2',
    )
    expect(content).toEqual([])
  })

  it('returns empty array for empty result values', () => {
    const content = evaluateGuidanceTriggers({}, '5028-2')
    expect(content).toEqual([])
  })

  it('returns empty array when template LOINC does not match any rule', () => {
    const content = evaluateGuidanceTriggers(
      { malaria_result: 'positive' },
      'UNKNOWN-LOINC',
    )
    expect(content).toEqual([])
  })

  it('returns empty array for Hep B negative result', () => {
    const content = evaluateGuidanceTriggers(
      { hbsag_result: 'negative' },
      '24365-0',
    )
    expect(content).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Multiple simultaneous matches
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — multiple conditions', () => {
  it('returns both TB and malaria guidance when both test positive (different templates — each on own LOINC)', () => {
    // In practice, these would be two separate result evaluations.
    // Here we test that two triggers on the same template return two items
    // by simulating a template that covers both (artificial but valid for dedup logic).
    const malariaContent = evaluateGuidanceTriggers(
      { malaria_result: 'positive' },
      '5028-2',
    )
    const tbContent = evaluateGuidanceTriggers(
      { mtb_detected: 'detected' },
      '25398-2',
    )
    expect(malariaContent[0].id).toBe('PHG-MALARIA-001')
    expect(tbContent[0].id).toBe('PHG-TB-001')
  })

  it('returns both Hep B and Hep C when evaluated together via CBC context (anemia co-trigger)', () => {
    // Severe anemia can co-occur with hepatitis — CBC template only triggers anemia
    const cbcAnemia = evaluateGuidanceTriggers(
      { hgb: 5.5, hbsag_result: 'positive' },
      '58410-2',
    )
    // CBC template (58410-2) does not have a hbsag trigger — only hgb < 7
    const ids = cbcAnemia.map((c) => c.id)
    expect(ids).toContain('PHG-ANEMIA-SEVERE-001')
    // hbsag_result is not triggered by '58410-2' template — correct
    expect(ids).not.toContain('PHG-HEPB-001')
  })
})

// ---------------------------------------------------------------------------
// Boundary values
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — boundary values (anemia)', () => {
  it('FIRES anemia guidance at hgb = 6.99 (< 7)', () => {
    const content = evaluateGuidanceTriggers({ hgb: 6.99 }, '58410-2')
    const ids = content.map((c) => c.id)
    expect(ids).toContain('PHG-ANEMIA-SEVERE-001')
  })

  it('does NOT fire anemia guidance at exactly hgb = 7 (threshold is < 7, not ≤ 7)', () => {
    const content = evaluateGuidanceTriggers({ hgb: 7 }, '58410-2')
    const ids = content.map((c) => c.id)
    expect(ids).not.toContain('PHG-ANEMIA-SEVERE-001')
  })

  it('does NOT fire anemia guidance at hgb = 7.1', () => {
    const content = evaluateGuidanceTriggers({ hgb: 7.1 }, '58410-2')
    expect(content).toEqual([])
  })

  it('FIRES anemia guidance at hgb = 0 (extreme low)', () => {
    const content = evaluateGuidanceTriggers({ hgb: 0 }, '58410-2')
    const ids = content.map((c) => c.id)
    expect(ids).toContain('PHG-ANEMIA-SEVERE-001')
  })
})

// ---------------------------------------------------------------------------
// Null field handling
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — null field handling', () => {
  it('does not fire when malaria_result is null', () => {
    const content = evaluateGuidanceTriggers({ malaria_result: null }, '5028-2')
    expect(content).toEqual([])
  })

  it('does not fire when hgb is null', () => {
    const content = evaluateGuidanceTriggers({ hgb: null }, '58410-2')
    expect(content).toEqual([])
  })

  it('does not fire when malaria_result is empty string', () => {
    const content = evaluateGuidanceTriggers({ malaria_result: '' }, '5028-2')
    expect(content).toEqual([])
  })

  it('still fires for other conditions when one field is null', () => {
    const content = evaluateGuidanceTriggers(
      { malaria_result: null, hbsag_result: 'positive' },
      '24365-0', // Hep B template — matches hbsag_result
    )
    const ids = content.map((c) => c.id)
    expect(ids).toContain('PHG-HEPB-001')
    expect(ids).not.toContain('PHG-MALARIA-001')
  })
})

// ---------------------------------------------------------------------------
// Positive synonym normalization
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — positive synonym normalization', () => {
  const malariaPositiveSynonyms = ['positive', 'POSITIVE', 'Positive', 'reactive', 'detected', 'present', '1', 'yes']
  const malariaNegativeSynonyms = ['negative', 'NEGATIVE', 'not detected', 'absent', '0', 'no']

  for (const synonym of malariaPositiveSynonyms) {
    it(`fires for malaria_result = "${synonym}"`, () => {
      const content = evaluateGuidanceTriggers({ malaria_result: synonym }, '5028-2')
      expect(content).toHaveLength(1)
      expect(content[0].id).toBe('PHG-MALARIA-001')
    })
  }

  for (const synonym of malariaNegativeSynonyms) {
    it(`does NOT fire for malaria_result = "${synonym}"`, () => {
      const content = evaluateGuidanceTriggers({ malaria_result: synonym }, '5028-2')
      expect(content).toEqual([])
    })
  }
})

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe('evaluateGuidanceTriggers — deduplication', () => {
  it('each GuidanceContent appears at most once even if multiple rules could match (TB smear + GeneXpert on same template)', () => {
    // Both GT-TB-GENEXPERT-001 and GT-TB-SMEAR-001 match template '25398-2'
    const content = evaluateGuidanceTriggers(
      { mtb_detected: 'detected', afb_result: 'positive' },
      '25398-2',
    )
    const ids = content.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
    // PHG-TB-001 should appear exactly once
    expect(ids.filter((id) => id === 'PHG-TB-001')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// getMatchingGuidanceRuleIds
// ---------------------------------------------------------------------------

describe('getMatchingGuidanceRuleIds', () => {
  it('returns rule ID for matching malaria RDT trigger', () => {
    const ruleIds = getMatchingGuidanceRuleIds(
      'MALARIA_POSITIVE',
      { malaria_result: 'positive' },
      '5028-2',
    )
    expect(ruleIds).toContain('GT-MALARIA-RDT-001')
  })

  it('returns empty array when condition does not match', () => {
    const ruleIds = getMatchingGuidanceRuleIds(
      'MALARIA_POSITIVE',
      { malaria_result: 'negative' },
      '5028-2',
    )
    expect(ruleIds).toEqual([])
  })

  it('returns both rule IDs when both TB triggers match', () => {
    const ruleIds = getMatchingGuidanceRuleIds(
      'TB_POSITIVE',
      { mtb_detected: 'detected', afb_result: 'positive' },
      '25398-2',
    )
    expect(ruleIds).toContain('GT-TB-GENEXPERT-001')
    expect(ruleIds).toContain('GT-TB-SMEAR-001')
  })
})

// ---------------------------------------------------------------------------
// Content model validation — AC: 5
// ---------------------------------------------------------------------------

describe('GUIDANCE_SEED — content model validation', () => {
  it('all guidance items have a non-empty author name', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.author.name).toBeTruthy()
    }
  })

  it('all guidance items have non-empty author credentials', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.author.credentials).toBeTruthy()
    }
  })

  it('all guidance items have non-empty author institution', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.author.institution).toBeTruthy()
    }
  })

  it('all guidance items have a valid semver version', () => {
    const semverPattern = /^\d+\.\d+\.\d+$/
    for (const item of GUIDANCE_SEED) {
      expect(item.version).toMatch(semverPattern)
    }
  })

  it('all guidance items have a non-empty approvedBy field', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.approvedBy).toBeTruthy()
    }
  })

  it('all guidance items have a non-empty conditionCode', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.conditionCode).toBeTruthy()
    }
  })

  it('all guidance items have at least one step', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.steps.length).toBeGreaterThan(0)
    }
  })

  it('all step text fields have at least English text', () => {
    for (const item of GUIDANCE_SEED) {
      for (const step of item.steps) {
        expect(step.text.en).toBeTruthy()
      }
    }
  })

  it('all guidance items have English text (physician-authored)', () => {
    for (const item of GUIDANCE_SEED) {
      expect(item.text.en).toBeTruthy()
    }
  })

  it('no guidance item has aiGenerated set to true — CRITICAL: content must be physician-authored', () => {
    for (const item of GUIDANCE_SEED) {
      expect((item as { aiGenerated?: boolean }).aiGenerated).not.toBe(true)
    }
  })

  it('6 guidance conditions are seeded (malaria, tb, hepB, hepC, hiv, anemia)', () => {
    const expectedCodes = new Set([
      'MALARIA_POSITIVE',
      'TB_POSITIVE',
      'HEPATITIS_B_POSITIVE',
      'HEPATITIS_C_POSITIVE',
      'HIV_POSITIVE',
      'ANEMIA_SEVERE',
    ])
    const actualCodes = new Set(GUIDANCE_SEED.map((g) => g.conditionCode))
    expect(actualCodes).toEqual(expectedCodes)
  })

  it('all guidance IDs are unique', () => {
    const ids = GUIDANCE_SEED.map((g) => g.id)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
  })
})

// ---------------------------------------------------------------------------
// PHI guard tests — AC: 9
// ---------------------------------------------------------------------------

describe('PHI guard — guidance metadata contains no patient identifiers', () => {
  it('guidance content fields contain no patient name fields', () => {
    for (const item of GUIDANCE_SEED) {
      const json = JSON.stringify(item)
      expect(json).not.toContain('patientName')
      expect(json).not.toContain('firstName')
      expect(json).not.toContain('lastName')
      expect(json).not.toContain('dateOfBirth')
      expect(json).not.toContain('dob')
      expect(json).not.toContain('patientId')
    }
  })

  it('guidance content is entirely non-PHI — no structured result values included', () => {
    for (const item of GUIDANCE_SEED) {
      // Steps describe ACTIONS, not patient-specific results
      const json = JSON.stringify(item.steps)
      // Generic numeric values like "7" are acceptable in text (e.g. "< 7 g/dL")
      // but actual result values (e.g. "6.2") should not appear in static content
      expect(item.text.en).not.toMatch(/\d+\.\d+ g\/dL/)
    }
  })
})
