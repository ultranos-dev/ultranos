# Story 21.3: Consent Authorization & Identity Trust Fixes

Status: done

## Story

As a patient,
I want my consent records to be tamper-proof and my pharmacist's identity to be server-verified,
so that my data access preferences are enforced and dispensing attribution is accurate.

## Acceptance Criteria

1. **Given** a `consent.sync` call, **When** the request includes a `grantorId`, **Then** the server verifies that `ctx.user.sub === input.grantorId` (a user can only sync their own consent)
2. **Given** an ADMIN user calling `consent.sync`, **When** `grantorId` differs from their own `sub`, **Then** the sync is allowed (break-glass scenario)
3. **Given** an unauthorized consent sync attempt (non-ADMIN, mismatched grantorId), **When** rejected, **Then** it returns FORBIDDEN and is logged as a security audit event with action `SECURITY_VIOLATION`
4. **Given** a `medication.recordDispense` call, **When** `pharmacistRef` is included in the payload, **Then** the server overrides it with `ctx.user.sub` (never trusts client-supplied pharmacist identity)

## Tasks / Subtasks

- [x] Task 1: Verify and harden consent.sync grantor authorization (AC: #1, #2, #3)
  - [x] 1.1 Review existing implementation in `apps/hub-api/src/trpc/routers/consent.ts` lines 41–56 — the role check and grantor ID match are ALREADY implemented (D167)
  - [x] 1.2 **Gap:** The FORBIDDEN rejection currently does NOT emit a security audit event. Add audit logging:
    - On role rejection (line 45–48): emit `{ action: 'SECURITY_VIOLATION', resourceType: 'CONSENT', outcome: 'FAILURE', metadata: { reason: 'unauthorized_role', attemptedRole: ctx.user.role } }`
    - On grantorId mismatch (line 51–55): emit `{ action: 'SECURITY_VIOLATION', resourceType: 'CONSENT', outcome: 'FAILURE', metadata: { reason: 'grantor_impersonation' } }`
  - [x] 1.3 Ensure the audit emit happens BEFORE the TRPCError throw (audit failure should not block the rejection)

- [x] Task 2: Override pharmacistRef in medication.recordDispense (AC: #4)
  - [x] 2.1 In `apps/hub-api/src/trpc/routers/medication.ts`, inside `recordDispense` handler (around line 444):
    - Add `const pharmacistRef = ctx.user.sub` — always use server-verified identity
    - Replace all uses of `input.pharmacistRef` with `pharmacistRef` in the insert operation (line ~521 where `pharmacist_ref: input.pharmacistRef` is used)
  - [x] 2.2 The input schema still accepts `pharmacistRef` for backward compatibility (clients send it), but the server ignores it
  - [x] 2.3 Add a comment: `// Story 21.3: Server overrides client-supplied pharmacistRef with verified identity`
  - [x] 2.4 If `input.pharmacistRef !== ctx.user.sub`, log a warning-level audit event: `{ action: 'SECURITY_VIOLATION', resourceType: 'MEDICATION_DISPENSE', outcome: 'SUCCESS', metadata: { reason: 'pharmacist_ref_overridden', clientSupplied: input.pharmacistRef.slice(0, 8) + '...' } }`

- [x] Task 3: Tests (AC: all)
  - [x] 3.1 Test consent.sync: PATIENT with matching grantorId → allowed
  - [x] 3.2 Test consent.sync: PATIENT with mismatched grantorId → FORBIDDEN + audit event
  - [x] 3.3 Test consent.sync: ADMIN with any grantorId → allowed
  - [x] 3.4 Test consent.sync: DOCTOR role → FORBIDDEN + audit event (not in CONSENT_GRANTOR_ROLES)
  - [x] 3.5 Test medication.recordDispense: verify `pharmacist_ref` in DB row equals `ctx.user.sub`, NOT `input.pharmacistRef`
  - [x] 3.6 Test medication.recordDispense: mismatched pharmacistRef triggers warning audit event

## Dev Notes

### Architecture & Patterns

- **Consent grantor check is mostly done.** The existing code at `consent.ts` lines 41–56 already implements the core logic (D167). The ONLY gap is missing security audit events on rejection. This is a lightweight story.
- **pharmacistRef override is the main code change.** The `recordDispense` handler at `medication.ts` line ~521 uses `input.pharmacistRef` directly in the DB insert. The fix is a one-line override plus audit logging.
- **Audit event action:** Reuse the `SECURITY_VIOLATION` action being added in Story 21.2 (or add it here if 21.2 hasn't run yet — the enum addition is idempotent). Check `packages/shared-types/src/enums.ts` for `AuditAction`.
- **Known bug nearby:** `apps/hub-api/src/trpc/routers/audit.ts` line 49 uses `ctx.user.userId` which doesn't exist — should be `ctx.user.sub`. This bug is NOT in scope for this story but worth noting.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `apps/hub-api/src/trpc/routers/consent.ts` | Add security audit events on FORBIDDEN rejections (lines 45–56) |
| `apps/hub-api/src/trpc/routers/medication.ts` | Override `pharmacistRef` with `ctx.user.sub` in `recordDispense` handler |
| `packages/shared-types/src/enums.ts` | Add `SECURITY_VIOLATION` to `AuditAction` if not already present |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `apps/hub-api/src/__tests__/consent-authorization.test.ts` | Consent grantor authorization tests |
| `apps/hub-api/src/__tests__/pharmacist-identity-trust.test.ts` | PharmacistRef override tests |

### References

- [Source: apps/hub-api/src/trpc/routers/consent.ts#L41-L56] — existing grantor check (D167)
- [Source: apps/hub-api/src/trpc/routers/medication.ts#L428-L444] — recordDispense handler
- [Source: apps/hub-api/src/trpc/routers/medication.ts#L521] — where `pharmacist_ref: input.pharmacistRef` is used (line approximate)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-21] — Story 21.3 acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Pre-existing test failures in medication.test.ts (lines 726, 779) from story 21.2 changes — NOT caused by this story
- consent-authorization-audit.test.ts initially failed due to vi.mock hoisting issue — fixed with vi.hoisted()
- consent-authorization-audit.test.ts initially used LAB_TECH role which doesn't have Consent resource access — fixed to use DOCTOR

### Completion Notes List
- Task 1: Added `SECURITY_VIOLATION` and `DUPLICATE_DISPENSE_ATTEMPT` to AuditAction enum, `MEDICATION_DISPENSE` to AuditResourceType enum in shared-types
- Task 1: Added security audit events (SECURITY_VIOLATION) to both FORBIDDEN rejection paths in consent.sync — unauthorized role and grantor impersonation. Audit emit happens before throw; audit failure does not block rejection.
- Task 2: Server now overrides client-supplied `pharmacistRef` with `Practitioner/${ctx.user.sub}` in medication.recordDispense. Input schema still accepts pharmacistRef for backward compat but value is ignored. Mismatch between client-supplied and server-verified values emits a SECURITY_VIOLATION audit event.
- Task 3: 12 tests across 3 test files, all passing:
  - consent-authorization-audit.test.ts (4 tests): unauthorized role audit, impersonation audit, no false positives on success, audit failure doesn't block rejection
  - consent-grantor-validation.test.ts (3 tests): pre-existing, still passing
  - pharmacist-identity-trust.test.ts (5 tests): server override with matching ref, server override with mismatched ref, SECURITY_VIOLATION on mismatch, no false positive on match, audit failure doesn't block dispense

### File List
- `packages/shared-types/src/enums.ts` — Added SECURITY_VIOLATION, DUPLICATE_DISPENSE_ATTEMPT to AuditAction; MEDICATION_DISPENSE to AuditResourceType
- `apps/hub-api/src/trpc/routers/consent.ts` — Added SECURITY_VIOLATION audit events on both FORBIDDEN rejection paths
- `apps/hub-api/src/trpc/routers/medication.ts` — Override pharmacistRef with ctx.user.sub; audit mismatch
- `apps/hub-api/src/__tests__/consent-authorization-audit.test.ts` — NEW: 4 tests for consent authorization security audit
- `apps/hub-api/src/__tests__/pharmacist-identity-trust.test.ts` — NEW: 5 tests for pharmacist identity trust override

### Review Findings

- [x] [Review][Decision] **D1: pharmacistRef comparison is format-sensitive** — Fixed: enforced `Practitioner/` prefix in Zod schema via `.startsWith('Practitioner/')` [medication.ts:534]
- [x] [Review][Patch] **P1: Audit metadata deviates from spec Task 2.4** — Fixed: `reason` → `pharmacist_ref_overridden`, `clientSupplied` → truncated to 8 chars [medication.ts:625]
- [x] [Review][Patch] **P2: Missing ADMIN break-glass test (AC 2, Task 3.3)** — Fixed: added ADMIN break-glass test [consent-authorization-audit.test.ts]
- [x] [Review][Patch] **P3: Consent security audit events missing patientId** — Fixed: added `patientId` from `input.patientRef` to both audit events [consent.ts:48-57, 71-79]
- [x] [Review][Defer] **W1: ADMIN consent bypass lacks dedicated audit trail** — When ADMIN syncs on behalf of another user, no metadata records this was an admin-on-behalf-of action. Enhancement, not in scope. [consent.ts:67]
- [x] [Review][Defer] **W2: Client pharmacistRef has no max length constraint** — `z.string().min(1)` allows arbitrarily long strings that get persisted in immutable audit log metadata. Input validation improvement. [medication.ts:534]
- [x] [Review][Defer] **W3-W10: Story 21.2 scope findings (8 items)** — parsedPayload not validated after JSON.parse, .refine() removal from GetStatusInputSchema, verifyEd25519Signature sync/async ambiguity, console.warn audit fallback inconsistency, breaking API for unsigned lookups, isKeyRevoked error handling gap, resourceId missing from some audit events, dead schema fields. All belong to Story 21.2 review.

### Change Log
- 2026-05-13: Implemented story 21.3 — consent authorization audit events + pharmacist identity trust override
- 2026-05-13: Code review — 1 decision-needed, 3 patches, 10 deferred, 6 dismissed. All resolved.
