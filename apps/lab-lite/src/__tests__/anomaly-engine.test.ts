/**
 * Story 53.3 — AI Anomaly Flagging
 *
 * Tests for:
 * - Single pattern detection (AC: 1)
 * - Multi-pattern simultaneous detection (AC: 1)
 * - Delta detection with prior results (AC: 9)
 * - Delta skipped when no prior (AC: 9)
 * - No-match returns empty array (AC: 11)
 * - Confidence level assignment (AC: 5)
 * - Severity sorting (urgent first) (AC: 1)
 * - PHI guard — output contains no patient identifiers (AC: 11)
 * - Disclaimer is always present (AC: 5)
 * - Only applicable templates are evaluated (AC: 7)
 * - Extreme value detection (AC: 1)
 */

import { describe, it, expect } from 'vitest'
import { detectAnomalies, confidenceToScore } from '@/lib/anomaly-engine'
import { ConfidenceLevel } from '@/lib/confidence'

// CBC panel LOINC code (applicable to most seed rules)
const CBC = '58410-2'
const CMP = '24323-8'

// ---------------------------------------------------------------------------
// No-match cases
// ---------------------------------------------------------------------------

describe('detectAnomalies — no match', () => {
  it('returns empty array when no values match any rule', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 7.0, rbc: 4.5, platelets: 200, hgb: 13.5 },
      templateLoincCode: CBC,
    })
    expect(flags).toHaveLength(0)
  })

  it('returns empty array when template has no applicable rules', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 0.5, rbc: 1.0, platelets: 10 },
      templateLoincCode: 'unknown-loinc',
    })
    expect(flags).toHaveLength(0)
  })

  it('returns empty array when required fields are null', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: null, rbc: null, platelets: null },
      templateLoincCode: CBC,
    })
    expect(flags).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Single pattern detection
// ---------------------------------------------------------------------------

describe('detectAnomalies — single pattern (pancytopenia ANOM-PANCY-001)', () => {
  it('detects pancytopenia when all three values are low', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 2.0, rbc: 2.5, platelets: 50 },
      templateLoincCode: CBC,
    })

    const pancy = flags.find((f) => f.ruleId === 'ANOM-PANCY-001')
    expect(pancy).toBeDefined()
    expect(pancy?.severity).toBe('urgent')
    expect(pancy?.confidence).toBe(ConfidenceLevel.HIGH)
  })

  it('does NOT detect pancytopenia when only two values are low (AND logic)', () => {
    const flags = detectAnomalies({
      // wbc is normal — must fail AND logic
      currentValues: { wbc: 5.0, rbc: 2.5, platelets: 50 },
      templateLoincCode: CBC,
    })
    const pancy = flags.find((f) => f.ruleId === 'ANOM-PANCY-001')
    expect(pancy).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Extreme value detection
// ---------------------------------------------------------------------------

describe('detectAnomalies — extreme values', () => {
  it('detects extreme leukocytosis (WBC > 100)', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 120 },
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-EXTREME-WBC-001')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('urgent')
  })

  it('does NOT flag borderline WBC (100 exactly — rule uses gt not gte)', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 100 },
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-EXTREME-WBC-001')
    expect(flag).toBeUndefined()
  })

  it('detects severe hyperkalemia (K+ > 7.0) on CMP template', () => {
    const flags = detectAnomalies({
      currentValues: { potassium: 7.5 },
      templateLoincCode: CMP,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-EXTREME-K-001')
    expect(flag).toBeDefined()
    expect(flag?.confidence).toBe(ConfidenceLevel.HIGH)
  })
})

// ---------------------------------------------------------------------------
// Delta detection
// ---------------------------------------------------------------------------

