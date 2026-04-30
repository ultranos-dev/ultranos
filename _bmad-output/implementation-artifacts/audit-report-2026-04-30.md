# Ultranos Implementation Audit Report

**Date:** 2026-04-30
**Scope:** Architecture & Epics vs. Actual Codebase Implementation
**Auditor:** Claude Code (Opus 4.6)

---

## Executive Summary

The Ultranos codebase has strong progress on clinical encounter workflows (Epics 2–3), Health Passport (Epic 5), and PWA encryption (Story 7.1), backed by 1,900+ passing tests. However, **two entire apps specified in the architecture are missing** (`pharmacy-pos` and `opd-lite-mobile`), the sync engine has no queue drain mechanism (making offline-first cosmetic), audit logging is a stub, and Hub API stores PHI in plaintext. These gaps are blockers for production and regulatory compliance.

---

## 1. Critical Finding: Missing Applications

### 1.1 `apps/pharmacy-pos/` — Does Not Exist

The architecture ([architecture.md:171](../_bmad-output/planning-artifacts/architecture.md)) specifies a dedicated **Pharmacy POS** Next.js PWA as one of 6 core spoke apps. Epic 4 (Stories 4.1–4.3) is marked **DONE** in the sprint status.

**What actually happened:** All pharmacy workflows — QR scanning, fulfillment checklist, medication labeling, dispensing sync — were built **inside `apps/opd-lite-pwa/`** as components (`PharmacyScannerView`, `FulfillmentChecklist`, `MedicationLabel`, `SyncPulse`).

**Impact:**
- Pharmacists and clinicians share the same application deployment
- RBAC boundaries are blurred — role-based UI gating replaces app-level isolation
- Deployment, scaling, and update cycles are coupled across two distinct user roles
- Epic 4 is marked DONE but does not satisfy the architecture's separation requirement

### 1.2 `apps/opd-lite-mobile/` (or `apps/opd-android/`) — Does Not Exist

The architecture ([architecture.md:169](../_bmad-output/planning-artifacts/architecture.md)) specifies an **Expo Android app for clinicians** separate from the Health Passport. Story 1.4 (Mobile Identity Verification with SQLCipher) remains in **BACKLOG**.

**What actually happened:** The `health-passport` app has SQLCipher and biometric unlock, but it is the **patient** app. No mobile clinician experience exists.

**Impact:**
- Field GPs in rural areas (a core PRD persona) have no mobile app
- Story 1.4 acceptance criteria (offline patient verification on mobile) cannot be met
- The architecture's "6 core nodes" is actually 4 nodes in practice

---

## 2. High-Priority Gaps

| # | Gap | Epic/Story | Status | Impact |
|---|-----|-----------|--------|--------|
| H1 | **No sync queue drain mechanism** | Epic 9 (BACKLOG) | No background worker, no retry, no exponential backoff | Data queued offline never reaches the Hub. `SyncPulse` UI is cosmetic. Offline-first is a facade. |
| H2 | **Audit logging not integrated** | Epic 8 (BACKLOG) | `@ultranos/audit-logger` is a stub with type definitions only | PHI access is not logged server-side. No SHA-256 hash chaining. Regulatory blocker (FR17). |
| H3 | **Hub API field-level encryption missing** | Story 7.3 (READY-FOR-DEV) | Spec exists, zero implementation | Clinical notes, diagnoses, and assessments stored **plaintext** in Supabase. Compliance blocker. |
| H4 | **Drug interactions only check pending Rx** | Story 3.2 limitation | No `MedicationStatement` data model | Interaction checker compares against current prescription list only. A patient on warfarin could be prescribed aspirin if warfarin isn't in the current encounter. Patient safety risk. |
| H5 | **No i18n/RTL infrastructure** | Story 1.5, Epic 11 (BACKLOG) | All strings hardcoded English, layout hardcoded LTR | No `next-intl` or `expo-localization` setup despite architecture mandate. Arabic/Dari users cannot use the system. |
| H6 | **Practitioner key lifecycle missing** | Story 7.4 (READY-FOR-DEV) | Spec exists, zero implementation | Cached practitioner public keys have no TTL or revocation. A compromised key could forge prescriptions indefinitely. |

---

## 3. Medium-Priority Gaps

