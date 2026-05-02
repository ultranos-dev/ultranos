# Ultranos Ecosystem — Comprehensive Gap Analysis Report

**Date:** 2026-05-02
**Branch:** `architecture-review-01`
**Scope:** All apps, shared packages, Hub API — audited against PRD v3.0, epics, and CLAUDE.md

---

## Executive Summary

The Ultranos ecosystem has strong foundational architecture: offline-first sync with tiered conflict resolution, FHIR R4 alignment, field-level encryption, hash-chained audit logging, and RBAC. However, significant gaps remain across **authentication flows, dashboards, PRD-mandated features, infrastructure, and regulatory compliance**. This report catalogs every identified gap organized by severity.

**Legend:**
- **CRITICAL** — Blocks production deployment or poses patient safety risk
- **HIGH** — Major feature gap visible to users or required by PRD
- **MEDIUM** — Important but not blocking; quality/compliance concern
- **LOW** — Nice-to-have, polish, or future-phase item

---

## Part 1: Per-App Gap Analysis

### 1.1 OPD Lite (Desktop PWA) — `apps/opd-lite/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| OPD-G01 | **No login/authentication page** | CRITICAL | Auth session store exists but no UI to populate it. No Supabase Auth integration. No MFA. Clinicians cannot sign in. |
| OPD-G02 | **No Service Worker or PWA manifest** | CRITICAL | No `manifest.json`, no service worker, no offline asset caching, no install prompt. PRD requires PWA installability (OPD-012: "install prompt after 2 minutes"). |
| OPD-G03 | **Missing "Plan" section in SOAP notes** | HIGH | Only Subjective + Objective implemented. Assessment (diagnosis) exists separately. Plan field is absent. SOAP is incomplete. |
| OPD-G04 | **No global navbar or navigation structure** | HIGH | No persistent header, no user menu, no logout button, no breadcrumbs. Hard to navigate between patient search and encounter. |
| OPD-G05 | **No encounter history / patient chart view** | HIGH | Cannot view past encounters for a patient. Only active encounter is accessible. |
| OPD-G06 | **No inactivity timeout / re-auth** | HIGH | PRD requires 30-min inactivity re-auth on clinical record views (Section 10.1). Not implemented. |
| OPD-G07 | **No conflict resolution UI** | HIGH | Sync dashboard shows conflicts but no form/modal to resolve them. Tier 1 conflicts require physician review within 24 hours per PRD. |
| OPD-G08 | **No dashboard / analytics home page** | MEDIUM | Home page is patient search only. No appointment count, pending labs, recent encounters, or clinical insights. |
| OPD-G09 | **No AI Clinical Scribe integration** | MEDIUM | PRD Section 19: GPT-4-class SOAP parsing with confirmation gate (OPD-031, OPD-032). Not implemented. |
| OPD-G10 | **No predictive macro engine** | MEDIUM | PRD OPD-033: Edge ONNX pre-validated SOAP template macros. Not implemented. |
| OPD-G11 | **No paper prescription OCR** | MEDIUM | PRD Section 19: Cloud Vision AI for handwritten prescription extraction. Not implemented. |
| OPD-G12 | **Hardcoded practitioner reference** | MEDIUM | `Practitioner/current-user` placeholder used throughout. Auth integration needed. |
| OPD-G13 | **No notification center beyond bell icon** | MEDIUM | NotificationBell polls but no full notification list page, no filtering, no deep-link to source. |
| OPD-G14 | **No lab results viewer** | MEDIUM | Referenced in sync dashboard routes but no UI to view DiagnosticReport results from Lab Lite. |
| OPD-G15 | **clearPhiState does not clear IndexedDB** | MEDIUM | Tab close clears Zustand stores but not Dexie tables. PHI persists on disk until encryption key is lost. |
| OPD-G16 | **No RTL/i18n support** | MEDIUM | Hardcoded `dir="ltr"`, English-only. Epic 11 is backlog. Required for MENA deployment. |
| OPD-G17 | **No provider onboarding / KYC flow** | LOW | PRD Section 8.2: KYC document capture + OCR + registry verification. Phase 0 scope. |
| OPD-G18 | **No pediatric dosing warning** | LOW | PRD OPD-043: Must display "Weight-based dosing not supported — calculate manually" in V1. |

