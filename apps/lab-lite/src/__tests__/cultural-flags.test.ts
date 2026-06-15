import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  getPatientCulturalPreferences,
  setPatientCulturalPreferences,
  addCulturalFlag,
  removeCulturalFlag,
  updateCulturalFlag,
} from '../lib/db'
import {
  CulturalFlagType,
  PREDEFINED_FLAG_TYPES,
  CULTURAL_FLAG_COLORS,
  FLAG_ICON_PATHS,
  flagLabelKey,
  flagDescKey,
} from '../lib/cultural-flags'
import type {
  CulturalFlag,
  PatientCulturalPreferences,
} from '../lib/cultural-flags'

function makeFlag(
  type: CulturalFlagType,
  overrides: Partial<CulturalFlag> = {},
): CulturalFlag {
  return {
    type,
    isActive: true,
    setAt: new Date().toISOString(),
    setByTechId: 'tech-001',
    ...overrides,
  }
}

function makePrefs(
  patientRef: string,
  flags: CulturalFlag[] = [],
): PatientCulturalPreferences {
  return {
    patientRef,
    flags,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedByTechId: 'tech-001',
    hlcTimestamp: '2026-05-30T00:00:00.000Z:0:node1',
  }
}

describe('Cultural Flags — Data Model', () => {
  it('CulturalFlagType enum covers all predefined types', () => {
    const allValues = Object.values(CulturalFlagType)
    expect(allValues).toHaveLength(10)
    expect(allValues).toContain(CulturalFlagType.FEMALE_PHLEBOTOMIST)
    expect(allValues).toContain(CulturalFlagType.MALE_PHLEBOTOMIST)
    expect(allValues).toContain(CulturalFlagType.PRIVACY_SCREEN)
    expect(allValues).toContain(CulturalFlagType.FASTING_CARE)
    expect(allValues).toContain(CulturalFlagType.NO_MALE_FAMILY_PRESENT)
    expect(allValues).toContain(CulturalFlagType.NO_FEMALE_FAMILY_PRESENT)
    expect(allValues).toContain(CulturalFlagType.MODEST_GOWN)
    expect(allValues).toContain(CulturalFlagType.PRAYER_TIME_ACCOMMODATION)
    expect(allValues).toContain(CulturalFlagType.GENDER_SEGREGATED_WAITING)
    expect(allValues).toContain(CulturalFlagType.CUSTOM)
  })

  it('PREDEFINED_FLAG_TYPES excludes CUSTOM', () => {
    expect(PREDEFINED_FLAG_TYPES).not.toContain(CulturalFlagType.CUSTOM)
    expect(PREDEFINED_FLAG_TYPES).toHaveLength(9)
  })

  it('every flag type has an icon path', () => {
    for (const type of Object.values(CulturalFlagType)) {
      expect(FLAG_ICON_PATHS[type]).toBeDefined()
      expect(typeof FLAG_ICON_PATHS[type]).toBe('string')
      expect(FLAG_ICON_PATHS[type].length).toBeGreaterThan(0)
    }
  })

  it('flag label and description keys follow the expected pattern', () => {
    expect(flagLabelKey(CulturalFlagType.FEMALE_PHLEBOTOMIST)).toBe(
      'culturalFlags.flag.FEMALE_PHLEBOTOMIST',
    )
    expect(flagDescKey(CulturalFlagType.PRIVACY_SCREEN)).toBe(
      'culturalFlags.desc.PRIVACY_SCREEN',
    )
  })

  it('cultural flag colors use blue/purple, NOT red', () => {
    expect(CULTURAL_FLAG_COLORS.bg).toMatch(/indigo/)
    expect(CULTURAL_FLAG_COLORS.text).toMatch(/indigo/)
    expect(CULTURAL_FLAG_COLORS.icon).toMatch(/indigo/)
    expect(CULTURAL_FLAG_COLORS.bg).not.toMatch(/red/)
    expect(CULTURAL_FLAG_COLORS.text).not.toMatch(/red/)
  })
})

