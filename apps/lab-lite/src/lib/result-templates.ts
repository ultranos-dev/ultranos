/**
 * Result Templates — Structured entry templates for each LOINC category.
 *
 * Story 42.4 — AC 1, 5, 6
 *
 * Templates define field schemas, reference ranges (age/gender-specific),
 * auto-calc formulas, and versioning. They are seeded into Dexie v21 for
 * offline use and versioned so historical results always reference the exact
 * template version they were entered against.
 *
 * PHI note: template definitions contain no patient data.
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface ReferenceRange {
  gender?: 'male' | 'female' | 'all' // 'all' or omitted = applies to both
  ageMin?: number // inclusive, years
  ageMax?: number // inclusive, years
  referenceLow: number
  referenceHigh: number
  criticalLow?: number // if omitted, no LL flag for this range
  criticalHigh?: number // if omitted, no HH flag for this range
}

export interface SelectOption {
  value: string
  label: string // i18n key
}

export interface TemplateField {
  code: string // unique within template (e.g. 'wbc', 'rbc')
  loincCode: string // individual LOINC code for this analyte
  label: string // i18n key (e.g. 'resultEntry.fields.wbc')
  type: 'numeric' | 'text' | 'select'
  unit?: string // e.g. '10^3/uL', 'g/dL', 'mg/dL'
  decimalPrecision?: number // decimal places (default: 2)
  required: boolean
  referenceRanges?: ReferenceRange[] // only for numeric fields
  options?: SelectOption[] // only for select fields
  autoCalc?: {
    formula: (values: Record<string, number | null>) => number | null
    formulaDisplay: string // human-readable, e.g. 'Hct / RBC × 10'
    prerequisites: string[] // field codes required for calculation
  }
  sortOrder: number
}

export interface ResultTemplate {
  id: string // e.g. 'tpl-cbc-v1.0.0'
  loincCode: string // panel-level LOINC
  loincDisplay: string // e.g. 'Blood Work — CBC'
  templateVersion: string // semver, e.g. '1.0.0'
  fields: TemplateField[]
  category: string // grouping label
  effectiveDate: string // ISO date when this version became active
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

// 1. Blood Work — CBC (58410-2)
const CBC_TEMPLATE: ResultTemplate = {
  id: 'tpl-cbc-v1.0.0',
  loincCode: '58410-2',
  loincDisplay: 'Blood Work \u2014 CBC',
  templateVersion: '1.0.0',
  category: 'Hematology',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'wbc',
      loincCode: '6690-2',
      label: 'resultEntry.fields.wbc',
      type: 'numeric',
      unit: '10\u00b3/\u03bcL',
      decimalPrecision: 1,
      required: true,
      sortOrder: 1,
      referenceRanges: [
        {
          referenceLow: 4.5,
          referenceHigh: 11.0,
          criticalLow: 2.0,
          criticalHigh: 30.0,
        },
      ],
    },
    {
      code: 'rbc',
      loincCode: '789-8',
      label: 'resultEntry.fields.rbc',
      type: 'numeric',
      unit: '10\u2076/\u03bcL',
      decimalPrecision: 2,
      required: true,
      sortOrder: 2,
      referenceRanges: [
        { gender: 'male', referenceLow: 4.7, referenceHigh: 6.1 },
        { gender: 'female', referenceLow: 4.2, referenceHigh: 5.4 },
      ],
    },
    {
      code: 'hgb',
      loincCode: '718-7',
      label: 'resultEntry.fields.hgb',
      type: 'numeric',
      unit: 'g/dL',
      decimalPrecision: 1,
      required: true,
      sortOrder: 3,
      referenceRanges: [
        { gender: 'male', referenceLow: 13.5, referenceHigh: 17.5, criticalLow: 7.0, criticalHigh: 20.0 },
        { gender: 'female', referenceLow: 12.0, referenceHigh: 16.0, criticalLow: 7.0, criticalHigh: 20.0 },
      ],
    },
    {
      code: 'hct',
      loincCode: '4544-3',
      label: 'resultEntry.fields.hct',
      type: 'numeric',
      unit: '%',
      decimalPrecision: 1,
      required: true,
      sortOrder: 4,
      referenceRanges: [
        { gender: 'male', referenceLow: 38.3, referenceHigh: 48.6, criticalLow: 20, criticalHigh: 60 },
        { gender: 'female', referenceLow: 35.5, referenceHigh: 44.9, criticalLow: 20, criticalHigh: 60 },
      ],
    },
    {
      code: 'plt',
      loincCode: '777-3',
      label: 'resultEntry.fields.plt',
      type: 'numeric',
      unit: '10\u00b3/\u03bcL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 5,
      referenceRanges: [
        { referenceLow: 150, referenceHigh: 400, criticalLow: 50, criticalHigh: 1000 },
      ],
    },
    {
      code: 'mcv',
      loincCode: '787-2',
      label: 'resultEntry.fields.mcv',
      type: 'numeric',
      unit: 'fL',
      decimalPrecision: 1,
      required: false,
      sortOrder: 6,
      referenceRanges: [{ referenceLow: 80, referenceHigh: 100 }],
      autoCalc: {
        formula: (v) =>
          v.hct != null && v.rbc != null && v.rbc !== 0
            ? (v.hct / v.rbc) * 10
            : null,
        formulaDisplay: '(Hct / RBC) \u00d7 10',
        prerequisites: ['hct', 'rbc'],
      },
    },
    {
      code: 'mch',
      loincCode: '785-6',
      label: 'resultEntry.fields.mch',
      type: 'numeric',
      unit: 'pg',
      decimalPrecision: 1,
      required: false,
      sortOrder: 7,
      referenceRanges: [{ referenceLow: 27, referenceHigh: 33 }],
      autoCalc: {
        formula: (v) =>
          v.hgb != null && v.rbc != null && v.rbc !== 0
            ? (v.hgb / v.rbc) * 10
            : null,
        formulaDisplay: '(Hgb / RBC) \u00d7 10',
        prerequisites: ['hgb', 'rbc'],
      },
    },
    {
      code: 'mchc',
      loincCode: '786-4',
      label: 'resultEntry.fields.mchc',
      type: 'numeric',
      unit: 'g/dL',
      decimalPrecision: 1,
      required: false,
      sortOrder: 8,
      referenceRanges: [{ referenceLow: 32, referenceHigh: 36 }],
      autoCalc: {
        formula: (v) =>
          v.hgb != null && v.hct != null && v.hct !== 0
            ? (v.hgb / v.hct) * 100
            : null,
        formulaDisplay: '(Hgb / Hct) \u00d7 100',
        prerequisites: ['hgb', 'hct'],
      },
    },
  ],
}

// 2. Lipid Panel (57698-3)
const LIPID_TEMPLATE: ResultTemplate = {
  id: 'tpl-lipid-v1.0.0',
  loincCode: '57698-3',
  loincDisplay: 'Lipid Panel',
  templateVersion: '1.0.0',
  category: 'Chemistry',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'tc',
      loincCode: '2093-3',
      label: 'resultEntry.fields.tc',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 1,
      referenceRanges: [{ referenceLow: 0, referenceHigh: 200, criticalHigh: 400 }],
    },
    {
      code: 'tg',
      loincCode: '2571-8',
      label: 'resultEntry.fields.tg',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 2,
      referenceRanges: [{ referenceLow: 0, referenceHigh: 150, criticalHigh: 500 }],
    },
    {
      code: 'hdl',
      loincCode: '2085-9',
      label: 'resultEntry.fields.hdl',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 3,
      referenceRanges: [{ referenceLow: 40, referenceHigh: 9999 }],
    },
    {
      code: 'ldl',
      loincCode: '2089-1',
      label: 'resultEntry.fields.ldl',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 4,
      referenceRanges: [{ referenceLow: 0, referenceHigh: 100, criticalHigh: 190 }],
    },
    {
      code: 'vldl',
      loincCode: '13457-7',
      label: 'resultEntry.fields.vldl',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: false,
      sortOrder: 5,
      referenceRanges: [{ referenceLow: 0, referenceHigh: 30 }],
      autoCalc: {
        formula: (v) => (v.tg != null ? v.tg / 5 : null),
        formulaDisplay: 'TG / 5',
        prerequisites: ['tg'],
      },
    },
    {
      code: 'tc_hdl_ratio',
      loincCode: '9830-1',
      label: 'resultEntry.fields.tcHdlRatio',
      type: 'numeric',
      unit: 'ratio',
      decimalPrecision: 2,
      required: false,
      sortOrder: 6,
      referenceRanges: [{ referenceLow: 0, referenceHigh: 5.0 }],
      autoCalc: {
        formula: (v) =>
          v.tc != null && v.hdl != null && v.hdl !== 0
            ? v.tc / v.hdl
            : null,
        formulaDisplay: 'TC / HDL',
        prerequisites: ['tc', 'hdl'],
      },
    },
  ],
}

// 3. HbA1c (4548-4)
const HBA1C_TEMPLATE: ResultTemplate = {
  id: 'tpl-hba1c-v1.0.0',
  loincCode: '4548-4',
  loincDisplay: 'HbA1c',
  templateVersion: '1.0.0',
  category: 'Chemistry',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'hba1c',
      loincCode: '4548-4',
      label: 'resultEntry.fields.hba1c',
      type: 'numeric',
      unit: '%',
      decimalPrecision: 1,
      required: true,
      sortOrder: 1,
      referenceRanges: [{ referenceLow: 4.0, referenceHigh: 5.6, criticalHigh: 14.0 }],
    },
    {
      code: 'eag',
      loincCode: '27353-2',
      label: 'resultEntry.fields.eag',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: false,
      sortOrder: 2,
      autoCalc: {
        formula: (v) =>
          v.hba1c != null ? 28.7 * v.hba1c - 46.7 : null,
        formulaDisplay: '(28.7 \u00d7 HbA1c) \u2212 46.7',
        prerequisites: ['hba1c'],
      },
    },
  ],
}

// 4. Basic Metabolic Panel (51990-0)
const BMP_TEMPLATE: ResultTemplate = {
  id: 'tpl-bmp-v1.0.0',
  loincCode: '51990-0',
  loincDisplay: 'Basic Metabolic Panel',
  templateVersion: '1.0.0',
  category: 'Chemistry',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'glucose',
      loincCode: '2345-7',
      label: 'resultEntry.fields.glucose',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 1,
      referenceRanges: [{ referenceLow: 70, referenceHigh: 100, criticalLow: 40, criticalHigh: 500 }],
    },
    {
      code: 'bun',
      loincCode: '3094-0',
      label: 'resultEntry.fields.bun',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 2,
      referenceRanges: [{ referenceLow: 7, referenceHigh: 20, criticalHigh: 100 }],
    },
    {
      code: 'creatinine',
      loincCode: '2160-0',
      label: 'resultEntry.fields.creatinine',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 2,
      required: true,
      sortOrder: 3,
      referenceRanges: [
        { gender: 'male', referenceLow: 0.7, referenceHigh: 1.3, criticalHigh: 10.0 },
        { gender: 'female', referenceLow: 0.6, referenceHigh: 1.1, criticalHigh: 10.0 },
      ],
    },
    {
      code: 'sodium',
      loincCode: '2951-2',
      label: 'resultEntry.fields.sodium',
      type: 'numeric',
      unit: 'mEq/L',
      decimalPrecision: 0,
      required: true,
      sortOrder: 4,
      referenceRanges: [{ referenceLow: 136, referenceHigh: 145, criticalLow: 120, criticalHigh: 160 }],
    },
    {
      code: 'potassium',
      loincCode: '2823-3',
      label: 'resultEntry.fields.potassium',
      type: 'numeric',
      unit: 'mEq/L',
      decimalPrecision: 1,
      required: true,
      sortOrder: 5,
      referenceRanges: [{ referenceLow: 3.5, referenceHigh: 5.0, criticalLow: 2.5, criticalHigh: 6.5 }],
    },
    {
      code: 'chloride',
      loincCode: '2075-0',
      label: 'resultEntry.fields.chloride',
      type: 'numeric',
      unit: 'mEq/L',
      decimalPrecision: 0,
      required: true,
      sortOrder: 6,
      referenceRanges: [{ referenceLow: 98, referenceHigh: 106, criticalLow: 80, criticalHigh: 120 }],
    },
    {
      code: 'co2',
      loincCode: '2028-9',
      label: 'resultEntry.fields.co2',
      type: 'numeric',
      unit: 'mEq/L',
      decimalPrecision: 0,
      required: true,
      sortOrder: 7,
      referenceRanges: [{ referenceLow: 23, referenceHigh: 29, criticalLow: 10, criticalHigh: 40 }],
    },
    {
      code: 'calcium',
      loincCode: '17861-6',
      label: 'resultEntry.fields.calcium',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 1,
      required: true,
      sortOrder: 8,
      referenceRanges: [{ referenceLow: 8.5, referenceHigh: 10.5, criticalLow: 6.0, criticalHigh: 13.0 }],
    },
    {
      code: 'bun_cr_ratio',
      loincCode: '3097-3',
      label: 'resultEntry.fields.bunCrRatio',
      type: 'numeric',
      unit: 'ratio',
      decimalPrecision: 1,
      required: false,
      sortOrder: 9,
      referenceRanges: [{ referenceLow: 10, referenceHigh: 20 }],
      autoCalc: {
        formula: (v) =>
          v.bun != null && v.creatinine != null && v.creatinine !== 0
            ? v.bun / v.creatinine
            : null,
        formulaDisplay: 'BUN / Creatinine',
        prerequisites: ['bun', 'creatinine'],
      },
    },
    {
      code: 'anion_gap',
      loincCode: '33037-3',
      label: 'resultEntry.fields.anionGap',
      type: 'numeric',
      unit: 'mEq/L',
      decimalPrecision: 0,
      required: false,
      sortOrder: 10,
      referenceRanges: [{ referenceLow: 8, referenceHigh: 12 }],
      autoCalc: {
        formula: (v) =>
          v.sodium != null && v.chloride != null && v.co2 != null
            ? v.sodium - (v.chloride + v.co2)
            : null,
        formulaDisplay: 'Na \u2212 (Cl + CO\u2082)',
        prerequisites: ['sodium', 'chloride', 'co2'],
      },
    },
  ],
}

// 5. Liver Function Tests (24325-3)
const LFT_TEMPLATE: ResultTemplate = {
  id: 'tpl-lft-v1.0.0',
  loincCode: '24325-3',
  loincDisplay: 'Liver Function Tests',
  templateVersion: '1.0.0',
  category: 'Chemistry',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'alt',
      loincCode: '1742-6',
      label: 'resultEntry.fields.alt',
      type: 'numeric',
      unit: 'U/L',
      decimalPrecision: 0,
      required: true,
      sortOrder: 1,
      referenceRanges: [{ referenceLow: 7, referenceHigh: 56, criticalHigh: 1000 }],
    },
    {
      code: 'ast',
      loincCode: '1920-8',
      label: 'resultEntry.fields.ast',
      type: 'numeric',
      unit: 'U/L',
      decimalPrecision: 0,
      required: true,
      sortOrder: 2,
      referenceRanges: [{ referenceLow: 10, referenceHigh: 40, criticalHigh: 1000 }],
    },
    {
      code: 'alp',
      loincCode: '6768-6',
      label: 'resultEntry.fields.alp',
      type: 'numeric',
      unit: 'U/L',
      decimalPrecision: 0,
      required: true,
      sortOrder: 3,
      referenceRanges: [{ referenceLow: 44, referenceHigh: 147 }],
    },
    {
      code: 'tbil',
      loincCode: '1975-2',
      label: 'resultEntry.fields.tbil',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 2,
      required: true,
      sortOrder: 4,
      referenceRanges: [{ referenceLow: 0.1, referenceHigh: 1.2, criticalHigh: 12.0 }],
    },
    {
      code: 'dbil',
      loincCode: '1968-7',
      label: 'resultEntry.fields.dbil',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 2,
      required: true,
      sortOrder: 5,
      referenceRanges: [{ referenceLow: 0.0, referenceHigh: 0.3 }],
    },
    {
      code: 'albumin',
      loincCode: '1751-7',
      label: 'resultEntry.fields.albumin',
      type: 'numeric',
      unit: 'g/dL',
      decimalPrecision: 1,
      required: true,
      sortOrder: 6,
      referenceRanges: [{ referenceLow: 3.5, referenceHigh: 5.5, criticalLow: 1.5 }],
    },
    {
      code: 'tp',
      loincCode: '2885-2',
      label: 'resultEntry.fields.tp',
      type: 'numeric',
      unit: 'g/dL',
      decimalPrecision: 1,
      required: true,
      sortOrder: 7,
      referenceRanges: [{ referenceLow: 6.0, referenceHigh: 8.3 }],
    },
    {
      code: 'ibil',
      loincCode: '1971-1',
      label: 'resultEntry.fields.ibil',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 2,
      required: false,
      sortOrder: 8,
      referenceRanges: [{ referenceLow: 0.1, referenceHigh: 0.9 }],
      autoCalc: {
        formula: (v) =>
          v.tbil != null && v.dbil != null ? v.tbil - v.dbil : null,
        formulaDisplay: 'Total Bil \u2212 Direct Bil',
        prerequisites: ['tbil', 'dbil'],
      },
    },
  ],
}

// 6. Thyroid Function — TSH (3016-3)
const THYROID_TEMPLATE: ResultTemplate = {
  id: 'tpl-thyroid-v1.0.0',
  loincCode: '3016-3',
  loincDisplay: 'Thyroid Function \u2014 TSH',
  templateVersion: '1.0.0',
  category: 'Chemistry',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'tsh',
      loincCode: '3016-3',
      label: 'resultEntry.fields.tsh',
      type: 'numeric',
      unit: 'mIU/L',
      decimalPrecision: 3,
      required: true,
      sortOrder: 1,
      referenceRanges: [{ referenceLow: 0.4, referenceHigh: 4.0, criticalLow: 0.01, criticalHigh: 100 }],
    },
    {
      code: 'ft4',
      loincCode: '3024-7',
      label: 'resultEntry.fields.ft4',
      type: 'numeric',
      unit: 'ng/dL',
      decimalPrecision: 2,
      required: false,
      sortOrder: 2,
      referenceRanges: [{ referenceLow: 0.8, referenceHigh: 1.8 }],
    },
    {
      code: 'ft3',
      loincCode: '3051-0',
      label: 'resultEntry.fields.ft3',
      type: 'numeric',
      unit: 'pg/mL',
      decimalPrecision: 2,
      required: false,
      sortOrder: 3,
      referenceRanges: [{ referenceLow: 2.3, referenceHigh: 4.2 }],
    },
  ],
}

// 7. Urinalysis (24356-8)
const UA_TEMPLATE: ResultTemplate = {
  id: 'tpl-ua-v1.0.0',
  loincCode: '24356-8',
  loincDisplay: 'Urinalysis',
  templateVersion: '1.0.0',
  category: 'Urinalysis',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'ua_color',
      loincCode: '5778-6',
      label: 'resultEntry.fields.uaColor',
      type: 'select',
      required: true,
      sortOrder: 1,
      options: [
        { value: 'yellow', label: 'resultEntry.options.yellow' },
        { value: 'amber', label: 'resultEntry.options.amber' },
        { value: 'red', label: 'resultEntry.options.red' },
        { value: 'brown', label: 'resultEntry.options.brown' },
        { value: 'clear', label: 'resultEntry.options.clear' },
      ],
    },
    {
      code: 'ua_clarity',
      loincCode: '32167-9',
      label: 'resultEntry.fields.uaClarity',
      type: 'select',
      required: true,
      sortOrder: 2,
      options: [
        { value: 'clear', label: 'resultEntry.options.clear' },
        { value: 'slightly_cloudy', label: 'resultEntry.options.slightlyCloudy' },
        { value: 'cloudy', label: 'resultEntry.options.cloudy' },
        { value: 'turbid', label: 'resultEntry.options.turbid' },
      ],
    },
    {
      code: 'ua_sg',
      loincCode: '5811-5',
      label: 'resultEntry.fields.uaSg',
      type: 'numeric',
      decimalPrecision: 3,
      required: true,
      sortOrder: 3,
      referenceRanges: [{ referenceLow: 1.005, referenceHigh: 1.030 }],
    },
    {
      code: 'ua_ph',
      loincCode: '5803-2',
      label: 'resultEntry.fields.uaPh',
      type: 'numeric',
      decimalPrecision: 1,
      required: true,
      sortOrder: 4,
      referenceRanges: [{ referenceLow: 4.5, referenceHigh: 8.0 }],
    },
    {
      code: 'ua_protein',
      loincCode: '5804-0',
      label: 'resultEntry.fields.uaProtein',
      type: 'select',
      required: true,
      sortOrder: 5,
      options: [
        { value: 'negative', label: 'resultEntry.options.negative' },
        { value: 'trace', label: 'resultEntry.options.trace' },
        { value: '1plus', label: 'resultEntry.options.1plus' },
        { value: '2plus', label: 'resultEntry.options.2plus' },
        { value: '3plus', label: 'resultEntry.options.3plus' },
        { value: '4plus', label: 'resultEntry.options.4plus' },
      ],
    },
    {
      code: 'ua_glucose',
      loincCode: '5792-7',
      label: 'resultEntry.fields.uaGlucose',
      type: 'select',
      required: true,
      sortOrder: 6,
      options: [
        { value: 'negative', label: 'resultEntry.options.negative' },
        { value: 'trace', label: 'resultEntry.options.trace' },
        { value: '1plus', label: 'resultEntry.options.1plus' },
        { value: '2plus', label: 'resultEntry.options.2plus' },
        { value: '3plus', label: 'resultEntry.options.3plus' },
        { value: '4plus', label: 'resultEntry.options.4plus' },
      ],
    },
    {
      code: 'ua_ketones',
      loincCode: '5797-6',
      label: 'resultEntry.fields.uaKetones',
      type: 'select',
      required: true,
      sortOrder: 7,
      options: [
        { value: 'negative', label: 'resultEntry.options.negative' },
        { value: 'trace', label: 'resultEntry.options.trace' },
        { value: 'small', label: 'resultEntry.options.small' },
        { value: 'moderate', label: 'resultEntry.options.moderate' },
        { value: 'large', label: 'resultEntry.options.large' },
      ],
    },
    {
      code: 'ua_blood',
      loincCode: '5794-3',
      label: 'resultEntry.fields.uaBlood',
      type: 'select',
      required: true,
      sortOrder: 8,
      options: [
        { value: 'negative', label: 'resultEntry.options.negative' },
        { value: 'trace', label: 'resultEntry.options.trace' },
        { value: 'small', label: 'resultEntry.options.small' },
        { value: 'moderate', label: 'resultEntry.options.moderate' },
        { value: 'large', label: 'resultEntry.options.large' },
      ],
    },
    {
      code: 'ua_le',
      loincCode: '5799-2',
      label: 'resultEntry.fields.uaLe',
      type: 'select',
      required: true,
      sortOrder: 9,
      options: [
        { value: 'negative', label: 'resultEntry.options.negative' },
        { value: 'trace', label: 'resultEntry.options.trace' },
        { value: 'small', label: 'resultEntry.options.small' },
        { value: 'moderate', label: 'resultEntry.options.moderate' },
        { value: 'large', label: 'resultEntry.options.large' },
      ],
    },
    {
      code: 'ua_nitrite',
      loincCode: '5802-4',
      label: 'resultEntry.fields.uaNitrite',
      type: 'select',
      required: true,
      sortOrder: 10,
      options: [
        { value: 'negative', label: 'resultEntry.options.negative' },
        { value: 'positive', label: 'resultEntry.options.positive' },
      ],
    },
  ],
}

// 8. Blood Glucose — Fasting (1558-6)
const FBS_TEMPLATE: ResultTemplate = {
  id: 'tpl-fbs-v1.0.0',
  loincCode: '1558-6',
  loincDisplay: 'Blood Glucose \u2014 Fasting',
  templateVersion: '1.0.0',
  category: 'Chemistry',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'fbs',
      loincCode: '1558-6',
      label: 'resultEntry.fields.fbs',
      type: 'numeric',
      unit: 'mg/dL',
      decimalPrecision: 0,
      required: true,
      sortOrder: 1,
      referenceRanges: [{ referenceLow: 70, referenceHigh: 100, criticalLow: 40, criticalHigh: 500 }],
    },
  ],
}

// 9. Generic / Other (custom)
const OTHER_TEMPLATE: ResultTemplate = {
  id: 'tpl-other-v1.0.0',
  loincCode: 'custom',
  loincDisplay: 'Other / Generic Test',
  templateVersion: '1.0.0',
  category: 'Other',
  effectiveDate: '2026-01-01',
  fields: [
    {
      code: 'test_name',
      loincCode: 'custom',
      label: 'resultEntry.fields.testName',
      type: 'text',
      required: true,
      sortOrder: 1,
    },
    {
      code: 'result_value',
      loincCode: 'custom',
      label: 'resultEntry.fields.resultValue',
      type: 'text',
      required: true,
      sortOrder: 2,
    },
    {
      code: 'result_unit',
      loincCode: 'custom',
      label: 'resultEntry.fields.resultUnit',
      type: 'text',
      required: false,
      sortOrder: 3,
    },
    {
      code: 'result_ref',
      loincCode: 'custom',
      label: 'resultEntry.fields.resultRef',
      type: 'text',
      required: false,
      sortOrder: 4,
    },
    {
      code: 'result_interp',
      loincCode: 'custom',
      label: 'resultEntry.fields.resultInterp',
      type: 'select',
      required: false,
      sortOrder: 5,
      options: [
        { value: 'normal', label: 'resultEntry.options.normal' },
        { value: 'abnormal', label: 'resultEntry.options.abnormal' },
        { value: 'critical', label: 'resultEntry.options.critical' },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

/** All versioned templates — includes all versions for historical lookups. */
export const ALL_TEMPLATES: ResultTemplate[] = [
  CBC_TEMPLATE,
  LIPID_TEMPLATE,
  HBA1C_TEMPLATE,
  BMP_TEMPLATE,
  LFT_TEMPLATE,
  THYROID_TEMPLATE,
  UA_TEMPLATE,
  FBS_TEMPLATE,
  OTHER_TEMPLATE,
]

