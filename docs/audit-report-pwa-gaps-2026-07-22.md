# Ultranos Ecosystem — Feature & Function Gap Audit Report

**Date:** 2026-07-22
**Scope:** All four Next.js PWAs (`opd-lite`, `pharmacy-lite`, `lab-lite`, `admin-portal`), the Central Hub API (`hub-api`), and the shared packages that back them (`sync-engine`, `crypto`, `audit-logger`, `drug-db`, `mpi-engine`, `billing`, `shared-types`, `drug-catalog-sync`), audited against `docs/ultranos_master_prd_v3.md` and the CLAUDE.md healthcare safety rules.
**Method:** Six parallel read-only review agents (one per PWA, one for hub-api + packages, one cross-cutting PWA-infrastructure pass), each reading the full PRD and exhaustively exploring its assigned surface. All Critical/High findings carry file-level evidence.
**Branch state:** `ux-v1.5`, including the uncommitted `apps/hub-api/src/trpc/routers/patient.ts` change (a correct fix — see §6.5).

---

## 1. Executive Summary

The codebase is substantially more mature than the planning docs suggest. Encryption at rest, audit hash-chaining, HLC-stamped offline queues, FHIR R4 mapping, allergy prominence, AI confirmation gates, and the lab data-minimization API are genuinely well built and tested. The dominant problems are not missing foundations — they are **disconnections between well-built parts**:

1. **MFA/TOTP is disabled at login in every spoke** (identical `// TODO: MFA temporarily disabled` in opd-lite, pharmacy-lite, lab-lite), the admin portal allows password-only sign-in despite the PRD's "FIDO2 REQUIRED. No exceptions," and the Hub never enforces a second factor server-side. One TODO, four apps, zero server backstop.
2. **The Tier 1 safety-conflict pipeline exists but is never invoked.** The sync-engine's append-only conflict resolver is fully implemented and tested — and the Hub's `sync.push` bypasses it, upserting newer-HLC allergy/medication/condition rows (LWW in effect). Nothing ever writes `sync_conflicts`; prescriptions are never actually blocked; the flagship clinical-safety alert monitors an empty table. OPD Lite's client shows a warning banner but does not disable the prescription form.
3. **Pharmacy Lite's entire dispensing safety core is orphaned.** The fulfillment checklist and confirmation modal (allergy banner, interaction re-check, recall alerts, substitution, batch capture, global-invalidation check) are fully built and fully tested — and mounted on no route. The reachable scan flow dead-ends, and a QR already dispensed at Pharmacy A verifies green at Pharmacy B.
4. **Consent enforcement is thin and break-glass is absent everywhere.** Consent grants are not provider-scoped, `sync.pull` has no consent check (and SOAP-note pulls are not even patient-scoped — a mass-PHI-exposure bug), OPD Lite opens charts without a TREATMENT-consent gate, and no break-glass flow exists in any app or the Hub (a P0 regulatory requirement).
5. **Lab Lite has outgrown its mandate.** The PRD's "minimal surface area by intent" portal is now the largest spoke, stores full patient demographics in a table excluded from PHI cleanup, and calls ~16 Hub endpoints that don't exist — while its own PHI-cleanup guard destroys the upload queue that the PRD requires to survive refresh.

Severity counts across the ecosystem: **12 Critical, ~18 High, ~25 Medium** distinct findings after de-duplication.

---

## 2. Critical Findings (ecosystem-wide)

