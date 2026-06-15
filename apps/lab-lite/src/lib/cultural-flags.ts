/**
 * Cultural Sensitivity Flags — data model and display configuration.
 *
 * These flags represent patient cultural preferences for care delivery.
 * They are GUIDANCE, not mandates. See Story 45.6 for design philosophy.
 */

export enum CulturalFlagType {
  FEMALE_PHLEBOTOMIST = 'FEMALE_PHLEBOTOMIST',
  MALE_PHLEBOTOMIST = 'MALE_PHLEBOTOMIST',
  PRIVACY_SCREEN = 'PRIVACY_SCREEN',
  FASTING_CARE = 'FASTING_CARE',
  NO_MALE_FAMILY_PRESENT = 'NO_MALE_FAMILY_PRESENT',
  NO_FEMALE_FAMILY_PRESENT = 'NO_FEMALE_FAMILY_PRESENT',
  MODEST_GOWN = 'MODEST_GOWN',
  PRAYER_TIME_ACCOMMODATION = 'PRAYER_TIME_ACCOMMODATION',
  GENDER_SEGREGATED_WAITING = 'GENDER_SEGREGATED_WAITING',
  CUSTOM = 'CUSTOM',
}

export interface CulturalFlag {
  type: CulturalFlagType
  customDescription?: string // only for CUSTOM type
  isActive: boolean
  setAt: string // ISO 8601
  setByTechId: string
}

export interface PatientCulturalPreferences {
  patientRef: string
  flags: CulturalFlag[]
  lastUpdatedAt: string
  lastUpdatedByTechId: string
  hlcTimestamp: string
}

/** All predefined (non-CUSTOM) flag types in display order. */
export const PREDEFINED_FLAG_TYPES = Object.values(CulturalFlagType).filter(
  (t) => t !== CulturalFlagType.CUSTOM,
)

/**
 * Icon paths for each cultural flag type (SVG path data for 24x24 viewBox).
 * Uses a neutral blue/purple palette — NOT red (red = clinical danger/error).
 */
export const FLAG_ICON_PATHS: Record<CulturalFlagType, string> = {
  // Female symbol (circle + cross below)
  [CulturalFlagType.FEMALE_PHLEBOTOMIST]:
    'M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a6 6 0 0 0-6 6v4h12v-4a6 6 0 0 0-6-6z',
  // Male symbol
  [CulturalFlagType.MALE_PHLEBOTOMIST]:
    'M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a6 6 0 0 0-6 6v4h12v-4a6 6 0 0 0-6-6z',
  // Shield / privacy
  [CulturalFlagType.PRIVACY_SCREEN]:
    'M12 2L4 6v5c0 5.25 3.4 10.15 8 11.95C16.6 21.15 20 16.25 20 11V6l-8-4z',
  // Water drop / fasting care
  [CulturalFlagType.FASTING_CARE]:
    'M12 2c-4 5.5-7 9.17-7 12a7 7 0 0 0 14 0c0-2.83-3-6.5-7-12z',
  // Users with X — no male family
  [CulturalFlagType.NO_MALE_FAMILY_PRESENT]:
    'M16 11V3H8v2H6V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8h-2zm-2 2H10v8h4v-8zM3 17l3-3m0 3l-3-3',
  // Users with X — no female family
  [CulturalFlagType.NO_FEMALE_FAMILY_PRESENT]:
    'M16 11V3H8v2H6V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8h-2zm-2 2H10v8h4v-8zM3 17l3-3m0 3l-3-3',
  // Modest gown
  [CulturalFlagType.MODEST_GOWN]:
    'M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM7 10l-2 12h14l-2-12H7z',
  // Clock / prayer time
  [CulturalFlagType.PRAYER_TIME_ACCOMMODATION]:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4v6l4 2',
  // Door / segregated waiting
  [CulturalFlagType.GENDER_SEGREGATED_WAITING]:
    'M3 3h7v18H3V3zm11 0h7v18h-7V3zm1.5 8h4M4.5 11h4',
  // Star / custom
  [CulturalFlagType.CUSTOM]:
    'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z',
}

/**
 * Display color: all cultural flags use a blue/purple accent.
 * NOT red — cultural flags are guidance, not clinical warnings.
 */
export const CULTURAL_FLAG_COLORS = {
  bg: 'bg-indigo-50 dark:bg-indigo-950',
  text: 'text-indigo-700 dark:text-indigo-300',
  icon: 'text-indigo-500 dark:text-indigo-400',
  border: 'border-indigo-200 dark:border-indigo-800',
} as const

/**
 * Translation key for each flag type's label.
 * Maps to `culturalFlags.flag.<TYPE>` in locale files.
 */
export function flagLabelKey(type: CulturalFlagType): string {
  return `culturalFlags.flag.${type}`
}

/**
 * Translation key for each flag type's description.
 * Maps to `culturalFlags.desc.<TYPE>` in locale files.
 */
export function flagDescKey(type: CulturalFlagType): string {
  return `culturalFlags.desc.${type}`
}
