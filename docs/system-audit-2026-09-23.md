# Ultranos System Audit — 2026-09-23

**Scope:** apps/opd-lite, apps/lab-lite, apps/pharmacy-lite, apps/admin-portal, apps/hub-api, packages/* (all 9), and the ten end-to-end inter-app workflows.
**Branch:** `inter-spoke-intergration-v2`
**Method:** Seven parallel read-only review agents (one per app, hub API, shared packages, inter-app workflow tracing), followed by orchestrator re-verification of every Critical and load-bearing High claim directly against source. Confidence labels: **[V]** = verified against source this audit (cited file:line was read); **[A]** = agent-verified with cited evidence, spot-consistent but not independently re-read; **[?]** = suspected / needs confirmation. All Critical findings below are [V] unless noted.

**How to use this document:** Each finding is written as an agent-executable work item: evidence location, impact, and fix. Section 9 packages them into a phased remediation roadmap. When dispatching improvement agents, give each agent one work package from §9 plus the relevant per-app section.

---

## 1. Executive Summary

The Ultranos codebase is substantially more mature than a typical pre-production healthcare system: the safety-critical *algorithms* — Tier-1 append-only conflict resolution, drug-interaction fail-explicit semantics ("UNAVAILABLE, never CLEAR"), hash-chained audit writes, blind-index lab patient references, Ed25519 prescription QR verification with fail-closed KRL, field-level AES-GCM encryption with fail-fast startup — are correctly implemented and well tested (~940 test files across the monorepo).

The system fails at the **seams**, in four recurring patterns:

1. **The trust boundary is broken at the Hub.** Authorization is anchored to user-writable `user_metadata` (platform-wide privilege escalation), `sync.pull`/`sync.push` and `patient.list/search` lack object-level authorization and consent checks, and the drug-interaction dispense gate trusts a client-attested value. These undo most of the downstream safety engineering and **block production**.

2. **"Built but never wired."** Correct, tested components exist that nothing calls: OPD's audit drain, background sync, and PHI cleanup guard; pharmacy's local double-dispense idempotency check; the identity-QR signature verifier; the appointments router's create/update procedures. Unit tests pass; the feature is dead in production.

3. **Client↔Hub contract drift with no contract tests.** The three PWA spokes call the Hub via hand-rolled stringly-typed fetch wrappers. Lab-lite currently calls **10+ Hub procedures that do not exist** (patient registration, result authorization sign-off, AI escalation, peer network, and more), all failing silently at runtime. This failure mode has recurred at least four documented times.

4. **Fail-open and fire-and-forget on safety-relevant edges.** Plaintext fallback for encrypted sync payloads, swallowed enqueue failures, silent dead-lettering of lab results, best-effort MedicationStatement creation, unknown resource types defaulting to LWW, allergy data never reaching the pharmacy dispense screen. The system rarely crashes but frequently *silently under-delivers* — the worst failure mode for a clinical platform.

**Single most dangerous clinical finding:** the pharmacy dispense-time allergy gate is a placebo. Allergies recorded in OPD never reach the pharmacy fulfillment screen (the check runs against pharmacy-local free-text allergies only, and even those are wiped by a full-page reload on the primary flow), and `undefined` allergies render as "No Known Allergies."

**Verdict by component:**

| Component | Maturity | Production blockers |
|---|---|---|
| hub-api | Strong crypto/audit core; broken trust boundary | C-HUB-1..4, H-HUB-1..6 |
| opd-lite | Best spoke; late-beta | Unwired audit drain, offline registration, MFA off |
| pharmacy-lite | Excellent machinery, broken safety input | Allergy wiring, dispense loss path, taxRate |
| lab-lite | Solid core pipeline; heavy drift + scope sprawl | Dead registration, data-min cracks, unencrypted PHI DB |
| admin-portal | Most disciplined UI; weakest auth | user_metadata trust, non-functional MFA, open redirect |
| packages | Highest quality layer | Plaintext queue fallback, partial hash chain |

---

## 2. Systemic Critical Findings (production blockers)

These cut across components and must be fixed before any real-PHI deployment.

### C-SYS-1 [V] Privilege escalation: authorization derives from user-writable `user_metadata`
- **Evidence:** `apps/hub-api/src/trpc/init.ts:70-82` — `role`, `org_id`, `facility_id`, and `status` are read from JWT `user_metadata`. Roles are provisioned into `user_metadata` at `admin.ts:2933`, `registration.ts:136`, `patient-registration.ts:275/507/641`. Binary file routes repeat the pattern (`app/api/lab-files/[fileId]/route.ts:47-53`). Client apps mirror it (`admin-portal AuthGuard.tsx:56-58`).
- **Impact:** In Supabase, `user_metadata` is self-service writable by the authenticated user (`supabase.auth.updateUser({ data: { role: 'ADMIN' } })`). Any authenticated low-privilege user — including a patient with an OTP session (patients receive live sessions incl. refresh token at `patient-registration.ts:326`) — can mint an ADMIN token, pass every hub check, and read/merge/overwrite PHI platform-wide. A SUSPENDED user can clear their own `status` (bypasses `init.ts:132`). *Caveat: exploitability assumes the default GoTrue `updateUser` path is enabled; no code-level mitigation exists.*
- **Fix:** Move role/org/facility/status to `app_metadata` (server-only writable) or resolve from DB per request. Update all provisioning sites, `init.ts`, file routes, and client-side JWT parsing (admin-portal, spokes) in one coordinated change. Add a regression test that a token with `user_metadata.role=ADMIN` but no `app_metadata` role is rejected.

### C-SYS-2 [V] `sync.pull` / `sync.push` lack object-level authorization and consent
- **Evidence:** `apps/hub-api/src/trpc/routers/sync.ts:602-696` — pull checks only `hasResourceAccess(role, type)` (role→resource-type), then `select('*')` decrypted for the client-supplied `patientId`. No consent check, no ownership check, no org/facility scoping. `enforceResourceAccess` is imported at `sync.ts:4` and never used. Push (`sync.ts:472-479`) upserts on client-supplied `resourceId` with no ownership check on the existing row — a caller can overwrite another org's record by ID if their HLC is newer, and `org_id` is re-stamped to the attacker's org (`sync.ts:422-432`).
- **Impact:** PATIENT/GUARDIAN roles hold `Patient/Consent/MedicationStatement` (rbac.ts:52-63) → a patient-app user can pull another patient's demographics, consents, and medications by UUID. Clinicians can pull any record with consent withdrawn. Cross-tenant record hijack via push.
- **Fix:** Add per-role ownership scoping (PATIENT → own ID only), consent gate on pull, existing-row org/ownership check on push. Extend `sync-pull-scoping.test.ts` (currently only asserts column filtering, `:100-146` [A]) to cover caller rights.

### C-SYS-3 [V] Pharmacy dispense-time allergy gate is a placebo
- **Evidence chain:**
  - `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx:135` — `loadPrescriptions()` never resolves/sets a patient.
  - `DashboardActionHub.tsx:17-19` — the app's only `setActivePatient()` call is immediately followed by `window.location.href = '/scan'` — a full reload that wipes the non-persisted zustand `patient-store` (verified: no persist middleware, `stores/patient-store.ts`). Also drops the locale prefix.
  - `FulfillmentChecklist.tsx:79` / `DispensingConfirmationModal.tsx:52` — allergies come only from `activePatient?.allergies` → `undefined`.
  - `AllergyBanner.tsx:20-68` — `undefined` renders the **"No Known Allergies (NKA)"** card. Unknown ≠ NKA.
  - Even when a patient *is* present, allergies come from the pharmacy-local registry only (`pharmacy-lite/src/lib/db.ts:111`); pharmacy-lite **never calls hub `allergy.list`** (grep verified: only opd-lite does). `dispense-interaction-check.ts` receives `patientAllergies ?? []` → ALLERGY_MATCH can never fire on OPD-recorded allergies.
  - No patient↔prescription identity assertion exists: a stale `activePatient` from a previous search can supply the *wrong patient's* allergies for a scanned QR (`clearPatient()` defined at `patient-store.ts:13` but never called [A]).
- **Impact:** An allergy documented in OPD (Tier-1, priority-1 sync, red-banner-everywhere data) will not block dispensing at the pharmacy. Violates Safety Rules #2/#3/#4 in the primary dispensing path.
- **Fix (ordered):** (1) resolve the patient from the QR's `pat` ref (local `db.patients` + hub fetch of allergies via a consent-gated endpoint) inside `loadPrescriptions`; (2) add an explicit amber "Allergy status unknown — verify verbally" banner state distinct from NKA; (3) assert `activePatient` matches `prescription.pat` before using allergies; call `clearPatient()` on fulfillment completion; (4) use `router.push` with locale, not `window.location.href`; (5) add the CLAUDE.md-required allergy-prominence snapshot test (currently zero AllergyBanner tests, grep verified [A]).

### C-SYS-4 [V] Lab spoke receives the real patient UUID via photo URLs — blind-index defeated
- **Evidence:** `apps/hub-api/src/lib/photo-urls.ts:64-66` — `photoKey(id) = '${id}.webp'` where `id` is the patient UUID; Supabase signed URLs embed the object path. Returned to lab clients in `lab.pullOrders` (lab.ts:1988-2010 [A]), `lab.verifyPatient` (lab.ts:649-659 [A]), `lab.getOrderPatientDetails` (lab.ts:750-754 [A]). The inline comment claiming the UUID is "never returned to the lab client" is false.
- **Impact:** Direct violation of Safety Rule #7 (real patient UUID must never reach the lab). The constant key also lets a lab correlate the same patient across orders, defeating the HMAC blind index's core purpose.
- **Fix:** Random (or blind-ref-derived) photo storage keys, or a hub proxy endpoint (`/lab-photos/<blindRef>`) that never exposes the storage path. Related decision needed: photos are returned on the *list* tier at all (H-HUB-5) — Rule #7 allows first name + age only there.

### C-SYS-5 [V] Lab-lite calls 10+ Hub procedures that do not exist — silent runtime failures
- **Evidence (all verified against `hub-api/src/trpc/routers/` and `_app.ts`):**

| Call site | Target | Hub reality |
|---|---|---|
| `lab-lite/src/lib/trpc.ts:499` | `lab.searchPatients` | absent |
| `lab-lite/src/lib/trpc.ts:561` | `lab.checkDuplicates` | absent (exists as `patient.checkDuplicates`) |
| `lab-lite/src/lib/trpc.ts:596` | `lab.createPatient` | absent (exists as `patient.create`) |
| `lab-lite/src/lib/authorization-sync.ts:42,112` [A] | `lab.authorizeResult`, `lab.createNotification` | absent |
| `lab-lite/src/lib/result-release.ts:87` [A] | `lab.createNotification` | absent |
| `lab-lite/src/lib/confidence-escalation.ts:77` [A] | `lab.escalateAiResult` | absent |
| `lab-lite/src/lib/queue-audit.ts:25` [A] | `lab.reportQueueEvent` | absent |
| `lab-lite/src/lib/peer-network-sync.ts:39-149` [A] | `peerNetwork.*` (5 procedures) | router not registered |
| `lab-lite/src/lib/provenance-drain-worker.ts:209` [A] | `ai-provenance.sync` | absent (comment admits future story) |
| `pharmacy-lite/src/lib/transfers/network-stock-query.ts:12,40` [A] | `inventory.networkStock(Bulk)` | router absent |

- **Impact:** Lab patient registration is dead online (form throws on 404, `PatientRegistrationForm.tsx:151-173` [A]); result authorization sign-off and AI escalation silently sync nothing (wrapped in `catch {}`). Clinically relevant features appear to work while doing nothing.
- **Fix:** (1) Immediate: point registration/search at real procedures or add lab-scoped tier-compliant ones; (2) Structural: add a CI contract test that enumerates every `/router.procedure` path called by each spoke against the hub's `_app.ts` router map — this single test would have caught all four historical drift incidents documented in `lab-lite/src/lib/trpc.ts:353,399` plus everything in this table. (3) Longer term: generate typed clients from the hub AppRouter (type-only import) for the three raw-fetch spokes; admin-portal already has compile-time safety.

### C-SYS-6 [V] MFA is absent platform-wide despite being mandated

> **Post-audit decision (2026-09-23, user):** MFA is re-scoped from a mandatory requirement to an **admin-controlled org-level feature toggle (default OFF)** managed in the Admin Portal, with conditional server-side enforcement when enabled. See Story 56.3 and the remediation overview's Resolved Decisions. The broken/fake MFA code documented below still needs fixing; the "mandatory for all staff" framing no longer applies.
- **Evidence:** OPD `login/page.tsx:59`, lab-lite `login/page.tsx:67`, pharmacy-lite `login/page.tsx:59` — all three carry `// TODO: MFA temporarily disabled — re-enable before production` and complete sign-in unconditionally. Admin-portal is worse: MFA is optional AND non-functional — `login/page.tsx:141-145` and `settings/page.tsx:292-296` call `supabase.auth.mfa.verify({ code: '' })` with **no WebAuthn ceremony anywhere** (zero `navigator.credentials` usage [A]); the post-MFA role check reads the wrong claim (`payload.role` at `login/page.tsx:164`) so a real security-key admin would always be denied. Hub-side, **no `aal`/`amr` claim check exists anywhere** (`init.ts`, `jwt.ts` grep [A]) — so even client-side MFA would be advisory.
- **Fix:** Server-side AAL enforcement in `init.ts` for clinical roles + restore/implement client flows. Client toggles alone are insufficient.

---

## 3. Hub API (apps/hub-api)

### Critical
(C-SYS-1, C-SYS-2, C-SYS-4 above, plus:)

- **C-HUB-4 [A]** `patient.list`/`patient.search` expose the full patient directory (names, DOB, phone, addresses, blood group, `national_id_hash`, raw photo storage path, emergency contacts, disability, displacement category) to PATIENT/GUARDIAN roles — gated only by `enforceResourceAccess('Patient')` which those roles hold (`patient.ts:37-337`, `rbac.ts:52-63`). Fix: exclude PATIENT/GUARDIAN from list/search; own-record endpoints already exist in users.ts.

### High
- **H-HUB-1 [A]** Drug-interaction blocking trusts client-attested value: `medication.create` accepts `interactionCheck` from the client (`medication.ts:278-285`), stores it (`:340`), and `recordDispense` blocks only on that stored value (`:923-970`). The authoritative server check `medication.checkInteractions` (`:1734-1860`, correctly fail-safe) is **never invoked server-side** — it is also an orphaned endpoint (no frontend caller, grep [V]). A tampered client writes `CLEAR` and every gate passes. Fix: run the server check inside create/dispense; treat the client value as advisory.
- **H-HUB-2 [A]** Supervisor override is self-attested: any `overrideReason` ≥1 char bypasses BLOCKED/UNAVAILABLE; `override_supervisor` is set to the pharmacist's own ID (`medication.ts:927, 1129-1137`); severity classification is a string-prefix heuristic on free text (`:176-192`). Fix: require a distinct supervisor credential (PIN/second sign-in) and structured override reason codes.
- **H-HUB-3 [A]** `lab.pullDispenseMonitoringEvents` has no `lab_id` filter (`lab.ts:2090-2101`) — every lab sees every patient's dispense events platform-wide, including medication display + ATC (which also exceeds the Rule #7 tier; see lab-lite C1). Fix: scope by lab assignment AND strip medication identity to the required test + due date.
- **H-HUB-4 [A]** Unassigned orders broadcast to all labs: `pullOrders` scope is `received_by_lab_id = labId OR NULL` (`lab.ts:1937-1939`); `getOrderPatientDetails` only rejects when assigned to a different lab (`:713`) — any lab can pull full name/blood group/vitals/photo for any patient with an unclaimed order. Fix: routing/claim model (orders targeted to a lab or claim-before-details).
- **H-HUB-5 [A]** Patient photo returned on all three lab surfaces (`lab.ts:544-551, :1891, :686`) — beyond both documented tiers. Product decision needed: amend Rule #7 explicitly (photo on detail tier only, for identity verification) or remove.
- **H-HUB-6 [A]** Tier-1 append-only enforced only within the 60s window: `sync.ts:286-291` — a divergent offline allergy edit pushed >60s after another device's write silently overwrites (no both-versions retention). Violates Rule #5. Fix: Tier-1 conflicts must flag on `differentNode` regardless of window.
- **H-HUB-7 [A]** No consent enforcement on any `lab.ts` procedure and on `medicationStatement.listActive/listActiveForPharmacist` ([V] grep: `enforceConsentMiddleware` present in patient/encounter/medication/diagnostic-report, zero hits in lab.ts and medication-statement.ts). Fix: apply consistently; document any deliberate exemption.
- **H-HUB-8 [A]** Auth spec deviations: ES256/HS256 not RS256 (`jwt.ts:31-49`), attacker-influenced `alg` selection via unverified header peek, no issuer/audience validation, no 15-min expiry enforcement, refresh handled by Supabase not Redis. Fix: pin algorithm, add iss/aud, decide and document the Supabase-vs-spec auth architecture (this deviation recurs across all apps — see §8 Theme 4).

### Medium
- **M-HUB-1 [A]** PostgREST filter injection in admin search: `admin.ts:1159-1160, 2527-2528` interpolate `input.search` into `.or()` without the `sanitizeFilterValue` helper that `patient.ts:16-22` uses. Fix: sanitize.
- **M-HUB-2 [A]** Rate limiting fails open (no Redis → allow; Redis error → allow; `rateLimit.ts:63-94`), including the patient OTP endpoint → OTP brute-force window during Redis outages. Fix: fail-closed for auth-critical limiters.
- **M-HUB-3 [A]** `audit.sync` accepts caller-chosen action/resource/patientId with forced SUCCESS (`audit.ts:24-80`) and `admin.reportAuthEvent` / `lab.reportAuthEvent` are unauthenticated with spoofable `actorEmail` and per-instance in-memory rate limiting (`admin.ts:29-31`, `lab.ts:141-159`) — audit-trail pollution vectors. Fix: server-side validation of claimable events, real rate limiting, constrain attribution.
- **M-HUB-4 [A]** No transactions on multi-write flows — `submitResult` delete-then-insert analytes can lose results on crash (`lab.ts:1205-1223`); lab.register, uploadResult, recordDispense use compensating deletes. Fix: extend the existing atomic-RPC pattern (`create_patient_with_consent`) to these flows.
- **M-HUB-5 [A]** `sync.pull` unbounded + ~20 sequential queries per pull (`sync.ts:651-696`) — timeouts on large histories. Fix: cursor pagination + parallelization.
- **M-HUB-6 [A]** `'Appointment'` missing from ROLE_PERMISSIONS (`rbac.ts:15-70`) → appointments forbidden for every non-ADMIN role; combined with orphaned create/update procedures, the appointment feature is hub-side broken beyond `syncBatch`.
- **M-HUB-7 [A]** practitioner-id vs auth-user-id mismatch family: `lab.register` inserts `ctx.user.sub` where `practitioners.id` is expected per rbac.ts:148-159 docs; `getMyRole/getMyMentorship/getMyCertifications` filter practitioner columns by sub — likely silently return nothing for real users. Fix: audit + integration test with real seeded users.
- **M-HUB-8 [A]** Global tRPC error logger logs full `error.cause` (`app/api/trpc/[trpc]/route.ts:38-39`) — cause objects can carry request fragments/PHI. Fix: log code+shape only.
- **M-HUB-9 [A]** MPI duplicate BLOCK enforcement disabled (`patient.ts:494` TODO) — hard-block duplicates create with only a warning. Mirrored client-side in pharmacy (`PatientRegistrationForm.tsx:405` [A]).

### Notable positives [A, spot-verified]
Mandatory encryption wiring with startup fail-fast; hash-chained audit via locked RPC; blind-index design; strict `.output()` schemas on lab endpoints; timing-safe cron auth; keyset pagination on patient.list/pullOrders; consent ledger genuinely append-only; recordDispense idempotency; virus scan before file persistence.

### Inventory
Routers with zero tests: `appointment.ts` only. `any`: ~124. TODO: 2 (one safety-relevant: MPI BLOCK). `admin.ts` is an 8,326-line monolith — exhaustive per-procedure org-scoping review was not feasible; treat as residual risk and split it.

---

## 4. OPD Lite (apps/opd-lite)

### Critical
- **C-OPD-1 [V]** Client audit trail never drained to Hub: `startAuditDrain` (`lib/audit.ts:18`) has zero production callers (grep verified — only its test). 93 `auditPhiAccess()` call sites accumulate events in local Dexie forever; events are lost when PHI tables clear on logout. Rule #6's server-side trail is silently broken for all client-side PHI reads. Fix: wire `startAuditDrain`/`stopAuditDrain` into `SyncProvider`'s auth effect.
- **C-OPD-2 [A]** Patient registration has no offline path: `PatientRegistrationForm.tsx:51-76` — direct Hub fetches that throw on failure; no queue, no `navigator.onLine` branch. The most fundamental workflow in a low-connectivity clinic fails without network (same gap in lab-lite and, structurally, pharmacy-lite). Fix: local encrypted write + sync-queue enqueue with MPI-pending flag; duplicate check at drain time.

### High
- **H-OPD-1 [A]** AI Scribe feature dead: `ai-scribe-service.ts:14-22` reads a `token` field that `AuthSession` doesn't have → consent check always 401s → AI Assist permanently disabled. (Fails safe, but the whole feature can never activate; `lib/consent-check.ts:54-57` documents this exact bug being fixed elsewhere.) Fix: use `getAuthHeaders()` from `lib/hub-auth`.
- **H-OPD-2 [A]** At-rest encryption key derivable from on-disk inputs: session key = PBKDF2(supabaseUserId, localStorage deviceSalt) (`AuthGuard.tsx:76`, `packages/crypto/src/browser-crypto.ts:33-58`). Both inputs recoverable from the same machine → disk-access attacker re-derives the key and decrypts all IndexedDB PHI. See P-CRYPTO-1 (§7) — fix belongs in packages/crypto + login flow.
- **H-OPD-3 [A]** Appointments bypass sync architecture: `useAppointments.ts:116,182,228` stamp `Date.now().toString()` as "HLC" (lexicographically incomparable with real serialized HLCs → mis-ordered merges at `:372`), skip the durable queue entirely, and `syncAppointmentBatch` silently swallows failures (`lib/trpc.ts:66-71`). Offline-created appointments are lost until the page is opened online. Fix: `serializeHlc(hlc.now())` + route through sync queue + surface failures.
- **H-OPD-4 [A]** `useBackgroundSync` never mounted → SW Background Sync tags never registered; drain-on-reconnect relies solely on in-page `online` + 30s poll. Fix: mount in `SyncProvider`.
- **H-OPD-5 [A]** `PhiCleanupGuard` never mounted → "tab close → encrypted cache cleared" unimplemented (and as-written it would clear on refresh — needs design fix, then mounting).

### Medium
- **M-OPD-1 [A]** Audit events silently dropped when no session (`lib/audit.ts:59-62`) — session-hydration race window. Buffer + backfill actor.
- **M-OPD-2 [A]** Hub fetch/auth boilerplate duplicated ~15× in `lib/trpc.ts` despite `lib/hub-auth.ts` existing for exactly this reason — the AI-scribe bug is a direct casualty. No 401/expiry handling anywhere (all failures collapse to "offline"; only `listEncountersByPractitionerFromHub:249-258` does it right). Fix: single request helper with 401→refresh→retry→surface.
- **M-OPD-3 [A]** KYC document images sent browser-side to Google Cloud Vision with a `NEXT_PUBLIC_` API key (`lib/ocr.ts:46-58`); displayed OCR "confidence" is synthetic (0.92/0.78 by regex index) compared against a real-looking 0.85 threshold. Fix: proxy via Hub; real confidence.
- **M-OPD-4 [A]** `SyncProvider.handleOnline` calls `markSynced()` before any round-trip completes (`SyncProvider.tsx:207-211`), violating its own documented rule — false "in sync" banner on reconnect.
- **M-OPD-5 [A]** Two divergent HLC clocks (lib/hlc.ts RAM-only vs encounter-store sessionStorage-persisted node ID) — consolidate.
- **M-OPD-6 [A]** `ConsentRenewalModal` fully hardcoded English + hand-rolled dialog instead of ui-kit Dialog (`components/patient/ConsentRenewalModal.tsx:81-141`); consent expiry banner never receives `consentExpiryDate` (`PatientBannerStack.tsx:27`); biometric stale banner button is a no-op TODO (`:75-77`); encounter Hub revalidation is an acknowledged stub (Story 20.5, `EncounterHistoryList.tsx:233-248`).

### Notable positives [A]
Drug-interaction pipeline is exemplary (all four failure paths show "check unavailable"; override-with-justification; Tier-1 conflict prescription block). AllergyBanner fully satisfies Rule #4 incl. a "hub-says-allergies-exist-but-not-synced" state. AI SOAP flow has a real physician gate storing both versions. 0/12 sampled pages violate the layout standard. PHI-clean console output (all 17 calls verified line-by-line). 158 test files covering every CLAUDE.md-required category.

### Inventory
TODO: 12 (MFA, Story 20.5, consent i18n highest-stakes). console.*: 17 (0 log, all PHI-free). Type escapes: 38/20 files. Layout violations: 0 pages; minor: ConsentRenewalModal, appointments toolbar missing search, `opd-header.tsx:18` `text-left`, manifest theme-color mismatch (`#1e40af` vs brand `#2e9e71`).

---

## 5. Lab Lite (apps/lab-lite)

### Critical
- **C-LAB-1 [A]** Medication data flows into the lab spoke: `pullDispenseMonitoringEvents` delivers `medicationDisplay` + `atcCode` per named patient (`lib/trpc.ts:685-713`, `shared-types/src/monitoring.ts:17-27`), persisted in `monitoringFlags` (`db.ts:666-687`) — beyond every documented tier, and the table is never wiped by PHI cleanup. Fix hub-side (strip to test + due date; see H-HUB-3) + add table to cleanup.
- **C-LAB-2 [V]** Patient registration/search dead (part of C-SYS-5): `lab.searchPatients`/`checkDuplicates`/`createPatient` don't exist on the hub; `/patients/register` throws online; hub search 404s every keystroke masked by `catch {}`.
- **C-LAB-3 [V]** MFA disabled (part of C-SYS-6).

### High
- **H-LAB-1 [A]** Main Dexie DB (`lab-lite-db`) stores PHI **unencrypted** — no encryption middleware (unlike opd-lite/pharmacy-lite); the memory-only key is used only for consent/employee-health/delegate blobs. Plaintext at rest: samples, orders (name+age+ref), results/observations, `smsQueue` (phone + critical-result message body, `db.ts:967-969`), escalation chains. Fix: apply the same AES-GCM Dexie middleware pattern as the other spokes to PHI tables.
- **H-LAB-2 [A]** `phi-cleanup.ts:28-45` omits patient-linked tables: `patients`, `monitoringFlags`, `escalation_chains`, `resultSnapshots`, `incident_reports`, `custody_events`, `distributionQueue` — PHI survives logout on shared workstations. Fix: table-by-table re-audit; add or document justified retention.
- **H-LAB-3 [A]** Result submission — the most clinically important sync path — stamps `new Date().toISOString()` as `hlcTimestamp` (`results/[sampleId]/enter/page.tsx:260,397`; `db.ts:2295-2322` makes it optional). Correct usage exists elsewhere in the same app (`temperature-service.ts:195`). Fix: make `hlcTimestamp` required; stamp `serializeHlc(hlc.now())`. (Hub schema is only `z.string().min(1)` so it cannot reject non-HLC stamps [V] — consider a format check hub-side.)
- **H-LAB-4 [A]** `lab.syncQualityProfile` called with no Authorization header (`trpc.ts:34-53` `makeTrpcProcedure` sends only Content-Type) → every push 401s, swallowed. Fix: thread the token.
- **H-LAB-5 [A]** Data-min cracks on list surfaces: `patientPhotoUrl` on `pullOrders` responses persisted locally (`trpc.ts:626-640`, `db.ts:337-338`); `PatientSearchResult` DTO declares `gender`+`phone` (`trpc.ts:482-488`); raw National ID sent as a GET query-string param in `verifyPatient` (`trpc.ts:114-125` — lands in server/proxy logs and browser history). Fix: POST body for verification; trim DTOs; photo → detail tier only.
- **H-LAB-6 [A]** Silent dead-lettering: permanently failed result uploads (4xx) are marked failed in Dexie with **no UI surfacing** — a structured result can be permanently lost from the clinician's view while the lab believes it uploaded. Same for order-ack failures (`useOrderSync.ts:151-155`) which leave the order editable in OPD indefinitely. Fix: dead-letter/failed-sync UI on the worklist + retry affordance; ack retry queue.

### Medium
- **M-LAB-1 [A]** Consultation formatter sends technician free-text + values to a cloud LLM (`app/api/consultation/format/route.ts:44-50`; auth/SSRF guards and physician confirmation gate verified present). Add a PHI scrub/warning on free text.
- **M-LAB-2 [A]** Placeholder content shipping to clinicians: Visual Atlas — 35+ entries with 1×1 gray placeholder JPEGs and author "Dr. A. Placeholder" (`lib/atlas-seed-data.ts:19-36`); guidance content `[TRANSLATE]` markers + empty audio in ar/prs/ps (`lib/guidance-seed-data.ts`); readiness board equipment dimension stubbed (`readiness-engine.ts:236`); `AnomalyFlagDisplay` "escalate" is a no-op navigation (`enter/page.tsx:415-416`). Fix: feature-flag off until real.
- **M-LAB-3 [A]** Scope sprawl: 66 pages, 5,194-line `db.ts` with 55+ schema versions, 2,510-line audit-client. Gamification cluster (achievements/portfolio/competency/badges/mentorship/peer-network) is real local computation but adds ~15 tables to a "data-minimized Lite" spoke — product decision + split db.ts by domain.
- **M-LAB-4 [A]** Transport module fully unlocalized (8 of the app's 16 TODOs); ~210 hardcoded palette-color usages in ~90 files (incl. invalid `primary-500` classes that don't exist in the preset); 16 physical-direction RTL violations in 9 files.

### Notable positives [A]
Core pipeline (orders → accession → result entry → FHIR bundle → durable queue → `lab.submitResult`) is genuinely offline-first with correct permanent-vs-transient failure handling; SMS formatter enforces a PHI allowlist and throws on violation; consultation AI and anomaly flags have confirmation gates; sync queue durable and preserved by PHI cleanup with a compile-time guard; 300 test files; zero direct lucide imports; zero hex in classNames.

### Inventory
TODO: 16. console.*: 36 (2 log full error objects). `any`: 116 (+5 untyped Dexie tables). Verified-broken endpoints: 4 (3 registration + quality sync auth). Layout violations: queue/display (undocumented kiosk exception), finance/payment, equipment tabs, result-entry back button.

---

## 6. Pharmacy Lite (apps/pharmacy-lite)

### Critical
(C-SYS-3 allergy gate — the app's defining issue — plus:)

- **C-PHARM-2 [V]** taxRate unit inconsistency, 100× error: POS treats it as a fraction (`invoice-service.ts:57` `subtotal * taxRate`) while procurement/wholesale treat it as a percent (`po-totals.ts:46` `(subtotal * taxRate)/100`) — and the same `pharmacySettings.taxRate` feeds both (`fulfillment-store.ts:286-288` as fraction; `NewPurchaseOrderPage.tsx:97` prefilled as percent [A]). One domain is off by 100×. Fix: standardize on percent, migrate the settings value, add a cross-domain unit test.

### High
- **H-PHARM-1 [A]** Dispense record permanently lost when auth token unavailable at dispense time: `dispense-sync.ts:72-76, 100-103` — no-token → return **without enqueueing**; nothing sweeps unsynced dispenses; `phi-cleanup.ts:13-17` clears `dispenses` at logout. Offline shift + expired token → the safety-critical record is destroyed. Fix: always enqueue (the drain fetches the token at drain time already, `drain-sync-fn.ts:23`).
- **H-PHARM-2 [A]** Local double-dispense guard is dead code: `idempotency-check.ts` has zero callers; the only duplicate check is the Hub call which is explicitly fail-open offline (`PharmacyScannerView.tsx:146-188`). Offline re-scan dispenses twice with no warning. Fix: call the local check in `handleProceedToReview`.
- **H-PHARM-3 [A]** ~60 wall-clock `hlcTimestamp` sites across inventory/procurement/wholesale/patient layers (`stock-service.ts:40,51`, `expiry-watchdog.ts:30-66`, `patient-register.ts:39` self-admits "Simplified — real HLC uses hlcNow()"). Only audit/fulfillment/sales-order use real HLC. Fix: mechanical replacement with `serializeHlc(hlc.now())`.
- **H-PHARM-4 [A]** MFA disabled (part of C-SYS-6); auth tokens in JS-readable cookies (see §8 Theme 4).

### Medium
- **M-PHARM-1 [A]** Active-medication dimension of the interaction check degrades silently: `active-medications.ts:10-27` returns `[]` on offline/no-token/error → modal shows "clear" with no "partial check" indicator. Fix: return `{meds, complete}` and surface "active-medication check unavailable" as an override-requiring state.
- **M-PHARM-2 [A]** Inventory integrity cluster: `deductStock` TOCTOU outside the transaction (`stock-service.ts:19-53`); FEFO returns any batch with >0 units when none covers the quantity, then the deduction throw is swallowed (`fulfillment-store.ts:204-206` `catch { /* should not block */ }`) → dispense completes with no ledger entry; FEFO doesn't exclude expired batches (`fefo.ts:8-21` — protection depends on the watchdog having run). Fixes: tx-internal read-check-write; surface deduction failure + reconciliation task; `expiryDate > today` in the FEFO predicate.
- **M-PHARM-3 [A]** Financial PHI unencrypted forever: invoices/patientAccounts/ledgerEntries hold medication descriptions tied to patients but sit outside `PHI_TABLE_CONFIGS` and are explicitly preserved by cleanup (`db.ts:341-370`, `phi-cleanup.ts:31-34`). Fix: encrypt or strip med text to catalog IDs.
- **M-PHARM-4 [A]** Audit gaps: patient registration, local patient search, and patient-account reads emit no audit events (verified against the complete 14-site `auditPhiAccess` list).
- **M-PHARM-5 [A]** POS gaps: `recordPayment` cash-drawer race producing hub/local divergence (`payment-service.ts:40-72`); no cash-out/refund path at all (`cashOut` never written; grep "refund": zero) → every real-world drawer close shows a discrepancy; invoice numbering not atomic across tabs.
- **M-PHARM-6 [A]** Queue-view legacy fallback fabricates dosage (`PrescriptionQueueView.tsx:76-86` — `qty:1, unit:'tablet', dur:7` presented as authoritative). Fix: mark as unknown.
- **M-PHARM-7 [A]** Safety-critical strings hardcoded English: ~20 in `PharmacyScannerView` ("Fraud Warning", "DO NOT dispense", "Prescriber Key Revoked") + AllergyBanner labels — untranslated for ar/prs/ps pharmacists despite full 1,645-key × 4-locale parity elsewhere.
- **M-PHARM-8 [A]** Controlled substances have no dispense-time gate (schedule recorded only) — verify requirement against PRD.

### Notable positives [A, core spot-verified]
`runDispenseInteractionCheck` is Rule #3-compliant (never clear on absent data; hard-block contraindicated; override needs ≥10-char reason + supervisor recorded in `_ultranos.reviewOverride`). QR verification is exemplary fail-closed (expiry → KRL → cached key → Ed25519 → stale-key revalidation, all audited). Encryption architecture thoughtful (awaiting-key states, versioned middleware). 0/14 sampled pages violate layout standard (best of all apps). 2 `any`s in 478 files. Zero mock data.

### Inventory
TODO: 2 (both production-blocking: MFA, MPI BLOCK downgrade). console.*: 60 (no PHI observed). Test files: 179. Untested critical paths: allergy-prominence snapshot, scan→fulfillment patient integration, no-token dispense queueing, offline double-scan, taxRate cross-domain, deductStock concurrency.

---

## 7. Admin Portal (apps/admin-portal)

### Critical
- (C-SYS-1 client side; C-SYS-6 — MFA non-functional theater with wrong-claim role check H2.)

### High
- **H-ADM-1 [A]** Open redirect: `login/page.tsx:104-105,190-191` — `returnUrl.startsWith('/')` passes `//evil.com`. Fix: reject `//` and `/\`.
- **H-ADM-2 [A]** Patient merge/unmerge non-transactional: `patient-admin.ts:196-254` — survivor update, duplicate deactivation, and `merge_audits` insert are three separate calls; audit-insert failure leaves a merge with no reversal record, voiding the 72h-undo promise shown to the admin. Fix: atomic RPC.

