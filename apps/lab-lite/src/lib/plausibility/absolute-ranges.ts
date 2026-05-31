/**
 * Absolute Range Reference Table
 * Story 43.5 — Task 1.2
 *
 * Physiologically IMPOSSIBLE ranges per analyte, keyed by LOINC code.
 * - absMin/absMax: outside this range = CRITICAL (cannot be real)
 * - criticalMin/criticalMax: outside this but inside abs = CRITICAL (dangerously abnormal)
 * - warnMin/warnMax: outside this but inside critical = WARNING (unusual but possible)
 *
 * Source: CLSI EP28-A3c, clinical laboratory reference texts.
 * These are universal physiological limits, NOT population-specific reference ranges.
 * Population-specific ranges live in Story 43.8 (localized reference ranges).
 */

export interface AbsoluteRange {
  analyteName: string
  unit: string
  absMin: number       // below this = impossible → CRITICAL
  absMax: number       // above this = impossible → CRITICAL
  criticalMin: number  // below this = critical value → CRITICAL
  criticalMax: number  // above this = critical value → CRITICAL
  warnMin?: number     // below this = warning → WARNING (optional)
  warnMax?: number     // above this = warning → WARNING (optional)
}

export const ABSOLUTE_RANGES: Record<string, AbsoluteRange> = {
  // ===========================================================================
  // CBC — Complete Blood Count
  // ===========================================================================
  '6690-2': {
    analyteName: 'WBC',
    unit: '10^3/uL',
    absMin: 0,       absMax: 500000,
    criticalMin: 0.5, criticalMax: 100,
    warnMin: 2.0,    warnMax: 30,
  },
  '789-8': {
    analyteName: 'RBC',
    unit: '10^6/uL',
    absMin: 0,       absMax: 15,
    criticalMin: 1.0, criticalMax: 8.0,
    warnMin: 2.5,    warnMax: 6.5,
  },
  '718-7': {
    analyteName: 'Hemoglobin',
    unit: 'g/dL',
    absMin: 0,       absMax: 30,
    criticalMin: 3.0, criticalMax: 22.0,
    warnMin: 7.0,    warnMax: 18.0,
  },
  '4544-3': {
    analyteName: 'Hematocrit',
    unit: '%',
    absMin: 0,       absMax: 80,
    criticalMin: 10,  criticalMax: 65,
    warnMin: 20,     warnMax: 55,
  },
  '787-2': {
    analyteName: 'MCV',
    unit: 'fL',
    absMin: 50,      absMax: 150,
    criticalMin: 60,  criticalMax: 130,
    warnMin: 70,     warnMax: 110,
  },
  '785-6': {
    analyteName: 'MCH',
    unit: 'pg',
    absMin: 10,      absMax: 60,
    criticalMin: 15,  criticalMax: 50,
  },
  '786-4': {
    analyteName: 'MCHC',
    unit: 'g/dL',
    absMin: 20,      absMax: 40,
    criticalMin: 24,  criticalMax: 38,
  },
  '777-3': {
    analyteName: 'Platelets',
    unit: '10^3/uL',
    absMin: 0,       absMax: 5000,
    criticalMin: 10,  criticalMax: 1500,
    warnMin: 50,     warnMax: 1000,
  },
  '770-8': {
    analyteName: 'Neutrophils%',
    unit: '%',
    absMin: 0,       absMax: 100,
    criticalMin: 1,   criticalMax: 99,
  },
  '736-9': {
    analyteName: 'Lymphocytes%',
    unit: '%',
    absMin: 0,       absMax: 100,
    criticalMin: 1,   criticalMax: 98,
  },
  '5905-5': {
    analyteName: 'Monocytes%',
    unit: '%',
    absMin: 0,       absMax: 100,
    criticalMin: 0,   criticalMax: 50,
  },
  '713-8': {
    analyteName: 'Eosinophils%',
    unit: '%',
    absMin: 0,       absMax: 100,
    criticalMin: 0,   criticalMax: 60,
  },
  // ===========================================================================
  // Basic Metabolic Panel
  // ===========================================================================
  '2345-7': {
    analyteName: 'Glucose',
    unit: 'mg/dL',
    absMin: 0,       absMax: 2000,
    criticalMin: 30,  criticalMax: 600,
    warnMin: 60,     warnMax: 400,
  },
  '2823-3': {
    analyteName: 'Potassium',
    unit: 'mEq/L',
    absMin: 0,       absMax: 15,
    criticalMin: 2.5, criticalMax: 6.5,
    warnMin: 3.0,    warnMax: 6.0,
  },
  '2951-2': {
    analyteName: 'Sodium',
    unit: 'mEq/L',
    absMin: 80,      absMax: 200,
    criticalMin: 115, criticalMax: 160,
    warnMin: 125,    warnMax: 155,
  },
  '2075-0': {
    analyteName: 'Chloride',
    unit: 'mEq/L',
    absMin: 50,      absMax: 160,
    criticalMin: 75,  criticalMax: 120,
  },
  '20565-8': {
    analyteName: 'CO2/Bicarbonate',
    unit: 'mEq/L',
    absMin: 0,       absMax: 60,
    criticalMin: 10,  criticalMax: 40,
  },
  '3094-0': {
    analyteName: 'BUN',
    unit: 'mg/dL',
    absMin: 0,       absMax: 400,
    criticalMin: 0,   criticalMax: 150,
  },
  '2160-0': {
    analyteName: 'Creatinine',
    unit: 'mg/dL',
    absMin: 0,       absMax: 50,
    criticalMin: 0,   criticalMax: 15,
    warnMin: 0,      warnMax: 10,
  },
  '17861-6': {
    analyteName: 'Calcium',
    unit: 'mg/dL',
    absMin: 0,       absMax: 20,
    criticalMin: 6.0, criticalMax: 13.0,
    warnMin: 7.5,    warnMax: 11.5,
  },
  // ===========================================================================
  // Liver Function
  // ===========================================================================
  '1742-6': {
    analyteName: 'ALT',
    unit: 'U/L',
    absMin: 0,       absMax: 10000,
    criticalMin: 0,   criticalMax: 3000,
    warnMin: 0,      warnMax: 500,
  },
  '1920-8': {
    analyteName: 'AST',
    unit: 'U/L',
    absMin: 0,       absMax: 10000,
    criticalMin: 0,   criticalMax: 3000,
    warnMin: 0,      warnMax: 500,
  },
  '6768-6': {
    analyteName: 'ALP',
    unit: 'U/L',
    absMin: 0,       absMax: 5000,
    criticalMin: 0,   criticalMax: 2000,
  },
  '1975-2': {
    analyteName: 'Total Bilirubin',
    unit: 'mg/dL',
    absMin: 0,       absMax: 80,
    criticalMin: 0,   criticalMax: 30,
    warnMin: 0,      warnMax: 15,
  },
  '2885-2': {
    analyteName: 'Total Protein',
    unit: 'g/dL',
    absMin: 0,       absMax: 15,
    criticalMin: 3.0, criticalMax: 10.0,
  },
  '1751-7': {
    analyteName: 'Albumin',
    unit: 'g/dL',
    absMin: 0,       absMax: 10,
    criticalMin: 1.5, criticalMax: 6.0,
  },
  // ===========================================================================
  // Coagulation
  // ===========================================================================
  '5902-2': {
    analyteName: 'PT',
    unit: 'seconds',
    absMin: 0,       absMax: 200,
    criticalMin: 0,   criticalMax: 100,
    warnMin: 0,      warnMax: 40,
  },
  '3173-2': {
    analyteName: 'aPTT',
    unit: 'seconds',
    absMin: 0,       absMax: 300,
    criticalMin: 0,   criticalMax: 150,
    warnMin: 20,     warnMax: 70,
  },
  // ===========================================================================
  // Thyroid
  // ===========================================================================
  '3016-3': {
    analyteName: 'TSH',
    unit: 'mIU/L',
    absMin: 0,       absMax: 500,
    criticalMin: 0,   criticalMax: 100,
    warnMin: 0,      warnMax: 20,
  },
  // ===========================================================================
  // HbA1c
  // ===========================================================================
  '59261-8': {
    analyteName: 'HbA1c',
    unit: '%',
    absMin: 2,       absMax: 20,
    criticalMin: 3,   criticalMax: 15,
    warnMin: 4,      warnMax: 12,
  },
  // ===========================================================================
  // Lipid Panel
  // ===========================================================================
  '2093-3': {
    analyteName: 'Total Cholesterol',
    unit: 'mg/dL',
    absMin: 0,       absMax: 1000,
    criticalMin: 0,   criticalMax: 700,
    warnMin: 0,      warnMax: 400,
  },
  '2571-8': {
    analyteName: 'Triglycerides',
    unit: 'mg/dL',
    absMin: 0,       absMax: 5000,
    criticalMin: 0,   criticalMax: 2000,
    warnMin: 0,      warnMax: 1000,
  },
  '2085-9': {
    analyteName: 'HDL',
    unit: 'mg/dL',
    absMin: 0,       absMax: 200,
    criticalMin: 10,  criticalMax: 150,
  },
  '13457-7': {
    analyteName: 'LDL',
    unit: 'mg/dL',
    absMin: 0,       absMax: 600,
    criticalMin: 0,   criticalMax: 400,
  },
  // ===========================================================================
  // Urinalysis
  // ===========================================================================
  '5811-5': {
    analyteName: 'Urine pH',
    unit: 'pH',
    absMin: 4.0,     absMax: 9.0,
    criticalMin: 4.5, criticalMax: 8.5,
  },
  '5804-0': {
    analyteName: 'Urine Protein',
    unit: 'mg/dL',
    absMin: 0,       absMax: 5000,
    criticalMin: 0,   criticalMax: 3000,
  },
}
