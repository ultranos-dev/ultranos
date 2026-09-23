# Story 59.1: Lab-Lite Dead Endpoint Repair (Registration, Quality Sync, Orphaned Feature Calls)

Status: ready-for-dev

## Story

As a lab technician,
I want every lab-lite feature that calls the Hub to actually reach a real, working endpoint — patient registration/search, quality-profile sync, result authorization, escalations, and the rest of the audited orphaned calls,
so that features stop silently failing at runtime while appearing to work.

## Acceptance Criteria

1. **Given** `/patients/register` and patient search in lab-lite, **when** used online, **then** they call REAL hub procedures with lab-tier-compliant responses (first name + age + opaque ref on search results) — no more 404s on `lab.searchPatients`/`lab.checkDuplicates`/`lab.createPatient`.
2. **Given** `lab.syncQualityProfile` pushes, **when** they execute, **then** they carry the Authorization header (the shared `makeTrpcProcedure` gains token threading) and succeed for an authenticated tech.
3. **Given** each remaining orphaned call (`lab.authorizeResult`, `lab.createNotification` ×2, `lab.escalateAiResult`, `lab.reportQueueEvent`, `peerNetwork.*`, `ai-provenance.sync`), **then** each is dispositioned one of three ways with the decision recorded: (a) hub procedure implemented; (b) client call re-pointed to an existing equivalent; (c) the client feature is explicitly feature-flagged off/local-only with its silent `catch {}` replaced by honest local-only behavior. **Clinically-relevant flows (result authorization sign-off, AI escalation) must be (a) or (b) — not silently disabled.**
4. **Given** any of these repaired calls fails at runtime, **then** the failure is surfaced (sync-status UI or user-visible error) — no silent `catch {}` remains on the repaired paths.
5. **Zero regression:** all currently-working lab-lite flows (order pull, ack, result submit, uploads, specimen sync) are untouched and pass their tests; local-only features that were "working" locally keep their local behavior; `pnpm typecheck` passes; no feature or functionality is removed or degraded (flag-off dispositions require user sign-off per AC 3).

## Tasks / Subtasks

- [ ] **Task 1: Registration & search** (AC: 1)
  - [ ] 1.1 Decide endpoint shape (recommend: new lab-scoped hub procedures `lab.registerPatient`/`lab.searchPatients` wrapping `patient.create`/`patient.checkDuplicates` with tier-compliant output + blind-ref issuance, consent capture, audit; alternative: authorize LAB_TECH on `patient.*` with response shaping — weigh against Rule #7).
  - [ ] 1.2 Re-point `apps/lab-lite/src/lib/trpc.ts:499,561,596`; fix `usePatientSearch.ts:79`'s silent 404 catch; registration UI error handling (`PatientRegistrationForm.tsx:151-173`).
- [ ] **Task 2: Quality sync auth** (AC: 2)
  - [ ] 2.1 `lib/trpc.ts:34-53` `makeTrpcProcedure`: thread the Supabase access token like every other helper in the file; verify `lib/quality-sync.ts:15,91` succeeds end-to-end.
- [ ] **Task 3: Orphan disposition** (AC: 3, 4)
  - [ ] 3.1 `lab.authorizeResult` + `lab.createNotification` (`authorization-sync.ts:42,112`, `result-release.ts:87`): implement hub-side (authorization sign-off is a real clinical workflow — status transition + audit + notification dispatch via the existing notification service `lab.ts:71-87` pattern).
  - [ ] 3.2 `lab.escalateAiResult` (`confidence-escalation.ts:77`): implement hub-side or route through the existing `LAB_RESULT_ESCALATION` notification path (`notification-escalation.ts`).
  - [ ] 3.3 `lab.reportQueueEvent` (`queue-audit.ts:25`): implement minimal hub sink or convert to local-only audit with the client's Dexie audit ledger — record decision.
  - [ ] 3.4 `peerNetwork.*` (`peer-network-sync.ts:39-149`) and `ai-provenance.sync` (`provenance-drain-worker.ts:209`): feature-flag off the sync layer (features stay local-only) unless the user opts to build the hub routers — present as a decision point.
  - [ ] 3.5 Replace silent catches on all repaired paths with surfaced failures (coordinate with Story 60.4's sync-status UI).
- [ ] **Task 4: Tests + regression verification** (AC: 5)
  - [ ] 4.1 Integration tests per repaired call (success + failure surfacing); registration e2e online.
  - [ ] 4.2 Full lab-lite suite (300 files) passes; order/result pipeline manually verified; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **C-SYS-5 [V]** / **C-LAB-2 [V]** / **H-LAB-4 [A]** (audit §2, §5, §9 Orphaned-UI table): 10+ verified dead calls; registration dead online; quality sync 401s forever; four historical drift incidents self-documented in `trpc.ts:353,399`. The structural fix (contract CI) is Story 59.2 — land it in the same sprint so this story's repairs are locked in.

### Architecture

- New lab registration endpoints must respect Rule #7 tiers and the blind-ref R1 convention (`hub lab.ts` `lib/patient-ref.ts` handling) — the lab must never receive the real patient UUID at registration either (issue the blind ref in the response).
- Offline registration queueing is Story 60.3 — this story fixes the ONLINE path only; keep the seams compatible.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. The working order/result/upload pipeline is untouched. Local-only features keep local behavior; nothing a technician can do today becomes impossible without explicit user sign-off on a flag-off disposition. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** lab-lite `lib/trpc.ts`, `hooks/usePatientSearch.ts`, `PatientRegistrationForm.tsx`, `authorization-sync.ts`, `result-release.ts`, `confidence-escalation.ts`, `queue-audit.ts`, `peer-network-sync.ts`, `provenance-drain-worker.ts`; hub `lab.ts` (+ possibly new procedures), `_app.ts`.
**New files:** `apps/hub-api/src/__tests__/lab-registration.test.ts`, `apps/lab-lite/src/__tests__/endpoint-repair.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#2-systemic-critical-findings] — C-SYS-5 table
- [Source: apps/lab-lite/src/lib/trpc.ts:353,399] — self-documented prior drift incidents
- [Source: apps/hub-api/src/trpc/routers/patient.ts:340,438] — checkDuplicates/create to wrap

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