### Medium
- **M-ADM-1 [A]** Audit-emit failures swallowed while PHI is still returned (`patient-admin.ts:47-60,130-144,283-301`) — decide and document fail-open vs fail-closed for the highest-privilege surface.
- **M-ADM-2 [A]** Audit-viewer PHI redaction is client-side cosmetic and the CSV export bypasses it entirely (`EventBrowser.tsx:45-73,226-237`). Redact server-side.
- **M-ADM-3 [A]** Route protection is client-render-gating only (`middleware.ts` does i18n only); acceptable only because hub-api gates data — add middleware auth for defense-in-depth. 4h session cap checked once at mount; `SessionTimer` display-only; no inactivity timeout.
- **M-ADM-4 [A]** Single binary ADMIN role — no superadmin/facility-admin separation (`rbac.ts`: `ADMIN: Set(['*'])`); any org admin can merge patients, read all audit logs, create more ADMINs. Cross-references the Epic 27 tenancy decisions — this needs the RBAC model from that epic.
- **M-ADM-5 [A]** Admin sets initial staff passwords directly (`users/create/page.tsx:33,90`, `email_confirm: true`) — prefer the existing invite/setup-link path only.
- **M-ADM-6 [A]** 57 silent catches, incl. merge-flow duplicate search failure rendering as "no duplicates found" (`merge/page.tsx:130-132`) — consequential false-empty.
- **M-ADM-7 [A]** Zero tests for the patients list/detail/merge UI — the single highest-risk admin flow (55 test files otherwise well distributed).

