---
stepsCompleted: [1, 2, 3, 4, 'addendum-1', 'addendum-2', 'addendum-3', 'addendum-4']
workflowType: 'epics-and-stories'
status: 'complete'
completedAt: '2026-04-28'
addendumStarted: '2026-05-02'
inputDocuments:
  - docs/ultranos_master_prd_v3.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/gap-analysis-report.md
---

# Ultranos - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Ultranos, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Patient Identity Verification (QR scan/Manual search)
FR2: Clinical Encounter Initialization (FHIR Encounter resource)
FR3: SOAP Note Generation (Subjective, Objective, Assessment, Plan)
FR4: Diagnosis Coding (ICD-10 mapping to FHIR Condition)
FR5: Clinical Charting (Vital signs, physical exam observations)
FR6: E-Prescription Entry (FHIR MedicationRequest)
FR7: Real-time Drug-Drug Interaction Check (Offline-safe subset)
FR8: QR Prescription Generation (Cryptographically signed offline)
FR9: Pharmacy Fulfillment (Fulfill medication, update MedicationDispense)
FR10: Global Prescription Invalidation (Real-time cloud check/void)
FR11: Health Passport Profile (Patient demographics and medical history)
FR12: Patient Consent Management (FHIR Consent resource)
FR13: Offline Data Capture (Durable local queue persistence)
FR14: Hybrid Logical Clock Sync (HLC timestamping for ordering)
FR15: Append-only Sync Ledger (Tier 1 safety-critical conflict resolution)
FR16: Role-Based Access Control (RBAC via Supabase Auth)
FR17: Cryptographic Audit Logging (Immutable hash-chained logs)
FR18: Multilingual/RTL UI (Arabic, Dari, and English support)

### NonFunctional Requirements

NFR1: Zero-latency UI response (<50ms for optimistic state transitions)
NFR2: High-availability offline mode (Full clinical functionality without network)
NFR3: AES-256 data-at-rest encryption (SQLCipher for Mobile / Session-memory for PWA)
NFR4: Fast local search performance (<500ms search for 1,000 local records)
NFR5: FHIR R4 standard compliance for all data models
NFR6: MENA Data Residency (Hub isolation within regional cloud boundaries)
NFR7: WCAG AA global accessibility compliance
NFR8: Low-literacy UI optimization (Icon-heavy navigation for Patient Passport)

### Additional Requirements (Architecture)

AR1: Turborepo monorepo setup with pnpm workspace
AR2: Next.js App Router for PWA and Web portals
AR3: Expo for Android and cross-platform native apps
AR4: tRPC v11 for end-to-end TypeScript safety between Hub and Edge
AR5: Zustand v5 for isomorphic optimistic state management
AR6: Dexie.js for PWA local storage persistence
AR7: Hub-and-Spoke sync topology implementation
AR8: Key-in-memory enforcement for PWA PHI protection

### UX Design Requirements

UX-DR1: Wise-inspired "Billboard" typography system (Inter 900-weight headers)
UX-DR2: Optimistic Action Button (Primary Green Pill with 1.05x scale feedback)
UX-DR3: Global Sync Pulse indicator (Pulsing green/yellow/red in navbar)
UX-DR4: Clinical Command Palette (Ctrl+K) for rapid keyboard-driven charting
UX-DR5: Stale Data Warning Banner (High-contrast yellow persistent banner)
UX-DR6: Single-handed mobile interaction model (Bottom-anchored primary actions)

### New Functional Requirements (Gap Analysis Addendum — 2026-05-02)

FR19: Spoke App Authentication & Session Management (Login UI, MFA, inactivity timeout, logout for OPD Lite, Pharmacy Lite)
FR20: PWA Infrastructure (Service Workers, manifests, install prompts, offline asset caching)
FR21: Hub API Encounter Lifecycle (create, read, update, close, SOAP note sync)
FR22: Hub API Patient CRUD (create, read individual, update, deactivate)
FR23: Hub API Medication Creation (clinician prescription creation via Hub)
FR24: Lab Lite Upload Workflow Dashboard (orchestrator page wiring existing components)
FR25: Patient Lite Mobile Navigation & Onboarding (tab navigator, OTP login, language gateway)
FR26: Sync Queue Reliability (drain workers for Pharmacy Lite and Patient Lite, retry/backoff)
FR27: Clinical Completeness (SOAP Plan section, encounter history, conflict resolution UI)
FR28: Global App Shell & Navigation (navbar, user menu, breadcrumbs for all PWA apps)
FR29: Back-Office Administration (KYC verification, lab approval, provider lifecycle, anomaly alerting)
FR30: API Security Hardening (rate limiting, QR signature verification, consent authorization, security headers)
FR31: Patient Lite Allergy Display & Data Rights (allergy banner, FHIR Bundle export, guardian linking)
FR32: Monitoring, Alerting & Observability (clinical safety metrics, sync monitoring, error rate alerting)
FR33: AI Clinical Intelligence (Clinical Scribe, Empathy Translation, Paper Rx OCR, Edge AI)
FR34: Shared Package Completeness (drug-db package, DiagnosticReport/MedicationDispense types, mobile ECDSA-P256)

### New Non-Functional Requirements (Gap Analysis Addendum — 2026-05-02)

NFR9: Session duration enforcement (8h GPs, 12h pharmacists, 4h admins, 90d patients)
NFR10: Inactivity re-auth (30-min for GP clinical views, pharmacist Rx generation)
NFR11: Sync queue max size enforcement (2,000 events OR 50 MB)
NFR12: Drug interaction database staleness (refuse checks if >45 days old)
NFR13: TLS 1.3 minimum with certificate pinning on Android
NFR14: Root/jailbreak detection with clinical feature disable on Android

### FR Coverage Map

FR1: Epic 1 - Patient Identity Verification
FR2: Epic 2 - Clinical Encounter Initialization
FR3: Epic 2 - SOAP Note Generation
FR4: Epic 2 - Diagnosis Coding
FR5: Epic 2 - Clinical Charting
FR6: Epic 3 - E-Prescription Entry
FR7: Epic 3 - Real-time Drug Interaction Check
FR8: Epic 3 - QR Prescription Generation
FR9: Epic 4 - Pharmacy Fulfillment
FR10: Epic 3 - Global Prescription Invalidation
FR11: Epic 1 - Health Passport Profile
FR12: Epic 5 - Patient Consent Management
FR13: Epic 1 - Offline Data Capture
FR14: Epic 1 - Hybrid Logical Clock Sync
FR15: Epic 9 - Append-only Sync Ledger
FR16: Epic 6 - Role-Based Access Control
FR17: Epic 8 - Cryptographic Audit Logging
FR18: Epic 11 - Multilingual/RTL UI
LAB-001 through LAB-024: Epic 12 - Lab Diagnostics & Reporting
FR19: Epic 14 - Spoke App Authentication & App Shell
FR20: Epic 15 - PWA Infrastructure & Installability
FR21: Epic 16 - Hub API Clinical Lifecycle Endpoints
FR22: Epic 16 - Hub API Clinical Lifecycle Endpoints
FR23: Epic 16 - Hub API Clinical Lifecycle Endpoints
FR24: Epic 17 - Lab Lite Complete UI/UX
FR25: Epic 18 - Patient Lite Mobile Complete UI/UX
FR26: Epic 19 - Sync Queue Reliability & Offline Resilience
FR27: Epic 20 - OPD Lite Complete UI/UX
FR28: Epic 14 - Spoke App Authentication & App Shell
FR29: Epic 22 - Back-Office Administration & Provider Lifecycle
FR30: Epic 21 - API Security Hardening
FR31: Epic 18 - Patient Lite Mobile Complete UI/UX
FR32: Epic 23 - Monitoring, Alerting & Observability
FR33: Epic 24 - AI Clinical Intelligence
FR34: Epic 25 - Shared Package Completeness
NFR9: Epic 14 - Session duration enforcement
NFR10: Epic 14 - Inactivity re-auth
NFR11: Epic 19 - Sync queue max size enforcement
NFR12: Epic 25 - Drug interaction database staleness
NFR13: Epic 21 - TLS 1.3 minimum
NFR14: Epic 21 - Root/jailbreak detection

## Epic List

### Epic 1: Ecosystem Foundation & Identity
Establish the Hub-and-Spoke connectivity, initialize the shared sync engine contracts, and enable the core "Patient Identity" workflow.
**FRs covered:** FR1, FR11, FR13, FR14, FR15, FR18
**Scaffold stories:** 1.6 (OPD-Lite Mobile), 1.7 (Lab-Lite)

### Epic 2: Clinical Encounter & SOAP Charting
Build the core "OPD Lite" clinician experience for charting encounters.
**FRs covered:** FR2, FR3, FR4, FR5

### Epic 3: E-Prescribing & Medication Safety
Implement the prescribing lifecycle and clinical safety gates.
**FRs covered:** FR6, FR7, FR8, FR10

### Epic 4: Pharmacy Operations
Enable the pharmacist's fulfillment workflow via the standalone `pharmacy-lite` spoke app.
**FRs covered:** FR9

### Epic 5: Patient Health Passport & Consent
Build the patient-facing "Patient Lite Mobile" experience.
**FRs covered:** FR12

### Epic 6: Trust, Audit & Access
Finalize the ecosystem's administrative and compliance layer.
**FRs covered:** FR16

### Epic 7: Security & Encryption Hardening
Harden the ecosystem against data theft and unauthorized access.
**FRs covered:** NFR3, AR8

### Epic 8: Compliance & Immutable Auditing
Ensure every clinical action is logged and verifiable.
**FRs covered:** FR17

### Epic 9: Sync Engine Integration & Resilience
Transition from local-first to a globally synchronized, conflict-aware ecosystem.
**FRs covered:** FR14, FR15

### Epic 10: Clinical Safety & Terminology
Upgrade decision support with full medication history and standardized terminology.
**FRs covered:** FR7, FR10

### Epic 11: Internationalization & UX Resilience
Provide a world-class, accessible experience for all regional users.
**FRs covered:** FR18, NFR7, NFR8

## Epic 1: Ecosystem Foundation & Identity
Establish the Hub-and-Spoke connectivity, initialize the shared sync engine contracts, and enable the core "Patient Identity" workflow.

### Story 1.1: Monorepo Foundation & Shared Contracts
As a developer, I want the Turborepo monorepo and shared clinical packages initialized so that I can build apps against a unified FHIR R4 and Sync contract.

**Acceptance Criteria:**
- **Given** a fresh project root
- **When** the pnpm workspace is initialized
- **Then** `packages/shared-types` contains FHIR R4 Zod schemas for Patient, Encounter, and MedicationRequest
- **And** `packages/sync-engine` contains a Hybrid Logical Clock (HLC) implementation
- **And** `packages/ui-kit` exports the Wise-inspired typography and color tokens (UX-DR1)

> **Architecture Decision (2026-04-28):** All FHIR resource `meta` objects MUST use FHIR R4 canonical field names (`lastUpdated`, `versionId`). The `createdAt` field is an Ultranos extension in `_ultranos.createdAt`. See architecture.md Format Patterns and CLAUDE.md FHIR R4 Alignment.

### Story 1.2: Hub API & tRPC Scaffolding
As a system administrator, I want a centralized Hub API so that clinical data can be validated and synchronized across the ecosystem.

**Acceptance Criteria:**
- **Given** the monorepo structure
- **When** `apps/hub-api` is initialized
- **Then** a tRPC v11 router is accessible via a Node.js endpoint
- **And** the server connects to Supabase/PostgreSQL using strict `snake_case` for all mappings
- **And** a health-check procedure returns a valid HLC timestamp

### Story 1.3: PWA Identity Verification (Dexie Persistence)
As a GP, I want to verify a patient's identity in the PWA so that I can begin a clinical encounter.

**Acceptance Criteria:**
- **Given** the OPD-Lite PWA application
- **When** a clinician scans a patient QR code or searches by National ID
- **Then** the patient demographics (FR11) are retrieved from the Hub or Local Cache
- **And** the data is cached in Dexie.js using a key-in-memory encryption strategy (AR8)
- **And** the UI response time for local search is <500ms (NFR4)

### Story 1.4: Mobile Identity Verification (SQLCipher Persistence)
As a field GP, I want to verify patient identity on my mobile device so that I can conduct consultations in rural areas.

**Acceptance Criteria:**
- **Given** the Expo mobile application
- **When** a patient identity is verified offline
- **Then** the record is stored in the local SQLite database encrypted with SQLCipher (NFR3)
- **And** the clinician can view demographics and basic medical history without a network connection

### Story 1.6: OPD-Lite Mobile Scaffold
As a system architect, I want to scaffold the `apps/opd-lite-mobile/` Expo application shell, so that the mobile clinician spoke is acknowledged in the codebase and ready for future development.

