// ---------------------------------------------------------------------------
// Story 50.2 — MSF Malaria Program Report Template (Monthly)
// Pre-built template for Médecins Sans Frontières Malaria Program.
//
// Sections:
//   1. Malaria Testing — RDT and Microscopy results
//   2. Positivity Trend — current month vs. 3-month rolling average
//   3. Reimbursement — per-test rates for RDTs and microscopy slides
// Reimbursement included — MSF pays per-test rates for supported labs.
// ---------------------------------------------------------------------------

import type { DonorReportTemplate } from '@/lib/donor-types'

// MSF Malaria LOINC codes used for auto-tagging and section filtering
export const MSF_MALARIA_LOINC_CODES = [
  '32700-7',  // Malaria RDT (Plasmodium species)
  '51587-4',  // Malaria microscopy (thick and thin film)
  '51588-2',  // Malaria smear — Plasmodium vivax
  '51589-0',  // Malaria smear — Plasmodium falciparum
]

export const MSF_MALARIA_TEMPLATE: DonorReportTemplate = {
  templateCode: 'MSF_MALARIA_MONTHLY',
  templateName: 'MSF Malaria Program — Monthly Report',
  donorOrganization: 'Médecins Sans Frontières (MSF)',
  reportingFrequency: 'monthly',
  includeReimbursement: true,
  headerFields: ['facilityName', 'facilityDistrict', 'reportingPeriod', 'generatedBy'],
  footerFields: ['preparedBy', 'reviewedBy', 'signatureDate'],
  sections: [
    {
      sectionId: 'malaria_rdt',
      sectionTitle: 'Section 1a — Malaria RDT Results',
      sectionType: 'test_summary',
      filterLoincCodes: ['32700-7'],
      columns: [
        { columnId: 'test', columnHeader: 'Test Type', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'total', columnHeader: 'Total Tests', dataField: 'totalPerformed', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'Positive', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'negative', columnHeader: 'Negative', dataField: 'totalNegative', dataType: 'number' },
        { columnId: 'positivity', columnHeader: 'Positivity %', dataField: 'positivityRate', dataType: 'percentage' },
      ],
    },
    {
      sectionId: 'malaria_microscopy',
      sectionTitle: 'Section 1b — Malaria Microscopy',
      sectionType: 'test_summary',
      filterLoincCodes: ['51587-4', '51588-2', '51589-0'],
      columns: [
        { columnId: 'test', columnHeader: 'Species', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'total', columnHeader: 'Total Slides', dataField: 'totalPerformed', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'Positive', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'negative', columnHeader: 'Negative', dataField: 'totalNegative', dataType: 'number' },
        { columnId: 'positivity', columnHeader: 'Positivity %', dataField: 'positivityRate', dataType: 'percentage' },
      ],
    },
    {
      sectionId: 'malaria_trend',
      sectionTitle: 'Section 2 — Positivity Trend',
      sectionType: 'positivity',
      columns: [
        { columnId: 'period', columnHeader: 'Period', dataField: 'period', dataType: 'text' },
        { columnId: 'tested', columnHeader: 'Total Tested', dataField: 'totalTested', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'Total Positive', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'rate', columnHeader: 'Positivity %', dataField: 'positivityRate', dataType: 'percentage' },
      ],
    },
    {
      sectionId: 'malaria_reimbursement',
      sectionTitle: 'Section 3 — Reimbursement Summary',
      sectionType: 'reimbursement',
      columns: [
        { columnId: 'test', columnHeader: 'Test', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'count', columnHeader: 'Count', dataField: 'count', dataType: 'number' },
        { columnId: 'rate', columnHeader: 'Rate (AFN)', dataField: 'ratePerTest', dataType: 'currency' },
        { columnId: 'subtotal', columnHeader: 'Subtotal (AFN)', dataField: 'subtotal', dataType: 'currency' },
      ],
    },
  ],
}
