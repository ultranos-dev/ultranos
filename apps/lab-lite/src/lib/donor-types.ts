// ---------------------------------------------------------------------------
// Story 50.2 — Multi-Donor Report Templates
// Data model for donor programs, report templates, and generated reports.
//
// PHI safety:
//   - Donor reports contain AGGREGATE statistics only — no patient-level data.
//   - Demographic cells with count < 5 are suppressed (standard de-identification).
//   - Audit events reference reports by ID and program code only — no aggregates.
//   - Reimbursement data is financial, not clinical — no PHI concerns.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Donor Program — registered funding programs for this lab
// ---------------------------------------------------------------------------

export interface ReimbursementRate {
  loincCode: string
  testLabel: string
  ratePerTest: number   // Amount in local currency
  currency: string      // 'AFN' (Afghan Afghani) default
}

export interface DonorProgram {
  id: string                         // UUID v4
  programCode: string                // Unique: 'WHO_TB', 'MSF_MALARIA', 'USAID_HEP', etc.
  programName: string                // Display: "WHO TB Program"
  donorOrganization: string          // "World Health Organization"
  status: 'active' | 'inactive'
  contactInfo?: string               // Optional coordinator contact
  contractStartDate?: string         // ISO 8601 date
  contractEndDate?: string           // ISO 8601 date
  reimbursementRates: ReimbursementRate[]  // Per-test rates
  loincCodes: string[]               // LOINC codes covered (for auto-tagging)
  templateCode: string               // References a DonorReportTemplate
  createdAt: string                  // ISO 8601
  updatedAt: string                  // ISO 8601
  syncStatus: 'pending' | 'synced'
}

// ---------------------------------------------------------------------------
// Donor Report Template — describes fields, sections, layout per donor format
// ---------------------------------------------------------------------------

export interface TemplateColumn {
  columnId: string
  columnHeader: string
  dataField: string              // Maps to aggregated data field
  dataType: 'number' | 'percentage' | 'currency' | 'text'
}

export interface TemplateSection {
  sectionId: string
  sectionTitle: string
  sectionType: 'test_summary' | 'positivity' | 'demographics' | 'reimbursement' | 'custom'
  columns: TemplateColumn[]
  filterLoincCodes?: string[]  // Only include these LOINC codes in this section
}

export interface DonorReportTemplate {
  templateCode: string               // 'WHO_TB_QUARTERLY', 'MSF_MALARIA_MONTHLY', etc.
  templateName: string               // Display name
  donorOrganization: string
  reportingFrequency: 'monthly' | 'quarterly' | 'annual'
  sections: TemplateSection[]
  includeReimbursement: boolean
  headerFields: string[]             // Fields in header (facility name, period, etc.)
  footerFields: string[]             // Fields for footer (prepared by, signature, etc.)
  isCustom?: boolean                 // true = user-defined, false = pre-built
  createdAt?: string                 // ISO 8601 (for custom templates stored in Dexie)
}

// ---------------------------------------------------------------------------
// Donor Report — a generated report instance
// ---------------------------------------------------------------------------

export interface ReportCorrection {
  fieldPath: string          // e.g. "sections[0].rows[1].totalPositive"
  originalValue: string | number
  correctedValue: string | number
  correctedBy: string        // practitioner ID
  correctedAt: string        // ISO 8601
  reason?: string
}

export interface GeneratedSection {
  sectionId: string
  sectionTitle: string
  rows: Record<string, number | string>[]  // Each row is a set of column values
}

export interface ReimbursementLineItem {
  testLabel: string
  loincCode: string
  count: number
  ratePerTest: number
  subtotal: number
}

export interface ReimbursementSummary {
  lineItems: ReimbursementLineItem[]
  grandTotal: number
  currency: string
}

export interface DonorReport {
  id: string                        // UUID v4
  programCode: string               // FK to DonorProgram
  programName: string               // Denormalized for offline display
  periodStart: string               // ISO 8601 date
  periodEnd: string                 // ISO 8601 date
  status: 'draft' | 'finalized'
  generatedAt: string               // ISO 8601
  generatedBy: string               // Practitioner ID
  finalizedAt?: string
  finalizedBy?: string
  sections: GeneratedSection[]      // Populated data per template section
  reimbursement?: ReimbursementSummary
  corrections: ReportCorrection[]   // Minor corrections applied during review
  warnings: string[]                // e.g., 'partial_data', 'no_data'
  syncStatus: 'pending' | 'synced'
}
