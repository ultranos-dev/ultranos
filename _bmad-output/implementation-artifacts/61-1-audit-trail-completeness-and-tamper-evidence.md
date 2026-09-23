# Story 61.1: Audit Trail Completeness & Tamper Evidence

Status: ready-for-dev

## Story

As a compliance officer,
I want Rule #6 ("audit every PHI access — no exceptions") to hold everywhere — pharmacy's missing audit emissions added, OPD's no-session drops buffered, the hash chain covering the full row, the chain verifier windowing correctly, audit metadata PHI-guarded by whitelist, and admin's fail-open/redaction gaps closed,
so that the audit ledger is complete, tamper-evident end-to-end, and PHI-free.

## Acceptance Criteria

1. **Given** pharmacy-lite patient registration, local patient search, and patient-account reads, **when** they touch PHI, **then** they emit audit events (closing the verified gaps against the 14-site `auditPhiAccess` inventory).
2. **Given** an OPD PHI read during the session-hydration window (no auth session yet), **then** the audit event is buffered locally and backfilled with the actor once the session hydrates — never silently dropped (`lib/audit.ts:59-62`).
3. **Given** a new audit row is written, **then** the chain hash (next chain version) covers a canonical hash of the FULL row — including `metadata`, `sessionId`, `deviceId`, `sourceIpHash`, `denialReason`, `orgId` — with legacy-version verification preserved for existing rows.
4. **Given** `verifyChain(newest:true)`, **then** the query windows by `chain_seq DESC` (not timestamp) — eliminating false "broken chain" results at window edges.
5. **Given** client audit metadata, **then** PHI protection is a WHITELIST schema (allowed keys + shapes) rather than the 28-name blocklist, with array recursion fixed; server-side `emit` validates metadata against the same schema; `medication.checkInteractions`' `medicationDisplay` metadata (M-HUB-8) is removed/coded.
6. **Given** admin-portal audit handling, **then** (a) the fail-open decision (PHI returned when audit emit fails, `patient-admin.ts:47-60` et al.) is made explicitly, documented, and implemented consistently (recommend fail-closed for the highest-privilege surface); (b) audit-viewer redaction happens SERVER-side, and the CSV export path applies it (it currently bypasses redaction entirely).
7. **Zero regression:** existing audit emission, chain verification of legacy rows, the audit viewer UI, and all pre-existing tests pass; audit-logger package gains its missing test coverage (currently 1 test file); `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: Pharmacy audit gaps** (AC: 1) — `patient-register.ts`, `patient-search.ts`, `PatientAccountsPage.tsx` reads → `auditPhiAccess`; tests asserting emission (CLAUDE.md testing rule).
- [ ] **Task 2: OPD no-session buffering** (AC: 2) — `apps/opd-lite/src/lib/audit.ts:59-62`: buffer with null actor + backfill on hydration; drains via the (now-wired, Story 59.3) audit drain.
- [ ] **Task 3: Chain vNext** (AC: 3, 4) — `packages/audit-logger/src/logger.ts:60-71` + new migration (follow migration 045's pattern via Supabase MCP): full-row canonical hash under a `chain_version` bump; `verifyChain` windows by `chain_seq` (`logger.ts:163-186`) and validates both versions across the boundary; concurrency test suite extended.
- [ ] **Task 4: Metadata whitelist** (AC: 5) — `packages/audit-logger/src/client.ts:20-48,90-103` → schema whitelist + array recursion; server `emit` validation; sweep existing emit call sites for newly-invalid metadata (fix at source — e.g., `medication.ts:1848-1856`).
- [ ] **Task 5: Admin decisions + redaction** (AC: 6) — decision point (fail-open vs fail-closed) presented per project rule, then implemented; server-side redaction endpoint shaping; `EventBrowser.tsx` CSV export (`:226-237` → `ExportButton.tsx`) uses the redacted server output.
- [ ] **Task 6: Package test debt + regression verification** (AC: 7) — tests for client guard, drain, dexie/sqlite adapters, verifyChain legacy path; full suites; chain verification against a seeded legacy+vNext dataset; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **M-PHARM-4 [A]**, **M-OPD-1 [A]**, **P-AUDIT-1 [V-cited] /2/3 [A]**, **M-ADM-1/2 [A]**, **M-HUB-8 [A]**, **P-AUDIT-15 (1-test-file coverage) [A]** — audit §4/§6/§7/§8.

### Architecture

- The chain write path (advisory-lock + `chain_seq`, migration 045) is verified good — extend, don't rewrite. Append-only DB triggers remain the second layer.
- Chain version bump must be backward-verifiable: `verifyChain` dispatches per-row on `chain_version`.
- Rule #1 applies to audit payloads themselves — the whitelist is the enforcement mechanism.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. All current audit emissions keep flowing; legacy chain rows still verify; the audit viewer and export keep working (with corrected redaction). All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `packages/audit-logger/src/{logger,client}.ts` + adapters, pharmacy lib files, opd `lib/audit.ts`, hub `patient-admin.ts`, `medication.ts`, admin `EventBrowser.tsx`/`ExportButton.tsx`; new Supabase migration (MCP).
**New files:** `packages/audit-logger/src/__tests__/{client-guard,drain,verify-chain}.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#8-shared-packages-packages] — P-AUDIT-1..3
- [Source: supabase/migrations/045_audit_log_chain_seq.sql] — chain write-path pattern
- [Source: _bmad-output/implementation-artifacts/8-2-immutable-hash-chained-audit-logging.md] — original chain story

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