### Low highlights [A]
~60 hardcoded English strings in shipped pages (merge wizard, user create, audit table, pagination controls) despite 972-key × 4-locale parity; physical RTL properties in nav-user/location-switcher/nav-main/HeatMapGrid; `toLocaleString('en-GB')` hardcode; date-boundary `Z`-suffix bug in audit filters (`EventBrowser.tsx:124-125`); location-switcher is silently a no-op filter on 5 pages (same TODO ×5).

### Notable positives [A]
Purest UI discipline of the four apps: all 16 ui-kit proxies verified thin, zero console.* in production src, zero mock data, server-side pagination everywhere checked, type-MERGE confirmation + 72h undo UX, audit chain-integrity viewer, compensating deletes in createUser, RTL/a11y test coverage.

---

## 8. Shared Packages (packages/*)

### High
- **P-CRYPTO-1 [V]** Plaintext PHI fallback in the sync queue: `apps/opd-lite/src/lib/sync-queue.ts:110-116` — if encryption fails at enqueue, the full FHIR payload (allergies, prescriptions, SOAP content) is stored plaintext "for migration on next login" — potentially forever. Fix: use the queue's existing `awaiting-key` status instead of plaintext.
- **P-CRYPTO-2 [A]** Session key derived from non-secret inputs: PBKDF2(supabase `sub`, localStorage salt) (`packages/crypto/src/browser-crypto.ts:21-58`) — both recoverable on-device; at-rest encryption is nominal. Fix: mix a server-issued session-bound secret or wrap a random DEK with a hub-held key. (Same finding as H-OPD-2 — fix once here.)
- **P-AUDIT-1 [A]** Hash chain covers only 10 columns — `metadata`, `sessionId`, `deviceId`, `sourceIpHash`, `denialReason`, `orgId` are NOT tamper-evident (`audit-logger/src/logger.ts:60-71`, migration 045:76-87); protected only by droppable DB triggers. Fix: chain a canonical hash of the full row in the next chain version.
- **P-SYNC-1 [A]** Enqueue failure swallowed with `console.warn` (`sync-engine/src/enqueue.ts:49-51`) — quota/corruption means an allergy write silently never syncs; opd-lite has zero QuotaExceededError handling (grep verified). Fix: surface to `onStatusUpdate` + audit event; quota handling in opd-lite.
- **P-CRYPTO-3 [V-absence]** `verifyIdentityQrPayload` (identity/Health-Passport QR, ECDSA-P256) has zero production callers, and the verifier itself doesn't check `exp` (`ecdsa.ts:96-112`). Either the scan feature is unbuilt (gap) or scanning exists unverified. Contrast: prescription QR path is done right.

