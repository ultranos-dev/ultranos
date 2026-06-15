import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FhirSpecimen } from '@ultranos/shared-types'
import type { TransportSession } from '@/types/transport'
import {
  mapSampleTypeToCategory,
  getStabilityWindow,
  checkStabilityWindows,
} from '@/lib/stability-monitor'
import { DEFAULT_STABILITY_WINDOWS } from '@/types/transport'

// ---------------------------------------------------------------------------
// Test helpers — no PHI; opaque IDs and label numbers only
// ---------------------------------------------------------------------------

function makeSession(pickupHoursAgo: number, delivered = false): TransportSession {
  const pickupTime = new Date(Date.now() - pickupHoursAgo * 60 * 60 * 1000)
  return {
    id: 'session-1',
    courierId: 'courier-1',
    originLocationId: 'loc-1',
    destinationLocationId: 'loc-2',
    status: delivered ? 'delivered' : 'in-transit',
    pickupTimestamp: pickupTime.toISOString(),
    deliveryTimestamp: delivered ? new Date().toISOString() : null,
    pickupTemperature: null,
    deliveryTemperature: null,
    sampleIds: [],
    sampleCount: 0,
    conditionAtDelivery: null,
    flags: [],
    estimatedTransitMinutes: null,
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
    _ultranos: { createdAt: new Date().toISOString(), syncStatus: 'pending' },
  }
}

function makeSpecimen(id: string, labSampleId: string, typeDisplay: string): FhirSpecimen {
  return {
    id,
    resourceType: 'Specimen',
    status: 'available',
    subject: { reference: 'Patient/opaque-id' },
    receivedTime: new Date().toISOString(),
    type: { coding: [{ display: typeDisplay }] },
    _ultranos: {
      labSampleId,
      pipelineStatus: 'received',
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
      hlcTimestamp: new Date().toISOString(),
      isOfflineCreated: false,
      sampleCondition: 'acceptable',
    },
    meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
  } as unknown as FhirSpecimen
}

// ---------------------------------------------------------------------------
// mapSampleTypeToCategory
// ---------------------------------------------------------------------------

describe('mapSampleTypeToCategory', () => {
  it('maps "Whole Blood" → blood', () => {
    expect(mapSampleTypeToCategory('Whole Blood')).toBe('blood')
  })

  it('maps "Blood" → blood', () => {
    expect(mapSampleTypeToCategory('Blood')).toBe('blood')
  })

  it('maps "EDTA" → blood', () => {
    expect(mapSampleTypeToCategory('EDTA')).toBe('blood')
  })

  it('maps "CBC" → blood', () => {
    expect(mapSampleTypeToCategory('CBC')).toBe('blood')
  })

  it('maps "Urine" → urine', () => {
    expect(mapSampleTypeToCategory('Urine')).toBe('urine')
  })

  it('maps "Urinalysis" → urine', () => {
    expect(mapSampleTypeToCategory('Urinalysis')).toBe('urine')
  })

  it('maps "Urine Culture" → urine', () => {
    expect(mapSampleTypeToCategory('Urine Culture')).toBe('urine')
  })

  it('maps "Swab" → swab', () => {
    expect(mapSampleTypeToCategory('Swab')).toBe('swab')
  })

  it('maps "Nasopharyngeal" → swab', () => {
    expect(mapSampleTypeToCategory('Nasopharyngeal')).toBe('swab')
  })

  it('maps "Throat Swab" → swab', () => {
    expect(mapSampleTypeToCategory('Throat Swab')).toBe('swab')
  })

  it('maps "Wound Swab" → swab', () => {
    expect(mapSampleTypeToCategory('Wound Swab')).toBe('swab')
  })

  it('maps "CSF" → csf', () => {
    expect(mapSampleTypeToCategory('CSF')).toBe('csf')
  })

  it('maps "Cerebrospinal Fluid" → csf', () => {
    expect(mapSampleTypeToCategory('Cerebrospinal Fluid')).toBe('csf')
  })

  it('maps "Spinal Fluid" → csf', () => {
    expect(mapSampleTypeToCategory('Spinal Fluid')).toBe('csf')
  })

  it('maps "Stool" → stool', () => {
    expect(mapSampleTypeToCategory('Stool')).toBe('stool')
  })

  it('maps "Feces" → stool', () => {
    expect(mapSampleTypeToCategory('Feces')).toBe('stool')
  })

  it('maps "Fecal" → stool', () => {
    expect(mapSampleTypeToCategory('Fecal Sample')).toBe('stool')
  })

  it('is case-insensitive — "whole blood" → blood', () => {
    expect(mapSampleTypeToCategory('whole blood')).toBe('blood')
  })

  it('is case-insensitive — "URINE CULTURE" → urine', () => {
    expect(mapSampleTypeToCategory('URINE CULTURE')).toBe('urine')
  })

  it('falls back to "blood" for unknown display names (conservative)', () => {
    expect(mapSampleTypeToCategory('Unknown Sample Type XYZ')).toBe('blood')
  })

  it('falls back to "blood" for empty string', () => {
    expect(mapSampleTypeToCategory('')).toBe('blood')
  })
})