| # | Finding | Where | Evidence |
|---|---------|-------|----------|
| C1 | **MFA disabled at login in all three clinical spokes** — credential success bypasses the fully-built TOTP step | opd-lite, pharmacy-lite, lab-lite | `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx:59`, `apps/pharmacy-lite/...login/page.tsx:59`, `apps/lab-lite/...login/page.tsx:66` — identical `// TODO: MFA temporarily disabled — re-enable before production` |
| C2 | **Admin portal FIDO2 not enforced** — password-only login succeeds when no WebAuthn factor is enrolled; users can unenroll their only factor | admin-portal | `apps/admin-portal/src/app/[locale]/login/page.tsx:67-107` |
| C3 | **Hub never enforces a second factor server-side** for any clinical role (no AAL2/factor gate on any procedure) | hub-api | `admin.ts:238` ("MFA count… deferred"); no factor check in `trpc/init.ts` |
| C4 | **Tier 1 LWW-in-effect at the Hub** — `sync.push` upserts newer-HLC allergies/active-meds/conditions; `packages/sync-engine` conflict resolver never invoked server-side; `sync_conflicts` written by nothing; `medication.create` never checks it | hub-api | `apps/hub-api/src/trpc/routers/sync.ts:124-234`; migration `041` created `sync_conflicts` as a "missing referenced table" |
| C5 | **OPD Lite does not block prescribing on Tier 1 conflict** — `prescriptionBlocked` renders a banner only; `handleAddPrescription` and `PrescriptionEntry` never enforce it | opd-lite | `apps/opd-lite/src/components/encounter-dashboard.tsx:789` (banner), `:797` (entry not disabled) |
| C6 | **Pharmacy dispensing workflow orphaned** — `FulfillmentChecklist` → `DispensingConfirmationModal` (all safety gates) imported only from tests; `/scan` dead-ends after "Proceed to Fulfillment" | pharmacy-lite | `apps/pharmacy-lite/src/app/[locale]/(app)/scan/page.tsx` renders `PharmacyScannerView` with no `onNavigateToReview` |
| C7 | **No pre-dispense global-invalidation check in the reachable flow** — `medication.getStatus` calls live only in orphaned components; already-dispensed QRs verify green at a second pharmacy (PRD Journey 2 fails) | pharmacy-lite | `PrescriptionScanner.tsx:144,196,228` (orphaned); `idempotency-check.ts` defined, never called |
| C8 | **`sync.pull` PHI exposure** — no consent check, no org scoping; `ClinicalImpression`/`soap_ledger` pulls not patient-scoped: any clinician token can bulk-pull every patient's SOAP notes | hub-api | `sync.ts:273-356`; `PATIENT_COLUMN_MAP.soap_ledger = null` (`sync.ts:61-62, 315-318`) |
| C9 | **No consent gate or break-glass on patient record access** — OPD Lite opens charts without TREATMENT-consent verification; no break-glass flow in any app or the Hub (P0, CL-14) | opd-lite + hub-api | `PatientChartPage.tsx` (no gate); grep `break.?glass` → test comment only |
| C10 | **Lab Lite upload queue destroyed on refresh** — `PhiCleanupGuard` clears `uploadQueue` on every `beforeunload`, directly contradicting LAB-024 "queue survives browser refresh"; un-synced result files are irrecoverable | lab-lite | `PhiCleanupGuard.tsx:21-26`; `phi-cleanup.ts:29` |
| C11 | **Pharmacy credentialing absent from admin portal** — no KYC queue, geofence config, or decommissioning for pharmacies while the equivalent lab tooling is fully built (Phase 4 blocker) | admin-portal | `nav-config.ts` (zero pharmacy entries); no `admin.*pharmacy*` procedures |
| C12 | **Licensed drug-interaction database still absent** — interactions come from the self-maintained catalog; the curated top-500 offline subset is not evidenced (OQ-02/CL-03 open; launch-blocking for clinical validity) | drug-db / hub-api | `supabase-drug-adapter`; catalog tiers are public/clinical/pharmacist, not a formulary subset |

---

## 3. OPD Lite (Desktop PWA) — `apps/opd-lite/`

**Overall:** The strongest spoke. Encounter creation, AI scribe (with a correct confirmation gate and dual storage), diagnosis search, drug catalog, prescription QR signing, staleness refusal, the check-unavailable fallback, allergy prominence, encrypted IndexedDB, and PHI cleanup are all implemented with good test coverage. Gaps cluster in onboarding, the flagship layout, and consent.

### Implemented (verified)
- AI Scribe with physician confirm gate + dual AI/confirmed storage + model version tagging (`ai-scribe-service.ts`, `soap-note-store.ts:263-297`) — safety rule #2 satisfied
- Drug-check unavailable fallback: never silently passes; allergy-load errors treated identically (`encounter-dashboard.tsx:337-410`) — safety rule #3 satisfied
- Allergy banner first, red, uncollapsed, `aria-live="assertive"`, LTR+RTL snapshot tests — safety rule #4 satisfied
- Ed25519-signed PHI-free prescription QR (`prescription-signing.ts`, `compress-prescription.ts`)
- Encrypted Dexie middleware, memory-only key, PHI wipe on session end; tokens never in local/sessionStorage
- 45-day drug-DB staleness refusal; FHIR R4 mappers with `_ultranos` namespace; 4 locales (en/ar/prs/ps)

