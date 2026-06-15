/**
 * Post-Exposure Prophylaxis (PEP) decision tree — Story 47.1
 *
 * Pure TypeScript. No network calls, no Dexie, no React dependencies.
 * All UNKNOWN source statuses are treated as POSITIVE (precautionary principle).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum ExposureType {
  NEEDLESTICK = 'NEEDLESTICK',
  SPLASH_MUCOUS = 'SPLASH_MUCOUS',
  SPLASH_BROKEN_SKIN = 'SPLASH_BROKEN_SKIN',
}

export type InfectionStatus = 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN'

export interface SourceStatus {
  hepB: InfectionStatus
  hiv: InfectionStatus
  hepC: InfectionStatus
}

export type PepUrgency = 'IMMEDIATE' | 'WITHIN_HOURS' | 'MONITOR'

export interface PepRecommendation {
  urgency: PepUrgency
  actions: string[]
  referral: boolean
}

export type HepBImmunityStatus = 'IMMUNE' | 'NOT_IMMUNE' | 'UNKNOWN'

export interface TechVaccinationStatus {
  hepBImmunity: HepBImmunityStatus
  lastHepBTiterDate?: string // ISO date
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Urgency numeric weight — higher = more urgent. */
const URGENCY_WEIGHT: Record<PepUrgency, number> = {
  IMMEDIATE: 2,
  WITHIN_HOURS: 1,
  MONITOR: 0,
}

/** Returns the higher-priority urgency of the two. */
function maxUrgency(a: PepUrgency, b: PepUrgency): PepUrgency {
  return URGENCY_WEIGHT[a] >= URGENCY_WEIGHT[b] ? a : b
}

/** Precautionary principle — UNKNOWN treated as POSITIVE. */
function isRisk(status: InfectionStatus): boolean {
  return status === 'POSITIVE' || status === 'UNKNOWN'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns ordered English first-aid steps for the given exposure type.
 */
export function getFirstAidSteps(exposureType: ExposureType): string[] {
  switch (exposureType) {
    case ExposureType.NEEDLESTICK:
      return [
        'Immediately wash the wound with soap and water for at least 15 seconds',
        'Do not squeeze or suck the wound',
        'Allow the wound to bleed freely for a few seconds',
        'Apply an antiseptic (e.g. iodine solution or 70% alcohol) to the wound',
        'Cover the wound with a sterile dressing',
        'Report to your supervisor immediately',
        'Proceed to source patient identification',
      ]

    case ExposureType.SPLASH_MUCOUS:
      return [
        'Immediately flush eyes with large amounts of clean water or saline for at least 15 minutes',
        'Remove contact lenses if present before flushing',
        'Flush the nose and mouth with water if affected',
        'Do not rub the affected area',
        'Report to your supervisor immediately',
        'Proceed to source patient identification',
      ]

    case ExposureType.SPLASH_BROKEN_SKIN:
      return [
        'Immediately wash the affected skin with soap and water for at least 15 seconds',
        'Do not scrub broken skin',
        'Apply an antiseptic (e.g. iodine solution or 70% alcohol) to the area',
        'Cover with a sterile dressing',
        'Report to your supervisor immediately',
        'Proceed to source patient identification',
      ]
  }
}

/**
 * PEP decision tree.
 *
 * Rules (in evaluation order):
 *  1. HIV risk (any exposure type) → IMMEDIATE
 *  2. Needlestick + HepB risk + tech NOT immune → IMMEDIATE
 *  3. Needlestick + HepC risk → IMMEDIATE
 *  4. Needlestick + no higher-urgency rule → WITHIN_HOURS
 *  5. Splash + any source risk → WITHIN_HOURS
 *  6. Splash + all negative → MONITOR
 *
 * Urgency priority: IMMEDIATE > WITHIN_HOURS > MONITOR.
 */
export function getPepRecommendation(
  exposureType: ExposureType,
  sourceStatus: SourceStatus,
  techVaccinationStatus: TechVaccinationStatus,
): PepRecommendation {
  let urgency: PepUrgency = 'MONITOR'
  let referral = false
  const actions: string[] = []

  // -----------------------------------------------------------------------
  // Rule 1 — HIV risk (applies to all exposure types)
  // -----------------------------------------------------------------------
  if (isRisk(sourceStatus.hiv)) {
    urgency = maxUrgency(urgency, 'IMMEDIATE')
    referral = true
    actions.push(
      'Start HIV PEP within 2 hours for maximum effectiveness',
      'Contact infection control officer immediately',
      'Do not delay — go to nearest PEP provider now',
    )
  }

  // -----------------------------------------------------------------------
  // Needlestick-specific rules
  // -----------------------------------------------------------------------
  if (exposureType === ExposureType.NEEDLESTICK) {
    // Rule 2 — HepB risk + tech not immune
    if (isRisk(sourceStatus.hepB) && techVaccinationStatus.hepBImmunity !== 'IMMUNE') {
      urgency = maxUrgency(urgency, 'IMMEDIATE')
      referral = true
    }

    // Rule 3 — HepC risk
    if (isRisk(sourceStatus.hepC)) {
      urgency = maxUrgency(urgency, 'IMMEDIATE')
      referral = true
    }

    // Rule 4 — Needlestick baseline (if no higher urgency triggered)
    if (urgency === 'MONITOR') {
      urgency = 'WITHIN_HOURS'
      referral = true
    }
  }

  // -----------------------------------------------------------------------
  // Splash rules (SPLASH_MUCOUS or SPLASH_BROKEN_SKIN)
  // -----------------------------------------------------------------------
  if (
    exposureType === ExposureType.SPLASH_MUCOUS ||
    exposureType === ExposureType.SPLASH_BROKEN_SKIN
  ) {
    const anyRisk =
      isRisk(sourceStatus.hiv) ||
      isRisk(sourceStatus.hepB) ||
      isRisk(sourceStatus.hepC)

    if (anyRisk) {
      // Rule 5 — any source risk for splash → at least WITHIN_HOURS
      urgency = maxUrgency(urgency, 'WITHIN_HOURS')
      referral = true
    }
    // Rule 6 — all negative → MONITOR, referral false (defaults already set)
  }

  // -----------------------------------------------------------------------
  // Compose urgency-level actions
  // -----------------------------------------------------------------------
  if (urgency === 'IMMEDIATE') {
    actions.push('Seek medical care IMMEDIATELY — PEP must start within 2 hours for HIV')
  } else if (urgency === 'WITHIN_HOURS') {
    actions.push('Seek medical care within 4 hours', 'Contact infection control officer')
  } else {
    // MONITOR
    actions.push(
      'Monitor for symptoms for 6 weeks',
      'Report any fever, rash, or flu-like symptoms immediately',
    )
  }

  // Referral-level administrative actions
  if (referral) {
    actions.push('Complete incident report', 'Notify lab manager')
  }

  return { urgency, actions, referral }
}

/**
 * Returns a human-readable label for each exposure type.
 */
export function getExposureTypeLabel(exposureType: ExposureType): string {
  switch (exposureType) {
    case ExposureType.NEEDLESTICK:
      return 'Needle-stick / Sharp Injury'
    case ExposureType.SPLASH_MUCOUS:
      return 'Splash to Eyes / Mucous Membrane'
    case ExposureType.SPLASH_BROKEN_SKIN:
      return 'Splash to Broken Skin'
  }
}
