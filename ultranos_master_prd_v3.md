# Ultranos Ecosystem
## Master Product Requirements Document
### Version 3.0 — Engineering Baseline

---

| Attribute | Value |
|---|---|
| **Version** | 3.0 |
| **Date** | April 2026 |
| **Status** | Approved for Engineering Baseline |
| **Classification** | Confidential — Internal Distribution Only |
| **Document Owner** | Product & Engineering Leadership |
| **Review Cycle** | Quarterly |
| **Applicable Regulations** | HIPAA · GDPR · HAAD · MOH · NPHIES · HL7 FHIR R4 · IEC 62304 |
| **Target Geographies** | UAE · KSA · Jordan · Afghanistan (MENA & Central Asia) |

---

> **⚕ Engineering Mandate**
> This document governs the architecture, product requirements, regulatory obligations, and security posture of the Ultranos mHealth Ecosystem. All engineering decisions must be traceable to a requirement herein. No sprint may begin on a module until its corresponding section is reviewed and signed off by the Product Lead and Chief Compliance Officer.

---

## Change Log

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | Jan 2026 | Product Team | Initial concept — architecture overview and module sketches |
| 2.0 | Feb 2026 | Product & Engineering | Full rewrite: regulatory matrix, security architecture, data model hardening, conflict resolution redesign, AI governance |
| 3.0 | Apr 2026 | Product & Engineering | OPD Lite platform strategy revised: Desktop PWA promoted to primary surface; Android app retained as full-capability alternate surface for mobile-first and rural contexts. Offline security model updated for PWA. AI scribe enhanced for keyboard-first workflow. |

---

## Table of Contents

