# Story 51.3: Sample Collision Prevention

Status: ready-for-dev

## Story

As a lab technician,
I want the system to prevent two techs from accidentally processing the same sample,
So that duplicate runs are eliminated and reagent is not wasted.

## Context

In a multi-tech lab, two technicians may inadvertently pick up the same sample for processing, wasting expensive reagents and creating conflicting results. This story implements a sample locking mechanism in Dexie that prevents duplicate processing. When a tech starts processing a sample, it is locked to them. Other techs see a clear "locked by" indicator and cannot process the same sample. Locks auto-release after a configurable timeout (default 4 hours) with manager notification.

**PRD Requirements:** FR51 (brainstorm #45)
**Dependencies:** Story 42.3 (Sample Accessioning & Chain of Custody) — provides the sample lifecycle and status pipeline; Story 42.1 (Role-Based Access Control) — provides role hierarchy for manager notifications

## Acceptance Criteria

### AC 1: Sample Lock on Start Processing

**Given** a tech taps "Start Processing" on a sample
**When** no other tech has an active lock on that sample
**Then** the sample is locked to that tech with a `lockTimestamp` and `techId` in Dexie
**And** the sample status transitions to "In Processing"
**And** the lock is visible to other techs viewing the same sample

### AC 2: Duplicate Processing Prevention UI

**Given** a sample is locked by Tech A
**When** Tech B attempts to start processing the same sample
**Then** Tech B sees a blocking message: "This sample is currently being processed by {Tech A name} (started {lockTimestamp}). Duplicate run prevented."
**And** Tech B cannot proceed with processing
**And** Tech B has an option to "Request Release" which notifies Tech A and the lab manager

### AC 3: Lock Release on Result Entry

**Given** a sample is locked to a tech
**When** the tech enters and saves the result for that sample
**Then** the lock is automatically released
**And** the sample status transitions to "Completed" or the next pipeline stage
**And** the lock release is recorded in the sample's chain of custody

### AC 4: Manual Lock Release

**Given** a sample is locked to a tech
**When** the same tech explicitly taps "Release Sample"
**Then** the lock is released and the sample returns to the queue
**And** the sample status reverts to its pre-lock state
**And** a chain of custody entry records the manual release with reason

### AC 5: Auto-Release Timeout

**Given** a sample lock has been active for longer than the configured timeout
**When** the timeout threshold is reached (default: 4 hours, configurable per lab in settings)
**Then** the lock is automatically released
**And** the sample returns to the queue with a "Lock Expired" flag
**And** the lab manager receives a notification: "Sample {sampleId} lock expired — {Tech name} held it for {duration}"
**And** the auto-release is recorded in the chain of custody and audit log

### AC 6: Lock Visibility in Worklist

**Given** the lab worklist displays all samples
**When** a sample has an active lock
**Then** it shows a lock icon with the locking tech's name and start time
**And** locked samples are visually distinct (e.g., dimmed action buttons, lock badge)
**And** the lock indicator is consistent across all views (worklist, sample detail, search results)

### AC 7: Configurable Timeout

**Given** a lab manager wants to adjust the auto-release timeout
**When** they navigate to Settings > Lab Configuration
**Then** they can set the lock timeout in hours (minimum 1h, maximum 24h, default 4h)
**And** the setting is stored in Dexie and synced to Hub
**And** the setting applies to all future locks (existing locks use the timeout active at lock creation)

## Tasks / Subtasks

### Task 1: Dexie Schema — Sample Locks (AC: 1, 5, 7)

- [ ] Add version increment to `apps/lab-lite/src/lib/db.ts` with new tables:
  - `sample_locks`: `&sampleId, techId, lockedAt, expiresAt`
  - `lab_config`: `&key` (key-value store for lab-level settings)
- [ ] Define `SampleLock` interface:
  - `sampleId: string` (primary key — one lock per sample)
  - `techId: string`
  - `techName: string` (display name for the blocking message)
  - `lockedAt: string` (ISO 8601)
  - `expiresAt: string` (ISO 8601 — computed from lockedAt + timeout)
  - `status: 'ACTIVE' | 'RELEASED' | 'EXPIRED'`
- [ ] Define `LabConfig` interface:
  - `key: string` (primary key)
  - `value: string | number | boolean`
  - `updatedAt: string`
  - `updatedBy: string`

### Task 2: Lock Service (AC: 1, 2, 3, 4, 5)

- [ ] Create `apps/lab-lite/src/lib/sample-lock-service.ts`:
  - `acquireLock(sampleId: string, techId: string, techName: string): Promise<LockResult>`:
    - Check for existing active lock on the sample
    - If locked by same tech, return `{ success: true, alreadyLocked: true }`
    - If locked by different tech, return `{ success: false, lockedBy: techName, lockedAt }` 
    - If no lock, create lock record with expiry based on `lab_config.lockTimeoutHours`
    - Use Dexie transaction for atomicity
  - `releaseLock(sampleId: string, techId: string, reason: 'RESULT_ENTERED' | 'MANUAL' | 'EXPIRED' | 'REASSIGNED'): Promise<void>`:
    - Updates lock status to `RELEASED` or `EXPIRED`
    - Adds chain of custody entry
    - Emits audit event
  - `checkExpiredLocks(): Promise<ExpiredLock[]>`:
    - Queries `sample_locks` for active locks past `expiresAt`
    - Returns list for notification processing
  - `getActiveLock(sampleId: string): Promise<SampleLock | null>`:
    - Returns the active lock for a sample, or null
  - `requestRelease(sampleId: string, requestingTechId: string): Promise<void>`:
    - Creates a notification for the locking tech and lab manager
- [ ] Create `LockResult` type: `{ success: true; alreadyLocked?: boolean } | { success: false; lockedBy: string; lockedAt: string }`

### Task 3: Lock Expiry Background Check (AC: 5)

- [ ] Create `apps/lab-lite/src/lib/lock-expiry-checker.ts`:
  - Runs on a 5-minute interval (via `setInterval` in a layout component or service worker)
  - Calls `checkExpiredLocks()` from lock service
  - For each expired lock:
    - Auto-releases the lock
    - Flags the sample with `lockExpired: true`
    - Creates a notification for the lab manager
    - Emits audit event
- [ ] Create `apps/lab-lite/src/hooks/useLockExpiryChecker.ts`:
  - Hook that starts the interval on mount, clears on unmount
  - Used in the main lab-lite layout component

### Task 4: Lock UI — Start Processing Gate (AC: 1, 2)

- [ ] Modify sample processing flow (wherever "Start Processing" button exists):
  - Before transitioning sample to "In Processing", call `acquireLock()`
  - If lock acquired: proceed with processing
  - If lock failed: show blocking dialog with lock holder info and "Request Release" option
- [ ] Create `apps/lab-lite/src/components/samples/SampleLockBlocker.tsx`:
  - Dialog/modal shown when lock acquisition fails
  - Displays: "This sample is currently being processed by {name} (started {time}). Duplicate run prevented."
  - Buttons: "OK" (dismiss), "Request Release" (sends notification)
  - RTL-safe layout

### Task 5: Lock Indicators in Worklist (AC: 6)

- [ ] Create `apps/lab-lite/src/components/samples/LockIndicator.tsx`:
  - Reusable component showing lock status on a sample
  - Lock icon (padlock) with tech name and time tooltip
  - Used in worklist rows, sample detail views, and search results
- [ ] Modify existing sample list/worklist components to include `LockIndicator`
- [ ] Dimmed action buttons on locked samples for techs other than the lock holder

### Task 6: Manual Release UI (AC: 4)

- [ ] Add "Release Sample" button to the sample detail view when viewed by the locking tech
- [ ] Confirmation dialog: "Release sample {sampleId}? It will return to the queue."
- [ ] On confirm: call `releaseLock()` with reason `MANUAL`
- [ ] Sample status reverts to pre-lock state

### Task 7: Lock Timeout Configuration (AC: 7)

- [ ] Add to `apps/lab-lite/src/components/settings/LabSettingsView.tsx`:
  - "Lock Timeout" setting in Lab Configuration section
  - Number input with stepper (1-24 hours, default 4)
  - Only editable by LAB_MANAGER
  - Saves to `lab_config` Dexie table with key `lockTimeoutHours`
  - Syncs to Hub for cross-device consistency

### Task 8: Integration with Result Entry (AC: 3)

- [ ] Modify result entry save flow:
  - After result is saved, call `releaseLock()` with reason `RESULT_ENTERED`
  - Lock release is part of the result save transaction (or immediately after)
  - If lock release fails (e.g., already expired), log warning but do not block result save

### Task 9: Audit Integration

- [ ] Emit audit events for:
  - Lock acquired: `{ action: 'CREATE', resourceType: 'SAMPLE_LOCK', resourceId: sampleId, detail: { techId } }`
  - Lock released: `{ action: 'UPDATE', resourceType: 'SAMPLE_LOCK', resourceId: sampleId, detail: { techId, reason } }`
  - Lock expired: `{ action: 'UPDATE', resourceType: 'SAMPLE_LOCK', resourceId: sampleId, detail: { techId, reason: 'EXPIRED' } }`
  - Release requested: `{ action: 'CREATE', resourceType: 'SAMPLE_LOCK_REQUEST', resourceId: sampleId, detail: { requestingTechId, lockHolderTechId } }`
- [ ] Never include sample content or patient data in audit events

### Task 10: Internationalization

- [ ] Add i18n keys to all 5 locale files (`apps/lab-lite/messages/{en,ar,prs,ps,fa}.json`):
  - `lock.duplicatePrevented`: "Duplicate run prevented"
  - `lock.lockedBy`: "Currently being processed by {name} (started {time})"
  - `lock.requestRelease`: "Request Release"
  - `lock.releaseSample`: "Release Sample"
  - `lock.confirmRelease`: "Release sample {sampleId}? It will return to the queue."
  - `lock.expired`: "Lock Expired"
  - `lock.expiredNotification`: "Sample {sampleId} lock expired — {name} held it for {duration}"
  - `lock.timeoutSetting`: "Lock Timeout (hours)"
  - `lock.locked`: "Locked"

### Task 11: Testing

- [ ] Create `apps/lab-lite/src/__tests__/sample-lock-service.test.ts`:
  - Test lock acquisition succeeds when no existing lock
  - Test lock acquisition fails when locked by different tech
  - Test lock acquisition succeeds when locked by same tech (idempotent)
  - Test lock release updates status and chain of custody
  - Test expired lock detection
  - Test configurable timeout from lab_config
  - Test release request creates notification
- [ ] Create `apps/lab-lite/src/__tests__/lock-expiry-checker.test.ts`:
  - Test expired locks are auto-released
  - Test manager notification created for expired locks
  - Test interval-based checking
- [ ] Create `apps/lab-lite/src/__tests__/sample-lock-blocker.test.tsx`:
  - Test blocker dialog renders with lock holder info
  - Test "Request Release" button
  - Test dismiss button
  - Test RTL layout

## Dev Notes

### Architecture Decisions

**Locks are stored in a dedicated Dexie table, not as a field on the sample record.** This separation keeps the sample schema clean and allows lock operations (acquire, release, expire) to be managed independently. The `sampleId` is the primary key — only one active lock per sample.

**Lock acquisition uses Dexie transactions for local atomicity.** In a single-device scenario, this prevents race conditions. In a multi-device scenario (two techs on different devices), the Hub sync resolves conflicts by accepting the first lock (earliest `lockedAt` timestamp wins). This is an edge case — most small labs use a single shared device or coordinated workflows.

**The auto-release timeout is configurable per lab, not per instrument or test type.** For v1, a single timeout value covers all scenarios. A future story could add per-instrument timeouts if needed.

**Lock expiry check runs on a 5-minute polling interval.** This is simpler than a Service Worker timer and runs within the active PWA tab. If no tab is open, locks will be released on the next app load. The 5-minute granularity is acceptable for a 4-hour default timeout.

### Files to Create

| File | Purpose |
|---|---|
| `apps/lab-lite/src/lib/sample-lock-service.ts` | Lock acquire/release/expire logic |
| `apps/lab-lite/src/lib/lock-expiry-checker.ts` | Background lock expiry polling |
| `apps/lab-lite/src/hooks/useLockExpiryChecker.ts` | Hook to start/stop expiry checker |
| `apps/lab-lite/src/components/samples/SampleLockBlocker.tsx` | Lock collision dialog |
| `apps/lab-lite/src/components/samples/LockIndicator.tsx` | Reusable lock status indicator |
| `apps/lab-lite/src/__tests__/sample-lock-service.test.ts` | Lock service unit tests |
| `apps/lab-lite/src/__tests__/lock-expiry-checker.test.ts` | Expiry checker tests |
| `apps/lab-lite/src/__tests__/sample-lock-blocker.test.tsx` | Lock blocker UI tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/lab-lite/src/lib/db.ts` | Add `sample_locks` and `lab_config` tables |
| `apps/lab-lite/src/components/settings/LabSettingsView.tsx` | Add lock timeout configuration |
| Sample worklist/list components | Add `LockIndicator` to sample rows |
| Result entry save flow | Add lock release after result save |
| `apps/lab-lite/messages/en.json` | Add lock i18n keys |
| `apps/lab-lite/messages/ar.json` | Arabic translations |
| `apps/lab-lite/messages/prs.json` | Dari translations |
| `apps/lab-lite/messages/ps.json` | Pashto translations |
| `apps/lab-lite/messages/fa.json` | Farsi translations |

### Patterns to Follow

1. **Service pattern:** Business logic in `lib/` as async functions interacting with Dexie. Components call services, not Dexie directly.
2. **Dexie transaction pattern:** Use `db.transaction('rw', db.sample_locks, async () => { ... })` for atomic lock operations.
3. **Component pattern:** Dialog components follow the existing modal pattern in the codebase (overlay, card, action buttons).
4. **Notification pattern:** Follow existing notification system in `apps/lab-lite/src/components/notifications/` for manager alerts.
5. **Settings pattern:** Follow `LabSettingsView.tsx` — card-based layout, input fields with labels.

### Key Constraints from CLAUDE.md

- **PHI Rule:** Lock blocker messages show tech name and time — no patient data. Sample IDs are lab-internal IDs (LAB-YYYYMMDD-NNNN), not patient identifiers.
- **Audit Rule:** Every lock event (acquire, release, expire) must emit an audit event.
- **Offline-First Rule:** Lock mechanism works entirely in Dexie. No network required. Multi-device conflict resolution happens via sync.
- **RTL Rule:** Lock blocker dialog and lock indicators must work in both LTR and RTL.
- **Data Minimization Rule #7:** Lock records contain sample ID and tech ID only — no patient demographics.

### Potential Pitfalls

1. **Multi-device lock conflicts:** If two techs on separate devices lock the same sample before sync, both will see "locked." On sync, the Hub should accept the earlier lock and notify the later tech. This requires Hub-side lock conflict resolution (may need a Hub API endpoint or sync rule addition).

2. **Lock release on tab close:** If a tech closes the browser tab without releasing the lock, the lock persists until auto-expiry. The 4-hour default covers this case. Consider adding a `beforeunload` handler that warns about active locks (but cannot guarantee release).

3. **Lock timeout stored at creation time:** Each lock stores its `expiresAt` computed from the timeout active at lock creation. If the manager changes the timeout setting, existing locks keep their original expiry. This is intentional — changing timeout mid-lock could cause unexpected releases.

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.3 (line 6323)
- Story 42.3 (Sample Accessioning): `_bmad-output/implementation-artifacts/42-3-sample-accessioning-chain-of-custody.md`
- Story 42.1 (RBAC): `_bmad-output/implementation-artifacts/42-1-role-based-access-control.md`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Settings view: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
- Notification components: `apps/lab-lite/src/components/notifications/`
