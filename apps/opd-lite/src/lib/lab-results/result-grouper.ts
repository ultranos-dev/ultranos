/**
 * Result Grouper — LOINC-based grouping and trend data extraction (Story 52.4 — Task 2)
 *
 * Groups DiagnosticReports by LOINC code (test type) and extracts
 * trend data for numeric results.
 */

import type { LocalDiagnosticReport } from '@/lib/db'

// ─── LOINC Category Mapping ──────────────────────────────────────────────────
// Duplicated from apps/lab-lite/src/lib/loinc-categories.ts — kept in sync
// intentionally to avoid cross-app imports in the monorepo.
// TODO: move to packages/shared-types when the category list stabilizes.

const LOINC_CATEGORY_MAP: Record<string, string> = {
  '58410-2': 'Blood Work — CBC',
  '57698-3': 'Lipid Panel',
  '4548-4': 'HbA1c',
  '51990-0': 'Basic Metabolic Panel',
  '24325-3': 'Liver Function Tests',
  '3016-3': 'Thyroid Function — TSH',
  '24356-8': 'Urinalysis',
  '1558-6': 'Blood Glucose — Fasting',
  // Common extensions
  '2345-7': 'Glucose',
  '718-7': 'Hemoglobin',
  '4544-3': 'Hematocrit',
  '787-2': 'MCV',
  '785-6': 'MCH',
  '786-4': 'MCHC',
  '777-3': 'Platelet Count',
  '6690-2': 'WBC',
  '789-8': 'RBC',
  '2160-0': 'Creatinine',
  '3094-0': 'BUN',
  '2823-3': 'Potassium',
  '2951-2': 'Sodium',
  '2075-0': 'Chloride',
  '1975-2': 'Total Bilirubin',
  '1920-8': 'AST',
  '1742-6': 'ALT',
  '6768-6': 'Alkaline Phosphatase',
  '2885-2': 'Total Protein',
  '1751-7': 'Albumin',
  '9830-1': 'Total Cholesterol/HDL ratio',
  '2093-3': 'Total Cholesterol',
  '2085-9': 'HDL Cholesterol',
  '13457-7': 'LDL Cholesterol',
  '2571-8': 'Triglycerides',
  '11579-0': 'TSH',
  '3051-0': 'T3',
  '3053-6': 'T4',
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrendDataPoint {
  date: string
  value: number
  unit: string
  flagLevel: 'normal' | 'abnormal' | 'critical'
  labName: string
}

export interface GroupedResults {
  category: string
  loincCode: string
  results: LocalDiagnosticReport[]
  latestResult: LocalDiagnosticReport
  hasAbnormal: boolean
  hasCritical: boolean
  /** null when no numeric values could be extracted */
  trendData: TrendDataPoint[] | null
}

// ─── Numeric value extraction ─────────────────────────────────────────────────

/**
 * Attempt to extract a numeric value and unit from a DiagnosticReport conclusion.
 *
 * Handles patterns like:
 *   "Glucose: 5.6 mmol/L"
 *   "HbA1c 7.2%"
 *   "Hemoglobin = 12.5 g/dL"
 *   "Result: 120 mg/dL (High)"
 *
 * Returns null if no numeric value found (e.g. urinalysis text results).
 */
export function extractNumericFromConclusion(
  conclusion: string,
): { value: number; unit: string } | null {
  // Pattern: optional label, number (with optional decimal), optional unit
  // Unit may appear immediately after the number (e.g. "7.2%") or with a space ("5.6 mmol/L")
  const pattern = /([\d]+(?:\.\d+)?)\s*(%|mmol\/L|g\/dL|g\/L|mg\/dL|U\/L|IU\/L|mEq\/L|µmol\/L|umol\/L|ng\/mL|pg\/mL|mIU\/L|µIU\/mL|x10\^3\/µL|x10\^9\/L|fL|pg|cells\/µL)(?:\b|$|\s|[,;.()\]])/i
  const match = conclusion.match(pattern)
  if (!match) return null
  const value = parseFloat(match[1]!)
  if (Number.isNaN(value)) return null
  return { value, unit: match[2]! }
}

// ─── Grouper ─────────────────────────────────────────────────────────────────

/**
 * Display label for a LOINC code.
 * Falls back to the report's code.text or code.coding[0].display.
 */
function categoryLabel(report: LocalDiagnosticReport): string {
  const code = report.code.coding?.[0]?.code
  if (code && LOINC_CATEGORY_MAP[code]) return LOINC_CATEGORY_MAP[code]!
  return (
    report.code.coding?.[0]?.display ??
    report.code.text ??
    code ??
    'Unknown Test'
  )
}

/**
 * Extract trend data points for a list of reports sharing the same LOINC code.
 * Returns null if no numeric data is available across the set.
 *
 * AC: 3 (Story 52.4)
 */
function buildTrendData(reports: LocalDiagnosticReport[]): TrendDataPoint[] | null {
  const points: TrendDataPoint[] = []

  for (const report of reports) {
    const date = report.effectiveDateTime ?? report.issued
    if (!date) continue

    // Best-effort numeric extraction from conclusion text
    const numeric = report.conclusion ? extractNumericFromConclusion(report.conclusion) : null
    if (!numeric) continue

    points.push({
      date,
      value: numeric.value,
      unit: numeric.unit,
      flagLevel: report._ultranos?.flagLevel ?? 'normal',
      labName: report.performer?.[0]?.display ?? report._ultranos?.labId ?? 'Unknown Lab',
    })
  }

  return points.length >= 2 ? points : null
}

/**
 * Group a flat list of DiagnosticReports by LOINC code (test type).
 *
 * Input: already sorted descending by effectiveDateTime.
 * Output: array of GroupedResults, sorted so critical/abnormal groups come first,
 * then alphabetically by category name.
 *
 * AC: 2, 3, 4 (Story 52.4)
 */
export function groupReportsByLoinc(
  reports: LocalDiagnosticReport[],
): GroupedResults[] {
  const groupMap = new Map<string, LocalDiagnosticReport[]>()

  for (const report of reports) {
    const loincCode = report.code.coding?.[0]?.code ?? 'UNKNOWN'
    const existing = groupMap.get(loincCode)
    if (existing) {
      existing.push(report)
    } else {
      groupMap.set(loincCode, [report])
    }
  }

  const groups: GroupedResults[] = []

  for (const [loincCode, groupReports] of groupMap) {
    // groupReports are already sorted desc, so [0] is the latest
    const latestResult = groupReports[0]!

    const hasCritical = groupReports.some(
      (r) => r._ultranos?.flagLevel === 'critical',
    )
    const hasAbnormal =
      hasCritical ||
      groupReports.some((r) => r._ultranos?.flagLevel === 'abnormal')

    groups.push({
      category: categoryLabel(latestResult),
      loincCode,
      results: groupReports,
      latestResult,
      hasAbnormal,
      hasCritical,
      trendData: buildTrendData(groupReports),
    })
  }

  // Sort: critical first, then abnormal, then alphabetically by category
  groups.sort((a, b) => {
    if (a.hasCritical && !b.hasCritical) return -1
    if (!a.hasCritical && b.hasCritical) return 1
    if (a.hasAbnormal && !b.hasAbnormal) return -1
    if (!a.hasAbnormal && b.hasAbnormal) return 1
    return a.category.localeCompare(b.category)
  })

  return groups
}
