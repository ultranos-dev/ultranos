# Story 2.2: SOAP Note Entry (Subjective & Objective)

Status: done

## Story

As a clinician,
I want to record patient complaints and findings,
so that I have a clinical record of the visit that is durable and follows local sync rules.

## Acceptance Criteria

1. [x] Rich text or structured textarea inputs for "Subjective" and "Objective" sections are provided.
2. [x] Every keystroke (debounced 300ms) creates an entry in the local append-only ledger.
3. [x] An autosave indicator (Cloud icon with checkmark) confirms durability (UX-DR pulse).
4. [x] Content is mapped to FHIR `ClinicalImpression` resources.
5. [x] UI supports RTL mirroring for Arabic and Dari scripts.

## Tasks / Subtasks

- [x] **Task 1: Scaffold SOAP UI Components** (AC: 1, 5)
  - [x] Create `SOAPNoteEntry` component in `apps/opd-lite-pwa/src/components/clinical/`.
  - [x] Implement textareas for Subjective and Objective inputs.
  - [x] Apply `@ultranos/ui-kit` typography and spacing tokens.
  - [x] Ensure `dir="rtl"` is applied based on the global language context.
- [x] **Task 2: Connect to Zustand State** (AC: 1, 2)
  - [x] Bind component state to the `useSoapNoteStore` Zustand store.
  - [x] Update store actions to handle partial note updates (setSubjective, setObjective).
- [x] **Task 3: Implement Debounced Persistence** (AC: 2, 3)
  - [x] Create a `useAutosave` hook that triggers every 300ms of inactivity.
  - [x] Write the payload to the local Dexie.js `soapLedger` table with an HLC timestamp.
  - [x] Implement the `AutosaveIndicator` component with the UX-DR pulse effect.
- [x] **Task 4: FHIR Mapping & Sync Preparation** (AC: 4)
  - [x] Transform the flat note state into a FHIR `ClinicalImpression` resource structure.
  - [x] Ensure the resource is linked to the current active `Encounter` ID.

## Dev Notes

- **Architecture:** Follow the "Append-only Sync Ledger" pattern (FR15). Do not overwrite previous notes; create new ledger entries for each save state to allow conflict resolution.
- **Privacy:** In the PWA, ensure the Dexie key is RAM-only. Do not log clinical note content to the browser console.
- **Components:** Use the `PrimaryAction` button patterns for any manual save triggers if added.

### Project Structure Notes

- Components: `apps/opd-lite-pwa/src/components/clinical/*`
- Store: `apps/opd-lite-pwa/src/store/useEncounterStore.ts`
- Types: `@ultranos/shared-types` (ClinicalImpression schema)

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Section-Sync-Engine)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR3)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed append-only test ordering by using `orderBy('hlcTimestamp')` instead of `toArray()` to ensure deterministic HLC-based ordering.

### Completion Notes List

- **Task 1:** Created `SOAPNoteEntry` component with labeled textareas for Subjective and Objective. Uses Tailwind classes from ui-kit tokens. RTL support inherited from parent `dir` attribute via standard HTML inheritance.
- **Task 2:** Created `useSoapNoteStore` Zustand store (Immer middleware) with `setSubjective`, `setObjective`, `initForEncounter`, `persistToLedger`, `loadFromLedger`, and `clearPhiState`. PHI cleanup on `beforeunload` and `visibilitychange`.
- **Task 3:** Created `useAutosave` hook with 300ms debounce. Created `AutosaveIndicator` component with cloud/checkmark SVG icons and pulse animation. Integrated into encounter dashboard — every text change triggers debounced persist to `soapLedger` Dexie table.
- **Task 4:** Created FHIR `ClinicalImpressionNoteSchema` Zod schema in `@ultranos/shared-types`. Created `mapSoapToClinicalImpression` mapper that produces valid FHIR R4 ClinicalImpression resources with encounter/patient references, HLC timestamps, and `_ultranos` extensions.
- **Integration:** Wired SOAP note entry into `EncounterDashboard` — notes section appears during active encounters, autosaves with indicator, and loads persisted notes on page refresh.
- **Tests:** 37 new tests across 5 test files. All 117 tests pass (0 regressions). TypeScript typecheck clean.

### File List