### Gaps
| Area | Status | Severity | Detail |
|------|--------|----------|--------|
| Consent gate + break-glass (OPD-022) | MISSING | **Critical** | Charts load with no TREATMENT-consent check (`PatientChartPage.tsx`); only LABS and AI_PROCESSING scopes checked anywhere; no break-glass flow |
| Tier 1 conflict blocks prescribing | PARTIAL | **Critical** | Banner-only; form never disabled (see C5) |
| MFA at login | STUBBED | **Critical** | See C1 |
| Three-panel desktop layout (OPD-010, P0) | MISSING | High | `encounter-dashboard.tsx` is a single-column form; no persistent clinical sidebar, no drag-resize, no 1024px collapse |
| Interaction-override rigor (§20.2, SaMD) | PARTIAL | High | Any non-empty justification unlocks override — no password re-entry, no ≥20-char minimum, no predefined MAJOR reasons, no 24h audit-review flag |
| Real-time inline interaction check (OPD-041) | PARTIAL | Medium | Check fires on submit, not as-you-type with sidebar results |
| License expiry lifecycle (OPD-003) | MISSING | High | No 60/30/7-day notices, SUSPENDED handling, or renewal→KYC client-side |
| Provider profile setup (OPD-004) | STUBBED | High | Read-only card only; no capture form, FHIR Practitioner build, or geofence |
| Patient search (OPD-021) | PARTIAL | High | No QR-scan lookup; no phonetic/fuzzy matching offline (Dexie `startsWith` only) |
| Guardian for minors | MISSING | High | `guardian_id` field exists (`patient-loader.ts:54`) but never captured |
| Microphone dictation (OPD-034, P1) | MISSING | High | No SpeechRecognition/MediaRecorder code at all |
| Vitals coverage (OPD-036) | PARTIAL | Medium | HR, RR, O2 saturation missing (only weight/height/BP/temp/BMI); no sidebar sparklines |
| Generic substitution flag (OPD-044) | MISSING | Medium | Zero matches in lib/components/stores |
| Screen-share detection banner (OPD-014) | MISSING | Medium | No `getDisplayMedia` detection |
| Offline Clinical Token (§10.2) | MISSING | Medium | No 24h offline-token flow |
| Audit coverage of store-level writes | PARTIAL | Medium | `auditPhiAccess` called from 16 files, but vitals/prescription/allergy/diagnosis store writes show no direct emission; failures swallowed best-effort |
| AI feedback affordance (§22) | MISSING | Medium | No "flag AI output incorrect" control |
| Consent UI i18n | PARTIAL | Low | Hardcoded English with TODO markers in consent components |

---

## 4. Pharmacy Lite — `apps/pharmacy-lite/`

**Overall:** Excellent foundations — Ed25519 + KRL fail-closed QR verification, exemplary fail-closed interaction checking, encrypted offline dispense queue, audit chain, hub-side anomaly detection matching the PRD verbatim. The dominant problem is **last-mile wiring**: the safety components were built and tested but never mounted.

### Implemented (verified)
- QR verify: Ed25519 via sync-engine, KRL checked before signature, fail-closed on KRL failure and offline stale keys, revoked-key attempts audited (`prescription-verify.ts`)
- Offline dispensing queue: encrypted Dexie, DrainWorker with 401-pause/re-auth, idempotent hub replay, HLC (`dispense-sync.ts`, `sync-drain-init.ts`)
- Hub `recordDispense`: idempotency, HLC conflict handling, atomic DISPENSED/PARTIALLY_DISPENSED (`medication.ts:635-830`)
- Anomaly detection (PH-021): both PRD rules verbatim, deduped, 02:00 UTC cron, admin review routes
- Paper-Rx OCR (PH-022): Cloud Vision via server route, per-field confidence, `OCR_UNAVAILABLE` fallback, `LEGACY_PAPER` status
- Pharmacist identity binding (PH-003); session/PHI-wipe policy; audit with opaque IDs; clean PHI-in-logs sweep

