# Story 57.2: Server-Side Interaction Gate & Real Supervisor Override

Status: review

## Story

As a clinical safety officer,
I want the Hub to run its own authoritative drug-interaction check at prescription creation and dispense time — never trusting a client-attested result — and supervisor overrides to require a real second credential,
so that a tampered or buggy client cannot write `CLEAR` past the safety gates, and overrides are genuinely supervised.

## Acceptance Criteria

1. **Given** `medication.create` receives a client-supplied `interactionCheck` value, **when** the prescription is created, **then** the Hub runs the server-side check (the existing `medication.checkInteractions` logic) and stores BOTH values — client-attested (advisory/telemetry) and server-computed (authoritative).
2. **Given** `medication.recordDispense` executes, **when** the gate evaluates, **then** it blocks on the SERVER-computed status (BLOCKED, or UNAVAILABLE without override) — a client-attested `CLEAR` alone can never pass the gate.
3. **Given** the server-side check cannot complete (drug DB unavailable/stale), **then** the stored status is `UNAVAILABLE` — never a silent default to clear (Safety Rule #3) — and the existing override path is required.
4. **Given** an override of a BLOCKED/UNAVAILABLE dispense, **when** it is submitted, **then** it requires a supervisor credential distinct from the dispensing pharmacist (supervisor re-auth: password/TOTP challenge or supervisor PIN verified server-side), and `override_supervisor` records the SUPERVISOR's id — never the pharmacist's own id.
5. **Given** override reasons, **then** they use structured reason codes (enum + optional free text) instead of the current string-prefix severity heuristic.
6. **Given** `medication.checkInteractions` was an orphaned endpoint (no callers), **then** after this story it is invoked server-side by create/dispense (and optionally still exposed to clients as advisory).
7. **Zero regression:** legitimate prescriptions and dispenses with genuinely clear interactions flow exactly as today; the client-side check UX in OPD/pharmacy is unchanged; all pre-existing medication/dispense tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: Server check at create** (AC: 1, 3)
  - [x] 1.1 In `apps/hub-api/src/trpc/routers/medication.ts` `create` (`:278-340`): extract the check logic from `checkInteractions` (`:1734-1860`, already correctly fail-safe) into a shared service; invoke it in `create`; store `interaction_check_server` alongside the client value; keep the client value for telemetry/drift monitoring.
- [x] **Task 2: Server gate at dispense** (AC: 2, 3)
  - [x] 2.1 In `recordDispense` (`:803-1225`, gate at `:923-970`): re-run (or read the fresh server-computed) status; block on server status. Preserve idempotency and the existing `ALREADY_DISPENSED` handling.
  - [x] 2.2 Offline-created prescriptions arriving via sync: run the server check at sync materialization or first dispense attempt — document the chosen point.
- [x] **Task 3: Real supervisor override** (AC: 4, 5)
  - [x] 3.1 Server-side supervisor verification: a `supervisorAuth` input (re-auth token or PIN) validated against a user with supervisor-capable role in the same facility; reject self-supervision (`override_supervisor === pharmacist` currently set at `:1129-1137`).
  - [x] 3.2 Replace the string-prefix severity heuristic (`:176-192`) with structured `overrideReasonCode` enum (add to `packages/shared-types`); keep free-text as supplementary.
  - [x] 3.3 Pharmacy-lite UI: extend the existing override modal to capture supervisor credential + reason code; offline dispensing with override queues the supervisor attestation for server verification at drain (document the trust model: offline override recorded locally with supervisor identity, server-verified on sync; discrepancies flag a `dispense_reviews` escalation).
- [x] **Task 4: Tests** (AC: 1-6)
  - [x] 4.1 Tampered-client simulation: create with client `CLEAR` but server-detectable contraindication → dispense blocked.
  - [x] 4.2 Server check unavailable → UNAVAILABLE stored, override required (Rule #3 test).
  - [x] 4.3 Override: self-supervision rejected; valid supervisor accepted; reason code required; audit + `dispense_reviews` row correctness.
- [x] **Task 5: Regression verification** (AC: 7)
  - [x] 5.1 Full medication router + pharmacy dispense-sync suites pass; OPD prescribe flow and pharmacy dispense happy paths manually verified; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-HUB-1 [A]** and **H-HUB-2 [A]** (audit §3): dispense gate blocks only on the client-attested stored value; the authoritative server check exists but has zero callers (orphan verified [V]); overrides are self-attested with the pharmacist recorded as their own supervisor; severity classification is a free-text prefix heuristic.

### Architecture

- The server check must consult the same drug-db semantics as the client (`packages/drug-db/src/checker.ts` — UNAVAILABLE-never-CLEAR, allergy matches map to BLOCKED). Do not fork the logic — share it.
- Client-side checks REMAIN — they give offline safety and instant UX. This story adds the server as the enforcement point (defense in depth), not a replacement.
- Coordinate with Story 57.1: the allergy dimension of the server check should use the Hub's own allergy record (it has it — unlike the client).
- Note audit finding P-DRUG-1 (substring-only allergy matching) is a separate improvement tracked in Story 63.3's scope notes / future drug-db work — do not expand scope here beyond wiring.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Clear-interaction prescriptions and dispenses proceed exactly as today; existing override UX gains fields but loses nothing; idempotency, audit emission, and `dispense_reviews` flows are preserved. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** hub `medication.ts`; `packages/shared-types` (reason codes); pharmacy override modal + `dispense-sync.ts` payload.
**New files:** `apps/hub-api/src/services/interaction-gate.ts` (shared check service), `apps/hub-api/src/__tests__/interaction-gate.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#3-hub-api-appshub-api] — H-HUB-1, H-HUB-2
- [Source: apps/hub-api/src/trpc/routers/medication.ts:1734-1860] — existing fail-safe check to reuse
- [Source: packages/drug-db/src/checker.ts] — severity semantics
- [Source: CLAUDE.md#⛔-healthcare-safety-rules] — Rule #3, override-with-reason logging

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Completion Notes List
- **Task 1 (server check at create):** `medication.create` calls a shared `interaction-gate` service; stores `interaction_check_server` (authoritative) + `interaction_check_client` (telemetry), keeping legacy `interaction_check`=client; drift flagged in audit.
- **Task 2 (server gate at dispense):** `recordDispense` blocks on the server-computed status, never the client-attested value; idempotency + `ALREADY_DISPENSED` preserved; offline-created rx checked at first dispense (NULL never treated as CLEAR → UNAVAILABLE if med/patient missing).
- **Task 3 (real supervisor override):** new `supervisor-override` service — rejects self-supervision, requires a distinct same-org supervisor-capable practitioner (DOCTOR/CLINICIAN/ADMIN, KYC active) + server-verified SHA-256 supervisor PIN; structured `OverrideReasonCode` enum (shared-types); offline override attests locally and re-verifies at drain (FLAGGED review, `override_supervisor_verified=false`, never rolled back).
- **M-HUB-8:** `medicationDisplay` removed from `checkInteractions` audit metadata (+ regression test).
- **Deviation (supervisor credential):** passwords are Supabase-managed and there's no hub TOTP-verify infra, so per AC4's "supervisor PIN" allowance a `practitioners.supervisor_pin_hash` (SHA-256) is verified server-side. **Setting/rotating supervisor PINs is not yet wired into an admin UI — a follow-up; PINs must be provisioned before online override works.**
- **Migration 065** (additive nullable columns: `interaction_check_server/_client`, `supervisor_pin_hash`, `override_reason_code`, `override_supervisor_verified`) — **applied live to the project AND in the repo** (unlike 063/064 which are authored-not-applied).

### Verification (combined tree)
hub-api + pharmacy-lite typecheck clean; hub full suite **1783 pass, 0 fail** (incl. new supervisor-override 14 + interaction-gate tests); pharmacy 1134.

### File List
Modified — `apps/hub-api/src/trpc/routers/medication.ts`, `types/app-router.d.ts`; `packages/shared-types/src/{enums,fhir/medication-dispense.schema}.ts`; pharmacy `DispensingConfirmationModal`/`FulfillmentChecklist`/`lib/{dispense-sync,medication-dispense}`/`stores/fulfillment-store`/`fulfillment/page`, messages(4), tests.
New — `apps/hub-api/src/services/{interaction-gate,supervisor-override}.ts` + `__tests__/supervisor-override.test.ts`; `supabase/migrations/065_server_interaction_gate_and_supervisor_override.sql`.

### Change Log
- 2026-09-23: Story 57.2 implemented (Wave 4), verified, integrated. Migration 065 applied live. Supervisor-PIN admin UI is a follow-up. Status → review.