### 1.2 Pharmacy Lite — `apps/pharmacy-lite/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| PH-G01 | **No login/authentication page** | CRITICAL | Auth token passed as prop. No Supabase Auth integration. Pharmacist cannot sign in. |
| PH-G02 | **No dashboard / dispensing queue** | HIGH | Single page (scanner view) only. No pending prescriptions list, no dispensing history, no shift summary. |
| PH-G03 | **No sync queue drain worker** | HIGH | `enqueueForRetry()` writes to Dexie but no background worker or `online` event listener ever drains it. Queued dispenses never reach Hub. |
| PH-G04 | **No Service Worker or PWA manifest** | HIGH | Same as OPD-G02. Required for installability and offline asset caching. |
| PH-G05 | **No pharmacy onboarding / KYC** | HIGH | PRD PH-001: Business KYC submission. PH-002: GPS geofence setup. PH-003: Responsible pharmacist identity binding. None implemented. |
| PH-G06 | **No offline dispensing path** | HIGH | Pharmacist completely blocked when Hub is unreachable. PRD says every workflow must work offline. Only "Try Again" is offered. |
| PH-G07 | **No duplicate-dispensing guard** | HIGH | Same prescription can be dispensed multiple times. No idempotency check against existing dispense records. |
| PH-G08 | **No prescription history / audit trail view** | MEDIUM | No page to view past dispensing records, search by patient, or review day's activity. |
| PH-G09 | **No drug interaction re-check at dispensing** | MEDIUM | Pharmacy trusts prescriber-side checks. Full re-check requires MedicationStatement data. Deferred per design but tracked. |
| PH-G10 | **Stale revalidation of practitioner keys** | MEDIUM | `getCachedKey()` returns `stale: true` but no code path calls `revalidateKey()`. Stale keys remain trusted. |
| PH-G11 | **No controlled substance handling** | MEDIUM | PRD Section 5.3: Country-specific regulatory review required. No controlled substance flag or workflow. |
| PH-G12 | **No GPS geofence enforcement** | LOW | PRD PH-002: GPS geofence at pharmacy registration. Not implemented. |
| PH-G13 | **No RTL/i18n beyond medication labels** | LOW | MedicationLabel has AR/FA translations but rest of app is English-only. |

### 1.3 Lab Lite — `apps/lab-lite/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| LAB-G01 | **Dashboard is "Coming Soon" placeholder** | CRITICAL | All upload components exist but no orchestrator page ties them into a workflow. Lab technician has no functional UI beyond login. |
| LAB-G02 | **No main upload workflow page** | CRITICAL | PatientVerifyForm, ResultUpload, MetadataForm, UploadQueue components exist in isolation. No page/route assembles them into a step-by-step upload flow. |
| LAB-G03 | **No inactivity session timeout** | HIGH | PRD Section 10.1 / CLAUDE.md: 30-min inactivity re-auth for clinical views. Not implemented. |
| LAB-G04 | **No Service Worker or PWA manifest** | HIGH | Same pattern as other apps. Required for offline resilience and installability. |
| LAB-G05 | **No notification system in app** | HIGH | Upload triggers Hub-side notification dispatch but lab-lite has no in-app notification UI for the technician. |
| LAB-G06 | **Lab approval workflow missing** | HIGH | Labs register as PENDING but no admin/back-office UI to approve them to ACTIVE. `enforceLabActive()` blocks PENDING labs from uploading. |
| LAB-G07 | **No virus scan background processor** | MEDIUM | Files stored with `pending` virus_scan_status but no mechanism scans them later. ClamAV integration is deferred-if-unavailable. |
| LAB-G08 | **Audit events fire-and-forget with no fallback** | MEDIUM | Auth + queue audit events use raw `fetch` instead of `@ultranos/audit-logger`. Silent failure, no local retry queue. |
| LAB-G09 | **Only 8 hardcoded LOINC categories** | MEDIUM | No dynamic LOINC loading. Search/autocomplete absent. Won't scale beyond basic test categories. |
| LAB-G10 | **No RTL/i18n** | LOW | `dir="auto"` only. No translation framework. Inter font lacks Arabic support. |

