// ---------------------------------------------------------------------------
// Story 50.1 — DHIS2 Structured Data Export
// Maps HMIS report fields to DHIS2 data value set format for upload.
// Aggregate statistics only — no PHI, no patient-level data.
// ---------------------------------------------------------------------------

import type { HmisMonthlyReport } from './hmis-types'

export interface Dhis2DataValue {
  dataElement: string
  value: string
}

export interface Dhis2DataValueSet {
  dataSet: string
  period: string      // YYYYMM format
  orgUnit: string     // Configured org unit ID
  dataValues: Dhis2DataValue[]
}

/**
 * Default data element ID mapping for HMIS lab fields.
 * Installation-specific IDs should override this via lab settings.
 * Keys match field paths in the HmisMonthlyReport data model.
 */
/**
 * Escape a CSV field value per RFC 4180.
 * Wraps in double quotes if the value contains comma, double-quote, or newline.
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

const DEFAULT_DATA_ELEMENT_MAP: Record<string, string> = {
  'testCategory.58410-2.total':       'DE_CBC_TOTAL',
  'testCategory.58410-2.positive':    'DE_CBC_POS',
  'testCategory.58410-2.rate':        'DE_CBC_RATE',
  'disease.malaria.total':            'DE_MALARIA_TOTAL',
  'disease.malaria.positive':         'DE_MALARIA_POS',
  'disease.malaria.rate':             'DE_MALARIA_RATE',
  'disease.tb.total':                 'DE_TB_TOTAL',
  'disease.tb.positive':              'DE_TB_POS',
  'disease.tb.rate':                  'DE_TB_RATE',
  'disease.hep_b.total':              'DE_HEP_B_TOTAL',
  'disease.hep_b.positive':           'DE_HEP_B_POS',
  'disease.hep_b.rate':               'DE_HEP_B_RATE',
  'disease.hep_c.total':              'DE_HEP_C_TOTAL',
  'disease.hep_c.positive':           'DE_HEP_C_POS',
  'disease.hep_c.rate':               'DE_HEP_C_RATE',
  'quality.totalSamples':             'DE_SAMPLES_TOTAL',
  'quality.rejectedSamples':          'DE_SAMPLES_REJECTED',
  'quality.rejectionRate':            'DE_REJECTION_RATE',
  'quality.qcPassRate':               'DE_QC_PASS_RATE',
  'quality.avgTatHours':              'DE_AVG_TAT_HOURS',
  'demographic.0-4.male':             'DE_DEMO_0_4_M',
  'demographic.0-4.female':           'DE_DEMO_0_4_F',
  'demographic.0-4.total':            'DE_DEMO_0_4_T',
  'demographic.5-14.male':            'DE_DEMO_5_14_M',
  'demographic.5-14.female':          'DE_DEMO_5_14_F',
  'demographic.5-14.total':           'DE_DEMO_5_14_T',
  'demographic.15-24.male':           'DE_DEMO_15_24_M',
  'demographic.15-24.female':         'DE_DEMO_15_24_F',
  'demographic.15-24.total':          'DE_DEMO_15_24_T',
  'demographic.25-44.male':           'DE_DEMO_25_44_M',
  'demographic.25-44.female':         'DE_DEMO_25_44_F',
  'demographic.25-44.total':          'DE_DEMO_25_44_T',
  'demographic.45-64.male':           'DE_DEMO_45_64_M',
  'demographic.45-64.female':         'DE_DEMO_45_64_F',
  'demographic.45-64.total':          'DE_DEMO_45_64_T',
  'demographic.65+.male':             'DE_DEMO_65_M',
  'demographic.65+.female':           'DE_DEMO_65_F',
  'demographic.65+.total':            'DE_DEMO_65_T',
}

/**
 * Build a DHIS2 period string in YYYYMM format.
 */
