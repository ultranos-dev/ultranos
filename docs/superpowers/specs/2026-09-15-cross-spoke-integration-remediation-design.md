# Cross-Spoke Integration Remediation — Design Spec

- **Date:** 2026-09-15
- **Status:** Draft — pending user review
- **Scope:** OPD-Lite ⇄ Pharmacy-Lite ⇄ Lab-Lite ⇄ Pharmopedia integration gaps
- **Source reviews:** OPD-Lite integration review + cross-spoke (pharmacy/lab/pharmopedia) integration review, 2026-09-15
- **Related docs:** `docs/integration-remediation-plan.md`, `docs/drug-catalog-integration.md`, `docs/superpowers/plans/2026-09-14-lab-lite-specimen-hub-sync.md`

---

## 1. Background

Ultranos is a hub-and-spoke system: spoke apps (OPD-Lite, Pharmacy-Lite, Lab-Lite) never call each other directly — all cross-spoke data flows through the Central Hub. Two integration reviews audited the spoke↔spoke and spoke↔hub seams. Most integrations verified as working (prescription QR sign/verify, lab order/result R1 blind-ref flow, data-minimization, shared drug-db). This spec addresses the **verified gaps** that remain.

The headline finding: **Story 52.1 (Therapeutic Drug Monitoring, pharmacy→lab) is a half-built feature.** The lab-side processing *logic* exists (dispense-receiver, mapping, reminders, dashboard), but: (a) there is no Hub transport feeding it, (b) there is a latent coding-system mismatch, and (c) — discovered during planning — **its persistence layer was never wired into the real Dexie schema**: the `monitoringFlags` store and `MonitoringFlag` type do not exist in `apps/lab-lite/src/lib/db.ts`, and every monitoring test mocks `@/lib/db` (`vi.mock('../lib/db', …)`). The suite is green while the feature does nothing end-to-end and has no real persistence.

### 1.1 Verified findings

| # | Finding | Verification | Tier |
|---|---------|--------------|------|
| 1 | Pharmacy→Lab TDM transport missing (orphaned receiver + no Hub endpoint) | Verified: `processDispenseEvent` has no production caller; no monitoring endpoint in any hub-api router | **P0** |
| 1b | Lab-side monitoring persistence never wired: no `monitoringFlags` Dexie store / `MonitoringFlag` type in `db.ts`; tests mock `@/lib/db` | Verified: no `.stores()` entry or type definition in real source; compound index string only appears as a usage in `dispense-receiver.ts:71` | **P0** |
| 2 | Medication code-system mismatch (map keyed RxNorm; dispenses carry ATC/local) → silent no-op | Verified: `medication-lab-map.ts` keys `RxNorm:*`; `medication-dispense.ts:32-40` emits `urn:ultranos:medication` code | **P0** |
| 3 | `medication.recordDispense` does not enforce `interaction_check` server-side | Verified: prescription fetch at `medication.ts:824` omits `interaction_check`; sibling `complete` enforces it | **P0** |
| 4 | Lab result → prescriber notification silently skipped when `orderId` absent | Agent-reported at `lab.ts` submitResult notify path; **verify-first** | **P1** |
| 5 | `MedicationStatement` (Tier-1 active meds) may not feed interaction-check inputs end-to-end | Low-confidence agent finding; created on dispense (`medication.ts:1040`) but consumption unverified; **verify-first** | **P1** |
| 6 | Lab→Pharmacy dosing awareness (renal/INR-aware dispense checks) absent | Verified: zero lab-result consumption in `apps/pharmacy-lite/src` | **P2 (future)** |
| 7 | Pharmopedia in-context deep-linking from pharmacy/lab absent | Verified: no cross-app links either direction | **P2 (future)** |

### 1.2 Non-findings (verified working — do not touch)

Recorded so implementers don't "fix" working code:

- Dispense status **does** flow back to OPD via sync-pull (`_ultranos.prescriptionStatus`) and renders in `DispenseStatusBadge.tsx`.
- Pharmacy-lite **does** re-check interactions client-side (`DispensingConfirmationModal.tsx` → `runDispenseInteractionCheck`, blocks on contraindicated, requires supervisor override for warning/unavailable).
- Lab file download (`app/api/lab-files/[fileId]/route.ts`) enforces RBAC + consent + virus-scan + audit.
- Lab-lite's dedicated `lab.submitResult`/`submitSpecimen` endpoints are **by-design** (push-only, data-minimized per Rule #7), not an inconsistency.

