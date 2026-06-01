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
 *
 * NOT AI-generated — clinical content authored by physician review.
 */

export interface MonitoringTestSpec {
  loincCode: string
  testDisplay: string
  frequencyDays: number
  initialDelayDays: number
  priority: 'routine' | 'urgent'
}

export interface MedicationLabMapping {
  medicationCode: string          // RxNorm or local formulary code
  medicationDisplay: string       // human-readable name
  version: number                 // incremented when mapping is updated
  requiredTests: MonitoringTestSpec[]
}

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
 */
export const BUNDLED_MEDICATION_MAPPINGS: MedicationLabMapping[] = [
  {
    medicationCode: 'RxNorm:11289',
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
    medicationCode: 'RxNorm:6809',
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
    medicationCode: 'RxNorm:6448',
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
    medicationCode: 'RxNorm:7235',
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
    medicationCode: 'RxNorm:3827',
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
    medicationCode: 'RxNorm:2002',
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
    medicationCode: 'RxNorm:703',
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

/** Index by medicationCode for O(1) lookups. */
const BUNDLED_INDEX = new Map<string, MedicationLabMapping>(
  BUNDLED_MEDICATION_MAPPINGS.map((m) => [m.medicationCode, m]),
)

/**
 * Look up the monitoring mapping for a medication.
 * Returns null if no monitoring is required for this medication.
 *
 * @param medicationCode - RxNorm or local formulary code
 * @param hubOverrides   - Optional Hub-pushed overrides (higher priority)
 */
export function getMedicationMapping(
  medicationCode: string,
  hubOverrides?: Map<string, MedicationLabMapping>,
): MedicationLabMapping | null {
  // Hub overrides take precedence over bundled defaults
  if (hubOverrides?.has(medicationCode)) {
    return hubOverrides.get(medicationCode)!
  }
  return BUNDLED_INDEX.get(medicationCode) ?? null
}

/**
 * Check if a medication code requires any lab monitoring.
 */
export function requiresMonitoring(
  medicationCode: string,
  hubOverrides?: Map<string, MedicationLabMapping>,
): boolean {
  return getMedicationMapping(medicationCode, hubOverrides) !== null
}
