// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report Generation Engine
// Queries logbook entries tagged with a program and structures them per template.
//
// Works entirely from local Dexie data — offline capable.
// PHI safety: generated reports contain AGGREGATE statistics only.
//   - Demographics cells with count < 5 are suppressed (de-identification).
//   - No patient names, IDs, or individual result values in output.
//   - Reimbursement data is financial — no PHI concerns.
// ---------------------------------------------------------------------------

import { getAllLogbookEntries, getDonorProgramByCode, getCustomDonorTemplates } from './db'
import type { LabLogbookEntry } from './db'
import type {
  DonorReport,
  DonorReportTemplate,
  GeneratedSection,
  ReimbursementSummary,
  ReimbursementLineItem,
} from './donor-types'
import { resolveTemplate } from './donor-templates'

/** Minimum cell count for demographic breakdowns (standard de-identification). */
const DEMOGRAPHIC_SUPPRESSION_THRESHOLD = 5

/** Return true if `date` falls within [periodStart, periodEnd] inclusive. */
function inPeriod(date: string, periodStart: string, periodEnd: string): boolean {
  return date >= periodStart && date <= periodEnd
}

/**
 * Generate a donor report for a given program and date range.
 * Queries logbook entries from Dexie, applies the program's template,
 * and returns a `DonorReport` with status: 'draft'.
 *
 * @param programCode - The program code (e.g. 'WHO_TB')
 * @param periodStart - ISO 8601 date string (e.g. '2026-01-01')
 * @param periodEnd   - ISO 8601 date string (e.g. '2026-03-31')
 * @param generatedBy - Practitioner ID of the report generator
 */
export async function generateDonorReport(
  programCode: string,
  periodStart: string,
  periodEnd: string,
  generatedBy: string,
): Promise<DonorReport> {
  const program = await getDonorProgramByCode(programCode)
  if (!program) throw new Error(`Donor program not found: ${programCode}`)

  // Resolve template (built-in first, then custom from Dexie)
  const customTemplates = await getCustomDonorTemplates()
  const template = resolveTemplate(program.templateCode, customTemplates)
  if (!template) throw new Error(`Template not found: ${program.templateCode}`)

  // Fetch all logbook entries tagged with this program in the period
  const allEntries = await getAllLogbookEntries()
  const tagged = allEntries.filter(
    (e) =>
      e.programTags?.includes(programCode) &&
      e.entryType === 'original' &&
      inPeriod(e.date, periodStart, periodEnd),
  )

  const warnings: string[] = []
  if (tagged.length === 0) warnings.push('no_data')

  // Build sections according to template
  const sections = template.sections.map((section) =>
    buildSection(section, tagged, program.reimbursementRates, template),
  )

  // Partial data warning if some sections have entries but others are empty
  const hasSomeData = tagged.length > 0
  const hasAllData = sections.every((s) => s.rows.length > 0)
  if (hasSomeData && !hasAllData) warnings.push('partial_data')

  // Build reimbursement summary (if template includes it)
  const reimbursement = template.includeReimbursement
    ? buildReimbursement(tagged, program.reimbursementRates)
    : undefined

  const report: DonorReport = {
    id: crypto.randomUUID(),
    programCode,
    programName: program.programName,
    periodStart,
    periodEnd,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    generatedBy,
    sections,
    reimbursement,
    corrections: [],
    warnings,
    syncStatus: 'pending',
  }

  return report
}

// ---------------------------------------------------------------------------
// Section builder
// ---------------------------------------------------------------------------

function buildSection(
  section: DonorReportTemplate['sections'][number],
  entries: LabLogbookEntry[],
  reimbursementRates: import('./donor-types').ReimbursementRate[],
  template: DonorReportTemplate,
): GeneratedSection {
  // Filter entries for this section's LOINC codes
  const sectionEntries = section.filterLoincCodes
    ? entries.filter((e) => section.filterLoincCodes!.includes(e.testLoincCode))
    : entries

  let rows: Record<string, number | string>[] = []

  switch (section.sectionType) {
    case 'test_summary':
      rows = buildTestSummaryRows(sectionEntries)
      break
    case 'demographics':
      rows = buildDemographicsRows(sectionEntries)
      break
    case 'positivity':
      rows = buildPositivityTrendRows(sectionEntries)
      break
    case 'reimbursement':
      rows = buildReimbursementRows(sectionEntries, reimbursementRates)
      break
    case 'custom':
      rows = []
      break
  }

  return {
    sectionId: section.sectionId,
    sectionTitle: section.sectionTitle,
    rows,
  }
}