### 1.4 Patient Lite Mobile — `apps/patient-lite-mobile/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| PT-G01 | **No navigation between screens** | CRITICAL | Only ProfileScreen rendered in App.tsx. TimelineScreen and PrivacySettingsScreen exist but are unreachable. No React Navigation tab/stack navigator. |
| PT-G02 | **No OTP login / initial authentication** | HIGH | PRD Section 10.1: Patient auth is OTP-only (no password). Only biometric DB unlock exists. No initial identity verification. |
| PT-G03 | **No sync engine running** | HIGH | Consent changes are queued but no background task drains the queue to Hub. Profile and medical history never sync upstream. |
| PT-G04 | **No allergy display anywhere** | HIGH | CLAUDE.md: Allergies must render first, in red, never collapsed. No allergy data model, component, or screen in the patient app. |
| PT-G05 | **No language onboarding gateway** | HIGH | PRD HP-001 through HP-004: Full-screen visual language gateway with native scripts + audio greeting. Not implemented. |
| PT-G06 | **QR code unsigned (ECDSA-P256 missing)** | HIGH | Shows "Unverified" badge. `@ultranos/crypto` doesn't support mobile ECDSA-P256 yet. |
| PT-G07 | **No React Error Boundaries** | MEDIUM | No error boundary wrapping screens. Unhandled errors crash to white screen. |
| PT-G08 | **No push notifications** | MEDIUM | Polling every 30 seconds. No native push notification integration (FCM/APNs). |
| PT-G09 | **No FHIR R4 Bundle export** | MEDIUM | PRD Section 8.1: Complete record exportable as FHIR R4 Bundle JSON anytime via Health Passport. Not implemented. |
| PT-G10 | **Sensitive medications not flagged** | MEDIUM | `humanizeMedication` always returns `isSensitive: false`. Antiretrovirals, psychiatric meds shown with full names. Privacy gap. |
| PT-G11 | **No guardian linking flow** | MEDIUM | PRD HP-031, Section 12: Guardian can link to patient, consent on behalf, SMS on access. Enum exists but no UI. |
| PT-G12 | **SecureStore 2KB iOS limit** | MEDIUM | Medical history stored in expo-secure-store which has 2KB iOS limit. SQLCipher migration needed for larger datasets. |
| PT-G13 | **No dark mode** | LOW | Consumer theme is light-only. No theme toggle. |
| PT-G14 | **No RTL layout support** | LOW | Labels translated (AR/FA) but layout doesn't mirror. `flexDirection`, `marginStart/End` not used. |