/**
 * Lookup map: LOINC code → current template.
 * Used at result entry time to resolve the template for an ordered test.
 */
export const TEMPLATE_REGISTRY: Readonly<Record<string, ResultTemplate>> = {
  '58410-2': CBC_TEMPLATE,
  '57698-3': LIPID_TEMPLATE,
  '4548-4': HBA1C_TEMPLATE,
  '51990-0': BMP_TEMPLATE,
  '24325-3': LFT_TEMPLATE,
  '3016-3': THYROID_TEMPLATE,
  '24356-8': UA_TEMPLATE,
  '1558-6': FBS_TEMPLATE,
  custom: OTHER_TEMPLATE,
}

/**
 * Resolve a template by LOINC code.
 * Falls back to the generic template if no match is found.
 */
export function resolveTemplate(loincCode: string): ResultTemplate {
  return TEMPLATE_REGISTRY[loincCode] ?? OTHER_TEMPLATE
}

// ---------------------------------------------------------------------------
// Localized range integration — Story 43.8 (Task 9)
// ---------------------------------------------------------------------------

import type { ReferenceRange as LocalizedRange } from './reference-ranges/types'
import { resolveRange } from './reference-ranges/range-resolver'
import { ALL_DEFAULT_RANGES } from './reference-ranges/default-ranges'