| # | Gap | Details |
|---|-----|---------|
| M1 | **QR signature verification incomplete** | Pharmacy scan loads prescriptions but signature verification has known gaps (deferred item 3-4 P3). End-to-end verification path not tested. |
| M2 | **Auth session partially hardcoded** | `PRACTITIONER_REF` is hardcoded in the auth session store. No real JWT-to-practitioner identity mapping wired. |
| M3 | **RBAC lacks row-level scoping** | Middleware checks role permissions but doesn't scope database queries. A PATIENT role could potentially see other patients' data. |
| M4 | **No React Error Boundaries** | Architecture requires a "Stale Data / Offline Mode" high-contrast yellow banner on failures. No error boundaries exist in any app. |
| M5 | **Consent enforcement not battle-tested** | `enforceConsentMiddleware` exists on hub-api but consent sync is still in-progress (Story 5.3). |
| M6 | **Patient names in cleartext for search** | Dexie encryption covers PHI tables, but patient names remain unencrypted for indexed search. Acknowledged tradeoff, deferred to dedicated search-encryption story. |
| M7 | **No rate limiting on API** | Hub API endpoints have no rate limiting. Potential for abuse or denial-of-service. |

---

## 4. Architecture Deviations

### 4.1 Pharmacy Merged Into Clinician PWA

The architecture defines 6 separate spoke apps with distinct deployments. Pharmacy fulfillment was merged into `opd-lite-pwa` rather than being its own app. This means:
- Pharmacists access the clinician app with role-based UI gating
- No independent deployment or scaling for pharmacy operations
- Violates the Hub-and-Spoke isolation principle

### 4.2 Missing `packages/drug-db/`

The architecture references a shared drug interaction database package. Instead, the interaction checker and 100-medication formulary are embedded directly in `opd-lite-pwa/src/lib/`. This means:
- Drug data is not reusable across apps (e.g., a future pharmacy-pos would need its own copy)
- No shared contract for interaction severity levels

### 4.3 Sync Engine Is HLC-Only

`packages/sync-engine/` has HLC timestamping and Ed25519 crypto, but the conflict resolution tiers defined in the architecture and CLAUDE.md are **not implemented**:
- **Tier 1** (Append-only for allergies, active meds, critical diagnoses) — stub only
- **Tier 2** (Timestamp-based for notes, labs, vitals) — not implemented
- **Tier 3** (LWW for demographics) — not implemented
- The `sync-priority.ts` file has tier definitions but no merge logic

### 4.4 Crypto Package Is Browser-Only

`packages/crypto/` only covers the Web Crypto API (browser). No Node.js or mobile crypto adapters exist, despite the architecture requiring encryption across all platforms (PWA, Mobile, Hub API).

---

## 5. What's Working Well

| Area | Status | Evidence |
|------|--------|----------|
| **Clinical Encounter Workflow (Epic 2)** | Complete | SOAP notes, vitals charting, ICD-10 diagnosis, command palette — all functional with 248+ tests |
| **E-Prescribing (Epic 3)** | Complete | Medication search, drug interaction checker, QR signing, prescription invalidation — 375+ tests |
| **Health Passport (Epic 5)** | ~80% Complete | Profile, timeline, consent management, SQLCipher encryption, biometric unlock — 226+ tests |
| **PWA Encryption (Story 7.1)** | Complete | Key-in-memory AES-256-GCM via Web Crypto API, `beforeunload` cleanup — properly implemented |
| **Mobile Encryption (Story 7.2)** | Complete | SQLCipher with biometric unlock, secure key storage, background re-lock — 42 tests |
| **FHIR R4 Schemas** | Complete | Zod schemas for Patient, Encounter, MedicationRequest, Condition, Observation, ClinicalImpression |
| **Test Coverage** | Strong | 1,900+ tests across the monorepo, zero regressions on completed stories |
| **RBAC Middleware (Story 6.1)** | Functional | JWT verification, role extraction, resource-level access control — 50 tests |

---

## 6. Epic-Level Status Summary