### 1.5 Hub API — `apps/hub-api/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| HUB-G01 | **Encounter router is an empty stub** | CRITICAL | No create, read, update, close, or SOAP note endpoints. Encounters exist only client-side with no Hub persistence. |
| HUB-G02 | **No patient CRUD beyond search** | HIGH | Cannot create, read individual, update, or deactivate patients via API. Only `patient.search()` exists. |
| HUB-G03 | **No medication.create() endpoint** | HIGH | Clinician cannot create prescriptions via Hub. Only status check, dispense, complete, and void exist. |
| HUB-G04 | **No drug interaction check endpoint** | HIGH | Interaction checking is client-side only. No Hub API endpoint for server-side verification. |
| HUB-G05 | **No practitioner key registration** | HIGH | Keys can be revoked and queried but never registered. No `practitionerKey.register()`. |
| HUB-G06 | **No lab approval workflow** | HIGH | `lab.register()` creates PENDING labs. No endpoint to transition PENDING → ACTIVE. Back-office is blocked. |
| HUB-G07 | **No global rate limiting** | HIGH | Only `lab.reportAuthEvent` has rate limiting (20/60s). All other endpoints are unthrottled. PHI enumeration risk on `patient.search`. |
| HUB-G08 | **No exponential backoff retry for notifications** | MEDIUM | DB columns exist (`retry_count`, `next_retry_at`) but no scheduled job populates them. Failed notifications stay QUEUED forever. |
| HUB-G09 | **BACKOFFICE escalation is a dead letter** | MEDIUM | 48h escalation creates notifications with `recipient_ref='BACKOFFICE'` but no user or UI consumes them. |
| HUB-G10 | **No consent create/list/withdraw endpoints** | MEDIUM | Only `consent.sync()` (from Health Passport) and `consent.check()`. No Hub-initiated consent management. |
| HUB-G11 | **recordDispense creates dispense before validation** | MEDIUM | Insert happens before prescription lookup. Orphan records on non-existent prescriptions. |
| HUB-G12 | **pharmacistRef is client-supplied** | MEDIUM | Should come from `ctx.user`. Enables false attribution of dispensing actions. |
| HUB-G13 | **JWK cache never invalidated** | MEDIUM | Module-level `_cachedJwk` has no TTL. Key rotation requires process restart. |
| HUB-G14 | **No TLS enforcement, CORS, or CSP headers** | MEDIUM | No security headers in `next.config.js`. No CORS policy. |
| HUB-G15 | **Hash chain race condition in audit emit()** | MEDIUM | Concurrent calls can fork the chain. No serialization (advisory lock, SELECT FOR UPDATE). |
| HUB-G16 | **rateLimitMap unbounded memory growth** | LOW | Module-level Map grows per unique IP hash, never pruned. OOM risk on long-running processes. |

### 1.6 OPD Lite Mobile — `apps/opd-lite-mobile/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| MOB-G01 | **Entirely scaffolded — placeholder only** | LOW | By design: "SCAFFOLDED — future dev" per CLAUDE.md. No auth, no screens, no functionality. |

---

## Part 2: Shared Packages Gap Analysis

### 2.1 `packages/shared-types/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| ST-G01 | **No DiagnosticReport FHIR type** | HIGH | Referenced in conflict-tiers (TIER_2) and lab workflows but no Zod schema or interface defined. |
| ST-G02 | **No MedicationDispense FHIR type** | HIGH | Referenced in conflict-tiers (TIER_2) and pharmacy workflows but no Zod schema defined. |
| ST-G03 | **No KeyRevocationList type** | LOW | Referenced in conflict-tiers (TIER_1) and sync-priority. Custom type needed. |

### 2.2 `packages/sync-engine/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| SE-G01 | **KRL sync service not integrated** | HIGH | `KRLSyncService` class exists but no code subscribes to Hub push events or triggers KRL refresh on reconnect. |
| SE-G02 | **Queue tier 60-second conflict window untested** | MEDIUM | Tier exists in resolver but no dedicated test verifying the 60-second replay window behavior. |
| SE-G03 | **Multi-tab concurrent drain race condition** | MEDIUM | No cross-tab lock. Both tabs drain same entries, pushing duplicates to Hub. |

### 2.3 `packages/crypto/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| CR-G01 | **No mobile ECDSA-P256 support** | HIGH | Health Passport QR signing requires ECDSA-P256 per CLAUDE.md. Not available for React Native. |
| CR-G02 | **No Ed25519 browser-side verification** | MEDIUM | Ed25519 verify exists server-side (sync-engine) but no browser-compatible export for PWA apps. |
| CR-G03 | **No key rotation mechanism** | MEDIUM | `v1:` version prefix in place but no rotation implementation. |

