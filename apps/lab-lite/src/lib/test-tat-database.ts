/**
 * Test Turnaround Time (TAT) database.
 * Maps LOINC codes to turnaround time profiles used by the trip optimizer.
 *
 * Labs can override defaults via Dexie `tat_overrides` table.
 * Story 45.5 — Task 1
 */

export type TatCategory = 'rapid' | 'same-day' | 'extended'

export interface TestTatProfile {
  loincCode: string
  loincDisplay: string
  tatCategory: TatCategory
  /** Minutes to result — for rapid/same-day tests (patient may wait) */
  estimatedMinutes: number
  /** Calendar days to result — for extended tests only */
  estimatedDays?: number
  /** True if patient should stay and wait for this result */
  canWait: boolean
  /** True if result can be sent to doctor remotely (no patient return needed) */
  remoteDelivery: boolean
  notes?: string
}

/**
 * Default TAT profiles for all 8 LOINC categories used by Lab Lite.
 *
 * Rapid  (<60 min, canWait: true):  Urinalysis, Blood Glucose Fasting
 * Same-day (1-4 h, canWait: true):  CBC, BMP, Lipid, HbA1c, LFT, TSH
 * Extended (>1 day, canWait: false): scaffolded — none in current LOINC set
 *
 * Times are typical for standard small-lab analyzers.
 * Lab managers can override via settings (stored in Dexie tat_overrides).
 */
export const DEFAULT_TAT_PROFILES: readonly TestTatProfile[] = [
  // ── Rapid (<60 min) ───────────────────────────────────────────────────────
  {
    loincCode: '24356-8',
    loincDisplay: 'Urinalysis',
    tatCategory: 'rapid',
    estimatedMinutes: 20,
    canWait: true,
    remoteDelivery: false,
  },
  {
    loincCode: '1558-6',
    loincDisplay: 'Blood Glucose — Fasting',
    tatCategory: 'rapid',
    estimatedMinutes: 15,
    canWait: true,
    remoteDelivery: false,
  },

  // ── Same-day (30–240 min) ─────────────────────────────────────────────────
  {
    loincCode: '58410-2',
    loincDisplay: 'Blood Work — CBC',
    tatCategory: 'same-day',
    estimatedMinutes: 45,
    canWait: true,
    remoteDelivery: false,
  },
  {
    loincCode: '51990-0',
    loincDisplay: 'Basic Metabolic Panel',
    tatCategory: 'same-day',
    estimatedMinutes: 60,
    canWait: true,
    remoteDelivery: false,
  },
  {
    loincCode: '57698-3',
    loincDisplay: 'Lipid Panel',
    tatCategory: 'same-day',
    estimatedMinutes: 90,
    canWait: true,
    remoteDelivery: false,
  },
  {
    loincCode: '4548-4',
    loincDisplay: 'HbA1c',
    tatCategory: 'same-day',
    estimatedMinutes: 60,
    canWait: true,
    remoteDelivery: false,
  },
  {
    loincCode: '24325-3',
    loincDisplay: 'Liver Function Tests',
    tatCategory: 'same-day',
    estimatedMinutes: 90,
    canWait: true,
    remoteDelivery: false,
  },
  {
    loincCode: '3016-3',
    loincDisplay: 'Thyroid Function — TSH',
    tatCategory: 'same-day',
    estimatedMinutes: 120,
    canWait: true,
    remoteDelivery: false,
  },
] as const

/** Lookup a TAT profile by LOINC code. Checks lab-specific overrides first. */
export function getTatProfile(
  loincCode: string,
  overrides: Partial<Record<string, TestTatProfile>> = {},
): TestTatProfile | undefined {
  if (overrides[loincCode]) return overrides[loincCode]
  return DEFAULT_TAT_PROFILES.find((p) => p.loincCode === loincCode)
}
