/**
 * Medication-to-Lab-Test Mapping Table — Story 52.1 Task 1
 *
 * Clinically validated, physician-curated reference for medications that
 * require periodic lab monitoring. Initial set covers the most commonly
 * monitored medications in MENA primary care settings.
 *
 * Design:
 *  - Bundled offline as a static TypeScript module (fallback baseline)
 *  - Hub-updateable: overrides stored in Dexie `medication_lab_mappings` table
 *  - Versioned: each entry has a version stamp for tracking updates
 *  - Keyed by WHO ATC code (re-keyed from RxNorm in Task 8 — see comments)
 *
 * NOT AI-generated — clinical content authored by physician review.
 *
 * SYNC NOTE: The bundled TS map and the Hub DB seed (migration
 * seed_medication_lab_mappings) MUST stay identical. If you update an entry
 * here, update the seed migration to match and vice versa.
 */

import type { MedicationLabMapping, MonitoringTestSpec } from '@ultranos/shared-types'

// Re-export the shared types so existing consumers that import from this module
// continue to work without changing their import paths.
export type { MedicationLabMapping, MonitoringTestSpec }

/**
 * Bundled baseline mappings — shipped with the PWA.
 * The Hub can push overrides via `medication_lab_mappings` in Dexie.
 *
 * Clinical references:
 *  - Warfarin: ISTH, ACC/AHA anticoagulation guidelines
 *  - Metformin: ADA Standards of Medical Care; KDIGO 2022 CKD guidelines
 *  - Lithium: British Association for Psychopharmacology consensus guidelines
 *  - Methotrexate: ACR/EULAR rheumatology monitoring recommendations
 *  - ACE Inhibitors: KDIGO, JNC-8, ESC/ESH hypertension guidelines
 *  - Carbamazepine: ILAE epilepsy treatment guidelines
 *  - Amiodarone: ACC/AHA/HRS arrhythmia management guidelines
 *
 * Keys are WHO ATC codes (physician sign-off per task-8-brief.md).
 * Old RxNorm codes are preserved in trailing comments for cross-reference.
 */