**Acceptance Criteria:**
- **Given** the monorepo structure
- **When** `apps/opd-lite-mobile/` is initialized
- **Then** a valid Expo project exists with `@ultranos/opd-lite-mobile` package name
- **And** it depends on shared packages (`shared-types`, `sync-engine`, `ui-kit`)
- **And** a placeholder screen renders with "Coming Soon" branding
- **And** a README documents the app's purpose, target user (field GPs), and deferred status

> **Architecture Decision (2026-04-30):** `opd-lite-mobile` is scaffolded but not actively developed. It acknowledges the architecture's mobile clinician spoke. Active development deferred until field GP support is prioritized. See Story 1.4 for future activation requirements.

### Story 1.7: Lab-Lite PWA Scaffold
As a system architect, I want to scaffold the `apps/lab-lite/` Next.js PWA application shell, so that the lab diagnostics spoke is established in the codebase and ready for Epic 12 development.

**Acceptance Criteria:**
- **Given** the monorepo structure
- **When** `apps/lab-lite/` is initialized
- **Then** a valid Next.js 15 App Router project exists with `@ultranos/lab-lite` package name
- **And** it depends on shared packages (`shared-types`, `sync-engine`, `ui-kit`)
- **And** a placeholder page renders with "Lab Diagnostics Portal — Coming Soon"
- **And** tRPC client is configured to connect to `hub-api`
- **And** a README documents purpose, target users (lab technicians), and data minimization constraint

### Story 1.5: RTL Global Context & Mirroring
As a multilingual clinician, I want the UI to mirror correctly for RTL languages so that I can work comfortably in Arabic or Dari.

**Acceptance Criteria:**
- **Given** the `next-intl` and `expo-localization` setup
- **When** the language is set to Arabic or Dari
- **Then** the entire application layout mirrors (RTL) at the framework level
- **And** typography tokens from `ui-kit` adjust correctly for Arabic script readability

## Epic 2: Clinical Encounter & SOAP Charting
Build the core "OPD Lite" clinician experience for charting encounters.

### Story 2.1: Encounter Lifecycle & Zustand Store
As a clinician, I want to start an encounter instantly so that I can begin treating patients without waiting for network confirmation.

**Acceptance Criteria:**
- **Given** an authenticated clinician session
- **When** the "Start Encounter" action is triggered
- **Then** a new FHIR Encounter resource is created in the `useEncounterStore`
- **And** the UI reflects the "Active Consultation" state in <50ms (NFR1)
- **And** the record is queued for persistence in Dexie/SQLite in the background

### Story 2.2: SOAP Note Entry (Subjective & Objective)
As a clinician, I want to record patient complaints and findings so that I have a clinical record of the visit.

**Acceptance Criteria:**
- **Given** an active encounter
- **When** text is entered into the "Subjective" or "Objective" clinical note fields
- **Then** the content is persisted locally to the append-only ledger (FR15)
- **And** an autosave indicator confirms the record is durable even if the tab is closed

### Story 2.3: Vital Signs Charting
As a clinician, I want to chart a patient's vitals so that I can monitor their physiological state.

**Acceptance Criteria:**
- **Given** the "Vitals" section of the encounter
- **When** Weight, Height, Blood Pressure, and Temperature are entered
- **Then** the BMI is automatically calculated and displayed
- **And** values outside of standard clinical ranges are highlighted in red
- **And** the data is saved as FHIR Observation resources linked to the Encounter

### Story 2.4: Diagnosis Entry (ICD-10 Search)
As a clinician, I want to assign a diagnosis to the encounter so that I can provide a clinical assessment.

**Acceptance Criteria:**
- **Given** the "Assessment" section of the encounter
- **When** a clinician searches for a diagnosis using clinical terms or ICD-10 codes
- **Then** results are retrieved from the local ICD-10 cache in <500ms
- **And** selecting a diagnosis creates a FHIR Condition resource linked to the Encounter

### Story 2.5: Clinical Command Palette (UX-DR4)
As a power user, I want to navigate the encounter via keyboard so that I can complete consultations faster.

**Acceptance Criteria:**
- **Given** an active consultation screen
- **When** `Ctrl+K` is pressed
- **Then** the Command Palette overlay is displayed
- **And** typing ">Vitals" or ">Prescribe" immediately focuses the respective UI section
- **And** the palette supports fuzzy search for all clinical actions

## Epic 3: E-Prescribing & Medication Safety
Implement the prescribing lifecycle and clinical safety gates.

### Story 3.1: Medication Search & Prescription Entry
As a clinician, I want to search for and prescribe medications so that I can provide treatment to the patient.

**Acceptance Criteria:**
- **Given** an active encounter
- **When** a clinician searches for a medication and enters dosage instructions
- **Then** a FHIR `MedicationRequest` resource is created in the local store
- **And** the medication is marked as "Pending Fulfillment"

### Story 3.2: Local Drug-Drug Interaction Checker
As a clinician, I want to be warned of potential drug interactions offline so that I can ensure patient safety.

**Acceptance Criteria:**
- **Given** a new medication entry
- **When** the medication is added to the prescription list
- **Then** the system compares it against the patient's "Active" medications using the local interaction database
- **And** a high-severity alert is displayed if a Contraindication is detected
- **And** the clinician must provide a justification to override the warning

### Story 3.3: Cryptographically Signed QR Generation
As a clinician, I want to provide the patient with a secure digital prescription so that they can fulfill it at any pharmacy.

**Acceptance Criteria:**
- **Given** a finalized prescription
- **When** the "Generate QR" action is triggered
- **Then** a QR code is displayed containing the signed `MedicationRequest` payload
- **And** the payload is signed using the clinician's private key (Ed25519) stored in device secure storage

### Story 3.4: Global Prescription Invalidation Check
As a pharmacist, I want to verify if a prescription has already been used so that I can prevent medication fraud.

**Acceptance Criteria:**
- **Given** a scanned prescription QR code
- **When** the pharmacy application is online
- **Then** it performs a real-time check against the Hub API to verify the prescription status
- **And** the system prevents fulfillment if the status is "Fulfilled" or "Voided"
- **And** the pharmacist can mark the prescription as "Dispensed" (creating a `MedicationDispense` resource)

## Epic 4: Pharmacy Operations
Enable the pharmacist's fulfillment workflow.

### Story 4.1: Pharmacy Scan & Load
As a pharmacist, I want to scan a patient's QR code so that I can instantly view their prescribed medications.

**Acceptance Criteria:**
- **Given** the Pharmacy POS application
- **When** a patient's QR prescription is scanned
- **Then** the application verifies the cryptographic signature (Ed25519)
- **And** the medication list, dosages, and clinician details are displayed clearly

### Story 4.2: Medication Fulfillment & Labeling
As a pharmacist, I want to record exactly what I have dispensed so that the patient's record is accurate.

**Acceptance Criteria:**
- **Given** a loaded prescription
- **When** a pharmacist confirms fulfillment of a medication item
- **Then** a FHIR `MedicationDispense` resource is created
- **And** the pharmacist can enter mandatory Batch Number and Expiry Date information

### Story 4.3: Real-time Dispensing Sync
As a pharmacist, I want my dispensing actions to be synchronized immediately so that other pharmacies know the prescription is used.

**Acceptance Criteria:**
- **Given** a completed fulfillment action
- **When** the application is online
- **Then** a high-priority sync pulse is sent to the Hub API
- **And** the central `MedicationRequest` status is updated to `completed`
- **And** the pharmacist receives a "Sync Successful" visual confirmation

### Story 4.4: Pharmacy-Lite PWA Extraction
As a system architect, I want to extract all pharmacy fulfillment functionality from `opd-lite` into a standalone `pharmacy-lite` application, so that pharmacists have an independently deployable spoke app that integrates with the ecosystem exclusively via `hub-api`.

**Acceptance Criteria:**
- **Given** the existing pharmacy components in `opd-lite`
- **When** the extraction is complete
- **Then** `apps/pharmacy-lite/` exists as a standalone Next.js 15 PWA (`@ultranos/pharmacy-lite`)
- **And** all pharmacy fulfillment components, stores, services, and tests are located in the new app
- **And** clinician-side prescription components remain in `opd-lite` unchanged
- **And** the pharmacy app communicates with the Hub API via tRPC (no spoke-to-spoke dependencies)
- **And** all existing pharmacy tests pass in the new location with zero regressions in `opd-lite`

> **Architecture Decision (2026-04-30):** Pharmacy operations MUST be a standalone spoke app (`pharmacy-lite`), not embedded in the clinician PWA. Each spoke integrates via `hub-api` only. Online-only for now; offline pharmacy operations are a future enhancement.

## Epic 5: Patient Health Passport & Consent
Build the patient-facing "Patient Lite Mobile" experience.

### Story 5.1: Patient Profile & QR Identity
As a patient, I want to access my health passport so that I can show my medical ID to doctors.

**Acceptance Criteria:**
- **Given** an authenticated patient session
- **When** the "My Passport" screen is opened
- **Then** the patient's demographics (Name, Age, ID) are displayed clearly
- **And** a personal QR code for clinician scanning is visible
- **And** the screen functions offline once the initial profile is synced

### Story 5.2: Medical History Timeline (Low-Literacy UI)
As a patient, I want to see what medical care I have received so that I can stay informed about my health.

**Acceptance Criteria:**
- **Given** the patient dashboard
- **When** the "History" section is viewed
- **Then** a vertical timeline of all past encounters and prescriptions is displayed
- **And** large semantic icons (Pill, Stethoscope) are used to categorize events (NFR8)
- **And** current medications are highlighted in a dedicated "Active" section

### Story 5.3: Data Sharing Consent Management
As a patient, I want to grant or revoke access to my medical data so that I control my privacy.

**Acceptance Criteria:**
- **Given** the "Privacy Settings" screen
- **When** a patient toggles "Clinical Data Access"
- **Then** a FHIR `Consent` resource is generated
- **And** the Hub API is updated to enforce this preference for all future data requests

## Epic 6: Trust, Audit & Access
Finalize the ecosystem's administrative and compliance layer.

### Story 6.1: Role-Based Access Control (RBAC)
As a system administrator, I want to define user permissions so that only authorized clinical staff can access PHI.

**Acceptance Criteria:**
- **Given** an authenticated user
- **When** the Hub API receives a request
- **Then** the tRPC middleware verifies the user's role (CLINICIAN, PHARMACIST, PATIENT)
- **And** access is denied if the user lacks the required permission for the specific FHIR resource

## Epic 7: Security & Encryption Hardening
Harden the ecosystem against data theft and unauthorized access.

### Story 7.1: PWA Dexie Encryption (Key-in-Memory)
As a patient, I want my local clinical data to be encrypted in the browser so that it remains private even if the device is lost or shared.

**Acceptance Criteria:**
- **Given** the PWA application
- **When** data is written to Dexie
- **Then** it is encrypted using AES-256-GCM via the Web Crypto API
- **And** the encryption key resides only in RAM and is wiped on tab close or logout (AR8)

### Story 7.2: Mobile SQLCipher Migration
As a mobile clinician, I want my offline data to be stored in an encrypted database so that PHI is protected by hardware-backed security.

**Acceptance Criteria:**
- **Given** the Expo mobile application
- **When** the local SQLite database is initialized
- **Then** it uses SQLCipher with AES-256 encryption
- **And** the key is retrieved from the device's secure keystore/biometric vault (NFR3)

### Story 7.3: Hub API Field-Level Encryption
As a data steward, I want sensitive clinical notes to be encrypted at rest in the central database so that Hub administrators cannot read patient PHI in plaintext.

**Acceptance Criteria:**
- **Given** a write operation to Supabase
- **When** the field is marked as PHI (e.g., SOAP notes, diagnosis)
- **Then** the Hub API encrypts the value before persistence
- **And** only authorized clients can decrypt the value via the tRPC layer

### Story 7.4: Practitioner Key Lifecycle Management
As a security officer, I want practitioner public keys to have an expiration so that compromised or revoked keys cannot be used to forge prescriptions indefinitely.

**Acceptance Criteria:**
- **Given** a cached practitioner public key
- **When** the cache age exceeds the TTL (e.g., 24 hours)
- **Then** the client must re-verify the key status with the Hub API
- **And** revoked keys are immediately purged from the local trust store

## Epic 8: Compliance & Immutable Auditing
Ensure every clinical action is logged and verifiable.

### Story 8.1: Client-Side Audit Ledger
As a compliance officer, I want clinical actions to be logged even when offline so that we have a complete record of who accessed which PHI.

**Acceptance Criteria:**
- **Given** an offline clinical action (e.g., viewing a patient chart)
- **When** the action occurs
- **Then** an audit event is queued in the local append-only ledger
- **And** the event includes the user, timestamp, resource ID, and action type

### Story 8.2: Immutable Hash-Chained Audit Logging
As a regulatory auditor, I want the central audit trail to be tamper-proof so that I can verify the integrity of the medical record history.