function buildPeriod(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`
}

/**
 * Export an HMIS report as a DHIS2 data value set (JSON payload).
 * Returns the payload object ready for DHIS2 API upload or file download.
 *
 * @param report      The finalized (or draft) HMIS monthly report
 * @param orgUnit     The DHIS2 org unit ID for this facility
 * @param elementMap  Optional override for data element IDs
 */
export function exportToDhis2Json(
  report: HmisMonthlyReport,
  orgUnit: string,
  elementMap: Record<string, string> = DEFAULT_DATA_ELEMENT_MAP,
): Dhis2DataValueSet {
  const dataValues: Dhis2DataValue[] = []

  // Test category summary
  for (const cat of report.testCategorySummary) {
    const prefix = `testCategory.${cat.loincCode}`
    if (elementMap[`${prefix}.total`]) {
      dataValues.push({ dataElement: elementMap[`${prefix}.total`], value: String(cat.totalPerformed) })
    }
    if (elementMap[`${prefix}.positive`]) {
      dataValues.push({ dataElement: elementMap[`${prefix}.positive`], value: String(cat.totalPositive) })
    }
    if (elementMap[`${prefix}.rate`]) {
      dataValues.push({ dataElement: elementMap[`${prefix}.rate`], value: String(cat.positivityRate) })
    }
  }

  // Reportable disease positivity rates
  for (const disease of report.positivityRates) {
    const totalKey = `disease.${disease.diseaseCode}.total`
    const posKey = `disease.${disease.diseaseCode}.positive`
    const rateKey = `disease.${disease.diseaseCode}.rate`
    if (elementMap[totalKey]) dataValues.push({ dataElement: elementMap[totalKey], value: String(disease.totalTested) })
    if (elementMap[posKey]) dataValues.push({ dataElement: elementMap[posKey], value: String(disease.totalPositive) })
    if (elementMap[rateKey]) dataValues.push({ dataElement: elementMap[rateKey], value: String(disease.positivityRate) })
  }

  // Quality indicators
  const qi = report.qualityIndicators
  const qiMap: [string, number][] = [
    ['quality.totalSamples', qi.totalSamplesReceived],
    ['quality.rejectedSamples', qi.rejectedSamples],
    ['quality.rejectionRate', qi.rejectionRate],
    ['quality.qcPassRate', qi.qcPassRate],
    ['quality.avgTatHours', qi.averageTatHours],
  ]
  for (const [key, val] of qiMap) {
    if (elementMap[key]) {
      dataValues.push({ dataElement: elementMap[key], value: String(val) })
    }
  }

  // Demographics
  for (const demo of report.demographics) {
    const demoPrefix = `demographic.${demo.ageGroup}`
    if (elementMap[`${demoPrefix}.male`]) dataValues.push({ dataElement: elementMap[`${demoPrefix}.male`], value: String(demo.male) })
    if (elementMap[`${demoPrefix}.female`]) dataValues.push({ dataElement: elementMap[`${demoPrefix}.female`], value: String(demo.female) })
    if (elementMap[`${demoPrefix}.total`]) dataValues.push({ dataElement: elementMap[`${demoPrefix}.total`], value: String(demo.total) })
  }

  // Ensure at least disease-level entries are present even if no test categories matched
  // (DHIS2 requires non-empty dataValues)
  if (dataValues.length === 0) {
    for (const disease of report.positivityRates) {
      dataValues.push({
        dataElement: `DE_${disease.diseaseCode.toUpperCase()}_TOTAL`,
        value: String(disease.totalTested),
      })
    }
    // Fallback: add total samples
    dataValues.push({
      dataElement: 'DE_SAMPLES_TOTAL',
      value: String(report.qualityIndicators.totalSamplesReceived),
    })
  }

  return {
    dataSet: 'HMIS_LAB_MONTHLY',
    period: buildPeriod(report.reportYear, report.reportMonth),
    orgUnit,
    dataValues,
  }
}

/**
 * Export an HMIS report as a DHIS2 CSV string.
 * CSV columns: dataElement, period, orgUnit, value
 * Compatible with DHIS2 bulk import format.
 */
export function exportToDhis2Csv(
  report: HmisMonthlyReport,
  orgUnit: string,
  elementMap: Record<string, string> = DEFAULT_DATA_ELEMENT_MAP,
): string {
  const payload = exportToDhis2Json(report, orgUnit, elementMap)
  const period = payload.period
  const rows = [['dataElement', 'period', 'orgUnit', 'value'].map(escapeCsvField).join(',')]
  for (const dv of payload.dataValues) {
    rows.push([dv.dataElement, period, orgUnit, dv.value].map(escapeCsvField).join(','))
  }
  return rows.join('\n')
}
