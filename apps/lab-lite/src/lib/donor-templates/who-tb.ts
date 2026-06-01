// ---------------------------------------------------------------------------
// Story 50.2 — WHO TB Program Report Template (Quarterly)
// Pre-built template for World Health Organization TB Program reporting.
//
// Sections:
//   1. TB Test Summary — AFB smear + GeneXpert results
//   2. Demographics — age groups x gender for TB-positive cases (count ≥ 5 only)
//   3. Treatment Outcome Tracking (if available)
// No reimbursement section — WHO TB is grant-funded.
// ---------------------------------------------------------------------------

import type { DonorReportTemplate } from '@/lib/donor-types'

// WHO TB LOINC codes used for auto-tagging and section filtering
export const WHO_TB_LOINC_CODES = [
  '11545-1',  // AFB smear
  '40930-0',  // AFB smear microscopy
  '88637-3',  // GeneXpert MTB/RIF
  '88877-5',  // GeneXpert Ultra MTB/RIF
]

export const WHO_TB_TEMPLATE: DonorReportTemplate = {
  templateCode: 'WHO_TB_QUARTERLY',
  templateName: 'WHO TB Program — Quarterly Report',
  donorOrganization: 'World Health Organization',
  reportingFrequency: 'quarterly',
  includeReimbursement: false,
  headerFields: ['facilityName', 'facilityDistrict', 'reportingPeriod', 'generatedBy'],
  footerFields: ['preparedBy', 'reviewedBy', 'signatureDate'],
  sections: [
    {
      sectionId: 'tb_afb_summary',
      sectionTitle: 'Section 1 — AFB Smear Microscopy',
      sectionType: 'test_summary',
      filterLoincCodes: ['11545-1', '40930-0'],
      columns: [
        { columnId: 'test', columnHeader: 'Test', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'total', columnHeader: 'Total Tests', dataField: 'totalPerformed', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'Positive', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'negative', columnHeader: 'Negative', dataField: 'totalNegative', dataType: 'number' },
        { columnId: 'positivity', columnHeader: 'Positivity %', dataField: 'positivityRate', dataType: 'percentage' },
      ],
    },
    {
      sectionId: 'tb_genexpert_summary',
      sectionTitle: 'Section 2 — GeneXpert MTB/RIF',
      sectionType: 'test_summary',
      filterLoincCodes: ['88637-3', '88877-5'],
      columns: [
        { columnId: 'test', columnHeader: 'Test', dataField: 'testLabel', dataType: 'text' },
        { columnId: 'total', columnHeader: 'Total Tests', dataField: 'totalPerformed', dataType: 'number' },
        { columnId: 'positive', columnHeader: 'MTB Detected', dataField: 'totalPositive', dataType: 'number' },
        { columnId: 'rifampicin', columnHeader: 'Rifampicin Resistant', dataField: 'rifampicinResistant', dataType: 'number' },
        { columnId: 'negative', columnHeader: 'MTB Not Detected', dataField: 'totalNegative', dataType: 'number' },
      ],
    },
    {
      sectionId: 'tb_demographics',
      sectionTitle: 'Section 3 — Demographics (TB-Positive Cases)',
      sectionType: 'demographics',
      columns: [
        { columnId: 'ageGroup', columnHeader: 'Age Group', dataField: 'ageGroup', dataType: 'text' },
        { columnId: 'male', columnHeader: 'Male', dataField: 'male', dataType: 'number' },
        { columnId: 'female', columnHeader: 'Female', dataField: 'female', dataType: 'number' },
        { columnId: 'total', columnHeader: 'Total', dataField: 'total', dataType: 'number' },
      ],
    },
  ],
}