### Gaps
| Area | Status | Severity | Detail |
|------|--------|----------|--------|
| Dispensing confirmation workflow | ORPHANED | **Critical** | See C6 — no reachable path completes a dispense with its safety gates |
| Pre-dispense global invalidation (PH-013) | PARTIAL | **Critical** | See C7; also batch/lot captured in UI but not in hub sync payload (`dispense-sync.ts:51-61`) |
| MFA at login | STUBBED | **Critical** | See C1 |
| Business KYC (PH-001, P0) | MISSING | High | No onboarding flow; read-only `licenseRef` display only |
| GPS geofencing (PH-002, P0) | MISSING | High | Zero geolocation code in the app; no hub enforcement either |
| Manual patient lookup (PH-011) | STUBBED | High | `ManualRxEntry` unmounted and calls nonexistent `medication.getPrescription`; no elevated audit priority |
| Patient identity confirmation (PH-010) | PARTIAL | High | Live scan flow never shows patient first name + DOB; PHARMACIST role has no data-minimized patient endpoint at the Hub (see §6.2) |
| Controlled substances (PH-020, P0) | STUBBED | High | `controlledSubstanceSchedule` missing from dispense schema (`ControlledSubstancesView.tsx:12-17` TODO); Schedule column renders `---`; view lists ALL dispenses; no extra confirmation step |
| Partial dispensing (PH-014, P1) | MISSING | Medium | Client hardcodes `status: 'completed'`; hub supports partial but client can never produce it |
| Generic substitution (PH-016, P1) | PARTIAL | Medium | Brand-level picker only (and orphaned); no AI suggestion, bioequivalence note, or prescriber notification |
| Scanner screen i18n | PARTIAL | Medium | ~15 hardcoded English strings on the primary clinical screen (`PharmacyScannerView.tsx`) |
| RTL unit snapshots | MISSING | Medium | Zero RTL snapshot test files in the app |

---

## 5. Lab Lite — `apps/lab-lite/`

**Overall:** The core PRD workflow (verify → upload → virus scan → encrypt → DiagnosticReport → notify → audit) is the most complete pipeline in the system, and the name+age data-minimization API is exemplary (Zod output schemas + RBAC actually hold). But the app has expanded far beyond its "minimal surface area by intent" mandate, and a large ring of features is client-complete with **no server counterpart**.

### Implemented (verified)
- LAB-010 name+age-only verification enforced at the API layer with output schemas, opaque refs, and audit on both outcomes (`lab.ts:325-455`, `rbac.ts:48-51`) — CLAUDE.md rule 7 holds
- Upload pipeline: client+server size validation, ClamAV fail-closed, AES field encryption, DiagnosticReport shell, doctor+patient notification queuing, audit
- OCR metadata (LAB-022): 85% threshold, blank-below-threshold, confirm-before-commit
- Order-sync projection returns first name + computed age only, with a dedicated data-minimization test
- SW + manifest + offline fallback page; 4 locales; strong test count (259 files)

