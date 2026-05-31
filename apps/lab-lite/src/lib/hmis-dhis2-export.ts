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
const DEFAULT_DATA_ELEMENT_MAP: Record<string, string> = {
  'testCategory.CBC.total':           'DE_CBC_TOTAL',
  'testCategory.CBC.positive':        'DE_CBC_POS',
  'testCategory.CBC.rate':            'DE_CBC_RATE',
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
    const prefix = `testCategory.${cat.categoryLabel}`
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
  const rows = ['dataElement,period,orgUnit,value']
  for (const dv of payload.dataValues) {
    rows.push(`${dv.dataElement},${period},${orgUnit},${dv.value}`)
  }
  return rows.join('\n')
}
