# Story 61.3: Atomic Multi-Write Operations (Merge, Result Submit, Dispense, Lab Register)

Status: ready-for-dev

## Story

As a data-integrity owner,
I want the four audited non-transactional multi-write flows converted to atomic Postgres RPCs — patient merge/unmerge, lab result analyte replacement, dispense recording, and lab registration,
so that a mid-flow crash can never leave PHI state half-mutated, results deleted-but-not-reinserted, or a merge without its reversal record.

## Acceptance Criteria

1. **Given** a patient merge (or unmerge), **when** any step fails, **then** the entire operation rolls back — survivor update, duplicate deactivation, `merge_audits` insert, and `duplicate_reviews` status change are one transaction; the 72-hour undo promise is always backed by a reversal record.
2. **Given** `lab.submitResult` re-submission, **when** analytes are replaced, **then** delete+insert happens atomically — a crash can no longer lose a report's observations (`lab.ts:1205-1223`).
3. **Given** `medication.recordDispense`, **then** dispense insert + prescription status update + `dispense_reviews` row (+ MedicationStatement creation per Story 60.4 coordination) commit together; idempotency behavior is preserved.
4. **Given** `lab.register`, **then** its multi-insert (currently compensating deletes, `lab.ts:394-408`) is atomic; the practitioner-id vs auth-user-id mismatch family (`ctx.user.sub` inserted where `practitioners.id` is expected; `getMyRole`/`getMyMentorship`/`getMyCertifications` filtering by sub) is fixed with an integration test using a real seeded practitioner.
5. **Given** all new RPCs, **then** they are applied via Supabase MCP migrations, emit the same audit events as today, and enforce the same authorization as their tRPC callers (RPCs are SECURITY DEFINER-audited or invoked with equivalent checks — no privilege widening).
6. **Zero regression:** the happy-path behavior, response shapes, audit emissions, and idempotency semantics of all four flows are identical; the admin 72h-undo UX is unchanged; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: Merge/unmerge RPC** (AC: 1) — port `patient-admin.ts:196-254` (merge) and `:350-392` (unmerge) into `merge_patient_atomic`/`unmerge_patient_atomic` RPCs (model: `create_patient_with_consent`, `update_lab_role_atomic`); Tier-1 append-only respect verified in the merge semantics; failure-injection tests.
- [ ] **Task 2: submitResult analytes** (AC: 2) — `replace_report_observations` RPC (delete+insert in one tx); preserve upsert/idempotent-resubmit behavior.
- [ ] **Task 3: recordDispense** (AC: 3) — `record_dispense_atomic` RPC; keep `ALREADY_DISPENSED` idempotency and server-override of `pharmacistRef`; coordinate MedicationStatement inclusion with Story 60.4 (include here if both in-flight).
- [ ] **Task 4: lab.register + id mismatch** (AC: 4) — atomic RPC; fix `practitionerId: ctx.user.sub` (`lab.ts:389`) to resolve `practitioners.id` via `auth_user_id` per the `labRestrictedProcedure` join contract (`rbac.ts:148-159`); fix the three `getMy*` filters; seeded-user integration test proving self-service reads return data.
- [ ] **Task 5: Tests + regression verification** (AC: 5, 6) — failure-injection per RPC (kill mid-tx → clean rollback); response-shape parity fixtures; full hub suite; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-ADM-2 [A]** (non-transactional merge voids the 72h-undo promise), **M-HUB-4 [A]** (compensating deletes; submitResult crash-loss window), **M-HUB-7 [A]** (practitioner-id mismatch — self-registration and self-service reads likely silently broken), audit §3/§7.

### Architecture

- The Supabase JS client cannot BEGIN/COMMIT — atomic RPCs are the established project pattern (`create_patient_with_consent` precedent). Use Supabase MCP `apply_migration` per project rules; never hand-edit migration files.
- Audit rows: emit AFTER commit success (or inside the tx if audit lives in the same DB — match the existing `create_patient_with_consent` choice for consistency).
- Load-bearing subtlety: merge must keep `duplicate_reviews`→MERGED transition inside the tx (audit workflow-9 confirmed same-table coherence — don't break it).

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. All four flows return identical shapes and side effects on success; only crash-consistency changes. Admin merge UX, lab registration UX, dispensing, and result re-submission behave identically. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** hub `patient-admin.ts`, `lab.ts`, `medication.ts` (RPC invocation swap); new Supabase migrations (MCP).
**New files:** `apps/hub-api/src/__tests__/atomic-operations.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#3-hub-api-appshub-api] — M-HUB-4, M-HUB-7
- [Source: docs/system-audit-2026-09-23.md#7-admin-portal-appsadmin-portal] — H-ADM-2
- [Source: hub RPCs create_patient_with_consent / update_lab_role_atomic] — the pattern to extend

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