---

## 2. Guiding constraints

Every design below is bound by CLAUDE.md rules:

- **Rule #3** — clinical safety checks never fail silently. An unmapped monitored-drug or an unresolved code must be *observable* (metric/audit), never a silent `return []`.
- **Rule #6** — every PHI read/write emits a structured audit event; write-path audit failures on new endpoints follow the established pattern (best-effort for reads, throw-on-failure for the critical result-write path already in place).
- **Rule #7** — lab-facing surfaces expose only first name + age; never the raw National ID or the real patient UUID (lab receives an opaque HMAC blind-index ref only). This governs the new monitoring transport.
- **Offline-first** — lab-lite is an offline-prone PWA. All transport is pull-based with durable cursors and idempotent, at-least-once delivery.
- **Tier-1 append-only** — nothing here introduces LWW on allergies/active-meds/critical diagnoses.
- **HLC ordering** — clinical event ordering uses Hybrid Logical Clocks, never `Date.now()`.
- **DB operations** — all schema changes applied via the Supabase MCP (`apply_migration`), never hand-run SQL.

---

## 3. P0.1 — Complete the Pharmacy→Lab Therapeutic Drug Monitoring transport

### 3.1 Problem & evidence

Story 52.1's intent: when a pharmacy dispenses a monitored medication (warfarin→INR, lithium→Li level + TSH + creatinine, metformin→creatinine/eGFR, etc.), the lab automatically receives a data-minimized event and creates monitoring flags + reminders so the required follow-up labs happen.

**What exists (lab side — logic only, mock-tested):**
- `apps/lab-lite/src/lib/monitoring/dispense-receiver.ts` — `processDispenseEvent` / `processBatchDispenseEvents`: idempotent flag creation with dedup on `[patientRef+medicationCode+testRequired]` and newer-wins on `dispensedAt`.
- `apps/lab-lite/src/lib/monitoring/medication-lab-map.ts` — 7 physician-curated drug→test mappings.
- `reminder-generator.ts`, `status-lifecycle.ts`, `monitoring-audit.ts`, `MonitoringDueCard.tsx`, `MonitoringHistory.tsx`, and suites `monitoring-lifecycle/reminders/dashboard/flags`.

**What is missing (verified):**
- **No persistence layer.** `dispense-receiver.ts:20` imports `{ getDb, type MonitoringFlag } from '@/lib/db'`, but `db.ts` defines neither a `monitoringFlags` Dexie store nor a `MonitoringFlag` type (nor a `medicationLabMappings` override store). The compound index `[patientRef+medicationCode+testRequired]` appears only as a *query* in `dispense-receiver.ts:71`, never in a `.stores()` definition. Every monitoring test mocks `@/lib/db`, so the suite passes without a real store. The persistence layer must be built as part of this work. (Typecheck status of the unresolved `MonitoringFlag` import was not run during this audit — treat as "build it," not "confirmed-passing.")
- **No production caller** of `processDispenseEvent` — only tests and the module itself invoke it. No sync worker/hook feeds real events.
- **No Hub transport** — grep of every `apps/hub-api/src/trpc/routers` file for monitoring/dispense-monitoring/MonitoringFlag/medication_lab returns nothing. `recordDispense` creates the dispense + a `MedicationStatement` + a prescriber notification, but never fans out a monitoring event.
- **Code-system mismatch** — the map is keyed `RxNorm:11289`; dispenses emit `medicationCodeableConcept.coding[0] = { system: 'urn:ultranos:medication', code: prescription.med }` (`apps/pharmacy-lite/src/lib/medication-dispense.ts:32-40`). `getMedicationMapping()` would return `null` for every real dispense and the receiver treats null as "no monitoring required" → silent clinical gap.

### 3.2 Canonical drug identity decision

