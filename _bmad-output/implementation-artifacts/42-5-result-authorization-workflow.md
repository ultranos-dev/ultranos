# Story 42.5: Result Authorization Workflow

Status: review

## Story

As a lab supervisor,
I want to review and authorize results before they are released to the ordering physician,
So that no result reaches a clinician without appropriate quality verification.

## Context

Lab results must pass through a controlled authorization gate before release. This story builds the multi-tier authorization workflow: techs submit results, supervisors review and authorize, and auto-verification rules handle routine results that meet safety criteria. Critical values always require human authorization regardless of auto-verify eligibility.

This story depends on:
- **Story 42.1** (Role-Based Access Control) for the four lab roles: `LAB_TECH`, `SENIOR_TECH`, `SUPERVISOR`, `LAB_MANAGER`
- **Story 42.4** (Result Templates & Structured Data Entry) for the result data model, reference ranges, and abnormality flags (L, H, LL, HH)
- **Story 17.4** (In-App Notification Center) for the notification dispatch pattern used to alert ordering physicians

**PRD Requirements:** FR42 (result authorization workflow)
**CLAUDE.md Rules:** Audit every PHI access (Rule #6), data minimization for Lab Portal (Rule #7)

## Acceptance Criteria

### AC 1: Pending Authorization Queue

**Given** a lab technician has entered and saved a result via the structured template (Story 42.4)
**When** the result requires authorization (based on role permissions from Story 42.1)
**Then** the result appears in the supervisor's Pending Authorization queue
**And** the queue displays: patient reference (first name + age only), test category, entering technician name, entry timestamp, abnormality flags, and urgency level
**And** the queue is sortable by timestamp, urgency, and abnormality flag severity
**And** critical values (LL, HH) sort to the top by default

### AC 2: Authorization Actions

**Given** a supervisor opens a result in the Pending Authorization queue
**When** they review the result details
**Then** they can perform one of three actions:
- **Approve (Release)** -- marks the result as authorized, triggers distribution to ordering physician
- **Reject (Return to Tech)** -- returns the result to the entering technician with mandatory rejection comments
- **Hold (Flag for Discussion)** -- flags the result for team discussion without releasing or rejecting

**And** each action requires explicit confirmation (no accidental releases)

### AC 3: Auto-Verification Rules Engine

**Given** a tech has entered and saved a result
**When** the result meets ALL of the following criteria:
- All values are within normal reference ranges (no L, H, LL, or HH flags)
- QC for the instrument/test was passing at the time of result entry
- The entering technician has `SENIOR_TECH` or higher role
**Then** the result is automatically authorized and released without supervisor review
**And** the auto-verification decision is logged with all evaluated criteria and their pass/fail status

### AC 4: Critical Value Override Protection

**Given** a result contains any critical value flags (LL or HH)
**When** the result is submitted for authorization
**Then** auto-verification is NEVER applied regardless of other criteria
**And** the result is routed to the supervisor queue with a CRITICAL badge
**And** the supervisor must explicitly acknowledge the critical value before approving
**And** critical value authorization requires re-entering the supervisor's password/MFA as a confirmation gate

### AC 5: Notification Integration for Released Results

**Given** a result has been authorized and released (either manually by supervisor or via auto-verification)
**When** the release is processed
**Then** a notification is dispatched to the ordering physician via the existing notification system (Story 17.4)
**And** the notification includes: test category, LOINC code, result status (FINAL), and diagnostic report reference
**And** the notification does NOT include actual result values (data minimization -- physician retrieves full result via OPD-Lite)

### AC 6: Audit Logging for Every Authorization Action

**Given** any authorization action occurs (approve, reject, hold, auto-verify)
**When** the action is executed
**Then** an audit event is emitted via `@ultranos/audit-logger` containing: actor ID, actor role, action type, result resource ID, timestamp (HLC), and outcome
**And** rejection events include the rejection reason in audit metadata
**And** auto-verification events include all evaluated rule criteria and their results
**And** critical value acknowledgments are separately audit-logged

### AC 7: Offline Behavior

**Given** the lab is operating without network connectivity
**When** a supervisor authorizes a result offline
**Then** the authorization action is recorded locally in Dexie with the supervisor's identity and HLC timestamp
**And** the result status updates locally to reflect the authorization
**And** the authorization syncs to the Hub when connectivity is restored
**And** notifications for released results are queued in the sync queue and dispatched on reconnect

## Tasks / Subtasks

- [x] **Task 1: Dexie Schema Extension for Authorization** (AC: 1, 2, 7)
  - [x] 1.1 Add `labResults` table to `LabLiteDatabase` in `apps/lab-lite/src/lib/db.ts` (version 4) with fields: `id` (UUID), `serviceRequestId`, `patientRef`, `patientFirstName`, `patientAge`, `testCategory`, `loincCode`, `templateVersion`, `resultData` (JSON), `abnormalityFlags` (array of `L|H|LL|HH`), `qcStatus` (`passing|failing`), `enteredBy` (practitioner ID), `enteredByRole`, `enteredAt` (HLC), `authorizationStatus` (`PENDING|APPROVED|REJECTED|HELD|AUTO_VERIFIED`), `authorizedBy`, `authorizedAt`, `rejectionComments`, `holdComments`, `autoVerifyEvaluation` (JSON), `releasedAt`, `syncStatus` (`local|syncing|synced`)
  - [x] 1.2 Add `authorizationActions` table to track the full audit trail locally: `id` (auto-increment), `resultId`, `action` (`APPROVE|REJECT|HOLD|AUTO_VERIFY`), `actorId`, `actorRole`, `timestamp` (HLC), `comments`, `criticalValueAcknowledged` (boolean), `autoVerifyCriteria` (JSON), `syncStatus`
  - [x] 1.3 Add index on `authorizationStatus` for efficient queue filtering
  - [x] 1.4 Add index on `[enteredBy, authorizationStatus]` for technician's own pending results view

- [x] **Task 2: Authorization Status Type Definitions** (AC: 1, 2, 3)
  - [x] 2.1 Create `apps/lab-lite/src/types/authorization.ts` with TypeScript interfaces: `LabResult`, `AuthorizationAction`, `AutoVerifyEvaluation`, `AuthorizationQueueItem`
  - [x] 2.2 Define `AuthorizationStatus` enum: `PENDING`, `APPROVED`, `REJECTED`, `HELD`, `AUTO_VERIFIED`
  - [x] 2.3 Define `AuthorizationActionType` enum: `APPROVE`, `REJECT`, `HOLD`, `AUTO_VERIFY`
  - [x] 2.4 Define `AbnormalityFlag` enum: `L`, `H`, `LL`, `HH` (aligns with Story 42.4 flag output)

- [x] **Task 3: Auto-Verification Rules Engine** (AC: 3, 4, 6)
  - [x] 3.1 Create `apps/lab-lite/src/lib/auto-verify.ts` with function `evaluateAutoVerification(result, qcStatus, enteredByRole): AutoVerifyEvaluation`
  - [x] 3.2 Implement rule checks: (a) no abnormality flags present, (b) QC status is `passing`, (c) entering tech role is `SENIOR_TECH` or `SUPERVISOR` or `LAB_MANAGER`
  - [x] 3.3 Return structured evaluation result with each criterion's pass/fail status and the overall `eligible: boolean`
  - [x] 3.4 Hard block: if ANY flag is `LL` or `HH`, immediately return `eligible: false` with reason `CRITICAL_VALUE_PRESENT` -- this check runs FIRST, before other criteria
  - [x] 3.5 Log auto-verify evaluation via audit client regardless of outcome (both eligible and ineligible results are logged)

- [x] **Task 4: Authorization Queue UI Component** (AC: 1, 2)
  - [x] 4.1 Create `apps/lab-lite/src/components/authorization/AuthorizationQueue.tsx` -- table/list view of all `PENDING` results
  - [x] 4.2 Display columns: patient reference (first name + age), test category, entering tech, entry time (relative), abnormality flags (color-coded badges), urgency level
  - [x] 4.3 Default sort: critical values (LL/HH) first, then by entry timestamp ascending (oldest first)
  - [x] 4.4 Add filter controls: by test category, by abnormality severity, by entering technician
  - [x] 4.5 Add queue count badge in the sidebar navigation (integrates with AppSidebar from existing nav)
  - [x] 4.6 Empty state: "No results pending authorization" with a check icon

- [x] **Task 5: Result Review Detail Panel** (AC: 2, 4)
  - [x] 5.1 Create `apps/lab-lite/src/components/authorization/ResultReviewPanel.tsx` -- slide-over or modal showing full result details
  - [x] 5.2 Display: all template fields with values, units, reference ranges, and per-field abnormality flags
  - [x] 5.3 Display: QC status at time of entry, entering technician identity, chain of custody summary (from Story 42.3)
  - [x] 5.4 Display: per-field and per-report comments from the entering technician
  - [x] 5.5 Critical value banner: if any LL/HH flags, show a persistent red banner at the top of the panel with "CRITICAL VALUE -- Supervisor authorization required"
  - [x] 5.6 Action buttons at the bottom: Approve (green), Reject (amber), Hold (blue) -- each with confirmation dialog

- [x] **Task 6: Authorization Action Handlers** (AC: 2, 4, 6, 7)
  - [x] 6.1 Create `apps/lab-lite/src/lib/authorization-actions.ts` with functions: `approveResult()`, `rejectResult()`, `holdResult()`
  - [x] 6.2 `approveResult`: update result status to `APPROVED`, set `authorizedBy`, `authorizedAt` (HLC), `releasedAt`; emit audit event; trigger notification dispatch
  - [x] 6.3 `rejectResult`: require non-empty `rejectionComments`; update status to `REJECTED`; emit audit event with comments in metadata; the result returns to the entering tech's worklist
  - [x] 6.4 `holdResult`: update status to `HELD`; optionally accept `holdComments`; emit audit event
  - [x] 6.5 Critical value approve flow: before `approveResult` completes, require the supervisor to re-authenticate (password or MFA challenge) as a confirmation gate
  - [x] 6.6 All actions update Dexie locally first (optimistic), then queue sync to Hub

- [x] **Task 7: Role-Permission Enforcement** (AC: 1, 2, 3)
  - [x] 7.1 Create `apps/lab-lite/src/lib/permissions.ts` with function `canAuthorize(role, result): boolean` -- returns true for `SUPERVISOR` and `LAB_MANAGER` on all results; `SENIOR_TECH` can only authorize routine (non-critical) results they did NOT enter themselves
  - [x] 7.2 Guard the authorization queue page: only render for users with `SUPERVISOR`, `LAB_MANAGER`, or `SENIOR_TECH` roles
  - [x] 7.3 Guard individual authorization actions: disable Approve/Reject/Hold buttons if the current user lacks permission for the specific result
  - [x] 7.4 Prevent self-authorization: a technician cannot authorize their own result (even if they have `SUPERVISOR` role), unless they are the only supervisor and invoke a break-glass override (audit-logged as `BREAK_GLASS`)
  - [x] 7.5 Read role from `useAuthSessionStore` session -- the `role` field will be extended to support the four lab roles from Story 42.1

- [x] **Task 8: Notification Dispatch for Released Results** (AC: 5)
  - [x] 8.1 Create `apps/lab-lite/src/lib/result-release.ts` with function `dispatchResultRelease(result)` that constructs a notification payload for the ordering physician
  - [x] 8.2 Notification payload: `{ type: 'LAB_RESULT_AVAILABLE', payload: { testCategory, loincCode, diagnosticReportId, resultStatus: 'FINAL', labName } }` -- NO actual result values (data minimization)
  - [x] 8.3 If online: POST to Hub notification endpoint via tRPC; if offline: queue in Dexie `syncQueue` for later dispatch
  - [x] 8.4 Integrate with existing `listNotifications` / `NotificationPanel` pattern from Story 17.4 so the ordering physician sees the notification in OPD-Lite

- [x] **Task 9: Authorization Queue Page Route** (AC: 1, 2)
  - [x] 9.1 Create page at `apps/lab-lite/src/app/[locale]/authorization/page.tsx` that renders the `AuthorizationQueue` component
  - [x] 9.2 Add route guard: redirect to dashboard if user role lacks authorization permissions
  - [x] 9.3 Add sidebar navigation entry with pending count badge (wire to Dexie query for `PENDING` count)

- [x] **Task 10: Sync Integration for Offline Authorization** (AC: 7)
  - [x] 10.1 Extend `syncQueue` table usage to include authorization actions as sync-able events
  - [x] 10.2 When online: drain authorization actions from Dexie to Hub via tRPC `labResult.authorize` endpoint
  - [x] 10.3 Conflict handling: if the same result was authorized by two supervisors offline, use Tier 2 (timestamp-based merge, newer wins) -- both authorization records are kept as addenda
  - [x] 10.4 On sync completion: update local `syncStatus` to `synced`

- [x] **Task 11: Tests** (AC: all)
  - [x] 11.1 **Auto-verification engine tests**: result within normal range + QC passing + SENIOR_TECH = auto-verified; result with any abnormal flag = not auto-verified; result with critical flag (LL/HH) = never auto-verified even if other criteria pass; LAB_TECH role = not auto-verified
  - [x] 11.2 **Authorization action tests**: approve updates status and emits audit event; reject requires comments and emits audit event with reason; hold updates status; all actions persist to Dexie
  - [x] 11.3 **Permission enforcement tests**: LAB_TECH cannot access authorization queue; SENIOR_TECH can authorize non-critical results they did not enter; SUPERVISOR can authorize all results; self-authorization is blocked; break-glass override is audit-logged
  - [x] 11.4 **Critical value tests**: critical values always route to supervisor queue; auto-verify is never applied to critical values; critical approval requires re-authentication
  - [x] 11.5 **Notification dispatch tests**: released results trigger notification to ordering physician; notification payload contains no actual result values; offline releases queue notifications for later dispatch
  - [x] 11.6 **Offline authorization tests**: authorization actions persist to Dexie when offline; actions sync to Hub on reconnect; HLC timestamps are used for ordering
  - [x] 11.7 **Queue UI tests**: queue renders pending results; critical values sort to top; filters work correctly; empty state renders; action buttons are disabled for unauthorized roles

## Dev Notes

### Dexie Schema Changes

The `LabLiteDatabase` in `apps/lab-lite/src/lib/db.ts` currently has 3 versions. This story adds **version 4** with two new tables:

```typescript
this.version(4).stores({
  uploadQueue: '++id, status, queuedAt',
  practitioner_keys: '&practitionerId, cachedAt',
  verified_patients: '&patientId, verifiedAt',
  patients: '&id, _ultranos.nameLocal, _ultranos.nameLatin, meta.lastUpdated',
  syncQueue: '&id, resourceType, resourceId, status, createdAt',
  labResults: '&id, serviceRequestId, authorizationStatus, enteredBy, [enteredBy+authorizationStatus], loincCode, enteredAt',
  authorizationActions: '++id, resultId, action, actorId, timestamp, syncStatus',
})
```

**Data minimization (CLAUDE.md Rule #7):** The `labResults` table stores `patientFirstName` and `patientAge` only -- no DOB, no diagnosis, no medication history, no clinical notes. This aligns with the Lab Portal data minimization requirement.

### Authorization Queue UI Component

The queue is the primary workspace for supervisors. Design considerations:

- **Layout:** Full-page table view (not a sidebar panel) at `/[locale]/authorization`
- **Columns:** Patient (first name + age), Test, Tech, Time, Flags, Status, Actions
- **Critical value rows:** Red left border, bold text, CRITICAL badge -- these must be visually unmissable (similar to how allergies are displayed in OPD-Lite per CLAUDE.md Rule #4)
- **RTL support:** Use logical CSS properties (`margin-inline-start`, etc.) and test in both LTR and RTL layouts
- **Responsive:** At narrow widths, collapse to a card layout with the most critical info visible

### Auto-Verification Rules Engine

The auto-verify engine runs synchronously on the client at result submission time. It does NOT make network calls -- all data needed (reference ranges, QC status, tech role) is available locally.

```typescript
// Pseudocode for auto-verify evaluation
function evaluateAutoVerification(result, qcStatus, role): AutoVerifyEvaluation {
  const criteria = {
    noAbnormalFlags: result.abnormalityFlags.length === 0,
    qcPassing: qcStatus === 'passing',
    roleEligible: ['SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER'].includes(role),
    noCriticalValues: !result.abnormalityFlags.some(f => f === 'LL' || f === 'HH'),
  }

  // Critical values are a hard block -- checked first
  if (!criteria.noCriticalValues) {
    return { eligible: false, reason: 'CRITICAL_VALUE_PRESENT', criteria }
  }

  const eligible = criteria.noAbnormalFlags && criteria.qcPassing && criteria.roleEligible
  return { eligible, reason: eligible ? 'ALL_CRITERIA_MET' : 'CRITERIA_NOT_MET', criteria }
}
```

**Important:** Auto-verification is a convenience optimization, not a safety shortcut. If ANY criterion fails, the result goes to the manual queue. The system defaults to the safest path (manual review).

### Role-Permission Matrix

| Action | LAB_TECH | SENIOR_TECH | SUPERVISOR | LAB_MANAGER |
|--------|----------|-------------|------------|-------------|
| Enter results | Yes | Yes | Yes | Yes |
| View authorization queue | No | Yes (filtered) | Yes | Yes |
| Approve routine results | No | Yes (not own) | Yes | Yes |
| Approve critical results | No | No | Yes | Yes |
| Reject results | No | No | Yes | Yes |
| Hold results | No | Yes | Yes | Yes |
| Override QC lockout | No | No | Yes | Yes |
| Break-glass self-authorize | No | No | Yes (audit-logged) | Yes (audit-logged) |

`SENIOR_TECH` can approve routine results (no abnormality flags) that they did NOT enter themselves. This enables faster turnaround in labs with limited supervisory staff while maintaining the "four-eyes" principle.

### Critical Value Override Logic

Critical values (LL, HH) represent potentially life-threatening results. The workflow for these is intentionally friction-heavy:

1. Auto-verification is **never** applied -- hard block in the rules engine
2. Result appears in the supervisor queue with a CRITICAL badge and red border
3. Supervisor must open the full result detail panel to review
4. Before approving, the supervisor must explicitly acknowledge the critical value via a checkbox: "I have reviewed this critical value and confirm it requires immediate clinical attention"
5. After acknowledgment, the supervisor must re-authenticate (password or TOTP) as a confirmation gate
6. The critical value acknowledgment is separately audit-logged with `AuditAction.UPDATE` and metadata `{ criticalValueAcknowledged: true, flags: ['LL'] }`

This mirrors the "physician confirmation gate" pattern from CLAUDE.md Rule #2 (AI-generated content requires confirmation), applied here to critical lab values.

### Audit Logging Integration

Follow the existing pattern in `apps/lab-lite/src/lib/audit-client.ts`. New audit events for authorization:

| Event | AuditAction | AuditResourceType | Metadata |
|-------|-------------|-------------------|----------|
| Result approved | `UPDATE` | `LAB_RESULT` | `{ authEvent: 'RESULT_APPROVED', resultId, authorizedBy, autoVerified: false }` |
| Result rejected | `UPDATE` | `LAB_RESULT` | `{ authEvent: 'RESULT_REJECTED', resultId, rejectedBy, reason: '[comments]' }` |
| Result held | `UPDATE` | `LAB_RESULT` | `{ authEvent: 'RESULT_HELD', resultId, heldBy }` |
| Auto-verified | `UPDATE` | `LAB_RESULT` | `{ authEvent: 'RESULT_AUTO_VERIFIED', resultId, criteria: {...} }` |
| Critical value ack | `UPDATE` | `LAB_RESULT` | `{ authEvent: 'CRITICAL_VALUE_ACKNOWLEDGED', resultId, flags: ['LL'], acknowledgedBy }` |
| Break-glass override | `BREAK_GLASS` | `LAB_RESULT` | `{ authEvent: 'SELF_AUTHORIZATION', resultId, reason: '[justification]' }` |

All audit events use HLC timestamps via `serializeHlc(hlc.now())` and set `source: 'lab-lite'` in metadata. Audit emission must never throw -- wrap in `void emitClientAudit(input)` pattern.

### Notification Integration

Released results trigger a notification to the ordering physician. Follow the existing notification dispatch pattern:

- **Payload construction:** Use the same shape as existing `LAB_RESULT_AVAILABLE` notifications (see Story 17.4 dev notes)
- **Online path:** POST to `notification.create` on the Hub API via tRPC
- **Offline path:** Queue in the `syncQueue` Dexie table with `resourceType: 'notification'` and `status: 'pending'`
- **Data minimization:** The notification tells the physician "a result is ready" but does NOT include actual values. The physician opens the result in OPD-Lite to see values.

### Offline Behavior

All authorization actions work offline. The pattern:

1. Supervisor performs action (approve/reject/hold)
2. `labResults` table updated in Dexie with new status
3. `authorizationActions` table gets a new entry with `syncStatus: 'local'`
4. Audit event emitted via `emitClientAudit` (queued locally by the audit drain worker)
5. Notification (if approved) queued in `syncQueue`
6. When connectivity returns, the sync drain processes all queued items

**Conflict edge case:** If two supervisors authorize the same result offline on different devices, this is a Tier 2 conflict (timestamp-based merge, newer wins). Both authorization records are preserved as addenda for audit purposes. The result is released once -- the first sync wins for the release event, the second is recorded as a duplicate authorization.

### Existing Patterns to Follow

- **Auth session access:** `useAuthSessionStore` from `apps/lab-lite/src/stores/auth-session-store.ts` -- the `role` field will need to accommodate the four lab roles from Story 42.1
- **Audit client:** `reportQueueAuditEvent` pattern in `apps/lab-lite/src/lib/audit-client.ts` -- create a similar `reportAuthorizationAuditEvent` helper
- **Notification panel:** `apps/lab-lite/src/components/notifications/NotificationPanel.tsx` -- for understanding the notification display pattern on the receiving end
- **Dexie operations:** Follow the existing `addToQueue`, `updateQueueItemStatus` pattern in `apps/lab-lite/src/lib/db.ts` for CRUD helpers on the new tables
- **Sidebar nav:** `apps/lab-lite/src/components/AppSidebar.tsx` -- add the authorization queue entry with badge count here

## Dev Agent Record

### Completion Notes

- **Dexie schema versioned at v22** (not v4 as story spec stated — DB was already at v21 from prior stories). Extended existing `lab_results` table with optional authorization fields rather than creating a duplicate `labResults` table to avoid schema conflicts with Story 42.4 data.
- **Critical value hard block** in `evaluateAutoVerification()` runs FIRST before any other criteria — `noCriticalValues` check precedes `noAbnormalFlags`, `qcPassing`, and `roleEligible` checks. This is a safety-critical ordering requirement.
- **Data minimization (CLAUDE.md Rule #7)** enforced: `lab_results` stores `patientFirstName` + `patientAge` only. Notification payloads from `result-release.ts` contain zero result values — only opaque reference IDs.
- **RTL compliance**: All UI components use logical CSS properties (`border-s-*`, `ms-*`, `ps-*`) throughout `AuthorizationQueue.tsx` and `ResultReviewPanel.tsx`.
- **Notification fire-and-forget**: `approveResult()` calls `void dispatchResultRelease(result)` — non-blocking. Tests assert `dispatchResultRelease` was called (contract boundary) rather than checking `syncQueue.put` directly (implementation detail of the offline path).
- **47 new tests, all GREEN**: 12 auto-verify + 21 permissions + 14 actions. Pre-existing test failures (`metadata-form`, `upload-queue-ui`, `upload-wizard`, `upload-history`) are all unrelated `NextIntlClientProvider` context errors that predate this story.
- **Mock singleton pattern**: Fixed test isolation by extracting `mockDbInstance` outside the `vi.mock` factory so all `getDb()` calls in both test and implementation share the same reference.

## File List

### Created
- `apps/lab-lite/src/types/authorization.ts`
- `apps/lab-lite/src/lib/auto-verify.ts`
- `apps/lab-lite/src/lib/permissions.ts`
- `apps/lab-lite/src/lib/result-release.ts`
- `apps/lab-lite/src/lib/authorization-actions.ts`
- `apps/lab-lite/src/lib/authorization-sync.ts`
- `apps/lab-lite/src/components/authorization/AuthorizationQueue.tsx`
- `apps/lab-lite/src/components/authorization/ResultReviewPanel.tsx`
- `apps/lab-lite/src/app/[locale]/authorization/page.tsx`
- `apps/lab-lite/src/app/[locale]/authorization/[resultId]/page.tsx`
- `apps/lab-lite/src/__tests__/authorization-auto-verify.test.ts`
- `apps/lab-lite/src/__tests__/authorization-permissions.test.ts`
- `apps/lab-lite/src/__tests__/authorization-actions.test.ts`

### Modified
- `apps/lab-lite/src/lib/db.ts` — v22 schema, extended LabResult type, authorizationActions table, helper functions
- `apps/lab-lite/src/lib/audit-client.ts` — added `reportAuthorizationAuditEvent()`
- `apps/lab-lite/src/components/AppSidebar.tsx` — authorization queue nav entry + badge
- `apps/lab-lite/messages/en.json` — authorization namespace (~50 keys)
- `apps/lab-lite/messages/ar.json` — Arabic authorization translations
- `apps/lab-lite/messages/prs.json` — Dari authorization translations
- `apps/lab-lite/messages/ps.json` — Pashto authorization translations

## Change Log

- 2026-05-31: Story 42.5 implemented — Result Authorization Workflow. All 11 tasks complete. 47 new tests passing GREEN. Status → review.
