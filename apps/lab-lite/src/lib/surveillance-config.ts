/**
 * Surveillance Config — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Default reportable disease list per WHO IHR and Afghan MoPH requirements.
 * LOINC codes are placeholders — map to actual codes from loinc-categories.ts.
 * Seeded into Dexie `reportableDiseases` on first app load.
 *
 * No PHI involved — disease codes, thresholds, and LOINC codes are clinical
 * configuration data, not patient data.
 */

import type { ReportableDiseaseConfig } from './surveillance-types'

/**
 * Default reportable diseases.
 * loincCodes: RDT/microscopy/GeneXpert codes — map from loinc-categories.ts.
 * positiveResultIndicators: normalized lowercase result strings.
 */
export const DEFAULT_REPORTABLE_DISEASES: ReportableDiseaseConfig[] = [
  {
    diseaseCode: 'malaria',
    diseaseLabel: 'Malaria',
    loincCodes: [
      '51587-4', // Malaria smear microscopy
      '51588-2', // Malaria RDT
      '32700-7', // Microscopy observation
    ],
    positiveResultIndicators: ['positive', 'detected', 'reactive', 'present', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 3,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: false,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'tb',
    diseaseLabel: 'Tuberculosis',
    loincCodes: [
      '91809-4', // GeneXpert MTB/RIF
      '23332-8', // AFB smear
      '45323-5', // AFB culture
    ],
    positiveResultIndicators: ['positive', 'detected', 'mtb detected', 'acid fast bacilli seen', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 3,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: false,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'hep_b',
    diseaseLabel: 'Hepatitis B',
    loincCodes: [
      '5196-1',  // HBsAg
      '22316-2', // HBsAg EIA
    ],
    positiveResultIndicators: ['positive', 'reactive', 'detected', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 5,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: false,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'hep_c',
    diseaseLabel: 'Hepatitis C',
    loincCodes: [
      '13955-0', // Anti-HCV
      '40726-2', // HCV antibody
    ],
    positiveResultIndicators: ['positive', 'reactive', 'detected', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 5,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: false,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'cholera',
    diseaseLabel: 'Cholera',
    loincCodes: [
      '17820-0', // Vibrio cholerae culture
      '92830-9', // Cholera RDT
    ],
    positiveResultIndicators: ['positive', 'detected', 'vibrio cholerae isolated', '+'],
    spikeThresholdMultiplier: 1.5,
    clusterThreshold: 2,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: true,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'measles',
    diseaseLabel: 'Measles',
    loincCodes: [
      '35275-7', // Measles IgM
      '24415-0', // Measles IgM serology
    ],
    positiveResultIndicators: ['positive', 'reactive', 'detected', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 2,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: true,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'dengue',
    diseaseLabel: 'Dengue',
    loincCodes: [
      '80745-3', // Dengue NS1
      '59779-1', // Dengue IgM
      '29663-9', // Dengue antibody
    ],
    positiveResultIndicators: ['positive', 'reactive', 'detected', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 3,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: false,
    updatedAt: new Date().toISOString(),
  },
  {
    diseaseCode: 'covid19',
    diseaseLabel: 'COVID-19',
    loincCodes: [
      '94500-6', // SARS-CoV-2 PCR
      '94558-4', // SARS-CoV-2 rapid antigen
      '94507-1', // SARS-CoV-2 IgG
    ],
    positiveResultIndicators: ['positive', 'detected', 'sars-cov-2 detected', '+'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 5,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: true,
    updatedAt: new Date().toISOString(),
  },
]

/**
 * Seed the reportableDiseases table on first app load.
 * Only inserts diseases that don't yet exist — preserves lab customizations.
 * Never throws — seeding failure must not block app initialization.
 */
export async function seedReportableDiseases(): Promise<void> {
  try {
    const { putReportableDiseases, getAllReportableDiseases } = await import('./db')
    const existing = await getAllReportableDiseases()
    const existingCodes = new Set(existing.map((d) => d.diseaseCode))

    const toInsert = DEFAULT_REPORTABLE_DISEASES.filter(
      (d) => !existingCodes.has(d.diseaseCode),
    )

    if (toInsert.length > 0) {
      // Refresh updatedAt for fresh installs
      const now = new Date().toISOString()
      await putReportableDiseases(toInsert.map((d) => ({ ...d, updatedAt: now })))
    }
  } catch {
    // Never throw — seeding is best-effort
  }
}