- [Part 1 — Executive Summary & Ecosystem Architecture](#part-1--executive-summary--ecosystem-architecture)
  - [1. Executive Summary](#1-executive-summary)
  - [2. Strategic Objectives & Success Metrics](#2-strategic-objectives--success-metrics)
  - [3. Ecosystem Topology](#3-ecosystem-topology)
  - [4. Non-Negotiable Architectural Mandates](#4-non-negotiable-architectural-mandates)
- [Part 2 — Regulatory & Compliance Framework](#part-2--regulatory--compliance-framework)
  - [5. Regulatory Compliance Matrix](#5-regulatory-compliance-matrix)
  - [6. Software as a Medical Device (SaMD) Classification](#6-software-as-a-medical-device-samd-classification)
  - [7. Consent Architecture](#7-consent-architecture)
  - [8. Patient Data Rights & Provider Lifecycle](#8-patient-data-rights--provider-lifecycle)
- [Part 3 — Security Architecture](#part-3--security-architecture)
  - [9. Encryption Specification](#9-encryption-specification)
  - [10. Authentication & Session Management](#10-authentication--session-management)
  - [11. Role-Based Access Control (RBAC)](#11-role-based-access-control-rbac)
  - [12. Audit Logging](#12-audit-logging)
  - [13. Device Security Policy](#13-device-security-policy)
  - [14. Threat Model](#14-threat-model)
- [Part 4 — Data Architecture & Sync Engine](#part-4--data-architecture--sync-engine)
  - [15. Master Patient Index (MPI)](#15-master-patient-index-mpi)
  - [16. FHIR R4 Schema Mapping](#16-fhir-r4-schema-mapping)
  - [17. Conflict Resolution Engine](#17-conflict-resolution-engine)
  - [18. Sync Engine Specification](#18-sync-engine-specification)
- [Part 5 — AI Strategy & Clinical Safety](#part-5--ai-strategy--clinical-safety)
  - [19. Hybrid AI Architecture](#19-hybrid-ai-architecture)
  - [20. Drug Interaction Checker](#20-drug-interaction-checker)
  - [21. Multilingual Voice Engine](#21-multilingual-voice-engine)
  - [22. AI Model Governance](#22-ai-model-governance)
- [Part 6 — Module PRDs](#part-6--module-prds)
  - [23. OPD Lite — Multi-Surface Doctor Application](#23-opd-lite--multi-surface-doctor-application)
  - [24. Health Passport — Patient Application](#24-health-passport--patient-application)
  - [25. Pharmacy POS & Verification Portal](#25-pharmacy-pos--verification-portal)
  - [26. Diagnostic Lab Portal](#26-diagnostic-lab-portal)
- [Part 7 — Infrastructure, Operations & Business Continuity](#part-7--infrastructure-operations--business-continuity)
  - [27. Cloud Architecture & Data Residency](#27-cloud-architecture--data-residency)
  - [28. Service Level Agreements](#28-service-level-agreements)
  - [29. Disaster Recovery](#29-disaster-recovery)
  - [30. Monitoring & Observability](#30-monitoring--observability)
  - [31. Operational Support Model](#31-operational-support-model)
- [Part 8 — Product Strategy & Commercial Architecture](#part-8--product-strategy--commercial-architecture)
  - [32. Monetization & Pricing](#32-monetization--pricing)
  - [33. V1 Launch Roadmap](#33-v1-launch-roadmap)
  - [34. Open Questions & Blockers](#34-open-questions--blockers)
- [Appendix A — Glossary](#appendix-a--glossary)
- [Appendix B — V1 Compliance Checklist](#appendix-b--v1-compliance-checklist)

---

# Part 1 — Executive Summary & Ecosystem Architecture

## 1. Executive Summary

Ultranos is a decentralized, micro-app healthcare ecosystem purpose-built for low-resource and offline-prone clinical environments across the MENA region and Central Asia. The platform enables coordinated, interoperable health records among doctors, patients, pharmacies, and diagnostic laboratories — without assuming persistent internet connectivity.

The system employs a **Hub-and-Spoke topology**: independent, role-specific micro-applications (the Spokes) operate fully offline or in near-offline conditions, synchronizing asynchronously to a centrally governed, FHIR R4-aligned Cloud Backend (the Hub) when connectivity is available.

### Three Strategic Pillars

**1. Offline-First Architecture**
Connectivity is a bonus, not a prerequisite. Every clinical workflow must complete fully without a network connection. Sync failures must be silent, queueable, and self-resolving.

**2. Multilingual Cultural Intelligence**
Native support for English, Arabic, and Dari with dialect-aware voice synthesis, Right-to-Left (RTL) layout mirroring at the framework level, and culturally-tuned AI communication. Not a localization layer bolted on post-launch — an architectural first-class citizen.

**3. Safety-Grade AI**
A hybrid Edge AI + Cloud AI strategy with explicit clinical validation gates, drug interaction checking against a licensed pharmaceutical database, mandatory physician confirmation for all AI-generated clinical content, and continuous model performance monitoring.

---

## 2. Strategic Objectives & Success Metrics

| Objective | Definition of Success | Year-1 Target |
|---|---|---|
| Clinical Record Continuity | Patient records accessible across all care sites regardless of connectivity | ≥ 95% record retrieval success in offline environments |
| Prescription Fraud Reduction | Counterfeit and duplicate prescriptions eliminated via global invalidation | < 0.1% duplicate dispensing rate |
| Multilingual Adoption | Non-English-speaking patients independently using the Health Passport | ≥ 60% of active patients using Arabic or Dari UI |
| Provider Onboarding | Verified, credentialed providers on-platform within 12 months | 500 verified GPs · 200 verified pharmacies · 50 labs |
| AI Clinical Accuracy | Drug interaction check true-positive rate on contraindicated pairs | ≥ 99.5% sensitivity |
| Sync Reliability | Successful sync completion rate on reconnect | ≥ 99% within 60 seconds of connectivity restore |
| OPD Lite Desktop Adoption | Urban GPs as primary active users on Desktop PWA | ≥ 70% of urban GP sessions from Desktop PWA |

---

## 3. Ecosystem Topology

### 3.1 Hub-and-Spoke Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     THE SPOKES (User Interfaces)                │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │   OPD Lite      │  │ Health Passport │  │  Pharmacy POS  │  │
│  │ Desktop PWA ①   │  │  iOS + Android  │  │   PWA / Web    │  │
│  │ Android App ②   │  │                 │  │                │  │
│  └────────┬────────┘  └───────┬─────────┘  └───────┬────────┘  │
│           │                   │                    │           │
│           └───────────────────┼────────────────────┘           │
│                               │                                │
│                   ┌───────────▼──────────┐                     │
│                   │   Diagnostic Lab     │                     │
│                   │      PWA / Web       │                     │
│                   └───────────┬──────────┘                     │
└───────────────────────────────┼─────────────────────────────────┘
                                │  Async Sync (queue-based)
┌───────────────────────────────▼─────────────────────────────────┐
│                    THE HUB (Central Cloud Backend)              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ API Gateway  │  │     IAM      │  │   Event Broker     │    │
│  │  & BFF Layer │  │  RBAC · MFA  │  │  (Async Queue)     │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │   Central Patient Ledger │  │   AI Orchestration       │    │
│  │  FHIR R4 · MPI · Audit   │  │  LLM · TTS · Drug DB     │    │
│  └──────────────────────────┘  └──────────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Compliance & Audit Layer                         │   │
│  │  PHI Access Log · Consent Engine · Data Residency        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Spoke Application Summary

| Spoke | Platform | Primary User | Connectivity Model | Core Offline Capability |
|---|---|---|---|---|
| OPD Lite | **① Desktop PWA** (primary) **② Android Native** (alternate) | General Practitioner | ① Near-online (clinic broadband) with robust offline fallback ② Fully offline-first | Full consultation, SOAP notes, e-prescriptions, drug interaction check on both surfaces |
| Health Passport | Android + iOS native | Patients · Family Guardians | Intermittent / low connectivity | QR identity, active prescriptions, audio instructions, consent management |
| Pharmacy POS | PWA / Next.js | Pharmacists · Dispensing Technicians | Near-online (clinic WiFi) with 72h queue | Prescription verification, dispensing, invalidation queue |
| Diagnostic Lab Portal | PWA / Next.js | Lab Technicians · Phlebotomists | Near-online with 48h upload queue | Patient identity check (restricted), result upload queue |

### 3.3 Central Hub Component Summary

| Component | Responsibility |
|---|---|
| API Gateway & BFF Layer | Request routing, payload compression for mobile networks, rate limiting, mTLS termination |
| Identity & Access Management (IAM) | RBAC enforcement, JWT issuance, MFA orchestration, device binding, session management |
| Asynchronous Event Broker | Chronological sync queue processing, tiered conflict resolution, event fan-out to subscribers |
| Central Patient Ledger | FHIR R4-aligned relational store, immutable audit log, Master Patient Index, consent records |
| AI Orchestration Engine | LLM routing, dialect-tuned TTS, drug interaction checking, Edge AI delta computation |
| Compliance & Audit Layer | PHI access logging, consent lifecycle management, breach detection, data residency enforcement |

---

## 4. Non-Negotiable Architectural Mandates

> **⛔ These mandates are non-negotiable.** Any architecture decision that conflicts with them requires written sign-off from the CTO and Chief Compliance Officer. They are not open for sprint-level negotiation.

### 4.1 Offline-First

- Every user-facing clinical workflow must complete without a network connection on every supported surface.
- Network availability is an optimization. Sync failures must queue silently and resolve automatically on reconnect.
- No clinical operation — prescription creation, allergy recording, SOAP note completion — may depend on a network call to succeed.

### 4.2 RTL Architecture as a First-Class Citizen

- All UI frameworks must implement RTL layout mirroring at the **framework level from the first commit**. RTL is not a localization pass done post-launch.
- Arabic and Dari font assets (`Noto Sans Arabic`, `Noto Naskh Arabic`) must be embedded in application payloads to prevent character rendering failures on older Android devices and offline environments.
- Universal medical iconography (pill, stethoscope, syringe, heartbeat) must remain directionally neutral. Navigation icons (arrows, chevrons, back buttons) must mirror on RTL locale selection.
- RTL layout validation must be a required gate in the CI/CD pipeline for every UI PR.

### 4.3 FHIR R4 Alignment from Day One

- The Central Patient Ledger schema must be **FHIR R4-aligned in V1**. FHIR API endpoints are a V2 deliverable, but the underlying data model must require zero structural migration to expose them.
- All clinical entities (Patient, Practitioner, MedicationRequest, DiagnosticReport, Observation, Condition, Consent) must map to their FHIR R4 equivalents from the first migration.
- "Eventual FHIR compliance" is not an acceptable design strategy.

### 4.4 Data Minimization by Role

- Each Spoke must access only the PHI fields required for its specific clinical function.
- The Lab Portal is a **push-only interface**: it may confirm a patient exists (name + age only) and upload results. It must not read clinical records, prescriptions, or diagnoses. This is enforced at the API layer — not just the UI.
- The Pharmacy Portal displays only **active, unfilled prescriptions**. Clinical notes, vitals, diagnoses, and lab results are inaccessible to pharmacists.

### 4.5 Medical Record Immutability

- Clinical records, once committed, are **never deleted or overwritten**. All amendments are addenda — the original record is always preserved.
- An immutable, tamper-evident audit log must record every PHI access: user ID, role, patient ID, record type, timestamp, action, and device ID.
- AI-generated content (SOAP notes, prescription translations) must be versioned separately from physician-confirmed content. Both versions are retained permanently.

---

# Part 2 — Regulatory & Compliance Framework

> **⚠️ Engineering Prerequisite**
> Regulatory compliance is not a post-launch audit. It is a foundational constraint that determines data schema design, encryption choices, cloud provider selection, and AI validation requirements. No sprint planning for any V1 module begins until a qualified healthcare compliance attorney has reviewed this section and confirmed applicability to each target geography.

## 5. Regulatory Compliance Matrix

### 5.1 Jurisdiction-to-Regulation Mapping

| Geography | Applicable Regulations | Key Obligations | Data Residency Requirement |
|---|---|---|---|
| **United Arab Emirates** | UAE Federal Law No. 2 of 2019 (PDPL); DOH Abu Dhabi; DHA Dubai Health Data Law | Patient consent for processing; breach notification within 72 hours; data subject access rights; annual security audit | **Mandatory UAE hosting.** Azure UAE North or AWS me-central-1 (UAE). US-hosted infrastructure is non-compliant for UAE PHI. |
| **Kingdom of Saudi Arabia** | Saudi PDPL (2021); MOH / NHIC; NPHIES framework | Data localization mandate; MOH-approved EHR interoperability via NPHIES API; clinical AI requires SFDA clearance pathway | **Mandatory KSA hosting.** AWS me-south-1 (Bahrain) is **NOT compliant** for KSA-resident PHI. Must use KSA-resident infrastructure (STC Cloud or certified co-location). |
| **Jordan** | Public Health Law No. 47 of 2008; NHIS guidelines | Patient consent required; provider licensing verification against MoH registry | No strict localization mandate. Cross-border transfer to non-adequate countries requires explicit patient consent. |
| **Afghanistan** | MoPH National Health Policy; WHO DHIS2 standards | Provider verification against MoPH registry; data security per WHO-AFRO guidelines | No localization mandate. EU/regional hosting recommended for stability and international trust. |
| **EU Patients (diaspora exposure)** | GDPR Regulation (EU) 2016/679 | Lawful basis for processing; right to erasure (with medical record-keeping exception); DPO appointment if large-scale processing | Cross-border transfer requires Standard Contractual Clauses (SCCs). |
| **Global Baseline (all geographies)** | HIPAA Security & Privacy Rules; HL7 FHIR R4; ISO 27001; IEC 62304 | PHI safeguards; breach notification; minimum necessary access; medical device software lifecycle management | Determined per geography above. AWS BAA and Azure DPA required for any US-origin cloud services regardless of region. |

---

## 6. Software as a Medical Device (SaMD) Classification

> **🚨 Regulatory Alert — Action Required Before V1 Build**
> The following Ultranos features are likely classified as Software as a Medical Device (SaMD) under FDA 21 CFR Part 820, EU MDR 2017/745, and equivalent regional frameworks. SaMD classification triggers mandatory clinical validation, risk management documentation (ISO 14971), and software lifecycle compliance (IEC 62304). A Regulatory Affairs specialist must complete this review before development begins. Building without this assessment is building with unquantified legal and patient safety liability.

| Feature | Module | Likely SaMD Class | Required Actions Before Build |
|---|---|---|---|
| Drug Interaction Checker | OPD Lite | **Class II — Moderate Risk** | Clinical validation study; licensed drug database with documented coverage; false-negative rate published; physician override mechanism with mandatory justification logging |
| AI Clinical Scribe (SOAP generation) | OPD Lite | **Class I–II** (jurisdiction-dependent) | Narrow intended-use statement; physician review + explicit confirmation before any note commits to record; accuracy benchmarking against clinical ground truth |
| AI Empathy Translation Engine | Health Passport | **Class I — Informational** | Explicit disclaimer that audio supplements, not replaces, physician instructions; patient feedback and error correction mechanism |
| Offline Pill Visual Scanner | Health Passport | **Class II — Moderate Risk** | Validation against medication database; accuracy and failure mode disclosure; must not be used as sole identification mechanism |
| Pediatric / Weight-Based Dosing | OPD Lite (V2 only) | **Class II–III — High Risk** | **Explicitly out of scope for V1.** Must be marked as unsupported in V1 UI. Requires full clinical validation before any V2 scoping. |

---

## 7. Consent Architecture

### 7.1 Consent Principles

- **Granular:** Patients consent separately to treatment access, time-limited third-party access, system analytics, and AI processing of their records.
- **Versioned:** When consent terms change (e.g., a new AI feature is introduced), existing patients must re-consent before the new processing begins.
- **Withdrawable:** Withdrawal must cascade immediately — active access tokens revoked, queued sync operations for that patient blocked within 60 seconds.
- **Emergency override:** A defined break-glass flow exists for life-threatening emergencies. Break-glass access is logged with mandatory post-hoc clinical review and patient notification within 24 hours.
- **Guardian consent:** Patients under 18, or patients with a designated Family Guardian, require guardian consent for all non-emergency third-party access.

### 7.2 Consent Data Model

| Field | Type | Description |
|---|---|---|
| `consent_id` | UUID | Unique consent record identifier |
| `patient_id` | UUID → Patient | Linked patient |
| `grantor_id` | UUID → User | Person granting consent (patient or guardian) |
| `grantor_role` | ENUM | `SELF` · `GUARDIAN` · `EMERGENCY_OVERRIDE` |
| `purpose` | ENUM | `TREATMENT` · `ANALYTICS` · `AI_PROCESSING` · `RESEARCH` · `THIRD_PARTY_SHARE` |
| `scope` | ENUM[] | `PRESCRIPTIONS` · `LABS` · `VITALS` · `CLINICAL_NOTES` · `FULL_RECORD` |
| `granted_to_id` | UUID → Provider or NULL | Entity receiving access; NULL = system-level processing |
| `valid_from` | TIMESTAMPTZ | Consent effective datetime |
| `valid_until` | TIMESTAMPTZ or NULL | Expiry; NULL = persistent until explicitly withdrawn |
| `status` | ENUM | `ACTIVE` · `WITHDRAWN` · `EXPIRED` · `SUPERSEDED` |
| `consent_version` | STRING | Version of consent terms document at time of grant |
| `withdrawn_at` | TIMESTAMPTZ or NULL | Withdrawal timestamp |
| `withdrawal_reason` | TEXT or NULL | Patient-provided reason |
| `created_at` | TIMESTAMPTZ | Immutable creation timestamp |
| `audit_hash` | SHA-256 | Tamper-evidence hash of the consent record at creation |

---

## 8. Patient Data Rights & Provider Lifecycle

### 8.1 Patient Data Rights

| Right | Scope | Implementation Requirement |
|---|---|---|
| **Access** | Complete health record | Export as HL7 FHIR R4 Bundle (JSON) available at any time via Health Passport |
| **Rectification** | Demographic data only | Clinical records are never altered; corrections are addenda with original preserved |
| **Erasure (Limited)** | Non-clinical personal data only | Clinical records subject to mandatory retention (7–10 years post last encounter per jurisdiction) cannot be deleted. System must handle this exception explicitly and communicate it to patients clearly. |
| **Portability** | Full record | FHIR R4 Bundle JSON export |
| **Objection to AI Processing** | AI processing of records | Patient may withdraw AI_PROCESSING consent; system must fall back to manual-only workflows for that patient |

### 8.2 Provider Lifecycle

| Event | System Response |
|---|---|
| **Onboarding** | KYC document capture → OCR extraction → registry verification → manual back-office review. Account is `PENDING_VERIFICATION` until resolved. |
| **License Expiry Approaching** | Automated notifications at 60, 30, and 7 days before expiry |
| **License Expired** | Account transitions to `SUSPENDED`. Clinical write access blocked. Read-only access maintained for 90 days for care continuity. |
| **Voluntary Offboarding** | Provider initiates closure. Active patient list transferred to custodian-of-record state. Patient records remain accessible to patients. Provider loses write access; retains read access for 90 days. |
| **Involuntary Suspension** | All active sessions terminated immediately. Account locked. Patients notified via Health Passport to seek care elsewhere. |
| **Pharmacy Decommissioning** | Dispensing and invalidation access revoked. Active prescription queue preserved in read-only state for patient safety. |

---

# Part 3 — Security Architecture

> **Security Design Principle:** Ultranos handles PHI for clinically vulnerable populations in environments with elevated device theft risk and limited IT support. Security must be defense-in-depth — each layer must protect PHI independently, such that a breach at any single layer does not expose patient data in readable form.

## 9. Encryption Specification

| Layer | Requirement | Implementation |
|---|---|---|
| **Data at Rest — Server** | AES-256-GCM for all PHI in the Central Patient Ledger | Database-level encryption (RDS encryption at rest) + application-level field encryption for highest-sensitivity PHI (diagnosis, prescription content, clinical notes) |
| **Data at Rest — Mobile (Android)** | AES-256 for all locally cached PHI | SQLCipher for local SQLite database. Key derived from biometric/PIN via Android Keystore. Key is not exportable. |
| **Data at Rest — Desktop PWA** | Encrypted IndexedDB for all locally cached PHI | Web Crypto API (AES-GCM) encryption layer wrapping IndexedDB. Encryption key derived from session credential stored in memory — not persisted to disk. Cache cleared on browser close. |
| **Data in Transit** | TLS 1.3 minimum for all API communications | mTLS for server-to-server. Certificate pinning on Android app. TLS 1.2 permitted only for legacy device compatibility with explicit documented approval. |
| **QR Code Content** | QR must not contain raw PHI | Payload: `{ patient_id, issued_at, expiry, ECDSA-P256 signature }`. Hub validates signature on scan. Default 30-day expiry. Revocable server-side at any time. |
| **Backup Data** | Encrypted backups with separate key management | Backup encryption keys stored in HSM or cloud KMS with defined rotation schedule. |
| **AI Audio Output** | Prescription audio files are PHI | Pre-signed, time-limited CDN URLs (15-minute expiry). Files deleted from CDN after delivery. Not cacheable. |

> **Desktop PWA Offline Security Note:** The Web Crypto API encryption model for IndexedDB is less hardened than SQLCipher on Android. This is an accepted trade-off given the physical threat profile difference: a laptop in a clinic office vs. a phone in a pocket. The mitigation is key-in-memory-only (cleared on tab/browser close) combined with mandatory OS-level session lock policy for clinic workstations communicated at provider onboarding.

---

## 10. Authentication & Session Management

### 10.1 MFA Requirements by Role

| Role | Primary Auth | MFA Requirement | Session Policy |
|---|---|---|---|
| **GP — Desktop PWA** | Email + password (min 12 chars, complexity enforced) | TOTP (Authenticator app) — **REQUIRED**. Passkey (WebAuthn) supported as preferred alternative on capable hardware. | 8-hour session. Re-auth after 30 min inactivity on clinical record view. Tab-close clears local encrypted cache. |
| **GP — Android App** | Email + password | TOTP — **REQUIRED**. Biometric re-auth available on supported devices. | 8-hour session. Re-auth on prescription generation after 30 min inactivity. |
| **Pharmacist** | Email + password | TOTP — **REQUIRED**. Hardware token supported for high-volume sites. | 12-hour session. Additional confirmation step on prescription invalidation. |
| **Lab Technician** | Email + password | TOTP — **REQUIRED** | 8-hour session. Each upload action logged with session token. |
| **Patient** | Phone OTP (SMS / WhatsApp) — no password for accessibility | Device binding on first login. New-device login triggers SMS OTP re-verification. | 90-day persistent session with re-verification. |
| **Family Guardian** | Phone OTP + linked patient consent confirmation | Device binding + SMS confirmation sent to patient on each guardian access session | 30-day session. All actions flagged `GUARDIAN_ACTION` in audit log. |
| **System Administrator** | Email + password + TOTP | Hardware FIDO2 token — **REQUIRED. No exceptions.** | 4-hour session. PAM workflow required for all production data access. |

### 10.2 Token Architecture

| Token Type | Format | Expiry | Notes |
|---|---|---|---|
| Access Token | JWT, RS256 signed | 15 minutes | Short-lived. Never stored in localStorage. Stored in memory only. |
| Refresh Token | Opaque, server-side (Redis) | 7 days (providers) · 90 days (patients) | Single-use rotation. Revocable server-side. |
| Device Token | Opaque, bound to device fingerprint | Until explicitly revoked | Revocation propagates to Hub immediately, blocking all subsequent sync from that device. |
| Offline Clinical Token | Signed JWT cached on device | 24 hours | Used for offline clinical operations. Hub validates lineage on sync reconnect before accepting queued events. |

---

## 11. Role-Based Access Control (RBAC)

| Resource | Doctor (Own Patients) | Doctor (Break-Glass) | Pharmacist | Lab Tech | Patient (Own) | Guardian |
|---|---|---|---|---|---|---|
| Patient Demographics | Read / Write | Read (logged) | Read (Name + DOB only) | Read (Name + Age only) | Read / Write | Read |
| Clinical Notes (SOAP) | Read / Write | Read (logged) | ❌ No Access | ❌ No Access | Read | Read |
| Active Prescriptions | Read / Write | Read (logged) | Read / Invalidate | ❌ No Access | Read | Read |
| Prescription History | Read | Read (logged) | ❌ No Access | ❌ No Access | Read | Read |
| Lab Results | Read | Read (logged) | ❌ No Access | Upload Only | Read | Read |
| Vitals History | Read / Write | Read (logged) | ❌ No Access | ❌ No Access | Read | Read |
| Allergy List | Read / Write | Read (logged) | ❌ No Access | ❌ No Access | Read | Read |
| Consent Records | Read (own grants) | ❌ No Access | ❌ No Access | ❌ No Access | Read / Modify | Read / Modify |
| Audit Log | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No Access |

---

## 12. Audit Logging

> **🚨 Mandatory Requirement**
> An immutable, tamper-evident audit log is a legal requirement in every target geography. It is not optional, not a V2 feature, and must not be implemented as a standard mutable database table. The audit store must be **append-only with cryptographic hash chaining**.

### Required Audit Event Fields

| Field | Type | Description |
|---|---|---|
| `event_id` | UUID | Unique event identifier |
| `timestamp` | TIMESTAMPTZ (UTC) | Microsecond-precision event time |
| `actor_id` | UUID | User or system performing the action |
| `actor_role` | ENUM | `DOCTOR · PHARMACIST · LAB_TECH · PATIENT · GUARDIAN · SYSTEM · ADMIN` |
| `action` | ENUM | `READ · CREATE · UPDATE · DELETE_REQUEST · CONSENT_GRANT · CONSENT_REVOKE · SYNC · LOGIN · LOGOUT · MFA_FAIL · BREAK_GLASS · EXPORT` |
| `resource_type` | ENUM | `PATIENT · PRESCRIPTION · LAB_RESULT · CLINICAL_NOTE · CONSENT · USER_ACCOUNT` |
| `resource_id` | UUID | ID of accessed resource |
| `patient_id` | UUID | Denormalized patient ID for fast PHI access queries |
| `session_id` | UUID | Session from which action originated |
| `device_id` | STRING | Device fingerprint or server ID |
| `source_ip` | STRING | Hashed IP (not stored raw per GDPR) |
| `outcome` | ENUM | `SUCCESS · FAILURE · DENIED` |
| `denial_reason` | STRING / NULL | Populated on DENIED outcome |
| `chain_hash` | SHA-256 | Hash of `(previous_event_hash + this_event_data)` for tamper detection |

---

## 13. Device Security Policy

### 13.1 Android App (OPD Lite)

- Device PIN or biometric lock is **mandatory**. OPD Lite Android must refuse to launch if the device has no screen lock set.
- Local PHI cache maximum: 1,000 active patient records or 90 days of encounters, whichever is smaller.
- Remote wipe: administrators may issue a remote wipe command that purges all locally cached PHI from the encrypted SQLCipher store. Wipe executes on next sync or background wake.
- Jailbreak / root detection: detected at launch. Warning displayed. Clinical features disabled on rooted devices (configurable per deployment policy).
- Lost device procedure: device token revocation is the primary mechanism. Revocation blocks all subsequent sync. Documented in operational runbook.

### 13.2 Desktop PWA (OPD Lite)

- Encrypted IndexedDB cache is **cleared on browser tab / browser close**. No PHI persists on disk in the PWA session model.
- Clinic workstations must have OS-level session lock configured (communicated as a setup requirement at provider onboarding, not enforced programmatically by the PWA).
- PWA must not use `localStorage` or `sessionStorage` for any PHI. All clinical data is in encrypted IndexedDB only.
- Inactivity timeout: 30 minutes of inactivity locks the clinical view and requires re-authentication. The encrypted cache is not cleared on timeout (only on browser close) — this allows session resumption without data loss mid-consultation.
- Screen sharing / recording detection: the PWA must display a persistent visible warning if the browser reports that the tab is being screen-shared or captured, given the presence of PHI.

### 13.3 Patient Devices (Health Passport)

- No mandatory device lock enforcement — respects low-literacy, low-tech user base.
- Local cache: own records only, 30-day window.
- No remote wipe for patient devices. If a device is reported lost, hub session is invalidated. Patient re-onboards via SMS OTP re-verification on new device.

---

## 14. Threat Model

| Threat | Attack Vector | Mitigation | Residual Risk |
|---|---|---|---|
| Stolen clinician Android device | Physical access to cached PHI | SQLCipher encryption + mandatory PIN enforcement + remote wipe | **Low** — encrypted data unreadable without PIN/biometric |
| Abandoned open desktop browser session | Unattended clinic workstation | 30-min inactivity lock + OS session lock policy at onboarding | **Low-Medium** — depends on clinic policy adherence |
| QR code theft / photography | Photographed QR presented at pharmacy | Short expiry (30d) + ECDSA signature validation + scan logging | **Low-Medium** — revocation closes active tokens |
| Prescription duplication fraud | Same prescription at multiple pharmacies | Global atomic invalidation; offline queue resolved on sync | **Medium** during offline window — mitigated by audit trail |
| Compromised provider account | Credential stuffing / phishing | MFA enforcement; anomaly detection on prescribing patterns; session binding | **Low** with MFA enforced |
| LLM hallucination in clinical notes | AI generates incorrect drug name or dose | Physician explicit confirmation required before note commits; AI and confirmed versions both stored | **Medium** — mitigated by mandatory human review gate |
| Sync conflict overwriting allergy data | Offline update + hub update create conflicting allergy records | Tier 1 append-only merge; human review flag (see Section 17) | **Low** with tiered resolution implemented |
| MITM on clinic or mobile network | Packet interception on public / 2G networks | TLS 1.3 + certificate pinning on Android app + HSTS on PWA | **Low** |
| PHI leakage via browser developer tools | Developer inspects IndexedDB in a shared workstation browser | Key-in-memory-only model; cache cleared on browser close | **Low-Medium** — primary mitigation is single-user workstation policy |

---

# Part 4 — Data Architecture & Sync Engine

## 15. Master Patient Index (MPI)

> **⚠️ Critical Design Consideration**
> Patient identity deduplication is the single hardest problem in this system. In target geographies: Afghanistan lacks a universal national ID system; Arabic and Dari names have extreme transliteration variance (Muhammad / Mohammed / محمد are the same person); date-of-birth accuracy is low in rural populations. The entire clinical value of Ultranos depends on correctly linking records to the right patient across care sites.

### 15.1 Identity Fields

| Field | Required | Notes |
|---|---|---|
| `patient_id` | Yes — system UUID | Primary key. Never displayed to users. |
| `national_id` | Optional | National ID, passport, or residency card number. Stored encrypted. High-confidence matching signal. |
| `name_local` | Yes | Name in patient's preferred script (Arabic, Dari, Latin). Stored Unicode NFD-normalized. |
| `name_latin` | Derived | System-generated romanization using ALA-LC transliteration standards. Used for phonetic matching. |
| `name_phonetic` | Derived | Double Metaphone hash of Latin name. Used for fuzzy matching. |
| `date_of_birth` | Yes (approximate acceptable) | Day, month, year stored separately. Year-only records flagged. |
| `sex_at_birth` | Yes | FHIR `AdministrativeGender`: `male · female · other · unknown` |
| `phone_number` | Yes (if available) | E.164 format. Primary OTP delivery channel. |
| `guardian_id` | Conditional | Required for patients under 18 or patients with a designated guardian. |
| `biometric_reference` | Optional (V2) | Reference ID to biometric store. Not stored in Ledger directly. |

### 15.2 Probabilistic Matching Algorithm

When registering a new patient, the MPI executes a duplicate detection query before creating a new record.

| Matching Signal | Match Type | Weight | Action Threshold |
|---|---|---|---|
| National ID | Exact | 100 pts | Any match → mandatory deduplication review |
| Phone Number | Exact | 80 pts | ≥ 80 pts → probable duplicate alert |
| Date of Birth | Exact or year ± 1 | 30 pts | — |
| Phonetic Name Hash | Jaro-Winkler ≥ 0.88 | 40 pts | — |
| Sex at Birth | Exact | 10 pts | — |
| **Composite ≥ 90 pts** | — | — | **Block** new record creation. Clinician must confirm: new patient vs. existing. |
| **Composite 60–89 pts** | — | — | **Warn** clinician. Allow override with reason logged to audit trail. |
| **Composite < 60 pts** | — | — | Create new record without interruption. |

---

## 16. FHIR R4 Schema Mapping

The Central Patient Ledger must map all clinical entities to their HL7 FHIR R4 equivalents. Internal schema design must not deviate from these resource types.

| Clinical Entity | FHIR R4 Resource | Required FHIR Fields | Ultranos Extension Fields |
|---|---|---|---|
| Patient | `Patient` | id, name, gender, birthDate, telecom, identifier | name_phonetic, name_latin, guardian_id, consent_version, biometric_reference_id |
| Practitioner | `Practitioner` | id, name, identifier (license), telecom, qualification | license_expiry, kyc_status, gps_geofence_id |
| Prescription | `MedicationRequest` | id, status, medicationCodeableConcept, subject, requester, dosageInstruction, authoredOn | qr_token_id, dispense_status, ai_audio_url, generic_substitution_permitted |
| Lab Result | `DiagnosticReport` | id, status, code, subject, issued, result, performer | lab_portal_upload_id, ocr_metadata_verified, ordering_doctor_notified_at |
| Vitals | `Observation` | id, status, code (LOINC), subject, effectiveDateTime, valueQuantity | recorded_by_role, device_id, offline_recorded |
| Clinical Note | `DocumentReference` | id, status, type, subject, date, content | ai_generated_version, physician_confirmed_version, soap_section, ai_model_version |
| Allergy | `AllergyIntolerance` | id, clinicalStatus, verificationStatus, code, patient, recordedDate | recorded_by_role, conflict_resolution_version |
| Diagnosis | `Condition` | id, clinicalStatus, code (ICD-10-CM), subject, recordedDate | encounter_id |
| Consent | `Consent` | id, status, scope, category, patient, dateTime, provision | purpose_enum, granted_to_id, valid_until, audit_hash |

---

## 17. Conflict Resolution Engine

> **🚨 Safety-Critical Design Rule**
> Last-Write-Wins (LWW) is **explicitly prohibited** for all safety-critical clinical fields. LWW applied to an allergy list can kill a patient. The following tiered resolution policy is mandatory and non-negotiable.

### 17.1 Conflict Resolution Tiers

| Tier | Data Category | Fields Affected | Resolution Policy |
|---|---|---|---|
| **Tier 1 — Safety-Critical** | Allergies, Active Medication List, Critical Diagnoses, Advance Directives | `AllergyIntolerance`, active `MedicationRequest`, critical `Condition` | **Append-only merge.** Both conflicting versions retained. Conflict flag raised for physician review within 24 hours. Prescription generation blocked for the affected patient until conflict is resolved. |
| **Tier 2 — Clinical Content** | Clinical notes, lab results, vitals, historical prescriptions | `DocumentReference`, `DiagnosticReport`, `Observation`, inactive `MedicationRequest` | **Timestamp-based merge.** Newer timestamp wins. Both versions retained as addenda. Physician notified via in-app flag. |
| **Tier 3 — Operational Data** | Appointment schedules, contact info, preferences, consent updates | Patient demographics (non-clinical), notification preferences | **Last-Write-Wins.** Standard LWW with timestamp comparison. No physician review required. |
| **Tier 4 — Sync Queue Events** | Multiple offline events queued for same patient from different devices | All event types | **Chronological replay** by HLC timestamp. Events within a 60-second conflicting window are flagged for review regardless of tier. |

---

## 18. Sync Engine Specification

### 18.1 Sync Queue Design

| Parameter | Specification |
|---|---|
| **Queue Implementation** | Durable local queue — SQLite-backed on Android, IndexedDB-backed on Desktop PWA, Redis-backed on server. Survives app restart and browser refresh. |
| **Event Ordering** | Hybrid Logical Clock (HLC) timestamps on all events. Ensures causal ordering even when device clocks drift. |
| **Maximum Queue Size** | 2,000 events or 50 MB, whichever is reached first. On overflow: oldest non-safety-critical events compacted. Tier 1 (safety-critical) events are never dropped. |
| **Sync Priority Order** | 1. Allergy and active medication updates · 2. New prescriptions · 3. Lab result notifications · 4. Clinical notes · 5. Vitals and observations · 6. Administrative metadata |
| **Retry Policy** | Exponential backoff: 5s → 15s → 45s → 2m → 5m → 15m → 60m. After 24 hours without sync, provider receives in-app alert. |
| **Sync Receipt** | Hub returns a signed `sync_receipt` with event IDs and resolution outcomes. Client marks events `SYNCED` only after receipt validation. |
| **Partial Sync Handling** | Hub uses idempotency keys. Mid-batch failures resume without duplicating committed events. |
| **Network Gating** | Edge AI model updates (> 1 MB) transmitted on Wi-Fi only. All clinical sync events may use any available connection including 2G/EDGE. |

### 18.2 Offline Data Retention Limits

| Surface | Max Local Records | Max Age | Eviction Policy |
|---|---|---|---|
| OPD Lite — Android | 1,000 active patient records | 90 days since last encounter | LRU eviction of oldest inactive records. Active patients (encounter in last 30 days) are never evicted. |
| OPD Lite — Desktop PWA | Session-scoped cache only | Cleared on browser close | No persistent PHI on disk. On-demand fetch from Hub on session start, cached in memory for session duration. Sync queue persisted in encrypted IndexedDB across sessions. |
| Health Passport | Own records only, no record count limit | 24 months of history | Oldest archived records compressed as FHIR Bundles. Active prescriptions never compressed. |
| Pharmacy POS | 72-hour active prescription queue | 72 hours | Cache cleared on each successful sync. Near-online design — deep offline not required. |
| Lab Portal | Upload queue: up to 50 pending items | 48 hours | Near-online design. Items older than 48 hours require re-upload. |

> **Desktop PWA Offline Note:** The Desktop PWA does not maintain a persistent offline patient record cache the way the Android app does. On session start with connectivity, it fetches and caches the GP's active patient list for the session. If connectivity is lost mid-session, the in-memory cache sustains the consultation. On browser close, the cache is wiped. Sync events (new prescriptions, notes) are persisted in encrypted IndexedDB and transmitted on reconnect. This is an intentional security trade-off appropriate to the clinic environment.

---

# Part 5 — AI Strategy & Clinical Safety

> **AI Design Philosophy:** AI in Ultranos is a clinical support tool, not a clinical decision-maker. Every AI output that influences a clinical decision requires explicit human confirmation before it becomes part of the medical record. AI is never the final authority.

## 19. Hybrid AI Architecture

| Component | Mode | Technology | Function | Clinical Safety Gate |
|---|---|---|---|---|
| **Clinical Scribe** | Online | Cloud LLM (GPT-4-class or equivalent) | Parses dictated or typed consultation notes into structured SOAP format | Physician reviews AI-generated SOAP sections, edits as needed, and explicitly taps "Confirm & Save." Both AI version and confirmed version stored permanently. |
| **Clinical Scribe** | Offline | Edge AI — Predictive Macro Engine | Surfaces pre-validated SOAP templates based on typed keywords. No generative output offline. | No safety gate needed — templates are pre-validated clinical text, not generative. |
| **Drug Interaction Checker** | Online + Offline | Licensed pharmaceutical database + local offline subset (top-500 regional formulary) | Checks prescription against patient allergy list and active medications | Blocking alert for CONTRAINDICATED. Warning modal for MAJOR. Inline flag for MODERATE. Override requires reason entry and is logged. (See Section 20.) |
| **Empathy Translation Engine** | Online | Cloud LLM + Dialect-tuned TTS API | Translates prescription instructions into conversational, culturally-appropriate audio in Arabic, Dari, or English dialects | Explicit disclaimer in audio: "This is a simplified explanation. Always follow your doctor's direct instructions." |
| **Empathy Translation Engine** | Offline | Edge TTS + Pre-recorded voice fragments | Stitches native voice actor fragments into medication reminders | Same disclaimer. Fragment library clinically reviewed before each production deployment. |
| **Generic Substitution Engine** | Online | Cloud AI + Localized Formulary Database | Suggests generic equivalents for branded prescriptions | Pharmacist must confirm substitution. Prescribing doctor notified asynchronously. Patient consent required if local law mandates. |
| **Paper Prescription OCR** | Online | Cloud Vision AI | Extracts text from photographed handwritten prescriptions at pharmacy | Confidence score displayed per field. Fields below 85% confidence highlighted for manual review. Pharmacist confirms all fields. |
| **Lab Result Metadata OCR** | Online | Cloud Vision AI | Auto-tags uploaded lab PDFs with standardized metadata | Lab technician confirms or corrects tags before upload commits. |

### 19.1 Desktop PWA AI Scribe — Enhanced Capabilities

The Desktop PWA unlocks a richer AI Scribe experience compared to the Android app, given the keyboard-first interface and more reliable connectivity in clinic settings:

- **Rich-text SOAP editor:** Each SOAP section (Subjective / Objective / Assessment / Plan) is a distinct editable field. AI populates all four sections simultaneously. Doctor navigates via keyboard (Tab between sections).
- **Browser microphone dictation:** Web Speech API enables voice-to-text within the browser. Dictation stream is sent to the Cloud AI Scribe API for structured SOAP parsing.
- **Real-time drug suggestion:** As the doctor types medications in the Plan section, the drug interaction checker fires inline and shows results in a sidebar panel — no modal interruption to the note-writing flow.
- **Offline macro fallback:** If connectivity is lost mid-session, the editor falls back to keyword-triggered template macros from the local Edge AI cache.

---

## 20. Drug Interaction Checker

### 20.1 Database Requirements

- The drug interaction database must be a **licensed, clinically validated source**. Acceptable options: Wolters Kluwer Medi-Span, Cerner Multum, First Databank, or a WHO-approved equivalent with documented coverage of the WHO Essential Medicines List and MENA/Central Asia regional formularies.
- Coverage must include medications commonly prescribed in target geographies, including drugs not present in US or EU formularies.
- Database updated at minimum **monthly**. The system must refuse interaction checks if the database version is more than **45 days old**.
- A curated offline subset covering the **500 most-prescribed drugs in the target region** is maintained on device and updated via the Edge AI delta update mechanism within 7 days of any critical interaction entry addition.

### 20.2 Interaction Severity Levels

| Severity | Definition | System Response | Override Policy |
|---|---|---|---|
| **CONTRAINDICATED** | Known to cause serious harm or death. Absolute interaction. | **Blocking modal.** Prescription cannot be saved until offending drug is removed or override confirmed. | Override requires: doctor password re-entry + written clinical justification (min 20 characters) + logged and flagged for clinical audit review within 24 hours. |
| **ALLERGY MATCH** | Prescribed drug matches a recorded patient allergy. | **Blocking modal** — identical protocol to CONTRAINDICATED. Allergy alerts cannot be downgraded. | Same as CONTRAINDICATED. |
| **MAJOR** | Potentially life-threatening or requiring major intervention. | Non-blocking warning modal with detailed interaction description. Must be acknowledged before proceeding. | One-click acknowledge with mandatory reason selection from pre-defined list. Logged. |
| **MODERATE** | May result in clinical deterioration. Requires management. | Inline warning banner. Does not interrupt workflow. | No override required. Logged. |
| **MINOR** | Limited clinical effect or well-managed interaction. | Subtle indicator in drug field. No modal. | No action required. Logged. |

---

## 21. Multilingual Voice Engine

### 21.1 Online Mode — Cloud AI TTS

- TTS API configured for **dialect-specific output**, not Modern Standard Arabic (MSA). Target dialects: Levantine Arabic (Jordan/Syria populations); Gulf Arabic (UAE/KSA); Afghan Dari (Eastern Persian).
- Dialect selection is configurable at the **patient level** — not hardcoded to geography.
- Audio evaluated by native-speaker clinical linguists before production deployment. **Dialect accuracy acceptance test: ≥ 95% score from a panel of ≥ 10 native speakers per dialect.**
- Audio output includes: medication common name in local dialect; dose and frequency; duration; one specific caution (e.g., "take with food"); disclaimer text.

### 21.2 Offline Mode — Edge TTS with Pre-recorded Fragments

- Fragments produced by **professional native voice actors**, not robotic TTS engines.
- Minimum fragment set per language/dialect:
  - Medication names for top-500 regional formulary drugs
  - Dose number fragments (1–20)
  - Frequency descriptors (once daily, twice daily, etc.)
  - Time-of-day tokens (morning / noon / evening / night — culturally calibrated per dialect)
  - Duration fragments (days, weeks)
  - Standard caution fragments (with food, avoid sunlight, complete the course, etc.)
- Fragment naturalness validated by clinical linguists: **Naturalness Score ≥ 4.0/5.0** in patient user testing before production deployment.
- Fragment library storage budget: **≤ 50 MB per language** to stay within offline storage allocation.

---

## 22. AI Model Governance

| Requirement | Specification |
|---|---|
| **Model Version Tagging** | Every AI output committed to a clinical record is tagged with the exact model version that produced it (e.g., `gpt-4o-2024-11-20`). Enables retrospective review if a model version has systematic errors. |
| **Edge AI Model Expiry** | Edge AI models and offline drug database subsets expire 45 days without a successful update sync. On expiry: AI-dependent features degrade gracefully. Template-only mode activates. Provider notified in-app. Clinical operations continue. |
| **Performance Monitoring** | Production tracking of: drug interaction true-positive rate (sampled audit); SOAP note physician edit rate; TTS playback completion rate; OCR field accuracy rate. Monthly report to Clinical Safety Officer. |
| **Clinical Feedback Loop** | Physicians may flag any AI output as incorrect with a single tap. Flagged outputs queued for clinical review. Aggregate flag data reviewed monthly and used to tune model prompts and database entries. |
| **Prompt Governance** | All LLM system prompts used in production are version-controlled in the application repository. Prompt changes require a pull request review from both a clinician and an engineer before deployment. |
| **Bias Monitoring** | AI outputs monitored quarterly for demographic bias across gender, age group, and language. Any statistically significant disparity in drug interaction detection rates, note quality, or TTS accuracy triggers an incident review. |

---

# Part 6 — Module PRDs

> **Requirement notation:** Each requirement has an ID, acceptance criteria, and priority.
> - **P0** — V1 launch blocker. Must ship.
> - **P1** — V1 target. Ship if capacity allows; if not, moves to V1.1.
> - **P2** — Roadmap. V2 or later.

---

## 23. OPD Lite — Multi-Surface Doctor Application

### Overview

| Attribute | Value |
|---|---|
| **Primary Surface** | Desktop PWA — Chrome / Edge / Firefox on laptop or desktop monitor (clinic setting) |
| **Alternate Surface** | Android Native — for mobile-first contexts, home visits, rural deployments |
| **Primary User** | Solo General Practitioner (GP) |
| **Connectivity Model** | Desktop PWA: near-online with robust session-scoped offline fallback. Android: fully offline-first. |
| **SaMD Classification** | Class I–II (jurisdiction dependent). See Section 6. |
| **Languages** | English (V1 primary); Arabic + Dari RTL-ready architecture from first commit |
| **Design Paradigm** | Desktop PWA: keyboard-first, three-panel layout (patient list / active consultation / clinical sidebar). Android: touch-first, stacked layout. |

---

### 23.1 Provider Onboarding

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| OPD-001 | **KYC Document Capture:** Provider photographs their medical license. Cloud Vision OCR extracts name, license number, issuing body, and expiry date. | Extraction accuracy ≥ 95% on standard license formats. Extracted data presented for provider confirmation before submission. | P0 |
| OPD-002 | **Registry Verification:** Extracted license data cross-referenced against a supported national medical registry (MoH, HAAD, JMC, etc.) before account activation. | Account status `PENDING_VERIFICATION` until registry check resolves. Back-office review available for registries without API integration. Time-to-activation displayed to provider. | P0 |
| OPD-003 | **License Expiry Management:** System monitors license expiry and notifies providers at 60, 30, and 7 days before expiry. | At expiry, account transitions to `SUSPENDED`. In-app + email notification. Clinical access blocked. Renewal re-triggers OPD-001. | P0 |
| OPD-004 | **Profile Setup:** Provider name (local script + Latin romanization), clinic name, address, GPS coordinates, consultation languages, and specialty captured at onboarding. | All fields present in FHIR `Practitioner` resource. GPS coordinates generate a clinic geofence record. | P1 |

---

### 23.2 Desktop PWA — Layout & Interface Requirements

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| OPD-010 | **Three-Panel Layout:** The desktop UI presents three simultaneous panels: (1) Patient list / search, (2) Active consultation workspace, (3) Clinical sidebar (allergies, active meds, vitals trend, recent labs). | All three panels visible simultaneously on a 1280px+ wide viewport. Panel widths adjustable via drag. Minimum usable width: 1024px (side panels collapse to tabs). | P0 |
| OPD-011 | **Keyboard Navigation:** Full clinical workflow completable without touching the mouse. | Tab order follows clinical workflow: patient search → encounter creation → SOAP note → drug entry → dosage → prescription confirm. Keyboard shortcuts documented and available via `?` overlay. | P0 |
| OPD-012 | **Installable PWA:** App is installable as a desktop PWA via browser install prompt. | Meets PWA installability criteria: HTTPS, Web App Manifest, Service Worker registered. Install prompt shown on first visit after 2 minutes. Once installed, app launches in standalone window without browser chrome. | P0 |
| OPD-013 | **Offline Status Indicator:** Persistent, visible indicator of connectivity status and sync queue depth. | Green dot: connected + synced. Amber dot + queue count: connected, sync pending. Red dot: offline, queue count shown. Clicking indicator opens sync status detail panel. | P0 |
| OPD-014 | **Session Security Banner:** Visible indicator if browser tab is being screen-shared or screen-recorded. | Browser `Screen Capture API` or `Visibility API` used to detect sharing. If detected: amber banner displayed — "⚠ Screen sharing detected — patient data visible." Banner persists until sharing ends. | P1 |

---

### 23.3 Patient Management

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| OPD-020 | **Patient Registration:** New patient registration with full demographic capture per Section 15.1. | MPI duplicate check executed before record creation per Section 15.2. Patient ID generated. Record synced to Hub on next connection. | P0 |
| OPD-021 | **Patient Search:** Search by name (phonetic fuzzy match), phone number, or QR code scan. | Results returned within 500ms on standard hardware. QR scan resolves to patient record within 2 seconds. Fuzzy name match handles Arabic/Dari transliteration variance. | P0 |
| OPD-022 | **Consent Verification:** Before accessing a patient record, app verifies active consent exists for this provider. | No active consent → patient must grant consent via Health Passport, guardian authorization, or break-glass override. Break-glass access logged immediately. | P0 |
| OPD-023 | **Patient Summary View — Allergy Prominence:** On opening any patient record, allergies are displayed first with highest visual prominence. | Allergy section rendered at the top of the clinical sidebar. Red background. Never collapsed, never hidden behind a tab, never below the fold on initial load. | P0 |

---

### 23.4 Clinical Consultation & Documentation

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| OPD-030 | **Encounter Creation:** Each visit creates a new Encounter record with date, time, provider, and reason for visit. | Encounter committed to local store immediately. UUID generated. Synced to Hub. | P0 |
| OPD-031 | **AI Clinical Scribe — Desktop (Online):** Provider types or dictates into a rich-text SOAP editor. Cloud AI populates all four SOAP sections simultaneously. | AI-generated sections editable inline. Physician taps "Confirm & Save" to commit. Both AI and confirmed versions stored. If connectivity lost mid-session, offline macro fallback activates without data loss. | P0 |
| OPD-032 | **AI Clinical Scribe — Android (Online):** Provider dictates or types. Cloud AI parses into SOAP note. | Same confirmation gate as OPD-031. Optimized for smaller screen (one SOAP section visible at a time with swipe navigation). | P0 |
| OPD-033 | **Offline Macro Fallback (both surfaces):** Predictive SOAP template macros surface based on typed keywords when AI is unavailable. | Templates appear within 300ms of keyword entry. Macros are pre-validated clinical text. No generative output offline. | P0 |
| OPD-034 | **Browser Microphone Dictation (Desktop PWA):** Dictation via browser microphone API, streamed to Cloud AI Scribe. | Dictation activatable via microphone button or keyboard shortcut. Visual waveform shown while active. Dictation stream processed server-side; transcript and AI-parsed SOAP result returned together. | P1 |
| OPD-035 | **Diagnosis Entry:** ICD-10 coded diagnosis with keyword search in English and Arabic. | Diagnosis coded to ICD-10-CM. Free-text stored as addendum if exact code unavailable. Mapped to FHIR `Condition`. | P1 |
| OPD-036 | **Vitals Entry:** Structured entry for BP, HR, temperature, RR, O2 saturation, weight, height. | All vitals stored as FHIR `Observation` with LOINC codes. Trend sparklines visible in clinical sidebar on Desktop PWA. | P1 |

---

### 23.5 E-Prescription Engine

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| OPD-040 | **Drug Selection:** Searchable drug database (offline subset of licensed formulary). Search by brand or generic name in English and Arabic. | Drug selection maps to standardized drug code (RxNorm or regional equivalent). Desktop PWA: search results appear inline in SOAP Plan section sidebar. | P0 |
| OPD-041 | **Drug Interaction Check — Real-Time (Desktop PWA):** As doctor types a drug name in the Plan section, interaction check fires inline. Results appear in clinical sidebar without interrupting note-writing flow. | Inline results displayed within 1 second. CONTRAINDICATED / ALLERGY results escalate to blocking modal regardless of context. MAJOR shows warning banner in sidebar. | P0 |
| OPD-042 | **Drug Interaction Check — Modal (Android):** On drug confirmation, interaction check runs and presents results as a modal. | Same severity tiers and override policies per Section 20.2. | P0 |
| OPD-043 | **Dosage Specification:** Structured entry: dose amount, unit, frequency, route, duration. Pre-defined dosage macros configurable per provider. | Pediatric / weight-based dosing (mg/kg) is **explicitly out of scope for V1**. UI must display a persistent note in the dosage module: *"Weight-based dosing not supported — calculate pediatric doses manually."* | P0 |
| OPD-044 | **Generic Substitution Flag:** Provider may flag prescription as "Generic Substitution Permitted." | Flag persists on prescription. Visible to pharmacist. If flagged, Cloud AI suggests generic at dispense. | P1 |
| OPD-045 | **Prescription QR Generation:** Each confirmed prescription generates a unique signed QR code. | QR payload per Section 9. Displayed on Desktop PWA for patient to photograph or sent to Health Passport via sync. Status: `ACTIVE` on creation. | P0 |
| OPD-046 | **Empathy Translation Trigger:** On prescription confirmation, system queues audio generation request. | Audio generated asynchronously by Cloud TTS. Patient notified in Health Passport when ready. Audio accessible offline once downloaded to device. | P1 |

---

### 23.6 Android-Specific Requirements

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| OPD-050 | **Full Offline Clinical Capability:** All clinical workflows — registration, consultation, SOAP notes, drug interaction check (offline subset), e-prescriptions — must complete without a network connection. | 48-hour offline simulation test passed. All Tier 1 safety-critical events persisted in SQLCipher-encrypted local store. | P0 |
| OPD-051 | **Background Sync:** Sync queue flushed to Hub API automatically when connectivity is restored, including when app is backgrounded. | Android WorkManager used for background sync to survive battery optimization. Sync persists across device restarts. | P0 |
| OPD-052 | **Minimum API Level:** Android 8.0 (API level 26) minimum. | App must not use deprecated APIs removed in API 26. Tested on representative low-RAM devices (2 GB RAM). | P0 |

---

## 24. Health Passport — Patient Application

### Overview

| Attribute | Value |
|---|---|
| **Platform** | Android + iOS (React Native or Flutter — RTL-native from first commit) |
| **Primary Users** | Patients (including low-literacy); Family Guardians |
| **Connectivity Model** | Intermittent / low connectivity. Core identity and active prescriptions accessible fully offline. |
| **Accessibility** | WCAG 2.1 AA minimum. Icon-first design. No reliance on text for core clinical functions. |
| **Languages** | English, Arabic (RTL), Dari (RTL) — all three from V1 launch |

---

### 24.1 Language Onboarding

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| HP-001 | **OS Locale Auto-Detection:** Device locale pre-selects language on first launch. | Arabic locale → Arabic RTL. Dari/Farsi locale → Dari RTL. All others → English. | P0 |
| HP-002 | **Visual Language Gateway:** Full-screen language selection with large tappable buttons in native scripts. | Buttons: `English` / `العربية` / `دری`. Each tap plays a 2-second warm audio greeting. No text literacy required to complete this step. | P0 |
| HP-003 | **Persistent Language Toggle:** Globe icon in top navigation bar at all times. | Language change takes effect within 200ms. Layout mirrors to RTL immediately. | P0 |
| HP-004 | **Dynamic RTL Mirroring:** Selecting Arabic or Dari reverses all horizontal layout elements. | Navigation arrows, swipe directions, menu positions mirror. Medical icons remain static. RTL layout validation checklist 100% passed before release. | P0 |

---

### 24.2 Identity & Authentication

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| HP-010 | **OTP Onboarding:** Registration via phone number. OTP via SMS or WhatsApp. | OTP delivered within 60 seconds. 6-digit code, 10-minute expiry. No password. Device bound on first successful login. | P0 |
| HP-011 | **QR Identity Code:** Patient issued a personal QR after registration. | QR payload per Section 9. Displayable offline. 30-day expiry auto-renewed on sync. Previous QR revoked on renewal. | P0 |
| HP-012 | **Family Guardian Linking:** Patient designates a Guardian who can view and manage their records. | Guardian designation initiated by patient. SMS confirmation to patient when guardian accesses records. All guardian actions logged `GUARDIAN_ACTION`. V1: one primary patient per guardian. | P1 |

---

### 24.3 Health Record Viewing

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| HP-020 | **Active Prescription View:** All active prescriptions with medication name, dose, frequency, and status. | Medication name in patient's selected language. Icon-first display: Sun (morning), Moon (evening), Pill + count. Status: `ACTIVE` (green), `DISPENSED` (gray), `EXPIRED` (red). | P0 |
| HP-021 | **Prescription Audio Instructions:** Dialect-tuned audio explanation of each prescription. | Online: cloud-generated dialect audio. Offline: pre-downloaded edge TTS fragments. Disclaimer plays before instructions. Playback speed controls: 0.8× / 1× / 1.2×. Transcript available as fallback. | P0 |
| HP-022 | **Visual Vitals Viewer:** Trend graphs for BP, weight, glucose (if captured). | Color-coded ranges: green (normal), amber (borderline), red (abnormal). Date range selector. Icon-based labels — no medical terminology required. | P1 |
| HP-023 | **Lab Results View:** Results with simplified status labels. | Default view: test name (plain language), date, status: `Normal` / `Attention Needed` / `Review with Doctor`. Full values on tap for digitally literate users. | P1 |
| HP-024 | **Medication Reminder:** Daily reminders for each active prescription. | Reminders generated from dosage frequency. Patient confirms or adjusts timing. Push notification + audio playback on tap. | P1 |

---

### 24.4 Consent Management

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| HP-030 | **Active Consent View:** Patient sees all active consent grants — who has access to what. | List shows provider name, data scope (icons), valid-until date, Revoke button. No technical jargon. | P0 |
| HP-031 | **Consent Grant Flow:** Patient grants access by scanning provider QR or entering a code. | Patient selects scope (icons + labels) and duration: `1 Visit / 7 Days / 30 Days / Until I Revoke`. Consent committed to Hub immediately; queued for sync if offline. | P0 |
| HP-032 | **Consent Revocation:** Patient revokes any active consent with one tap. | Revocation committed to Hub immediately — does not wait for sync. Provider receives in-app notification within 60 seconds of revocation. | P0 |

---

## 25. Pharmacy POS & Verification Portal

### Overview

| Attribute | Value |
|---|---|
| **Platform** | PWA / Next.js — installable on desktop or tablet, no app store dependency |
| **Primary Users** | Independent Pharmacist; Dispensing Technician |
| **Connectivity Model** | Near-online (pharmacy WiFi). Offline dispensing queue for brief outages. |
| **Languages** | English + Arabic (RTL) V1 |
| **Regulatory Note** | Controlled substance handling requires country-specific regulatory review before deployment in each geography. |

---

### 25.1 Pharmacy Credentialing

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| PH-001 | **Business KYC:** Pharmacy submits trade license, pharmacy operating license, and responsible pharmacist credential. | Back-office verification within 3 business days. Account `PENDING` until verified. | P0 |
| PH-002 | **GPS Geofencing:** Portal access permitted only within 500m of declared pharmacy coordinates. | Access from outside geofence triggers re-verification alert and access hold. Geofence radius configurable per deployment. | P0 |
| PH-003 | **Responsible Pharmacist Identity Binding:** Each dispensing action linked to logged-in pharmacist identity. | Pharmacist professional license verified at onboarding. All dispensing events include pharmacist ID in audit log. | P0 |

---

### 25.2 Prescription Verification & Dispensing

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| PH-010 | **QR Scanner:** Webcam or device camera QR scan for patient verification. | QR validated server-side: signature check + expiry check + revocation check. Returns: patient first name + DOB (identity confirmation only) + list of `ACTIVE / UNFILLED` prescriptions. Does not return clinical notes, vitals, diagnoses, or lab results. | P0 |
| PH-011 | **Manual Patient Lookup:** Fallback by patient ID or phone number if QR unavailable. | Same restricted data view as QR scan. All manual lookups logged at elevated audit priority. | P1 |
| PH-012 | **Prescription Display:** Show medication name, dose, frequency, prescribing doctor, issue date, and expiry. | Only `ACTIVE`, `UNFILLED` prescriptions shown. `EXPIRED` and `DISPENSED` prescriptions not shown. | P0 |
| PH-013 | **One-Click Dispensing & Global Invalidation:** Pharmacist confirms dispense. | Prescription status transitions to `DISPENSED` atomically in Hub. All other pharmacy portals reflect `DISPENSED` on next sync. Dispense event includes: pharmacist ID, pharmacy ID, timestamp, drug batch number (optional). | P0 |
| PH-014 | **Partial Dispensing:** Pharmacist marks prescription `PARTIALLY_DISPENSED` with quantity noted. | Partial dispense reduces available quantity. Prescription remains `ACTIVE` until fully dispensed or expired. Each partial event individually logged. | P1 |
| PH-015 | **Offline Dispensing Queue:** If connection is lost, invalidation action is queued locally. | Queued invalidation transmitted within 60 seconds of reconnection. Warning displayed during offline period. Idempotent — prescription cannot be double-dispensed after queue resolves. | P0 |
| PH-016 | **Generic Substitution:** If prescription flagged for generic substitution, Cloud AI suggests equivalent. | Suggestion includes: generic name, active ingredient confirmation, bioequivalence note. Pharmacist must confirm. Substitution logged. Doctor notified asynchronously. | P1 |

---

### 25.3 Anti-Fraud & Anomaly Detection

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| PH-020 | **Controlled Substance Flagging:** Scheduled/controlled substance prescriptions visually flagged. | Flag based on local jurisdiction drug schedule classification. Controlled substance dispenses require additional pharmacist confirmation step. | P0 |
| PH-021 | **Prescribing Pattern Anomaly Alerts:** Statistically unusual prescribing rates flagged at the prescriber level. | Configurable rules: > 10 controlled substance prescriptions from one provider in one day; same drug prescribed to > 20% of provider's patients in 7 days. Anomaly triggers back-office review alert. Provider is not notified. | P1 |
| PH-022 | **Paper Prescription OCR:** Pharmacist captures handwritten prescription via webcam. | Cloud Vision extracts: drug name, dose, frequency, prescriber name, date. Per-field confidence score displayed. Fields < 85% confidence highlighted for manual review. OCR prescriptions watermarked `LEGACY_PAPER` — cannot trigger global digital invalidation. | P1 |

---

## 26. Diagnostic Lab Portal

### Overview

| Attribute | Value |
|---|---|
| **Platform** | Minimalist PWA / Next.js |
| **Primary Users** | Lab Technician; Phlebotomist |
| **Connectivity Model** | Near-online. Upload queue for 48-hour outages. |
| **Design Philosophy** | Minimal surface area by intent. Lab technicians must not be able to read patient medical history. Fewer features is a security feature here. |
| **Languages** | English + Arabic V1 |

---

### 26.1 Lab Credentialing

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| LAB-001 | **Lab Registration:** Lab submits operating license, ISO 15189 accreditation (if available), and responsible technician credentials. | Back-office verification within 3 business days. Account `PENDING` until verified. | P0 |
| LAB-002 | **Technician Identity Binding:** Each upload linked to logged-in technician identity. | All uploads include technician ID in audit log. Account requires valid lab affiliation. | P0 |

---

### 26.2 Patient Verification (Restricted)

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| LAB-010 | **Push-Only Patient Lookup:** Technician verifies patient identity before upload. | Query returns: **patient first name + age ONLY.** No other clinical data. This is a hard API-layer enforcement — not a UI-layer restriction. | P0 |
| LAB-011 | **QR Code Verification:** Technician may scan patient QR to confirm identity. | Same restricted response: name + age only. | P0 |

---

### 26.3 Result Upload Workflow

| Req ID | Requirement | Acceptance Criteria | Priority |
|---|---|---|---|
| LAB-020 | **File Upload:** Drag-and-drop or file picker for PDF or image lab result files. | Max file size: 20 MB. Accepted formats: PDF, JPEG, PNG. Server-side virus scan on upload. File stored encrypted at rest. | P0 |
| LAB-021 | **Metadata Tagging:** Technician selects test category (e.g., Blood Work — CBC, Lipid Panel, HbA1c), sample collection date, and patient ID. | Test category mapped to LOINC code. Metadata stored as FHIR `DiagnosticReport` shell before result attachment. | P0 |
| LAB-022 | **AI Metadata Extraction:** Cloud Vision OCR auto-suggests metadata tags from the uploaded document. | OCR suggestions pre-populate fields. Low confidence fields (< 85%) left blank for manual entry. Technician reviews and confirms all fields before commit. | P1 |
| LAB-023 | **Notification Dispatch:** On successful upload commit, system notifies ordering doctor and patient. | Doctor: in-app notification in OPD Lite within 60 seconds. Patient: Health Passport notification. Notifications queued if recipient is offline. | P0 |
| LAB-024 | **Upload Queue (Offline Resilience):** File and metadata preserved locally if connection drops during upload. | Queue survives browser refresh and device restart. Pending items visible to technician. Items older than 48 hours require re-upload. | P1 |

---

# Part 7 — Infrastructure, Operations & Business Continuity

## 27. Cloud Architecture & Data Residency

| Geography | Cloud Provider | Primary Region | Backup Region | Required Certifications |
|---|---|---|---|---|
| **UAE** | Azure or AWS | Azure UAE North or AWS me-central-1 (UAE) | Azure Germany West Central (backup only — no PHI primary storage) | ISO 27001 · SOC 2 Type II · UAE TDRA · DOH BAA |
| **KSA** | KSA-resident infrastructure only | STC Cloud (KSA) or certified KSA co-location. **AWS me-south-1 (Bahrain) is NOT compliant.** | KSA secondary site | PDPL · NHIC/NPHIES integration cert · SFDA SaMD clearance for AI |
| **Jordan / Afghanistan** | AWS EU or Azure West Europe | Frankfurt or Amsterdam primary | Ireland or Paris secondary | ISO 27001 · GDPR SCCs for cross-border transfer · MOH DPA |
| **All regions** | All cloud vendors | AWS BAA + Azure DPA required regardless of primary region | — | HIPAA BAA · ISO 27001 · SOC 2 Type II |

---

## 28. Service Level Agreements

| Service | Availability Target | RTO | RPO | Notes |
|---|---|---|---|---|
| Central Hub API | 99.9% monthly (≤ 43.8 min downtime) | < 30 min | < 5 min | Multi-AZ deployment. Auto-failover. Maintenance windows 02:00–04:00 local time only. |
| Patient Ledger (Database) | 99.95% monthly | < 15 min | < 1 min | Synchronous standby replication. Point-in-time recovery enabled. |
| AI Orchestration Engine | 99.5% monthly | < 60 min | < 15 min (queue-based — requests not lost) | Graceful offline fallback activates within 30 seconds of cloud AI unavailability. |
| Sync API Endpoint | 99.9% monthly | < 30 min | N/A (sync is idempotent — retried by clients) | Load-balanced across minimum 3 instances. Auto-scaling on sync queue depth. |
| Edge AI Update Service | 99.0% monthly | < 4 hours | N/A (push-based, client retry) | Lower SLA acceptable within 45-day TTL window. |

---

## 29. Disaster Recovery

| Scenario | Detection | Response | Owner |
|---|---|---|---|
| Primary database failure | Automated health check + CloudWatch alarm | Auto-failover to standby replica within 15 min. On-call DBA notified. RCA within 24 hours. | On-call DBA + Platform Engineering |
| Hub API complete outage | Synthetic monitoring + end-user error rate spike | Spoke apps continue offline. Sync queue preserved on device. Status page updated within 10 min. | On-call Platform Engineering |
| Data corruption event | Integrity monitoring + audit log hash chain break | Affected data isolated immediately. Point-in-time restore. Clinical operations suspended for affected patients until integrity confirmed. | CTO + Chief Compliance Officer |
| Security breach (PHI exposure) | SIEM alerting + anomalous access patterns | Incident response activated. Affected records identified within 1 hour. Regulator notification within 72 hours (GDPR/UAE). Patient notification per legal requirement. | CISO + Legal Counsel |
| Cloud provider region failure | Provider status page monitoring | DNS failover to backup region within 30 min. Full clinical data available from backup (RPO < 5 min via synchronous replication). | Platform Engineering |

---

## 30. Monitoring & Observability

### Required Monitoring Layers

**Infrastructure**
- CPU, memory, disk, and network metrics for all cloud resources
- Automated alerts on threshold breaches
- PagerDuty (or equivalent) on-call rotation

**Application Performance**
- API response time per endpoint: target P95 < 500ms reads, P95 < 1000ms writes
- Sync queue depth and age monitoring
- Error rate alerting: > 1% error rate triggers P2 incident

**Clinical Safety**
- Drug interaction check completion rate — alert if < 100%
- CONTRAINDICATED override rate — alert if > 2% of total interaction checks
- AI output physician edit rate — monthly report to Clinical Safety Officer
- Sync conflict resolution queue age — alert if Tier 1 conflicts unresolved > 24 hours

**Security**
- SIEM integration for anomalous PHI access patterns
- Failed MFA attempts > 5 in 10 minutes → temporary account lock + security team alert
- Break-glass access events → immediate security team notification

**Compliance**
- Audit log hash chain integrity: verified daily
- Consent expiry queue: patients notified 7 days before consent expiry
- Provider license expiry queue: notifications per Section 8.2

---

## 31. Operational Support Model

### 31.1 Support Tiers

| Tier | Issue Type | Response Time | Escalation |
|---|---|---|---|
| **P0 — Critical** | Clinical safety impact (drug interaction failure, invalidation failure, data corruption) | 15-min initial response · 1-hour resolution target | On-call engineer → CTO → Clinical Safety Officer → Legal (if PHI breach) |
| **P1 — High** | Service unavailability for active clinical users (Hub API down, sync blocked) | 1-hour response · 4-hour resolution | On-call engineer → Platform Engineering Lead |
| **P2 — Medium** | Feature degradation (AI offline, audio generation delayed) | 4-hour response · next business day resolution | Support → Product Engineering |
| **P3 — Low** | Non-urgent requests, UI issues, onboarding questions | 1 business day response | Support team |

### 31.2 Clinical Escalation Paths (Offline Scenarios)

> These escalation paths must be: (a) documented in the in-app help, (b) included on a printed quick-reference card distributed at provider onboarding, and (c) accessible without internet connection.

- **Prescription can't be verified (Hub offline):** Pharmacist calls prescribing doctor's direct contact number — captured at provider onboarding and printed on each prescription for this scenario. Verbal verification documented in paper log.
- **Critical allergy conflict detected offline:** OPD Lite blocks prescription generation and displays the offline allergy list. Doctor manually verifies allergy status before prescribing.
- **Lab result notification failed:** If doctor hasn't opened a critical result within 24 hours, system escalates to a second push notification. If unacknowledged after 48 hours, back-office team is alerted to contact the provider directly.

---

# Part 8 — Product Strategy & Commercial Architecture

## 32. Monetization & Pricing

> **Pricing Principle:** Ultranos serves populations where healthcare access is already a barrier. The patient-facing Health Passport is free to patients, always. Revenue is generated from providers and institutions — never from patients.

| Tier | Target | Included | Pricing |
|---|---|---|---|
| **Health Passport — Free** | All patients | QR identity, prescription viewing, audio instructions (online), consent management, vitals history | Free. No patient-facing charges. Ever. |
| **Health Passport — Guardian** | Family Guardians | All Free features + linked dependent profiles + remote authorization + centralized reminders | USD 2.99/month or USD 24.99/year. Subsidized in low-income geographies (configurable per deployment). |
| **OPD Lite — Solo GP** | Individual GPs | Full consultation, e-prescriptions, drug interaction check, AI scribe (100 consultations/month online), sync | USD 29/month or USD 290/year per provider |
| **OPD Lite — Clinic** | Clinics with 2–10 providers | All Solo features × provider count + clinic dashboard + provider analytics + unlimited AI scribe | USD 25/provider/month (min 2 providers). Volume discount at 5+ providers. |
| **Pharmacy POS — Standard** | Independent pharmacies | Prescription verification, dispensing, invalidation, generic substitution, POS webhook | USD 49/month per pharmacy location |
| **Lab Portal — Standard** | Diagnostic labs | Patient verification, result upload, notification dispatch, OCR metadata | USD 39/month per lab |
| **Enterprise / NGO** | Hospital systems, NGOs, MoH | All modules + custom data residency + FHIR API access + SLA guarantees + dedicated support + training | Custom contract. Annual commitment. Includes BAA/DPA. |

### 32.1 Billing Architecture Requirements

- **Patient billing (Guardian tier):** In-app purchase via Apple App Store and Google Play. Subscription management and cancellation accessible within the app.
- **Provider billing:** Direct card billing or bank transfer for regions with low card adoption. Invoice generation for B2B accounts. 30-day payment terms for enterprise.
- **Trial period:** 30-day free trial for Solo GP and Pharmacy tiers. At expiry: read-only mode (existing records viewable, new clinical content blocked). Data never deleted on lapse — preserved per retention policy.
- **Account lapse and patient record continuity:** When a provider account lapses, patient records remain accessible to patients via Health Passport. Provider loses clinical write access but retains read access for 90 days. Records enter custodian-of-record state.

---

## 33. V1 Launch Roadmap

| Phase | Duration | Deliverables | Exit Criteria |
|---|---|---|---|
| **Phase 0 — Compliance & Foundation** | 8 weeks | Regulatory matrix signed off by compliance attorney. Cloud provider and region selected per Section 27. Drug interaction database licensed. SaMD classification confirmed. FHIR R4 schema designed. Security architecture reviewed by external penetration test scoping firm. | All P0 compliance decisions documented and signed off by Legal and CTO. |
| **Phase 1 — Core Backend** | 10 weeks | Central Hub: IAM, Event Broker, Patient Ledger (FHIR-aligned), Audit Log (append-only with hash chaining), Sync API, Consent Engine, MPI with probabilistic matching. Encryption at rest and in transit. | Backend security audit passed. Conflict resolution engine tested with simulated sync scenarios. Audit log integrity verified. |
| **Phase 2 — OPD Lite Desktop PWA** | 10 weeks | Three-panel desktop PWA: patient registration + MPI check, consent verification, consultation + SOAP notes (AI scribe + offline macros), drug interaction check, e-prescription + QR generation, background sync, installable PWA, offline status indicator. | UAT with 10 urban GPs. Drug interaction test suite: 100% sensitivity on CONTRAINDICATED cases. Offline session test (connectivity lost mid-consultation) passed. Desktop PWA installability criteria met. |
| **Phase 2.1 — OPD Lite Android** | 6 weeks (parallel or post Phase 2) | Android app with full offline-first clinical capability, SQLCipher encryption, background sync, remote wipe. Feature parity with Desktop PWA for clinical workflows. | 48-hour offline simulation test passed. Tested on 2 GB RAM target device. Root detection active. |
| **Phase 3 — Health Passport** | 8 weeks | iOS + Android: language onboarding (EN/AR/DA), QR identity, prescription view + audio, consent management, basic vitals view. | UAT with 30 low-literacy patients across 3 language groups. RTL layout validation checklist 100% passed. Dialect acceptance test ≥ 95% score per language. |
| **Phase 4 — Pharmacy + Lab** | 8 weeks | Pharmacy PWA: credentialing, QR verification, dispensing, invalidation, geofencing, controlled substance flagging. Lab PWA: restricted patient lookup, upload workflow, notification dispatch. | End-to-end dispense flow tested with Phase 2 prescription. Duplicate dispense prevention test passed. Lab notification latency < 60 seconds confirmed. |
| **Phase 5 — Pilot Launch** | 8 weeks | Controlled pilot: 50 providers, 5 pharmacies, 3 labs, up to 500 patients in one geography. Full monitoring stack live. Clinical safety team reviewing AI output quality weekly. | Zero P0 clinical safety incidents. Drug interaction check coverage ≥ 99.5% of pilot prescription volume. Sync reliability ≥ 99%. Desktop PWA sessions ≥ 70% of OPD Lite usage. |

---

## 34. Open Questions & Blockers

> **These are active blockers.** Owners must be assigned and resolution deadlines set at the next planning session. No Phase 1 sprint begins until OQ-01 through OQ-03 are resolved.

| # | Question | Owner | Blocks |
|---|---|---|---|
| OQ-01 | Which KSA-resident infrastructure solution will serve KSA deployments? STC Cloud, a certified KSA co-location, or another approach? AWS me-south-1 is confirmed non-compliant. | CTO + Legal | Phase 0 — cannot finalize infrastructure design for KSA |
| OQ-02 | Which drug interaction database will be licensed? Needs documented MENA/Central Asia formulary coverage. | Chief Medical Officer / Clinical Advisor | Phase 2 — blocks OPD-041 and OPD-042 |
| OQ-03 | Has a SaMD Regulatory Affairs specialist been engaged? In which launch geographies does pre-market clearance apply, and what is the timeline? | CEO + Legal | If pre-market clearance required, V1 timeline may extend 12–24 months. Must resolve in Phase 0. |
| OQ-04 | What is the patient identity fallback strategy for Afghanistan (no national ID system)? Is biometric capture (fingerprint) in scope for V1 or deferred? | Product Lead | Affects MPI design — moderately impacts Phase 1 |
| OQ-05 | Which national medical registries offer API access for real-time license verification? For those without APIs, what is the back-office SLA for manual verification? | Partnerships / Operations | Affects provider onboarding time-to-activation |
| OQ-06 | What is the pediatric dosing strategy for V1? Hard out-of-scope with explicit UI warning (current PRD position) — or does the clinical advisor require a manual weight-entry + calculation feature? | Clinical Advisor | If required, adds SaMD Class II validation scope to V1 |
| OQ-07 | Has a Data Protection Officer (DPO) been appointed, as potentially required under GDPR for large-scale health data processing? | Legal | GDPR obligation. Required before V1 launch in any geography with EU resident exposure. |
| OQ-08 | For the Desktop PWA offline security model: does the clinic deployment context (fixed workstations, single-user) satisfy the security bar, or does the compliance team require additional technical controls beyond key-in-memory encryption? | CISO + Legal | Affects Desktop PWA offline architecture — impacts Phase 2 |

---

# Appendix A — Glossary

| Term | Definition |
|---|---|
| **BAA** | Business Associate Agreement — a contract required under HIPAA between a covered entity and a vendor that handles PHI |
| **Break-Glass Access** | An emergency override allowing a provider to access patient records without prior consent, logged and subject to mandatory post-hoc review |
| **Edge AI** | Machine learning models deployed and running on end-user devices (offline), as distinct from cloud-hosted inference |
| **FHIR R4** | Fast Healthcare Interoperability Resources, Release 4 — the leading standard for healthcare data exchange, published by HL7 |
| **HLC** | Hybrid Logical Clock — a distributed timestamp mechanism ensuring causal ordering of events even when device clocks differ |
| **LWW** | Last-Write-Wins — a conflict resolution strategy where the most recently timestamped version is accepted as authoritative. Prohibited for Tier 1 clinical fields in Ultranos. |
| **MPI** | Master Patient Index — a database of unique patient identities used to link records across care settings and prevent duplicate records |
| **NPHIES** | National Platform for Health Information Exchange System — Saudi Arabia's national health data exchange platform |
| **PHI** | Protected Health Information — any individually identifiable health information subject to privacy regulation |
| **PWA** | Progressive Web App — a web application that can be installed on a device and run offline using Service Workers and Web App Manifest |
| **RBAC** | Role-Based Access Control — a security model where system access is determined by the user's defined role |
| **RTL** | Right-to-Left — the text and layout direction used in Arabic and Dari scripts |
| **SaMD** | Software as a Medical Device — software that performs a medical function without being part of a physical medical device (per IEC/TR 62304) |
| **SOAP Note** | Subjective / Objective / Assessment / Plan — a structured format for clinical consultation documentation |
| **SQLCipher** | An open-source extension to SQLite providing transparent AES-256 encryption of database files |
| **TTS** | Text-to-Speech — technology that converts written text into spoken audio |
| **Web Crypto API** | A browser-native JavaScript API providing cryptographic operations including AES-GCM encryption |

---

# Appendix B — V1 Compliance Checklist

> Complete and sign off before any V1 production launch. P0 items are hard blockers.

| # | Requirement | Priority | Owner | Status |
|---|---|---|---|---|
| CL-01 | Regulatory matrix reviewed and signed off by qualified healthcare compliance attorney for all launch geographies | P0 | Legal | ☐ |
| CL-02 | Cloud provider selected with signed BAA/DPA and data residency confirmed per Section 27 | P0 | CTO | ☐ |
| CL-03 | Drug interaction database licensed with MENA/Central Asia formulary coverage confirmed | P0 | CMO | ☐ |
| CL-04 | SaMD classification exercise completed by Regulatory Affairs specialist | P0 | Legal + CMO | ☐ |
| CL-05 | Data Protection Officer appointed (GDPR obligation) | P0 | Legal | ☐ |
| CL-06 | PHI encryption specification implemented and independently verified (server + mobile + PWA) | P0 | Engineering | ☐ |
| CL-07 | MFA enforced for all clinical staff roles (doctors, pharmacists, lab technicians) | P0 | Engineering | ☐ |
| CL-08 | Immutable audit log implemented with hash-chain integrity verification | P0 | Engineering | ☐ |
| CL-09 | Conflict resolution: Tier 1 safety-critical fields confirmed append-only with physician review gate | P0 | Engineering | ☐ |
| CL-10 | Consent management: grant, versioning, revocation, and withdrawal cascade tested end-to-end | P0 | Engineering | ☐ |
| CL-11 | MPI probabilistic matching validated with synthetic test dataset (minimum 1,000 records) | P0 | Engineering | ☐ |
| CL-12 | Drug interaction check: 100% sensitivity on CONTRAINDICATED test suite (minimum 200 cases) | P0 | Engineering + CMO | ☐ |
| CL-13 | AI confirmation gate tested: both AI and confirmed versions stored correctly on physician confirm | P0 | Engineering | ☐ |
| CL-14 | Break-glass access flow implemented, logged, and post-hoc notification tested | P0 | Engineering | ☐ |
| CL-15 | Android: SQLCipher encryption confirmed, jailbreak detection active, remote wipe tested | P0 | Engineering | ☐ |
| CL-16 | Desktop PWA: key-in-memory model confirmed, cache-clear-on-browser-close verified, inactivity lock tested | P0 | Engineering | ☐ |
| CL-17 | Prescription global invalidation idempotency tested: no duplicate dispensing in concurrent offline scenarios | P0 | Engineering | ☐ |
| CL-18 | RTL layout validation checklist 100% passed for Arabic and Dari on both iOS and Android | P0 | Engineering | ☐ |
| CL-19 | Dialect accuracy acceptance test ≥ 95% for all three language/dialect variants | P1 | Product + Clinical | ☐ |
| CL-20 | External penetration test completed with no Critical or High findings unresolved | P0 | Security | ☐ |
| CL-21 | Disaster recovery failover drill: RTO < 30 minutes confirmed | P1 | Platform Engineering | ☐ |
| CL-22 | Desktop PWA installability verified in Chrome, Edge, and Firefox on Windows and macOS | P0 | Engineering | ☐ |
| CL-23 | OPD Lite Desktop PWA offline session test: connectivity-lost-mid-consultation scenario passed without data loss | P0 | Engineering | ☐ |
| CL-24 | Pediatric dosing disclaimer confirmed present and prominently displayed in OPD Lite dosage module | P0 | Engineering + CMO | ☐ |

---

*Ultranos mHealth Ecosystem — Master PRD v3.0 — April 2026*
*Confidential — Internal Distribution Only*
*Next scheduled review: July 2026*