**Acceptance Criteria:**
- **Given** a new audit log entry on the Hub
- **When** it is persisted
- **Then** its payload includes a SHA-256 hash of the previous log entry
- **And** any attempt to modify a past log entry breaks the chain validation (FR17)

## Epic 9: Sync Engine Integration & Resilience
Transition from local-first to a globally synchronized, conflict-aware ecosystem.

### Story 9.1: Tiered Conflict Resolution (HLC Integration)
As a system architect, I want conflict resolution to be aware of clinical safety so that important updates are never lost during synchronization.

**Acceptance Criteria:**
- **Given** a sync conflict
- **When** the resource is Tier 1 (Clinical), it uses Append-only resolution
- **When** the resource is Tier 2 (Operational), it uses semantic merge or Last-Write-Wins based on HLC timestamps (FR14, FR15)

### Story 9.2: Background Sync Worker & Retry Logic
As a clinician, I want my data to sync automatically in the background so that I don't have to manually trigger a refresh.

**Acceptance Criteria:**
- **Given** pending local changes
- **When** the device detects connectivity
- **Then** a background worker (Service Worker or Native Task) drains the sync queue
- **And** failing requests are retried with exponential backoff

### Story 9.3: Global Sync Dashboard
As a user, I want to see the detailed status of my background synchronization so that I know exactly which records are still pending.

**Acceptance Criteria:**
- **Given** the global sync pulse
- **When** clicked
- **Then** a dashboard displays a list of pending resources and their last attempted sync time

## Epic 10: Clinical Safety & Terminology
Upgrade decision support with full medication history and standardized terminology.

### Story 10.1: MedicationStatement & Cross-Medication Interaction Checks
As a clinician, I want to be warned of interactions against the patient's entire medication history so that I can ensure safety beyond the current visit.

**Acceptance Criteria:**
- **Given** a new prescription
- **When** checked for interactions
- **Then** it is compared against both `MedicationRequest` (pending) and `MedicationStatement` (active chronic meds) resources (FR7)

### Story 10.2: Global Allergy Management & High-Visibility Banners
As a clinician, I want patient allergies to be unavoidable in the UI so that I don't accidentally prescribe a contraindicated drug.

**Acceptance Criteria:**
- **Given** an active encounter
- **When** the patient has documented allergies
- **Then** a high-visibility red banner is displayed at the top of all clinical views and cannot be collapsed

### Story 10.3: Terminology Service Migration (Dexie Vocabulary)
As a system administrator, I want the formulary and ICD-10 search to be backed by a local database so that we can support thousands of records with zero latency.

**Acceptance Criteria:**
- **Given** a clinical search (medication or diagnosis)
- **When** typed
- **Then** results are queried from a dedicated Dexie vocabulary store
- **And** the store can be updated incrementally from the Hub API without a full reload

## Epic 11: Internationalization (RTL/i18n)
Provide multilingual RTL support for Arabic and Dari users across all spoke apps.

### Story 11.1: Global RTL & i18n Framework
As a multilingual user, I want the entire application to respect RTL rules so that I can work natively in Arabic or Dari.

**Acceptance Criteria:**
- **Given** the application
- **When** the locale is switched to Arabic/Dari
- **Then** the layout mirrors (RTL) and all physical CSS properties are replaced by logical ones (e.g., padding-inline-start) (FR18)

> **Priority Decision (2026-05-02):** RTL/i18n deferred to pre-deployment sprint. Not blocking for English-only development phase.

## Epic 13: Application Resilience & Error Recovery
Ensure all spoke apps recover gracefully from storage errors, network failures, and unexpected states without data loss.

### Story 13.1: React Error Boundaries & Safe Mode
As a user, I want the application to recover gracefully from storage errors so that I never lose data due to a browser quota issue.

**Acceptance Criteria:**
- **Given** a local storage error (e.g., IndexedDB failure, quota exceeded)
- **When** it occurs
- **Then** a React Error Boundary catches the crash and offers a "Safe Mode" recovery path
- **And** critical data is backed up to memory until storage is restored
- **And** a "Stale Data" yellow banner warns the user when operating on potentially outdated information

## Epic 12: Lab Diagnostics & Reporting
Enable the lab technician's result upload workflow via the standalone `lab-lite` spoke app, with strict data minimization enforcement.
**FRs covered:** LAB-001, LAB-002, LAB-010, LAB-011, LAB-020, LAB-021, LAB-022, LAB-023, LAB-024

### Story 12.1: Lab Credentialing & Technician Authentication
As a lab technician, I want to register my lab and authenticate with my credentials, so that I can upload results tied to my verified identity and lab affiliation.

**Acceptance Criteria:**
- **Given** a lab technician
- **When** they authenticate via Supabase Auth
- **Then** TOTP MFA is enforced
- **And** the session includes technician ID and lab affiliation
- **And** only technicians with `ACTIVE` lab status can access upload workflows

### Story 12.2: Restricted Patient Verification
As a lab technician, I want to verify patient identity before uploading results, so that I can confirm I'm attaching results to the correct patient without seeing their medical history.

**Acceptance Criteria:**
- **Given** a patient identifier (National ID or QR scan)
- **When** the `lab.verifyPatient` endpoint is called
- **Then** the response returns **only** `{ firstName, age, patientRef }` — no other patient data
- **And** the data minimization is enforced at the SQL query level, tRPC output schema, and RBAC middleware (three-layer defense)
- **And** `patientRef` is an opaque reference (HMAC-SHA256) — not the raw patient ID

> **Architecture Decision (2026-04-30):** Lab data minimization is enforced at THREE levels: SQL SELECT, tRPC Zod output schema, and RBAC middleware. If any one layer fails, the other two still protect the data. See CLAUDE.md Rule #7.

### Story 12.3: Result Upload & Metadata Tagging
As a lab technician, I want to upload lab result files and tag them with test metadata, so that the results are stored as FHIR DiagnosticReport resources and linked to the correct patient.

**Acceptance Criteria:**
- **Given** a verified patient context
- **When** a lab result file (PDF, JPEG, PNG; max 20 MB) is uploaded with test category and collection date
- **Then** a FHIR `DiagnosticReport` resource is created with status `preliminary`
- **And** the test category is mapped to a LOINC code
- **And** the file is stored encrypted at rest (AES-256-GCM)
- **And** a server-side virus scan is performed before storage

### Story 12.4: Notification Dispatch
As a lab technician, I want the ordering doctor and patient to be notified automatically when I upload a result, so that they can review the findings promptly.

**Acceptance Criteria:**
- **Given** a successful upload commit
- **When** the Hub processes the upload
- **Then** the ordering doctor is notified in OPD Lite within 60 seconds
- **And** the patient is notified in Patient Lite Mobile
- **And** notifications are queued if the recipient is offline
- **And** critical results unacknowledged after 24 hours trigger escalation

### Story 12.5: Upload Queue & Offline Resilience
As a lab technician, I want my uploads to be preserved locally if the connection drops, so that I don't lose work and can resume when connectivity returns.

**Acceptance Criteria:**
- **Given** a connection drop during upload
- **When** the file and metadata are preserved locally
- **Then** the upload queue holds up to 50 pending items
- **And** the queue survives browser refresh
- **And** items drain automatically on connectivity restore
- **And** items older than 48 hours require manual re-upload

### Story 12.6: AI Metadata Extraction (OCR)
As a lab technician, I want the system to auto-suggest metadata from uploaded documents, so that I can tag results faster with fewer manual errors.

**Acceptance Criteria:**
- **Given** an uploaded file
- **When** Cloud Vision OCR analyzes the document
- **Then** metadata fields are pre-populated with confidence indicators
- **And** fields below 85% confidence are left blank for manual entry
- **And** the technician must explicitly confirm all metadata before commit
- **And** if OCR is unavailable, the form falls back to fully manual entry

## New Epics (Gap Analysis Addendum — 2026-05-02)

### New Epic List

### Epic 14: Spoke App Authentication & App Shell
Enable clinicians, pharmacists, and lab technicians to securely sign in, manage sessions, and navigate all PWA spoke apps with a consistent global app shell.
**FRs covered:** FR19, FR28
**NFRs covered:** NFR9, NFR10

### Epic 15: PWA Infrastructure & Installability
Make all three PWA spoke apps installable, offline-capable for static assets, and push-notification-ready via Service Workers and Web App Manifests.
**FRs covered:** FR20

### Epic 16: Hub API Clinical Lifecycle Endpoints
Enable the Hub to persist, retrieve, and manage encounters, patients, prescriptions, and dispensing idempotency so that spoke apps can sync clinical data end-to-end.
**FRs covered:** FR21, FR22, FR23
**Gap coverage:** PH-G07 (duplicate-dispensing guard)

### Epic 17: Lab Lite — Complete UI/UX
Deliver a fully modern, intuitive lab technician experience with a post-login dashboard, step-by-step upload workflow, results queue, upload history, in-app notifications, and session management.
**FRs covered:** FR24
**Gap coverage:** LAB-G01, LAB-G02, LAB-G03, LAB-G05, LAB-G08, LAB-G09

### Epic 18: Patient Lite Mobile — Complete UI/UX
Deliver a fully modern, intuitive patient Health Passport experience with tab navigation, a visually rich home dashboard, language onboarding gateway, allergy display, notification center, guardian management, and polished low-literacy design.
**FRs covered:** FR25, FR31
**Consumer of:** Epic 25 (ECDSA-P256 crypto capability)
**Gap coverage:** PT-G01, PT-G02, PT-G04, PT-G05, PT-G06, PT-G07, PT-G08, PT-G09, PT-G10, PT-G11, PT-G13

### Epic 19: Sync Queue Reliability & Offline Resilience
Ensure all queued sync operations actually reach the Hub with reliable drain workers, retry logic, queue size limits, and an offline dispensing path for pharmacists.
**FRs covered:** FR26
**NFRs covered:** NFR11
**Gap coverage:** PH-G03, PH-G06, PT-G03, XC-17, XC-18

### Epic 20: OPD Lite — Complete UI/UX
Deliver a fully modern, intuitive clinician experience with a post-login clinical dashboard, encounter history, complete SOAP charting, conflict resolution interface, lab results viewer, full notification center, and polished navigation.
**FRs covered:** FR27
**Gap coverage:** OPD-G03, OPD-G05, OPD-G07, OPD-G08, OPD-G13, OPD-G14, OPD-G15, OPD-G18

### Epic 21: API Security Hardening
Protect all Hub API endpoints with global rate limiting, QR signature verification, consent authorization enforcement, security headers, and identity trust fixes.
**FRs covered:** FR30
**NFRs covered:** NFR13, NFR14

### Epic 22: Back-Office Administration & Provider Lifecycle
Enable back-office staff to verify KYC submissions, approve/suspend providers and labs, monitor license expiry, and review prescribing anomaly alerts.
**FRs covered:** FR29

### Epic 23: Monitoring, Alerting & Observability
Provide operational visibility into clinical safety metrics, sync queue health, error rates, and audit chain integrity with automated alerting.
**FRs covered:** FR32

### Epic 24: AI Clinical Intelligence
Augment clinician workflows with AI-powered SOAP note parsing, empathy-driven prescription translation/TTS, paper prescription OCR, and edge model management.
**FRs covered:** FR33

### Epic 25: Shared Package Completeness
Fill the missing shared infrastructure: create the `drug-db` package, add DiagnosticReport and MedicationDispense FHIR types, implement mobile ECDSA-P256 in `@ultranos/crypto`, and enforce drug database staleness checks.
**FRs covered:** FR34
**NFRs covered:** NFR12
**Phase:** 1 (Sprint 0 — must land before UI epics 17, 18, 20, 26 that consume these packages)

### Epic 26: Pharmacy Lite — Complete UI/UX
Deliver a fully modern, intuitive pharmacist experience with a post-login dispensing dashboard, prescription queue, dispensing history, sync queue visualization, and labeling/printing workflow.
**FRs covered:** FR9 (extension)
**Gap coverage:** PH-G02, PH-G08, PH-G10

## Epic 14: Spoke App Authentication & App Shell
Enable clinicians, pharmacists, and lab technicians to securely sign in, manage sessions, and navigate all PWA spoke apps with a consistent global app shell.

### Story 14.1: OPD Lite Supabase Auth Login Page
As a clinician, I want to sign in to OPD Lite with my credentials and TOTP MFA, so that my session is authenticated before I access patient data.

**Acceptance Criteria:**
- **Given** the OPD Lite PWA login page
- **When** a clinician enters email and password
- **Then** the credentials are validated via Supabase Auth `signInWithPassword`
- **And** TOTP MFA challenge is presented and must be verified before session is granted
- **And** on success, the auth session store is populated with userId, practitionerId, role, sessionId
- **And** the JWT access token is stored in memory only (never localStorage)
- **And** the clinician is redirected to the clinical dashboard
- **And** login failures display a generic error message (no PHI, no credential enumeration)
- **And** audit events are emitted for LOGIN_SUCCESS and LOGIN_FAILURE