export const BUNDLED_MEDICATION_MAPPINGS: MedicationLabMapping[] = [
  {
    atcCode: 'B01AA03',              // was RxNorm:11289
    medicationDisplay: 'Warfarin',
    version: 1,
    requiredTests: [
      {
        loincCode: '6301-6',
        testDisplay: 'INR (Prothrombin Time, Normalized)',
        frequencyDays: 14,       // stable patients; newly started: 3–7 days
        initialDelayDays: 3,
        priority: 'urgent',
      },
    ],
  },
  {
    atcCode: 'A10BA02',              // was RxNorm:6809
    medicationDisplay: 'Metformin',
    version: 1,
    requiredTests: [
      {
        loincCode: '2160-0',
        testDisplay: 'Creatinine, Serum',
        frequencyDays: 90,
        initialDelayDays: 90,
        priority: 'routine',
      },
      {
        loincCode: '62238-1',
        testDisplay: 'eGFR (CKD-EPI)',
        frequencyDays: 90,
        initialDelayDays: 90,
        priority: 'routine',
      },
    ],
  },
  {
    atcCode: 'N05AN01',              // was RxNorm:6448
    medicationDisplay: 'Lithium',
    version: 1,
    requiredTests: [
      {
        loincCode: '14334-7',
        testDisplay: 'Lithium, Serum',
        frequencyDays: 90,
        initialDelayDays: 5,    // 5 days after initiation for steady-state
        priority: 'routine',
      },
      {
        loincCode: '3016-3',
        testDisplay: 'TSH (Thyroid Stimulating Hormone)',
        frequencyDays: 180,
        initialDelayDays: 90,
        priority: 'routine',
      },
      {
        loincCode: '2160-0',
        testDisplay: 'Creatinine, Serum',
        frequencyDays: 180,
        initialDelayDays: 90,
        priority: 'routine',
      },
    ],
  },
  {
    // Methotrexate — oncology indication (clinical-coding ambiguity: seed both ATC codes)
    atcCode: 'L01BA01',              // was RxNorm:7235 (oncology)
    medicationDisplay: 'Methotrexate',
    version: 1,
    requiredTests: [
      {
        loincCode: '58410-2',
        testDisplay: 'CBC (Complete Blood Count)',
        frequencyDays: 30,
        initialDelayDays: 14,
        priority: 'routine',
      },
      {
        loincCode: '24325-3',
        testDisplay: 'Liver Function Panel (LFTs)',
        frequencyDays: 30,
        initialDelayDays: 14,
        priority: 'routine',
      },
    ],
  },
  {
    // Methotrexate — rheumatology/RA indication (same tests; controller ruling: err toward more monitoring)
    atcCode: 'L04AX03',              // was RxNorm:7235 (rheumatology/RA)
    medicationDisplay: 'Methotrexate',
    version: 1,
    requiredTests: [
      {
        loincCode: '58410-2',
        testDisplay: 'CBC (Complete Blood Count)',
        frequencyDays: 30,
        initialDelayDays: 14,
        priority: 'routine',
      },
      {
        loincCode: '24325-3',
        testDisplay: 'Liver Function Panel (LFTs)',
        frequencyDays: 30,
        initialDelayDays: 14,
        priority: 'routine',
      },
    ],
  },
  {
    // ACE Inhibitor class (Enalapril as representative code)
    atcCode: 'C09AA02',              // was RxNorm:3827
    medicationDisplay: 'ACE Inhibitor (Enalapril)',
    version: 1,
    requiredTests: [
      {
        loincCode: '2823-3',
        testDisplay: 'Potassium, Serum',
        frequencyDays: 90,
        initialDelayDays: 14,
        priority: 'routine',
      },
      {
        loincCode: '2160-0',
        testDisplay: 'Creatinine, Serum',
        frequencyDays: 90,
        initialDelayDays: 14,
        priority: 'routine',
      },
    ],
  },
  {
    atcCode: 'N03AF01',              // was RxNorm:2002
    medicationDisplay: 'Carbamazepine',
    version: 1,
    requiredTests: [
      {
        loincCode: '58410-2',
        testDisplay: 'CBC (Complete Blood Count)',
        frequencyDays: 90,
        initialDelayDays: 30,
        priority: 'routine',
      },
      {
        loincCode: '24325-3',
        testDisplay: 'Liver Function Panel (LFTs)',
        frequencyDays: 90,
        initialDelayDays: 30,
        priority: 'routine',
      },
      {
        loincCode: '3428-0',
        testDisplay: 'Carbamazepine, Drug Level',
        frequencyDays: 90,
        initialDelayDays: 30,
        priority: 'routine',
      },
    ],
  },
  {
    atcCode: 'C01BD01',              // was RxNorm:703
    medicationDisplay: 'Amiodarone',
    version: 1,
    requiredTests: [
      {
        loincCode: '3016-3',
        testDisplay: 'TSH (Thyroid Stimulating Hormone)',
        frequencyDays: 180,
        initialDelayDays: 90,
        priority: 'routine',
      },
      {
        loincCode: '24325-3',
        testDisplay: 'Liver Function Panel (LFTs)',
        frequencyDays: 180,
        initialDelayDays: 90,
        priority: 'routine',
      },
    ],
  },
]

/** Index by atcCode for O(1) lookups. */
const BUNDLED_INDEX = new Map<string, MedicationLabMapping>(
  BUNDLED_MEDICATION_MAPPINGS.map((m) => [m.atcCode, m]),
)

/**
 * Look up the monitoring mapping for a medication.
 * Returns null if no monitoring is required for this medication.
 *
 * @param atcCode      - WHO ATC code (e.g. 'B01AA03' for Warfarin)
 * @param hubOverrides - Optional Hub-pushed overrides (higher priority), keyed by ATC code
 */
export function getMedicationMapping(
  atcCode: string,
  hubOverrides?: Map<string, MedicationLabMapping>,
): MedicationLabMapping | null {
  // Hub overrides take precedence over bundled defaults
  if (hubOverrides?.has(atcCode)) {
    return hubOverrides.get(atcCode)!
  }
  return BUNDLED_INDEX.get(atcCode) ?? null
}

/**
 * Check if an ATC code requires any lab monitoring.
 */
export function requiresMonitoring(
  atcCode: string,
  hubOverrides?: Map<string, MedicationLabMapping>,
): boolean {
  return getMedicationMapping(atcCode, hubOverrides) !== null
}