The drug catalog's canonical key is the **ATC code**: `DrugEntryTier1.atcCode` is the primary key, `rxnormCui` is optional, brands FK by `genericAtcCode`, and `substitutes` are ATC codes (`packages/shared-types/src/fhir/drug-catalog.ts:71-72,111,188`). Prescriptions already carry an ATC-shaped code (`compress-prescription.ts` derives `atc` when the code is ATC-shaped).

**Decision:** the monitoring mapping is **re-keyed to ATC**, and the Hub resolves each dispensed medication to its canonical ATC before emitting a monitoring event. We do **not** build an RxNorm translation layer (rxnormCui is optional → coverage gaps). RxNorm codes remain as documentation/cross-reference only.

### 3.3 Mapping authority decision

To satisfy Rule #7 (the lab must not learn about dispenses of drugs it does not monitor), the **set of monitored ATC codes must be authoritative at the Hub** so `recordDispense` can decide whether to emit an event at all. Two consumers need the mapping:

- **Hub** — needs the monitored-ATC *set* to gate event emission.
- **Lab** — needs the full test *specs* (LOINC, frequency, delay) to build flags.

**Decision:** promote the medication→lab mapping to a **Hub-owned table `medication_lab_mappings`** (seeded from the existing physician-curated list, re-keyed to ATC). The lab pulls the mapping as `hubOverrides` (a path `getMedicationMapping` already supports) with the bundled TypeScript map (`medication-lab-map.ts`, re-keyed to ATC) retained as the **offline fallback/seed**. Single source of truth; lab exposure minimized to monitored drugs only.

### 3.4 Data model

Two tables (migrations applied via Supabase MCP `apply_migration`).

**`medication_lab_mappings`** — Hub-authoritative monitoring reference (non-PHI clinical reference data):

| column | type | notes |
|--------|------|-------|
| `atc_code` | text PK | canonical drug identity |
| `medication_display` | text | human-readable |
| `required_tests` | jsonb | `MonitoringTestSpec[]` (loincCode, testDisplay, frequencyDays, initialDelayDays, priority) |
| `version` | int | bumped on update; drives lab override refresh |
| `updated_at` | timestamptz | cursor for lab pull of overrides |

**`dispense_monitoring_events`** — Hub-internal event log, projected (data-minimized) to lab on pull:

| column | type | notes |
|--------|------|-------|
| `id` | uuid PK | event id |
| `seq` | bigint identity | **monotonic keyset cursor** for lab pull |
| `dispensing_event_id` | uuid | = the `MedicationDispense` id (idempotency key downstream) |
| `patient_id` | uuid FK | **real patient id — Hub-internal only, NEVER in endpoint output** |
| `atc_code` | text | resolved canonical ATC |
| `medication_display` | text | for the lab dashboard label |
| `dispensed_at` | timestamptz | drives due-date math |
| `ordering_practitioner_ref` | text | opaque id — no prescriber name |
| `hlc_timestamp` | text | pharmacist HLC, for newer-wins |
| `created_at` | timestamptz | |

Notes:
- `patient_id` is stored as the real UUID for Hub-internal join to `patients` (to resolve first name + age at read time). It is **never** serialized to the lab — the endpoint outputs only the blind-index ref (§3.6). This mirrors how `lab.pullOrders` resolves demographics from `service_requests.patient_id` and returns a blind ref.
- No first name / age stored at rest here — resolved at read time to avoid duplicating PHI columns and keep one source.

### 3.5 Producer — event emission inside `recordDispense`

Add an emission step to `medication.recordDispense` (`apps/hub-api/src/trpc/routers/medication.ts`), placed alongside the existing best-effort side-effects (after the `PRESCRIPTION_DISPENSED` notification block, ~line 1152). It mirrors that block's discipline exactly: **best-effort, must not roll back the committed dispense, fully audited.**

