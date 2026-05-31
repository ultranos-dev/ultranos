# Story 46.6: Certification Pathway Tracker

Status: ready-for-dev

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

- [ ] **Task 1: Certification Data Model & Dexie Schema** (AC: 1, 2)
  - [ ] Create `apps/lab-lite/src/lib/certification-types.ts` with:
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
  - [ ] Define `CertificationMilestone` type:
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
  - [ ] Define `TechnicianProgress` type:
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
  - [ ] Define `DigitalCertificate` type:
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
  - [ ] Update `apps/lab-lite/src/lib/db.ts` — add Dexie tables:
    - `certification_pathways` table: `&id, jurisdictionCode, version`
    - `technician_progress` table: `&id, technicianId, pathwayId, [technicianId+pathwayId]`
    - `digital_certificates` table: `&id, technicianId, pathwayId, issuedAt, syncStatus`

- [ ] **Task 2: Progress Calculation Engine** (AC: 1)
  - [ ] Create `apps/lab-lite/src/lib/certification-engine.ts`.
  - [ ] Implement `calculateProgress(technicianId: string, pathway: CertificationPathway): Promise<TechnicianProgress>`:
    - **Modules milestone:** Count completed modules from `module_completions` table (Story 46.2) where `assessmentPassed: true`. Filter by `procedureFilter` LOINC codes if specified.
    - **Competency milestone:** Query `procedure_competencies` table (Story 46.3). For `all_green` type: check if all filtered procedures have `status: 'active'`. For `streak_days` type: calculate consecutive days with all-green status.
    - **Supervised procedures milestone:** Count from a `supervised_procedures` Dexie table (logged by supervisor confirmation).
    - **Education hours milestone:** Sum `durationMinutes / 60` from completed modules and any manually logged education entries.
    - **Mentorship milestone:** Count check-ins and journal entries from mentorship tables (Story 46.5).
  - [ ] Calculate `overallPercent` as weighted average across all milestones.
  - [ ] Detect newly completed milestones and trigger certificate generation.

- [ ] **Task 3: Supervised Procedure Logging** (AC: 1)
  - [ ] Create `apps/lab-lite/src/lib/supervised-procedure-types.ts`:
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
  - [ ] Add Dexie table: `supervised_procedures`: `&id, technicianId, procedureRef, performedAt, syncStatus`
  - [ ] Create `apps/lab-lite/src/components/certification/LogSupervisedProcedure.tsx` — form for supervisor to log a supervised procedure for a tech.

- [ ] **Task 4: Certification Pathway Dashboard** (AC: 1, 3, 4)
  - [ ] Create `apps/lab-lite/src/components/certification/CertificationDashboard.tsx`.
  - [ ] Display active pathway with milestone list, each showing:
    - Milestone name and description.
    - Progress bar: `currentValue / targetValue` with percentage.
    - Completion badge when met.
  - [ ] Overall progress section: percentage complete, current level, next milestone to achieve.
  - [ ] Historical section: completed milestones with dates and linked certificates.
  - [ ] Ensure RTL layout compatibility.

- [ ] **Task 5: Digital Certificate Generation** (AC: 2, 3)
  - [ ] Create `apps/lab-lite/src/lib/certificate-generator.ts`.
  - [ ] Generate a PDF certificate containing:
    - Technician name and ID.
    - Milestone/pathway name and description.
    - Issue date.
    - Verification QR code containing: `{ certId, techId, milestone, issuedAt, verificationCode }` — no PHI.
    - Ultranos branding and formatting.
  - [ ] Use a client-side PDF library (e.g., `jspdf` or `@react-pdf/renderer`) for offline generation.
  - [ ] QR code generated using a lightweight QR library (e.g., `qrcode`).
  - [ ] Store generated PDF blob in the `digital_certificates` Dexie table.
  - [ ] Sync certificate metadata (not PDF blob) to Hub for verification registry.

- [ ] **Task 6: Export & Verification** (AC: 3)
  - [ ] Create `apps/lab-lite/src/components/certification/CertificateViewer.tsx`.
  - [ ] Display certificate preview with download button (saves PDF to device).
  - [ ] Share/export functionality: download PDF, copy verification link.
  - [ ] Hub provides a public verification endpoint (deferred to Hub API) — QR code links to `https://[hub-url]/verify/[verificationCode]`.

- [ ] **Task 7: Pathway Sync from Hub** (AC: 1)
  - [ ] Create `apps/lab-lite/src/lib/certification-sync.ts`.
  - [ ] Implement `syncCertificationPathways()`:
    - Pull pathway definitions from Hub (pathways are Hub-managed).
    - Push progress and certificate records to Hub.
  - [ ] Integrate into the existing sync cycle.

- [ ] **Task 8: Page Route & Navigation** (AC: 4)
  - [ ] Create `apps/lab-lite/src/app/[locale]/certification/page.tsx`.
  - [ ] Add certification link to `AppSidebar.tsx` navigation.
  - [ ] Add all translation keys.
  - [ ] Ensure RTL layout compatibility.

- [ ] **Task 9: Tests** (AC: 1-5)
  - [ ] Unit tests for progress calculation: each milestone category, overall percentage, edge cases (zero progress, full completion).
  - [ ] Unit tests for milestone completion detection: newly completed, already completed, partial.
  - [ ] Unit tests for certificate generation: PDF creation, QR code content, verification code uniqueness.
  - [ ] Component tests for CertificationDashboard: progress bars, completion badges, empty state.
  - [ ] Component tests for CertificateViewer: download action, preview rendering.
  - [ ] RTL snapshot tests.

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
