# Story 50.2: Multi-Donor Report Templates

Status: pending

## Story

As a lab manager with multiple funding sources,
I want donor-specific reports to generate automatically in each donor's required format,
so that I never manually compile a donor report again.

## Acceptance Criteria

1. **Given** the lab settings page, **when** the manager navigates to "Program Registration", **then** they can register the lab with one or more donor programs (e.g., WHO TB, MSF malaria, USAID hepatitis) with program-specific metadata
2. **And** when a test order is received or a result is entered, the tech can tag it to one or more registered programs
3. **And** when the manager selects a program and reporting period, the system generates a report in that donor's specific format with the data fields they require
4. **And** program-specific test tracking is automatic — tests tagged by program at order time flow into the correct donor report
5. **And** the report includes reimbursement calculations where applicable (per-test rates configured per program)
6. **And** reports are exportable as PDF and shareable via the device share sheet (WhatsApp, email, etc.)
7. **And** donor report templates are configurable — new donor formats can be added without code changes
8. **And** report generation works from local Dexie data (offline capable)
9. **And** all report generation and export actions are audit-logged (no PHI in audit payloads)

## Tasks / Subtasks

- [ ] Task 1: Donor program data model & Dexie schema (AC: #1, #7, #8)
  - [ ] 1.1 Define `DonorProgram` interface in `apps/lab-lite/src/lib/donor-types.ts`
  - [ ] 1.2 Define `DonorReportTemplate` interface — describes fields, sections, and layout for each donor's report format
  - [ ] 1.3 Define `DonorReport` interface — a generated report instance
  - [ ] 1.4 Add `donorPrograms`, `donorReportTemplates`, and `donorReports` tables to Dexie (v6 or next available version)
  - [ ] 1.5 Index `donorPrograms` on `programCode, status`; `donorReports` on `programCode, reportPeriod, status`
  - [ ] 1.6 Create CRUD helpers: `saveDonorProgram()`, `getDonorPrograms()`, `getDonorProgramByCode()`, `saveDonorReport()`, `getDonorReports()`

- [ ] Task 2: Pre-built donor templates (AC: #3, #7)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/donor-templates/who-tb.ts` — WHO TB program report template
  - [ ] 2.2 Create `apps/lab-lite/src/lib/donor-templates/msf-malaria.ts` — MSF malaria program report template
  - [ ] 2.3 Create `apps/lab-lite/src/lib/donor-templates/usaid-hepatitis.ts` — USAID hepatitis program report template
  - [ ] 2.4 Create `apps/lab-lite/src/lib/donor-templates/index.ts` — template registry that maps program codes to templates
  - [ ] 2.5 Each template defines: required data fields, section layout, column headers, summary calculations, and reimbursement formula (if applicable)

- [ ] Task 3: Program registration UI in settings (AC: #1)
  - [ ] 3.1 Create `apps/lab-lite/src/components/settings/ProgramRegistration.tsx`
  - [ ] 3.2 List registered programs with status toggle (active/inactive)
  - [ ] 3.3 "Add Program" flow: select from pre-built templates or create custom program
  - [ ] 3.4 Program metadata form: program name, donor organization, program code (unique), contact info, contract dates, per-test reimbursement rates
  - [ ] 3.5 Custom template builder: define report sections, data fields to include, and column layout (stretch goal — can be a JSON editor for v1)
  - [ ] 3.6 Integrate into existing `LabSettingsView.tsx` as a new card/section

- [ ] Task 4: Test-to-program tagging (AC: #2, #4)
  - [ ] 4.1 Extend `LabLogbookEntry` (or equivalent result record) with `programTags: string[]` field
  - [ ] 4.2 Create `apps/lab-lite/src/components/reports/ProgramTagSelector.tsx` — multi-select dropdown of active programs
  - [ ] 4.3 Integrate tag selector into the result entry flow (Story 42.4 integration point) — shown after test category selection
  - [ ] 4.4 Auto-tagging rules: if a program's configured LOINC codes match the test being performed, auto-suggest the program tag
  - [ ] 4.5 Tags are persisted on the logbook entry and flow into Dexie

- [ ] Task 5: Donor report generation engine (AC: #3, #4, #5)
  - [ ] 5.1 Create `apps/lab-lite/src/lib/donor-report-generator.ts`
  - [ ] 5.2 Implement `generateDonorReport(programCode: string, periodStart: string, periodEnd: string)` — queries logbook entries tagged with the given program
  - [ ] 5.3 Apply the donor template to structure the data: map tagged results to template sections and fields
  - [ ] 5.4 Calculate reimbursement totals where the program has per-test rates configured
  - [ ] 5.5 Return a `DonorReport` object with `status: 'draft'`
  - [ ] 5.6 Handle edge cases: no data for period (empty report with zeros), partial data (generate with available data + warnings)

- [ ] Task 6: Donor report review and export UI (AC: #3, #6)
  - [ ] 6.1 Create `apps/lab-lite/src/app/[locale]/reports/donor/page.tsx` — server component shell
  - [ ] 6.2 Create `apps/lab-lite/src/components/reports/DonorReportGenerator.tsx` — program selector + period selector + "Generate" button
  - [ ] 6.3 Create `apps/lab-lite/src/components/reports/DonorReportReview.tsx` — renders generated report in the donor's template format
  - [ ] 6.4 Review screen allows minor corrections (same pattern as Story 50.1 HMIS review)
  - [ ] 6.5 "Finalize" button with confirmation
  - [ ] 6.6 Export actions: "Export PDF" and "Share" (via Web Share API)

- [ ] Task 7: PDF export — donor-specific formatting (AC: #6)
  - [ ] 7.1 Create `apps/lab-lite/src/lib/donor-report-pdf.ts`
  - [ ] 7.2 Use jsPDF + jspdf-autotable (consistent with existing PDF patterns)
  - [ ] 7.3 Template-driven rendering: each `DonorReportTemplate` defines its PDF layout (sections, columns, header/footer)
  - [ ] 7.4 Include donor logo placeholder area, program name, reporting period, facility info
  - [ ] 7.5 Reimbursement section (if applicable): itemized test counts x rate = subtotal, with grand total
  - [ ] 7.6 RTL support matching existing PDF patterns
  - [ ] 7.7 Emit `DONOR_REPORT_EXPORTED` audit event (report ID, program code, format — no PHI)

- [ ] Task 8: Web Share API integration (AC: #6)
  - [ ] 8.1 Create `apps/lab-lite/src/lib/share-file.ts` — utility for sharing files via Web Share API
  - [ ] 8.2 Generate PDF blob, then invoke `navigator.share({ files: [pdfFile], title, text })`
  - [ ] 8.3 Fallback for browsers without Web Share API: download the file instead
  - [ ] 8.4 This utility will be reused by Story 50.4 (Daily Activity Log)

- [ ] Task 9: Report history and list (AC: #8)
  - [ ] 9.1 Create `apps/lab-lite/src/components/reports/DonorReportList.tsx` — lists past donor reports grouped by program
  - [ ] 9.2 Create `apps/lab-lite/src/hooks/useDonorReports.ts` — fetches from Dexie with program and date filters
  - [ ] 9.3 Status badges: draft (amber), finalized (green)
  - [ ] 9.4 Finalized reports are view-only with re-export option

- [ ] Task 10: Hub sync integration (AC: #8)
  - [ ] 10.1 Finalized donor reports enqueue to `syncQueue` with `resourceType: 'DonorReport'`
  - [ ] 10.2 Program registrations sync to Hub with `resourceType: 'DonorProgram'`
  - [ ] 10.3 Sync priority: Tier 3 (operational data — LWW)

- [ ] Task 11: Audit events (AC: #9)
  - [ ] 11.1 Emit `DONOR_PROGRAM_REGISTERED` when a program is added/activated (program code)
  - [ ] 11.2 Emit `DONOR_REPORT_GENERATED` when report aggregation completes (report ID, program code, period)
  - [ ] 11.3 Emit `DONOR_REPORT_FINALIZED` when finalized (report ID, program code, finalizer ID)
  - [ ] 11.4 Emit `DONOR_REPORT_EXPORTED` when PDF or share is triggered (report ID, format)
  - [ ] 11.5 All audit events use opaque IDs only — never PHI

- [ ] Task 12: i18n keys (AC: all)
  - [ ] 12.1 Add `donorReport` namespace to `apps/lab-lite/messages/en.json`
  - [ ] 12.2 Add corresponding keys to `prs.json`, `ps.json`, `ar.json`
  - [ ] 12.3 Keys needed: title, programRegistration, addProgram, editProgram, programName, donorOrg, programCode, contactInfo, contractDates, reimbursementRate, perTest, active, inactive, selectProgram, selectPeriod, generateReport, generating, reviewTitle, corrections, finalize, finalizeConfirm, exportPdf, share, sharing, shareUnsupported, reportHistory, statusDraft, statusFinalized, noReports, noPrograms, registerFirst, testTagging, tagPrograms, autoTagged, reimbursement, totalReimbursable, subtotal, grandTotal, noDataForPeriod, partialData

- [ ] Task 13: Tests (AC: all)
  - [ ] 13.1 Program registration — CRUD operations for donor programs in Dexie
  - [ ] 13.2 Test tagging — logbook entries tagged with program codes are correctly filtered during report generation
  - [ ] 13.3 Auto-tagging — LOINC code matching auto-suggests the correct program
  - [ ] 13.4 Report generation — correct aggregation of tagged results per program template
  - [ ] 13.5 Reimbursement — per-test rate x count = correct subtotals and grand total
  - [ ] 13.6 Template rendering — different donor templates produce different report layouts
  - [ ] 13.7 PDF export — generates valid PDF blob with donor-specific formatting
  - [ ] 13.8 Web Share API — share invokes navigator.share when available, falls back to download
  - [ ] 13.9 Offline — full generation and PDF export work without network
  - [ ] 13.10 Audit events — all event types emitted with correct shapes (no PHI)

## Dev Notes

### Data Model — `DonorProgram`

```typescript
export interface DonorProgram {
  id: string                          // UUID v4
  programCode: string                 // Unique code: 'WHO_TB', 'MSF_MALARIA', 'USAID_HEP', etc.
  programName: string                 // Display name: "WHO TB Program"
  donorOrganization: string           // "World Health Organization"
  status: 'active' | 'inactive'
  contactInfo?: string                // Optional contact for the program coordinator
  contractStartDate?: string          // ISO 8601 date
  contractEndDate?: string            // ISO 8601 date
  reimbursementRates: ReimbursementRate[]  // Per-test rates
  loincCodes: string[]                // LOINC codes covered by this program (for auto-tagging)
  templateCode: string                // References a DonorReportTemplate
  createdAt: string                   // ISO 8601
  updatedAt: string                   // ISO 8601
  syncStatus: 'pending' | 'synced'
}

export interface ReimbursementRate {
  loincCode: string
  testLabel: string
  ratePerTest: number                 // Amount in local currency
  currency: string                    // 'AFN' (Afghan Afghani) default
}
```

### Data Model — `DonorReportTemplate`

```typescript
export interface DonorReportTemplate {
  templateCode: string                // 'WHO_TB_QUARTERLY', 'MSF_MALARIA_MONTHLY', etc.
  templateName: string                // Display name
  donorOrganization: string
  reportingFrequency: 'monthly' | 'quarterly' | 'annual'
  sections: TemplateSection[]
  includeReimbursement: boolean
  headerFields: string[]              // Fields to show in header (facility name, period, etc.)
  footerFields: string[]              // Fields for footer (prepared by, signature, etc.)
}

export interface TemplateSection {
  sectionId: string
  sectionTitle: string
  sectionType: 'test_summary' | 'positivity' | 'demographics' | 'reimbursement' | 'custom'
  columns: TemplateColumn[]
  filterLoincCodes?: string[]         // If set, only include these LOINC codes in this section
}

export interface TemplateColumn {
  columnId: string
  columnHeader: string
  dataField: string                   // Maps to aggregated data field
  dataType: 'number' | 'percentage' | 'currency' | 'text'
}
```

### Data Model — `DonorReport`

```typescript
export interface DonorReport {
  id: string                          // UUID v4
  programCode: string                 // FK to DonorProgram
  programName: string                 // Denormalized for offline display
  periodStart: string                 // ISO 8601 date
  periodEnd: string                   // ISO 8601 date
  status: 'draft' | 'finalized'
  generatedAt: string
  generatedBy: string                 // Practitioner ID
  finalizedAt?: string
  finalizedBy?: string
  sections: GeneratedSection[]        // Populated data per template section
  reimbursement?: ReimbursementSummary
  corrections: ReportCorrection[]     // Same pattern as Story 50.1
  syncStatus: 'pending' | 'synced'
}

export interface GeneratedSection {
  sectionId: string
  sectionTitle: string
  rows: Record<string, number | string>[]  // Each row is a set of column values
}

export interface ReimbursementSummary {
  lineItems: ReimbursementLineItem[]
  grandTotal: number
  currency: string
}

export interface ReimbursementLineItem {
  testLabel: string
  loincCode: string
  count: number
  ratePerTest: number
  subtotal: number
}
```

### Pre-Built Donor Template Examples

**WHO TB Program (Quarterly):**
- Section 1: TB Test Summary — AFB smear (total, positive, negative), GeneXpert (total, positive, negative, rifampicin resistant)
- Section 2: Demographics — age groups x gender for TB-positive cases
- Section 3: Treatment outcome tracking (if available)
- No reimbursement section

**MSF Malaria Program (Monthly):**
- Section 1: Malaria Testing — RDT (total, positive), Microscopy (total, positive, species breakdown)
- Section 2: Positivity trend — current month vs. 3-month rolling average
- Section 3: Reimbursement — per-test rate for RDTs and microscopy
- Reimbursement included

**USAID Hepatitis Program (Quarterly):**
- Section 1: HBsAg Testing — total tested, positive, positivity rate
- Section 2: Anti-HCV Testing — total tested, positive, positivity rate
- Section 3: Demographics — age groups for positive cases
- Section 4: Reimbursement — per-test rates
- Reimbursement included

### Template Configuration Model

Templates are stored as structured TypeScript objects, not free-form JSON. This allows type safety while remaining configurable. New templates can be added by:

1. Creating a new file in `apps/lab-lite/src/lib/donor-templates/`
2. Exporting a `DonorReportTemplate` object
3. Registering it in the template index

Future enhancement: allow template import from JSON via settings page, enabling labs to create custom donor templates without code changes.

### Existing Patterns to Follow

- **PDF generation:** Follow `logbook-pdf.ts` / HMIS PDF (Story 42.8 / 50.1) — jsPDF + jspdf-autotable
- **Settings UI:** Follow `LabSettingsView.tsx` card pattern for program registration
- **Correction tracking:** Follow Story 50.1 `ReportCorrection` pattern
- **Audit pattern:** Follow `reportQueueAuditEvent()` from `audit-client.ts`
- **i18n pattern:** Follow `en.json` namespacing
- **Data minimization:** Donor reports contain aggregate statistics only — no patient-level data

### PHI Safety Reminders

- Donor reports contain aggregate statistics — not PHI individually, but care must be taken with small-N categories (e.g., if only 1 person tested positive for a disease, the demographic breakdown could be identifying)
- Consider suppressing demographic cells with counts < 5 (standard epidemiological de-identification)
- Audit events reference reports by ID and program code only — never include aggregated values
- Reimbursement data is financial, not clinical — no PHI concerns

### Dependencies

- **Story 50.1 (HMIS Report):** Shares the reports navigation structure and correction pattern. Reports landing page (`/reports`) should be created in 50.1 if it runs first.
- **Story 42.8 (Digital Lab Logbook):** Program tags are stored on logbook entries. If logbook is not implemented, tags can be stored on the `uploadQueue` entries as a fallback.
- **Story 42.4 (Lab Result Templates):** Test-to-program tagging integrates into the result entry flow.
- **Existing infrastructure:** Dexie database (`db.ts`), audit client (`audit-client.ts`), LOINC categories (`loinc-categories.ts`), jsPDF, `AppSidebar.tsx`, `LabSettingsView.tsx`, i18n message files.
