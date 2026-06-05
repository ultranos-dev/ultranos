# Story 51.4: Equipment Booking & Scheduling

Status: in-progress

## Story

As a lab technician in a resource-constrained lab,
I want to queue my sample batches for shared instruments,
So that I know when it's my turn and can prepare accordingly.

## Context

Resource-constrained labs often have a single shared instrument for a test category (e.g., one CBC analyzer, one chemistry analyzer). Multiple techs queue batches throughout the day, leading to verbal coordination, idle waiting, and scheduling conflicts. This story introduces an instrument registry in Dexie, a batch queue per instrument, estimated completion/start times, next-in-line notifications, and manager queue override — bringing structured scheduling to shared lab equipment.

**PRD Requirements:** FR51 (brainstorm #46)
**Dependencies:** Story 42.1 (Role-Based Access Control) — provides role hierarchy for manager override; Story 42.4 (Result Templates) — provides test type to instrument mapping; Story 51.3 (Sample Collision Prevention) — sample lock awareness

## Acceptance Criteria

### AC 1: Instrument Registry

**Given** the lab has shared instruments
**When** a lab manager configures instruments in Settings
**Then** they can register instruments with: name, type (e.g., Hematology Analyzer, Chemistry Analyzer), model, serial number (optional), and average run time per batch (in minutes)
**And** instruments are stored in Dexie for offline access
**And** instruments can be marked as "In Service" or "Out of Service" with a reason
**And** out-of-service instruments cannot accept new batch bookings

### AC 2: Batch Queue per Instrument

**Given** an instrument is registered and in service
**When** a tech queues a batch for the instrument
**Then** the batch is added to the instrument's queue with: batch ID, tech ID, sample count, test type, queued timestamp, and estimated run time
**And** the queue displays in FIFO order with position numbers
**And** the current batch (position 1) shows: owner tech name, estimated completion time, and a progress indicator
**And** each queued batch shows: position, tech name, estimated start time (computed from preceding batches' run times)

### AC 3: Estimated Completion and Start Times

**Given** batches are queued for an instrument
**When** the queue is viewed
**Then** each batch shows:
- Estimated start time = completion time of the preceding batch (or "Now" if first in queue)
- Estimated completion time = start time + batch run time (from instrument's average or tech-specified override)
**And** times update dynamically as batches complete or are removed
**And** the current batch's estimated completion counts down in real-time

### AC 4: Next-in-Line Notifications

**Given** a tech has a batch queued (not in position 1)
**When** the batch ahead of theirs completes and their batch moves to position 1
**Then** the tech receives a notification: "Your batch for {instrument} is next. Prepare your samples."
**And** if the tech is not on the current view, the notification appears in the notification panel
**And** the notification includes the instrument name and estimated start time

### AC 5: Manager Queue Override

**Given** a lab manager views an instrument's queue
**When** they decide to reprioritize
**Then** they can reorder batches by dragging or using up/down controls
**And** they can remove a batch from the queue with a reason (returned to tech's pending work)
**And** they can insert an urgent batch at any position
**And** all affected techs receive updated position notifications
**And** queue reordering is audit-logged

### AC 6: Batch Lifecycle

**Given** a batch is in position 1 (current)
**When** the tech starts the instrument run
**Then** the batch status changes to "Running"
**When** the run completes
**Then** the tech marks it as "Completed"
**And** the next batch automatically moves to position 1
**And** the next-in-line tech is notified (AC 4)
**And** the completed batch is recorded in instrument history

## Tasks / Subtasks

### Task 1: Dexie Schema — Instrument & Queue Tables (AC: 1, 2)

- [ ] Add version increment to `apps/lab-lite/src/lib/db.ts` with new tables:
  - `instruments`: `&id, name, type, status`
  - `instrument_queue`: `&id, instrumentId, techId, position, status, [instrumentId+position]`
  - `instrument_history`: `&id, instrumentId, completedAt`
- [ ] Define `Instrument` interface:
  - `id: string` (UUID)
  - `name: string`
  - `type: string` (e.g., "Hematology Analyzer", "Chemistry Analyzer", "Microscope")
  - `model: string`
  - `serialNumber: string | null`
  - `avgRunTimeMinutes: number`
  - `status: 'IN_SERVICE' | 'OUT_OF_SERVICE'`
  - `outOfServiceReason: string | null`
  - `createdAt: string`
  - `updatedAt: string`
- [ ] Define `QueuedBatch` interface:
  - `id: string` (UUID)
  - `instrumentId: string`
  - `techId: string`
  - `techName: string`
  - `sampleIds: string[]`
  - `sampleCount: number`
  - `testType: string`
  - `estimatedRunMinutes: number`
  - `position: number`
  - `status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'`
  - `queuedAt: string`
  - `startedAt: string | null`
  - `completedAt: string | null`
- [ ] Define `InstrumentHistoryEntry` interface:
  - `id: string`
  - `instrumentId: string`
  - `batchId: string`
  - `techId: string`
  - `sampleCount: number`
  - `runTimeMinutes: number`
  - `completedAt: string`

### Task 2: Instrument Registry Service (AC: 1)

- [ ] Create `apps/lab-lite/src/lib/equipment-service.ts`:
  - `registerInstrument(instrument: Omit<Instrument, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>` — creates instrument in Dexie
  - `updateInstrument(id: string, updates: Partial<Instrument>): Promise<void>` — updates instrument details
  - `setInstrumentStatus(id: string, status: 'IN_SERVICE' | 'OUT_OF_SERVICE', reason?: string): Promise<void>` — with audit event
  - `getInstruments(): Promise<Instrument[]>` — list all instruments
  - `getInstrumentById(id: string): Promise<Instrument | undefined>`

### Task 3: Batch Queue Service (AC: 2, 3, 4, 6)

- [ ] Add to `apps/lab-lite/src/lib/equipment-service.ts`:
  - `queueBatch(instrumentId: string, batch: QueueBatchInput): Promise<QueuedBatch>`:
    - Validates instrument is IN_SERVICE
    - Assigns next position number
    - Computes estimated start/completion times
    - Stores in `instrument_queue`
    - Returns the queued batch with computed times
  - `getInstrumentQueue(instrumentId: string): Promise<QueuedBatch[]>`:
    - Returns all QUEUED and RUNNING batches ordered by position
    - Computes estimated times dynamically
  - `startBatch(batchId: string): Promise<void>`:
    - Validates batch is in position 1
    - Updates status to RUNNING and sets `startedAt`
  - `completeBatch(batchId: string): Promise<void>`:
    - Updates status to COMPLETED, sets `completedAt`
    - Records in `instrument_history`
    - Promotes next batch to position 1
    - Triggers next-in-line notification
    - Updates average run time based on actual duration
  - `cancelBatch(batchId: string, reason: string): Promise<void>`:
    - Removes from queue, reorders remaining batches
  - `reorderQueue(instrumentId: string, newOrder: string[]): Promise<void>`:
    - Updates position for all batches in the new order
    - LAB_MANAGER only
    - Notifies affected techs
    - Audit-logged

### Task 4: Estimated Time Calculator (AC: 3)

- [ ] Create `computeQueueTimes(queue: QueuedBatch[], instrument: Instrument): QueuedBatchWithTimes[]`:
  - First batch: startTime = now (if RUNNING) or "next available"
  - Subsequent batches: startTime = previous batch completionTime
  - completionTime = startTime + estimatedRunMinutes
  - Returns enriched batch objects with `estimatedStartTime` and `estimatedCompletionTime`

### Task 5: Instrument Registry UI (AC: 1)

- [ ] Create `apps/lab-lite/src/components/equipment/InstrumentRegistryPanel.tsx`:
  - List of registered instruments with status badges (green: In Service, red: Out of Service)
  - "Add Instrument" form (name, type dropdown, model, serial, avg run time)
  - "Edit" and "Set Out of Service" actions per instrument
  - Gated to LAB_MANAGER role
- [ ] Add to Settings or as a dedicated settings sub-page

### Task 6: Instrument Queue UI (AC: 2, 3, 6)

- [ ] Create `apps/lab-lite/src/components/equipment/InstrumentQueueView.tsx`:
  - Shows queue for a selected instrument
  - Current batch card (highlighted, with countdown timer and progress bar)
  - Queue list with position numbers, tech names, estimated start times
  - "Queue My Batch" button for any tech
  - "Start Run" / "Complete Run" buttons for the current batch owner
- [ ] Create `apps/lab-lite/src/components/equipment/QueueBatchDialog.tsx`:
  - Form to queue a new batch: select instrument, enter sample count, specify test type, optionally override estimated run time
  - Validates instrument is in service
  - Shows estimated wait time based on current queue
- [ ] Create `apps/lab-lite/src/components/equipment/BatchCard.tsx`:
  - Reusable card for a queued batch
  - Shows: position, tech name, sample count, estimated start/completion, status badge
  - "Cancel" button for the owning tech or LAB_MANAGER
- [ ] Add route at `apps/lab-lite/src/app/[locale]/equipment/page.tsx`

### Task 7: Manager Queue Override UI (AC: 5)

- [ ] Add to `InstrumentQueueView.tsx` (LAB_MANAGER only):
  - Up/down buttons on each batch card for reordering
  - "Remove from Queue" action with reason input
  - "Insert Urgent Batch" action that opens `QueueBatchDialog` with position selector
  - All reordering actions trigger `reorderQueue()` service call

### Task 8: Next-in-Line Notification (AC: 4)

- [ ] Integrate with existing notification system in `apps/lab-lite/src/components/notifications/`:
  - When a batch completes, create a notification for the next-in-line tech
  - Notification content: "Your batch for {instrumentName} is next. Prepare your samples."
  - Notification links to the instrument queue view
  - Use existing `NotificationPanel` infrastructure

### Task 9: Audit Integration

- [ ] Emit audit events for:
  - Instrument registered: `{ action: 'CREATE', resourceType: 'INSTRUMENT', resourceId: instrumentId }`
  - Instrument status change: `{ action: 'UPDATE', resourceType: 'INSTRUMENT', resourceId: instrumentId, detail: { status, reason } }`
  - Batch queued: `{ action: 'CREATE', resourceType: 'INSTRUMENT_BATCH', resourceId: batchId, detail: { instrumentId, techId } }`
  - Batch completed: `{ action: 'UPDATE', resourceType: 'INSTRUMENT_BATCH', resourceId: batchId }`
  - Queue reordered: `{ action: 'UPDATE', resourceType: 'INSTRUMENT_QUEUE', resourceId: instrumentId, detail: { reorderedBy } }`

### Task 10: Internationalization

- [ ] Add i18n keys to all 5 locale files (`apps/lab-lite/messages/{en,ar,prs,ps,fa}.json`):
  - `equipment.instruments`: "Instruments"
  - `equipment.addInstrument`: "Add Instrument"
  - `equipment.inService`: "In Service"
  - `equipment.outOfService`: "Out of Service"
  - `equipment.queue`: "Queue"
  - `equipment.queueBatch`: "Queue My Batch"
  - `equipment.currentBatch`: "Current Batch"
  - `equipment.estimatedStart`: "Est. Start"
  - `equipment.estimatedCompletion`: "Est. Completion"
  - `equipment.startRun`: "Start Run"
  - `equipment.completeRun`: "Complete Run"
  - `equipment.nextInLine`: "Your batch for {instrument} is next. Prepare your samples."
  - `equipment.position`: "Position {number}"
  - `equipment.avgRunTime`: "Avg. Run Time (min)"

### Task 11: Testing

- [ ] Create `apps/lab-lite/src/__tests__/equipment-service.test.ts`:
  - Test instrument registration and retrieval
  - Test instrument status change
  - Test batch queuing assigns correct position
  - Test batch completion promotes next batch
  - Test estimated time calculation
  - Test queue reordering updates positions
  - Test out-of-service instrument rejects new batches
  - Test average run time updates from actuals
- [ ] Create `apps/lab-lite/src/__tests__/instrument-queue-view.test.tsx`:
  - Test queue renders with correct positions and times
  - Test "Queue My Batch" dialog
  - Test "Start Run" / "Complete Run" flow
  - Test manager override controls visibility
  - Test next-in-line notification trigger
- [ ] Create `apps/lab-lite/src/__tests__/instrument-registry.test.tsx`:
  - Test instrument list renders
  - Test add instrument form
  - Test status toggle
  - Test LAB_MANAGER-only access

### Review Findings

**Triage summary:** 2 decision-needed · 18 patch · 2 deferred · 2 dismissed

#### Decision-Needed

- [x] [Review][Decision] D1: "Returned to tech's pending work" not implemented — resolved as Option B: when a manager cancels a batch, create an `InstrumentNotification` of type `BATCH_CANCELLED` for the owning tech; no new pending-work queue concept needed.
- [x] [Review][Decision] D2: Required file changes absent from diff — confirmed present in prior commit on this branch (`db.ts`, `AppSidebar.tsx`, i18n files); all verified present.

#### Patch

- [x] [Review][Patch] P1: `cancelBatch` discards `_reason` — fixed: reason stored in `cancelReason` field on the batch record and emitted in audit event.
- [x] [Review][Patch] P2: `startBatch` has no guard for existing RUNNING batch — fixed: throws if another batch is already RUNNING on the same instrument.
- [x] [Review][Patch] P3: `handleToggleStatus` fires `setInstrumentStatus` even when window.prompt is cancelled — fixed: replaced with `OutOfServiceModal`; status change only commits on explicit confirm.
- [x] [Review][Patch] P4: Cancelling a RUNNING batch leaves the queue with no position-1 batch — fixed: `cancelBatch` now resequences all active batches (QUEUED + RUNNING), not just QUEUED.
- [x] [Review][Patch] P5: `reorderQueue` allows partial or cross-instrument IDs — fixed: validates all IDs belong to the instrument and that all active batches are included before resequencing.
- [x] [Review][Patch] P6: NaN propagates from `runTimeOverride` string — fixed: explicit `isNaN` guard in `QueueBatchDialog` before passing to service; service also guards with `> 0 && !isNaN`.
- [x] [Review][Patch] P7: `insertAtPosition` never passed to `queueBatch` — fixed: service `queueBatch` now accepts and implements `insertAtPosition`; shifts existing batches down.
- [x] [Review][Patch] P8: `window.prompt` used for cancel/OOS reasons — fixed: replaced with `CancelBatchModal` in `InstrumentQueueView` and `OutOfServiceModal` in `InstrumentRegistryPanel`.
- [x] [Review][Patch] P9: Back button uses hard-coded `←` — fixed: replaced with `<DirectionalIcon category="navigation"><ChevronLeft /></DirectionalIcon>`.
- [x] [Review][Patch] P10: Next-in-line notifications not integrated with NotificationBell — fixed: `NotificationBell` polls `getActiveInstrumentNotifications` and includes count in badge total.
- [x] [Review][Patch] P11: `completeBatch` loads unbounded history — fixed: bounded query using compound index `[instrumentId+completedAt]` with `.between()` then `.slice(0, 10)`.
- [x] [Review][Patch] P12: `emitEquipmentAuditEvent` called without `await` — fixed: all audit calls are now awaited.
- [x] [Review][Patch] P13: `useEffect([selectedInstrumentId])` re-fetches all instruments on selection change — fixed: dep array is `[]`; uses functional state updater to set first instrument without re-triggering.
- [x] [Review][Patch] P14: `queueBatch` position assignment is not in a transaction — fixed: position assignment wrapped in Dexie transaction.
- [x] [Review][Patch] P15: `avgRunTimeMinutes = 0` not validated — fixed: `registerInstrument` throws if `avgRunTimeMinutes < 1`; `computeQueueTimes` guards against zero/NaN with fallback to instrument avg.
- [x] [Review][Patch] P16: Test mock `between()` ignores bounds — fixed: mock now filters by compound key first element (instrumentId) and adds `.reverse().sortBy()` chain support.
- [x] [Review][Patch] P17: First-in-queue batch shows timestamp instead of "Now" — fixed: `BatchCard` renders `t('now')` when `isCurrent && status === 'QUEUED'`.
- [x] [Review][Patch] P18: `QueueBatchDialog` wait estimate overstates for RUNNING batch — fixed: deducts elapsed time from RUNNING batch using `estimatedCompletionTime - Date.now()`.

#### Deferred

- [x] [Review][Defer] W1: `nextBatch` captured outside Dexie transaction via closure — works today via JS closure semantics, but is a latent footgun if extended with post-transaction DB calls [`equipment-service.ts:2322`] — deferred, works correctly in current Dexie version
- [x] [Review][Defer] W2: `completeBatch` uses `queuedAt` as fallback when `startedAt` is null — can only occur if `startBatch` was bypassed; inflates rolling average if triggered [`equipment-service.ts:2316`] — deferred, only reachable via data corruption

## Dev Notes

### Architecture Decisions

**Instrument registry is local-first in Dexie, synced to Hub.** Each lab manages its own instrument list. The registry syncs to Hub as Tier 3 (Operational) data — LWW is acceptable since instrument metadata rarely conflicts.

**Queue positions are integer-based, not fractional.** On reorder, all affected batch positions are reassigned sequentially. This is simpler than fractional positioning and the queue is small (typically <10 batches per instrument).

**Average run time is a rolling average.** When a batch completes, the instrument's `avgRunTimeMinutes` is updated using a simple moving average of the last 10 runs. This provides increasingly accurate ETAs over time without storing the full run history in the instrument record.

**No real-time instrument integration.** Lab-Lite does not connect to instrument APIs or LIS. Batch start/completion is manually triggered by the tech. Future stories could add instrument interfacing for automated status updates.

### Files to Create

| File | Purpose |
|---|---|
| `apps/lab-lite/src/lib/equipment-service.ts` | Instrument registry and batch queue logic |
| `apps/lab-lite/src/components/equipment/InstrumentRegistryPanel.tsx` | Instrument management UI |
| `apps/lab-lite/src/components/equipment/InstrumentQueueView.tsx` | Batch queue display and interaction |
| `apps/lab-lite/src/components/equipment/QueueBatchDialog.tsx` | Queue a new batch dialog |
| `apps/lab-lite/src/components/equipment/BatchCard.tsx` | Reusable batch card component |
| `apps/lab-lite/src/app/[locale]/equipment/page.tsx` | Equipment page route |
| `apps/lab-lite/src/__tests__/equipment-service.test.ts` | Service unit tests |
| `apps/lab-lite/src/__tests__/instrument-queue-view.test.tsx` | Queue UI tests |
| `apps/lab-lite/src/__tests__/instrument-registry.test.tsx` | Registry UI tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/lab-lite/src/lib/db.ts` | Add `instruments`, `instrument_queue`, `instrument_history` tables |
| `apps/lab-lite/src/components/AppSidebar.tsx` | Add "Equipment" navigation item |
| `apps/lab-lite/src/components/notifications/` | Add next-in-line notification template |
| `apps/lab-lite/messages/en.json` | Add equipment i18n keys |
| `apps/lab-lite/messages/ar.json` | Arabic translations |
| `apps/lab-lite/messages/prs.json` | Dari translations |
| `apps/lab-lite/messages/ps.json` | Pashto translations |
| `apps/lab-lite/messages/fa.json` | Farsi translations |

### Patterns to Follow

1. **Service pattern:** All business logic in `lib/equipment-service.ts`. Components call service functions.
2. **Queue management:** Positions are always sequential integers starting at 1. On any mutation (add, remove, reorder), all positions are recalculated.
3. **Notification pattern:** Follow existing notification infrastructure — create notification records in Dexie, surface via `NotificationPanel`.
4. **Settings UI pattern:** Instrument registry follows the card + form pattern in `LabSettingsView.tsx`.

### Key Constraints from CLAUDE.md

- **PHI Rule:** Batch records contain sample IDs and tech IDs — no patient demographics. Instrument queue is operational data, not clinical.
- **Audit Rule:** Instrument registration, status changes, and queue reordering must emit audit events.
- **Offline-First Rule:** Entire equipment booking system works offline from Dexie. Sync to Hub is asynchronous.
- **RTL Rule:** Queue view, batch cards, and instrument forms must work in both LTR and RTL.

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.4 (line 6338)
- Story 42.1 (RBAC): `_bmad-output/implementation-artifacts/42-1-role-based-access-control.md`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Notification components: `apps/lab-lite/src/components/notifications/`
- Settings view: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