### Story 14.2: Pharmacy Lite Supabase Auth Login Page
As a pharmacist, I want to sign in to Pharmacy Lite with my credentials and TOTP MFA, so that my session is authenticated before I access prescription data.

**Acceptance Criteria:**
- **Given** the Pharmacy Lite PWA login page
- **When** a pharmacist enters email and password
- **Then** the credentials are validated via Supabase Auth `signInWithPassword`
- **And** TOTP MFA challenge is presented and verified
- **And** on success, an auth session store is created with userId, practitionerId, role=PHARMACIST, sessionId
- **And** the JWT access token is stored in memory only
- **And** the pharmacist is redirected to the dispensing dashboard
- **And** the `authToken` prop pattern is replaced with session store integration across all Hub API calls
- **And** audit events are emitted for LOGIN_SUCCESS and LOGIN_FAILURE

### Story 14.3: Shared Session Management Hook & Re-Auth Modal
As a developer, I want a shared `useSessionManager` hook and re-auth modal component in `@ultranos/ui-kit`, so that all spoke apps enforce session duration and inactivity timeout consistently.

**Acceptance Criteria:**
- **Given** `packages/ui-kit/`
- **When** the hook and modal are created
- **Then** `useSessionManager({ maxDurationMs, inactivityMs, onExpired, onReAuth })` is exported
- **And** it tracks mouse movement, key press, and touch events to reset the inactivity timer
- **And** it shows a "Session expiring in 5 minutes" warning toast before timeout
- **And** it renders a re-authentication modal requiring password re-entry when inactivity threshold is reached
- **And** `onExpired` callback fires when max session duration is reached (clears auth state, redirects to login)
- **And** role-specific durations are configurable: 8h CLINICIAN/DOCTOR, 12h PHARMACIST, 4h ADMIN
- **And** the hook clears PHI state (Zustand stores + encryption key wipe) on forced logout

### Story 14.3a: OPD Lite Session Timeout Integration
As a clinician, I want my OPD Lite session to timeout after inactivity, so that unattended workstations are protected.

**Acceptance Criteria:**
- **Given** an authenticated OPD Lite session
- **When** 30 minutes of inactivity elapses on a clinical view
- **Then** the re-auth modal from `useSessionManager` is shown
- **And** session max duration is set to 8 hours for CLINICIAN/DOCTOR role
- **And** forced logout clears all Zustand stores and wipes the Dexie encryption key

### Story 14.3b: Pharmacy Lite Session Timeout Integration
As a pharmacist, I want my Pharmacy Lite session to timeout after inactivity, so that the dispensing workstation is protected.

**Acceptance Criteria:**
- **Given** an authenticated Pharmacy Lite session
- **When** 30 minutes of inactivity elapses
- **Then** the re-auth modal from `useSessionManager` is shown
- **And** session max duration is set to 12 hours for PHARMACIST role

### Story 14.3c: Lab Lite Session Timeout Integration
As a lab technician, I want my Lab Lite session to timeout after inactivity, so that the upload workstation is protected.

**Acceptance Criteria:**
- **Given** an authenticated Lab Lite session
- **When** 30 minutes of inactivity elapses
- **Then** the re-auth modal from `useSessionManager` is shown
- **And** session max duration is set to 8 hours for LAB_TECH role

### Story 14.4: Shared AppShell Component in ui-kit
As a developer, I want a shared `<AppShell>` component in `@ultranos/ui-kit`, so that all PWA spoke apps have a consistent navigation bar with configurable routes.

**Acceptance Criteria:**
- **Given** `packages/ui-kit/`
- **When** the `<AppShell>` component is created
- **Then** it renders a persistent navbar with slots for:
  - App name/logo (left, configurable via props)
  - Navigation links (center, configurable via `navItems` prop)
  - SyncPulse indicator slot (right)
  - NotificationBell slot (right)
  - User avatar/initials with dropdown menu (right, configurable via `user` prop)
- **And** the user dropdown contains: user name, role badge, "Settings" link, and "Sign Out" button
- **And** "Sign Out" fires an `onSignOut` callback prop (app handles auth/PHI cleanup)
- **And** the navbar is responsive, accessible (keyboard navigable, proper ARIA labels), and uses `@ultranos/ui-kit` design tokens
- **And** the component is unit-tested with snapshot tests

### Story 14.5: Route Protection Middleware
As a security officer, I want all clinical routes to be protected by authentication checks, so that unauthenticated users cannot access any PHI-bearing pages.

**Acceptance Criteria:**
- **Given** an unauthenticated user or expired session
- **When** they attempt to navigate to any route other than `/login`
- **Then** they are redirected to the login page with a `returnUrl` parameter
- **And** after successful login, they are redirected back to the original requested route
- **And** this middleware is applied as a layout-level wrapper in all three PWA apps
- **And** the login page itself is accessible without authentication

### Story 14.6: OPD Lite Practitioner Reference Replacement
As a clinician, I want my authenticated identity to be used as the practitioner reference on all clinical resources I create, so that attribution is accurate and auditable.

**Acceptance Criteria:**
- **Given** an authenticated clinician session with a known practitionerId
- **When** any FHIR resource is created (Encounter, Observation, Condition, MedicationRequest, ClinicalImpression, AllergyIntolerance)
- **Then** the `participant.individual` or `recorder` or `requester` reference uses the session's `practitionerId` instead of the hardcoded `Practitioner/current-user` placeholder
- **And** all existing references to `Practitioner/current-user` across OPD Lite stores and components are replaced
- **And** the encounter-dashboard, prescription-store, diagnosis-store, allergy-store, soap-note-store, and vitals-store all read practitionerId from the auth session store

### Story 14.6a: Pharmacy Lite Identity Trust Fix
As a pharmacist, I want my dispensing records to use my server-verified identity, so that attribution cannot be forged by client-side manipulation.

**Acceptance Criteria:**
- **Given** an authenticated pharmacist session in Pharmacy Lite
- **When** `medication.recordDispense` is called
- **Then** the `pharmacistRef` in the request payload uses the authenticated user's ID from the session store
- **And** the fulfillment-store no longer accepts `pharmacistRef` as client-supplied input

## Epic 15: PWA Infrastructure & Installability
Make all three PWA spoke apps installable, offline-capable for static assets, and push-notification-ready via Service Workers and Web App Manifests.

### Story 15.1: OPD Lite PWA Manifest & Service Worker
As a clinician, I want to install OPD Lite on my workstation as a standalone app with offline asset caching, so that the application loads instantly and survives brief connectivity drops.

**Acceptance Criteria:**
- **Given** the OPD Lite PWA
- **When** the user visits the app over HTTPS
- **Then** a valid `manifest.json` is served with: name, short_name, description, start_url, display=standalone, theme_color, background_color, and icons (192px, 512px)
- **And** a Service Worker registers and caches the App Shell (HTML, JS, CSS, fonts) using a cache-first strategy
- **And** API calls use a network-first strategy with stale-while-revalidate fallback
- **And** the Inter font is self-hosted (not CDN) so it works offline on first load
- **And** after 2 minutes of first visit, the browser install prompt is triggered (or a custom "Install App" banner is shown)
- **And** the app can be launched from the OS desktop/taskbar in standalone mode

### Story 15.2: Pharmacy Lite PWA Manifest & Service Worker
As a pharmacist, I want to install Pharmacy Lite as a standalone app on my workstation, so that it is always available and loads instantly.

**Acceptance Criteria:**
- **Given** the Pharmacy Lite PWA
- **When** the user visits the app over HTTPS
- **Then** a valid `manifest.json` is served with Pharmacy Lite branding, icons, and standalone display
- **And** a Service Worker registers with cache-first for App Shell assets and network-first for API calls
- **And** the Inter font is self-hosted
- **And** the install prompt or custom banner appears after 2 minutes
- **And** the Service Worker handles version updates gracefully (notifies user of new version, allows activation)

### Story 15.3: Lab Lite PWA Manifest & Service Worker
As a lab technician, I want to install Lab Lite as a standalone app, so that it is always available for uploading results even when connectivity is intermittent.

**Acceptance Criteria:**
- **Given** the Lab Lite PWA
- **When** the user visits the app over HTTPS
- **Then** a valid `manifest.json` is served with Lab Lite branding, icons, and standalone display
- **And** a Service Worker registers with cache-first for App Shell assets
- **And** the upload queue's IndexedDB operations are not disrupted by Service Worker lifecycle events
- **And** the Inter font is self-hosted
- **And** an offline fallback page is served when the network is down and no cached page matches the route

## Epic 16: Hub API Clinical Lifecycle Endpoints
Enable the Hub to persist, retrieve, and manage encounters, patients, prescriptions, and dispensing idempotency so that spoke apps can sync clinical data end-to-end.

### Story 16.1: Encounter CRUD Endpoints
As a clinician, I want my encounters to be persisted and retrievable from the Hub, so that my clinical records sync across devices and are not lost to local-only storage.

**Acceptance Criteria:**
- **Given** an authenticated clinician
- **When** `encounter.create` is called with a FHIR Encounter resource
- **Then** the encounter is persisted to the `encounters` table with field-level encryption on PHI fields via `db.toRow()`
- **And** `encounter.read(id)` returns a single encounter with decrypted fields, enforcing `enforceResourceAccess('Encounter')` and `enforceConsentMiddleware('Encounter')`
- **And** `encounter.update(id)` updates the encounter with HLC conflict detection (newer HLC wins)
- **And** `encounter.close(id)` transitions status to `finished` and sets `period.end`
- **And** `encounter.listByPatient(patientId)` returns all encounters for a patient, ordered by `period.start` descending
- **And** every operation emits an audit event via `@ultranos/audit-logger`

### Story 16.2: Patient CRUD Endpoints
As a system administrator, I want the Hub to support patient creation and management, so that new patients can be registered and existing records maintained.

**Acceptance Criteria:**
- **Given** an authenticated user with Patient resource access
- **When** `patient.create` is called with a FHIR Patient resource
- **Then** the patient is persisted with field-level encryption on PHI fields
- **And** a blind index is generated for the national ID (HMAC-SHA256)
- **And** `patient.read(id)` returns a single patient with decrypted fields and consent enforcement
- **And** `patient.update(id)` updates demographics with HLC conflict detection
- **And** every operation emits an audit event
- **And** duplicate national ID detection is enforced at the blind index level (unique constraint)

### Story 16.3: Medication Create & Prescription Lifecycle
As a clinician, I want to create prescriptions via the Hub API, so that prescription records are centrally managed and globally verifiable.

**Acceptance Criteria:**
- **Given** an authenticated clinician with MedicationRequest resource access
- **When** `medication.create` is called with a FHIR MedicationRequest
- **Then** the prescription is persisted with field-level encryption on dosage_instruction, medication_text, and interaction_override fields
- **And** the prescription status is set to `active` with a unique `qr_code_id` generated for global lookup
- **And** RBAC middleware enforces that only CLINICIAN/DOCTOR roles can create prescriptions
- **And** `medication.read(id)` returns a single prescription with decrypted fields
- **And** every operation emits an audit event

### Story 16.4: Dispensing Idempotency Guard
As a pharmacist, I want the Hub to prevent duplicate dispensing of the same prescription, so that patients are protected from double-dosing and fraud.

**Acceptance Criteria:**
- **Given** an existing `medication_dispense` record for a prescription ID
- **When** `medication.recordDispense` is called again for the same prescription
- **Then** the server checks for existing dispense records before inserting
- **And** if a completed dispense already exists, the request is rejected with a clear error code `ALREADY_DISPENSED`
- **And** the duplicate attempt is logged as an audit event with action `DUPLICATE_DISPENSE_ATTEMPT`
- **And** the prescription validation step is moved BEFORE the insert to prevent orphan records (fixing the pre-existing insert-before-validate bug)

### Story 16.5: SOAP Note Sync Endpoints
As a clinician, I want my SOAP notes to be persisted to the Hub, so that clinical documentation is centrally available and not trapped in browser-local storage.

**Acceptance Criteria:**
- **Given** an authenticated clinician with ClinicalImpression resource access
- **When** `encounter.addSOAPNote` is called with subjective, objective, assessment, and plan text linked to an encounter
- **Then** the note is persisted to the `soap_ledger` table with field-level encryption on all clinical text fields
- **And** `encounter.listSOAPNotes(encounterId)` returns the ledger history ordered by HLC timestamp
- **And** append-only semantics are enforced — SOAP entries are never updated, only new entries appended
- **And** every operation emits an audit event

### Story 16.6: Hub API Drug Interaction Check Endpoint
As a clinician, I want the Hub to provide a server-side drug interaction check, so that interaction safety is verified centrally and not only on the client.