/**
 * Context required to resolve a localized reference range.
 */
export interface RangeResolutionContext {
  patientAge: number
  patientGender: string
  labAltitude: number
  /** Lab-custom ranges from Dexie (pass empty array if offline and not yet loaded). */
  customRanges: LocalizedRange[]
}

/**
 * Resolve the best reference range for a specific analyte field in a result template,
 * using localized ranges when available with fallback to template inline defaults.
 *
 * Priority: localized resolver (custom + default) → template inline range
 *
 * @param loincCode   - Individual analyte LOINC code (e.g. '718-7' for hemoglobin)
 * @param ctx         - Patient demographics and lab altitude context
 * @returns The localized ReferenceRange if found, or null (caller should use template inline ranges)
 */
export function resolveLocalizedRange(
  loincCode: string,
  ctx: RangeResolutionContext,
): LocalizedRange | null {
  const allRanges = [...ctx.customRanges, ...ALL_DEFAULT_RANGES]
  return resolveRange(loincCode, ctx.patientAge, ctx.patientGender, ctx.labAltitude, allRanges)
}

/**
 * Convert a template inline `ReferenceRange` to the normalized flag thresholds used
 * by the result flagger. This is the fallback when no localized range is found.
 *
 * Returns null if there are no inline reference ranges for the given patient demographics.
 */
export function getTemplateRangeFallback(
  field: TemplateField,
  patientAge: number,
  patientGender: string,
): Pick<LocalizedRange, 'rangeMin' | 'rangeMax' | 'criticalMin' | 'criticalMax'> | null {
  if (!field.referenceRanges || field.referenceRanges.length === 0) return null

  const normalizedGender = patientGender.toLowerCase()

  // Try gender-specific first, then gender-neutral (undefined or 'all')
  const match =
    field.referenceRanges.find((r) => {
      const genderMatch =
        r.gender === undefined ||
        r.gender === 'all' ||
        r.gender === normalizedGender
      const ageMin = r.ageMin ?? 0
      const ageMax = r.ageMax ?? 999
      const ageMatch = patientAge >= ageMin && patientAge <= ageMax
      return genderMatch && ageMatch
    }) ?? field.referenceRanges[0]

  if (!match) return null

  return {
    rangeMin: match.referenceLow,
    rangeMax: match.referenceHigh,
    criticalMin: match.criticalLow,
    criticalMax: match.criticalHigh,
  }
}
