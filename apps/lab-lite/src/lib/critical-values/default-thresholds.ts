/**
 * Story 43.7 — Default Critical Value Thresholds
 *
 * These are the baseline critical thresholds used when no lab-specific override
 * exists in Dexie. They match standard clinical laboratory reference values.
 *
 * Seeded into `criticalValueThresholds` on DB version 17 upgrade (insert only if
 * the table is empty — labs may have existing overrides).
 *
 * PHI: None — these are clinical configuration values, not patient data.
 */

import type { CriticalValueThreshold, ChecklistConfigItem } from './types'

export const DEFAULT_CRITICAL_THRESHOLDS: Omit<CriticalValueThreshold, 'id'>[] = [
  {
    loincCode: '2823-3',
    analyte: 'Potassium',
    testName: 'Potassium',
    unit: 'mEq/L',
    criticalLow: 2.5,
    criticalHigh: 6.5,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '2345-7',
    analyte: 'Glucose',
    testName: 'Glucose',
    unit: 'mg/dL',
    criticalLow: 40,
    criticalHigh: 500,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '718-7',
    analyte: 'Hemoglobin',
    testName: 'Hemoglobin',
    unit: 'g/dL',
    criticalLow: 5.0,
    criticalHigh: 20.0,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '6690-2',
    analyte: 'WBC',
    testName: 'White Blood Cell Count',
    unit: '10^3/uL',
    criticalLow: 1.0,
    criticalHigh: 50.0,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '777-3',
    analyte: 'Platelets',
    testName: 'Platelet Count',
    unit: '10^3/uL',
    criticalLow: 20,
    criticalHigh: 1000,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '2951-2',
    analyte: 'Sodium',
    testName: 'Sodium',
    unit: 'mEq/L',
    criticalLow: 120,
    criticalHigh: 160,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '17861-6',
    analyte: 'Calcium',
    testName: 'Calcium',
    unit: 'mg/dL',
    criticalLow: 6.0,
    criticalHigh: 13.0,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
  {
    loincCode: '6301-6',
    analyte: 'INR',
    testName: 'INR (Prothrombin Time)',
    unit: '',
    criticalLow: null,
    criticalHigh: 5.0,
    isActive: true,
    configuredBy: 'system',
    updatedAt: new Date('2026-01-01').toISOString(),
  },
]

/**
 * Default checklist items that appear for every lab.
 * Labs can:
 *   - Toggle non-default items between required and optional
 *   - Add custom items
 *   - Remove non-default items
 * Default items (isDefault: true) cannot be removed, only toggled to optional.
 */
export const DEFAULT_CHECKLIST_CONFIG_ITEMS: ChecklistConfigItem[] = [
  {
    id: 'qc-passed-today',
    label: 'QC passed today for this analyte',
    isRequired: true,
    isDefault: true,
    order: 1,
  },
  {
    id: 'patient-id-verified',
    label: 'Patient ID verified (two-identifier)',
    isRequired: true,
    isDefault: true,
    order: 2,
  },
  {
    id: 'result-plausibility',
    label: 'Result reviewed for plausibility',
    isRequired: true,
    isDefault: true,
    order: 3,
  },
  {
    id: 'delta-check-reviewed',
    label: 'Delta check reviewed (if prior result exists)',
    isRequired: true,
    isDefault: true,
    order: 4,
  },
  {
    id: 'repeat-testing',
    label: 'Repeat testing performed (if required by lab policy)',
    isRequired: false,
    isDefault: true,
    order: 5,
  },
]
