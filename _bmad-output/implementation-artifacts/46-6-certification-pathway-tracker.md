# Story 46.6: Certification Pathway Tracker

Status: review

## Story

As a lab technician,
I want to track my progress toward professional certification milestones,
so that I have a visible career ladder and evidence of my professional growth.

## Context

Lab technicians in low-resource settings often lack any formal career progression pathway. This story creates a certification pathway tracker that aggregates progress from multiple sources — completed micro-learning modules (Story 46.2), competency assessments (Story 46.3), supervised procedures, mentorship activity (Story 46.5), and continuing education hours — into a unified milestone-based progression system. When milestones are met, the system generates verifiable digital certificates as PDF documents with verification QR codes.

The certification pathway is configurable per jurisdiction (some may have formal certification levels, others may use internal milestones). The tracker provides a visible career ladder that motivates professional growth and produces exportable documentation for external verification.

**PRD Requirements:** FR46 (brainstorm #38)
**Dependencies:** Story 46.2 (Module completions), Story 46.3 (Competency data), Story 46.5 (Mentorship activity)

## Acceptance Criteria

1. [ ] Given certification levels are defined (if applicable in the jurisdiction), when the tech views their certification pathway, then they see: modules completed, competency assessments passed, supervised procedures logged, continuing education hours accumulated, and progress toward the next milestone.
2. [ ] When a milestone is met, a verifiable digital certificate is generated.
3. [ ] The pathway is visible in the tech's profile and exportable for external verification.
4. [ ] All UI is RTL-compatible and i18n-ready.
5. [ ] No patient data appears in certification records.

## Tasks / Subtasks

- [x] **Task 1: Certification Data Model & Dexie Schema** (AC: 1, 2)
  - [x] Create `apps/lab-lite/src/lib/certification-types.ts` with:
    ```
    CertificationPathway {
      id: string
      name: string                 // e.g., "Level 1 Lab Technician", "Advanced Hematology"
      description: string
      milestones: CertificationMilestone[]
      jurisdictionCode?: string    // optional — ties to a specific country/region
      version: string
      meta: { lastUpdated: string, versionId: string }
    }
    ```
  - [x] Define `CertificationMilestone` type:
    ```
    {
      id: string
      pathwayId: string
      name: string                 // e.g., "Complete 5 hematology modules"
      description: string
      category: 'modules' | 'competency' | 'supervised_procedures' | 'education_hours' | 'mentorship'
      requirement: {
        type: 'count' | 'hours' | 'streak_days' | 'all_green'
        target: number             // e.g., 5 modules, 20 hours, 30 days
        procedureFilter?: string[] // LOINC codes — if milestone is procedure-specific
      }
      order: number                // display order within pathway
    }
    ```
  - [x] Define `TechnicianProgress` type:
    ```
    {
      id: string
      technicianId: string
      pathwayId: string
      milestoneProgress: MilestoneProgress[]  // { milestoneId, currentValue, targetValue, completedAt? }
      overallPercent: number
      currentLevel: string | null  // name of highest completed milestone group
      updatedAt: string
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [x] Define `DigitalCertificate` type:
    ```
    {
      id: string
      technicianId: string
      technicianName: string
      pathwayId: string
      milestoneName: string
      issuedAt: string
      verificationCode: string     // unique code for QR verification
      pdfBlob?: Blob               // generated PDF stored locally
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [x] Update `apps/lab-lite/src/lib/db.ts` — add Dexie tables:
    - `certification_pathways` table: `&id, jurisdictionCode, version`
    - `technician_progress` table: `&id, technicianId, pathwayId, [technicianId+pathwayId]`
    - `digital_certificates` table: `&id, technicianId, pathwayId, issuedAt, syncStatus`

- [x] **Task 2: Progress Calculation Engine** (AC: 1)
  - [x] Create `apps/lab-lite/src/lib/certification-engine.ts`.
  - [x] Implement `calculateProgress(technicianId: string, pathway: CertificationPathway): Promise<TechnicianProgress>`:
    - **Modules milestone:** Count completed modules from `module_completions` table (Story 46.2) where `assessmentPassed: true`. Filter by `procedureFilter` LOINC codes if specified.
    - **Competency milestone:** Query `procedure_competencies` table (Story 46.3). For `all_green` type: check if all filtered procedures have `status: 'active'`. For `streak_days` type: calculate consecutive days with all-green status.
    - **Supervised procedures milestone:** Count from a `supervised_procedures` Dexie table (logged by supervisor confirmation).
    - **Education hours milestone:** Sum `durationMinutes / 60` from completed modules and any manually logged education entries.
    - **Mentorship milestone:** Count check-ins and journal entries from mentorship tables (Story 46.5).
  - [x] Calculate `overallPercent` as weighted average across all milestones.
  - [x] Detect newly completed milestones and trigger certificate generation.

- [x] **Task 3: Supervised Procedure Logging** (AC: 1)
  - [x] Create `apps/lab-lite/src/lib/supervised-procedure-types.ts`:
    ```
    SupervisedProcedure {
      id: string
      technicianId: string
      supervisorId: string
      procedureRef: string         // LOINC code
      procedureName: string
      performedAt: string
      supervisorNotes?: string
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [x] Add Dexie table: `supervised_procedures`: `&id, technicianId, procedureRef, performedAt, syncStatus`
  - [x] Create `apps/lab-lite/src/components/certification/LogSupervisedProcedure.tsx` — form for supervisor to log a supervised procedure for a tech.

- [x] **Task 4: Certification Pathway Dashboard** (AC: 1, 3, 4)
  - [x] Create `apps/lab-lite/src/components/certification/CertificationDashboard.tsx`.
  - [x] Display active pathway with milestone list, each showing:
    - Milestone name and description.
    - Progress bar: `currentValue / targetValue` with percentage.
    - Completion badge when met.
  - [x] Overall progress section: percentage complete, current level, next milestone to achieve.
  - [x] Historical section: completed milestones with dates and linked certificates.
  - [x] Ensure RTL layout compatibility.

- [x] **Task 5: Digital Certificate Generation** (AC: 2, 3)
  - [x] Create `apps/lab-lite/src/lib/certificate-generator.ts`.
  - [x] Generate a PDF certificate containing:
    - Technician name and ID.
    - Milestone/pathway name and description.
    - Issue date.
    - Verification QR code containing: `{ certId, techId, milestone, issuedAt, verificationCode }` — no PHI.
    - Ultranos branding and formatting.
  - [x] Use a client-side PDF library (e.g., `jspdf` or `@react-pdf/renderer`) for offline generation.
  - [x] QR code generated using a lightweight QR library (e.g., `qrcode`).
  - [x] Store generated PDF blob in the `digital_certificates` Dexie table.
  - [x] Sync certificate metadata (not PDF blob) to Hub for verification registry.

- [x] **Task 6: Export & Verification** (AC: 3)
  - [x] Create `apps/lab-lite/src/components/certification/CertificateViewer.tsx`.
  - [x] Display certificate preview with download button (saves PDF to device).
  - [x] Share/export functionality: download PDF, copy verification link.
  - [x] Hub provides a public verification endpoint (deferred to Hub API) — QR code links to `https://[hub-url]/verify/[verificationCode]`.

- [x] **Task 7: Pathway Sync from Hub** (AC: 1)
  - [x] Create `apps/lab-lite/src/lib/certification-sync.ts`.
  - [x] Implement `syncCertificationPathways()`:
    - Pull pathway definitions from Hub (pathways are Hub-managed).
    - Push progress and certificate records to Hub.
  - [x] Integrate into the existing sync cycle.

- [x] **Task 8: Page Route & Navigation** (AC: 4)
  - [x] Create `apps/lab-lite/src/app/[locale]/certification/page.tsx`.
  - [x] Add certification link to `AppSidebar.tsx` navigation.
  - [x] Add all translation keys.
  - [x] Ensure RTL layout compatibility.

- [x] **Task 9: Tests** (AC: 1-5)
  - [x] Unit tests for progress calculation: each milestone category, overall percentage, edge cases (zero progress, full completion).
  - [x] Unit tests for milestone completion detection: newly completed, already completed, partial.
  - [x] Unit tests for certificate generation: PDF creation, QR code content, verification code uniqueness.
  - [x] Component tests for CertificationDashboard: progress bars, completion badges, empty state.
  - [x] Component tests for CertificateViewer: download action, preview rendering.
  - [x] RTL snapshot tests.

## Dev Notes

- **Milestone data model:** Milestones are defined within pathways and stored in Dexie. The `requirement` object uses a polymorphic `type` field:
  - `count`: simple count of items (modules completed, supervised procedures).
  - `hours`: sum of time-based entries.
  - `streak_days`: consecutive days meeting a condition.
  - `all_green`: all specified procedures must be in green (active) competency status.
- **Progress calculation is local-first:** All progress data is computed from local Dexie tables (module completions, competency records, supervised procedures, mentorship data). This ensures the dashboard works fully offline.
- **Certificate PDF generation is offline-capable:** Using `jspdf` or similar client-side library avoids any server dependency for certificate creation. The PDF is stored as a Blob in Dexie.
- **QR code verification:** The QR code contains a compact JSON payload (not a URL) that can be verified offline by any Lab-Lite instance with the Hub's public key. The verification code is a UUID that maps to a record in the Hub's certificate registry.
- **No patient data:** Certificate records contain only technician identity, milestone names, and timestamps. No sample IDs, patient refs, or clinical data.
- **Jurisdiction flexibility:** Pathways are optional and configurable. In jurisdictions without formal certification, the system can use internal milestones defined by the facility or district.

### Project Structure Notes

New files:
- `apps/lab-lite/src/lib/certification-types.ts`
- `apps/lab-lite/src/lib/supervised-procedure-types.ts`
- `apps/lab-lite/src/lib/certification-engine.ts`
- `apps/lab-lite/src/lib/certificate-generator.ts`
- `apps/lab-lite/src/lib/certification-sync.ts`
- `apps/lab-lite/src/components/certification/CertificationDashboard.tsx`
- `apps/lab-lite/src/components/certification/LogSupervisedProcedure.tsx`
- `apps/lab-lite/src/components/certification/CertificateViewer.tsx`
- `apps/lab-lite/src/app/[locale]/certification/page.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with certification tables)
- `apps/lab-lite/src/components/AppSidebar.tsx` (add certification link)
- `apps/lab-lite/src/i18n/locales/en.json` (certification translation keys)

## References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 46, Story 46.6
- Module completions: Story 46.2 (source for modules milestone)
- Competency data: Story 46.3 (source for competency milestone)
- Mentorship activity: Story 46.5 (source for mentorship milestone)
- QR code patterns: `packages/crypto/src/` (existing QR signing patterns for prescription QR codes)
- CLAUDE.md: QR codes contain no raw PHI
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`

## Dev Agent Record

### Implementation Notes

- **Dexie v25:** Added 4 new tables (`certification_pathways`, `technician_progress`, `digital_certificates`, `supervised_procedures`). Uses additive version pattern consistent with the rest of `db.ts`.
- **Story 46.3 dependency:** `procedure_competencies` table does not yet exist (Story 46.3 not implemented). The competency milestone calculator gracefully returns 0 with a `(db as any)` runtime table-existence check.
- **PDF + QR generation:** `jspdf` and `qrcode` npm packages installed. Both are pure-JS and work fully offline. QR payload is compact JSON `{ certId, techId, milestone, issuedAt, verificationCode }` — no PHI per CLAUDE.md.
- **`CheckCircle` icon:** Lucide-react uses `CircleCheck` (not `CheckCircle`). Added `CircleCheck` to `packages/ui-kit/src/icons.ts`; components use `CircleCheck` throughout.
- **uuid pre-existing issue:** All uuid-using files in lab-lite lack type declarations (pre-existing across 10+ files). My files follow the same pattern without adding new risk.
- **Sync strategy:** `runCertificationSync()` in `certification-sync.ts` pulls pathway definitions and pushes progress + certificate metadata (never PDF blob) to Hub. Called from the existing sync cycle.

### Completion Notes

All 9 tasks complete. 22 tests pass (13 unit + 9 component including RTL). No regressions introduced (217 pre-existing failures unchanged, down from 267 on baseline).

**AC verification:**
1. ✅ Pathway dashboard shows all 5 milestone categories with progress bars
2. ✅ Certificate generated automatically on milestone completion (jsPDF + QR)
3. ✅ Visible in certification page; exportable via PDF download + verification code copy
4. ✅ All components use logical CSS, `DirectionalIcon`, RTL-tested
5. ✅ Certificate records contain technicianId + milestone names + timestamps only — no PHI

### File List

New files:
- `apps/lab-lite/src/lib/certification-types.ts`
- `apps/lab-lite/src/lib/supervised-procedure-types.ts`
- `apps/lab-lite/src/lib/certification-engine.ts`
- `apps/lab-lite/src/lib/certificate-generator.ts`
- `apps/lab-lite/src/lib/certification-sync.ts`
- `apps/lab-lite/src/components/certification/CertificationDashboard.tsx`
- `apps/lab-lite/src/components/certification/LogSupervisedProcedure.tsx`
- `apps/lab-lite/src/components/certification/CertificateViewer.tsx`
- `apps/lab-lite/src/app/[locale]/certification/page.tsx`
- `apps/lab-lite/src/__tests__/certification-engine.test.ts`
- `apps/lab-lite/src/__tests__/certification-components.test.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (added v25 with 4 certification tables)
- `apps/lab-lite/src/components/AppSidebar.tsx` (added certification nav item + Award icon import)
- `apps/lab-lite/messages/en.json` (sidebar.certification key + full certification namespace)
- `apps/lab-lite/messages/ar.json` (same)
- `apps/lab-lite/messages/prs.json` (same)
- `apps/lab-lite/messages/ps.json` (same)
- `packages/ui-kit/src/icons.ts` (added CircleCheck export)
- `apps/lab-lite/package.json` (added jspdf, qrcode, @types/qrcode)

### Change Log

- 2026-06-01: Story 46.6 — Certification Pathway Tracker implemented. Dexie v25, progress engine, PDF certificate generator, supervisor procedure logging, sync module, dashboard UI, 4-locale i18n. 22 new tests.
