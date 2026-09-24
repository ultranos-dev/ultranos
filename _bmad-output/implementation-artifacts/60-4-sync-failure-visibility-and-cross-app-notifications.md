# Story 60.4: Sync Failure Visibility & Cross-App Notification Producers

Status: review

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

- [x] **Task 1: Lab dead-letter UI + ack retry** (AC: 1, 2) — new `FailedSyncPanel.tsx` reads existing Dexie failed/dead-letter states; worklist badge + `SyncDashboard` order-ack dead-letter section; `useOrderSync.ts` ack converted to a durable queued retry (`order-ack-sync.ts`, Dexie **v58** `orderAckQueue`, PRESERVE on cleanup); tests for both.
- [x] **Task 2: Notification producers** (AC: 3, 4) — new `notification-producers.ts`: SYNC_CONFLICT at the Tier-1 flag point in `sync.ts`; ALLERGY_UPDATE in `allergy.ts`; CONSENT_CHANGE in `consent.ts`. PRESCRIPTION_READY **kept + reserved** (no ready-for-pickup state exists — documented, not removed; the ACTIVE→DISPENSED flow already has PRESCRIPTION_DISPENSED). Recipient policies documented per type (treating-clinician set = distinct requesters on the patient's active `medication_requests`; MPI review → org admins). Reused the dispatch pattern; fire-and-forget inserts log failure with opaque IDs.
- [x] **Task 3: MPI review notification + audit** (AC: 5) — `async-mpi-scoring.ts` now emits an audit event + an org-admin notification when a PENDING duplicate review is created.
- [x] **Task 4: MedicationStatement durability** (AC: 6) — `medication.ts` best-effort path delegates to a throwing writer; on failure it upserts a `medication_statement_outbox` row (opaque refs only; medication identity re-resolved at drain). Cron drains with exponential backoff → DONE or DEAD after 8. NOT folded into 61.3's dispense RPC (the multi-query upsert isn't cleanly inlinable in SQL; a durable outbox is the safer in-scope unit).
- [x] **Task 5: Tests + regression verification** (AC: 7) — `notification-producers.test.ts` (asserts NO PHI in any produced row), `medication-statement-outbox.test.ts`, `order-ack-retry.test.ts`, `failed-sync-panel.test.tsx`; full suites + typecheck.

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
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Debug Log References
Combined tree: `pnpm -F hub-api typecheck` + `pnpm -F lab-lite typecheck` clean; hub **1856 passed** (3 todo), lab **3970 passed** (13 skipped) — 0 failures. All 5 apps typecheck clean; app-router.d.ts regenerated (10-line router-surface delta).

### Completion Notes List
- **PRESCRIPTION_READY disposition — KEPT + reserved:** verified no pharmacy workflow produces a "ready for pickup" state (flow is ACTIVE → DISPENSED, already covered by PRESCRIPTION_DISPENSED). Inventing that state is out of scope; the map entry stays with a "RESERVED — no producer by design" comment (removing it would break `notification-content.test.ts` + client i18n keys).
- **Recipient policies:** ALLERGY_UPDATE / SYNC_CONFLICT / CONSENT_CHANGE → the patient's treating-clinician set (distinct requesters on active `medication_requests`); MPI review → org admins scoped to orgId.
- **PHI-free payloads (Safety Rule #1):** `notification-producers.test.ts` serializes each produced row and asserts none of a PHI probe set (names/drugs/dx/phone) appears in `recipient_ref`/`payload`/`body_params`; payloads carry only opaque IDs + enum descriptors filtered through `NON_PHI_PARAM_KEYS`.
- **Escalation cron confirmed genuinely missing:** `checkEscalations` was unit-tested but no in-tree route triggered it. Wired `/api/cron/notification-escalation` on the existing timing-safe `CRON_SECRET` + `runJobWithRetry` pattern (scheduling is external deploy config, matching the other 5 crons).
- **MedicationStatement outbox:** durable table + `/api/cron/medication-statement-outbox` drain (backoff, DEAD after 8, idempotent). **⚠ Applied LIVE to the project during the wave** (version `20260924055441`, name `066_medication_statement_outbox`) — the orchestrator captured the DDL as repo migration **070** (numbered past 61.3's authored-unapplied 066–069) for repo↔DB parity. Additive, service-role-only (RLS on, no policies). *Process note: the 60.4 dispatch prompt omitted the "author-don't-apply" instruction used in prior waves — hence the live apply; harmless (additive) but noted.*
- **Path drift (deviations):** `useOrderSync.ts` is under `src/hooks/` not `src/lib/`; the "sync page" is the `SyncDashboard` modal (no standalone route). MPI-review audit uses `resourceType: 'PATIENT'` + `operation: 'mpi_duplicate_review_created'` metadata (no `DUPLICATE_REVIEW` enum; shared-types untouched by constraint). `sync-create.test.ts` + phi-cleanup-completeness guard updated for the new `orgId` arg and `orderAckQueue` PRESERVE classification.

### File List
New — hub: `lib/notification-producers.ts`, `lib/medication-statement-outbox.ts`, `app/api/cron/{medication-statement-outbox,notification-escalation}/route.ts`, `__tests__/{notification-producers,medication-statement-outbox}.test.ts`; lab-lite: `components/sync/FailedSyncPanel.tsx`, `lib/order-ack-sync.ts`, `__tests__/{order-ack-retry,failed-sync-panel}.test.*`; `supabase/migrations/070_medication_statement_outbox.sql`.
Modified — hub: `trpc/routers/{sync,allergy,consent,medication,patient}.ts`, `lib/{async-mpi-scoring,notification-content}.ts`, `types/app-router.d.ts`, `__tests__/{async-mpi-scoring,sync-create}.test.ts`; lab-lite: `hooks/useOrderSync.ts`, `lib/{db,phi-cleanup}.ts`, `components/SyncDashboard.tsx`, `app/[locale]/(app)/worklist/page.tsx`, `messages/{en,ar,prs,ps}.json`.

### Change Log
- 2026-09-24: Story 60.4 implemented (Wave 6 batch 1), verified, integrated. Four notification producers wired (PRESCRIPTION_READY reserved), MPI-review notify+audit, durable MedicationStatement outbox (+ repo migration 070, applied live), lab dead-letter panel + durable ack retry (Dexie v58). Status → review.
