# Story 27.9: Subscription Lifecycle & Tier Transitions

Status: done

## Story

As a platform operator,
I want subscription state transitions handled correctly,
so that trial to paid, upgrade, downgrade, and cancellation all behave predictably.

## Acceptance Criteria

1. The following state machine is enforced:
   - TRIAL -> ACTIVE (payment method added and first charge succeeds before trial ends)
   - TRIAL -> CANCELLED (30-day trial expires without payment method)
   - ACTIVE -> SUSPENDED (payment failure persists past 7-day grace period)
   - ACTIVE -> CANCELLED (Admin explicitly cancels -- access continues until end of current billing period)
   - SUSPENDED -> ACTIVE (outstanding payment resolved)
   - SUSPENDED -> CANCELLED (30 days without payment resolution)
2. CANCELLED organizations retain data for 90 days in read-only mode (Admins can log in and export, but no clinical writes)
3. After 90 days, a data purge job is scheduled (requires manual confirmation from a platform admin before execution -- no automatic deletion of clinical data)
4. All state transitions emit audit events and trigger Admin email notifications
5. A `subscription_lifecycle` cron job runs daily to check for: trial expirations, grace period expirations, and suspension-to-cancellation transitions

## Tasks / Subtasks

- [x] Task 1: Implement state machine validation (AC: #1)
  - [x] 1.1 Create `apps/hub-api/src/services/subscription-state-machine.ts`
  - [x] 1.2 Define the allowed transitions map:
    ```typescript
    const ALLOWED_TRANSITIONS: Record<OrgStatus, OrgStatus[]> = {
      TRIAL: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['SUSPENDED', 'CANCELLED'],
      SUSPENDED: ['ACTIVE', 'CANCELLED'],
      CANCELLED: [], // terminal state -- no transitions out
    }
    ```
  - [x] 1.3 Implement `validateTransition(currentStatus: OrgStatus, targetStatus: OrgStatus): boolean` -- returns true if transition is allowed
  - [x] 1.4 Implement `transitionOrg(orgId: string, targetStatus: OrgStatus, reason: string, ctx: TRPCContext): Promise<void>`:
    - Fetch current org status
    - Validate transition via `validateTransition()`
    - Throw `TRPCError({ code: 'BAD_REQUEST' })` with message `Invalid status transition: ${current} -> ${target}` if not allowed
    - Update `organizations.status` and set relevant timestamps (`cancelled_at`, etc.)
    - Emit audit event
    - Trigger email notification
  - [x] 1.5 All Hub API mutation endpoints that change org status MUST go through `transitionOrg()` -- never update status directly with raw SQL/Supabase update

- [x] Task 2: Add lifecycle columns to organizations table (AC: #1, #2)
  - [x] 2.1 Use `mcp__plugin_supabase_supabase__list_tables` to check current `organizations` schema
  - [x] 2.2 Use `mcp__plugin_supabase_supabase__apply_migration` to add:
    - `cancelled_at TIMESTAMPTZ` -- set when org transitions to CANCELLED, used for 90-day retention countdown
    - `suspended_at TIMESTAMPTZ` -- set when org transitions to SUSPENDED, used for 30-day auto-cancellation check
  - [x] 2.3 Verify `trial_ends_at` already exists from Story 27.1 (it does -- no migration needed for that column)
  - [x] 2.4 Verify `grace_period_ends_at` exists on `org_subscriptions` from Story 27.8 (add if missing)

- [x] Task 3: Read-only mode for CANCELLED orgs (AC: #2)
  - [x] 3.1 Update the entitlement middleware in `apps/hub-api/src/trpc/middleware/` (created in Story 27.3)
  - [x] 3.2 Add a check: if `org.status === 'CANCELLED'`:
    - Calculate days since `cancelled_at`
    - If < 90 days: allow query (read) procedures, block mutation procedures
    - If >= 90 days: block all access with message "Organization data retention period has expired. Contact support."
  - [x] 3.3 The read-only check should apply BEFORE the module entitlement check (a cancelled org can read data from any previously-subscribed module)
  - [x] 3.4 For CANCELLED orgs in read-only mode, return a header or metadata field `X-Org-Read-Only: true` so the frontend can display appropriate UI
  - [x] 3.5 Explicitly allow: login, view dashboard, view records, export data
  - [x] 3.6 Explicitly block: create encounters, write prescriptions, submit lab results, modify patient records, add users

- [x] Task 4: Data purge scheduling (AC: #3)
  - [x] 4.1 Create `data_purge_jobs` table via `mcp__plugin_supabase_supabase__apply_migration`:
    ```sql
    CREATE TABLE data_purge_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id),
      scheduled_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'EXECUTING', 'COMPLETED', 'CANCELLED')),
      confirmed_by UUID REFERENCES auth.users(id),
      confirmed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ```
  - [x] 4.2 Enable RLS: only `PLATFORM_ADMIN` can SELECT, UPDATE (confirm/cancel). No public INSERT/DELETE.
  - [x] 4.3 The `subscription_lifecycle` cron job (Task 5) creates PENDING purge jobs when a CANCELLED org passes 90 days
  - [x] 4.4 Create a `confirmPurge` mutation in the billing router:
    - Requires `PLATFORM_ADMIN` role
    - Validates the purge job exists and is PENDING
    - Sets `status = 'CONFIRMED'`, `confirmed_by`, `confirmed_at`
    - Emits audit event with `action: 'DATA_PURGE_CONFIRMED'`
  - [x] 4.5 Create a `cancelPurge` mutation:
    - Requires `PLATFORM_ADMIN` role
    - Sets `status = 'CANCELLED'`
    - Emits audit event
  - [x] 4.6 NEVER auto-execute purges -- the actual data deletion is a separate, future story (requires legal review per jurisdiction)

- [x] Task 5: Create `subscription_lifecycle` cron job (AC: #5)
  - [x] 5.1 Implement as a Supabase Edge Function (`supabase/functions/subscription-lifecycle/index.ts`) scheduled via pg_cron
  - [x] 5.2 Schedule to run daily at 02:00 UTC (low-traffic window)
  - [x] 5.3 Check 1 -- Trial expirations:
    - `SELECT id FROM organizations WHERE status = 'TRIAL' AND trial_ends_at < now()`
    - For each: call `transitionOrg(orgId, 'CANCELLED', 'Trial expired without payment method')`
  - [x] 5.4 Check 2 -- Grace period expirations:
    - Query `org_subscriptions` where `grace_period_ends_at < now()` and org status is still `ACTIVE`
    - For each: call `transitionOrg(orgId, 'SUSPENDED', 'Payment grace period expired')`
  - [x] 5.5 Check 3 -- Suspension to cancellation:
    - `SELECT id FROM organizations WHERE status = 'SUSPENDED' AND suspended_at < now() - INTERVAL '30 days'`
    - For each: call `transitionOrg(orgId, 'CANCELLED', 'Suspended for 30 days without payment resolution')`
  - [x] 5.6 Check 4 -- Data purge scheduling:
    - `SELECT id FROM organizations WHERE status = 'CANCELLED' AND cancelled_at < now() - INTERVAL '90 days'`
    - For each: create a PENDING `data_purge_jobs` row (if one doesn't already exist for this org)
  - [x] 5.7 Check 5 -- Grace period email warnings:
    - Day 1: orgs where `grace_period_ends_at` is ~6 days from now (set yesterday)
    - Day 5: orgs where `grace_period_ends_at` is ~2 days from now (set 5 days ago)
    - Send warning emails via `billing-notifications.ts` from Story 27.8
  - [x] 5.8 Log each transition action (no PHI -- only org_id and transition type)
  - [x] 5.9 Use `mcp__plugin_supabase_supabase__apply_migration` to create the pg_cron schedule:
    ```sql
    SELECT cron.schedule(
      'subscription-lifecycle-daily',
      '0 2 * * *',
      $$SELECT net.http_post(
        url := '<EDGE_FUNCTION_URL>/subscription-lifecycle',
        headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
      );$$
    );
    ```

- [x] Task 6: Audit events and email notifications for all transitions (AC: #4)
  - [x] 6.1 In `transitionOrg()` (Task 1), emit audit event after every successful transition:
    ```typescript
    await audit.emit({
      action: 'ORG_STATUS_TRANSITION',
      resourceType: 'Organization',
      resourceId: orgId,
      actorId: ctx.user?.sub ?? 'SYSTEM',
      actorRole: ctx.user?.role ?? 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId: ctx.user?.sessionId ?? 'cron',
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        reason,
      },
    })
    ```
  - [x] 6.2 In `transitionOrg()`, trigger email notification to org's `billing_email`:
    - TRIAL -> ACTIVE: "Welcome! Your subscription is now active."
    - TRIAL -> CANCELLED: "Your trial has expired. Subscribe to continue using Ultranos."
    - ACTIVE -> SUSPENDED: "Your access has been suspended due to non-payment."
    - ACTIVE -> CANCELLED: "Your subscription has been cancelled. You have 90 days of read-only access."
    - SUSPENDED -> ACTIVE: "Payment received! Your access has been restored."
    - SUSPENDED -> CANCELLED: "Your organization has been cancelled after 30 days of suspension."
  - [x] 6.3 Use `billing-notifications.ts` from Story 27.8 -- extend it with transition-specific templates
  - [x] 6.4 No PHI in any email -- only org name, status, and dates

- [x] Task 7: Tests (AC: #1-#5)
  - [x] 7.1 Create `apps/hub-api/src/__tests__/subscription-state-machine.test.ts`:
    - Test: all valid transitions return true from `validateTransition()`
    - Test: all invalid transitions return false (e.g., CANCELLED -> ACTIVE, TRIAL -> SUSPENDED)
    - Test: CANCELLED is a terminal state with no outgoing transitions
    - Test: `transitionOrg()` throws on invalid transition
    - Test: `transitionOrg()` emits audit event on success
    - Test: `transitionOrg()` sends email notification on success
  - [x] 7.2 Create `apps/hub-api/src/__tests__/subscription-read-only.test.ts`:
    - Test: CANCELLED org (< 90 days) can read data
    - Test: CANCELLED org (< 90 days) cannot write data (mutations blocked)
    - Test: CANCELLED org (>= 90 days) is fully blocked
    - Test: read-only check returns `X-Org-Read-Only` header
  - [x] 7.3 Create `apps/hub-api/src/__tests__/subscription-lifecycle-cron.test.ts`:
    - Test: expired trials are transitioned to CANCELLED
    - Test: expired grace periods transition orgs to SUSPENDED
    - Test: 30-day suspended orgs transition to CANCELLED
    - Test: 90-day cancelled orgs get a PENDING purge job created
    - Test: duplicate purge jobs are not created for the same org
    - Test: grace period warning emails sent at correct intervals (day 1, day 5)
  - [x] 7.4 Create `apps/hub-api/src/__tests__/data-purge.test.ts`:
    - Test: only PLATFORM_ADMIN can confirm a purge
    - Test: only PENDING purge jobs can be confirmed
    - Test: confirmPurge sets confirmed_by and confirmed_at
    - Test: cancelPurge sets status to CANCELLED
    - Test: audit events emitted for confirm and cancel actions

## Dev Notes

### Architecture & Patterns

**State Machine Pattern:**
The subscription state machine is the single source of truth for all org status transitions. No code path should update `organizations.status` directly -- always use `transitionOrg()`. This ensures:
1. Invalid transitions are rejected
2. Audit events are always emitted
3. Email notifications are always sent
4. Timestamps (`cancelled_at`, `suspended_at`) are always set correctly

```
State Machine Diagram:

  TRIAL ----[payment succeeds]----> ACTIVE
    |                                  |
    |                                  |
  [trial expires]              [payment fails + 7-day grace]
    |                                  |
    v                                  v
  CANCELLED <--[30 days]--- SUSPENDED
    ^                           |
    |                           |
    +---[admin cancels]--- ACTIVE
                                |
                          [payment resolves]
                                |
                                v
                             ACTIVE (restored)
```

**Read-Only Mode Implementation:**
The read-only enforcement happens at the tRPC middleware layer, NOT at the database level. This is intentional:
- RLS policies are tenant-scoped (org_id matching), not status-scoped
- Adding status checks to RLS would couple auth policies to business logic
- Middleware can return richer error messages and the `X-Org-Read-Only` header

The middleware check order is:
1. Auth (JWT validation)
2. Org status check (read-only for CANCELLED, blocked for expired)
3. Module entitlement check (Story 27.3)
4. Procedure execution

**Data Purge Safety:**
Clinical data deletion is legally sensitive (varies by jurisdiction -- some countries require 5-10 year retention). The purge system only SCHEDULES purges; it never auto-executes them. A PLATFORM_ADMIN must manually confirm each purge. The actual purge execution logic is deferred to a future story that will include jurisdiction-specific retention rules.

**Cron Job Design:**
The cron job is implemented as a Supabase Edge Function invoked by pg_cron. This pattern:
- Keeps the logic in TypeScript (not raw SQL procedures)
- Allows reuse of the `transitionOrg()` function and audit logger
- Runs with the service role key (bypasses RLS for cross-org queries)
- Is idempotent -- running it multiple times produces the same result (transitions are guarded by current status checks)

**Grace Period vs. Suspension Timeline:**
```
Day 0:  CHARGE_FAILED webhook -> grace_period_ends_at set (Story 27.8)
Day 1:  Cron sends "payment overdue" email
Day 5:  Cron sends "URGENT: 2 days remaining" email
Day 7:  Cron: grace_period_ends_at reached -> ACTIVE -> SUSPENDED
Day 37: Cron: 30 days suspended -> SUSPENDED -> CANCELLED
Day 127: Cron: 90 days cancelled -> create PENDING purge job
```

### Project Structure Notes

**New files:**
```
apps/hub-api/src/
  services/
    subscription-state-machine.ts   # validateTransition(), transitionOrg()
  __tests__/
    subscription-state-machine.test.ts
    subscription-read-only.test.ts
    subscription-lifecycle-cron.test.ts
    data-purge.test.ts

supabase/functions/
  subscription-lifecycle/
    index.ts                        # Edge Function: daily cron job
```

**Modified files:**
- `apps/hub-api/src/trpc/middleware/` -- entitlement middleware updated for read-only mode (Story 27.3)
- `apps/hub-api/src/trpc/routers/billing.ts` -- add `confirmPurge` and `cancelPurge` mutations (created in Story 27.8)
- `apps/hub-api/src/services/billing-notifications.ts` -- extend with transition email templates (created in Story 27.8)

**Database additions:**
- New table: `data_purge_jobs` with RLS (PLATFORM_ADMIN only)
- New columns on `organizations`: `cancelled_at TIMESTAMPTZ`, `suspended_at TIMESTAMPTZ`
- pg_cron schedule: `subscription-lifecycle-daily` running at 02:00 UTC

**Interaction with Story 27.8:**
- Story 27.8 creates the billing webhook handler that sets `grace_period_ends_at` on charge failure
- This story's cron job reads `grace_period_ends_at` to trigger the ACTIVE -> SUSPENDED transition
- Story 27.8 creates `billing-notifications.ts` -- this story extends it with transition-specific email templates
- Story 27.8 creates the billing router -- this story adds purge management mutations to it

### References

- Epic 27 stories and architecture: `_bmad-output/planning-artifacts/epics.md` (line ~1933)
- Organizations table schema: Story 27.1 (`_bmad-output/implementation-artifacts/27-1-tenant-organization-data-model.md`)
- Entitlement middleware: Story 27.3 (creates the middleware this story modifies)
- Billing integration: Story 27.8 (`_bmad-output/implementation-artifacts/27-8-billing-integration.md`)
- tRPC router registration: `apps/hub-api/src/trpc/routers/_app.ts`
- Audit logger pattern: `packages/audit-logger/src/index.ts`
- Supabase Edge Functions: `supabase/functions/`
- Supabase pg_cron docs: https://supabase.com/docs/guides/functions/schedule-functions
- CLAUDE.md: "All billing events are audit-logged (amounts and provider refs only -- no card details ever stored or logged)"
- CLAUDE.md: "ALL database operations MUST use Supabase MCP tools"
- Depends on: Story 27.1 (organizations table), Story 27.2 (org_subscriptions), Story 27.8 (billing events, grace period, notifications service)
- Depended on by: Story 27.10+ (patient-facing stories rely on org status being correctly managed)

## Dev Agent Record

### Implementation Plan
- Tasks 1 + 6 implemented together: `transitionOrg()` integrates state validation, audit events, and email notifications in a single function
- Task 2: Supabase MCP migrations for `cancelled_at` and `suspended_at` columns; verified `trial_ends_at` and `grace_period_ends_at` already exist
- Task 3: Extended `enforceEntitlement()` with org status check BEFORE module entitlement, added `enforceOrgStatus()` standalone middleware
- Task 4: Created `data_purge_jobs` table with RLS (PLATFORM_ADMIN only), added `confirmPurge`/`cancelPurge` mutations to billing router
- Task 5: Created Supabase Edge Function for daily cron at 02:00 UTC; enabled pg_cron and pg_net extensions; inline state machine logic (Edge Functions can't import from hub-api)
- Task 7: 4 test files, 39 tests total, all passing

### Debug Log
- pg_cron extension not pre-enabled; added migration to enable `pg_cron` and `pg_net` before scheduling
- Used `extensions.http_post` instead of `net.http_post` for pg_net compatibility with Supabase schema
- Edge Function uses inline state machine logic (cannot import TypeScript modules from hub-api)

### Completion Notes
- All 7 tasks complete, all 39 new tests passing
- 29 pre-existing test file failures (all `ioredis` module resolution — unrelated to this story)
- No regressions introduced by this story's changes
- `enforceEntitlement()` backward compatible: new `procedureType` param defaults to `'query'`

## File List

### New Files
- `apps/hub-api/src/services/subscription-state-machine.ts` — validateTransition(), transitionOrg()
- `supabase/functions/subscription-lifecycle/index.ts` — Daily cron Edge Function
- `apps/hub-api/src/__tests__/subscription-state-machine.test.ts` — 19 tests
- `apps/hub-api/src/__tests__/subscription-read-only.test.ts` — 8 tests
- `apps/hub-api/src/__tests__/subscription-lifecycle-cron.test.ts` — 6 tests
- `apps/hub-api/src/__tests__/data-purge.test.ts` — 6 tests

### Modified Files
- `apps/hub-api/src/trpc/middleware/enforceEntitlement.ts` — Added org status check (read-only mode), `enforceOrgStatus()`, `procedureType` param
- `apps/hub-api/src/trpc/routers/billing.ts` — Added `confirmPurge` and `cancelPurge` mutations
- `apps/hub-api/src/services/billing-notifications.ts` — Added 6 transition-specific email templates

### Database Changes (via Supabase MCP)
- Migration: `add_org_lifecycle_columns` — `cancelled_at`, `suspended_at` on organizations
- Migration: `create_data_purge_jobs` — New table with RLS policies
- Migration: `enable_pg_cron_and_pg_net` — Extensions for scheduled functions
- Migration: `schedule_subscription_lifecycle_cron` — pg_cron schedule at 02:00 UTC

### Review Findings

- [x] [Review][Decision] D1: SUBSCRIPTION_CANCELLED webhook doesn't transition org status — Fixed: added org cancellation check after last subscription cancelled
- [x] [Review][Decision] D2: billing_handle_charge_success RPC bypasses transitionOrg() — Fixed: replaced RPC with grace period clearing + transitionOrg() for SUSPENDED→ACTIVE
- [x] [Review][Decision] D3: SUSPENDED orgs get full read/write access — Fixed: added SUSPENDED check to enforceEntitlement and enforceOrgStatus (blocks all access)
- [x] [Review][Decision] D4: Audit failure silently swallowed in transitionOrg() — Fixed: escalated to console.error + dead-letter queue via notification_queue
- [x] [Review][Decision] D5: ADMIN bypass skips CANCELLED org read-only check — Fixed: only PLATFORM_ADMIN bypasses org status; ADMIN falls through to status check
- [x] [Review][Patch] P1: Hub-api transitionOrg lacks optimistic concurrency — Fixed: added `.eq('status', currentStatus)` + row count check
- [x] [Review][Patch] P2: Edge Function transitionOrg doesn't verify rows affected — Fixed: added row count check after optimistic lock
- [x] [Review][Patch] P3: X-Org-Read-Only header never set on HTTP responses — Fixed: added `responseMeta` to fetchRequestHandler
- [x] [Review][Patch] P4: CANCELLED org with cancelled_at=null bypasses all restrictions — Fixed: moved read-only enforcement outside `if (cancelledAt)` guard
- [x] [Review][Patch] P5: Grace period warning emails lack deduplication — Fixed: added `wasNotificationSentRecently()` check (48h window)
- [x] [Review][Patch] P6: Purge job creation TOCTOU race — Fixed: added unique constraint violation handling (code 23505)
- [x] [Review][Patch] P7: confirmPurge/cancelPurge TOCTOU race — Fixed: added `.eq('status', 'PENDING')` to UPDATE + row count check
- [x] [Review][Patch] P8: Missing test for CANCELLED org with null cancelled_at — Fixed: added 2 test cases (query passes as read-only, mutation blocked)
- [x] [Review][Defer] W1: Supabase query builder chain mutation bug in billing webhook handlers [billing.ts:130-141, 209-220] — deferred, pre-existing (Story 27.8). Conditional `.eq()` on query builder may not scope correctly.
- [x] [Review][Defer] W2: Edge function auth check only validates header format [subscription-lifecycle/index.ts:65-68] — deferred, standard Supabase pattern. Token value never verified.
- [x] [Review][Defer] W3: Edge Function cron logic not directly tested [subscription-lifecycle-cron.test.ts] — deferred, tests import hub-api transitionOrg rather than Edge Function inline version
- [x] [Review][Defer] W4: State machine logic duplicated between hub-api and Edge Function — deferred, acknowledged architectural limitation (Edge Functions can't import from hub-api)

## Change Log

- 2026-05-15: Story 27.9 implemented — subscription state machine, read-only mode, data purge scheduling, lifecycle cron job, audit events, email notifications, and 39 tests
- 2026-05-15: Code review completed — 5 decision-needed, 8 patch, 4 deferred, 7 dismissed
- 2026-05-15: All 13 review findings patched — optimistic concurrency, SUSPENDED access block, ADMIN bypass fix, audit dead-letter, X-Org-Read-Only header, null cancelled_at handling, TOCTOU race fixes, email deduplication