### Gaps
| Area | Status | Severity | Detail |
|------|--------|----------|--------|
| Upload queue survives refresh (LAB-024) | BROKEN | **Critical** | See C10 — PHI cleanup destroys pending uploads; also the 48h expiry checker (`expiry-check.ts`) is implemented but never mounted |
| MFA at login | STUBBED | **Critical** | See C1 |
| ~16 client-called `lab.*` endpoints missing from Hub | STUBBED | **Critical/High** | Hub exposes 13 procedures; client calls `searchPatients`, `checkDuplicates`, `createPatient`, 4 notification procs, `reportQueueEvent`, `authorizeResult`, `createNotification`, `escalateAiResult`, SOP/quality/module sync — all fail silently or error. Notifications page always errors; patient registration is non-functional end-to-end |
| Audit event loss | PARTIAL | High | Queue drain/discard audit events route through dead `lab.reportQueueEvent` (`queue-audit.ts:25`, used by `SyncProvider.tsx`, `UploadQueue.tsx`) — rule 6 violated for those events |
| Data minimization: local `patients` table | VIOLATION | High | Full demographics (names, DOB, gender, phone) stored in Dexie and **excluded from `PHI_TABLES`** — persists after logout (`db.ts:811`, `phi-cleanup.ts:28-45`) |
| Scope creep vs "minimal surface" mandate | DEVIATION | High | Finance, inventory, procurement, mentorship, CHW mode, outbreak surveillance, SMS dispatch, P2P BLE, manual result authoring — materially larger PHI footprint without the CTO/compliance sign-off §6.2 requires |
| Offline QR verification (LAB-011) | PARTIAL | Medium | `practitioner_keys` Dexie table has no writer — offline path can never succeed (acknowledged TODO, `PatientVerifyScanner.tsx:134-135`) |
| Lab registration UI (LAB-001) | PARTIAL | Medium | Hub `lab.register` exists; no UI calls it; no document upload |
| Deferred virus rescan | PARTIAL | Medium | `virus_scan_status: 'pending'` files persist with no rescan worker |
| `smsQueue` PHI | VIOLATION | Medium | Recipient phone + clinical message bodies stored locally (acknowledged in `phi-cleanup.ts:21`) |
| SW caching strategy | UNSAFE | High | Unfiltered Serwist `defaultCache` can cache same-origin `/api/consultation/format` clinical responses in plaintext Cache Storage (see §7) |
| Core-workflow i18n | PARTIAL | Medium | `PatientVerifyForm`, `PatientVerifyScanner`, `ResultUpload` hardcode English in the primary workflow |
| Phantom dependencies | RISK | Medium | Imports `@ultranos/audit-logger`/`@ultranos/crypto` without declaring them in `package.json` (works via pnpm hoisting) |

---

## 6. Admin Portal — `apps/admin-portal/`

**Overall:** Substantially real — nearly every page is wired to live tRPC endpoints; only one explicit "coming soon" stub. Gaps are whole missing requirement areas rather than mocked tables. It is also the consistent outlier on platform infrastructure (see §7).

### Implemented (verified)
- Provider KYC queue with SLA countdown, document viewer, approve/reject/request-more-info; provider profiles with license urgency + anomaly summaries
- Lab credentialing end-to-end (review/approve/suspend, staff assignment, managerless-lab detection)
- Billing/subscriptions (Epic 27): trial countdown, module add/remove with user-impact preview, provider-agnostic payment setup, dunning states, trial-expiry interstitial
- Clinical safety monitoring: all four PRD metrics, anomaly alert workflow (acknowledge/escalate/reassign/resolve), audit-chain status + manual verification, license expiry queue
- MPI: patient search with warn badges, 3-step merge wizard with field-level resolution + typed confirmation, hub-side reversal support
- Audit browser with PHI-key redaction; zero console statements in src

### Gaps
| Area | Status | Severity | Detail |
|------|--------|----------|--------|
| FIDO2/MFA enforcement | VIOLATION | **Critical** | See C2 — PRD 10.1 "REQUIRED. No exceptions"; 4h session check is client-side JWT-iat at mount only |
| Pharmacy credentialing & lifecycle | MISSING | **Critical** | See C11 |
| Consent administration | STUBBED | High | `ConsentTimeline.tsx:15` renders "coming soon" — the portal's only consent UI; no re-consent campaigns, withdrawal-cascade monitoring, or break-glass post-hoc review queue (7.1 mandates 24h review + patient notification) |
| Provider lifecycle (8.2) | PARTIAL | High | No voluntary offboarding / custodian-of-record transfer / 90-day read-only management; no remote-wipe or device-token revocation UI (13.1, 10.2) |
| Patient data rights (8.1) | MISSING | Medium-High | No FHIR Bundle export tooling, no erasure-request queue; hub `confirmPurge`/`cancelPurge` exist with no consuming UI |
| MPI back-office (15.2) | PARTIAL | Medium | Duplicate-review queue lives only in OPD Lite; no admin queue, no unmerge UI (hub supports REVERSED), no threshold config |
| Registry verification (OPD-002) | PARTIAL | Medium | Display-only status; `registryVerificationStatus` hardcoded `null` in one hub path (`admin.ts:7434`) |
| Location switcher | COSMETIC | Medium | Five pages carry `// TODO: Pass locationId…` — the switcher visibly changes nothing (`dashboard`, `inventory`, `audit`, `alerts`, `labs` pages) |
| Audit gaps | PARTIAL | Medium | No patient-centric audit query; action groups omit BREAK_GLASS/CONSENT/EXPORT; CSV export endpoints emit no EXPORT audit event themselves |
| Monitoring (6.24) | PARTIAL | Medium | No consent-expiry queue, failed-MFA lockout surfacing, or break-glass notification; monthly safety report renders raw JSON |
| i18n | PARTIAL | Medium | Many hardcoded English strings (table headers, metric labels, interstitials, pagination) |
| Enterprise B2B billing (32.1) | MISSING | Low | No invoice-with-30-day-terms / bank-transfer recording flow |