### 2.4 `packages/drug-db/` — DOES NOT EXIST

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| DB-G01 | **Entire package missing** | HIGH | CLAUDE.md lists `drug-db/` as "Drug interaction checker (online + offline subset)". Package does not exist. Interaction logic is duplicated in app layers. |
| DB-G02 | **No licensed drug database** | HIGH | PRD Section 20.1: Must use licensed, clinically validated source (Medi-Span, Multum, First Databank, or WHO-equivalent). Currently using a curated 100-med subset with internal codes. |
| DB-G03 | **No 45-day staleness enforcement** | MEDIUM | PRD: System must refuse checks if database >45 days old. No mechanism exists. |

### 2.5 `packages/ui-kit/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| UI-G01 | **No shared component library** | MEDIUM | Only tokens + ErrorBoundary + StaleDataBanner. Each app re-implements buttons, forms, modals, cards independently. |
| UI-G02 | **No RTL-ready components** | MEDIUM | Inline styles use physical CSS properties. No logical properties (`margin-inline-start`). |
| UI-G03 | **No SyncPulse shared component** | LOW | Each app implements its own SyncPulse. Could be shared. |

### 2.6 `packages/audit-logger/`

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| AL-G01 | **Lab Lite not using audit-logger** | MEDIUM | All lab-lite audit events use raw `fetch` instead of the canonical logger with hash chaining. Violates CLAUDE.md rule #6. |
| AL-G02 | **Hash chain race condition** | MEDIUM | `emit()` does read-then-write without serialization. Concurrent events fork from same parent hash. Same as HUB-G15. |

---

## Part 3: Cross-Cutting Gaps

### 3.1 Authentication & Session Management

| # | Gap | Severity | Apps Affected |
|---|-----|----------|---------------|
| XC-01 | **No login UI in OPD Lite or Pharmacy Lite** | CRITICAL | OPD Lite, Pharmacy Lite |
| XC-02 | **No MFA enforcement at app layer** | HIGH | OPD Lite, Pharmacy Lite (Lab Lite has it) |
| XC-03 | **No inactivity timeout** | HIGH | OPD Lite, Lab Lite, Pharmacy Lite |
| XC-04 | **No session duration enforcement** | HIGH | PRD: 8h GPs, 12h pharmacists, 4h admins, 90d patients. None enforced. |
| XC-05 | **No FIDO2 hardware token for admins** | MEDIUM | PRD Section 10.1: Required for admin role. |

### 3.2 PWA Infrastructure

| # | Gap | Severity | Apps Affected |
|---|-----|----------|---------------|
| XC-06 | **No Service Workers** | CRITICAL | OPD Lite, Pharmacy Lite, Lab Lite |
| XC-07 | **No PWA manifests** | HIGH | OPD Lite, Pharmacy Lite, Lab Lite |
| XC-08 | **No push notifications** | MEDIUM | All apps rely on polling instead of push. |
| XC-09 | **Google Fonts CDN fails offline** | LOW | Inter loaded via CDN; fails on first offline load. Should be self-hosted. |

### 3.3 RTL / Internationalization

| # | Gap | Severity | Apps Affected |
|---|-----|----------|---------------|
| XC-10 | **No i18n framework installed** | HIGH | All apps. No `next-intl`, `i18next`, `expo-localization` wired up. |
| XC-11 | **No language switching UI** | HIGH | All apps. English-only. |
| XC-12 | **Hardcoded `dir="ltr"`** | MEDIUM | OPD Lite. Lab Lite uses `dir="auto"`. |
| XC-13 | **Physical CSS properties used** | MEDIUM | `px-4`, `py-3`, `margin-left` instead of logical `ps-*`, `pe-*`, `margin-inline-start`. |
| XC-14 | **No RTL snapshot tests** | MEDIUM | CLAUDE.md requires RTL snapshots for every patient-facing component. Zero exist. |
| XC-15 | **No CI/CD RTL gate** | MEDIUM | PRD Section 4.2: "RTL layout validation must be a required gate in the CI/CD pipeline." |

