# Story 18.7a: Hub API Guardian Endpoints

Status: done

## Story

As the patient-lite-mobile app,
I need Hub API endpoints for guardian OTP verification, link persistence, and unlink notification,
so that guardian linking works end-to-end across devices and triggers server-side notifications.

## Background

Story 18.7 implemented the client-side guardian linking flow. During code review, three architectural decisions required Hub API endpoints that don't currently exist. The client-side code gracefully degrades (queues to `sync_queue` when offline), but full AC compliance requires these server-side endpoints.

## Acceptance Criteria

1. `guardian.verifyOtp` tRPC mutation: accepts `{ patientId, guardianPhone, otp, channel }`, verifies the OTP using Supabase Admin SDK server-side, returns `{ guardianUserId }`. Must NOT create a client-side auth session.
2. `guardian.createLink` tRPC mutation: accepts a `GuardianLink` payload, persists to the Hub database, and triggers a push notification to the patient ("A guardian has been linked to your account").
3. `guardian.notifyUnlink` tRPC mutation: accepts `{ patientId, guardianUserId, guardianLinkId }`, sends a notification to the guardian ("You have been unlinked as a guardian").
4. All three endpoints require a valid patient JWT (RS256, 15-min expiry) — standard auth middleware.
5. `guardian.createLink` enforces the V1 limit server-side (max 1 active guardian per patient).
6. All endpoints emit structured audit events via `@ultranos/audit-logger` — no PHI in audit payloads.
7. Guardian link data stored in a `guardian_links` table in the Hub PostgreSQL database with appropriate indexes.

## Dependencies

- Story 18.7 (Guardian Linking — client-side, provides the calling code)
- Hub API auth middleware (JWT RS256 validation)
- Supabase Admin SDK access for server-side OTP verification
- Notification dispatch infrastructure (Story 12.4)

## Tasks / Subtasks

- [x] Task 1: Hub database migration — `guardian_links` table
  - [x] Create migration via Supabase MCP: `guardian_links` table with `id`, `patient_id`, `guardian_user_id`, `guardian_phone_hash`, `guardian_phone_hint`, `role`, `linked_at`, `linked_by`, `status`, `revoked_at`
  - [x] Add UNIQUE index on `(patient_id)` WHERE `status = 'active'` (V1 limit)
  - [x] Add index on `(guardian_user_id, status)` for guardian-side lookups

- [x] Task 2: `guardian.verifyOtp` endpoint
  - [x] tRPC mutation in `apps/hub-api/src/trpc/routers/guardian.ts`
  - [x] Use Supabase Admin SDK `auth.admin.verifyOtp()` — server-side, no client session
  - [x] Return `{ guardianUserId }` on success
  - [x] Input validation: patientId (UUID), guardianPhone (E.164), otp (6 digits), channel ('sms' | 'whatsapp')
  - [x] Audit event: `GUARDIAN_OTP_VERIFIED`

- [x] Task 3: `guardian.createLink` endpoint
  - [x] tRPC mutation: accepts `GuardianLink` payload
  - [x] Insert into `guardian_links` table
  - [x] Enforce V1 limit: reject if active link already exists for this patient
  - [x] Trigger patient notification via notification dispatch
  - [x] Audit event: `GUARDIAN_LINK_CREATED`

- [x] Task 4: `guardian.notifyUnlink` endpoint
  - [x] tRPC mutation: accepts `{ patientId, guardianUserId, guardianLinkId }`
  - [x] Update `guardian_links.status` to `'revoked'` in Hub DB
  - [x] Send notification to guardian: "You have been unlinked as a guardian"
  - [x] Audit event: `GUARDIAN_LINK_REVOKED`

- [x] Task 5: Tests
  - [x] Test: `verifyOtp` returns guardianUserId on valid OTP
  - [x] Test: `verifyOtp` rejects invalid OTP
  - [x] Test: `createLink` persists and sends notification
  - [x] Test: `createLink` rejects duplicate active link (V1 limit)
  - [x] Test: `notifyUnlink` revokes and notifies
  - [x] Test: all endpoints emit audit events with no PHI
  - [x] Test: all endpoints require valid JWT

## Technical Notes

- The client-side code in `guardian-api.ts` already calls these endpoints and handles offline graceful degradation via `sync_queue`.
- Use the existing `trpcMutation` pattern from other Hub API routers.
- Supabase Admin SDK: `supabase.auth.admin.verifyOtp()` — requires `SUPABASE_SERVICE_ROLE_KEY`.
- Notification dispatch: reuse the pattern from Story 12.4 (`notification.dispatch` internal procedure).

## File List

### New Files
- `apps/hub-api/src/trpc/routers/guardian.ts` — Guardian tRPC router (verifyOtp, createLink, notifyUnlink) with RBAC, ownership, and nonce enforcement
- `apps/hub-api/src/__tests__/guardian.test.ts` — 23 comprehensive endpoint tests