describe('Cultural Flags — Dexie CRUD', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.culturalPreferences.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.culturalPreferences.clear()
  })

  it('creates and retrieves cultural preferences', async () => {
    const prefs = makePrefs('patient-001', [
      makeFlag(CulturalFlagType.FEMALE_PHLEBOTOMIST),
      makeFlag(CulturalFlagType.PRIVACY_SCREEN),
    ])
    await setPatientCulturalPreferences(prefs)

    const result = await getPatientCulturalPreferences('patient-001')
    expect(result).toBeDefined()
    expect(result!.patientRef).toBe('patient-001')
    expect(result!.flags).toHaveLength(2)
    expect(result!.flags[0].type).toBe(CulturalFlagType.FEMALE_PHLEBOTOMIST)
    expect(result!.flags[1].type).toBe(CulturalFlagType.PRIVACY_SCREEN)
  })

  it('returns undefined for non-existent patient', async () => {
    const result = await getPatientCulturalPreferences('no-such-patient')
    expect(result).toBeUndefined()
  })

  it('updates existing preferences (upsert)', async () => {
    const prefs1 = makePrefs('patient-002', [
      makeFlag(CulturalFlagType.FASTING_CARE),
    ])
    await setPatientCulturalPreferences(prefs1)

    const prefs2 = makePrefs('patient-002', [
      makeFlag(CulturalFlagType.FASTING_CARE),
      makeFlag(CulturalFlagType.MODEST_GOWN),
    ])
    await setPatientCulturalPreferences(prefs2)

    const result = await getPatientCulturalPreferences('patient-002')
    expect(result!.flags).toHaveLength(2)
  })

  it('adds a flag to an existing preferences record', async () => {
    const prefs = makePrefs('patient-003', [
      makeFlag(CulturalFlagType.PRIVACY_SCREEN),
    ])
    await setPatientCulturalPreferences(prefs)

    await addCulturalFlag(
      'patient-003',
      makeFlag(CulturalFlagType.FASTING_CARE),
      'tech-002',
      'hlc-002',
    )

    const result = await getPatientCulturalPreferences('patient-003')
    expect(result!.flags).toHaveLength(2)
    expect(result!.flags.map((f) => f.type)).toContain(
      CulturalFlagType.PRIVACY_SCREEN,
    )
    expect(result!.flags.map((f) => f.type)).toContain(
      CulturalFlagType.FASTING_CARE,
    )
  })

  it('creates preferences record when addCulturalFlag is called on new patient', async () => {
    await addCulturalFlag(
      'patient-new',
      makeFlag(CulturalFlagType.PRAYER_TIME_ACCOMMODATION),
      'tech-001',
      'hlc-001',
    )

    const result = await getPatientCulturalPreferences('patient-new')
    expect(result).toBeDefined()
    expect(result!.flags).toHaveLength(1)
    expect(result!.flags[0].type).toBe(CulturalFlagType.PRAYER_TIME_ACCOMMODATION)
  })

  it('removes a flag from preferences', async () => {
    const prefs = makePrefs('patient-004', [
      makeFlag(CulturalFlagType.PRIVACY_SCREEN),
      makeFlag(CulturalFlagType.FASTING_CARE),
    ])
    await setPatientCulturalPreferences(prefs)

    await removeCulturalFlag(
      'patient-004',
      CulturalFlagType.PRIVACY_SCREEN,
      'tech-001',
      'hlc-003',
    )

    const result = await getPatientCulturalPreferences('patient-004')
    expect(result!.flags).toHaveLength(1)
    expect(result!.flags[0].type).toBe(CulturalFlagType.FASTING_CARE)
  })

  it('removeCulturalFlag is a no-op when patient has no preferences', async () => {
    await removeCulturalFlag(
      'nonexistent',
      CulturalFlagType.PRIVACY_SCREEN,
      'tech-001',
      'hlc-x',
    )
    const result = await getPatientCulturalPreferences('nonexistent')
    expect(result).toBeUndefined()
  })

  it('updates a specific flag (e.g., toggle isActive)', async () => {
    const prefs = makePrefs('patient-005', [
      makeFlag(CulturalFlagType.MODEST_GOWN, { isActive: true }),
    ])
    await setPatientCulturalPreferences(prefs)

    await updateCulturalFlag(
      'patient-005',
      CulturalFlagType.MODEST_GOWN,
      { isActive: false },
      'tech-002',
      'hlc-004',
    )

    const result = await getPatientCulturalPreferences('patient-005')
    expect(result!.flags[0].isActive).toBe(false)
    expect(result!.flags[0].setByTechId).toBe('tech-002')
  })

  it('handles CUSTOM flag with description', async () => {
    const customFlag = makeFlag(CulturalFlagType.CUSTOM, {
      customDescription: 'Prefers left arm draw',
    })
    const prefs = makePrefs('patient-006', [customFlag])
    await setPatientCulturalPreferences(prefs)

    const result = await getPatientCulturalPreferences('patient-006')
    expect(result!.flags[0].type).toBe(CulturalFlagType.CUSTOM)
    expect(result!.flags[0].customDescription).toBe('Prefers left arm draw')
  })

  it('persists across visits (multiple writes with same patientRef)', async () => {
    // Visit 1: set flags
    const prefs1 = makePrefs('patient-persist', [
      makeFlag(CulturalFlagType.FEMALE_PHLEBOTOMIST),
    ])
    await setPatientCulturalPreferences(prefs1)

    // Simulate "new visit" — clear nothing, just re-query
    const visit2 = await getPatientCulturalPreferences('patient-persist')
    expect(visit2).toBeDefined()
    expect(visit2!.flags).toHaveLength(1)
    expect(visit2!.flags[0].type).toBe(CulturalFlagType.FEMALE_PHLEBOTOMIST)

    // Add another flag in visit 2
    await addCulturalFlag(
      'patient-persist',
      makeFlag(CulturalFlagType.PRAYER_TIME_ACCOMMODATION),
      'tech-003',
      'hlc-visit2',
    )

    // Visit 3: both flags still there
    const visit3 = await getPatientCulturalPreferences('patient-persist')
    expect(visit3!.flags).toHaveLength(2)
  })
})

describe('Cultural Flags — Non-Punitive Framing', () => {
  it('no flag label key contains enforcement language', () => {
    const enforcementWords = ['REQUIRE', 'MUST', 'MANDATORY', 'OBLIGATORY']
    for (const type of Object.values(CulturalFlagType)) {
      const labelKey = flagLabelKey(type)
      const descKey = flagDescKey(type)
      for (const word of enforcementWords) {
        expect(labelKey.toUpperCase()).not.toContain(word)
        expect(descKey.toUpperCase()).not.toContain(word)
      }
    }
  })
})