describe('detectAnomalies — delta detection (ANOM-DELTA-HGB-001)', () => {
  it('detects hemoglobin drop > 3 g/dL from prior', () => {
    const flags = detectAnomalies({
      currentValues: { hgb: 8.0 },
      priorValues:   { hgb: 12.0 }, // drop of 4 g/dL
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-DELTA-HGB-001')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('urgent')
  })

  it('does NOT detect Hgb drop of exactly 3 g/dL (rule uses absolute > 3)', () => {
    const flags = detectAnomalies({
      currentValues: { hgb: 9.0 },
      priorValues:   { hgb: 12.0 }, // drop of exactly 3 g/dL
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-DELTA-HGB-001')
    expect(flag).toBeUndefined()
  })

  it('does NOT detect Hgb drop when prior is missing', () => {
    const flags = detectAnomalies({
      currentValues: { hgb: 6.0 },
      priorValues:   undefined,
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-DELTA-HGB-001')
    expect(flag).toBeUndefined()
  })

  it('does NOT detect delta when prior value is null', () => {
    const flags = detectAnomalies({
      currentValues: { hgb: 6.0 },
      priorValues:   { hgb: null },
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-DELTA-HGB-001')
    expect(flag).toBeUndefined()
  })
})

describe('detectAnomalies — platelet delta (ANOM-DELTA-PLT-001)', () => {
  it('detects >50% platelet drop from prior', () => {
    const flags = detectAnomalies({
      currentValues: { platelets: 40 },
      priorValues:   { platelets: 120 }, // 66.7% drop
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-DELTA-PLT-001')
    expect(flag).toBeDefined()
  })

  it('does NOT detect platelet increase as a drop', () => {
    const flags = detectAnomalies({
      currentValues: { platelets: 300 },
      priorValues:   { platelets: 100 },
      templateLoincCode: CBC,
    })
    const flag = flags.find((f) => f.ruleId === 'ANOM-DELTA-PLT-001')
    expect(flag).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Multiple simultaneous flags
// ---------------------------------------------------------------------------

describe('detectAnomalies — multiple simultaneous flags', () => {
  it('returns multiple matching flags', () => {
    // Pancytopenia + extreme WBC (contradictory but tests multi-match)
    const flags = detectAnomalies({
      currentValues: {
        wbc: 120,     // extreme leukocytosis (ANOM-EXTREME-WBC-001)
        rbc: 2.5,
        platelets: 50, // low platelets (part of pancytopenia)
        hgb: 8.0,
      },
      templateLoincCode: CBC,
    })

    // Extreme WBC triggers; pancytopenia requires WBC < 4 (fails since wbc=120)
    const extremeWbc = flags.find((f) => f.ruleId === 'ANOM-EXTREME-WBC-001')
    expect(extremeWbc).toBeDefined()

    // Add a delta flag too
    const flagsWithDelta = detectAnomalies({
      currentValues: {
        wbc: 120,
        rbc: 2.5,
        platelets: 50,
        hgb: 8.0,
      },
      priorValues: {
        hgb: 13.0,  // Hgb drop > 3 → triggers ANOM-DELTA-HGB-001
      },
      templateLoincCode: CBC,
    })
    expect(flagsWithDelta.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Severity sorting
// ---------------------------------------------------------------------------

describe('detectAnomalies — severity sorting', () => {
  it('sorts results so urgent flags appear before elevated', () => {
    // ANOM-DELTA-CREAT-001 (elevated) fires on CMP; ANOM-EXTREME-K-001 (urgent) fires on CMP.
    // Both use the CMP template — mix of urgent + elevated to actually test cross-severity ordering.
    const flags = detectAnomalies({
      currentValues: { potassium: 7.5, creatinine: 3.0 },
      priorValues:   { creatinine: 1.5 },  // 100% increase → triggers DELTA-CREAT (elevated)
      templateLoincCode: CMP,
    })

    // Must have at least one urgent and one elevated flag
    expect(flags.some((f) => f.severity === 'urgent')).toBe(true)
    expect(flags.some((f) => f.severity === 'elevated')).toBe(true)

    // Verify strict severity ordering: urgent before elevated, elevated before notable
    const severityOrder: Record<string, number> = { urgent: 3, elevated: 2, notable: 1 }
    for (let i = 1; i < flags.length; i++) {
      expect(severityOrder[flags[i - 1]!.severity]).toBeGreaterThanOrEqual(
        severityOrder[flags[i]!.severity],
      )
    }
  })

  it('sorts flags with equal severity deterministically by ruleId', () => {
    // Both ANOM-EXTREME-K-001 and ANOM-TLS-001 can fire as urgent on CMP
    const flags = detectAnomalies({
      currentValues: {
        potassium: 7.5,   // fires EXTREME-K (urgent)
        phosphate: 6.0,
        uric_acid: 9.0,
        calcium: 7.5,     // fires TLS-001 (urgent)
      },
      templateLoincCode: CMP,
    })

    const urgentFlags = flags.filter((f) => f.severity === 'urgent')
    if (urgentFlags.length >= 2) {
      // Secondary sort by ruleId ensures deterministic order
      for (let i = 1; i < urgentFlags.length; i++) {
        expect(urgentFlags[i - 1]!.ruleId <= urgentFlags[i]!.ruleId).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Disclaimer is always present
// ---------------------------------------------------------------------------

describe('detectAnomalies — disclaimer (AC: 5)', () => {
  it('every flag includes the mandatory disclaimer', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 0.5, rbc: 2.5, platelets: 50 },
      templateLoincCode: CBC,
    })

    for (const flag of flags) {
      expect(flag.disclaimer).toBe(
        'Statistical pattern flag — not a diagnosis. Clinical correlation required.',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// PHI guard — output must not contain patient identifiers
// ---------------------------------------------------------------------------

describe('detectAnomalies — PHI guard (AC: 11)', () => {
  it('output contains no patient names, IDs, or DOB patterns', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 0.5, rbc: 2.0, platelets: 30 },
      templateLoincCode: CBC,
    })

    const serialized = JSON.stringify(flags)

    // No patterns matching Name Surname
    expect(serialized).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/)
    // No DOB-like patterns
    expect(serialized).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
    // No patient ID patterns
    expect(serialized).not.toMatch(/patient[_-]?id/i)
    // No email patterns
    expect(serialized).not.toMatch(/\S+@\S+\.\S+/)
  })

  it('matchedConditions contains only field codes, not values', () => {
    const flags = detectAnomalies({
      currentValues: { wbc: 0.5, rbc: 2.0, platelets: 30 },
      templateLoincCode: CBC,
    })

    for (const flag of flags) {
      for (const fieldCode of flag.matchedConditions) {
        // Field codes should not be numeric values
        expect(typeof fieldCode).toBe('string')
        expect(isNaN(Number(fieldCode))).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// confidenceToScore helper
// ---------------------------------------------------------------------------

describe('confidenceToScore', () => {
  it('HIGH returns 0.90', () => expect(confidenceToScore(ConfidenceLevel.HIGH)).toBe(0.90))
  it('MEDIUM returns 0.65', () => expect(confidenceToScore(ConfidenceLevel.MEDIUM)).toBe(0.65))
  it('LOW returns 0.30', () => expect(confidenceToScore(ConfidenceLevel.LOW)).toBe(0.30))
})

// ---------------------------------------------------------------------------
// Template filtering
// ---------------------------------------------------------------------------

describe('detectAnomalies — template filtering', () => {
  it('does not apply CBC rules to an unrecognized template', () => {
    // All conditions would match, but template is wrong
    const flags = detectAnomalies({
      currentValues: { wbc: 0.5, rbc: 2.0, platelets: 30 },
      templateLoincCode: 'urinalysis-0000',
    })
    expect(flags).toHaveLength(0)
  })
})
