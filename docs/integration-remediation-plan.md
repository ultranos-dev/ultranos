# Ultranos Cross-App Integration — Remediation Plan

Status: draft (2026-09-09). Owner: TBD. Branch base: `ui-design-v2.0`.

Addresses the 9 integration gaps found in the OPD-Lite ↔ Pharmacy-Lite ↔ Lab-Lite ↔ Pharmapedia audit.

## Locked design decisions
1. **Rx → Pharmacy:** add a Hub pull for prescriptions **and** keep signed-QR as the offline-primary channel.
2. **Lab ordering:** route `ServiceRequest` through the **sync-engine** (mirror `MedicationRequest`).
3. **Cross-spoke delivery:** **expand each spoke's pull filters** (Hub stays a store, not a router).
4. **Pharmapedia:** **add runtime interaction checks** for clinical users (`@ultranos/drug-db` is RN-safe).

## Guiding constraints (every workstream)
Offline-first · FHIR R4 field names · `_ultranos` namespace for extensions · audit event on every PHI touch · no PHI in logs/errors · correct sync tier · RTL + audit + offline test coverage · no commits without explicit user instruction.

---

## ⚠️ Phase 0 discovery — Patient identity model is inconsistent (BLOCKS 1B)

Verified during baseline checks. Lab data is stored under a **data-minimized HMAC blind index**, but consent and clinical apps use the **real** patient id. Three different `patient_ref` conventions coexist:

| Location | `patient_ref` value | Source |
|----------|---------------------|--------|
| `diagnostic_reports.patient_ref` | **bare** `generateBlindIndex(patientId, hmacKey)` | lab.ts:417 (verifyPatient) → :616 (uploadResult) |
| `service_requests.patient_ref` | `Patient/<generateBlindIndex(...)>` (prefixed) | lab.ts:1121 (pullOrders) |
| `consents.patient_ref` | `Patient/<real patient uuid>` | enforceConsent.ts:47 |

`hmacKey` is a **single global** server secret (`process.env.FIELD_ENCRYPTION_HMAC_KEY`, field-encryption.ts:19) → the blind index is deterministic across orgs, so linkage IS possible **server-side only** (the HMAC key must never reach a client).

**Consequence:** `diagnosticReport.listByPatient` cannot work on real data — its consent middleware needs the real id while its data query needs the blind index; one input can't be both. Existing Hub tests pass only because they mock both with the same value.

**Required fix (Option A, recommended):** the Hub resolves identity server-side.
- OPD-facing read accepts the **real** `patientId`.
- Consent middleware continues to use the real id (works as-is).
- The `diagnostic_reports` query computes `generateBlindIndex(patientId, hmacKey)` server-side and matches on that.
- Unify the three `patient_ref` conventions (decide bare vs `Patient/`-prefixed blind index) and add a shared server helper `patientBlindRef(patientId)` used by lab write, service-request, and clinician read paths.
- Replace the misleading Hub tests with ones that store under the blind index and read via the real id.

Rejected — Option B (store the real patient id on `diagnostic_reports` too): re-introduces a deanonymization vector on lab-scoped rows, violating data-minimization Rule 7.

---

## Phase 1 — Close the Lab loop (gaps #1, #2, #3)