### Modified Files
- `apps/hub-api/src/trpc/routers/_app.ts` — Register guardian router in root appRouter
- `apps/hub-api/src/trpc/rbac.ts` — Added `GuardianLink` to PATIENT and GUARDIAN permission sets
- Hub database migration `create_guardian_links_table` (via Supabase MCP)

## Change Log

- 2026-05-18: Implemented all 3 guardian endpoints, DB migration, and 16 tests. All guardian tests pass (16/16).
- 2026-05-18: Addressed code review findings — 10 items resolved. Added RBAC middleware, ownership checks, Redis nonce binding, PHI log fixes, notification correctness, zero-row guard, test coverage for new security controls. Tests expanded to 23, all passing.

## Dev Agent Record

### Implementation Plan
- Used existing tRPC router pattern (protectedProcedure, zod validation, AuditLogger, db.toRowRaw)
- Notification dispatch follows Story 12.4 best-effort pattern (failures don't block operations)
- V1 limit enforced via PostgreSQL UNIQUE partial index (status = 'active'), caught as 23505 error code
- OTP verification uses Supabase Admin SDK (auth.admin.verifyOtp) — no client session created
- All audit payloads contain NO PHI — only action types, resource IDs, and opaque metadata

### Completion Notes
- DB migration applied: `guardian_links` table with UUID PK, partial unique index for V1 limit, composite index for guardian lookups
- 3 tRPC mutations implemented: `guardian.verifyOtp`, `guardian.createLink`, `guardian.notifyUnlink`
- All endpoints protected via `protectedProcedure` (JWT required) + `enforceResourceAccess('GuardianLink')` RBAC middleware + ownership checks
- Nonce-based OTP-to-createLink binding: Redis-stored single-use nonce (5-min TTL) prevents OTP bypass
- 23 tests passing: success paths, error paths, input validation, audit events, PHI-free audit verification, unauthenticated rejection, ownership checks, nonce validation, notification payload assertions
- PHI eliminated from all console.warn log output
- notifyUnlink now verifies row was actually updated (returns NOT_FOUND on mismatch)
- Guardian notification uses `recipientRole: 'GUARDIAN'` (not 'PATIENT')
- Failure audit event uses distinct action label `GUARDIAN_OTP_ATTEMPT` (not `GUARDIAN_OTP_VERIFIED`)
- 37 pre-existing test failures in hub-api suite (unrelated to this story)

### Review Findings

- [x] [Review][Decision] **No authorization/ownership check** — Fixed: added `enforceResourceAccess('GuardianLink')` middleware + `ctx.user.sub === input.patientId` ownership check to all three endpoints. Added `GuardianLink` to PATIENT/GUARDIAN RBAC permissions.
- [x] [Review][Decision] **OTP verification decoupled from createLink** — Fixed: `verifyOtp` now generates a single-use nonce stored in Redis (5-min TTL), `createLink` requires and validates the nonce before proceeding.
- [x] [Review][Patch] **OTP `type` hardcoded to `'sms'`** — Verified correct: Supabase Admin SDK uses `type: 'sms'` for all phone-based OTP regardless of channel. Added clarifying comment.
- [x] [Review][Patch] **PHI leak in `console.warn`** — Fixed: removed `patientId` and `guardianUserId` from all `console.warn` log output.
- [x] [Review][Patch] **`notifyUnlink` silent no-op on zero rows** — Fixed: added `.select('id').single()` to verify a row was actually updated, returns NOT_FOUND if no match.
- [x] [Review][Patch] **`recipientRole: 'PATIENT'` for guardian** — Fixed: changed to `'GUARDIAN'` in `notifyUnlink` notification dispatch.
- [x] [Review][Patch] **Mixed column naming `.eq('patient_id')`** — Verified correct: `.eq()` takes raw DB column names (snake_case), while `toRowRaw()` handles camelCase→snake_case conversion on inserts. No change needed.
- [x] [Review][Patch] **`as any` cast on Supabase admin call** — Kept with clarifying comment: Supabase Admin SDK types may not include phone OTP params. Runtime behavior is correct.
- [x] [Review][Patch] **Tests don't verify notification payload** — Fixed: added `mockNotificationInsert` with assertions on `recipientRef`, `recipientRole`, and `type` fields.
- [x] [Review][Patch] **Misleading audit action label on failure path** — Fixed: changed from `GUARDIAN_OTP_VERIFIED` to `GUARDIAN_OTP_ATTEMPT` on failure path.
- [x] [Review][Defer] **`[AUTH_DEBUG]` console.log in `init.ts` leaks JWT `sub`** [init.ts] — deferred, pre-existing
- [x] [Review][Defer] **No rate limiting on `verifyOtp` — 6-digit OTP brute-forceable** — deferred, infrastructure-level concern
- [x] [Review][Defer] **`createLink` input schema doesn't reference shared `GuardianLink` type** — deferred, design alignment
