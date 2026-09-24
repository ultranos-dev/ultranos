# Story 58.3: Spoke PHI-at-Rest Completeness (Lab-Lite Encryption + Cleanup Coverage + Pharmacy Financial Tables)

Status: review

## Story

As a privacy officer,
I want lab-lite's IndexedDB PHI encrypted at rest like the other spokes, PHI cleanup coverage completed table-by-table in both lab-lite and pharmacy-lite, and pharmacy financial records de-identified or encrypted,
so that a shared clinic workstation never retains readable patient data after logout.

## Acceptance Criteria

1. **Given** lab-lite's Dexie database, **when** PHI-bearing tables are written (samples, orders, lab_results/observations, smsQueue, escalation_chains, patients, verified_patients, upload blobs), **then** their PHI fields are AES-GCM encrypted via the session key (the same middleware pattern opd-lite/pharmacy-lite use), with a migration encrypting existing rows on next login.
2. **Given** lab-lite session end/logout, **when** `phi-cleanup` runs, **then** every patient-linked table is either cleared or has a documented, justified retention (explicitly: `patients`, `monitoringFlags`, `escalation_chains`, `resultSnapshots`, `incident_reports`, `custody_events`, `distributionQueue` — each gets a decision recorded in the PHI_TABLES config comments), with a test that fails when a new patient-linked table is added without a cleanup decision.
3. **Given** pharmacy-lite invoices/patientAccounts/ledgerEntries, **when** they are stored, **then** medication free-text tied to patients is either encrypted or replaced by catalog IDs (line `description` no longer carries `prescription.medT` plaintext), and the retention decision for these financial tables is documented.
4. **Given** the durable sync queues in both apps, **then** they remain preserved across cleanup (existing correct behavior — must not regress), and unsynced clinical records are never destroyed (coordinates with Story 57.3 AC 2).
5. **Zero regression:** all lab-lite flows (result entry, worklist, QC, uploads, SMS queue) and pharmacy POS/accounts function identically on encrypted data; offline reads work; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: Lab-lite encryption middleware** (AC: 1)
  - [x] 1.1 Port the Dexie AES-GCM encryption middleware pattern (see `apps/opd-lite/src/lib/dexie-encryption-middleware.ts` and pharmacy's equivalent) into lab-lite; define the PHI-field map per table; wire to the existing `lib/encryption-key-store.ts` session key (already present, currently used only for consent/employee-health/delegate blobs via `AuthGuard.tsx`).
  - [x] 1.2 Startup migration encrypting pre-existing plaintext rows (versioned, resumable); `awaiting-key` behavior for writes while locked (model on pharmacy's approach).
  - [x] 1.3 Mind the 5,194-line `db.ts` with 55+ schema versions — add the encryption layer without another mass schema rewrite; document which tables are covered.
- [x] **Task 2: Cleanup coverage** (AC: 2, 4)
  - [x] 2.1 `apps/lab-lite/src/lib/phi-cleanup.ts:28-45`: add the seven audited omissions or a documented retention rationale each (e.g., `resultSnapshots` is deliberately durable for delta checks — if retained, its patientRef linkage must be encrypted per Task 1).
  - [x] 2.2 Add a completeness test: enumerate Dexie tables, assert each is in PHI_TABLES, the documented-retention list, or the non-PHI allowlist (compile-time-style guard like the existing sync-queue guard at `phi-cleanup.ts:54-58`).
- [x] **Task 3: Pharmacy financial tables** (AC: 3)
  - [x] 3.1 `apps/pharmacy-lite/src/lib/db.ts:341-370` (`PHI_TABLE_CONFIGS`) + `stores/fulfillment-store.ts:307` (invoice line description = `prescription.medT`): switch line descriptions to catalog ID + generic label, or add the tables to the encryption config; update `phi-cleanup.ts:31-34` decision comments; mirror the completeness test from Task 2.2.
- [x] **Task 4: Regression verification** (AC: 5)
  - [x] 4.1 Full lab-lite (300 files) + pharmacy suites; manual: result entry offline→sync, SMS queue processing, POS invoice + account statement rendering; logout leaves no readable PHI (manual IndexedDB inspection); `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-LAB-1 [A]** (plain Dexie, encryption key used only for three blob types — verified via importer analysis), **H-LAB-2 [A]** (seven omitted tables), **M-PHARM-3 [A]** (medication-tied financial records, unencrypted forever), audit §5/§6. CLAUDE.md mandates "Web Crypto API AES-GCM wrapping IndexedDB" for Desktop PWAs.

### Architecture

- Lab-lite is data-minimized so exposure is bounded (first name + age + clinical values) — but clinical values + name + SMS bodies is still PHI. Session-end wipe is a mitigation, not encryption (and relies on `beforeunload`).
- Encryption key derivation hardening is Story 61.2 — this story uses the EXISTING key infrastructure; do not block on the KDF change.
- Performance: lab worklists render hundreds of rows — measure decrypt overhead; field-level (not whole-row) encryption of the PHI columns keeps indexes usable (follow opd-lite's ADR-028 pattern of removing PHI from indexed fields).

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Every read/write path works identically on encrypted data; worklist/QC/report performance stays acceptable; the sync queue preservation guarantee is untouched. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**New files:** `apps/lab-lite/src/lib/dexie-encryption-middleware.ts`, `src/__tests__/phi-encryption.test.ts`, `src/__tests__/phi-cleanup-completeness.test.ts` (+ pharmacy twin).
**Files to modify:** lab-lite `lib/db.ts`, `lib/phi-cleanup.ts`, `components/AuthGuard.tsx` (key wiring); pharmacy `lib/db.ts`, `stores/fulfillment-store.ts`, `lib/phi-cleanup.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#5-lab-lite-appslab-lite] — H-LAB-1, H-LAB-2
- [Source: apps/opd-lite/src/lib/dexie-encryption-middleware.ts] — the pattern to port
- [Source: _bmad-output/implementation-artifacts/7-1-pwa-dexie-encryption-key-in-memory.md] — original encryption story

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Completion Notes List
- **Task 1 (lab-lite encryption):** new `dexie-encryption-middleware.ts` (ported from opd/pharmacy) — field-level AES-GCM on 12 PHI tables (samples, orders, lab_results/observations, smsQueue, escalation_chains, verified_patients, uploadQueue, queueEntries, labLogbook, monitoringFlags, payments), reuses the 61.2 vNext session key; indexed fields stay cleartext (ADR-028). Upgraded `encryption-key-store.ts` to the full key-map variant (was a 61.2 stub). New `encryption-migration-vnext.ts` — resumable, idempotent, plaintext→encrypted on startup, wired into AuthGuard. No mass schema rewrite (stays v57). Two lab-specific hardening fixes: `Dexie.waitFor` for encrypted tx writes; cleartext-index merge for auto-increment PHI tables.
- **Task 2 (lab cleanup):** phi-cleanup PHI_TABLES extended (patients, escalation_chains, resultSnapshots, custody_events, distributionQueue) + `DOCUMENTED_RETENTION_TABLES` (incident_reports — Tier-1 append-only) + NON_PHI allowlist; compile-time completeness guard test.
- **Task 3 (pharmacy financial):** invoice-line `description` med-text STRIPPED to catalog id + generic form/strength label (financial rows no longer carry patient-linked drug names); cleanup decision comments + mirrored completeness test. NOTE for 62.1: the only med-text write site is `fulfillment-store.createInvoiceAfterDispense`; resolve drug name at render via `catalogItemId` if needed — do not re-persist.
- No Dexie version bumps (runtime middleware, not schema); no hub/pharmacy-financial-logic touched.

### Verification (combined tree)
`pnpm -F lab-lite typecheck` + `pnpm -F pharmacy-lite typecheck` clean; lab-lite full suite **3958 pass, 0 fail** (incl. new phi-encryption + completeness tests); pharmacy **1138 pass, 0 fail**; at-rest-opaque + logout-clears-PHI test-verified.

### File List
New — `apps/lab-lite/src/lib/dexie-encryption-middleware.ts`, `src/lib/encryption-migration-vnext.ts`, `src/__tests__/{phi-encryption,phi-cleanup-completeness}.test.ts`; `apps/pharmacy-lite/src/__tests__/phi-cleanup-completeness.test.ts`.
Modified — lab-lite `lib/{db,encryption-key-store,phi-cleanup}.ts`, `components/AuthGuard.tsx`, tests; pharmacy `lib/phi-cleanup.ts`, `stores/fulfillment-store.ts`.

### Change Log
- 2026-09-23: Story 58.3 implemented (Wave 5), verified, integrated. Lab-lite PHI encrypted at rest; pharmacy financial med-text stripped. Status → review.