### Medium
- **P-SYNC-2 [A]** Unknown resource types default to Tier-3 LWW (`conflict-tiers.ts:41-43`) — fail-open for safety; default to TIER_2 minimum.
- **P-SYNC-3 [A]** Conflict with no `onConflict` handler → entry marked `synced`, conflict silently dropped (`drain-worker.ts:235-237`); opd-lite wires a handler, lab/pharmacy footgun. Fix: `failed`/`conflict` status default.
- **P-SYNC-4 [A]** HLC durability: state not persisted across restarts (clock-backwards device → new events sort before already-synced ones); `receive()` adopts remote wallMs unconditionally (one clinic PC set to 2035 poisons every peer for years) (`hlc.ts:18-23,56-80`). Fix: persist last HLC; max-drift rejection.
- **P-SYNC-5 [A]** Synced queue entries never purged — unbounded growth + indefinite PHI payload retention (`queue.ts:125-135`, no purge anywhere). Fix: retention job.
- **P-SYNC-6 [A]** Queue dedup can replace a pending `create` with an `update` (`queue.ts:70-83`) — safe only if hub push is upsert-everywhere; preserve `create`.
- **P-SYNC-7 [A]** Tier 4 (QUEUE/60s-window replay) is unreachable dead code (`conflict-resolver.ts:235-238`) — CLAUDE.md presents it as live; route or re-document.
- **P-AUDIT-2 [A]** Client PHI guard is a 28-name key blocklist that skips arrays (`audit-logger/src/client.ts:20-48,90-103`); server `emit` has no guard. Fix: whitelist schema for metadata.
- **P-AUDIT-3 [A]** `verifyChain(newest)` windows by timestamp but chains by chain_seq — spurious "broken chain" possible at window edges (`logger.ts:163-186`). Window by chain_seq.
- **P-CRYPTO-4 [A]** `decryptField` returns `"[Encrypted Content]"` on GCM auth-tag failure with no error/audit signal (`server-crypto.ts:38-68`) — tamper detection swallowed. Fix: discriminated result + audit hook.
- **P-DRUG-1 [A]** Allergy matching is display-name substring only (`checker.ts:149-178`) — "penicillin" vs "Amoxicillin" → no match; `substance_code` unused despite being kept plaintext specifically for coded matching. High-value improvement: code-based + cross-reactivity matching. Also module-global cache shared across adapters (`checker.ts:62-64`).
- **P-UIKIT-1 [V-mtime, A]** CLAUDE.md's "apps resolve through dist/" is wrong for components — exports map points component subpaths at `src/*.tsx`; only the barrel + icons go to dist. **dist is currently stale** (src dialog/avatar newer than newest dist file) — barrel importers get pre-ModalHeader code. Fix: rebuild ui-kit now; correct CLAUDE.md.
- **P-TYPES-1 [A]** admin-portal redefines local `interface Patient` twice (`patients/page.tsx:15`, `merge/page.tsx:17`); spokes re-declare hub DTOs per app (`HubDiagnosticReportItem` etc.). Consolidate in shared-types.

