// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report PDF Export
// Generates a donor-specific PDF from a DonorReport + template layout.
// Uses jsPDF + jspdf-autotable — runs entirely client-side, works offline.
//
// Template-driven rendering: each DonorReportTemplate defines its sections,
// columns, and header/footer fields.
//
// PHI safety: donor reports contain ONLY aggregate statistics — no patient
// names, IDs, diagnoses, or individual-level data. No PHI in PDF output.
// ---------------------------------------------------------------------------

import type { DonorReport } from './donor-types'
import { resolveTemplate } from './donor-templates'
import { getCustomDonorTemplates } from './db'

const RTL_LOCALES = ['ar', 'prs', 'ps']

/**
 * Generate a PDF Blob for a donor report.
 * Template-driven: pulls the template for layout, sections, and columns.
 * Returns a Blob that can be downloaded or shared via Web Share API.
 */
export async function exportDonorPdf(report: DonorReport, locale: string): Promise<Blob> {
  const customTemplates = await getCustomDonorTemplates()
  const template = resolveTemplate(
    // Derive templateCode from programCode convention or fall back to first report section
    `${report.programCode}_QUARTERLY`,
    customTemplates,
  ) ?? resolveTemplate(`${report.programCode}_MONTHLY`, customTemplates)

  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const isRtl = RTL_LOCALES.includes(locale)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', putOnlyUsedFonts: true })
  const pageWidth = doc.internal.pageSize.width
  const startX = isRtl ? pageWidth - 14 : 14
  const align = isRtl ? 'right' : 'left'

  // PDF metadata
  const title = `${report.programName} — ${report.periodStart} to ${report.periodEnd}`
  doc.setProperties({
    title,
    subject: 'Donor Program Report',
    creator: 'Lab Lite — Ultranos',
  })

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(report.programName, startX, 18, { align })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Reporting Period: ${report.periodStart} — ${report.periodEnd}`, startX, 25, { align })
  doc.text(
    `Status: ${report.status === 'finalized' ? 'Finalized' : 'Draft'}`,
    isRtl ? 14 : pageWidth - 14,
    25,
    { align: isRtl ? 'left' : 'right' },
  )
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleDateString()}`, startX, 31, { align })

  let cursorY = 38

  // Donor logo placeholder area (header)
  doc.setDrawColor(200, 200, 200)
  doc.rect(isRtl ? 14 : pageWidth - 44, 13, 30, 15)
  doc.setFontSize(6)
  doc.setTextColor(180, 180, 180)
  doc.text('DONOR LOGO', isRtl ? 29 : pageWidth - 29, 22, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------
  for (const section of report.sections) {
    if (cursorY > 250) {
      doc.addPage()
      cursorY = 20
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(section.sectionTitle, startX, cursorY, { align })
    cursorY += 2

    if (section.rows.length === 0) {
      autoTable(doc, {
        startY: cursorY,
        body: [['No data for this period']],
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 14, right: 14 },
        theme: 'striped',
      })
    } else {
      // Derive columns from first row (exclude loincCode internal key)
      const visibleKeys = Object.keys(section.rows[0] ?? {}).filter((k) => k !== 'loincCode')
      const head = [visibleKeys.map((k) => formatColumnHeader(k))]
      const body = section.rows.map((row) =>
        visibleKeys.map((k) => formatCellValue(row[k])),
      )

      autoTable(doc, {
        startY: cursorY,
        head,
        body,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
        theme: 'striped',
      })
    }

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  // ---------------------------------------------------------------------------
  // Reimbursement summary
  // ---------------------------------------------------------------------------
  if (report.reimbursement) {
    if (cursorY > 240) {
      doc.addPage()
      cursorY = 20
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Reimbursement Summary', startX, cursorY, { align })
    cursorY += 2

    const reimbBody = report.reimbursement.lineItems.map((item) => [
      item.testLabel,
      String(item.count),
      `${report.reimbursement!.currency} ${item.ratePerTest.toLocaleString()}`,
      `${report.reimbursement!.currency} ${item.subtotal.toLocaleString()}`,
    ])
    reimbBody.push([
      'GRAND TOTAL', '', '',
      `${report.reimbursement.currency} ${report.reimbursement.grandTotal.toLocaleString()}`,
    ])

    autoTable(doc, {
      startY: cursorY,
      head: [['Test', 'Count', 'Rate', 'Subtotal']],
      body: reimbBody,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      theme: 'striped',
      didParseCell: (data) => {
        // Bold the grand total row
        if (data.row.index === reimbBody.length - 1) {
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  // ---------------------------------------------------------------------------
  // Corrections note
  // ---------------------------------------------------------------------------
  if (report.corrections.length > 0) {
    if (cursorY > 270) {
      doc.addPage()
      cursorY = 20
    }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100, 100, 100)
    doc.text(
      `Note: ${report.corrections.length} field(s) were manually corrected during review.`,
      startX,
      cursorY,
      { align },
    )
    doc.setTextColor(0, 0, 0)
    cursorY += 6
  }

  // ---------------------------------------------------------------------------
  // Footer: certification block
  // ---------------------------------------------------------------------------
  if (cursorY > 260) {
    doc.addPage()
    cursorY = 20
  }
  cursorY += 4
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Certification', startX, cursorY, { align })
  cursorY += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const colLeft = 14
  const colRight = pageWidth / 2 + 10

  doc.text('Prepared by:', colLeft, cursorY)
  doc.text('Reviewed by:', colRight, cursorY)
  doc.line(colLeft, cursorY + 8, colLeft + 60, cursorY + 8)
  doc.line(colRight, cursorY + 8, colRight + 60, cursorY + 8)
  cursorY += 14

  doc.text('Date:', colLeft, cursorY)
  doc.text('Date:', colRight, cursorY)
  doc.line(colLeft + 10, cursorY, colLeft + 60, cursorY)
  doc.line(colRight + 10, cursorY, colRight + 60, cursorY)

  return doc.output('blob')
}

function formatColumnHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

function formatCellValue(v: string | number | undefined): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return v.toLocaleString()
  return String(v)
}
