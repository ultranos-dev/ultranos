// ---------------------------------------------------------------------------
// Story 50.2 — USAID Hepatitis Program Report Template (Quarterly)
// Pre-built template for USAID Hepatitis Program.
//
// Sections:
//   1. HBsAg Testing — Hepatitis B surface antigen
//   2. Anti-HCV Testing — Hepatitis C antibody
//   3. Demographics — age groups for positive cases (count ≥ 5 only)
//   4. Reimbursement — per-test rates for HBsAg and anti-HCV
// Reimbursement included — USAID pays per-test rates.
// ---------------------------------------------------------------------------

import type { DonorReportTemplate } from '@/lib/donor-types'

// USAID Hepatitis LOINC codes used for auto-tagging and section filtering
export const USAID_HEP_LOINC_CODES = [
  '5196-1',   // Hepatitis B surface antigen (HBsAg)
  '16128-1',  // Hepatitis C antibody (anti-HCV)
  '40726-2',  // HBsAg confirmatory
]

export const USAID_HEP_TEMPLATE: DonorReportTemplate = {
  templateCode: 'USAID_HEP_QUARTERLY',
  templateName: 'USAID Hepatitis Program — Quarterly Report',
  donorOrganization: 'United States Agency for International Development (USAID)',
  reportingFrequency: 'quarterly',
  includeReimbursement: true,
  headerFields: ['facilityName', 'facilityDistrict', 'reportingPeriod', 'generatedBy'],
  footerFields: ['preparedBy', 'reviewedBy', 'signatureDate'],
  sections: [
    {
      sectionId: 'hbsag_testing',
      sectionTitle: 'Section 1 — HBsAg Testing (Hepatitis B)',
      sectionType: 'test_summary',
      filterLoincCodes: ['5196-1', '40726-2'],
      columns: [
        { columnId: 'test', columnHeader: 'Test', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'total', columnHeader: 'Total Tested', dataField: 'totalPerformed', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'Positive', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'negative', columnHeader: 'Negative', dataField: 'totalNegative', dataType: 'number' },
        { columnId: 'positivity', columnHeader: 'Positivity %', dataField: 'positivityRate', dataType: 'percentage' },
      ],
    },
    {
      sectionId: 'hcv_testing',
      sectionTitle: 'Section 2 — Anti-HCV Testing (Hepatitis C)',
      sectionType: 'test_summary',
      filterLoincCodes: ['16128-1'],
      columns: [
        { columnId: 'test', columnHeader: 'Test', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'total', columnHeader: 'Total Tested', dataField: 'totalPerformed', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'Positive', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'negative', columnHeader: 'Negative', dataField: 'totalNegative', dataType: 'number' },
        { columnId: 'positivity', columnHeader: 'Positivity %', dataField: 'positivityRate', dataType: 'percentage' },
      ],
    },
    {
      sectionId: 'hepatitis_demographics',
      sectionTitle: 'Section 3 — Demographics (Positive Cases)',
      sectionType: 'demographics',
      columns: [
        { columnId: 'ageGroup', columnHeader: 'Age Group', dataField: 'ageGroup', dataType: 'text' },
        { columnId: 'hbsagPositive', columnHeader: 'HBsAg+', dataField: 'hbsagPositive', dataType: 'number' },
        { columnId: 'hcvPositive', columnHeader: 'Anti-HCV+', dataField: 'hcvPositive', dataType: 'number' },
        { columnId: 'total', columnHeader: 'Total', dataField: 'total', dataType: 'number' },
      ],
    },
    {
      sectionId: 'hepatitis_reimbursement',
      sectionTitle: 'Section 4 — Reimbursement Summary',
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