### Low highlights
CLAUDE.md stale pointers: `crypto/src/field-encrypt.ts`, `drug-db/src/severity.ts`, `audit-logger/src/schema.ts` don't exist [V-per-agent]. `@supabase/supabase-js`/`ssr` version drift (2.45/0.5 in opd+pharmacy vs 2.49/0.10.2 elsewhere) — all other core deps perfectly aligned. ~35 duplicated inline date formatters across apps. Hub stores patient names plaintext alongside `_enc` copies by design ("Option A" for ILIKE search) — inconsistent philosophy vs opd-lite's ADR-028. audit-logger has exactly 1 test file (client guard, drain, adapters, verifyChain untested). empty-state.native.tsx hardcodes hex grays [?]. Mojibake in sync-engine comments.

### Notable positives [A, core spot-verified]
Tier-1 append-only is genuinely unreachable by LWW, with escalation-to-safer-tier on mixed statuses and 33 boundary tests. Priority order matches CLAUDE.md exactly. Drug-db failure semantics exemplary (45 tests). Fresh random IVs everywhere, versioned formats, no hardcoded keys. KRL fail-closed. Queue durable with crash recovery and awaiting-key states.

---

## 9. Inter-App Workflow Status

| # | Workflow | Status | Blocking gap |
|---|---|---|---|
| 1 | Patient registration & identity | **WORKING** (online) | No offline path anywhere; MPI BLOCK disabled; lab registration dead (C-SYS-5) |
| 2 | Lab order lifecycle (OPD→lab→OPD) | **WORKING** | Silent dead-letter of failed result uploads; ack failure leaves order editable; no failure UI |
| 3 | Prescription→dispense | **WORKING happy-path** | Allergy gate placebo (C-SYS-3); MedicationStatement best-effort (`medication.ts:124-127`); no electronic pull path (QR + paper-OCR only) |
| 4 | Consent | **PARTIAL** | Enforced on patient/encounter/medication/diagnostic-report; **zero enforcement in lab.ts and medication-statement.ts** [V] |
| 5 | Appointments | **OPD-only** | `Appointment` missing from ROLE_PERMISSIONS; create/updateStatus/slots orphaned; no cross-app consumption |
| 6 | Admin provisioning → spoke auth | **WORKING** | No facility-level credential (practitioner-only auth); lazy key registration |
| 7 | Notifications | **PARTIAL** | 4 types have no producer: `SYNC_CONFLICT`, `CONSENT_CHANGE`, `ALLERGY_UPDATE`, `PRESCRIPTION_READY` [V] — Tier-1 conflicts notify no one; escalation cron trigger not found in-tree |
| 8 | Sync | **PARTIAL** | OPD full-fidelity; lab/pharmacy selective with wall-clock HLC stamps; admin online-only (by design); hub returns conflict HLC as object vs string input (asymmetric wire shape) |
| 9 | Duplicate/merge | **COHERENT** (one flow, same table) | Async-MPI reviews created fire-and-forget: no notification, no audit, stranded until an admin looks |
| 10 | Billing/entitlement | **WORKING** | Hub gates verified applied per-procedure [V]; spoke UI checks fail open (acceptable — hub is hard gate) |

