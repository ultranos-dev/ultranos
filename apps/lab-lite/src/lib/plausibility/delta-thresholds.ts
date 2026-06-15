/**
 * Delta Check Thresholds
 * Story 43.5 — Task 1.3
 *
 * Configurable thresholds for detecting physiologically suspicious changes
 * between consecutive results for the same analyte on the same patient.
 *
 * A delta flag fires when EITHER maxDeltaPercent OR maxDeltaAbsolute is exceeded
 * within timeWindowHours of the previous result.
 *
 * Source: Based on CLSI EP15-A3, Westgard delta check guidelines,
 * and clinical laboratory delta check recommendations.
 */

export interface DeltaThreshold {
  analyteName: string
  maxDeltaPercent: number   // percentage change threshold (relative)
  maxDeltaAbsolute: number  // absolute change threshold
  timeWindowHours: number   // only compare results within this time window
}

export const DEFAULT_DELTA_THRESHOLDS: Record<string, DeltaThreshold> = {
  // CBC
  '718-7': {
    analyteName: 'Hemoglobin',
    maxDeltaPercent: 30,
    maxDeltaAbsolute: 3.0,
    timeWindowHours: 72,
  },
  '4544-3': {
    analyteName: 'Hematocrit',
    maxDeltaPercent: 30,
    maxDeltaAbsolute: 9.0,
    timeWindowHours: 72,
  },
  '777-3': {
    analyteName: 'Platelets',
    maxDeltaPercent: 50,
    maxDeltaAbsolute: 100,
    timeWindowHours: 48,
  },
  '6690-2': {
    analyteName: 'WBC',
    maxDeltaPercent: 100,
    maxDeltaAbsolute: 10,
    timeWindowHours: 48,
  },
  // Metabolic
  '2823-3': {
    analyteName: 'Potassium',
    maxDeltaPercent: 50,
    maxDeltaAbsolute: 2.0,
    timeWindowHours: 24,
  },
  '2951-2': {
    analyteName: 'Sodium',
    maxDeltaPercent: 10,
    maxDeltaAbsolute: 12,
    timeWindowHours: 24,
  },
  '2345-7': {
    analyteName: 'Glucose',
    maxDeltaPercent: 100,
    maxDeltaAbsolute: 200,
    timeWindowHours: 24,
  },
  '17861-6': {
    analyteName: 'Calcium',
    maxDeltaPercent: 25,
    maxDeltaAbsolute: 2.5,
    timeWindowHours: 24,
  },
  '2160-0': {
    analyteName: 'Creatinine',
    maxDeltaPercent: 50,
    maxDeltaAbsolute: 2.0,
    timeWindowHours: 48,
  },
  // Liver function
  '1742-6': {
    analyteName: 'ALT',
    maxDeltaPercent: 200,
    maxDeltaAbsolute: 200,
    timeWindowHours: 72,
  },
  '1920-8': {
    analyteName: 'AST',
    maxDeltaPercent: 200,
    maxDeltaAbsolute: 200,
    timeWindowHours: 72,
  },
  '1975-2': {
    analyteName: 'Total Bilirubin',
    maxDeltaPercent: 100,
    maxDeltaAbsolute: 5.0,
    timeWindowHours: 48,
  },
  // Coagulation
  '5902-2': {
    analyteName: 'PT',
    maxDeltaPercent: 50,
    maxDeltaAbsolute: 10,
    timeWindowHours: 24,
  },
  '3173-2': {
    analyteName: 'aPTT',
    maxDeltaPercent: 50,
    maxDeltaAbsolute: 20,
    timeWindowHours: 24,
  },
}
