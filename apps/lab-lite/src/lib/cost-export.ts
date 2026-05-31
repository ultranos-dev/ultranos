/**
 * Cost Analysis Export Utilities — Story 44.2
 *
 * Exports cost analysis data as CSV or triggers browser print-to-PDF.
 * CSV includes UTF-8 BOM for Excel compatibility with Arabic/Dari text.
 */

import type { CostAnalysis } from '@/lib/cost-calculator'

const AFN = (n: number): string =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const PCT = (n: number | null): string =>
  n === null ? 'N/A' : `${n.toFixed(1)}%`

/**
 * Generate CSV content for cost analysis data.
 * Prepends UTF-8 BOM (\uFEFF) for Excel compatibility with multilingual text.
 */
export function buildCostAnalysisCSV(analyses: CostAnalysis[]): string {
  const headers = [
    'Test Name',
    'LOINC Code',
    'Reagent Cost (AFN)',
    'Consumable Cost (AFN)',
    'Labor Cost (AFN)',
    'Overhead Cost (AFN)',
    'Total Cost (AFN)',
    'Price Charged (AFN)',
    'Margin (AFN)',
    'Margin (%)',
    'Status',
  ]

  const escape = (val: string) =>
    val.includes(',') || val.includes('"') || val.includes('\n')
      ? `"${val.replace(/"/g, '""')}"`
      : val

  const rows = analyses.map((a) => [
    escape(a.testName),
    escape(a.testCode),
    AFN(a.reagentCostPerTest),
    AFN(a.consumableCost),
    AFN(a.laborAllocation),
    AFN(a.overheadAllocation),
    AFN(a.totalCost),
    AFN(a.currentPrice),
    AFN(a.margin),
    PCT(a.marginPercent),
    a.isProfitable ? 'Profitable' : 'Subsidized',
  ])

  const lines = [headers.join(','), ...rows.map((r) => r.join(','))]
  return '\uFEFF' + lines.join('\r\n')
}

/**
 * Trigger a CSV download in the browser.
 * Filename format: lab-cost-analysis-YYYY-MM-DD.csv
 */
export function exportCostAnalysisCSV(analyses: CostAnalysis[]): void {
  const csv = buildCostAnalysisCSV(analyses)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `lab-cost-analysis-${dateStr}.csv`

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * Open a print-optimized view for PDF export via browser print dialog.
 * Opens the /finance/cost-analysis/print route which renders a print-ready layout.
 */
export function exportCostAnalysisPDF(): void {
  window.print()
}