Sequence:
1. Only when `input.status === 'completed'`.
2. **Resolve canonical ATC** for the dispensed medication:
   - If `input.medicationCode` matches a `drug_catalog.atc_code` → use directly.
   - Else attempt catalog resolution (brand→`genericAtcCode`, or `rxnorm_cui`→atc).
   - If unresolved → **do not silently drop**: increment `dispenseMonitoringUnresolvedCodeTotal` metric and emit an audit event `MONITORING_CODE_UNRESOLVED` (opaque ids only). No event row written (nothing to monitor against), but the miss is observable (Rule #3).
3. **Gate on monitored set:** look up `medication_lab_mappings` by resolved ATC. If absent → no monitoring required; return (no event, no error).
4. **Insert `dispense_monitoring_events`** row (real `patient_id`, resolved ATC, display, `dispensed_at`, opaque practitioner ref, `hlc_timestamp` from `input.hlcTimestamp`, `dispensing_event_id = input.dispenseId`).
5. **Audit** `CREATE` on `resourceType: DISPENSE_MONITORING_EVENT` (opaque ids only), same try/catch-and-warn pattern as the notification block.

Failure isolation: wrap the whole step in try/catch that only `console.warn`s — identical to the existing `[NOTIFY]` fan-out — so a monitoring-emit failure never fails a committed dispense.

### 3.6 Transport — `lab.pullDispenseMonitoringEvents`

New endpoint in `apps/hub-api/src/trpc/routers/lab.ts`, modeled on `lab.pullOrders`:

- **Procedure:** `labRestrictedProcedure` (+ `enforceVerifiedOrg`, `enforceEntitlement('LAB_LITE')`).
- **Input:** `{ since?: ISO, cursor?: number (seq keyset), limit?: 1..200 = 100 }`.
- **Query:** `dispense_monitoring_events` join `patients`, ordered by `seq` ascending, `seq > cursor`.
- **Output (data-minimized — Rule #7):**
  ```ts
  {
    events: Array<{
      dispensingEventId: string
      patientRef: string          // "Patient/<blindIndex>" — generateBlindIndex(patient_id, hmacKey)
      patientFirstName: string    // first name only
      patientAge: number          // computed age, NOT DOB
      atcCode: string
      medicationDisplay: string
      dispensedAt: string
      orderingPractitionerRef: string  // opaque
      hlcTimestamp: string
    }>
    nextCursor: number | null
  }
  ```
  **Never** includes `patient_id`, National ID, DOB, diagnosis, dosage, or prescriber name.
- **Audit:** emit `READ` on `resourceType: DISPENSE_MONITORING_EVENT`, `resourceId: 'monitoring-pull'`, metadata `{ eventCount, labId, since }` — same shape as the pullOrders audit.
- **Blind-index:** `patientRef` uses `generateBlindIndex(patient_id, hmacKey)` and is emitted **bare-prefixed** as `Patient/<blindIndex>` — consistent with `lab.pullOrders`. The lab stores it as the **bare** blind index (R1 convention) so monitoring flags correlate with the same patient across order/result/specimen surfaces.

Also add `lab.pullMonitoringMappings` (or fold into an existing catalog pull) so the lab refreshes `medication_lab_mappings` overrides by `version`/`updated_at`. This is non-PHI reference data — standard RBAC, light audit.

### 3.7 Consumer — lab persistence + sync worker

**Prerequisite — wire the missing persistence (finding 1b).** Before the worker can run, `apps/lab-lite/src/lib/db.ts` must gain, in a new Dexie version bump:
- The `MonitoringFlag` type export (the shape the receiver already writes — `patientRef`, `patientFirstName`, `patientAge`, `medicationCode`, `medicationDisplay`, `dispensedAt`, `dispensingEventId`, `testRequired`, `testDisplay`, `frequencyDays`, `dueDate`, `status`, `lastCompletedAt`, `reminderSentAt`, `orderingPractitionerRef`, `hlcTimestamp`, `syncedFromHub`, `createdAt`, `updatedAt`).
- The `monitoringFlags` store with the compound index `[patientRef+medicationCode+testRequired]` plus secondary indexes on `status` and `dueDate` (for the dashboard/reminder queries).
- A `medicationLabMappings` store keyed by `atcCode` (+`version`) for Hub overrides.
- Accessor helpers the components/reminders already assume.
- Replace the mock-only tests with real fake-indexeddb integration coverage so the store is exercised for real.

New hook `apps/lab-lite/src/hooks/useMonitoringSync.ts`, modeled on `useOrderSync`:
- Pull-based poll with a durable `since`/`cursor` watermark persisted in Dexie.
- On each batch: map endpoint output → `DispenseMonitoringPayload[]`, call the existing `processBatchDispenseEvents(payloads, hubOverrides)` where `hubOverrides` is built from the pulled `medication_lab_mappings` (falling back to the bundled ATC-keyed map offline).
- Advance the cursor only after successful processing (idempotency makes re-pull safe).
- Wire it into the lab-lite sync provider next to order sync.

`DispenseMonitoringPayload.patientRef` = the **bare** blind index (strip the `Patient/` prefix on receive, R1).

### 3.8 Re-key the bundled map to ATC

Update `medication-lab-map.ts`:
- Change `medicationCode` keys from `RxNorm:*` to ATC (e.g. Warfarin `B01AA03`, Metformin `A10BA02`, Lithium `N05AN01`, Methotrexate `L01BA01`/`L04AX03`, Enalapril `C09AA02`, Carbamazepine `N03AF01`, Amiodarone `C01BD01`). RxNorm retained in a comment for cross-reference.
- Keep the RxNorm→ATC mapping documented so the DB seed and the bundled fallback stay in sync.
- `BUNDLED_INDEX` now keyed by ATC; `getMedicationMapping(atcCode, hubOverrides)` unchanged in signature.

**Clinical review gate:** the ATC re-keying is clinical content and must be confirmed by physician review before merge (the mapping table is explicitly "NOT AI-generated"). ATC codes above are proposed, not authoritative — flag for clinical sign-off.

### 3.9 Idempotency, ordering, offline

- **At-least-once** delivery: the lab may re-pull events after a crash. `processDispenseEvent` dedups on `[patientRef+medicationCode+testRequired]` and only updates when the new `dispensedAt` is newer (or the prior flag was completed). Safe to reprocess.
- **HLC** carried end-to-end so newer-wins is causal, not wall-clock.
- **Offline:** if the lab is offline, events accumulate at the Hub; the cursor guarantees no loss on reconnect. If the drug catalog / mapping override is stale offline, the bundled ATC-keyed fallback still produces flags.

### 3.10 Data-minimization & audit compliance (Rule #6/#7)

- Lab receives first name + age + blind ref + ATC + drug display only. The drug display necessarily reveals the patient is on a monitored drug — this is inherent to the monitoring workflow (the lab must know which test to run), is the minimum necessary, and every pull is audited. Documented as an accepted, audited disclosure.
- Real `patient_id` never leaves the Hub. National ID never involved.
- Producer, pull, and mapping-refresh all audit per Rule #6.

### 3.11 Test plan

- **Hub producer:** dispense of a monitored ATC writes exactly one event; dispense of a non-monitored drug writes none; unresolved code → metric + `MONITORING_CODE_UNRESOLVED` audit + no row; emit failure does not roll back the dispense.
- **Hub endpoint:** output schema rejects extra fields (data-min); cursor pagination; blind-ref prefix correct; audit emitted; RBAC denies non-lab roles.
- **Lab worker:** pulled batch → `processBatchDispenseEvents`; cursor advances only on success; re-pull is idempotent (no duplicate flags).
- **Code-system regression:** an ATC dispense produces a flag (the exact bug this fixes) — assert warfarin `B01AA03` → INR flag.
- **Offline:** events queued while offline are processed on reconnect with no loss/dup.
- **E2E (Playwright/integration):** pharmacy completes a warfarin dispense → lab MonitoringDueCard shows an INR flag with the correct due date.

### 3.12 Rollout

1. Migrations: `medication_lab_mappings` + seed (post clinical sign-off), `dispense_monitoring_events`.
2. Ship Hub producer + endpoints (dark — no consumer yet).
3. Re-key bundled map + ship lab worker.
4. Backfill decision: optionally seed events from recent completed dispenses of monitored drugs so in-flight patients get flags (bounded lookback, e.g. one monitoring interval). Document the lookback window; do not silently backfill unbounded history.

---

## 4. P0.2 — Enforce `interaction_check` on `recordDispense`

### 4.1 Problem & evidence

The pharmacy client gate is robust (`DispensingConfirmationModal.tsx` blocks on contraindicated, requires supervisor override + reason for warning/unavailable). But the server `recordDispense` never re-validates: its prescription fetch (`medication.ts:824`) selects `id, prescription_status, status, hlc_timestamp, requester_id` and omits `interaction_check`. The sibling `complete` endpoint *does* gate (`PRECONDITION_FAILED` on `BLOCKED`/`UNAVAILABLE`). A non-official or replayed client could record a dispense against a `BLOCKED`/`UNAVAILABLE` prescription. Defense-in-depth hole.

### 4.2 Design

- Add `interaction_check` to the prescription `select` in `recordDispense`.
- After the status checks, before inserting the dispense, apply the same gate `complete` uses, **but preserve the legitimate override flow** that `recordDispense` already supports via `input.overrideReason`:
  - `interaction_check === 'BLOCKED'` and no `overrideReason` → `PRECONDITION_FAILED` ("Prescription has a blocked drug interaction").
  - `interaction_check === 'UNAVAILABLE'` and no `overrideReason` → `PRECONDITION_FAILED` ("Drug interaction check was unavailable").
  - With a valid `overrideReason`, proceed — the existing `dispense_reviews` PENDING record already captures the override for physician sign-off.
- **Scope note:** the server enforces the *prescriber's stored* check (defense-in-depth). The pharmacist's *fresh* client-side check remains the primary gate and continues to feed `overrideReason`. This is intentional layering, not duplication.
- Audit a `SECURITY_VIOLATION`/`DENIED` event on rejection (mirroring the duplicate-dispense audit at `medication.ts:868`).

### 4.3 Test plan

- Dispense of a `BLOCKED` prescription without override → rejected + audited.
- Dispense of an `UNAVAILABLE` prescription without override → rejected + audited.
- Dispense with a valid override → proceeds + `dispense_reviews` PENDING row created.
- `CLEAR`/`WARNING` unaffected.

---

## 5. P1.3 — Lab result → prescriber notification robustness

### 5.1 Problem & evidence

`lab.submitResult` notifies the ordering doctor by resolving `service_requests.requester_id` from `orderId`. When `orderId` is absent (file-only uploads, order-less results) or the lookup fails, the notification is silently skipped (best-effort by design). Verify-first: confirm the exact path in `lab.ts` before implementing.

### 5.2 Design (light)

- **Verify** the current behavior and its blast radius (how often results arrive without `orderId`).
- Add a fallback resolution chain when `orderId` is missing: resolve a recipient via the `diagnostic_report`'s linked order if present, else via the patient's most recent relevant encounter/care-team clinician.
- If no recipient can be resolved, record an **observable** "unlinked result" signal (metric + audit) instead of a silent skip, and surface unlinked results in an OPD/admin reconciliation view (or reuse an existing notification-failure surface).
- Do not make `orderId` strictly required (file-only uploads are legitimate), but strongly encourage it in the lab UI.

### 5.3 Test plan

- Result with `orderId` → prescriber notified (existing behavior preserved).
- Result without `orderId`, recipient resolvable via fallback → notified.
- Result without any resolvable recipient → metric + audit emitted, no silent drop.

---

## 6. P1.4 — MedicationStatement active-med interaction input (verify-first)

### 6.1 Problem & evidence

`MedicationStatement` is Tier-1 and is created on dispense (`createMedicationStatementOnDispense`, `medication.ts:1040`). A low-confidence review finding suggested the active-medication list consumed by interaction checks may not read from `MedicationStatement` end-to-end. **This is unverified — it may already work.**

### 6.2 Design (verify-first)

- **First, verify** what feeds `activeMedDisplayNames` into `checkInteractions` in OPD-Lite (and the pharmacy dispense check): trace `getMedicationNamesFromStatements` usage and confirm the active-med source includes dispensed `MedicationStatement`s.
- If the loop is already closed → document as a non-finding and close.
- If a gap is confirmed → wire the active-med interaction input to the Tier-1 `MedicationStatement` source; add a test asserting a dispensed med appears in the next interaction check's active-med set.

No design commitment beyond "verify, then fix only if broken" — honest scoping given the uncertainty.

---

## 7. P2 — Documented future epics (not designed here)

### 7.1 Lab→Pharmacy dosing awareness

**Gap:** pharmacy-lite consumes no lab results, so there is no renal-function-aware dosing or recent-INR check at the dispense step — even though the system ships metformin/ACE-inhibitor/warfarin monitoring on the lab side. This is the reverse of P0.1 and closes the therapeutic loop.

**Recommended direction (for a future spec):** a data-minimized Hub endpoint exposing the *latest relevant* lab value (e.g. eGFR, INR, potassium) for a dispensed drug's monitoring analytes, surfaced as an advisory banner at dispense (never an auto-block — clinical judgment + Rule #3 fallback apply). 

**Open clinical questions:** which analytes gate which drugs; staleness thresholds; advisory vs. hard-stop; consent scope for pharmacy reading lab results. Needs clinical + data-minimization review → its own epic/spec.

### 7.2 Pharmopedia in-context deep-linking

**Gap:** Pharmopedia (Expo/React Native reference app) is islanded — no deep links from pharmacy-lite/lab-lite (Next PWAs) into a drug monograph. A pharmacist verifying an interaction or a lab tech checking a drug level has no in-context path to the reference.

**Recommended direction (for a future spec):** a shared deep-link scheme (`ultranos://pharmopedia/drug/<atcCode>` + web fallback URL) that PWAs can link to and Pharmopedia can route. Reuses ATC as the shared key (consistent with P0.1). 

**Open questions:** cross-platform link handling (native scheme vs. universal link vs. web), whether a web build of Pharmopedia is in scope, auth/session hand-off. Needs its own epic/spec.

---

## 8. Cross-cutting concerns

- **Observability:** new metrics — `dispenseMonitoringEventsTotal`, `dispenseMonitoringUnresolvedCodeTotal`, `monitoringPullEventsTotal`, `unlinkedLabResultTotal`. All silent-failure paths become countable (Rule #3 spirit).
- **Security review checklist (per item):** RBAC on every new endpoint; data-minimization output-schema tests; blind-index correctness; no PHI in logs/metrics/audit metadata; no real patient UUID in any lab-facing payload.
- **Shared types:** add `DispenseMonitoringEvent`, `MedicationLabMapping` (ATC-keyed), and the pull DTOs to `packages/shared-types` so Hub and lab share one contract (no drift).

---

## 9. Implementation roadmap (sequenced)

1. **P0.2 first** — `recordDispense` interaction gate. Smallest, self-contained, pure safety win, no new tables. (Bounded.)
2. **P0.1a** — shared types + migrations (`medication_lab_mappings` seed pending clinical sign-off, `dispense_monitoring_events`).
3. **P0.1b** — Hub producer in `recordDispense` + ATC resolution + observability (dark).
4. **P0.1c** — `lab.pullDispenseMonitoringEvents` + `lab.pullMonitoringMappings` endpoints.
5. **P0.1d** — lab persistence (finding 1b): `monitoringFlags` + `medicationLabMappings` Dexie stores, `MonitoringFlag` type, accessors, real (non-mock) integration tests.
6. **P0.1e** — re-key bundled map to ATC (clinical sign-off) + lab `useMonitoringSync` worker + wire into sync provider.
7. **P0.1f** — E2E verification (warfarin dispense → INR flag).
8. **P1.4** — verify MedicationStatement interaction-input loop; fix only if broken.
9. **P1.3** — lab result notification fallback + unlinked-result observability.
10. **P2** — spin out lab→pharmacy dosing and pharmopedia deep-linking as separate epics/specs.

Dependencies: 2→3→4→6 are strictly ordered; the lab persistence (5) blocks the worker (6); items 1 and 8 are independent and can run any time.

---

## 10. Open questions

1. **Clinical sign-off** on the RxNorm→ATC re-keying (§3.8) — required before the seed migration.
2. **Backfill window** for in-flight monitored patients (§3.12) — how far back, or none?
3. **P1.3 blast radius** — how often do results arrive without `orderId` today? (Verify before designing the fallback depth.)
4. **Mapping refresh cadence** — piggyback on an existing catalog pull vs. dedicated `lab.pullMonitoringMappings`?

## 11. Out of scope

- Full lab→pharmacy dosing checks (P2 — future epic).
- Pharmopedia deep-linking implementation (P2 — future epic).
- Any change to the verified-working flows in §1.2.
- Patient-lite-mobile and opd-lite-mobile (scaffolded, not in these seams).