**Orphaned hub endpoints (no frontend caller) [V]:** `appointment.create`, `appointment.updateStatus`, `appointment.slot.*`, `medication.checkInteractions` (the authoritative interaction check!), `medication.generatePrescriptionAudio`. Leads only [A?]: `lab.register`, `lab.getMyMentorship/getMyCertifications`, `lab.updateStaffRole`, `admin.health`, `ai.reportModelUpdateEvents`, `medication.logTTSPlayback`.

---

## 10. Cross-Cutting Themes (root causes, not symptoms)

1. **No client↔hub contract enforcement.** Three spokes use stringly-typed raw fetch; every drift incident (≥14 dead calls found) was invisible until traced by hand. *One CI contract test kills this class.*
2. **"Built but never mounted."** OPD audit drain, background sync, PHI guard; pharmacy idempotency check; identity-QR verifier; server interaction check. *Add integration/mount-path tests, and a periodic dead-export sweep.*
3. **Fire-and-forget on write-back edges.** Notifications, acks, MedicationStatement, async MPI, audit emission, enqueue failures — all best-effort with silent catches (57 in admin-portal alone). *Adopt a norm: every swallowed failure either retries durably or surfaces in a failure UI; the only dead-letter UI in the system today is OPD's conflict list.*
4. **The documented auth architecture and the implemented one are different systems.** CLAUDE.md says RS256 + in-memory tokens + Redis refresh rotation + MFA; reality is Supabase-managed ES256/HS256 sessions persisted in JS-readable cookies in all four apps, no MFA, no AAL check. *Decide which architecture is real, write it down, then close the delta (C-SYS-1, C-SYS-6, iss/aud validation) against the chosen one.*
5. **HLC discipline is app-dependent.** OPD enforces by regex; lab result entry and ~60 pharmacy sites stamp wall clock; hub accepts any string. *Enforce format hub-side + shared `hlcNow()` helper + lint rule.*
6. **Data minimization is enforced at the query but leaked at the edges.** Field lists are tier-correct; photo URLs, dispense monitoring, unassigned-order broadcast, and GET-string national IDs leak around them. *Add an output-schema test per lab endpoint asserting the exact allowed field set.*
7. **i18n is complete in the message files and incomplete in the code.** All four apps have full 4-locale key parity, yet the highest-stakes strings (pharmacy fraud warnings, consent renewal, merge wizard, transport) are hardcoded English. *Add a hardcoded-string lint (jsx-no-literals scoped) to CI.*