- `apps/opd-lite-pwa/src/components/clinical/soap-note-entry.tsx` (new)
- `apps/opd-lite-pwa/src/components/clinical/autosave-indicator.tsx` (new)
- `apps/opd-lite-pwa/src/stores/soap-note-store.ts` (new)
- `apps/opd-lite-pwa/src/lib/use-autosave.ts` (new)
- `apps/opd-lite-pwa/src/lib/fhir-mappers.ts` (new)
- `apps/opd-lite-pwa/src/lib/db.ts` (modified — added `soapLedger` table v3)
- `apps/opd-lite-pwa/src/components/encounter-dashboard.tsx` (modified — integrated SOAP note)
- `packages/shared-types/src/fhir/clinical-impression.schema.ts` (new)
- `packages/shared-types/src/index.ts` (modified — added clinical-impression export)
- `apps/opd-lite-pwa/src/__tests__/soap-note-entry.test.tsx` (new)
- `apps/opd-lite-pwa/src/__tests__/autosave-indicator.test.tsx` (new)
- `apps/opd-lite-pwa/src/__tests__/soap-note-store.test.ts` (new)
- `apps/opd-lite-pwa/src/__tests__/use-autosave.test.ts` (new)
- `apps/opd-lite-pwa/src/__tests__/fhir-mappers.test.ts` (new)

### Review Findings

- [x] [Review][Defer] **Unencrypted SOAP notes in IndexedDB** — Cross-cutting concern consistent with D10/D24. All Dexie tables (patients, encounters, soapLedger) need encryption via `@ultranos/crypto`. Deferred to dedicated encryption story. [soap-note-store.ts, db.ts]
- [x] [Review][Patch] **`visibilitychange` handler destroys unsaved clinical notes** — Removed `visibilitychange` listener. `beforeunload` handles tab close per CLAUDE.md policy. FIXED.
- [x] [Review][Defer] **No audit logging on PHI access** — `AuditLogger` requires SupabaseClient + Node.js `crypto` (server-side only). PWA audit event queuing infrastructure doesn't exist yet. Consistent with D9, D23 — deferred to story 6-2. [soap-note-store.ts]
- [x] [Review][Patch] **Silent error swallowing in `persistToLedger`** — Added `'error'` status to `AutosaveStatus`. `AutosaveIndicator` now shows red warning on save failure. FIXED.
- [x] [Review][Patch] **Duplicate HLC clock instances with diverging state** — Extracted shared HLC singleton to `lib/hlc.ts`. Both `soap-note-store.ts` and `fhir-mappers.ts` now import from it. Node ID is RAM-only. FIXED.
- [x] [Review][Patch] **`loadFromLedger` race with `initForEncounter`** — Added encounter ID guard in `loadFromLedger`: discards stale results if encounter changed during async load. FIXED.
- [x] [Review][Patch] **Concurrent `persistToLedger` calls not serialized** — Added in-flight guard: skips if `autosaveStatus === 'saving'`. FIXED.
- [x] [Review][Patch] **No input length limits on SOAP text fields** — Added `maxLength={10000}` to textareas and `.max(10_000)` to Zod schema. FIXED.
- [x] [Review][Patch] **RTL: textareas missing `dir="auto"` for mixed-direction input** — Added `dir="auto"` to both textareas for correct bidirectional text rendering. FIXED.
- [x] [Review][Defer] **No sync status/tier field on ledger entries** — `SoapLedgerEntry` has no field for sync tier classification (Tier 2 per CLAUDE.md). Sync engine integration is a separate concern. [db.ts] — deferred, not in scope for story 2.2
- [x] [Review][Defer] **Placeholder text not localizable** — Placeholders are English-only. i18n infrastructure not yet built. [soap-note-entry.tsx] — deferred, i18n is cross-cutting
- [x] [Review][Defer] **`PRACTITIONER_REF` hardcoded placeholder** — Auth session integration not yet available. Acknowledged with inline comment. [encounter-dashboard.tsx:34] — deferred, pre-existing
- [x] [Review][Defer] **FHIR ClinicalImpression status never transitions to `completed`** — No code path finalizes the SOAP note FHIR resource on encounter end. [fhir-mappers.ts] — deferred, out of scope for S&O entry
- [x] [Review][Defer] **Allergy section missing from encounter dashboard** — CLAUDE.md requires allergies first, in red, never collapsed. [encounter-dashboard.tsx] — deferred, pre-existing
- [x] [Review][Defer] **`formatAge` negative for future birth dates** — No guard for data entry errors. [encounter-dashboard.tsx:18-31] — deferred, pre-existing
- [x] [Review][Defer] **Dexie version upgrades repeat all store definitions** — Maintenance-prone pattern. [db.ts] — deferred, pre-existing

## Change Log

- 2026-04-28: Implemented SOAP Note Entry (Subjective & Objective) — all 4 tasks complete, 37 new tests, FHIR ClinicalImpression schema added, integrated into encounter dashboard with debounced autosave and append-only ledger.
- 2026-04-28: Code review — 7 patches applied (visibilitychange removed, error state added, shared HLC singleton, race condition guard, in-flight guard, input limits, RTL dir=auto). 9 items deferred. 120 tests pass, typecheck clean.
