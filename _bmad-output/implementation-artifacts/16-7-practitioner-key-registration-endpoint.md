# Story 16.7: Practitioner Key Registration Endpoint

Status: done

## Story

As a clinician,
I want to register my Ed25519 public key with the Hub,
so that pharmacies can verify my prescription signatures.

## Acceptance Criteria

1. `practitionerKey.register` accepts public key (Ed25519 base64), practitioner ID, optional expiry
2. Key persisted to `practitioner_keys` table with status `active`
3. Duplicate key (same public key) rejected with clear error
4. Default expiry: 1 year from registration if not specified
5. Only CLINICIAN, DOCTOR, or ADMIN can register
6. Registration logged as audit event

## Tasks / Subtasks

- [x] Task 1: Add `register` mutation to `practitionerKeyRouter` (AC: #1, #2, #4, #5)
  - [x] Open `apps/hub-api/src/trpc/routers/practitioner-key.ts`
  - [x] Add `register` procedure using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', 'ADMIN'])`
  - [x] Define Zod input schema:
    - `publicKey`: `z.string().min(1)` — Ed25519 base64-encoded public key
    - `practitionerId`: `z.string().uuid()` — the practitioner's ID
    - `practitionerName`: `z.string().min(1)` — display name for key lookup
    - `expiresAt`: `z.string().datetime().optional()` — optional ISO 8601 expiry date
  - [x] Compute default expiry: if `expiresAt` not provided, set to 1 year from `new Date().toISOString()`
  - [x] Insert into `practitioner_keys` table via `ctx.supabase.from('practitioner_keys').insert(...)` using `db.toRowRaw()` (no PHI in this table)
  - [x] Select `id` from the inserted row for audit logging
  - [x] Return `{ registered: true, expiresAt }` on success

- [x] Task 2: Handle duplicate key rejection (AC: #3)
  - [x] Check Supabase insert error for unique constraint violation on `public_key_ed25519`
  - [x] If duplicate detected (`error.code === '23505'`), throw `TRPCError` with code `CONFLICT` and message `'Public key already registered'`
  - [x] For other insert errors, throw `TRPCError` with code `INTERNAL_SERVER_ERROR` and message `'Failed to register key'`

- [x] Task 3: Emit audit event on registration (AC: #6)
  - [x] Instantiate `AuditLogger` via `new AuditLogger(ctx.supabase)`
  - [x] Emit audit event with:
    - `action: 'CREATE'`
    - `resourceType: 'PractitionerKey'`
    - `resourceId: data.id` (from inserted row)
    - `actorId: ctx.user.sub`
    - `actorRole: ctx.user.role`
    - `outcome: 'SUCCESS'`
    - `sessionId: ctx.user.sessionId`
    - `metadata: { practitionerId: input.practitionerId }`
  - [x] Wrap audit emit in try/catch — log `[AUDIT_FAILURE]` on error (match existing pattern in `revokeKey`)
  - [x] Do NOT include the public key value in audit metadata (keep audit logs minimal)

- [x] Task 4: Write tests (AC: #1-#6)
  - [x] Create `apps/hub-api/src/__tests__/practitioner-key-register.test.ts`
  - [x] Test successful registration with all fields provided (including custom expiry)
  - [x] Test successful registration with default expiry (1 year from now)
  - [x] Test duplicate key rejection returns CONFLICT error
  - [x] Test RBAC: DOCTOR role can register
  - [x] Test RBAC: CLINICIAN role can register
  - [x] Test RBAC: ADMIN role can register
  - [x] Test RBAC: PHARMACIST role is rejected
  - [x] Test RBAC: LAB_TECH role is rejected
  - [x] Test audit event is emitted on successful registration
  - [x] Test audit failure does not block registration (try/catch resilience)
  - [x] Verify all existing practitioner-key tests still pass (pre-existing failures in getRevocationList/revokeKey mock chains — not regressions)

### Review Findings

- [x] [Review][Decision] **No authorization check that caller owns the `practitionerId`** — Fixed: non-ADMIN callers must have `ctx.user.sub === input.practitionerId`. ADMIN can register for anyone. 2 tests added.
- [x] [Review][Patch] **No validation of public key format (Ed25519 base64)** — Fixed: `z.string().min(44).max(44).regex(...)` enforces 44-char base64. Test added.
- [x] [Review][Patch] **`expiresAt` allows past dates** — Fixed: `.refine()` rejects past dates. Test added.
- [x] [Review][Patch] **`practitionerName` has no max length or trim** — Fixed: `.max(200).trim()`.
- [x] [Review][Patch] **`data.id` used without null guard** — Fixed: explicit null check throws `INTERNAL_SERVER_ERROR`.
- [x] [Review][Patch] **Default-expiry test doesn't verify inserted row data** — Fixed: test now asserts `mockInsert` was called with correct data.
- [x] [Review][Defer] **No cap on active keys per practitioner** [practitioner-key.ts] — deferred, policy decision not in story scope
- [x] [Review][Defer] **`practitionerId` not verified to exist in system** [practitioner-key.ts] — deferred, depends on FK constraint existence, schema concern
- [x] [Review][Defer] **No upper bound on key expiry duration** [practitioner-key.ts] — deferred, policy decision not in story scope

## Dev Agent Record

### Implementation Plan
- Added `register` mutation to existing `practitionerKeyRouter` following the exact pattern from the story spec
- Used `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', 'ADMIN'])` for RBAC
- Duplicate key detection via PostgreSQL error code `23505` mapped to tRPC `CONFLICT`
- Audit logging with try/catch resilience matching `revokeKey` pattern
- Default expiry computed via `Date.setFullYear(getFullYear() + 1)`

### Completion Notes
- All 11 new tests pass (registration, RBAC, duplicate rejection, audit logging)
- No regressions introduced — pre-existing test failures in `practitioner-key.test.ts` (getRevocationList, revokeKey mock chain issues) are unrelated
- No PHI in audit metadata — only `practitionerId` logged
- Public key value excluded from audit metadata per story spec

## File List

| File | Action |
|------|--------|
| `apps/hub-api/src/trpc/routers/practitioner-key.ts` | MODIFIED — added `register` mutation |
| `apps/hub-api/src/__tests__/practitioner-key-register.test.ts` | NEW — 11 tests for registration endpoint |

## Change Log

- 2026-05-10: Implemented practitioner key registration endpoint (Story 16.7) — register mutation with RBAC, duplicate rejection, audit logging, and 11 tests

## Dev Notes

### Existing Router Context

The `practitionerKeyRouter` in `apps/hub-api/src/trpc/routers/practitioner-key.ts` already has three procedures:
- `getKeyStatus` — query, uses `protectedProcedure` (any authenticated user)
- `getRevocationList` — query, uses `protectedProcedure`
- `revokeKey` — mutation, uses `roleRestrictedProcedure(['ADMIN'])`

The `register` procedure adds a fourth, using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', 'ADMIN'])`.

### Table Schema

The `practitioner_keys` table has these columns (from migration):
- `id` — UUID primary key
- `public_key_ed25519` — text, unique constraint
- `practitioner_id` — UUID
- `practitioner_name` — text
- `revoked_at` — timestamp, nullable
- `revocation_reason` — text, nullable
- `expires_at` — timestamp
- `created_at` — timestamp, default now()

There is no `status` column — status is derived at read time (see `getKeyStatus`):
- If `revoked_at` is set → `'revoked'`
- If `expires_at` < now → `'expired'`
- Otherwise → `'active'`

### Insert Pattern

Follow the existing mutation pattern from `revokeKey`:

```typescript
register: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', 'ADMIN'])
  .input(
    z.object({
      publicKey: z.string().min(1),
      practitionerId: z.string().uuid(),
      practitionerName: z.string().min(1),
      expiresAt: z.string().datetime().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const now = new Date()
    const defaultExpiry = new Date(now)
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1)
    const expiresAt = input.expiresAt ?? defaultExpiry.toISOString()

    const { data, error } = await ctx.supabase
      .from('practitioner_keys')
      .insert({
        public_key_ed25519: input.publicKey,
        practitioner_id: input.practitionerId,
        practitioner_name: input.practitionerName,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Public key already registered',
        })
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to register key',
      })
    }

    // Audit: key registration
    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'CREATE',
        resourceType: 'PractitionerKey',
        resourceId: data.id,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { practitionerId: input.practitionerId },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', {
        action: 'CREATE',
        resourceType: 'PractitionerKey',
        resourceId: data.id,
      })
    }

    return { registered: true, expiresAt }
  }),
```

### Why `db.toRowRaw()` Is Not Needed for Insert

Looking at the existing router code, `ctx.supabase.from(...).insert(...)` is called directly without `db.toRowRaw()` wrapping. The `toRowRaw()` helper is a guard that rejects writes containing sensitive fields — since `practitioner_keys` contains no PHI (only public keys, IDs, and timestamps), the insert can go directly. If the project convention evolves to require `toRowRaw()` for all inserts, wrap the insert payload accordingly.

### Duplicate Key Detection

PostgreSQL unique constraint violations return error code `23505`. The `public_key_ed25519` column has a unique constraint, so attempting to insert a duplicate key will trigger this error from Supabase. Map it to tRPC `CONFLICT` code for clear client-side handling.

### Default Expiry Calculation

Use `Date.setFullYear(getFullYear() + 1)` rather than adding milliseconds. This correctly handles leap years and calendar edge cases (e.g., registering on Feb 29 defaults to Feb 28 next year).

### RBAC Pattern

The `roleRestrictedProcedure` function (defined in `apps/hub-api/src/trpc/rbac.ts`) accepts an array of role strings and returns a tRPC procedure that checks `ctx.user.role` against the allowed list. It throws `FORBIDDEN` if the role is not in the list.

Existing usage in the codebase:
- `roleRestrictedProcedure(['ADMIN'])` — admin-only (revokeKey, auditChainIntegrity)
- `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', 'ADMIN'])` — clinical staff + admin (allergy.list)
- `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])` — clinical staff only (allergy.create)

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/hub-api/src/trpc/routers/practitioner-key.ts` | UPDATE | Add `register` mutation procedure |
| `apps/hub-api/src/__tests__/practitioner-key-register.test.ts` | NEW | Tests for registration endpoint |

### What NOT to Change

- DO NOT modify the existing `getKeyStatus`, `getRevocationList`, or `revokeKey` procedures
- DO NOT add a `status` column to the table — status is derived at read time
- DO NOT include PHI in audit metadata or error messages
- DO NOT include the raw public key value in audit metadata
- DO NOT create a separate router file — add to the existing `practitionerKeyRouter`

### What This Story Does NOT Do

- Does NOT implement client-side key generation (that is the spoke app's responsibility)
- Does NOT implement key rotation (revoke old + register new is the intended workflow)
- Does NOT modify the `getKeyStatus` or `getRevocationList` queries
- Does NOT add key expiry checking cron job (expired keys are detected at read time)

### Testing Standards

- **Framework:** Vitest (already configured in hub-api)
- **Mock pattern:** Mock `ctx.supabase` with chainable query builder (see `apps/hub-api/src/__tests__/allergy.test.ts` for pattern)
- **Audit mock:** Mock `AuditLogger` constructor and `emit` method
- **RBAC testing:** Test with different `ctx.user.role` values; verify `roleRestrictedProcedure` rejects unauthorized roles

### References

- [Source: apps/hub-api/src/trpc/routers/practitioner-key.ts] — Existing router with getKeyStatus, getRevocationList, revokeKey
- [Source: apps/hub-api/src/trpc/rbac.ts] — roleRestrictedProcedure implementation
- [Source: apps/hub-api/src/lib/supabase.ts] — db.toRowRaw() helper
- [Source: _bmad-output/planning-artifacts/epics.md#Story16.7] — AC source
- [Source: CLAUDE.md#Healthcare-Safety] — Audit every PHI access, no PHI in logs