| Epic | Name | Status | Stories Done | Tests | Blockers |
|------|------|--------|-------------|-------|----------|
| 1 | Ecosystem Foundation & Identity | 🟡 Partial | 3/5 | 104 | Stories 1.4 (mobile) and 1.5 (RTL) in BACKLOG |
| 2 | Clinical Encounter & SOAP | ✅ Done | 5/5 | 248 | — |
| 3 | E-Prescribing & Medication Safety | ✅ Done | 4/4 | 375 | Interaction check limited to pending Rx only |
| 4 | Pharmacy Operations | ⚠️ Architecturally Non-Compliant | 3/3 code done | 461 | Built in wrong app (`opd-lite-pwa` instead of `pharmacy-pos`) |
| 5 | Patient Health Passport & Consent | 🟡 In Progress | 1/3 done, 2 in-progress | 226 | Timeline and consent management need re-review |
| 6 | Trust, Audit & Access | 🟡 In Progress | 1/1 in-progress | 50 | Row-level scoping deferred |
| 7 | Security & Encryption | 🟡 Partial | 2/4 done | 539 | Stories 7.3 and 7.4 not started |
| 8 | Compliance & Immutable Auditing | ❌ Not Started | 0/2 | 0 | Regulatory blocker |
| 9 | Sync Engine Integration | ❌ Not Started | 0/3 | 0 | Offline-first depends on this |
| 10 | Clinical Safety & Terminology | ❌ Not Started | 0/3 | 0 | Full interaction checking depends on this |
| 11 | Internationalization & UX Resilience | ❌ Not Started | 0/2 | 0 | MENA deployment depends on this |

---

## 7. Deferred Work Summary

The [deferred-work.md](deferred-work.md) documents **74 deferred items** across code review rounds, categorized as:

| Category | Count | Key Items |
|----------|-------|-----------|
| Encryption & Key Lifecycle | 16 | Field-level Hub encryption, key rotation, search-friendly encryption |
| Sync Engine & Conflict Resolution | 8 | Tier 1 append-only merge, queue drain, retry mechanism |
| Audit Logging | 7 | SHA-256 hash chaining, client-side event queuing, server-side PHI access logging |
| Authentication & Identity | 6 | JWT-to-practitioner mapping, session hardcoding removal |
| RBAC & Row-Level Security | 5 | Patient data scoping, practitioner lookup wiring |
| Drug Interaction Checking | 4 | MedicationStatement model, code-based matching, dispensing-side checks |
| i18n & Localization | 5 | RTL switching, string externalization, locale-aware dates |
| Offline & Queue Processing | 7 | Background worker, retry with backoff, deduplication, in-flight recovery |
| UI & Error Handling | 6 | Error boundaries, stale data banner, loading states |
| Security Hardening | 10 | SQL injection via LIKE wildcards, circular reference protection, SSR HLC node ID |

---

## 8. Recommended Priority Order

| Priority | Action | Rationale |
|----------|--------|-----------|
| **P0** | Implement sync queue drain (Epic 9) | Without this, offline-first is non-functional. No data reaches the Hub. |
| **P0** | Wire audit logging with hash chaining (Epic 8) | Regulatory requirement. Cannot ship without immutable audit trail. |
| **P1** | Hub API field-level encryption (Story 7.3) | PHI in plaintext on the server is a compliance blocker. |
| **P1** | Scaffold `apps/pharmacy-pos/` and extract pharmacy components | Architectural deviation that gets harder to fix over time. RBAC isolation requires it. |
| **P2** | Practitioner key lifecycle (Story 7.4) | Compromised keys can forge prescriptions indefinitely without TTL/revocation. |
| **P2** | Implement `MedicationStatement` and full interaction checking (Epic 10) | Current interaction checker misses chronic medications. Patient safety risk. |
| **P3** | Scaffold `apps/opd-lite-mobile/` | Required if mobile clinician use is in scope for initial release. |
| **P3** | i18n/RTL foundation (Story 1.5, Epic 11) | The longer this waits, the more hardcoded strings accumulate. |
| **P4** | RBAC row-level scoping | Data isolation between patients requires query-level enforcement. |
| **P4** | React Error Boundaries and stale data banner | UX resilience for offline/error scenarios. |

---

## 9. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| PHI exposed in Hub DB (no field encryption) | **Critical** | Certain | Implement Story 7.3 before any production deployment |
| Offline data never syncs (no queue drain) | **Critical** | Certain | Implement Epic 9 — currently zero sync infrastructure |
| No audit trail for PHI access | **Critical** | Certain | Implement Epic 8 — regulatory non-compliance |
| Drug interaction false negatives | **High** | Likely | Implement MedicationStatement model (Epic 10) |
| Forged prescriptions via compromised keys | **High** | Possible | Implement Story 7.4 — key TTL and revocation |
| Pharmacy-clinician RBAC bleed | **Medium** | Possible | Extract pharmacy-pos into separate app |
| No mobile clinician app for field use | **Medium** | Certain | Scaffold opd-lite-mobile or descope from initial release |
| Hardcoded English strings block MENA launch | **Medium** | Certain | Begin i18n foundation early to avoid refactor debt |

---

*End of audit report.*