---

## 11. Remediation Roadmap (agent-ready work packages)

### Phase 0 — Production blockers (do first, in this order)
| WP | Title | Scope | Findings |
|---|---|---|---|
| 0.1 | Move authorization to `app_metadata` / DB lookup | hub-api init.ts, all provisioning sites, file routes, client JWT parsing | C-SYS-1 |
| 0.2 | Object-level authz + consent on sync.pull/push, patient.list/search | hub-api sync.ts, patient.ts, rbac tests | C-SYS-2, C-HUB-4 |
| 0.3 | Wire allergies into pharmacy dispensing + unknown-state banner + identity assertion | pharmacy-lite scan/fulfillment, hub allergy endpoint for pharmacists (consent-gated) | C-SYS-3, M-PHARM-1 |
| 0.4 | Server-side interaction check at create/dispense; supervisor credential for overrides | hub-api medication.ts | H-HUB-1, H-HUB-2 |
| 0.5 | Fix lab UUID leak (photo keys) + lab-scoped dispense monitoring + unassigned-order scoping | hub-api photo-urls.ts, lab.ts | C-SYS-4, H-HUB-3, H-HUB-4, H-HUB-5 |
| 0.6 | MFA: server-side AAL enforcement + restore client flows (fix admin WebAuthn + wrong-claim check) | hub init.ts + all four login flows | C-SYS-6 |
| 0.7 | Fix lab-lite dead endpoints (registration/search minimum) + add CI contract test | lab-lite trpc.ts, hub lab.ts, new CI test | C-SYS-5 |