**Acceptance Criteria:**
- **Given** an authenticated clinician
- **When** `medication.checkInteractions` is called with a new medication code and a patient ID
- **Then** the Hub queries the patient's active MedicationStatements and pending MedicationRequests
- **And** the interaction check runs against `@ultranos/drug-db` (Epic 25) using the Hub's interaction database
- **And** the response returns a list of interactions with severity (CONTRAINDICATED, ALLERGY_MATCH, MAJOR, MODERATE, MINOR, NONE) and the interacting medication name
- **And** if the database is stale (>45 days), the response returns `UNAVAILABLE` with reason `DATABASE_STALE`
- **And** the check result is logged as an audit event
- **And** RBAC middleware enforces MedicationRequest resource access

### Story 16.7: Practitioner Key Registration Endpoint
As a clinician, I want to register my Ed25519 public key with the Hub, so that pharmacies can verify my prescription signatures.

**Acceptance Criteria:**
- **Given** an authenticated clinician or system administrator
- **When** `practitionerKey.register` is called with a public key (Ed25519 base64), practitioner ID, and optional expiry date
- **Then** the key is persisted to the `practitioner_keys` table with status `active`
- **And** duplicate key registration (same public key) is rejected with a clear error
- **And** the default expiry is 1 year from registration if not specified
- **And** only CLINICIAN, DOCTOR, or ADMIN roles can register keys
- **And** the registration is logged as an audit event

### Story 16.8: DiagnosticReport Read & List Endpoints
As a clinician, I want to retrieve lab results from the Hub, so that I can view diagnostic reports in OPD Lite and lab technicians can see their upload history.

**Acceptance Criteria:**
- **Given** an authenticated user with DiagnosticReport resource access
- **When** `diagnosticReport.read(id)` is called
- **Then** a single DiagnosticReport is returned with decrypted fields, enforcing `enforceResourceAccess('DiagnosticReport')` and `enforceConsentMiddleware('DiagnosticReport')`
- **And** `diagnosticReport.listByPatient(patientId)` returns all reports for a patient, ordered by `effectiveDateTime` descending
- **And** `diagnosticReport.listByLab(labId)` returns all reports uploaded by a specific lab (for lab technician history views)
- **And** every operation emits an audit event via `@ultranos/audit-logger`
- **And** the associated file content is returned as a download URL (not inline base64) to avoid memory pressure

## Epic 17: Lab Lite — Complete UI/UX
Deliver a fully modern, intuitive lab technician experience with a post-login dashboard, step-by-step upload workflow, results queue, upload history, in-app notifications, and session management.

### Story 17.1: Lab Dashboard Home Page
As a lab technician, I want to see a dashboard after login showing my lab's activity at a glance, so that I can quickly understand what needs my attention.

**Acceptance Criteria:**
- **Given** an authenticated lab technician
- **When** they arrive at the `/` route (replacing the "Coming Soon" placeholder)
- **Then** the dashboard displays:
  - Lab name and technician identity card
  - Upload queue status card: pending count, uploading count, expired count
  - Today's activity summary: uploads completed today, results pending review
  - Quick action button: "Upload New Result" (navigates to upload workflow)
  - Recent uploads list (last 10) with status badges (success/pending/failed)
- **And** the dashboard auto-refreshes every 60 seconds
- **And** the layout is responsive and uses `@ultranos/ui-kit` design tokens

### Story 17.2: Upload Workflow Orchestrator Page
As a lab technician, I want a guided step-by-step upload process, so that I can efficiently verify the patient, upload the file, tag metadata, and submit without confusion.

**Acceptance Criteria:**
- **Given** the technician navigates to `/upload` (from the dashboard quick action)
- **When** the page loads
- **Then** a multi-step wizard is rendered with progress indicator showing: Step 1 (Verify Patient) → Step 2 (Upload File) → Step 3 (Tag Metadata) → Step 4 (Review & Submit)
- **And** Step 1 renders `PatientVerifyForm` and `PatientVerifyScanner` with choice between manual ID entry and QR scan
- **And** Step 2 renders `ResultUpload` only after patient verification succeeds, carrying the `patientRef` forward
- **And** Step 3 renders `MetadataForm` with OCR auto-suggestions (if available) and LOINC category selector
- **And** Step 4 renders a summary of all inputs (patient name, test category, file preview, collection date) with a "Confirm & Submit" button
- **And** the wizard prevents skipping steps and allows going back without data loss
- **And** on successful submit, the technician is redirected to the dashboard with a success toast

### Story 17.3: Results Queue & Upload History Page
As a lab technician, I want to view all my uploads and their processing status, so that I can track pending items and re-upload expired ones.

**Acceptance Criteria:**
- **Given** an authenticated lab technician navigating to `/history`
- **When** the page loads
- **Then** a filterable list of all upload queue entries is displayed with: patient name, test category, upload date, status (pending/uploading/completed/expired/failed)
- **And** status badges are color-coded (green=completed, yellow=pending, red=failed, gray=expired)
- **And** expired items show a "Re-upload" button that pre-fills the upload wizard with the same metadata
- **And** failed items show the failure reason (generic, never PHI)
- **And** a search bar allows filtering by patient name or test category
- **And** pagination is used if >20 items exist

### Story 17.4: Lab Lite In-App Notification Center
As a lab technician, I want to see system notifications within the app, so that I know about upload confirmations, processing results, and system alerts.

**Acceptance Criteria:**
- **Given** the Lab Lite navbar
- **When** the NotificationBell icon is clicked
- **Then** a notification panel opens showing recent notifications ordered newest-first
- **And** notification types include: UPLOAD_CONFIRMED, UPLOAD_FAILED, SYSTEM_MAINTENANCE, LAB_STATUS_CHANGE
- **And** unread notifications show a distinct visual indicator
- **And** clicking a notification marks it as acknowledged via `notification.acknowledge()` on the Hub API
- **And** the bell icon shows an unread count badge that polls every 30 seconds

### Story 17.5: Lab Lite Audit Logger Migration
As a compliance officer, I want Lab Lite to use the canonical `@ultranos/audit-logger` for all audit events, so that audit integrity is maintained with SHA-256 hash chaining.

**Acceptance Criteria:**
- **Given** Lab Lite's existing raw `fetch`-based audit reporting
- **When** the migration is complete
- **Then** all auth audit events (LOGIN_SUCCESS, LOGIN_FAILURE, MFA_VERIFY_SUCCESS, MFA_VERIFY_FAILURE) use `@ultranos/audit-logger/client`
- **And** all queue audit events (QUEUE_ENTRY_CREATED, QUEUE_DRAIN_SUCCESS, QUEUE_ITEM_EXPIRED, QUEUE_ITEM_DISCARDED) use `@ultranos/audit-logger/client`
- **And** the `AuditDrainWorker` from `@ultranos/audit-logger` replaces the raw fetch pattern for syncing events to the Hub
- **And** failed audit events are persisted locally in IndexedDB for retry (never silently dropped)

## Epic 18: Patient Lite Mobile — Complete UI/UX
Deliver a fully modern, intuitive patient Health Passport experience with tab navigation, home dashboard, language onboarding, allergy display, notification center, and polished low-literacy design.

### Story 18.1: Tab Navigation & Screen Routing
As a patient, I want to navigate between my Health Passport screens using a bottom tab bar, so that I can access my profile, timeline, privacy settings, and notifications easily.

**Acceptance Criteria:**
- **Given** the Patient Lite Mobile app
- **When** the app loads after successful authentication/unlock
- **Then** a bottom tab navigator renders with 4 tabs: Home (profile + QR), Timeline, Privacy, Notifications
- **And** each tab navigates to its respective screen with smooth transitions
- **And** the active tab is visually highlighted
- **And** the tab bar uses bottom-anchored placement for single-handed mobile interaction (UX-DR6)
- **And** tab icons are large (≥44px touch target) semantic emoji icons consistent with the consumer theme

### Story 18.2: OTP Authentication & Login Screen
As a patient, I want to verify my identity via SMS/WhatsApp OTP, so that I can securely access my Health Passport without needing a password.

**Acceptance Criteria:**
- **Given** the Patient Lite Mobile app on first launch or after session expiry
- **When** the patient enters their phone number
- **Then** an OTP is sent via SMS or WhatsApp (Supabase Auth phone provider)
- **And** the patient enters the OTP code to verify
- **And** on success, the patient session is established (90-day duration per PRD Section 10.1)
- **And** the biometric unlock is configured during first login for subsequent access
- **And** the patient is directed to the language onboarding gateway on first login, then to the home dashboard on subsequent logins

### Story 18.3: Language Onboarding Gateway
As a patient, I want to choose my language on first use through a visual full-screen gateway, so that I can use the app in my preferred language without needing to read text.

**Acceptance Criteria:**
- **Given** a first-time authenticated patient
- **When** the language gateway screen loads
- **Then** a full-screen visual selector displays available languages (English, العربية, دری) in native script with national flag icons
- **And** tapping a language plays a warm audio greeting in that language
- **And** no text literacy is required — the selection is icon-first and audio-assisted
- **And** the selected language is persisted to the patient's profile and controls the app's locale going forward
- **And** the gateway only appears on first login; subsequent logins skip to the dashboard

### Story 18.4: Patient Home Dashboard
As a patient, I want to see a summary of my health information on a home screen, so that I can quickly understand my medical status and show my QR ID to doctors.