### 1A. Lab ordering via sync-engine (gap #1)
**Hub data-layer — ✅ DONE (2026-09-09), test-first:**
- shared-types `service-request.schema.ts` already complete; `ServiceRequest` already Tier 2 (conflict-tiers:28) + priority 3 (sync-priority:21). (Note: service_requests stores the REAL `patient_id` — unlike diagnostic_reports' blind index — so no blind-indexing on the write path; lab data-minimization happens in `lab.pullOrders`.)
- **Migration 056**: renamed `service_requests.reason_code`→`order_reason_code`, `note`→`order_note` (globally-unique names so field-encryption doesn't collide with `encounters.reason_code` / `customer_ledger_entries.note` — mirrors the `ledger_note`/`invoice_items` precedent). Table was empty; zero data risk.
- **Crypto config**: added `order_reason_code`, `order_note` to `randomizedFields` (encrypted at rest). Rebuilt `@ultranos/crypto`; 82/82 crypto tests pass.
- **`flattenServiceRequest`** mapper + registered; **RBAC** `ServiceRequest`→`CLINICIAN_RESOURCES`; **sync.ts** `RESOURCE_TABLE_MAP` + `PATIENT_COLUMN_MAP` (`patient_id`; NOT org-scoped — no `org_id` column).
- **Decision applied:** clinical reason (`reasonCode`→`order_reason_code`, `note`→`order_note`) IS synced, encrypted at rest; `special_instructions` kept plaintext (reaches lab via pullOrders, matches existing design). `supporting_info` not synced.
- Tests: `sync.push` writes ServiceRequest with correct flat columns + PHI in encrypted columns (8/8 clinical-push, 51/51 sync suite, 5/5 lab-orders unaffected by the rename).

**OPD client layer — ✅ DONE (2026-09-09), test-first:**
- `SERVICE_REQUEST` added to shared `AuditResourceType` (rebuilt shared-types).
- Dexie **v25** `serviceRequests` table + `PHI_TABLE_CONFIGS` encryption registration (reasonCode/note → encrypted `_enc`).
- `lab-order-mapper.ts` (`mapInputToServiceRequest`, HLC-stamped) + `lab-order-store.ts` (`addLabOrder` enqueues `ServiceRequest` → the sync path the Hub now accepts; `cancelLabOrder` Tier-2 revoke; `loadOrders`; PHI cleanup). **13/13 store tests.**

**OPD order-entry UI — ✅ DONE:**
- `lab-test-catalog.ts` (curated LOINC starter set) + `LabOrderEntry.tsx` (test/priority/reason/special-instructions form + pending list, wired to the store) mounted in `encounter-dashboard.tsx` (active-encounter gated).
- i18n `labOrder` namespace across all 4 locales (en real; ar/prs/ps machine-translated — **need native review**), parity verified (17 keys × 4). 40/40 neighboring OPD store tests green.

**Full pipeline now wired + tested at the data layer:** OPD `addLabOrder` → `enqueueSyncAction('ServiceRequest')` → `sync.push` → `service_requests` (reason encrypted) → `lab.pullOrders` (data-minimized).

**Gap #3 producer — DECISION (Option A):** no new-order notification. Orders are **unassigned to a lab at creation** — labs discover them by pulling `lab.pullOrders` (existing pull-based design). A push notification has no single recipient without inventing an order-broadcast/routing model. The lab bell stays wired for future lab-directed events; new-order discovery remains pull-based.

**Remaining (follow-ups):**
- `LabOrderEntry` component render test (needs the `NextIntlClientProvider` test harness — same setup the pre-existing `notifications.test.tsx` lacks); store logic already fully tested.
- End-to-end enqueue→push→`lab.pullOrders` integration test; offline-survives-restart.
- Native review of the ar/prs/ps `labOrder` translations (log in TRANSLATION_REVIEW.md).

### 1B. OPD reads lab results (gap #2) — depends on Phase 0 fix
- Implement Phase 0 Option A: server-side blind-index resolution + consent on real id.
- Repoint OPD `fetchDiagnosticReportsForPatient` from the non-existent `lab.listReportsForPatient` to the corrected clinician read (`diagnosticReport.listByPatient` taking real `patientId`).
- Reconcile `HubDiagnosticReportItem`/`mapHubReportToFhir`: list output omits `conclusion`/`performerDisplay`/`presentedForm` (PHI/detail-only) — those come from `diagnosticReport.read` per report.
- Verify OPD clinical orgs carry the `LAB_LITE` entitlement the read path requires (`enforceEntitlement('LAB_LITE')`), else it 403s.
  - ✅ DONE (2026-09-09): the only subscribed org (`269c2a80…`) holds LAB_LITE+OPD_LITE+PHARMACY_LITE (all TRIAL), so the gate passes today. **Residual product decision:** in production, gating a prescriber's *result read* on `LAB_LITE` couples it to a lab subscription — consider gating on `OPD_LITE` instead, or ensure onboarding grants LAB_LITE to clinician orgs.
- ~~Add `DiagnosticReport` to OPD `sync-pull` for the offline path.~~ **DEFERRED (not mechanical).** `sync.pull` filters patient tables by the RAW `patientId` (sync.ts:581) and runs NO per-resource consent middleware. Adding `DiagnosticReport` would require (a) blind-index special-casing and (b) would BYPASS the LABS consent gate that `listByPatient` enforces — a privacy regression. The direct `listByPatient` path already delivers results and caches them to Dexie (offline-durable), so this is a redundant enhancement, not a functional gap. If a true offline delta-sync of results is wanted, design it as its own task that preserves consent enforcement.
- ✅ DONE: `diagnosticReport.read` fixed to blind-index the incoming ref (same identity contradiction as list).
- Tests: ✅ blind-index list + read tests (store under blind index, read via real id); ✅ OPD repoint + auth-token fix. Remaining: result renders in `LabResultsList`/`PatientResultTimeline` (UI-level, not yet added).

### 1C. Lab reads its notifications (gap #3) — ✅ DONE (read path) + ⚠️ producer gap
- ✅ Repointed Lab-Lite `getUnreadCount`/`listNotifications`/`acknowledgeNotification`/`acknowledgeAllNotifications` to the generic `notification.unreadCount`/`list`/`acknowledge`/`acknowledgeAll`. Client tests assert correct endpoints + `{ notifications }` unwrap.
- ✅ Added `notification.acknowledgeAll` Hub mutation (recipient-scoped, unread-only, audited) — the client's 4th call had no counterpart. Test-first (RED→GREEN); 6/6 notification router tests pass.
- ⚠️ **VERIFIED PRODUCER GAP:** every Hub notification producer targets a doctor (`encounter.practitioner_id` / `order.requester_id`) or patient — **nothing is ever addressed to a lab tech** (lab.ts:57-69, 1228). So the lab bell is correctly wired but will be **empty until a lab-recipient producer exists** (natural home: order-placed → notify the target lab, which belongs with **Gap #1** lab ordering). Recorded as a dependency, not silently assumed working.
- Pre-existing, unrelated: `notifications.test.tsx` (UI) fails on missing `NextIntlClientProvider` (i18n test-setup) — not touched by this change.

## Phase 2 — Close the Pharmacy loop (gaps #4, #5)
### 2A. Pharmacy Hub pull for prescriptions (gap #4, decision ①) — ✅ DONE (2026-09-09), test-first
- Hub **`medication.listForPharmacy`** — PHARMACIST-only, `PHARMACY_LITE` entitlement, audited (PHI_READ). Returns a patient's un-dispensed prescriptions (`ACTIVE`/`PARTIALLY_DISPENSED`), data-minimized to dispensing fields. Queried by the **BARE** patient UUID (the format `flattenMedicationRequest` stores — NOT `Patient/<uuid>`). No consent re-check (matches the QR/getStatus dispensing flow). Note: patient identity comes from the Health Passport identity QR (`pid`) or national-ID lookup — no `patientBlindRef` (prescriptions store the real id, unlike lab results). 3/3 tests.
- Pharmacy-Lite **`listPrescriptionsForPatient`** client (no-QR lookup path), mirroring `searchDrugCatalog`. QR stays offline-primary. 4/4 client tests.
- ⚠️ Flagged latent bug (pre-existing, not fixed): `medication.read` queries `subject_reference` with a `Patient/` prefix (medication.ts:472) while sync stores it **bare** — read would miss synced rows. Its tests mask this (mock ignores the `.eq` value).
- Follow-up: pharmacy "look up prescription (no QR)" UI screen; store results into the QR-verified prescription table.

### 2B. Dispense status back to the prescriber (gap #5) — ✅ DONE, test-first
- Verified status **does** sync into OPD's local `medications` via `recordDispense` → `medication_requests.prescription_status` → OPD `sync-pull` (`toFhirMedicationRequest` maps `prescriptionStatus`). Confirmed **no** UI rendered it.
- Added **`DispenseStatusBadge`** (ACTIVE/DISPENSED/PARTIALLY_DISPENSED/EXPIRED/CANCELLED → semantic colors) rendered in `EncounterDetail` prescription list. i18n across 4 locales (parity verified). 8/8 EncounterDetail tests green.

## ⚠️ Verification corrections (2026-09-09) — audit findings that were WRONG

Re-verified the original audit's #6/#7 "gaps" at source. Several were **mischaracterized** (the audit subagent grepped only the generic sync-enqueue path and missed dedicated mechanisms). Per the project's verify-before-claiming rule, these needed no code change:

- **OPD `onConflict` handler — ALREADY IMPLEMENTED.** [SyncProvider.tsx:149-159](../apps/opd-lite/src/components/providers/SyncProvider.tsx) passes an `onConflict` that flags the queue entry (`conflictFlag`), stores the remote version, and bumps the conflict count feeding the `ConflictList` review UI. Not a gap.
- **`KeyRevocationList` — FULLY WIRED (dedicated path, not the generic enqueue).** Producer: `practitioner-key.ts` `revokeKey` (ADMIN) + `getKRL` endpoint. Consumer: `pharmacy-lite/src/lib/krl-sync-worker.ts` fetches + applies snapshots; QR verification checks it via `krl-check`. Not an orphan.
- **Encounter-reference enforcement (#9) — already enforced client-side** for the real producers: `medication-request-mapper.ts:23` and `lab-order-mapper.ts:34` both throw if `encounterId` is missing. A Hub hard-require on `medication.create` (`encounterId` optional there) is deferred — risks non-clinical callers (e.g. paper Rx); client enforcement covers the clinical path.
- **Lab `DiagnosticReport` sync-queue enqueue (#7) — likely redundant, NOT removed.** Results reach the Hub via the `SyncProvider` upload queue → `lab.uploadResult` (verified live path). The `enqueueSyncEvent('DiagnosticReport')` writes to `syncQueue`, which `authorization-sync` drains only for `notification`/`labResultAuthorization` types — so the DiagnosticReport entries appear undrained (dead). Left in place with this note: removing sync code on "likely-dead" is riskier than a documented redundancy; needs a dedicated trace before deletion.

## Incidental bug fixes (found during the work, fixed test-first)
- **`medication.read`/`create` `subject_reference` prefix bug — ✅ FIXED (2026-09-09):** `create` stored `Patient/<id>` (prefixed) and `read` queried prefixed, while the sync path (`flattenMedicationRequest`), `sync.pull`, and `listForPharmacy` use **bare** UUIDs — so `read` never matched sync-path prescriptions and `toFhirMedicationRequest` would double-prefix create-path rows on pull-back. Normalized `create` + `read` to bare (table was empty → no migration). 52/52 medication tests.
- **`encounter-dashboard.tsx:923` — ✅ FIXED:** `medicationCodeableConcept.text` (`string | undefined`) → `?? ''` for the ICU aria-label param (pre-existing OPD typecheck error).
- **`practitioner_id` notification-recipient hardening — documented follow-up (not a current bug):** `notification.list`/`unreadCount`/`acknowledge` filter `recipient_ref = sub`; doctor-directed notifications are addressed to `practitioner_id`. These are **equal today** (no distinct `practitioner_id` claim minted — verified). If such a claim is ever introduced, switch those filters to match `[sub, practitionerId]`. Defensive only.

## Phase 3 — Cross-spoke delivery & sync hygiene (gaps #6, #7)
### 3A. Formalize per-spoke pull filters (decision ③, gap #6)
Pharmacy wholesale pull stays org-scoped; prescription access uses the scoped 2A endpoint (not a broad clinical pull). OPD clinical pull adds `DiagnosticReport`. Document the "each spoke pulls what it needs" contract in CLAUDE.md.

### 3B. Lab result push path — dedupe/wire (gap #7)
Resolve `lab.uploadResult` (live, via SyncProvider upload queue) vs. the unused `enqueueSyncEvent('DiagnosticReport')` + never-invoked `startDistributionDrainListener` (drain-worker.ts:217). Make one path authoritative; avoid double-delivery.

### 3C. Sync safety gaps (gap #7)
- `KeyRevocationList`: wire an Admin/Hub revocation producer + Pharmacy consumer (QR verification checks a KRL that never updates today).
- OPD drain `onConflict` handler: route Tier-1 conflicts to physician review (mirror Pharmacy's `sync-conflict-observer`).

## Phase 4 — Drug data & Pharmapedia (gaps #8, part of #3)
### 4A. Pharmapedia runtime interaction checks (decision ④) — ✅ CORE DONE (2026-09-09), test-first
- Added `@ultranos/drug-db` dep to `apps/pharmopedia` (+ vitest alias). Verified drug-db is RN-safe (no Dexie/DOM).
- **`interaction-service.ts`**: `flattenInteractionEntries` (pure — bridges Pharmapedia's per-drug Tier-2 monograph `DrugInteraction[]` → the shared checker's bidirectional pairwise `VocabInteractionEntry[]`), `createSqliteInteractionAdapter` (dynamic-imports SQLite so the module stays node-testable), `checkDrugInteractions` (uses the SAME `@ultranos/drug-db` checker as OPD/Pharmacy).
- **`getAllInteractionDrugs`** SQLite query reads all cached Tier-2 interactions.
- **Rule 3 verified in test**: empty/unsynced catalog → `UNAVAILABLE` (never a false CLEAR); known interaction detected. 4/4 tests.
- **RN "check-meds" screen — ✅ DONE:** `app/check-interactions.tsx` — drug search (`searchDrugs`) → add to med list → `checkDrugInteractions` per pair → severity-colored results, `UNAVAILABLE` banner (Rule 3), or "no interactions found". i18n `interactions` namespace across all 4 RN locales (type-linked to `en` → compile-time parity). Reachable via a "Check interactions" row on the Profile tab. `@ultranos/drug-db` already workspace-symlinked (no install needed). Screen conforms to existing screen patterns; the only typecheck errors are the **app-wide pre-existing** `tokens.native` tsc-subpath baseline (every Pharmapedia screen has it; Metro/Expo resolves it at build). Not runtime-verified (no Expo simulator in this environment); core logic is unit-tested 4/4.

Original plan note:
Add `@ultranos/drug-db` to `apps/pharmopedia`; build the offline lookup map from Pharmapedia's SQLite entries; clinical-user "check interactions vs a med list" tool. Enforce Rule 3 ("Interaction check unavailable" on failure/staleness) + the four mandated interaction test cases. Scope note: no patient med-history in Pharmapedia — checks run against a manually-entered list.

### 4B. Catalog parity (gap #8)
Parity check/test that Pharmapedia's SQLite pipeline and OPD/Pharmacy's `drug-catalog-sync` (Dexie) pull the same Hub catalog version/tier data. Keep pipelines separate; guarantee equivalence.

## Phase 5 — Encounter linkage & notification completeness (gap #9)
- Enforce a valid, resolvable `Encounter` reference on `MedicationRequest` and `ServiceRequest` at create-time and at Hub `sync.push`. **(still TODO)**
- **Fulfilment notification — ✅ DONE (2026-09-09), test-first:** `medication.recordDispense` dispatches a `PRESCRIPTION_DISPENSED` notification to the prescriber (recipient = `requester_id`, which == the doctor's JWT `sub` today — verified no distinct `practitioner_id` claim is minted yet, see trpc/init.ts / encounter.ts:663). Payload is **data-minimized** (opaque `prescriptionId` + status, no medication name). Best-effort, audited. OPD consumes it via `notification.list` and renders it (label `typePrescriptionDispensed` in 4 locales, Prescriptions tab + rx icon via `RX_TYPES`). Hub 34/34 medication+dispense-review tests; OPD 32/32 notification tests.
- **Future-proofing follow-up:** if a distinct `practitioner_id` JWT claim is ever introduced, `notification.list`/`unreadCount`/`acknowledge` must match `recipient_ref` against **both** `sub` and `practitionerId` (else clinician-directed notifications — lab results AND dispense — stop being delivered). Currently equal, so not blocking.
- **Interaction/dispense-conflict-resolution notification — ✅ DONE (2026-09-09), test-first (decision: dispense-review-resolved → pharmacist):** `dispenseReview.updateStatus` now `.select()`s the resolved row and dispatches a `DISPENSE_REVIEW_RESOLVED` notification to the pharmacist who raised the override (`override_supervisor`). Data-minimized payload (reviewId/prescriptionId + status), best-effort, audited. 11/11 dispense-review + record-dispense-review tests.
  - ✅ **Pharmacy notification consumer — DONE (2026-09-09):** built the pharmacy notification client (`getUnreadNotificationCount`/`listNotifications`/`acknowledgeNotification` → generic `notification.*`, 4/4 tests) + `NotificationBell` (badge, 30s poll) + `NotificationPanel` (list, acknowledge, type labels incl. `DISPENSE_REVIEW_RESOLVED`) + `notifications` i18n (4 locales, parity) + mounted in `BreadcrumbHeader`. Closes the loop: the dispatched notification now surfaces to the pharmacist. (UI not runtime-verified — no browser here; client is unit-tested, components typecheck-clean.)

- **Pharmacy lookup → dispense — decided READ-ONLY** (signed-QR remains the dispensing channel; lookup is for visibility/repeat-fill). Dispense-from-lookup deferred as its own scoped story (safety-critical: offline-dedup with QR dispenses, interaction re-check at dispense, dispense-review).

---

## Sequencing
0. Baseline verify + red tests → **done for 1B; surfaced the identity-model blocker above.**
1. Phase 0 identity-model fix (unblocks 1B/2A) → 1C (small) → 1A (large).
2. 2A → 2B.
3. 3A/3B/3C.
4. 4A/4B (parallelizable, independent app).
5. Phase 5 polish.

Phases 1–2 and Phase 4 touch different apps → run in **isolated worktrees** per the parallel-agent rule.

## Acceptance gates (every phase)
Typecheck + targeted tests green · audit-event test per new PHI endpoint · data-minimization test where lab/pharmacy read patient data · offline enqueue-survives-restart per new sync path · RTL snapshots for new UI · no PHI in logs.