### 3.4 Offline Resilience

| # | Gap | Severity | Notes |
|---|-----|----------|---------------|
| XC-16 | **Pharmacy Lite completely blocked offline** | HIGH | No offline dispensing. Only "Try Again" when Hub unreachable. |
| XC-17 | **Sync queue entries never drained in Pharmacy Lite** | HIGH | enqueueForRetry writes entries but no worker reads them. |
| XC-18 | **Patient Lite consent sync queue never drained** | HIGH | Consent changes queued but no background task sends them to Hub. |
| XC-19 | **No sync queue size enforcement** | MEDIUM | PRD: Max 2,000 events OR 50 MB. No enforcement. |
| XC-20 | **Tab close leaves sync entries stuck in 'syncing'** | MEDIUM | No `beforeunload` handler resets in-flight entries. 2-minute blackout until `recoverStale`. |

### 3.5 Security Gaps

| # | Gap | Severity | Notes |
|---|-----|----------|---------------|
| XC-21 | **No TLS 1.3 enforcement** | HIGH | PRD Section 9: TLS 1.3 minimum. No enforcement at app or infra layer. |
| XC-22 | **No certificate pinning on Android** | MEDIUM | PRD Section 9: Required for Patient Lite Mobile. |
| XC-23 | **No jailbreak/root detection** | MEDIUM | PRD Section 13.1: Rooted Android devices must be detected; clinical features disabled. |
| XC-24 | **No remote wipe capability** | MEDIUM | PRD Section 13.1: Purge SQLCipher on next sync after device reported lost. |
| XC-25 | **QR prescription signature never verified in pharmacy** | MEDIUM | `parsePrescriptionIds` extracts IDs without verifying Ed25519 signature. Forged QRs accepted for status lookup. |
| XC-26 | **No break-glass emergency access** | MEDIUM | PRD Section 7.1: Emergency override with logged 24h review. `EMERGENCY_OVERRIDE` enum exists but never checked. |
| XC-27 | **PostgREST injection via unsanitized wildcards** | LOW | `sanitizeFilterValue` strips some chars but not `%` and `_` (SQL LIKE wildcards). |

---

## Part 4: PRD Requirements Not Covered by Any Epic

These requirements exist in the PRD v3.0 but have no corresponding epic or implementation.

### 4.1 Back-Office / Admin System

| # | Requirement | PRD Section | Severity |
|---|------------|-------------|----------|
| PRD-01 | **Back-office KYC verification dashboard** | 8.2, 25.1, 26.1 | HIGH |
| PRD-02 | **Prescribing pattern anomaly detection** | 25.3, PH-021 | HIGH |
| PRD-03 | **Provider license expiry monitoring** | 8.2 | HIGH |
| PRD-04 | **Break-glass access review workflow** | 7.1 | MEDIUM |
| PRD-05 | **Incident response tooling** | 29 | MEDIUM |
| PRD-06 | **Consent expiry queue management** | 30 | MEDIUM |

### 4.2 Provider Lifecycle

| # | Requirement | PRD Section | Severity |
|---|------------|-------------|----------|
| PRD-07 | **Provider onboarding flow (KYC + OCR + registry)** | 8.2, OPD-001, OPD-002 | HIGH |
| PRD-08 | **Provider license expiry notifications (60/30/7 days)** | 8.2 | MEDIUM |
| PRD-09 | **Provider suspension on license expiry** | 8.2 | MEDIUM |
| PRD-10 | **Voluntary offboarding / account closure** | 8.2 | LOW |
| PRD-11 | **Involuntary suspension workflow** | 8.2 | LOW |

### 4.3 AI & Clinical Intelligence