### Phase 1 — Safety integrity (next sprint)
| WP | Title | Findings |
|---|---|---|
| 1.1 | Wire OPD audit drain + fix audit-drop-on-no-session; pharmacy audit gaps | C-OPD-1, M-OPD-1, M-PHARM-4 |
| 1.2 | Always-enqueue dispenses + local idempotency check + FEFO/deductStock fixes | H-PHARM-1, H-PHARM-2, M-PHARM-2 |
| 1.3 | HLC discipline: fix lab result entry + ~60 pharmacy sites + OPD appointments; hub format validation; persist HLC state; drift bound | H-LAB-3, H-PHARM-3, H-OPD-3, P-SYNC-4 |
| 1.4 | Encrypt lab-lite PHI tables + complete phi-cleanup coverage (lab + pharmacy financial tables) | H-LAB-1, H-LAB-2, M-PHARM-3 |
| 1.5 | Kill plaintext queue fallback; surface enqueue failures; conflict-drop default; Tier-1 window fix; unknown-type tier default | P-CRYPTO-1, P-SYNC-1..3, H-HUB-6, P-SYNC-2 |
| 1.6 | Dead-letter / sync-failure UI in lab-lite + pharmacy (model on OPD conflict list); ack retry | H-LAB-6, workflow gaps 4-5 |
| 1.7 | taxRate standardization + migration + cross-domain test | C-PHARM-2 |
| 1.8 | Key-derivation hardening (server-issued secret in KDF) | P-CRYPTO-2 / H-OPD-2 |

### Phase 2 — Reliability & completeness
- Offline patient registration (OPD, lab, pharmacy) with MPI-at-drain (C-OPD-2, M-LAB-3 counterpart, restore MPI BLOCK M-HUB-9)
- Wire the unmounted: useBackgroundSync, PhiCleanupGuard (redesigned), AI scribe auth fix (H-OPD-1, H-OPD-4, H-OPD-5)
- Consent enforcement on lab.ts + medication-statement.ts (H-HUB-7)
- Notification producers for SYNC_CONFLICT / ALLERGY_UPDATE / CONSENT_CHANGE; async-MPI review notifications (workflow 7, 9)
- Atomic RPCs: patient merge, submitResult analytes, recordDispense, lab.register (H-ADM-2, M-HUB-4)
- Auth architecture decision + documentation + iss/aud validation + open-redirect fix (Theme 4, H-HUB-8, H-ADM-1)
- MedicationStatement creation made durable (workflow 3); appointment RBAC + wire or remove orphaned procedures (M-HUB-6)
- Hash-chain full-row coverage; verifyChain window fix; audit metadata whitelist (P-AUDIT-1..3)
- POS: refund/cash-out flows, drawer race, invoice numbering (M-PHARM-5)
- sync.pull pagination; admin.ts split; rate-limit fail-closed for auth endpoints (M-HUB-2, M-HUB-5, L-HUB)

### Phase 3 — Quality, UX, and consistency
- i18n sweep: pharmacy scanner warnings, OPD consent modal, admin merge/user-create/audit strings, lab transport module + hardcoded-string lint
- Lab-lite: gate placeholder content (atlas, guidance, readiness equipment, escalate no-op); split db.ts; palette-token sweep (~210 sites); RTL physical-property fixes (lab 16, admin ~8, opd 1)
- Rebuild ui-kit dist + correct CLAUDE.md build-model description; fix stale CLAUDE.md file pointers; align @supabase versions
- Drug-db: code-based allergy matching + cross-reactivity (clinically high-value)
- Shared DTO consolidation into shared-types; typed clients for the three raw-fetch spokes
- KYC OCR: proxy via hub, real confidence values (M-OPD-3)
- Test gaps: AllergyBanner snapshot (pharmacy), admin merge UI, appointment router, audit-logger package, mpi-engine thresholds
- Admin RBAC granularity (superadmin vs facility-admin — coordinate with Epic 27 decisions)

---

## 12. Monorepo Inventory Summary

| Metric | opd-lite | lab-lite | pharmacy-lite | admin-portal | hub-api | packages |
|---|---|---|---|---|---|---|
| Source files | 387 | 948 | 478 | 191 | 261 | ~180 |
| Pages | 16 | 66 | 44 | 40 | — | — |
| Test files | 158 | 300 | 179 | 55 | 165 | ~70 |
| TODO/FIXME | 12 | 16 | 2 | 5 | 2 | 1 |
| console.* (prod) | 17 | 36 | 60 | 0 | n/a* | 0 PHI |
| `any`-type escapes | 38 | 116 | 2 | 1 | ~124 | low |
| Layout-violating pages | 0 | 4 | 0 | 0 | — | — |
| Direct lucide imports | 0 | 0 | 0 | 0 | — | — |

\* hub-api console usage is its logging mechanism; the PHI risk is the error-cause logging (M-HUB-8).

Dependency alignment: react ^19, next ^15, TS ^5.4, tailwind ^3.4, zod ^3.24, next-intl ^4.12, dexie ^4 — aligned across all apps. Only drift: `@supabase/supabase-js` ^2.45↔^2.49, `@supabase/ssr` ^0.5↔^0.10.2.

---

*Produced by a 7-agent parallel audit with orchestrator re-verification of all Critical findings. Confidence labels are per-finding; before acting on any [A]/[?] finding, the implementing agent must re-verify the cited evidence against source per the project's No-Assumptions rule.*