---

## 7. Cross-Cutting PWA Infrastructure

Comparison across the four apps (✅ implemented / ⚠️ partial / ❌ missing):

| Concern | opd-lite | pharmacy-lite | lab-lite | admin-portal |
|---|---|---|---|---|
| Web manifest + service worker | ✅ | ✅ | ✅ | ❌ **not a PWA at all** |
| SW PHI-cache safety | ✅ allowlist | ⚠️ blocklist | ❌ unfiltered defaultCache | n/a |
| Offline fallback page | ❌ | ❌ | ✅ | n/a |
| Encrypted IndexedDB | ✅ full middleware | ✅ full middleware | ⚠️ field-level only | ❌ (no offline data) |
| Sync-engine + HLC | ✅ | ✅ | ⚠️ (Date.now in custom workers) | ❌ |
| 30-min inactivity re-auth + PHI wipe | ✅ | ✅ | ✅ | ❌ **none** |
| Audit-logger client | ✅ | ✅ | ✅ (dep undeclared) | ❌ ad-hoc auth events only |
| RTL visual regression (Playwright) | ✅ | ✅ | ✅ | ❌ excluded from config |
| RTL unit snapshots | 1 file | **0 files** | 8 files | 2 files |

Key cross-cutting findings:

1. **Admin portal skips the platform stack** (High): no manifest/SW (contradicts CLAUDE.md's "Next.js 15 PWA"), no inactivity re-auth despite viewing PHI in patients/merge pages, no audit-logger client, excluded from RTL CI. Either make it a PWA or amend the docs — but inactivity re-auth and audit are needed regardless.
2. **Three divergent SW PHI-caching strategies** (High): opd-lite allowlists sync-safe endpoints (safest); pharmacy-lite blocklists PHI patterns (rots as routers grow — no `allergy.` pattern today); lab-lite uses unfiltered `defaultCache`, which includes a NetworkFirst rule for same-origin `/api/` and can cache AI-formatted clinical narratives (`/api/consultation/format`) in unencrypted Cache Storage. Extract one shared allowlist-style helper into `ui-kit` or a new package.
3. **Refresh-token persistence contradicts the auth spec platform-wide** (High): all four apps use `@supabase/ssr` `createBrowserClient`, which persists the session (including refresh token) in cookies — vs CLAUDE.md's memory-only JWT + server-side Redis single-use rotation. The "memory only" code comments are true only of the mirror copy. Needs an explicit ADR or a custom storage adapter; today it is an undocumented deviation.
4. **Duplicated security-critical modules** (Medium/High): `encryption-key-store.ts`, `re-encryption.ts`, `hlc.ts`, and the sidebar `nav-user` component (with physical `ml-/mr-` classes, violating both the logical-properties rule and the ui-kit source-of-truth rule) exist as near-identical copies in three or four apps. Consolidate into shared packages.
5. **Testing asymmetry vs stated requirements** (Medium): no functional e2e suite anywhere (Playwright is RTL-screenshots only); no browser-level offline/service-worker e2e; pharmacy-lite has zero RTL snapshots; opd-lite persists an HLC node ID in sessionStorage contradicting its own "RAM-only" doc (`encounter-store.ts:12-19`).
6. **PHI-in-logs hygiene is good** across all apps (shape-only convention consistently followed). Two nits: `lab-lite .../results/[sampleId]/enter/page.tsx:121` logs a raw error object; leftover debug breadcrumb in `opd-lite EncounterHistoryList.tsx:265`.

---

## 8. Hub API & Shared Packages

**Overall:** The strongest area is audit logging (hash-chained with pg advisory lock, DB-level append-only triggers, daily chain verification, client drains). Field-level AES-256-GCM encryption is properly wired and startup-enforced. RBAC, MPI, FHIR mapping, license lifecycle, entitlements, and monitoring are largely real. The critical problems are the disconnected conflict pipeline (C4), unscoped `sync.pull` (C8), missing consent/break-glass enforcement (C9), and no server-side MFA (C3) — detailed in §2. Remaining findings:

| Area | Status | Severity | Detail |
|------|--------|----------|--------|
| Consent not provider-scoped | PARTIAL | High | `granted_to_id` exists in the FHIR type but is absent from `consent.sync` input and the insert — any doctor anywhere passes the gate if the patient granted *anyone* treatment consent (`enforceConsent.ts:44-77`, `consent.ts:22-38`) |
| Withdrawal cascade (HP-032) | MISSING | High | No 60s revocation, no blocking of queued ops, no provider notification — withdrawal only takes effect lazily at next check |
| Consent middleware coverage | PARTIAL | High | Applied to encounter/diagnostic-report/patient.read/medication only; missing from `sync.pull`, `allergy.list`, `medication-statement`, `appointment`, `patient.search`; `RESOURCE_TO_SCOPE` lacks AllergyIntolerance/MedicationStatement mappings |
| `consent.renew` mutates prior rows | VIOLATION | Medium | Sets `SUPERSEDED` via UPDATE, violating the file's own append-only rule (`consent.ts:234-238`) |
| Server trusts client `interactionCheck` | PARTIAL | High | `medication.create` accepts the client-asserted check result without re-running it; override lacks the PRD 20.2 protocol (password re-entry, ≥20-char justification, 24h review queue). Dispense gate does enforce BLOCKED/UNAVAILABLE — good |
| Patient IAP receipt validation stub | STUBBED | High | Accepts any non-empty token (`patient.ts:1537-1564` TODO); Apple webhook JWS unverified — anyone can self-grant Guardian PREMIUM |
| Pharmacist patient-verification endpoint | MISSING | High | PHARMACIST has no `Patient` access and no lab-style data-minimized equivalent — PH-010's name+DOB identity confirmation is unimplementable (also blocks pharmacy hub patient search, currently 403-dead) |
| Device tokens / remote wipe / offline clinical token (10.2, 13.1) | MISSING | High | Zero matches in hub-api |
| Sync-engine client queue policy | PARTIAL | High | `enqueueSyncAction` swallows enqueue failures (silent Tier-1 loss possible); retry caps at 5 → `failed` vs PRD 5s→60m + 24h alert; no 2,000-event/50MB overflow compaction with Tier-1-never-dropped |
| Audit emission swallowed | PARTIAL | Medium-High | Nearly every router wraps `audit.emit` in try/catch-warn, contradicting the logger's own "propagate errors up" rule — "audit every PHI access" is best-effort in practice |
| `chain_hash` field subset | PARTIAL | Medium | sessionId/deviceId/sourceIpHash/metadata not covered by the chain — tamperable without breaking it |
| MPI scoring deviations | DEVIATION | Medium | Afghan-patronymic weight table vs PRD signal set; phone = 25 pts vs PRD 80 (phone-only match no longer triggers the ≥80 alert); validate against the CL-11 synthetic dataset |
| Redis refresh rotation | MISSING | Medium | Redis used for rate limiting only (and fail-open); token lifecycle delegated to Supabase — deviation from PRD 10.2 |
| Signed `sync_receipt` (18.1) | MISSING | Medium | Plain results array |
| Tap Payments adapter | STUB | Medium | `tap.ts:30` throws "not yet implemented" — PRD targets low-card-adoption MENA regions |
| Break-glass schema unused | MISSING | Medium | `EMERGENCY_OVERRIDE` grantor role and `DELETE_REQUEST` audit action exist in schema only |
| Lab `pullOrders.specialInstructions` | REVIEW | Low-Medium | Free-text field could carry clinical context beyond name+age — policy review |
| FHIR Bundle export (8.1) | MISSING | High | No patient-record export endpoint (GDPR/PDPL right of access; blocks patient-lite) |
| CLAUDE.md stale reference | DOC | Low | `packages/drug-db/src/severity.ts` doesn't exist (severity enum lives in shared-types) |

**Uncommitted change note:** the working-tree diff in `apps/hub-api/src/trpc/routers/patient.ts` moves `enforceConsentMiddleware('Patient')` after `.input()` — a correct bug fix (the middleware reads `opts.input.patientId`, undefined before input parsing). Before this fix, consent enforcement on `patient.read` was silently non-functional. Recommend committing it.

---

## 9. Recommended Remediation Order

**P0 — before any production exposure (mostly wiring, not new construction):**
1. Re-enable MFA in the three spoke logins (C1) and enforce FIDO2 in admin (C2); add a server-side factor gate in hub-api (C3).
2. Wire `resolveConflict()` into `sync.push`, persist `sync_conflicts`, and gate `medication.create` on unresolved Tier 1 conflicts (C4); disable OPD Lite's prescription entry while `prescriptionBlocked` (C5).
3. Mount the pharmacy fulfillment flow on the scan route and call `medication.getStatus` pre-dispense (C6, C7); include batch/lot in the sync payload.
4. Patient-scope and consent-gate `sync.pull`; fix the `soap_ledger` mass-pull (C8).
5. Reconcile Lab Lite's `PhiCleanupGuard` with LAB-024 — preserve the encrypted pending upload queue as done for `syncQueue` (C10); mount the expiry checker.
6. Replace lab-lite's unfiltered SW `defaultCache` with the shared allowlist pattern.

**P1 — compliance and contract completion:**
7. Consent: provider-scope grants (`granted_to_id`), add the OPD Lite TREATMENT-consent gate, build break-glass (flow + post-hoc review queue + 24h notification) (C9); extend middleware coverage; fix `consent.renew` append-only.
8. Reconcile the ~16 missing `lab.*` Hub endpoints — implement, or delete the client features and their dead audit path.
9. Server-side re-check of drug interactions at `medication.create` + PRD 20.2 override protocol.
10. Pharmacist data-minimized patient-verification endpoint (unblocks PH-010/PH-011); pharmacy credentialing in admin portal (C11).
11. Add lab-lite's `patients` table to PHI cleanup (or eliminate lab-side registration pending the design decision); fix IAP receipt validation.
12. Admin portal: inactivity re-auth, audit-logger client, RTL CI inclusion; decide PWA-or-not and align CLAUDE.md.

**P2 — feature completion per PRD:**
13. OPD Lite three-panel layout, license-expiry lifecycle, provider profile setup, QR/phonetic patient search, guardian capture, missing vitals, dictation, substitution flag.
14. Consent administration + provider offboarding + patient data rights (FHIR Bundle export) in admin portal; MPI admin queue + unmerge.
15. Partial dispensing, controlled-substance schema field + confirmation step, KYC/geofencing in pharmacy-lite.
16. Resolve OQ-02 (licensed drug DB) and build the curated offline formulary subset (C12); Tap Payments adapter; i18n sweep for hardcoded English in clinical screens; functional/offline e2e suites.

---

## 10. What Is Working Well

Worth stating explicitly, because the audit skews negative by design:

- **Audit infrastructure** (hash chain, advisory-lock emission, DB append-only triggers, daily verification, offline client drains) is production-grade.
- **Field-level encryption** is mandatory-at-startup, versioned, and covers the right columns; browser-side Dexie encryption in opd/pharmacy is thorough, with key rotation and PHI cleanup.
- **Lab data-minimization enforcement** (LAB-010) is the best-implemented mandate in the system — output schemas + RBAC genuinely prevent over-fetching.
- **The AI scribe confirmation gate**, dual AI/confirmed storage, and model staleness refusal fully satisfy safety rule #2.
- **Drug-check fail-closed behavior** (never "clear" on failure) is correctly implemented in both opd-lite and pharmacy-lite's checker.
- **PHI-in-logs discipline** is consistently good across all apps and the hub.
- **The sync-engine package** (HLC, tiered conflict resolver, priority queue, encrypted payloads) is well-designed — it just needs to actually be invoked at the Hub.
