# Story 60.4: Sync Failure Visibility & Cross-App Notification Producers

Status: ready-for-dev

## Story

As a lab technician, pharmacist, and clinician,
I want every silently-failing write-back edge made visible — dead-lettered lab results surfaced, order-ack failures retried, stranded MPI reviews notified, MedicationStatement creation made durable, and the four producer-less notification types wired,
so that the system stops "silently under-delivering" (the audit's phrase) and humans learn when a cross-app hop fails.

## Acceptance Criteria

1. **Given** a lab result upload dead-letters (permanent 4xx), **when** the technician views the worklist/sync area, **then** a persistent failure indicator names the sample and offers retry/details — a structured result can no longer be permanently lost while the lab believes it uploaded.
2. **Given** an order-ack (`lab.acknowledgeOrder`) fails, **then** it retries via a durable queue (not one-shot swallowed), and until acked the OPD-side order-lock discrepancy is bounded (ack retry closes the "editable forever in OPD" gap).
3. **Given** a Tier-1 sync conflict is flagged at the Hub, **then** a `SYNC_CONFLICT` notification is produced for the relevant clinician(s) — the type exists in the content map but currently has NO producer.
4. **Given** an allergy is added/changed (`ALLERGY_UPDATE`) or consent changes (`CONSENT_CHANGE`), **then** notifications are produced per a documented recipient policy (e.g., allergy update → practitioners with active encounters/prescriptions for that patient; consent withdrawal → treating clinicians). `PRESCRIPTION_READY` is either produced by a real flow or removed from the content map — decision recorded.
5. **Given** async MPI scoring creates a PENDING duplicate review, **then** it emits an audit event and a notification to org admins — reviews are no longer stranded until someone happens to look.
6. **Given** a dispense records successfully but MedicationStatement creation fails, **then** the failure is retried durably (outbox/job) instead of swallowed (`medication.ts:124-127`) — the active-med list can no longer silently diverge from dispenses.
7. **Zero regression:** all currently-working sync/notification flows behave identically; no new notification spam (recipient policies are scoped and documented); all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: Lab dead-letter UI + ack retry** (AC: 1, 2) — lab-lite: failed-sync panel (worklist badge + sync page section) reading the existing Dexie failed/dead-letter states (`result-sync.ts` classifications); convert `useOrderSync.ts:151-155` ack to a queued retry; tests for both.
- [ ] **Task 2: Notification producers** (AC: 3, 4) — hub: producer for SYNC_CONFLICT at the Tier-1 flag point (`sync.ts` conflict path); ALLERGY_UPDATE in `allergy.ts` mutations; CONSENT_CHANGE in `consent.ts` grant/withdraw; disposition PRESCRIPTION_READY (`notification-content.ts:23`); recipient-resolution policy documented per type; reuse the existing dispatch service (`lab.ts:71-87` pattern); fire-and-forget inserts get at least failure logging.
- [ ] **Task 3: MPI review notification + audit** (AC: 5) — `async-mpi-scoring.ts:25-91`: audit emission + admin notification; link from admin duplicate-review UI (already exists).
- [ ] **Task 4: MedicationStatement durability** (AC: 6) — `medication.ts:62-128`: replace swallow with a retryable outbox row (or include in the dispense atomic RPC from Story 61.3 — coordinate; if 61.3 lands first, this becomes verification).
- [ ] **Task 5: Tests + regression verification** (AC: 7) — producer tests per type (event → notification row → consumed by the polling clients); dead-letter UI tests; full suites + `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-LAB-6 [A]** (silent dead-lettering + ack swallow), **workflow-7 gaps [V]** (four producer-less types verified by grep), **cross-app gap 6 [A]** (stranded MPI), **workflow-3 gap [A]** (best-effort MedicationStatement), audit §9 + §10 Theme 3 ("the only dead-letter UI in the system today is OPD's conflict list" — this story extends the pattern).

### Architecture

- All four apps already poll `notification.list` (`use-notification-poll.ts` etc.) — producers are the missing half; no new transport needed.
- Recipient resolution must not leak PHI in notification payloads — follow the existing content-map pattern (IDs + typed content keys, localized client-side).
- Escalation-cron gap (audit: no in-tree trigger found for `notification-escalation.ts`) — verify and wire a cron entry if genuinely missing (timing-safe CRON_SECRET pattern exists).

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Existing notification types, polling, acknowledge flows, result sync, and order acks all keep working; additions are new producers and new visibility surfaces only. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** hub `sync.ts`, `allergy.ts`, `consent.ts`, `medication.ts`, `notification-content.ts`, `async-mpi-scoring.ts`; lab-lite `useOrderSync.ts`, sync/worklist UI.
**New files:** lab-lite `components/sync/FailedSyncPanel.tsx` + tests; hub `__tests__/notification-producers.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#9-inter-app-workflow-status] — workflows 2, 3, 7, 9 gap tables
- [Source: apps/hub-api/src/trpc/routers/lab.ts:71-87] — notification dispatch pattern
- [Source: apps/opd-lite — conflicts page] — the one existing dead-letter UI (model)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