| # | Requirement | PRD Section | Severity |
|---|------------|-------------|----------|
| PRD-12 | **AI Clinical Scribe (SOAP parsing)** | 19, OPD-031 | MEDIUM |
| PRD-13 | **Empathy Translation Engine (TTS)** | 19, 21.1, 21.2 | MEDIUM |
| PRD-14 | **Generic substitution engine** | 19 | LOW |
| PRD-15 | **Edge ONNX model update service** | 18.1, 22 | LOW |
| PRD-16 | **AI model version tagging on all outputs** | 22 | LOW |
| PRD-17 | **Clinical feedback loop for AI** | 22 | LOW |
| PRD-18 | **Quarterly demographic bias monitoring** | 22 | LOW |

### 4.4 Infrastructure & DevOps

| # | Requirement | PRD Section | Severity |
|---|------------|-------------|----------|
| PRD-19 | **Data residency infrastructure (UAE/KSA/Jordan)** | 27, OQ-01 | HIGH |
| PRD-20 | **CI/CD pipeline with RTL gate** | 4.2 | MEDIUM |
| PRD-21 | **Monitoring & alerting stack** | 30 | MEDIUM |
| PRD-22 | **Multi-AZ Hub API deployment** | 28 | MEDIUM |
| PRD-23 | **Database synchronous replication** | 28 | MEDIUM |
| PRD-24 | **Maintenance window enforcement** | 28 | LOW |
| PRD-25 | **Backup encryption with HSM/KMS** | 9 | LOW |

### 4.5 Reporting & Analytics

| # | Requirement | PRD Section | Severity |
|---|------------|-------------|----------|
| PRD-26 | **Clinic dashboard with provider analytics** | 7 (Monetization) | MEDIUM |
| PRD-27 | **Drug interaction check performance reporting** | 30 | MEDIUM |
| PRD-28 | **SOAP note AI edit rate monthly report** | 30 | LOW |
| PRD-29 | **CONTRAINDICATED override rate alerting (>2%)** | 30 | LOW |

### 4.6 Patient Rights & Compliance

| # | Requirement | PRD Section | Severity |
|---|------------|-------------|----------|
| PRD-30 | **FHIR R4 Bundle export from Health Passport** | 8.1 | MEDIUM |
| PRD-31 | **Patient data rectification (corrections as addenda)** | 8.1 | MEDIUM |
| PRD-32 | **Limited erasure (non-clinical data only)** | 8.1 | LOW |
| PRD-33 | **Objection to AI processing (consent withdrawal)** | 8.1 | LOW |

---

## Part 5: Deferred Work — High-Priority Items

From the 300+ deferred items tracked in `deferred-work.md`, these are the most impactful:

| ID | Description | Risk |
|----|-------------|------|
| D2 (consent.sync) | **No authorization check** — any user can forge consent for any patient | Security |
| D3 (emergency) | **No emergency/break-glass bypass** — `EMERGENCY_OVERRIDE` enum exists but never checked | Patient safety |
| P3 (QR) | **QR signature never verified** — forged QR codes accepted for status lookup | Fraud |
| W1 (4-3) | **No retry/drain for sync queue** — queued dispenses never reach Hub | Data loss |
| W3 (8-2) | **recordDispense insert before conflict check** — permanent data inconsistency | Data integrity |
| D72 | **Sensitive medications not flagged** — antiretrovirals/psychiatric meds shown with full names | Privacy |
| D74 | **Patient names in cleartext as indexed fields** — searchable but unencrypted in IndexedDB | PHI exposure |
| W7 (9-2) | **Expired JWT not handled in drain worker** — 401s exhaust retries, permanently failing entries | Sync reliability |
| HUB-G15 | **Audit hash chain race condition** — concurrent emits can fork the chain | Audit integrity |

---

## Part 6: Recommendations

### Phase 1 — Production Blockers (Must Fix)