// ---------------------------------------------------------------------------
// getStabilityWindow
// ---------------------------------------------------------------------------

describe('getStabilityWindow', () => {
  it('returns 6 hours for blood (default)', () => {
    expect(getStabilityWindow('blood')).toBe(6)
  })

  it('returns 2 hours for urine (default)', () => {
    expect(getStabilityWindow('urine')).toBe(2)
  })

  it('returns 24 hours for swab (default)', () => {
    expect(getStabilityWindow('swab')).toBe(24)
  })

  it('returns 1 hour for csf (default)', () => {
    expect(getStabilityWindow('csf')).toBe(1)
  })

  it('returns 24 hours for stool (default)', () => {
    expect(getStabilityWindow('stool')).toBe(24)
  })

  it('falls back to 6 hours for an unknown category', () => {
    expect(getStabilityWindow('unknown-type')).toBe(6)
  })

  it('uses lab-specific settings when provided (overrides default)', () => {
    const labSettings = { blood: 4, urine: 1 }
    expect(getStabilityWindow('blood', labSettings)).toBe(4)
    expect(getStabilityWindow('urine', labSettings)).toBe(1)
  })

  it('falls back to DEFAULT_STABILITY_WINDOWS when lab setting key is missing', () => {
    const labSettings = { blood: 4 } // no urine key
    expect(getStabilityWindow('urine', labSettings)).toBe(
      DEFAULT_STABILITY_WINDOWS.urine,
    )
  })

  it('falls back to 6 when lab settings provided but key missing and not in defaults', () => {
    const labSettings = { blood: 4 }
    expect(getStabilityWindow('unknown-type', labSettings)).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// checkStabilityWindows
// ---------------------------------------------------------------------------

describe('checkStabilityWindows', () => {
  let now: number

  beforeEach(() => {
    now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- blood (6h window) ----

  it('blood: does NOT flag when elapsed < 6h', () => {
    const session = makeSession(5)
    const specimen = makeSpecimen('sp-001', 'L2026-001', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('blood: does NOT flag at exactly 6h (boundary — window not exceeded)', () => {
    const session = makeSession(6)
    const specimen = makeSpecimen('sp-001', 'L2026-001', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('blood: flags when elapsed is 1 minute over 6h window', () => {
    // 6 hours + 1 minute = 6.01667 hours
    const pickupTime = new Date(now - (6 * 60 + 1) * 60 * 1000)
    const session: TransportSession = {
      ...makeSession(0),
      pickupTimestamp: pickupTime.toISOString(),
    }
    const specimen = makeSpecimen('sp-001', 'L2026-001', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    expect(flags[0].sampleId).toBe('sp-001')
    expect(flags[0].labSampleId).toBe('L2026-001')
    expect(flags[0].flagType).toBe('stability-exceeded')
    expect(flags[0].message).toContain('L2026-001')
    expect(flags[0].message).toContain('6-hour')
  })

  // ---- urine (2h window) ----

  it('urine: does NOT flag when elapsed < 2h', () => {
    const session = makeSession(1)
    const specimen = makeSpecimen('sp-002', 'L2026-002', 'Urine')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('urine: does NOT flag at exactly 2h (boundary)', () => {
    const session = makeSession(2)
    const specimen = makeSpecimen('sp-002', 'L2026-002', 'Urine')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('urine: flags when elapsed > 2h', () => {
    const session = makeSession(3)
    const specimen = makeSpecimen('sp-002', 'L2026-002', 'Urine')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    expect(flags[0].flagType).toBe('stability-exceeded')
    expect(flags[0].message).toContain('2-hour')
  })

  // ---- swab (24h window) ----

  it('swab: does NOT flag at exactly 24h (boundary)', () => {
    const session = makeSession(24)
    const specimen = makeSpecimen('sp-003', 'L2026-003', 'Swab')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('swab: flags when elapsed > 24h', () => {
    const session = makeSession(25)
    const specimen = makeSpecimen('sp-003', 'L2026-003', 'Throat Swab')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('24-hour')
  })

  // ---- csf (1h window) ----

  it('csf: does NOT flag at exactly 1h (boundary)', () => {
    const session = makeSession(1)
    const specimen = makeSpecimen('sp-004', 'L2026-004', 'CSF')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('csf: flags when elapsed > 1h', () => {
    const session = makeSession(2)
    const specimen = makeSpecimen('sp-004', 'L2026-004', 'Cerebrospinal Fluid')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('1-hour')
  })

  // ---- stool (24h window) ----

  it('stool: does NOT flag at exactly 24h (boundary)', () => {
    const session = makeSession(24)
    const specimen = makeSpecimen('sp-005', 'L2026-005', 'Stool')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('stool: flags when elapsed > 24h', () => {
    const session = makeSession(25)
    const specimen = makeSpecimen('sp-005', 'L2026-005', 'Feces')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('24-hour')
  })

  // ---- configurable windows ----

  it('uses lab-specific stability windows when provided', () => {
    const labSettings = { blood: 3 }
    // 4 hours elapsed — exceeds custom 3h window but NOT default 6h
    const session = makeSession(4)
    const specimen = makeSpecimen('sp-006', 'L2026-006', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen], labSettings)
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('3-hour')
  })

  it('does NOT flag when elapsed is within the custom lab window', () => {
    const labSettings = { blood: 8 }
    // 7 hours elapsed — within custom 8h window
    const session = makeSession(7)
    const specimen = makeSpecimen('sp-007', 'L2026-007', 'Blood')
    const flags = checkStabilityWindows(session, [specimen], labSettings)
    expect(flags).toHaveLength(0)
  })

  // ---- edge cases ----

  it('returns empty array when sample list is empty', () => {
    const session = makeSession(10)
    const flags = checkStabilityWindows(session, [])
    expect(flags).toHaveLength(0)
  })

  it('returns empty array when pickupTimestamp is invalid (fail-safe)', () => {
    const session: TransportSession = {
      ...makeSession(0),
      pickupTimestamp: 'not-a-date',
    }
    const specimen = makeSpecimen('sp-008', 'L2026-008', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(0)
  })

  it('uses conservative blood window when specimen has no type display', () => {
    // No type field → falls back to 'blood' (6h window). Elapsed 7h → should flag.
    const session = makeSession(7)
    const specimen = {
      ...makeSpecimen('sp-009', 'L2026-009', ''),
      type: undefined,
    } as unknown as FhirSpecimen
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    expect(flags[0].message).toContain('6-hour')
  })

  it('only flags samples that have exceeded, leaves others unflagged', () => {
    // 3h elapsed: urine (2h) → flagged; swab (24h) → not flagged
    const session = makeSession(3)
    const urine = makeSpecimen('sp-010', 'L2026-010', 'Urine')
    const swab = makeSpecimen('sp-011', 'L2026-011', 'Swab')
    const flags = checkStabilityWindows(session, [urine, swab])
    expect(flags).toHaveLength(1)
    expect(flags[0].sampleId).toBe('sp-010')
  })

  it('generates flags for all exceeded samples in a multi-sample session', () => {
    // 3h elapsed: urine (2h) and csf (1h) both exceeded; swab (24h) ok
    const session = makeSession(3)
    const urine = makeSpecimen('sp-012', 'L2026-012', 'Urine')
    const csf = makeSpecimen('sp-013', 'L2026-013', 'CSF')
    const swab = makeSpecimen('sp-014', 'L2026-014', 'Swab')
    const flags = checkStabilityWindows(session, [urine, csf, swab])
    expect(flags).toHaveLength(2)
    const flaggedIds = flags.map((f) => f.sampleId)
    expect(flaggedIds).toContain('sp-012')
    expect(flaggedIds).toContain('sp-013')
  })

  it('uses deliveryTimestamp instead of now for delivered sessions', () => {
    // Delivered exactly 1h after pickup, session shows 'delivered'
    // Delivery was 1h after pickup — blood window is 6h, so no flag
    const pickupTime = new Date(now - 2 * 60 * 60 * 1000) // 2h ago
    const deliveryTime = new Date(now - 1 * 60 * 60 * 1000) // 1h ago (1h transit)
    const session: TransportSession = {
      ...makeSession(0),
      status: 'delivered',
      pickupTimestamp: pickupTime.toISOString(),
      deliveryTimestamp: deliveryTime.toISOString(),
    }
    const specimen = makeSpecimen('sp-015', 'L2026-015', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen])
    // Only 1h elapsed at delivery — within 6h blood window
    expect(flags).toHaveLength(0)
  })

  it('flag timestamp is a valid ISO 8601 string', () => {
    const session = makeSession(7)
    const specimen = makeSpecimen('sp-016', 'L2026-016', 'Whole Blood')
    const flags = checkStabilityWindows(session, [specimen])
    expect(flags).toHaveLength(1)
    const ts = new Date(flags[0].timestamp)
    expect(isNaN(ts.getTime())).toBe(false)
  })
})