**Acceptance Criteria:**
- **Given** an authenticated patient on the Home tab
- **When** the screen loads
- **Then** the dashboard displays:
  - Health summary card: name, age, gender, with avatar/initials
  - Medical ID QR code (prominent, scannable, with validity indicator)
  - Active medications count with "View" link to timeline
  - Active allergies shown in a red prominent section at the top (CLAUDE.md rule #4) — never collapsed, never behind a tab
  - Recent activity: last encounter date, last prescription date
  - Notification badge if unread notifications exist
- **And** the QR code includes ECDSA-P256 signature when available (shows "Verified" badge) or "Unverified" badge when crypto is pending
- **And** tapping the QR enlarges it for easy scanning

### Story 18.5: Allergy Display Integration
As a patient, I want to see my allergies prominently in the app, so that I can inform healthcare providers about my allergies and stay safe.

**Acceptance Criteria:**
- **Given** a patient with documented allergies
- **When** the Home dashboard or Timeline screen loads
- **Then** allergies are fetched from the local SQLCipher database (synced from Hub)
- **And** on the Home dashboard, a red allergy banner displays at the top listing all active allergy substances — never collapsed, never behind a tab, renders first in DOM
- **And** on the Timeline screen, allergy entries appear as timeline items with a red warning icon and the substance name
- **And** if no allergy data exists, a gray "No Known Allergies" indicator is shown
- **And** allergy data is included in the FHIR R4 Bundle export

### Story 18.6: Patient Notification Center
As a patient, I want to receive and view notifications about lab results, prescriptions, and consent changes, so that I stay informed about my healthcare.

**Acceptance Criteria:**
- **Given** the Notifications tab
- **When** the screen loads
- **Then** notifications are fetched from the Hub API via `notification.list()` and displayed newest-first
- **And** notification types are visually distinct: LAB_RESULT_AVAILABLE (blue), LAB_RESULT_ESCALATION (red urgent), PRESCRIPTION_READY (green), CONSENT_CHANGE (purple)
- **And** unread notifications have a bold/highlighted treatment
- **And** tapping a notification marks it as acknowledged and shows detail content
- **And** escalation notifications (LAB_RESULT_ESCALATION) have a red border and "Urgent" label
- **And** polling occurs every 30 seconds when the Notifications tab is active

### Story 18.7: Guardian Linking & Consent Delegation
As a guardian, I want to link to a patient's account and manage consent on their behalf, so that I can oversee my dependent's healthcare data.

**Acceptance Criteria:**
- **Given** the Privacy Settings screen
- **When** a patient with guardian status taps "Link Guardian"
- **Then** a flow is presented to enter the guardian's phone number and verify via OTP
- **And** the guardian's account is linked with `GrantorRole.GUARDIAN` on all consent records they create
- **And** all guardian actions are logged with `GUARDIAN_ACTION` audit tag
- **And** the linked patient receives notification when a guardian is linked
- **And** the guardian can toggle consent categories on the patient's behalf

### Story 18.8: FHIR R4 Bundle Export
As a patient, I want to export my complete medical record as a FHIR R4 Bundle, so that I can share my data with other healthcare providers or keep my own copy.

**Acceptance Criteria:**
- **Given** the Profile screen
- **When** the patient taps "Export My Records"
- **Then** a FHIR R4 Bundle JSON is generated containing: Patient resource, all Encounters, all MedicationRequests, all MedicationStatements, all AllergyIntolerances, all Observations, all Conditions, and all Consent records
- **And** the bundle is downloadable as a `.json` file via the device's share sheet
- **And** the export operation is logged as an audit event
- **And** a loading indicator is shown during generation (may be slow for large histories)

### Story 18.9: Sensitive Medication Privacy Flagging
As a patient, I want sensitive medications (antiretrovirals, psychiatric drugs) to be hidden behind a privacy gate, so that my screen is safe to show to others without exposing stigmatized conditions.

**Acceptance Criteria:**
- **Given** a patient's medication timeline
- **When** a medication belongs to a sensitive category (HIV/antiretrovirals: ATC J05A*, psychiatric: ATC N05/N06)
- **Then** it is displayed as "Private Health Matter" with a lock icon instead of the medication name
- **And** tapping the item reveals the full name behind a biometric confirmation prompt
- **And** revealing a sensitive medication emits an audit event with action `PHI_UNMASK`
- **And** the `isSensitive` flag in `humanizeMedication` is correctly populated based on medication code classification

### Story 18.10: React Error Boundaries
As a patient, I want the app to recover gracefully from errors, so that I never see a blank white screen when something goes wrong.

**Acceptance Criteria:**
- **Given** the Patient Lite Mobile app
- **When** an unhandled error occurs in any screen
- **Then** a React Error Boundary catches the crash and displays a recovery screen with "Tap to Retry" and "Report Issue" options
- **And** the error message is sanitized (no PHI exposed)
- **And** Error Boundaries wrap each tab screen independently (a crash in Timeline doesn't take down Profile)
- **And** the recovery screen uses the consumer theme styling and is low-literacy friendly (icon-led, minimal text)

### Story 18.11: Dark Mode & Theme Toggle
As a patient, I want a dark mode option, so that I can use the app comfortably in low-light environments.

**Acceptance Criteria:**
- **Given** the Profile screen settings section
- **When** the patient toggles the dark mode switch
- **Then** the entire app switches to a dark color scheme using HSL variants of the consumer theme colors
- **And** contrast ratios meet WCAG AA minimum
- **And** the dark mode preference persists across app restarts (stored in device local preferences)
- **And** the toggle respects the system-level dark mode setting as default on first use

## Epic 19: Sync Queue Reliability & Offline Resilience
Ensure all queued sync operations actually reach the Hub with reliable drain workers, retry logic, queue size limits, and an offline dispensing path for pharmacists.

### Story 19.1: Pharmacy Lite Sync Drain Worker
As a pharmacist, I want my queued dispensing records to automatically sync to the Hub when connectivity returns, so that I don't have to manually retry failed operations.

**Acceptance Criteria:**
- **Given** pending entries in the Pharmacy Lite `syncQueue` Dexie table
- **When** the device comes online (via `online` event) or every 30 seconds while online
- **Then** a drain worker reads pending entries ordered by priority and attempts to push them to the Hub API
- **And** successful syncs are marked as `synced` and removed after confirmation
- **And** failed syncs increment `retryCount` with exponential backoff (5s → 15s → 45s → 2m → 5m → 15m → 60m)
- **And** the SyncPulse indicator updates in real-time as items are drained
- **And** duplicate entries for the same `resourceId` are deduplicated before push
- **And** expired JWT tokens cause the drain worker to pause and trigger re-authentication (not exhaust retries)

### Story 19.2: Patient Lite Mobile Sync Drain Worker
As a patient, I want my consent changes and profile updates to automatically sync when I have connectivity, so that my preferences are enforced at the Hub without manual action.

**Acceptance Criteria:**
- **Given** pending consent sync entries in the Patient Lite Mobile queue
- **When** the device comes online
- **Then** a background sync task reads pending entries sorted by priority (consent = priority 1) and pushes them to `consent.sync` on the Hub
- **And** successful syncs are marked as synced in the persistent queue
- **And** failed syncs retry with exponential backoff
- **And** the sync task runs on app foreground and on `NetInfo` connectivity change events
- **And** profile and medical history changes are also synced via `sync.push`

### Story 19.3: Offline Dispensing Path for Pharmacy Lite
As a pharmacist, I want to complete a dispensing transaction locally when the Hub is unreachable, so that patients are not turned away due to connectivity issues.

**Acceptance Criteria:**
- **Given** a verified prescription (Ed25519 signature valid, not on local KRL)
- **When** the Hub is unreachable during the dispensing workflow
- **Then** the pharmacist can proceed with dispensing using locally-verified prescription data
- **And** the `MedicationDispense` resource is created in local Dexie with `isOfflineCreated: true` in `_ultranos` metadata
- **And** the dispense is enqueued for Hub sync with HIGH priority
- **And** a yellow "Offline — will sync when online" banner is shown instead of a blocking "Try Again" error
- **And** offline-created dispenses cannot be re-dispensed locally (local idempotency check against Dexie `medicationDispenses` table)

### Story 19.4: Sync Queue Size Enforcement
As a system architect, I want sync queues to enforce maximum size limits, so that devices don't exhaust IndexedDB storage and Tier 1 events are never dropped.

**Acceptance Criteria:**
- **Given** a sync queue with growing entries
- **When** the queue reaches 2,000 events OR 50 MB (whichever comes first)
- **Then** new non-Tier-1 entries are rejected with a "Queue full — please sync" warning to the user
- **And** Tier 1 events (allergies, active medications, consent) are NEVER rejected — they always queue regardless of limits
- **And** the queue size is checked before each `enqueue()` call
- **And** a "Sync queue nearly full" warning is shown at 80% capacity

### Story 19.5: KRL Sync Service Integration
As a pharmacist, I want the Key Revocation List to sync automatically from the Hub, so that revoked practitioner keys are rejected without manual intervention.

**Acceptance Criteria:**
- **Given** the `KRLSyncService` in `packages/sync-engine/`
- **When** the device comes online or every 5 minutes while online
- **Then** the KRL is refreshed from `practitionerKey.getRevocationList` on the Hub API
- **And** newly revoked keys are immediately purged from the local practitioner key cache in both Pharmacy Lite and OPD Lite
- **And** the KRL sync runs at priority 1 (same as allergies/consent per sync priority config)
- **And** if the Hub is unreachable, the existing local KRL is retained (fail-closed — stale KRL still blocks known-revoked keys)
- **And** KRL sync events are logged as audit events

## Epic 20: OPD Lite — Complete UI/UX
Deliver a fully modern, intuitive clinician experience with a post-login clinical dashboard, encounter history, complete SOAP charting, conflict resolution interface, lab results viewer, full notification center, and polished navigation.

### Story 20.1: Clinical Dashboard Home Page
As a clinician, I want to see a clinical dashboard after login showing my daily workload at a glance, so that I can quickly prioritize patients and track my activity.

**Acceptance Criteria:**
- **Given** an authenticated clinician on the `/` route
- **When** the dashboard loads (replacing the current patient-search-only page)
- **Then** the dashboard displays:
  - Welcome header with clinician name and role
  - "Start New Encounter" primary action button (prominent, green pill style per UX-DR2)
  - Quick patient search bar (inline, not the whole page)
  - Today's encounters card: count, active encounter indicator (if one is in-progress)
  - Pending lab results card: unread DiagnosticReport notifications count
  - Unresolved conflicts card: Tier 1 sync conflicts awaiting physician review (red badge if >0)
  - Recent encounters list: last 5 with patient name, date, status
- **And** the patient search remains accessible from the dashboard (inline search bar)
- **And** the dashboard uses `@ultranos/ui-kit` tokens and Wise-inspired billboard typography (UX-DR1)

### Story 20.2: Encounter History & Patient Chart View
As a clinician, I want to view all past encounters for a patient, so that I can review their medical history before starting a new encounter.

**Acceptance Criteria:**
- **Given** a selected patient (from search or encounter)
- **When** the clinician navigates to the patient chart view
- **Then** a chronological list of all encounters for that patient is displayed, ordered newest-first
- **And** each encounter shows: date, status (finished/cancelled), SOAP summary preview, diagnosis list, prescription count
- **And** clicking an encounter expands its full detail: vital signs, SOAP notes (S, O, A, P), diagnoses, prescriptions, allergy state at time of visit
- **And** encounters are loaded from local Dexie first, then revalidated from Hub via `encounter.listByPatient`
- **And** the allergy banner renders at the top of the patient chart view (red, first, uncollapsible)

### Story 20.3: SOAP Plan Section
As a clinician, I want to record the Plan section of my SOAP notes, so that I can document the treatment plan for the patient as part of the complete clinical record.

**Acceptance Criteria:**
- **Given** an active encounter in the SOAP charting area
- **When** the clinician views the SOAP sections
- **Then** a "Plan" textarea field is present below the Assessment section
- **And** the Plan text is persisted to the `soapLedger` via the same append-only mechanism as Subjective and Objective
- **And** autosave triggers at 300ms debounce with autosave indicator
- **And** the Plan field supports multi-line text entry
- **And** on encounter end, the Plan is included in the ClinicalImpression resource
- **And** the Command Palette (Ctrl+K) includes a "P" (Plan) shortcut to focus this section

### Story 20.4: Conflict Resolution Interface
As a clinician, I want to review and resolve Tier 1 sync conflicts, so that safety-critical data (allergies, active medications) is reconciled within 24 hours per policy.

**Acceptance Criteria:**
- **Given** Tier 1 conflicts flagged in the sync queue
- **When** the clinician navigates to the conflict resolution view (from dashboard card or sync dashboard)
- **Then** each conflict displays the local version and remote version side-by-side with highlighted differences
- **And** the clinician can choose: "Keep Both" (append-only), "Prefer Local", or "Prefer Remote" for each field
- **And** for Tier 1 resources, "Keep Both" is the default and recommended action
- **And** resolving a conflict updates the sync queue entry status and emits an audit event
- **And** unresolved Tier 1 conflicts older than 24 hours are highlighted in red with an "OVERDUE" badge
- **And** prescription generation is blocked for patients with unresolved Tier 1 conflicts (per CLAUDE.md)

### Story 20.5: Lab Results Viewer
As a clinician, I want to view lab results uploaded by Lab Lite within OPD Lite, so that I can review diagnostic reports during patient encounters.

**Acceptance Criteria:**
- **Given** a patient with DiagnosticReport resources synced from the Hub
- **When** the clinician opens the lab results section (from encounter or patient chart)
- **Then** a list of lab results is displayed with: test category (LOINC label), collection date, status (preliminary/final), lab name
- **And** clicking a result opens a detail view with the file (PDF/image rendered inline or downloadable)
- **And** the clinician can acknowledge the result, which marks the corresponding notification as ACKNOWLEDGED
- **And** critical results (24h+ unacknowledged) are highlighted with a red urgent indicator
- **And** access to DiagnosticReport resources is consent-enforced and audit-logged

### Story 20.6: Full Notification Center Page
As a clinician, I want a dedicated notification page with filtering and deep links, so that I can manage all alerts beyond the small bell dropdown.

**Acceptance Criteria:**
- **Given** the `/notifications` route in OPD Lite
- **When** the page loads
- **Then** all notifications are displayed in a filterable list with tabs: All, Lab Results, Prescriptions, System
- **And** each notification shows: type icon, title, timestamp, read/unread status, source (lab name, patient name)
- **And** clicking a notification navigates to the relevant resource (lab result viewer, patient chart, encounter)
- **And** bulk "Mark All Read" is available
- **And** the page uses the same polling mechanism as NotificationBell (30s) but with full detail

### Story 20.7: IndexedDB PHI Cleanup on Tab Close
As a security officer, I want all PHI to be cleared from IndexedDB when the clinician's session ends, so that no clinical data persists on shared workstations.

**Acceptance Criteria:**
- **Given** a clinician closes the browser tab, logs out, or the session expires
- **When** the cleanup handler fires (via `beforeunload`, `visibilitychange`, or explicit logout)
- **Then** the Dexie encryption key is wiped from memory (existing behavior)
- **And** all Dexie tables containing PHI (patients, encounters, soapLedger, observations, conditions, medications, allergyIntolerances, medicationStatements) are cleared
- **And** the syncQueue table is NOT cleared (queued items must survive for drain on next session)
- **And** vocabulary tables (non-PHI) are NOT cleared
- **And** the `clientAuditLog` table is NOT cleared (audit trail must persist)

### Story 20.8: OPD Lite Settings & Profile Page
As a clinician, I want a settings page where I can view my profile, manage MFA, and configure preferences, so that I can maintain my account without contacting support.

**Acceptance Criteria:**
- **Given** the `/settings` route in OPD Lite
- **When** the page loads
- **Then** the following sections are displayed:
  - Profile card: name, role, practitioner ID, email
  - Session info: login time, session expiry countdown
  - MFA management: view TOTP status, option to reconfigure
  - Preferences: notification settings (future-ready placeholder)
- **And** the "Settings" link in the AppShell navbar dropdown navigates to this page
- **And** the page does NOT display or allow editing of clinical data (non-PHI only)

### Story 20.9: Pediatric Dosing Warning Banner
As a clinician, I want to see a clear warning when prescribing for pediatric patients, so that I know weight-based dosing is not supported in V1 and must be calculated manually.

**Acceptance Criteria:**
- **Given** an active encounter where the patient's age is <18 years
- **When** the clinician enters the prescription section
- **Then** a yellow warning banner is displayed: "Weight-based dosing not supported — calculate manually"
- **And** the banner is persistent (not dismissible) for the duration of the encounter
- **And** the warning is not displayed for adult patients (≥18 years)

## Epic 21: API Security Hardening
Protect all Hub API endpoints with global rate limiting, QR signature verification, consent authorization enforcement, security headers, and identity trust fixes.

### Story 21.1: Global Redis-Backed Rate Limiting
As a security officer, I want all Hub API endpoints to be rate-limited, so that brute-force attacks and PHI enumeration are prevented.

**Acceptance Criteria:**
- **Given** any Hub API endpoint
- **When** a client exceeds the rate limit for their role
- **Then** the request is rejected with HTTP 429 and a `Retry-After` header
- **And** rate limits are configurable per endpoint and role: default 100 req/min for authenticated users, 20 req/min for unauthenticated
- **And** rate state is stored in Redis (not in-memory) for consistency across Hub API instances
- **And** `patient.search` has a stricter limit (10 req/min) to prevent PHI enumeration
- **And** the existing in-memory `rateLimitMap` on `lab.reportAuthEvent` is replaced by the Redis implementation
- **And** rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in all responses

### Story 21.2: QR Signature Verification Enforcement
As a pharmacist, I want prescription QR codes to be cryptographically verified before any status lookup, so that forged QR codes cannot be used to enumerate prescription data.

**Acceptance Criteria:**
- **Given** a scanned QR payload submitted to `medication.getStatus`
- **When** the payload includes a signature field
- **Then** the Ed25519 signature is verified against the embedded public key BEFORE any database lookup
- **And** if verification fails, the request is rejected with `INVALID_SIGNATURE` error
- **And** if the public key is on the Key Revocation List, the request is rejected with `KEY_REVOKED` error
- **And** if no signature is present, the request is rejected (no unsigned lookups allowed)
- **And** verification failures are logged as security audit events

### Story 21.3: Consent Authorization & Identity Trust Fixes
As a patient, I want my consent records to be tamper-proof and my pharmacist's identity to be server-verified, so that my data access preferences are enforced and dispensing attribution is accurate.

**Acceptance Criteria:**
- **Given** a `consent.sync` call
- **When** the request includes a `grantorId`
- **Then** the server verifies that `ctx.user.sub === input.grantorId` (a user can only sync their own consent)
- **And** ADMIN users can sync on behalf of any patient (break-glass scenario)
- **And** unauthorized consent sync attempts are rejected with FORBIDDEN and logged as security events
- **And** given a `medication.recordDispense` call
- **When** `pharmacistRef` is included in the payload
- **Then** the server overrides it with `ctx.user.sub` (never trusts client-supplied pharmacist identity)

### Story 21.4: Hub API Security Headers & CORS
As a security officer, I want the Hub API to enforce modern security headers and CORS, so that cross-origin attacks and common web vulnerabilities are mitigated.

**Acceptance Criteria:**
- **Given** any HTTP response from the Hub API
- **Then** the following headers are set:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **And** CORS is configured to allow only known spoke app origins (OPD Lite, Pharmacy Lite, Lab Lite, Admin Portal)
- **And** the Hub API rejects non-HTTPS connections in production

### Story 21.4a: PWA Security Headers via next.config
As a security officer, I want all PWA spoke apps to serve security headers, so that the browser enforces Content Security Policy and transport security.

**Acceptance Criteria:**
- **Given** OPD Lite, Pharmacy Lite, and Lab Lite `next.config.js` files
- **When** a page is served
- **Then** the following headers are included:
  - `Content-Security-Policy` with restrictive default-src, script-src (self + nonce), connect-src (self + Hub API origin), img-src, font-src
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
- **And** CSP violations are reported to a configurable report-uri endpoint

### Story 21.5: Mobile Device Security (Root Detection & Certificate Pinning)
As a security officer, I want Android devices to be checked for root/jailbreak status and API connections to use certificate pinning, so that compromised devices cannot access clinical data.

**Acceptance Criteria:**
- **Given** the Patient Lite Mobile app on Android
- **When** the app launches
- **Then** root/jailbreak detection runs (via `expo-integrity` or equivalent)
- **And** if the device is rooted, a warning is displayed and clinical features are disabled (read-only mode for existing local data)
- **And** all Hub API connections from the mobile app use certificate pinning (TLS 1.3 minimum)
- **And** root detection results are logged as audit events

### Story 21.6: Audit Hash Chain Race Condition Fix
As a compliance officer, I want the audit log hash chain to never fork under concurrent writes, so that tamper detection remains reliable.

**Acceptance Criteria:**
- **Given** the `AuditLogger.emit()` method in `packages/audit-logger/`
- **When** multiple concurrent audit events are emitted simultaneously
- **Then** a PostgreSQL advisory lock (or `SELECT FOR UPDATE` on the latest hash) serializes chain computation
- **And** concurrent calls wait for the lock rather than forking from the same parent hash
- **And** `health.auditChainIntegrity()` passes with zero `brokenAt` entries after concurrent load testing
- **And** the fix is applied to both the Hub API `audit.sync` batch processing and direct `emit()` calls

## Epic 22: Back-Office Administration & Provider Lifecycle
Enable back-office staff to verify KYC submissions, approve/suspend providers and labs, monitor license expiry, and review prescribing anomaly alerts.

### Story 22.1: Back-Office Admin Web Application Scaffold
As a back-office reviewer, I want a dedicated admin web application, so that I can manage provider verification, lab approvals, and operational alerts.

**Acceptance Criteria:**
- **Given** the Ultranos monorepo
- **When** `apps/admin-portal/` is created
- **Then** a Next.js 15 App Router application exists with `@ultranos/admin-portal` package name
- **And** it uses Supabase Auth with FIDO2 hardware token MFA for ADMIN role (4h session duration)
- **And** it connects to the Hub API via tRPC
- **And** it has a persistent sidebar navigation with sections: Dashboard, Providers, Labs, Alerts, Audit Log
- **And** the admin portal is NOT a PWA (no offline mode — admin actions require real-time Hub access)

### Story 22.2: KYC Verification Dashboard
As a back-office reviewer, I want to see pending KYC submissions and approve or reject providers, so that verified practitioners can begin using the platform.

**Acceptance Criteria:**
- **Given** the Providers section of the admin portal
- **When** the reviewer opens the KYC queue
- **Then** a list of pending provider registrations is displayed with: name, submitted date, license document, registry verification status, SLA countdown (3 business days)
- **And** clicking a submission opens a detail view with OCR-extracted fields alongside the original document for visual verification
- **And** the reviewer can: Approve (transitions to ACTIVE), Reject with reason (transitions to REJECTED), or Request More Info
- **And** approval emits an audit event and sends a notification to the provider
- **And** SLA breaches (>3 business days) are highlighted in red

### Story 22.3: Lab Approval & Suspension Workflow
As a back-office reviewer, I want to approve or suspend lab registrations, so that only verified labs can upload diagnostic results.

**Acceptance Criteria:**
- **Given** the Labs section of the admin portal
- **When** the reviewer opens the lab queue
- **Then** pending labs are listed with: lab name, license reference, accreditation reference, technician name, registration date
- **And** the reviewer can: Approve (PENDING → ACTIVE), Suspend (ACTIVE → SUSPENDED), or Reactivate (SUSPENDED → ACTIVE)
- **And** a new Hub API endpoint `lab.approve(labId, status)` is created for ADMIN role only
- **And** approval/suspension emits audit events and notifications to the lab technician
- **And** suspended labs are immediately blocked from uploading by `enforceLabActive()` middleware

### Story 22.4: Provider License Expiry Monitoring
As a back-office reviewer, I want to see providers approaching license expiry, so that I can ensure continuous credential validity.

**Acceptance Criteria:**
- **Given** the Providers section
- **When** the reviewer opens the "License Expiry" view
- **Then** providers are listed with expiry countdown, sorted by urgency: ≤7 days (red), ≤30 days (orange), ≤60 days (yellow)
- **And** automated notifications are sent to providers at 60, 30, and 7 days before expiry
- **And** on expiry date, the provider's account is automatically transitioned to `SUSPENDED` status (clinical write access blocked, read-only for 90 days)
- **And** the reviewer can manually extend or renew a license upon receipt of updated documentation

### Story 22.5: Provider Self-Service KYC Submission
As a new provider, I want to submit my KYC documents through OPD Lite during onboarding, so that my account can be verified and activated.

**Acceptance Criteria:**
- **Given** a newly registered provider with `PENDING_VERIFICATION` status in OPD Lite
- **When** they complete the login flow
- **Then** they are directed to a KYC submission page (not the clinical dashboard)
- **And** the page collects: medical license document (photo/PDF upload), national ID document, professional registry number
- **And** Cloud Vision OCR auto-extracts fields (name, license number, issuing body, expiry) with confidence indicators
- **And** the provider reviews and confirms extracted fields before submitting
- **And** on submission, the provider sees "Pending Verification — we'll notify you within 3 business days"
- **And** the submission is stored in the Hub and appears in the back-office KYC queue (Story 22.2)
- **And** `PENDING_VERIFICATION` providers cannot access clinical features

### Story 22.6: Prescribing Anomaly Alert Review
As a back-office reviewer, I want to see prescribing pattern anomalies, so that I can investigate potentially harmful prescribing behavior.

**Acceptance Criteria:**
- **Given** the Alerts section
- **When** the reviewer opens the anomaly queue
- **Then** flagged providers are listed with: provider name, anomaly type, threshold breached, date range
- **And** anomaly types include: >10 controlled substance prescriptions in one day from one provider; same drug prescribed to >20% of provider's patients in 7 days
- **And** the provider is NOT notified of the alert (per PRD Section 25.3)
- **And** the reviewer can: Dismiss (with reason), Escalate (flag for investigation), or Suspend Provider
- **And** all review actions are audit-logged

## Epic 23: Monitoring, Alerting & Observability
Provide operational visibility into clinical safety metrics, sync queue health, error rates, and audit chain integrity with automated alerting.

### Story 23.0: Redis & Infrastructure Provisioning
As an operations engineer, I want Redis provisioned for the Hub API, so that rate limiting, session caching, and future pub/sub features have a shared state store.

**Acceptance Criteria:**
- **Given** the Ultranos infrastructure
- **When** Redis is provisioned
- **Then** a managed Redis instance (Upstash, ElastiCache, or equivalent) is available to the Hub API via `REDIS_URL` environment variable
- **And** the Hub API connects to Redis on startup and health check reports Redis connectivity status
- **And** the Admin Portal (Epic 22) has CI/CD pipeline configuration: Turborepo filter, TypeScript project references, ESLint config, and deployment target
- **And** Redis connection is TLS-encrypted in production

### Story 23.1: Infrastructure & Application Metrics Collection
As an operations engineer, I want API response times, error rates, and resource utilization collected, so that I can detect performance degradation before users are affected.

**Acceptance Criteria:**
- **Given** the Hub API in production
- **When** requests are processed
- **Then** per-endpoint metrics are collected: P95 response time, error rate, request count
- **And** infrastructure metrics are collected: CPU, memory, disk, network for Hub API instances and database
- **And** metrics are exported to a time-series store (Prometheus/CloudWatch/equivalent)
- **And** dashboards are available showing real-time and historical trends
- **And** P95 >500ms for reads or >1000ms for writes triggers a P2 alert
- **And** error rate >1% triggers a P2 incident alert

### Story 23.2: Clinical Safety Metrics & Alerting
As a Clinical Safety Officer, I want clinical safety metrics collected and alerting configured, so that dangerous patterns are detected early.

**Acceptance Criteria:**
- **Given** the Hub API processing clinical operations
- **When** drug interaction checks, overrides, and SOAP note operations occur
- **Then** the following metrics are collected and reported monthly:
  - Drug interaction check completion rate (must track true-positive sensitivity)
  - CONTRAINDICATED override rate (alert if >2% of total checks)
  - Unresolved Tier 1 sync conflicts older than 24 hours (immediate alert)
  - Sync queue depth per spoke app (alert if >1000 pending for >1 hour)
- **And** the CONTRAINDICATED override rate alert triggers a notification to the Clinical Safety Officer
- **And** Tier 1 conflict age >24h triggers a P1 alert (patient safety)

### Story 23.3: Audit Chain Integrity Monitoring
As a compliance officer, I want the audit log hash chain to be verified daily, so that any tampering is detected within 24 hours.

**Acceptance Criteria:**
- **Given** the Hub API's `health.auditChainIntegrity` endpoint
- **When** a scheduled job runs daily at 03:00 UTC
- **Then** the full audit chain is verified (up to 10,000 most recent entries)
- **And** if the chain is broken (`valid: false`), a P1 alert is triggered immediately
- **And** the verification result is logged (checked count, valid/broken, brokenAt event ID if applicable)
- **And** the scheduled job is configured via infrastructure (cron/scheduled function), not a manual process

## Epic 24: AI Clinical Intelligence
Augment clinician workflows with AI-powered SOAP note parsing, empathy-driven prescription translation/TTS, paper prescription OCR, and edge model management.

### Story 24.1: AI Clinical Scribe — SOAP Note Parsing
As a clinician, I want an AI assistant to parse my freeform clinical notes into structured SOAP format, so that I can document encounters faster while maintaining clinical accuracy.

**Acceptance Criteria:**
- **Given** an active encounter in OPD Lite
- **When** the clinician enters freeform text and triggers "AI Assist" (button or Ctrl+K command)
- **Then** the text is sent to the Cloud LLM (GPT-4-class or equivalent) for structured SOAP parsing
- **And** the AI returns parsed Subjective, Objective, Assessment, and Plan sections
- **And** the AI output is displayed in a side-by-side diff view — NOT auto-committed to the record
- **And** the clinician must explicitly tap "Confirm & Save" to commit the AI version (physician confirmation gate per OPD-031)
- **And** both the original text and AI-parsed version are stored in the SOAP ledger (both versions preserved per OPD-032)
- **And** the AI output is tagged with the exact model version for retrospective review
- **And** if the LLM is unavailable, the flow degrades gracefully to manual-only entry

### Story 24.2: Empathy Translation Engine — Prescription TTS
As a patient, I want my prescription instructions read aloud in my dialect, so that I understand how to take my medication even if I cannot read.

**Acceptance Criteria:**
- **Given** a finalized prescription in the patient's Health Passport
- **When** the patient taps the "Listen" button on a medication
- **Then** a dialect-tuned TTS audio file is generated (or served from pre-recorded fragments for the top-500 formulary)
- **And** the audio covers: medication name, dosage, frequency, time-of-day, duration, and cautions
- **And** audio is served via pre-signed CDN URLs with 15-minute expiry (never cacheable, deleted after delivery per PRD Section 9)
- **And** if TTS is unavailable, a "Audio unavailable" fallback message is shown (never a silent failure)
- **And** a disclaimer is shown: "Audio supplements, not replaces, physician instructions"
- **And** TTS playback completion is logged for the monthly playback rate report

### Story 24.3: Paper Prescription OCR
As a pharmacist, I want to scan handwritten paper prescriptions and have them digitized, so that I can verify them against the system even for non-digital prescriptions.

**Acceptance Criteria:**
- **Given** the Pharmacy Lite app
- **When** the pharmacist selects "Scan Paper Prescription" and captures a photo
- **Then** the image is sent to Cloud Vision AI for text extraction
- **And** extracted fields (medication name, dosage, prescriber name, date) are returned with per-field confidence scores
- **And** fields below 85% confidence are highlighted in yellow for manual correction
- **And** the pharmacist must confirm all extracted fields before proceeding
- **And** if OCR is unavailable, the form falls back to fully manual entry
- **And** paper prescriptions cannot be auto-verified against the Hub (no digital signature) — a "Manual Verification Required" flag is displayed

### Story 24.4: Edge AI Model Update Service
As a system administrator, I want edge AI models to update automatically and degrade gracefully when stale, so that offline AI features remain accurate and safe.

**Acceptance Criteria:**
- **Given** an edge device (OPD Lite or Patient Lite Mobile) with ONNX models for SOAP macros or drug interaction lookup
- **When** a Wi-Fi connection is available
- **Then** delta model updates are downloaded in the background (not over cellular)
- **And** the model is tagged with a version ID and download timestamp
- **And** if the model is >45 days old without a successful update, it is disabled and the system falls back to template-only mode
- **And** a "Model outdated — AI features limited" warning is shown to the user when degradation occurs
- **And** model update events are logged for the monthly AI performance report

## Epic 25: Shared Package Completeness
Fill the missing shared infrastructure: create the `drug-db` package, add DiagnosticReport and MedicationDispense FHIR types, implement mobile ECDSA-P256, and enforce drug database staleness checks.

### Story 25.1: Create `packages/drug-db` Package
As a developer, I want a centralized drug interaction checking package, so that all apps use a single, tested, licensed-data-ready interaction checker instead of duplicating logic.

**Acceptance Criteria:**
- **Given** the monorepo
- **When** `packages/drug-db/` is created
- **Then** it exports: `checkInteractions(newMed, activeMeds, activeAllergies)` returning severity results
- **And** it exports: `loadInteractionDatabase(source)` supporting both Dexie (PWA) and SQLite (mobile) adapters
- **And** severity levels match the existing `DrugInteractionSeverity` enum (CONTRAINDICATED, ALLERGY_MATCH, MAJOR, MODERATE, MINOR, NONE)
- **And** allergy matching compares substance names bidirectionally (drug A→allergy, allergy→drug A)
- **And** the package has a pluggable data adapter interface so that the curated 100-med subset can be replaced with a licensed database (Medi-Span, Multum, FDB) without API changes
- **And** existing interaction logic in OPD Lite's `interactionService.ts` is refactored to use this shared package

### Story 25.2: Drug Database Staleness Enforcement
As a Clinical Safety Officer, I want the system to refuse drug interaction checks if the database is stale, so that outdated data cannot produce false negatives.

**Acceptance Criteria:**
- **Given** the drug interaction database loaded on a device
- **When** a drug interaction check is requested
- **Then** the database metadata is checked for `lastUpdatedAt`
- **And** if the database is >45 days old, the check returns `UNAVAILABLE` with reason `DATABASE_STALE`
- **And** the UI shows "Interaction check unavailable — drug database outdated" (never "no interactions found")
- **And** a sync is triggered to attempt database update from the Hub
- **And** the staleness check is enforced in `packages/drug-db`, not in individual app code

### Story 25.3: DiagnosticReport & MedicationDispense FHIR Types
As a developer, I want FHIR R4 Zod schemas for DiagnosticReport and MedicationDispense, so that lab results and pharmacy dispensing records are type-safe across the ecosystem.

**Acceptance Criteria:**
- **Given** `packages/shared-types/`
- **When** the schemas are added
- **Then** `FhirDiagnosticReportSchema` is defined with: resourceType, id, status (preliminary/final/amended), code (LOINC), subject, encounter, effectiveDateTime, issued, performer, result, conclusion, presentedForm, meta, _ultranos
- **And** `FhirMedicationDispenseSchema` is defined with: resourceType, id, status, medicationCodeableConcept, subject, performer, authorizingPrescription, quantity, whenHandedOver, dosageInstruction, meta, _ultranos (hlcTimestamp, brandName, batchLot, isOfflineCreated)
- **And** both schemas are added to the sync-engine's `RESOURCE_TIER_MAP` with correct tier assignments (DiagnosticReport = TIER_2, MedicationDispense = TIER_2)
- **And** TypeScript interfaces are exported alongside Zod schemas
- **And** existing code that references these types inline is updated to use the shared definitions

### Story 25.4: Mobile ECDSA-P256 Crypto Implementation
As a patient, I want my Health Passport QR code to be cryptographically signed, so that clinicians can verify my identity is authentic.

**Acceptance Criteria:**
- **Given** `packages/crypto/`
- **When** mobile ECDSA-P256 support is added
- **Then** `generateEcdsaKeyPair()` creates a P-256 key pair compatible with React Native (via expo-crypto or SubtleCrypto polyfill)
- **And** `signWithEcdsa(privateKey, payload)` produces a compact signature suitable for QR encoding
- **And** `verifyEcdsaSignature(publicKey, payload, signature)` verifies the signature (usable by OPD Lite and Hub API)
- **And** the private key is stored in device secure storage (Expo SecureStore with biometric binding)
- **And** the public key is registered with the Hub API for remote verification
- **And** Patient Lite Mobile's `PatientQRCode` component is updated to include the `sig` field in the QR payload

## Epic 26: Pharmacy Lite — Complete UI/UX
Deliver a fully modern, intuitive pharmacist experience with a post-login dispensing dashboard, prescription queue, dispensing history, sync queue visualization, and labeling/printing workflow.

### Story 26.1: Pharmacist Dispensing Dashboard
As a pharmacist, I want to see a dashboard after login showing my dispensing activity and pending actions, so that I can quickly manage my daily workload.

**Acceptance Criteria:**
- **Given** an authenticated pharmacist on the `/` route
- **When** the dashboard loads (replacing the current scanner-only page)
- **Then** the dashboard displays:
  - Welcome header with pharmacist name and pharmacy name
  - "Scan Prescription" primary action button (prominent, green pill style per UX-DR2)
  - Today's dispensing summary card: total dispensed, pending sync, failed sync
  - Pending sync queue card: count of items awaiting Hub sync (amber if >0)
  - Recent dispensing list: last 10 transactions with patient name, medication, timestamp, sync status
  - Connectivity status indicator: online/offline
- **And** the dashboard auto-refreshes every 30 seconds
- **And** the scanner view remains accessible as a dedicated `/scan` route (not the home page)

### Story 26.2: Prescription Queue & Active Work View
As a pharmacist, I want to see a list of prescriptions currently being processed, so that I can manage multiple fulfillment workflows in a busy pharmacy.

**Acceptance Criteria:**
- **Given** the `/queue` route in Pharmacy Lite
- **When** the page loads
- **Then** a tabbed view shows: Active (in-progress fulfillments), Completed (today), Failed (sync errors)
- **And** each item shows: patient name, medication count, fulfillment phase (loaded/reviewing/dispensing/completed), timestamp
- **And** clicking an active item resumes the fulfillment workflow from its current phase
- **And** completed items show sync status (synced/pending/failed) with visual badges
- **And** failed items show a "Retry Sync" button

### Story 26.3: Dispensing History & Day-End Reconciliation
As a pharmacist, I want to view all past dispensing records and generate a shift summary, so that I can reconcile my day's work and audit my activity.

**Acceptance Criteria:**
- **Given** the `/history` route in Pharmacy Lite
- **When** the page loads
- **Then** a searchable, filterable list of all dispensing records is displayed with: patient name, medications dispensed, timestamp, pharmacist name, sync status
- **And** filters include: date range, medication name, sync status (synced/pending/failed)
- **And** a "Shift Summary" button generates a read-only view showing: total prescriptions dispensed, total medication items, sync success rate, any unresolved sync failures
- **And** pagination is used for >20 entries

### Story 26.4: Sync Queue Dashboard & Manual Retry
As a pharmacist, I want to see what's stuck in the sync queue and manually retry, so that I can ensure all dispensing records reach the Hub.

**Acceptance Criteria:**
- **Given** the SyncPulse indicator is tapped or the `/sync` route is accessed
- **When** the sync dashboard loads
- **Then** pending, in-flight, failed, and synced entries are listed with: resource type, patient ref (opaque), enqueue timestamp, retry count, last error (generic message)
- **And** failed entries have a "Retry Now" button that immediately attempts to push to the Hub
- **And** a "Retry All Failed" bulk action is available
- **And** entries stuck in "syncing" status for >2 minutes show a "Stale — Reset" option
- **And** successfully synced entries are automatically removed after 24 hours

### Story 26.5: Enhanced Labeling & Print Workflow
As a pharmacist, I want to preview medication labels before printing and print in the patient's language, so that patients receive clear, accurate labeling.

**Acceptance Criteria:**
- **Given** a completed fulfillment
- **When** the pharmacist proceeds to the labeling step
- **Then** a print preview shows the `MedicationLabel` component for each dispensed medication
- **And** the label language defaults to the patient's preferred language (English, Arabic, or Dari/Persian)
- **And** the pharmacist can switch the label language before printing
- **And** a "Print All Labels" button sends all labels to the printer in sequence
- **And** the label includes: medication name, dosage, frequency, duration, timing icons, pharmacy name, date, batch/lot number

### Story 26.6: Pharmacy Lite Settings Page
As a pharmacist, I want a settings page where I can view my profile and pharmacy info, so that I can verify my account details.

**Acceptance Criteria:**
- **Given** the `/settings` route in Pharmacy Lite
- **When** the page loads
- **Then** the following sections are displayed:
  - Pharmacist profile card: name, role, email
  - Pharmacy info: pharmacy name, license reference
  - Session info: login time, session expiry countdown
  - MFA management: view TOTP status
- **And** the "Settings" link in the AppShell navbar dropdown navigates to this page

### Story 26.7: Practitioner Key Revalidation Wiring
As a pharmacist, I want stale practitioner keys to be automatically revalidated, so that I'm always using up-to-date key trust information when verifying prescriptions.

**Acceptance Criteria:**
- **Given** a cached practitioner key with `stale: true` (TTL expired)
- **When** the key is needed for prescription verification
- **Then** `revalidateKey()` is automatically called before verification proceeds
- **And** if the key is confirmed active by the Hub, the cache is refreshed with a new TTL
- **And** if the key is revoked, the cache entry is deleted and the verification fails with `KEY_REVOKED`
- **And** if the Hub is unreachable, the stale key is treated as untrusted (fail-closed) and the pharmacist is shown an offline verification warning

