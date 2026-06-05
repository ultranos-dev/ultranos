// ---------------------------------------------------------------------------
// Story 50.1 — HMIS Monthly Report PDF Export
// Generates a PDF matching the Afghan MoPH HMIS template layout.
// Uses jsPDF + jspdf-autotable — runs entirely client-side, works offline.
//
// PHI safety: HMIS report contains only aggregate statistics — NO PHI.
// No patient names, IDs, diagnoses, or individual-level data in the output.
// ---------------------------------------------------------------------------

import type { HmisMonthlyReport } from './hmis-types'
import { formatReportingPeriod, HMIS_SECTIONS } from './hmis-template'

const RTL_LOCALES = ['ar', 'prs', 'ps']

/**
 * Generate a PDF Blob for the HMIS monthly report.
 * Returns a Blob that can be used to create an object URL for download.
 */
export async function exportHmisPdf(
  report: HmisMonthlyReport,
  locale: string,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const labels: Record<string, Record<string, string>> = {
    en: {
      title: 'HMIS Monthly Laboratory Report',
      sectionA: 'Section A — Facility Information',
      sectionB: 'Section B — Test Volume Summary',
      sectionC: 'Section C — Reportable Disease Surveillance',
      sectionD: 'Section D — Demographic Distribution',
      sectionE: 'Section E — Reagent & Supply Consumption',
      sectionF: 'Section F — Quality Indicators',
      certification: 'Certification',
      preparedBy: 'Prepared by:',
      reviewedBy: 'Reviewed by:',
      date: 'Date:',
      reportingPeriod: 'Reporting Period:',
      status: 'Status:',
      finalized: 'Finalized',
      draft: 'Draft',
      field: 'Field',
      value: 'Value',
      testCategory: 'Test Category',
      total: 'Total',
      positive: 'Positive',
      negative: 'Negative',
      ratePercent: 'Rate %',
      disease: 'Disease',
      totalTested: 'Total Tested',
      totalPositive: 'Total Positive',
      previousMonth: 'Previous Month',
      ageGroup: 'Age Group',
      male: 'Male',
      female: 'Female',
      unknown: 'Unknown',
      reagent: 'Reagent',
      consumed: 'Consumed',
      remaining: 'Remaining',
      estDays: 'Est. Days',
      indicator: 'Indicator',
      noData: 'No data for this period',
      noReagentData: 'No reagent data — manual entry required',
      correctionsNote: 'field(s) were manually corrected during review.',
    },
    ar: {
      title: 'التقرير المخبري الشهري HMIS',
      sectionA: 'القسم أ — معلومات المنشأة',
      sectionB: 'القسم ب — ملخص حجم الفحوصات',
      sectionC: 'القسم ج — مراقبة الأمراض الواجبة الإبلاغ',
      sectionD: 'القسم د — التوزيع الديموغرافي',
      sectionE: 'القسم هـ — استهلاك الكواشف والمستلزمات',
      sectionF: 'القسم و — مؤشرات الجودة',
      certification: 'التصديق',
      preparedBy: 'أعده:',
      reviewedBy: 'راجعه:',
      date: 'التاريخ:',
      reportingPeriod: 'فترة التقرير:',
      status: 'الحالة:',
      finalized: 'نهائي',
      draft: 'مسودة',
      field: 'الحقل',
      value: 'القيمة',
      testCategory: 'فئة الفحص',
      total: 'الإجمالي',
      positive: 'إيجابي',
      negative: 'سلبي',
      ratePercent: 'النسبة %',
      disease: 'المرض',
      totalTested: 'إجمالي المفحوصين',
      totalPositive: 'إجمالي الإيجابي',
      previousMonth: 'الشهر السابق',
      ageGroup: 'الفئة العمرية',
      male: 'ذكر',
      female: 'أنثى',
      unknown: 'غير معروف',
      reagent: 'الكاشف',
      consumed: 'المستهلك',
      remaining: 'المتبقي',
      estDays: 'الأيام المتوقعة',
      indicator: 'المؤشر',
      noData: 'لا توجد بيانات لهذه الفترة',
      noReagentData: 'لا توجد بيانات كواشف — يلزم إدخال يدوي',
      correctionsNote: 'حقل(حقول) تم تعديلها يدوياً أثناء المراجعة.',
    },
    prs: {
      title: 'راپور ماهانه آزمایشگاهی HMIS',
      sectionA: 'بخش الف — معلومات تأسیسات',
      sectionB: 'بخش ب — خلاصه حجم آزمایشات',
      sectionC: 'بخش ج — نظارت بر امراض قابل گزارش',
      sectionD: 'بخش د — توزیع دیموگرافیک',
      sectionE: 'بخش هـ — مصرف معرفها و تجهیزات',
      sectionF: 'بخش و — شاخصهای کیفیت',
      certification: 'تصدیق',
      preparedBy: 'تهیه‌کننده:',
      reviewedBy: 'بازبین:',
      date: 'تاریخ:',
      reportingPeriod: 'دوره گزارش:',
      status: 'وضعیت:',
      finalized: 'نهایی',
      draft: 'پیش‌نویس',
      field: 'ساحه',
      value: 'ارزش',
      testCategory: 'دسته آزمایش',
      total: 'مجموع',
      positive: 'مثبت',
      negative: 'منفی',
      ratePercent: 'نرخ %',
      disease: 'مرض',
      totalTested: 'مجموع آزمایش‌شده',
      totalPositive: 'مجموع مثبت',
      previousMonth: 'ماه قبل',
      ageGroup: 'گروه سنی',
      male: 'مرد',
      female: 'زن',
      unknown: 'نامعلوم',
      reagent: 'معرف',
      consumed: 'مصرف‌شده',
      remaining: 'باقی‌مانده',
      estDays: 'روزهای تخمینی',
      indicator: 'شاخص',
      noData: 'داده‌ای برای این دوره موجود نیست',
      noReagentData: 'داده معرف موجود نیست — ورود دستی لازم است',
      correctionsNote: 'ساحه(ها) در جریان بازبینی به صورت دستی اصلاح شد.',
    },
    ps: {
      title: 'HMIS میاشتنی لابراتواری راپور',
      sectionA: 'برخه الف — د تاسیساتو معلومات',
      sectionB: 'برخه ب — د معایناتو حجم لنډیز',
      sectionC: 'برخه ج — د راپور وړ ناروغیو څارنه',
      sectionD: 'برخه د — ډیموګرافیکي ویش',
      sectionE: 'برخه هـ — د معرفونو او تجهیزاتو مصرف',
      sectionF: 'برخه و — د کیفیت شاخصونه',
      certification: 'تصدیق',
      preparedBy: 'چمتو کوونکی:',
      reviewedBy: 'بیاکتونکی:',
      date: 'نیټه:',
      reportingPeriod: 'د راپور دوره:',
      status: 'حالت:',
      finalized: 'نهایي',
      draft: 'مسوده',
      field: 'ساحه',
      value: 'ارزښت',
      testCategory: 'د معایناتو ډله',
      total: 'ټول',
      positive: 'مثبت',
      negative: 'منفي',
      ratePercent: 'نرخ %',
      disease: 'ناروغي',
      totalTested: 'ټول معاینه شوي',
      totalPositive: 'ټول مثبت',
      previousMonth: 'تیره میاشت',
      ageGroup: 'عمري ډله',
      male: 'نارینه',
      female: 'ښځینه',
      unknown: 'نامعلوم',
      reagent: 'معرف',
      consumed: 'مصرف شوی',
      remaining: 'پاتې',
      estDays: 'اټکل شوي ورځې',
      indicator: 'شاخص',
      noData: 'د دې دورې لپاره معلومات نشته',
      noReagentData: 'د معرف معلومات نشته — لاسي ثبت ته اړتیا ده',
      correctionsNote: 'ساحه(ګانې) د بازبینی پر مهال په لاسي ډول اصلاح شوې.',
    },
  }

  const l = labels[locale] ?? labels.en

  const isRtl = RTL_LOCALES.includes(locale)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', putOnlyUsedFonts: true })
  const pageWidth = doc.internal.pageSize.width
  const startX = isRtl ? pageWidth - 14 : 14
  const align = isRtl ? 'right' : 'left'
  const period = formatReportingPeriod(report.reportYear, report.reportMonth)

  // PDF metadata
  doc.setProperties({
    title: `HMIS Monthly Report — ${period}`,
    author: report.facilityName,
    subject: 'Afghan MoPH HMIS Laboratory Report',
    creator: 'Lab Lite — Ultranos',
  })

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(l.title, startX, 18, { align })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`${report.facilityName} — ${report.facilityProvince}, ${report.facilityDistrict}`, startX, 25, { align })
  doc.text(`${l.reportingPeriod} ${period}`, startX, 31, { align })
  doc.text(
    `${l.status} ${report.status === 'finalized' ? l.finalized : l.draft}`,
    isRtl ? 14 : pageWidth - 14,
    31,
    { align: isRtl ? 'left' : 'right' },
  )

  let cursorY = 38

  // ---------------------------------------------------------------------------
  // Section A: Facility Information
  // ---------------------------------------------------------------------------
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(l.sectionA, startX, cursorY, { align })
  cursorY += 2

  autoTable(doc, {
    startY: cursorY,
    head: [[l.field, l.value]],
    body: [
      ['Facility Name', report.facilityName],
      ['Province', report.facilityProvince || '—'],
      ['District', report.facilityDistrict || '—'],
      [l.reportingPeriod, period],
      ['Prepared By', 'See signature below'],
      ['Generated At', new Date(report.generatedAt).toLocaleString()],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  cursorY = (doc as any).lastAutoTable.finalY + 8

  // ---------------------------------------------------------------------------
  // Section B: Test Volume Summary
  // ---------------------------------------------------------------------------
  if (cursorY > 240) {
    doc.addPage()
    cursorY = 20
  }
  doc.setFont('helvetica', 'bold')
  doc.text(l.sectionB, startX, cursorY, { align })
  cursorY += 2

  const bBody = report.testCategorySummary.length > 0
    ? report.testCategorySummary.map((cat) => [
        cat.categoryLabel,
        String(cat.totalPerformed),
        String(cat.totalPositive),
        String(cat.totalNegative),
        `${cat.positivityRate}%`,
      ])
    : [[l.noData, '', '', '', '']]

  autoTable(doc, {
    startY: cursorY,
    head: [[l.testCategory, l.total, l.positive, l.negative, l.ratePercent]],
    body: bBody,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  cursorY = (doc as any).lastAutoTable.finalY + 8

  // ---------------------------------------------------------------------------
  // Section C: Reportable Disease Surveillance
  // ---------------------------------------------------------------------------
  if (cursorY > 240) {
    doc.addPage()
    cursorY = 20
  }
  doc.setFont('helvetica', 'bold')
  doc.text(l.sectionC, startX, cursorY, { align })
  cursorY += 2

  autoTable(doc, {
    startY: cursorY,
    head: [[l.disease, l.totalTested, l.totalPositive, l.ratePercent, l.previousMonth]],
    body: report.positivityRates.map((d) => [
      d.diseaseLabel,
      String(d.totalTested),
      String(d.totalPositive),
      `${d.positivityRate}%`,
      d.previousMonthRate != null ? `${d.previousMonthRate}%` : '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  cursorY = (doc as any).lastAutoTable.finalY + 8

  // ---------------------------------------------------------------------------
  // Section D: Demographic Distribution
  // ---------------------------------------------------------------------------
  if (cursorY > 240) {
    doc.addPage()
    cursorY = 20
  }
  doc.setFont('helvetica', 'bold')
  doc.text(l.sectionD, startX, cursorY, { align })
  cursorY += 2

  autoTable(doc, {
    startY: cursorY,
    head: [[l.ageGroup, l.male, l.female, l.unknown, l.total]],
    body: report.demographics.map((d) => [
      d.ageGroup,
      String(d.male),
      String(d.female),
      String(d.unknown),
      String(d.total),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  cursorY = (doc as any).lastAutoTable.finalY + 8

  // ---------------------------------------------------------------------------
  // Section E: Reagent Consumption
  // ---------------------------------------------------------------------------
  if (cursorY > 240) {
    doc.addPage()
    cursorY = 20
  }
  doc.setFont('helvetica', 'bold')
  doc.text(l.sectionE, startX, cursorY, { align })
  cursorY += 2

  const eBody = report.reagentConsumption.length > 0
    ? report.reagentConsumption.map((r) => [
        r.reagentName,
        String(r.unitsConsumed),
        String(r.unitsRemaining),
        String(r.estimatedDaysRemaining),
      ])
    : [[l.noReagentData, '', '', '']]

  autoTable(doc, {
    startY: cursorY,
    head: [[l.reagent, l.consumed, l.remaining, l.estDays]],
    body: eBody,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  cursorY = (doc as any).lastAutoTable.finalY + 8

  // ---------------------------------------------------------------------------
  // Section F: Quality Indicators
  // ---------------------------------------------------------------------------
  if (cursorY > 240) {
    doc.addPage()
    cursorY = 20
  }
  doc.setFont('helvetica', 'bold')
  doc.text(l.sectionF, startX, cursorY, { align })
  cursorY += 2

  const qi = report.qualityIndicators
  autoTable(doc, {
    startY: cursorY,
    head: [[l.indicator, l.value]],
    body: [
      ['Total Samples Received', String(qi.totalSamplesReceived)],
      ['Rejected Samples', String(qi.rejectedSamples)],
      ['Rejection Rate', `${qi.rejectionRate}%`],
      ['QC Pass Rate', `${qi.qcPassRate}%`],
      ['Average TAT (hours)', String(qi.averageTatHours)],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  cursorY = (doc as any).lastAutoTable.finalY + 12

  // Add new page for footer if needed
  if (cursorY > 260) {
    doc.addPage()
    cursorY = 20
  }

  // ---------------------------------------------------------------------------
  // Footer: Certification block
  // ---------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(l.certification, startX, cursorY, { align })
  cursorY += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const lineY1 = cursorY + 8
  const lineY2 = cursorY + 8
  const colLeft = 14
  const colRight = pageWidth / 2 + 10

  // Prepared by
  doc.text(l.preparedBy, colLeft, cursorY)
  doc.text(l.reviewedBy, colRight, cursorY)
  doc.line(colLeft, lineY1, colLeft + 60, lineY1)
  doc.line(colRight, lineY2, colRight + 60, lineY2)
  cursorY += 14

  // Date
  doc.text('Date:', colLeft, cursorY)
  doc.text('Date:', colRight, cursorY)
  doc.line(colLeft + 10, cursorY, colLeft + 60, cursorY)
  doc.line(colRight + 10, cursorY, colRight + 60, cursorY)

  // Corrections note
  if (report.corrections.length > 0) {
    cursorY += 10
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(
      `Note: ${report.corrections.length} field(s) were manually corrected during review.`,
      startX,
      cursorY,
      { align },
    )
  }

  return doc.output('blob')
}