/** Aggregate test_summary rows by LOINC code. */
function buildTestSummaryRows(entries: LabLogbookEntry[]): Record<string, number | string>[] {
  const byLoinc = new Map<string, { label: string; total: number; positive: number; negative: number; rifampicinResistant?: number }>()

  for (const e of entries) {
    if (!byLoinc.has(e.testLoincCode)) {
      byLoinc.set(e.testLoincCode, { label: e.testType, total: 0, positive: 0, negative: 0 })
    }
    const row = byLoinc.get(e.testLoincCode)!
    row.total++
    // Determine positive/negative from resultSummary (simple keyword match)
    const summary = e.resultSummary.toLowerCase()
    if (summary.includes('positive') || summary.includes('detected') || summary.includes('+')) {
      row.positive++
    } else {
      row.negative++
    }
    // Rifampicin resistance (GeneXpert-specific)
    if (summary.includes('rifampicin') && summary.includes('resistant')) {
      row.rifampicinResistant = (row.rifampicinResistant ?? 0) + 1
    }
  }

  return Array.from(byLoinc.entries()).map(([loincCode, data]) => {
    const positivityRate = data.total > 0
      ? Math.round((data.positive / data.total) * 100 * 10) / 10
      : 0
    const row: Record<string, number | string> = {
      loincCode,
      testLabel: data.label,
      totalPerformed: data.total,
      totalPositive: data.positive,
      totalNegative: data.negative,
      positivityRate,
    }
    if (data.rifampicinResistant != null) {
      row.rifampicinResistant = data.rifampicinResistant
    }
    return row
  })
}

/** Aggregate demographics rows by age group — suppress cells with count < 5. */
function buildDemographicsRows(entries: LabLogbookEntry[]): Record<string, number | string>[] {
  // Only count positive cases for demographics (standard TB/Hepatitis reporting)
  const positives = entries.filter((e) => {
    const s = e.resultSummary.toLowerCase()
    return s.includes('positive') || s.includes('detected') || s.includes('+')
  })

  const AGE_GROUPS = [
    { label: '0–4', min: 0, max: 4 },
    { label: '5–14', min: 5, max: 14 },
    { label: '15–24', min: 15, max: 24 },
    { label: '25–34', min: 25, max: 34 },
    { label: '35–44', min: 35, max: 44 },
    { label: '45–54', min: 45, max: 54 },
    { label: '55–64', min: 55, max: 64 },
    { label: '65+', min: 65, max: 999 },
  ]

  // Count by age group (no gender breakdown — patientAge only, no gender in LabLogbookEntry)
  const counts = AGE_GROUPS.map((g) => {
    const count = positives.filter((e) => e.patientAge >= g.min && e.patientAge <= g.max).length
    return { ageGroup: g.label, total: count }
  })

  // Suppress cells with count < threshold (de-identification)
  return counts
    .filter((r) => r.total >= DEMOGRAPHIC_SUPPRESSION_THRESHOLD)
    .map((r) => ({
      ageGroup: r.ageGroup,
      male: '—',         // gender not captured in current LabLogbookEntry
      female: '—',
      total: r.total,
    }))
}

/** Build positivity trend rows (current period only — rolling average requires prior reports). */
function buildPositivityTrendRows(entries: LabLogbookEntry[]): Record<string, number | string>[] {
  const total = entries.length
  const positive = entries.filter((e) => {
    const s = e.resultSummary.toLowerCase()
    return s.includes('positive') || s.includes('detected') || s.includes('+')
  }).length
  const rate = total > 0 ? Math.round((positive / total) * 100 * 10) / 10 : 0

  return [
    {
      period: 'Current Period',
      totalTested: total,
      totalPositive: positive,
      positivityRate: rate,
    },
  ]
}

/** Build reimbursement rows from per-test rates. */
function buildReimbursementRows(
  entries: LabLogbookEntry[],
  rates: import('./donor-types').ReimbursementRate[],
): Record<string, number | string>[] {
  return rates.map((rate) => {
    const count = entries.filter((e) => e.testLoincCode === rate.loincCode).length
    const subtotal = count * rate.ratePerTest
    return {
      testLabel: rate.testLabel,
      loincCode: rate.loincCode,
      count,
      ratePerTest: rate.ratePerTest,
      subtotal,
    }
  })
}

/** Build the full reimbursement summary for the report. */
function buildReimbursement(
  entries: LabLogbookEntry[],
  rates: import('./donor-types').ReimbursementRate[],
): ReimbursementSummary {
  const lineItems: ReimbursementLineItem[] = rates.map((rate) => {
    const count = entries.filter((e) => e.testLoincCode === rate.loincCode).length
    return {
      testLabel: rate.testLabel,
      loincCode: rate.loincCode,
      count,
      ratePerTest: rate.ratePerTest,
      subtotal: count * rate.ratePerTest,
    }
  })
  const grandTotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0)
  const currency = rates[0]?.currency ?? 'AFN'

  return { lineItems, grandTotal, currency }
}