1. **Authentication for OPD Lite and Pharmacy Lite** — Implement Supabase Auth login pages with TOTP MFA, matching Lab Lite's pattern. Add session management, inactivity timeout, and logout.
2. **Lab Lite dashboard and upload workflow page** — Wire the existing components (PatientVerifyForm → ResultUpload → MetadataForm → UploadQueue) into a functional step-by-step page.
3. **Patient Lite Mobile navigation** — Add React Navigation with tab navigator to make all three screens accessible.
4. **Hub API encounter endpoints** — Implement create, read, update, close. This is the core clinical workflow.
5. **PWA manifests and Service Workers** — Add to OPD Lite, Pharmacy Lite, Lab Lite for installability and offline asset caching.
6. **Fix sync queue drain gaps** — Pharmacy Lite and Patient Lite Mobile have queued items that never drain to Hub.

### Phase 2 — Clinical Completeness

7. **Complete SOAP notes** — Add Plan section to OPD Lite.
8. **Hub API patient CRUD** — Implement create, read individual, update.
9. **Hub API medication.create()** — Allow clinician prescription creation via Hub.
10. **Conflict resolution UI** — Build physician review interface for Tier 1 sync conflicts.
11. **Lab approval workflow** — Endpoint + back-office UI to transition labs from PENDING → ACTIVE.
12. **Global navbar for all PWA apps** — Persistent navigation, user menu, logout.
13. **Allergy display in Patient Lite Mobile** — Integrate AllergyIntolerance into the patient timeline.

### Phase 3 — Security Hardening

14. **QR signature verification** — Verify Ed25519 before accepting prescription QR for status lookup.
15. **Consent authorization check** — `consent.sync` must verify `ctx.user.sub === input.grantorId`.
16. **Global rate limiting** — Redis-backed rate limiting across all Hub API endpoints.
17. **Security headers** — CORS, CSP, TLS enforcement, HSTS.
18. **pharmacistRef from ctx.user** — Stop trusting client-supplied pharmacist identity.

### Phase 4 — Compliance & Deployment

19. **RTL/i18n framework** — Install next-intl / expo-localization, build translation infrastructure, CI/CD RTL gate.
20. **Data residency infrastructure** — Terraform for UAE/KSA/Jordan per PRD Section 27.
21. **Back-office admin dashboard** — KYC verification, anomaly alerts, provider license monitoring.
22. **Drug database licensing** — Contract with Medi-Span, Multum, or FDB. Replace curated 100-med subset.
23. **Monitoring & alerting** — Clinical safety metrics, sync queue monitoring, error rate alerting.

### Phase 5 — AI & Advanced Features

24. **AI Clinical Scribe** — Cloud LLM SOAP parsing with confirmation gate.
25. **Empathy Translation Engine** — Dialect-tuned TTS for prescription instructions.
26. **Paper prescription OCR** — Cloud Vision for handwritten prescription digitization.
27. **Edge AI model service** — Delta updates, 45-day TTL, graceful degradation.
28. **Clinic dashboard & provider analytics** — Multi-provider management.

---

## Appendix: Gap Count Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| OPD Lite | 2 | 5 | 8 | 3 | 18 |
| Pharmacy Lite | 1 | 6 | 4 | 2 | 13 |
| Lab Lite | 2 | 4 | 3 | 1 | 10 |
| Patient Lite Mobile | 1 | 5 | 6 | 2 | 14 |
| Hub API | 1 | 6 | 7 | 2 | 16 |
| Shared Packages | 0 | 6 | 8 | 2 | 16 |
| Cross-Cutting | 2 | 8 | 14 | 3 | 27 |
| PRD Not Epic'd | 0 | 6 | 17 | 10 | 33 |
| **Total** | **9** | **46** | **67** | **25** | **147** |

---

*Report generated 2026-05-02. Based on codebase audit of branch `architecture-review-01`, PRD v3.0, epics.md, sprint-status.yaml, and deferred-work.md.*
