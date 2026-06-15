---
stepsCompleted: [1, 2, 3, 4, 'addendum-1', 'addendum-2', 'addendum-3', 'addendum-4', 'addendum-5-deferred-work', 'addendum-6', 'addendum-7', 'addendum-8-mpi-phase1', 'addendum-9-mpi-phase2', 'addendum-10-mpi-phase3', 'addendum-11-navigation-scheduling', 'addendum-12-lab-lite-enterprise-ux', 'addendum-14-patient-profile-ux', 'addendum-15-audit-trail', 'addendum-16-lab-lite-enterprise-transformation']
workflowType: 'epics-and-stories'
status: 'complete'
completedAt: '2026-04-28'
addendumStarted: '2026-05-02'
addendum5Started: '2026-05-18'
inputDocuments:
  - docs/ultranos_master_prd_v3.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/gap-analysis-report.md
  - _bmad-output/implementation-artifacts/deferred-work.md
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

### New Functional Requirements (Navigation & Scheduling Addendum — 2026-05-22)

FR35: Collapsible Sidebar Navigation for All PWA Spoke Apps (OPD-Lite, Pharmacy-Lite, Lab-Lite with badge-driven urgency, sync footer, RTL support)
FR36: Patient Directory & Browsing (searchable, filterable, sortable patient list for OPD-Lite clinicians)
FR37: Appointment Scheduling & Walk-In Queue Management (FHIR R4 Appointment/Slot, day/week views, walk-in queue, offline-first, Hub API sync)

### New Functional Requirements (Lab Lite Enterprise UX Addendum — 2026-05-23)

FR38: Lab Lite Enterprise Dashboard UX (Visual hierarchy, upload success confirmation, queue attention states, cancel/recall queued uploads, last-refreshed timestamps)
FR39: Lab Lite Patient Infrastructure (Patient registration with MPI duplicate detection, two-phase patient search, recent patients cache, patient search autocomplete)
FR40: Lab Lite Contextual Help & Efficiency (Tooltips on LOINC/OCR/dates, keyboard shortcuts, i18n completeness)

### New Functional Requirements (Patient Profile UX & Audit Trail Addendum — 2026-05-25)

FR41: Patient Profile Data Fetch Fixes (Hub API fallback using patient.read, Dexie partial data refresh, address field normalization, edit modal payload alignment)
FR42: National ID Field & NID Missing Badge (National ID# in registration + edit, MPI integration, amber "NID Missing" badge on profile and directory, form flow consistency)
FR43: Patient Audit Trail & Last Updated Display (Role-tiered audit trail collapsible, "Last updated by" on header card, "Last Updated" directory column, updated_by tracking)
FR44: Shared Patient Workflows Package (packages/patient-workflows with adapter pattern for cross-app patient registration, editing, and banner consistency — design spec only)

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
FR35: Epic 37 - Collapsible Sidebar Navigation for All PWA Spoke Apps
FR36: Epic 37 - Patient Directory & Browsing
FR37: Epic 37 - Appointment Scheduling & Walk-In Queue Management
FR38: Epic 38 - Lab Lite Enterprise Dashboard UX
FR39: Epic 38 - Lab Lite Patient Infrastructure
FR40: Epic 38 - Lab Lite Contextual Help & Efficiency

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

### Epic 37: Navigation Systems & Appointment Scheduling
Upgrade all three PWA spoke apps (OPD-Lite, Pharmacy-Lite, Lab-Lite) from basic header-only layouts to collapsible sidebar navigation with badge-driven urgency indicators, add a patient directory to OPD-Lite, and build a complete appointment scheduling system for OPD clinics including FHIR R4 Appointment/Slot types, offline-first IndexedDB storage, walk-in queue management, and Hub API sync.
**FRs covered:** FR28 (extension), FR35, FR36, FR37
**NFRs covered:** NFR2 (offline appointments), NFR5 (FHIR Appointment/Slot), NFR7 (accessible nav)

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

> **Implementation Notes (2026-05-22, branch `internationalization-01`):**
> - All dashboard component text now uses `useTranslations()` from next-intl (en/ar/prs). No hard-coded strings remain.
> - QueueStatusCard and ActivitySummaryCard badges have `role="status"` + `aria-label` for screen reader announcement (e.g., "2 Pending").
> - Error banner includes a retry button (`useDashboardData.retry()`). Error role upgraded to `role="alert" aria-live="assertive"`.
> - Loading state uses skeleton placeholder cards instead of spinner.
> - AuthGuard shows skeleton loading instead of blank page during session check.
> - Skip-to-main-content link added to root layout; `<main id="main-content">` wired.
> - All action buttons meet 44px min touch target (WCAG 2.5.8).
> - `motion-safe:` prefix on transitions; global `prefers-reduced-motion` safety net in globals.css.
> - RecentUploadsList uses locale-aware `toLocaleString(locale, ...)` for timestamps.
> - Tests updated: next-intl mock supports namespaced `useTranslations('dashboard')`, `useTranslations('status')`, `useLocale()`. 11/11 pass.

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

---

# Addendum 6: Pharmacy Lite Enterprise Readiness (2026-05-22)

> Cross-cutting fixes surfaced by enterprise readiness audit of the Pharmacy Lite dashboard.
> Addresses gaps across Epic 26 (Pharmacy UI), Epic 11 (i18n), Epic 29 (Audit), Epic 30 (Sync), Epic 13 (Resilience), Epic 14 (Auth Shell), Epic 19 (Sync Reliability), Epic 35 (UX Polish/A11y).

## PE: Pharmacy Enterprise Readiness

### Critical Fixes (PE-1 through PE-10)

#### PE-1: Dashboard Error Surfacing (Epic 13)
Silent `catch` in `PharmacyDashboard.refreshStats` replaced with `statsError` state and a visible `role="alert"` banner with Retry button. Prevents stale zeros from being mistaken for real data during shift handover — a patient safety risk if supervisors use the count to assess coverage.

#### PE-2: Sync Queue Entry Type Alignment (Epic 30 / Story 30-9)
Added `'synced'` to `SyncQueueEntry.status` union in `db.ts`. Fixes TypeScript type mismatch that caused the "Recently Synced" section in `SyncQueueDashboard` to be permanently empty. Synced entries previously fell through the `categorize()` switch statement and vanished from the UI.

#### PE-3: Dashboard PHI Audit Event (Epic 29)
Dashboard now emits `auditPhiAccess(READ, MEDICATION_DISPENSE)` once per session (via `auditedSessionRef`) when recent dispense records containing `patientRef` + `medicationName` are loaded. Satisfies CLAUDE.md Rule 6: "Every read, write, or access to patient data must emit a structured audit event."

#### PE-4: Pharmacy i18n Wiring (Epic 11)
Wired `useTranslations()` from `next-intl` into `PharmacyDashboard`, `RecentDispensingList`, `ShiftSummary`, and `SyncQueueDashboard`. All user-visible strings now sourced from translation catalogs (`messages/en.json`, `ar.json`, `prs.json`). The i18n infrastructure was already set up (Epic 11) but no pharmacy component was consuming it.

#### PE-5: ShiftSummary Focus Trap & Restoration (Epic 26)
Added WCAG 2.1 AA-compliant focus management to the `ShiftSummary` dialog:
- `tabIndex={-1}` + `ref` on dialog panel for auto-focus on mount
- Tab cycles trapped within the dialog (forward and backward)
- Escape key closes the dialog
- Focus returns to the previously-focused element on unmount
Satisfies WCAG 2.1 SC 2.1.2 (No Keyboard Trap) and SC 2.4.3 (Focus Order).

#### PE-6: SyncPulse Global Queue State (Epic 19)
Rewrote `SyncPulse` to poll the global `syncQueue` Dexie table using indexed `where('status')` queries instead of reading only from the active fulfillment session store (`useFulfillmentStore`). Now shows:
- Red + pulse: failed entries in queue
- Amber + pulse: pending/in-flight entries
- Green: all synced
Polls every 10s and on visibility change. Accurate representation of actual sync health.

#### PE-7: Dashboard Loading Skeleton (Epic 26)
Added `isLoading` state with `aria-busy="true"` skeleton blocks (3 grey rectangles with pulse animation). Prevents the "instant zeros that flip to real numbers" UX pattern that was indistinguishable from "nothing happened today" on slow devices.

#### PE-8: AuthGuard Loading State (Epic 14)
Replaced `return null` during async session check with a centered spinner + "Loading..." text with `aria-busy`. Eliminates the blank page flash that appeared while Supabase session verification was in progress.

#### PE-9: Indexed Sync Queue Queries (Epic 30)
Added Dexie v5 schema version with `retryCount` index on `syncQueue`. Replaced the `toArray()` + JavaScript-side filter pattern with `where('status').anyOf(...)` indexed queries. Prevents memory/performance issues during extended offline periods where hundreds of queue entries accumulate.

#### PE-10: Locale-Aware Time Formatting (Epic 11)
`RecentDispensingList.formatTime()` now receives the app locale from `useLocale()` (next-intl) and passes it to `toLocaleTimeString()`. Previously used an empty locale array `[]` which defaulted to the OS locale rather than the app's configured language — a problem in multilingual deployments where the OS is in English but the app is set to Arabic.

### Low-Priority Polish (PE-11 through PE-14)

#### PE-11: React.memo on Display Components (Epic 26)
Wrapped `DispensingSummaryCard` and `SyncQueueCard` with `React.memo`. Both are pure display components receiving only primitive props — they re-rendered on every parent state update (30s auto-refresh) without any prop changes. Minimal perf impact today but prevents future degradation.

#### PE-12: Skip-to-Content Link (Epic 35)
Added a `sr-only focus:not-sr-only` anchor link in `AppShellWrapper` targeting `#main-content`. Visible only on keyboard focus. The `<main>` element now has `id="main-content"`. Required for WCAG 2.4.1 (Bypass Blocks) — allows keyboard users to skip past the AppShell navigation directly to clinical content.

#### PE-13: Focus-Visible Ring on Dashboard CTAs (Epic 26)
Added `focus-visible:outline-2 focus-visible:outline-offset-2` to both quick-action `<Link>` elements ("Scan QR Prescription" and "Scan Paper Prescription"). The green CTA uses `outline-[#163300]` (dark green) and the orange CTA uses `outline-orange-700` for contrast. Required for WCAG 2.4.11 (Focus Appearance) — focus indicator must be visible on all interactive elements.

#### PE-14: Axe-Core Tests for Clinical Components (Epic 35)
Added 4 new axe-core tests to `accessibility.test.tsx` covering real pharmacy components:
- `DispensingSummaryCard` with non-zero values
- `SyncQueueCard` with pending items
- `RecentDispensingList` with populated items (2 dispenses, mixed sync states)
- `RecentDispensingList` empty state

Previously, the accessibility test file only tested synthetic HTML fragments. These new tests run axe against the actual component output to catch structural violations (missing landmarks, label issues, color-only communication) in production code.

---

### Enterprise Readiness Status After PE Fixes

| Dimension | Before | After |
|-----------|--------|-------|
| Error handling | Silent catch → stale zeros | Visible error banner + retry |
| Sync type safety | TypeScript mismatch → broken UI | Full union, switch exhaustive |
| PHI audit coverage | Dashboard reads unaudited | Once-per-session audit event |
| i18n | Infrastructure only, no consumption | 4 core components wired |
| Dialog a11y (WCAG) | No focus trap | Full trap + Escape + restore |
| Sync indicator accuracy | Session-local only | Global queue state |
| Loading UX | Instant zeros | Skeleton + aria-busy |
| Auth loading UX | Blank page | Spinner |
| Query performance | Full toArray → memory risk | Indexed where queries |
| Locale correctness | OS default | App locale |
| Re-render efficiency | No memoization | memo on pure components |
| Keyboard navigation | No skip link, no focus ring | Both added |
| Test coverage (a11y) | Synthetic HTML only | Real clinical components |

---

# Addendum 5: Deferred Work Epics (28–36)

> Generated 2026-05-18 from comprehensive review of `_bmad-output/implementation-artifacts/deferred-work.md`.
> These epics address ~172 deferred items accumulated across code reviews of Epics 1–27.

## Deferred Work — Epic List

### Epic 28: Client-Side PHI Encryption & Data Lifecycle
Ensure all PHI stored in IndexedDB (PWA) and local state is encrypted at rest using `@ultranos/crypto`, with proper key lifecycle and data cleanup on session end.
**Deferred items covered:** D10, D24, D26, D34, D37, D51, D58, D71, D74, D75, W6 (9-2), W3/W5/W6/W7/W8 (7-1)

### Epic 29: Comprehensive Audit Infrastructure
Every PHI read/write across all apps emits a structured audit event via `@ultranos/audit-logger` with SHA-256 hash chaining — no silent gaps, no swallowed failures.
**Deferred items covered:** D5, D9, D23, D38, D56, D63, P2, W1 (many), W5 (23-2), D101, D122, D1 (12-5), W56, W57, W38, W3/W4 (21-6)

### Epic 30: Sync Engine Hardening & Reliability
The sync engine reliably delivers all queued data to the Hub with no data loss, no duplicates, and correct ordering — even across tab restarts, auth token expiry, and concurrent operations.
**Deferred items covered:** D4, D11, D20, D27, D35, D62, P6, W1-W8 (9-2), W1-W7 (9-3), W4 (4-3), D88, D107

### Epic 31: FHIR R4 Compliance & Schema Hardening
All FHIR resources, types, and database schemas strictly conform to FHIR R4 conventions with proper validation, consistent Meta fields, and correct namespace usage.
**Deferred items covered:** D1, D3, D36, D40, D43, D53, D65, D108, D109, W3 (3-3), D105, D106, W14 (24-3), W5 (14-6), W13 (16-4), W1/W2 (3-4), D30

### Epic 32: Security Hardening Phase 2
Close all known exploitable security vulnerabilities — forged QR acceptance, client-supplied identity trust, unverified webhooks, rate limiting gaps, and credential exposure.
**Deferred items covered:** D12, D15, P3, D60, D61, W5-W11 (6-1), D2/D3 (5-3), W2/W4 (21-2), W7-W9 (27-6), D1 (22-5), W42 (18-7a), W2 (27-11), D1-D3 (27-12), W1/W2 (22-3)

### Epic 33: Clinical Safety & Drug Interaction Improvements
Drug interaction checks evaluate the patient's full active medication list, allergy matching uses coded substances, and all clinical safety invariants are tested.
**Deferred items covered:** D2, D25, D31, D55, D57, D72, D87, D89, D97, D98, D99, D104, W2/D2 (3-2), W3/W5 (3-1/3-2), D106, D49, D90, D91

### Epic 34: Infrastructure & DevOps Resilience
Eliminate operational risks from memory leaks, missing cron wiring, module-level singletons, and Dexie schema fragility across all apps.
**Deferred items covered:** D33, D42, D41, D86, D92, D96, D7, D8, W1-W5 (1-6), W1-W4 (23-0), W1-W3 (23-1), D2-D3 (23-1), W1-W3 (22-4), W1 (22-6)

### Epic 35: UX Polish, Accessibility & RTL Completion
All apps render correctly in RTL mode with proper font loading, i18n integration, WCAG accessibility compliance, and consistent design tokens.
**Deferred items covered:** D13, D14, D22, D28, D64, D66, D94, D-RTL1 through D-RTL4, W1-W4 (14-4), W19 (24-1), W2-W3 (22-2), W49, W37, W44-W48, D67, W12 (15-1)

### Epic 36: Data Integrity & Race Condition Fixes
Eliminate data corruption and inconsistency from race conditions, partial failures, and stale state across all critical code paths.
**Deferred items covered:** W1 (7-1), W2 (3-2), W1 (4-2), W1 (27-6), W4 (27-6), D90, D116, D117, D118, D121, D124, D125, D126, D47, D112-D114

### Deferred Item Coverage Map

| Deferred Items | Epic |
|---|---|
| D10, D24, D26, D34, D37, D51, D58, D71, D74, D75 | Epic 28 — Client-Side Encryption |
| D5, D9, D23, D38, D56, D63, P2, D101, D122 | Epic 29 — Audit Infrastructure |
| D4, D11, D20, D27, D35, D62, P6, D88, D107 | Epic 30 — Sync Engine |
| D1, D3, D36, D40, D43, D53, D65, D108, D109, D30, D105, D106 | Epic 31 — FHIR Compliance |
| D12, D15, P3, D60, D61, D2/D3 (5-3) | Epic 32 — Security Phase 2 |
| D2, D25, D31, D55, D57, D72, D87, D89, D97-D99, D104, D49, D90, D91 | Epic 33 — Clinical Safety |
| D33, D42, D41, D86, D92, D96, D7, D8 | Epic 34 — Infrastructure |
| D13, D14, D22, D28, D64, D66, D94, D-RTL1–4 | Epic 35 — UX/RTL/A11y |
| D47, D90, D112-D114, D116-D118, D121, D124-D126 | Epic 36 — Data Integrity |

---

## Epic 28: Client-Side PHI Encryption & Data Lifecycle

Ensure all PHI stored in IndexedDB (PWA) and local state is encrypted at rest using `@ultranos/crypto`, with proper key lifecycle and data cleanup on session end — achieving CLAUDE.md compliance for all client-side data stores.

### Story 28.1: Encrypt All OPD-Lite Dexie Tables via Crypto Proxy

As a clinic administrator,
I want all patient data stored locally in OPD-Lite to be encrypted at rest,
So that a stolen or compromised workstation does not expose PHI.

**Acceptance Criteria:**

- **Given** OPD-Lite is running with a valid session key
- **When** any record is written to Dexie tables (patients, encounters, soapLedger, observations, conditions, medications)
- **Then** the record body is encrypted via `@ultranos/crypto` AES-256-GCM before IndexedDB write
- **And** only fields listed in `indexedFields` remain in cleartext for query support

- **Given** an encrypted record exists in any Dexie table
- **When** it is read back via Dexie query
- **Then** the record is transparently decrypted and returned as the original object

- **Given** the session key has been wiped (tab close or logout)
- **When** any Dexie read is attempted
- **Then** a `DecryptionKeyMissingError` is thrown (not a silent placeholder)

- **Given** OPD-Lite has existing unencrypted data from before this migration
- **When** the app opens with the new encryption proxy
- **Then** a one-time migration encrypts existing records in place
- **And** the Dexie version is incremented with the new schema

### Story 28.2: Comprehensive PHI Cleanup on Session End

As a clinician,
I want all locally stored PHI to be wiped when I close the browser tab or log out,
So that the next user of the workstation cannot access my patients' data.

**Acceptance Criteria:**

- **Given** a clinician is logged into OPD-Lite, Pharmacy-Lite, or Lab-Lite
- **When** the user clicks "Logout"
- **Then** all Dexie tables containing PHI are cleared (`db.table.clear()` for each table)
- **And** the in-memory encryption key is wiped
- **And** Zustand stores are reset

- **Given** a clinician has an active session
- **When** the browser tab is closed (`beforeunload` event)
- **Then** the encryption key is wiped from memory
- **And** IndexedDB data remains encrypted but unreadable without the key

- **Given** `clearPhiState()` is called from any trigger (logout, session expiry, tab close)
- **When** the function completes
- **Then** every Dexie table that stores PHI has been cleared — not just Zustand state
- **And** the sync queue is either cleared or its PHI payloads are purged

### Story 28.3: Sync Queue PHI Payload Encryption

As a system operator,
I want PHI payloads in the sync queue to be encrypted at rest,
So that queued data awaiting sync is not exposed if the device is compromised.

**Acceptance Criteria:**

- **Given** a clinical event (encounter, prescription, vitals, etc.) is enqueued for sync
- **When** `enqueue()` writes the `SyncQueueEntry` to IndexedDB
- **Then** the `payload` field is encrypted with the session key before write
- **And** metadata fields (resourceType, resourceId, hlcTimestamp, status) remain in cleartext for queue management

- **Given** the drain worker picks up a pending entry
- **When** it prepares the payload for Hub API push
- **Then** the payload is decrypted in memory just before the API call
- **And** the decrypted payload is never persisted back to IndexedDB

- **Given** the session key is unavailable (expired session, fresh tab)
- **When** the drain worker attempts to process encrypted queue entries
- **Then** those entries are skipped with status `'awaiting-key'`
- **And** they are retried after re-authentication restores the session key

- **Given** `clearPhiState()` is triggered
- **When** the sync queue contains entries with encrypted payloads
- **Then** entries with status `'synced'` are deleted
- **And** entries with status `'pending'`/`'failed'` are retained (encrypted, unreadable without key)

### Story 28.4: Key Derivation from Supabase JWT (PBKDF2)

As a clinician,
I want my local encryption key to survive a page refresh without re-entering credentials,
So that I don't lose access to my locally cached patient data on accidental refresh.

**Acceptance Criteria:**

- **Given** a user authenticates via Supabase
- **When** the session JWT is available
- **Then** a deterministic encryption key is derived using PBKDF2 with the JWT `sub` claim + a device salt stored in `localStorage`
- **And** the same JWT always produces the same key on the same device

- **Given** a user refreshes the page
- **When** the Supabase session is still valid (auto-refresh within 15-min window)
- **Then** the encryption key is re-derived from the refreshed JWT
- **And** all previously encrypted IndexedDB data is readable

- **Given** the Supabase session has fully expired (no valid refresh token)
- **When** the user refreshes the page
- **Then** the encryption key cannot be derived
- **And** IndexedDB data remains encrypted and inaccessible until re-authentication

- **Given** a different user logs in on the same device
- **When** they authenticate with a different JWT
- **Then** a different encryption key is derived
- **And** the previous user's encrypted data is unreadable

### Story 28.5: Key Rotation with Version-Prefixed Payloads

As a system administrator,
I want encryption keys to be rotatable without making existing data permanently unreadable,
So that key compromise events can be remediated.

**Acceptance Criteria:**

- **Given** encrypted payloads already contain a `v1:` version prefix
- **When** a key rotation is triggered (new key version `v2`)
- **Then** new writes use `v2:` prefix with the new key
- **And** reads detect the version prefix and select the correct key for decryption

- **Given** a rotation has occurred and both `v1` and `v2` keys exist
- **When** a background re-encryption job runs
- **Then** all `v1:`-prefixed records are decrypted with the old key and re-encrypted with the new key
- **And** the `v1` key can be retired after all records are migrated

- **Given** a record with an unknown version prefix (e.g., `v3:`) is encountered
- **When** decryption is attempted
- **Then** a `UnknownKeyVersionError` is thrown with the version prefix in the error
- **And** the error is logged (without PHI) for operational alerting

### Story 28.6: Search Encryption Strategy for Indexed Patient Names

As a clinician,
I want to search for patients by name even though names are encrypted at rest,
So that clinical workflows are not degraded by encryption.

**Acceptance Criteria:**

- **Given** `_ultranos.nameLocal` and `_ultranos.nameLatin` are encrypted in IndexedDB
- **When** a clinician types a patient name search query
- **Then** the search works with acceptable performance (<200ms for 1000 patients)

- **Given** the chosen strategy (encrypted Fuse.js index, in-memory decrypt-and-search, or deterministic token hashing)
- **When** the search is executed
- **Then** results match against both `nameLocal` and `nameLatin` fields
- **And** the approach is documented in an ADR explaining the tradeoff between search quality and encryption strength

- **Given** the encryption key is not available
- **When** a patient search is attempted
- **Then** the search returns an empty result set with a clear error message ("Session required for patient search")
- **And** no unencrypted name data is leaked to the UI or console

---

## Epic 29: Comprehensive Audit Infrastructure

Every PHI read/write across all apps emits a structured audit event via `@ultranos/audit-logger` with SHA-256 hash chaining — no silent gaps, no swallowed failures.

### Story 29.1: Hub API Transactional Audit on All PHI Router Procedures

As a compliance officer,
I want every Hub API endpoint that reads or writes PHI to emit a verified audit event,
So that there is a complete, tamper-evident trail of all data access for regulatory review.

**Acceptance Criteria:**

- **Given** any tRPC procedure that reads PHI (patient.search, patient.read, encounter.listByPatient, soapNote.list, medication.getStatus, diagnosticReport.read, notification.list, etc.)
- **When** the procedure executes successfully
- **Then** an audit event is emitted via `AuditLogger.emit()` with correct `actorId`, `resourceType`, `resourceId`, `action: 'READ'`, and `outcome: 'SUCCESS'`

- **Given** any tRPC procedure that writes PHI (patient.create, encounter.create, soapNote.add, medication.create, recordDispense, allergy.create, consent.sync, etc.)
- **When** the procedure executes successfully
- **Then** an audit event is emitted with `action: 'CREATE'|'UPDATE'|'DELETE'` as appropriate

- **Given** an audit emit fails during a procedure
- **When** the failure is caught
- **Then** the procedure still completes (fail-open for clinical availability)
- **But** the failed audit event is written to a `dead_letter_audit` table with the full event payload, error message, and timestamp
- **And** an operational alert metric is incremented

- **Given** the `audit.sync` endpoint receives client events
- **When** client events include an `outcome` field
- **Then** the server preserves the client-supplied `outcome` value (not hardcode `'SUCCESS'`)

- **Given** `ctx.user.sub` is missing or empty on the JWT context
- **When** an audit event is constructed
- **Then** the event is emitted with `actorId: 'ANONYMOUS'` and flagged with `metadata.missingSubClaim: true`

### Story 29.2: Migrate Patient-Lite-Mobile to @ultranos/audit-logger

As a compliance officer,
I want the patient mobile app to use the canonical audit logger with hash chaining,
So that patient-side PHI access has the same audit integrity guarantees as clinician apps.

**Acceptance Criteria:**

- **Given** patient-lite-mobile currently uses a local `@/lib/audit` module
- **When** this story is complete
- **Then** all audit calls in patient-lite-mobile import from `@ultranos/audit-logger`
- **And** the local `@/lib/audit` module is deleted

- **Given** the `@ultranos/audit-logger` is designed for server-side (Supabase client)
- **When** used in a React Native context
- **Then** the logger uses a mobile-compatible adapter (SQLCipher-backed local ledger with SHA-256 hash chaining)
- **And** the adapter implements the same `AuditLogger` interface

- **Given** the mobile app is offline
- **When** an audit event is emitted
- **Then** it is persisted to the local SQLCipher audit ledger
- **And** it is queued for sync to Hub via the sync engine with priority matching consent/allergy tier

- **Given** the in-memory `auditQueue` array previously used for batching
- **When** it is replaced by the persistent ledger
- **Then** audit events survive app crashes and restarts

### Story 29.3: Migrate Lab-Lite to @ultranos/audit-logger

As a compliance officer,
I want lab-lite audit events to use the canonical logger with hash chaining,
So that lab technician PHI access (patient verification, result uploads) has full audit integrity.

**Acceptance Criteria:**

- **Given** lab-lite currently uses raw `fetch` for audit reporting (auth events + queue events)
- **When** this story is complete
- **Then** all audit calls in lab-lite import from `@ultranos/audit-logger`
- **And** the client-side audit ledger in IndexedDB uses SHA-256 hash chaining

- **Given** `@ultranos/audit-logger` is added as a dependency
- **When** `package.json` is updated
- **Then** `"@ultranos/audit-logger": "workspace:*"` is declared in dependencies

- **Given** lab-lite audit events previously used fire-and-forget `fetch`
- **When** the Hub is unreachable
- **Then** events are stored in the local IndexedDB audit ledger
- **And** they are synced when connectivity is restored

### Story 29.4: Audit Dead-Letter Queue and Retry Mechanism

As a system operator,
I want failed audit events to be captured and retried,
So that no PHI access goes permanently unaudited.

**Acceptance Criteria:**

- **Given** `AuditLogger.emit()` fails on the Hub API (DB error, connection failure)
- **When** the error is caught
- **Then** the full event payload is inserted into a `dead_letter_audit` table with columns: `id`, `event_payload` (JSONB), `error_message`, `retry_count`, `next_retry_at`, `created_at`

- **Given** dead-letter entries exist with `retry_count < 5`
- **When** a scheduled job runs (every 5 minutes)
- **Then** entries are retried via `AuditLogger.emit()` with exponential backoff
- **And** successful retries are deleted from `dead_letter_audit` and present in the main audit chain

- **Given** a dead-letter entry reaches `retry_count = 5`
- **When** all retries are exhausted
- **Then** the entry is marked `status: 'permanent_failure'`
- **And** an operational P2 alert is emitted

- **Given** client-side audit events fail to sync via `audit.sync`
- **When** the client retry mechanism fires
- **Then** events are retried with the same exponential backoff strategy
- **And** the client audit ledger retains all unsent events until confirmed synced

### Story 29.5: Audit Event Pruning with Configurable Retention

As a system operator,
I want synced and expired audit events in client-side IndexedDB to be automatically pruned,
So that long-running clinic devices don't suffer unbounded storage growth.

**Acceptance Criteria:**

- **Given** audit events in the client-side IndexedDB ledger have status `'synced'`
- **When** the event is older than the configured retention period (default: 7 days)
- **Then** the event is deleted from the local ledger

- **Given** audit events with status `'failed'` and `retryCount >= 5`
- **When** the event is older than 30 days
- **Then** the event is deleted with a warning log entry noting permanent data loss

- **Given** the pruning job runs
- **When** it completes
- **Then** it emits a local metric: `{ prunedSynced: N, prunedFailed: M, remaining: R }`

- **Given** audit events with status `'pending'`
- **When** pruning runs
- **Then** pending events are NEVER pruned regardless of age

### Story 29.6: Audit Security Events (Session, Auth, Authorization)

As a security analyst,
I want session expiry, re-authentication attempts, and authorization denials to be audited,
So that security incidents can be investigated through the audit trail.

**Acceptance Criteria:**

- **Given** a session expires due to inactivity timeout (30 min)
- **When** the SessionTimeoutWrapper triggers expiry
- **Then** an audit event is emitted: `{ action: 'SESSION_EXPIRED', resourceType: 'Session', actorId, metadata: { reason: 'inactivity', sessionDuration } }`

- **Given** a user attempts re-authentication via the re-auth modal
- **When** re-auth succeeds
- **Then** an audit event is emitted: `{ action: 'REAUTH_SUCCESS', resourceType: 'Session' }`
- **When** re-auth fails
- **Then** an audit event is emitted: `{ action: 'REAUTH_FAILURE', resourceType: 'Session', outcome: 'DENIED' }`

- **Given** `enforceResourceAccess`, `roleRestrictedProcedure`, or `protectedProcedure` denies a request
- **When** the authorization check fails
- **Then** an audit event is emitted: `{ action: 'AUTHORIZATION_DENIED', resourceType, actorId, metadata: { requiredRole, actualRole, endpoint } }`

- **Given** the `sendAlert` function in monitoring emits to `audit_events`
- **When** it writes an alert record
- **Then** it uses `AuditLogger.emit()` instead of direct Supabase insert
- **And** the alert is part of the hash chain

### Story 29.7: Fix audit.sync Client Event Outcome Preservation

As a compliance officer,
I want client-side audit event outcomes (SUCCESS, DENIED, ERROR) to be preserved when synced to Hub,
So that the audit trail accurately reflects what happened on the client.

**Acceptance Criteria:**

- **Given** the `audit.sync` Zod input schema
- **When** a client event includes an `outcome` field
- **Then** the schema accepts `outcome` as `z.enum(['SUCCESS', 'DENIED', 'ERROR']).optional()`

- **Given** a client audit event with `outcome: 'DENIED'`
- **When** it is synced to Hub via `audit.sync`
- **Then** the Hub audit record preserves `outcome: 'DENIED'` (not overwrite with `'SUCCESS'`)

- **Given** a client audit event without an `outcome` field
- **When** it is synced
- **Then** the Hub defaults to `outcome: 'SUCCESS'` for backwards compatibility

---

## Epic 30: Sync Engine Hardening & Reliability

The sync engine reliably delivers all queued data to the Hub with no data loss, no duplicates, and correct ordering — even across tab restarts, auth token expiry, and concurrent operations.

### Story 30.1: Server-Side HLC Timestamp Generation

As a system architect,
I want all Hub API mutations to stamp records with HLC timestamps instead of wall-clock `new Date()`,
So that conflict resolution and sync ordering are consistent across all spokes.

**Acceptance Criteria:**

- **Given** any Hub API mutation that writes a timestamp (`dispensed_at`, `meta_last_updated`, `created_at`, `scannedAt`, etc.)
- **When** the mutation executes
- **Then** it generates an HLC timestamp via a server-side `HybridLogicalClock` instance
- **And** the HLC value is stored in the `hlc_timestamp` column

- **Given** the server-side HLC clock
- **When** it is initialized
- **Then** the `nodeId` is derived from the server instance identifier (hostname or deployment ID)
- **And** it is NOT a hardcoded string

- **Given** existing records with `hlc_timestamp = NULL`
- **When** a migration runs
- **Then** NULL `hlc_timestamp` values are backfilled from the `created_at` or `updated_at` wall-clock column using a deterministic conversion
- **And** the migration is idempotent

- **Given** the `patients` table
- **When** this story is complete
- **Then** the table has an `hlc_timestamp` column populated on all rows

### Story 30.2: Cross-Tab Drain Mutex via Web Lock API

As a clinician with multiple tabs open,
I want only one tab to drain the sync queue at a time,
So that duplicate pushes to the Hub are prevented.

**Acceptance Criteria:**

- **Given** two browser tabs running the same spoke app (OPD-Lite, Pharmacy-Lite, or Lab-Lite)
- **When** the drain worker activates in both tabs
- **Then** only one tab acquires the `'sync-drain-lock'` via the Web Locks API
- **And** the other tab skips the drain cycle

- **Given** the tab holding the lock is closed or crashes
- **When** the lock is released by the browser
- **Then** the surviving tab acquires the lock on its next drain cycle

- **Given** the Web Locks API is unavailable (older browser)
- **When** the drain worker starts
- **Then** it falls back to the current behavior (no lock) with a console warning

### Story 30.3: Transactional Enqueue Deduplication

As a system developer,
I want sync queue enqueue operations to be atomic,
So that concurrent calls for the same resource don't create duplicate entries.

**Acceptance Criteria:**

- **Given** two concurrent calls to `enqueue()` for the same `resourceId`
- **When** both execute simultaneously
- **Then** only one `SyncQueueEntry` is created in IndexedDB
- **And** the second call updates the existing entry's payload and timestamp

- **Given** the `enqueue()` function
- **When** it performs the read-check-write operation
- **Then** the entire operation is wrapped in a `db.transaction('rw', ...)` Dexie transaction

- **Given** `enqueueForRetry()` in pharmacy dispensing sync
- **When** it generates a new UUID via `crypto.randomUUID()`
- **Then** it first checks for an existing entry with the same `resourceId`
- **And** reuses the existing entry ID if found

### Story 30.4: Hub sync.push Optimistic Locking

As a system architect,
I want Hub sync pushes to use optimistic locking,
So that concurrent pushes from different spokes don't silently overwrite each other.

**Acceptance Criteria:**

- **Given** a sync.push request with an `hlcTimestamp` value
- **When** the Hub processes the upsert
- **Then** the SQL uses `WHERE hlc_timestamp = $expected` (or `< $incoming` for LWW tiers)
- **And** a mismatch returns a `409 Conflict` response with the current server HLC

- **Given** a `409 Conflict` response
- **When** the drain worker receives it
- **Then** the `onConflict` handler is invoked with both local and server versions
- **And** the entry is NOT silently marked as `'synced'`

- **Given** no `onConflict` handler is configured for a resource type
- **When** a conflict occurs
- **Then** the entry is marked `'conflict'` (new status) instead of `'synced'`
- **And** it appears in the sync dashboard for manual review

### Story 30.5: Fix HLC Lexicographic Comparison in SQL

As a system architect,
I want HLC timestamps to compare correctly in PostgreSQL queries,
So that sync.pull and conflict detection return temporally accurate results.

**Acceptance Criteria:**

- **Given** HLC timestamps stored as strings with format `{wallMs}-{counter}-{nodeId}`
- **When** SQL queries use `>` or `<` operators for temporal ordering
- **Then** the comparison produces correct temporal results

- **Given** the chosen fix approach (zero-padded string format OR numeric `wall_ms` column + index)
- **When** applied via migration
- **Then** all existing HLC values are migrated to the new format
- **And** `sync.pull` queries return correct chronological results

- **Given** the HLC comparison function
- **When** two timestamps have identical `wallMs` but different counters
- **Then** the counter breaks the tie correctly
- **And** `nodeId` is used as final tiebreaker

### Story 30.6: Sync Queue Lifecycle — Purge and Retention

As a system operator,
I want synced and permanently failed sync queue entries to be automatically purged,
So that clinic devices don't run out of IndexedDB quota.

**Acceptance Criteria:**

- **Given** sync queue entries with status `'synced'`
- **When** they are older than the retention period (default: 48 hours)
- **Then** they are deleted from IndexedDB by a periodic cleanup job

- **Given** sync queue entries with status `'failed'` and `retryCount >= maxRetries`
- **When** they are older than 7 days
- **Then** they are deleted with a warning metric emitted

- **Given** the cleanup job runs
- **When** it detects IndexedDB usage exceeding 80% of estimated quota
- **Then** it reduces retention periods by 50% and runs an aggressive purge
- **And** emits a `STORAGE_PRESSURE` metric

- **Given** entries with status `'pending'` or `'syncing'`
- **When** cleanup runs
- **Then** these entries are NEVER purged regardless of age

### Story 30.7: Auth Token Refresh Integration in Drain Worker

As a clinician,
I want the sync drain worker to handle expired JWT tokens gracefully,
So that my data syncs successfully without manual intervention after token refresh.

**Acceptance Criteria:**

- **Given** the drain worker makes an API call with an expired JWT (15-min expiry)
- **When** the Hub returns `401 Unauthorized`
- **Then** the drain worker pauses processing
- **And** triggers a Supabase token refresh via `supabase.auth.refreshSession()`

- **Given** the token refresh succeeds
- **When** a new valid JWT is available
- **Then** the drain worker resumes processing from where it paused
- **And** the failed entry is retried with the new token (not counted as a retry failure)

- **Given** the token refresh fails (refresh token expired)
- **When** no valid session can be restored
- **Then** the drain worker stops entirely
- **And** the sync dashboard shows `'AUTH_REQUIRED'` status
- **And** entries remain in `'pending'` status (not `'failed'`)

### Story 30.8: QuotaExceededError Handling and Recovery

As a system developer,
I want sync queue operations to handle IndexedDB quota errors gracefully,
So that quota exhaustion doesn't cause infinite retry loops or data loss.

**Acceptance Criteria:**

- **Given** an `enqueue()` or `markFailed()` call
- **When** IndexedDB throws `QuotaExceededError`
- **Then** the error is caught and classified as `STORAGE_FULL`
- **And** the drain worker triggers an immediate aggressive purge of synced entries

- **Given** the aggressive purge frees sufficient space
- **When** the original operation is retried
- **Then** it succeeds and processing continues normally

- **Given** the purge does not free sufficient space
- **When** the retry still fails with `QuotaExceededError`
- **Then** the sync dashboard shows `'STORAGE_FULL'` status with guidance
- **And** no further enqueue attempts are made until space is freed

### Story 30.9: SyncQueueEntry Type Alignment

As a developer,
I want the `SyncQueueEntry` type in `db.ts` to match the sync-engine definition,
So that TypeScript catches status mismatches at compile time.

**Acceptance Criteria:**

- **Given** `db.ts` defines status as `'pending' | 'in-flight' | 'failed'`
- **And** sync-engine defines `'pending' | 'syncing' | 'failed' | 'synced'`
- **When** this story is complete
- **Then** both use a single shared type from `@ultranos/shared-types`: `'pending' | 'syncing' | 'failed' | 'synced' | 'conflict' | 'awaiting-key'`

- **Given** the `recoverStale` function resets stuck `'syncing'` entries
- **When** it checks for staleness
- **Then** it uses the entry's HLC timestamp (not wall clock) for age calculation
- **And** clock backward adjustments do not prematurely reset entries

---

## Epic 31: FHIR R4 Compliance & Schema Hardening

All FHIR resources, types, and database schemas strictly conform to FHIR R4 conventions with proper validation, consistent Meta fields, and correct namespace usage.

### Story 31.1: Add TypeScript Interfaces for All FHIR Resources

As a developer,
I want every FHIR resource to have both a Zod schema and a TypeScript interface,
So that the codebase has consistent patterns for type checking and runtime validation.

**Acceptance Criteria:**

- **Given** `FhirPatient` has both an interface and a Zod schema
- **When** this story is complete
- **Then** `FhirEncounter`, `FhirMedicationRequest`, `FhirMedicationDispense`, `FhirDiagnosticReport`, `FhirMedicationStatement`, and `FhirClinicalImpression` all have both

- **Given** each new interface
- **When** it is defined
- **Then** it is derived from the Zod schema via `z.infer<typeof Schema>` to prevent drift
- **And** exported from `packages/shared-types/src/fhir/`

### Story 31.2: FHIR Meta Fields and _ultranos Namespace Migration

As a system architect,
I want all database tables to use FHIR-canonical Meta field names and the `_ultranos` namespace correctly,
So that the data layer conforms to FHIR R4 and Ultranos conventions.

**Acceptance Criteria:**

- **Given** the `patients` table is missing `version_id` and `last_updated`
- **When** a migration runs
- **Then** columns `version_id` (TEXT) and `last_updated` (TIMESTAMPTZ) are added
- **And** existing rows are backfilled from `updated_at`

- **Given** `created_at` exists as a top-level column across multiple tables
- **When** the FHIR Meta convention is enforced
- **Then** `created_at` remains as a DB-layer operational column
- **And** API responses map it to `_ultranos.createdAt` (not in `meta`)
- **And** `meta.lastUpdated` and `meta.versionId` are populated from the corresponding DB columns

- **Given** `birthYearOnly` exists on the patient type outside `_ultranos`
- **When** this story is complete
- **Then** it is moved to `_ultranos.birthYearOnly` in the type definition
- **And** all consumers are updated

### Story 31.3: FhirDateTimeOrDateSchema Adoption Across All Schemas

As a developer,
I want FHIR datetime fields to accept both full ISO datetimes and partial dates,
So that legitimate FHIR data (e.g., `2025-06-15`) is not rejected by validation.

**Acceptance Criteria:**

- **Given** `z.string().datetime()` is used across all shared-types schemas
- **When** this story is complete
- **Then** all FHIR datetime fields use `FhirDateTimeOrDateSchema` from `common.schema.ts`
- **And** it accepts: full ISO datetime, date-only, year-month, and year-only

- **Given** the `FhirDateTimeOrDateSchema`
- **When** an invalid string is passed (e.g., `"not-a-date"`, empty string)
- **Then** validation fails with a descriptive error

### Story 31.4: HLC Timestamp Format Validation

As a developer,
I want HLC timestamp inputs to be format-validated at the Zod schema level,
So that malformed HLC strings don't corrupt lexicographic ordering or comparison logic.

**Acceptance Criteria:**

- **Given** all router procedures that accept `hlcTimestamp` as input
- **When** the input is validated
- **Then** the Zod schema uses `.refine()` with a regex matching the HLC format: `{zero-padded-wallMs}-{counter}-{nodeId}`

- **Given** a malformed HLC string (e.g., `"abc"`, `""`, `"123"`)
- **When** it is submitted to any endpoint
- **Then** the request is rejected with a `BAD_REQUEST` error describing the expected format

- **Given** the format regex
- **When** it validates a well-formed HLC
- **Then** it ensures `wallMs` is zero-padded to a fixed width (enabling correct lexicographic comparison)

### Story 31.5: FHIR Reference Format Validation

As a developer,
I want FHIR `Reference` fields to validate the `{ResourceType}/{id}` format,
So that malformed references are caught at validation time instead of failing on Hub sync.

**Acceptance Criteria:**

- **Given** `ReferenceSchema` in `common.schema.ts` currently accepts any string
- **When** this story is complete
- **Then** `ReferenceSchema.reference` uses `.refine()` to match pattern: `{ResourceType}/{uuid-or-id}`
- **And** the allowed resource types are constrained to the known FHIR types used in the project

- **Given** a malformed reference (e.g., `""`, `"just-an-id"`, `"Unknown/123"`)
- **When** it is validated
- **Then** validation fails with a descriptive error

- **Given** existing data may contain the placeholder `"Practitioner/current-user"`
- **When** validation runs
- **Then** the placeholder format is accepted but flagged with a deprecation warning in development mode

### Story 31.6: FHIR DetectedIssue Mapping for Interaction Overrides

As a system architect,
I want drug interaction overrides to be stored as FHIR DetectedIssue resources,
So that the data model conforms to FHIR R4 standards for clinical decision support.

**Acceptance Criteria:**

- **Given** interaction overrides are currently stored in the `_ultranos` extension namespace
- **When** this story is complete
- **Then** a `FhirDetectedIssue` type is defined in `shared-types`
- **And** overrides are mapped to `DetectedIssue` resources with `status`, `severity`, `mitigation[].action` (the override reason)

- **Given** existing override data in `_ultranos`
- **When** a migration path is provided
- **Then** existing records can be transformed to `DetectedIssue` format
- **And** the `_ultranos` override fields are deprecated with a removal timeline

### Story 31.7: Standard Terminology Codes for Formulary

As a system architect,
I want the medication formulary to use standard terminology codes alongside internal codes,
So that interoperability with external systems is possible.

**Acceptance Criteria:**

- **Given** `medications_subset.json` uses internal codes (`urn:ultranos:formulary/RX001`)
- **When** this story is complete
- **Then** each medication entry includes optional `rxnormCode` and `atcCode` fields
- **And** internal codes are retained as a fallback

- **Given** the drug interaction checker compares by display name
- **When** standard codes are available
- **Then** the checker preferentially matches by `rxnormCode`
- **And** falls back to display name only when codes are absent

- **Given** the formulary will grow beyond 100 items
- **When** the data model supports codes
- **Then** the Dexie vocabulary table indexes both `rxnormCode` and `atcCode` for efficient lookup

---

## Epic 32: Security Hardening Phase 2

Close all known exploitable security vulnerabilities — forged QR acceptance, client-supplied identity trust, unverified webhooks, rate limiting gaps, and credential exposure.

### Story 32.1: Server-Derived Identity for All Mutations

As a security engineer,
I want all mutation endpoints to derive practitioner/patient identity from the JWT context,
So that client-supplied identity cannot be forged for false attribution.

**Acceptance Criteria:**

- **Given** `recordDispense` currently accepts client-supplied `pharmacistRef`
- **When** this story is complete
- **Then** `pharmacistRef` is derived from `ctx.user.sub` on the server
- **And** the client input field is removed from the Zod schema

- **Given** `recordDispense` accepts client-supplied `patientRef`
- **When** a dispense is created
- **Then** `patientRef` is validated against the prescription's `subject_reference`
- **And** a mismatch returns `BAD_REQUEST` with "Patient does not match prescription"

- **Given** any endpoint that constructs a FHIR `Reference` for the acting user
- **When** the reference is built
- **Then** it uses `Practitioner/${ctx.user.sub}` (or patient equivalent)
- **And** no client-supplied actor reference is trusted

- **Given** the pharmacy audit service reads `pharmacistRef` from `dispense.performer[0].actor.reference`
- **When** this story is complete
- **Then** audit services also read actor identity from the auth context, not from the data record

### Story 32.2: recordDispense Validation and Safety Gates

As a pharmacist,
I want the dispensing endpoint to validate all preconditions before creating records,
So that orphan records, wrong-patient dispenses, and interaction-blocked prescriptions are prevented.

**Acceptance Criteria:**

- **Given** a `recordDispense` call with a `prescriptionId`
- **When** the prescription is looked up
- **Then** the lookup happens BEFORE the dispense record insert (not after)
- **And** a non-existent prescription returns `NOT_FOUND`

- **Given** a prescription with `interaction_check === 'BLOCKED'`
- **When** `recordDispense` is called
- **Then** the request is rejected with `PRECONDITION_FAILED: "Blocked drug interaction must be resolved before dispensing"`
- **And** an audit event records the blocked attempt

- **Given** the dispense insert succeeds but the conflict log insert fails
- **When** the error is caught
- **Then** the dispense record is rolled back (or the conflict failure is logged and continued — not thrown as INTERNAL_SERVER_ERROR)

- **Given** a duplicate dispense attempt (same prescription + pharmacist within 60s)
- **When** `recordDispense` is called
- **Then** the idempotency guard returns the existing dispense record
- **And** no duplicate is created

### Story 32.3: Rate Limiting on Sensitive Endpoints

As a security engineer,
I want sensitive endpoints to be protected by Redis-backed rate limiting,
So that brute-force attacks and PHI enumeration are mitigated.

**Acceptance Criteria:**

- **Given** `guardian.verifyOtp` has no rate limiting
- **When** this story is complete
- **Then** it is limited to 5 attempts per phone number per 15 minutes
- **And** exceeding the limit returns `429 Too Many Requests`

- **Given** `verifyPatient` (lab) allows unlimited calls
- **When** rate limiting is applied
- **Then** it is limited to 20 lookups per authenticated user per minute

- **Given** `analyzeUpload` (lab OCR) has no rate limiting
- **When** rate limiting is applied
- **Then** it is limited to 10 calls per user per minute

- **Given** `registerOrganization` is unauthenticated
- **When** rate limiting is applied
- **Then** it is limited to 3 registrations per IP per hour via Redis rate limiter

- **Given** all rate-limited endpoints
- **When** Redis is unavailable
- **Then** the rate limiter fails CLOSED for security-sensitive endpoints (verifyOtp, registration)
- **And** fails OPEN for clinical endpoints (verifyPatient) with a degraded-mode log entry

### Story 32.4: Input Sanitization — PostgREST Wildcard Injection

As a security engineer,
I want user search inputs to be sanitized against SQL LIKE wildcards,
So that patients cannot be enumerated via `%` and `_` pattern injection.

**Acceptance Criteria:**

- **Given** `sanitizeFilterValue` in `patient.ts` strips `,.*()\\` but not `%` and `_`
- **When** this story is complete
- **Then** `%` is escaped to `\%` and `_` is escaped to `\_` before being passed to PostgREST `.ilike()`

- **Given** a search query containing `%` or `_`
- **When** the sanitized query is executed
- **Then** it matches literal `%` and `_` characters only

### Story 32.5: Practitioner Key TTL and KRL Cache Revalidation

As a pharmacist,
I want cached practitioner signing keys to automatically expire and revalidate,
So that revoked keys are detected within the TTL window.

**Acceptance Criteria:**

- **Given** a practitioner key cached in IndexedDB with `cachedAt` timestamp
- **When** the cache entry is older than 24 hours
- **Then** `getCachedKey` returns `{ stale: true }`
- **And** the calling code invokes `revalidateKey()` before trusting the key

- **Given** `revalidateKey()` is currently not called by any code path
- **When** this story is complete
- **Then** the pharmacy verification flow calls `revalidateKey()` when `stale: true`
- **And** the OPD verification flow does the same

- **Given** `fetchAndCachePractitionerKey` stores keys without checking the local KRL
- **When** a key is fetched from Hub
- **Then** it is cross-checked against the local KRL before caching
- **And** a revoked key is not cached

### Story 32.6: JWK Cache TTL and Rotation-Aware Refresh

As a system operator,
I want the JWT verification key cache to have a TTL,
So that key rotations take effect without requiring process restarts.

**Acceptance Criteria:**

- **Given** `_cachedJwk` is module-level with no TTL
- **When** this story is complete
- **Then** the cache has a 1-hour TTL
- **And** after TTL expiry, the next verification request fetches fresh JWKS

- **Given** a JWT verification fails with the cached key
- **When** the failure type is `JWKInvalid` or `JWSSignatureVerificationFailed`
- **Then** the cache is immediately invalidated and a fresh JWKS fetch is attempted
- **And** verification is retried once with the new key

### Story 32.7: Server-Side OCR Proxy (Remove Client API Key)

As a security engineer,
I want Cloud Vision OCR calls to go through a server-side proxy,
So that the Google API key is not exposed in the client bundle.

**Acceptance Criteria:**

- **Given** `NEXT_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY` is used in client-side `ocr.ts`
- **When** this story is complete
- **Then** a Hub API endpoint `ocr.analyze` accepts the image and calls Cloud Vision server-side
- **And** the `NEXT_PUBLIC_` env var is removed

- **Given** the new server-side endpoint
- **When** it receives an image
- **Then** it validates file size (<10MB), MIME type, and rate limits per user
- **And** passes the image to Cloud Vision with the server-side API key

### Story 32.8: Guardian Nonce Enforcement — Fail Closed

As a security engineer,
I want guardian OTP nonce verification to fail closed when Redis is unavailable,
So that OTP verification cannot be bypassed.

**Acceptance Criteria:**

- **Given** `createLink` currently skips OTP nonce verification when Redis is unavailable
- **When** this story is complete
- **Then** `createLink` returns `SERVICE_UNAVAILABLE` when Redis is down
- **And** the error message instructs the user to try again later

- **Given** `verifyOtp` checks the nonce
- **When** Redis is unavailable
- **Then** verification returns `SERVICE_UNAVAILABLE` (not success)

- **Given** a development/test environment
- **When** `NODE_ENV === 'development'` or `NODE_ENV === 'test'`
- **Then** a configurable flag `ALLOW_NONCE_BYPASS_IN_DEV=true` permits the old fail-open behavior
- **And** production environments always fail closed

### Story 32.9: Webhook Signature Verification (Apple & Google)

As a system operator,
I want App Store and Play Store webhook payloads to be cryptographically verified,
So that unauthenticated tier manipulation via forged webhooks is prevented.

**Acceptance Criteria:**

- **Given** an Apple App Store Server Notification (V2)
- **When** the webhook endpoint receives it
- **Then** the JWS signature is verified against Apple's root certificate chain
- **And** unsigned or tampered payloads are rejected with `401`

- **Given** a Google Play Developer Notification via Pub/Sub
- **When** the webhook endpoint receives it
- **Then** the Pub/Sub push token audience is verified
- **And** messages with invalid tokens are rejected

- **Given** `validatePurchaseReceipt` currently returns `true` unconditionally
- **When** this story is complete
- **Then** it calls the respective store API (Google Play Developer API / Apple App Store Server API)
- **And** returns `false` for invalid or already-consumed receipts
- **And** missing API credentials cause the function to return `false` (fail closed)

### Story 32.10: Emergency Break-Glass Access Model

As an emergency physician,
I want to access patient data in emergency situations even without explicit consent,
So that life-threatening situations are not blocked by access controls.

**Acceptance Criteria:**

- **Given** `GrantorRole.EMERGENCY_OVERRIDE` exists as an enum but is never checked
- **When** this story is complete
- **Then** `enforceConsentMiddleware` accepts an `emergencyOverride: true` flag on the request context

- **Given** an emergency override is invoked
- **When** consent would normally be denied
- **Then** access is granted for a time-bounded window (configurable, default 4 hours)
- **And** an audit event is emitted: `{ action: 'EMERGENCY_OVERRIDE', resourceType: 'Consent', metadata: { reason, duration, actorId } }`

- **Given** an emergency override is active
- **When** the time window expires
- **Then** access reverts to normal consent enforcement
- **And** a follow-up audit event records the override expiry

- **Given** emergency overrides
- **When** they are reviewed
- **Then** a dedicated admin dashboard view lists all override events with actor, patient, duration, and reason
- **And** overrides without a documented reason are flagged for review

---

## Epic 33: Clinical Safety & Drug Interaction Improvements

Drug interaction checks evaluate the patient's full active medication list, allergy matching uses coded substances, and all clinical safety invariants are tested.

### Story 33.1: Interaction Check Against Full Active MedicationStatements

As a clinician,
I want drug interaction checks to evaluate against all of the patient's active medications (not just pending prescriptions),
So that dangerous interactions with chronic medications are detected before prescribing.

**Acceptance Criteria:**

- **Given** a patient has active `MedicationStatement` records (chronic meds)
- **When** a new prescription is being entered and interaction check runs
- **Then** `checkInteractions()` receives both pending prescriptions AND active MedicationStatements
- **And** interactions between the new drug and any active med are detected

- **Given** the patient has no MedicationStatement data (not yet synced or doesn't exist)
- **When** the interaction check runs
- **Then** a warning banner displays: "Interaction check limited — active medication history unavailable"
- **And** the check still runs against pending prescriptions

- **Given** a CONTRAINDICATED interaction is found with a chronic medication
- **When** the clinician reviews
- **Then** the interaction details show which active medication triggered the alert
- **And** the clinician can override with a documented reason

### Story 33.2: Coded Substance Model for Allergy Matching

As a clinician,
I want allergy matching to use coded substances (SNOMED CT / local drug codes) instead of free-text substring matching,
So that cross-class matches (PCN to Penicillin) are caught and false positives (iron in ciprofloxacin) are eliminated.

**Acceptance Criteria:**

- **Given** `AllergyEntry.tsx` currently provides free-text only input
- **When** this story is complete
- **Then** the allergy entry UI offers an optional coded substance autocomplete (from the local drug vocabulary)
- **And** free-text entry is still permitted as fallback

- **Given** an allergy has a coded substance (e.g., SNOMED `764146007` for Penicillin)
- **When** a drug interaction/allergy check runs
- **Then** the check uses code-based matching first (drug class membership)
- **And** free-text substring matching is used only when no code is available

- **Given** the `AllergyIntolerance.code.coding` field
- **When** a coded substance is selected
- **Then** the coding array is populated with `{ system: 'http://snomed.info/sct', code, display }`

### Story 33.3: checkAllergyMatch Robustness and Edge Cases

As a developer,
I want `checkAllergyMatch` to handle edge cases safely,
So that crashes, false positives, and missed matches are minimized.

**Acceptance Criteria:**

- **Given** an allergy record with `_ultranos` undefined or missing `substanceFreeText`
- **When** `checkAllergyMatch` is called
- **Then** it safely returns no match (not TypeError crash)
- **And** the allergy is logged as skipped with reason `'missing_substance_data'`

- **Given** allergy matching uses case-sensitive `Set` deduplication
- **When** "Penicillin" and "penicillin" are both present
- **Then** they are treated as the same substance (case-insensitive normalization)

- **Given** duplicate drug pairs exist in the vocabulary with different severities
- **When** the lookup map is built
- **Then** the highest severity wins (CONTRAINDICATED > SEVERE > MODERATE > MILD)

- **Given** a substance string composed entirely of Unicode non-breaking spaces
- **When** it is submitted
- **Then** the regex guard rejects it as empty

### Story 33.4: Drug Interaction Test Coverage — All Mandatory Paths

As a QA engineer,
I want comprehensive test coverage for all drug interaction code paths required by CLAUDE.md,
So that clinical safety invariants are verified in CI.

**Acceptance Criteria:**

- **Given** CLAUDE.md mandates tests for CONTRAINDICATED blocking
- **When** two drugs with CONTRAINDICATED severity are checked
- **Then** the test asserts `result === 'BLOCKED'` and prescribing is prevented

- **Given** CLAUDE.md mandates tests for ALLERGY_MATCH blocking
- **When** a prescribed drug matches a patient allergy
- **Then** the test asserts `result === 'ALLERGY_BLOCKED'` with the matching allergy substance

- **Given** CLAUDE.md mandates tests for override-with-reason logging
- **When** a clinician overrides a blocked interaction with a reason
- **Then** the test asserts the override is logged in the audit trail with the reason text

- **Given** CLAUDE.md mandates tests for "check unavailable" fallback
- **When** `checkInteractions()` throws (network error, DB unavailable)
- **Then** the test asserts the UI shows "Interaction check unavailable" warning
- **And** does NOT show "No interactions found"

- **Given** `NONE` severity entries in the vocabulary
- **When** they produce interactions
- **Then** the result is `CLEAR` with an empty interactions array (not contradictory non-empty array)

### Story 33.5: Add Prescribe Command to Clinical Command Palette

As a clinician,
I want a `>Prescribe` command in the clinical command palette,
So that I can quickly navigate to the prescription entry section via keyboard.

**Acceptance Criteria:**

- **Given** the clinical command palette exists (Story 2.5)
- **When** this story is complete
- **Then** `CLINICAL_COMMANDS` includes a `Prescribe` entry
- **And** invoking it navigates to/focuses the prescription entry section

- **Given** the Prescribe command
- **When** the prescription section is not visible (encounter not started)
- **Then** the command is grayed out with tooltip "Start an encounter first"

### Story 33.6: Sensitive Medication Privacy Mapping

As a patient,
I want antiretrovirals and psychiatric medications to be flagged as sensitive,
So that my privacy is protected when others view my medical history.

**Acceptance Criteria:**

- **Given** `humanizeMedication` currently returns `isSensitive: false` for all medications
- **When** this story is complete
- **Then** a sensitivity mapping (based on ATC code drug classes or a curated list) identifies sensitive categories: antiretrovirals, psychiatric medications, reproductive health, substance abuse treatment

- **Given** a medication is flagged as sensitive
- **When** it appears in the patient timeline
- **Then** it is masked as "Private Health Matter" by default
- **And** requires biometric unlock to reveal (existing Story 18.9 pattern)

- **Given** the sensitivity mapping
- **When** a medication has no ATC/RxNorm code (free-text only)
- **Then** keyword-based heuristic matching is used as fallback
- **And** ambiguous matches default to non-sensitive (to avoid overly aggressive masking)

---

## Epic 34: Infrastructure & DevOps Resilience

Eliminate operational risks from memory leaks, missing cron wiring, module-level singletons, and Dexie schema fragility across all apps.

### Story 34.1: Dexie Schema Management and Migration Framework

As a developer,
I want a single source of truth for Dexie table definitions with a proper migration framework,
So that schema upgrades don't silently drop tables and new versions don't repeat all prior definitions.

**Acceptance Criteria:**

- **Given** each Dexie `version(N).stores()` call currently redeclares all tables
- **When** this story is complete
- **Then** a `DexieSchemaManager` class maintains the canonical table registry
- **And** each version upgrade only declares changes (added tables, new indexes)
- **And** the manager auto-includes unchanged tables from previous versions

- **Given** a Dexie version upgrade occurs while another tab has the DB open
- **When** the `versionchange` event fires
- **Then** the old tab shows a notification: "Database update required — please reload"
- **And** closes its DB connection to unblock the upgrade

- **Given** a schema change is needed
- **When** the developer adds a migration
- **Then** they only specify the delta (new table, new index, altered column)
- **And** the framework handles the full stores declaration

### Story 34.2: Cron Job Wiring for Monitoring and Lifecycle Functions

As a system operator,
I want all exported monitoring and lifecycle functions to be connected to scheduled execution,
So that alerting, pruning, and state machine transitions actually run in production.

**Acceptance Criteria:**

- **Given** `evaluateP95Alerts()`, `evaluateErrorRateAlerts()`, `runSyncQueueMonitor()` are dead code
- **When** this story is complete
- **Then** they are registered in the cron runner with appropriate schedules (P95/error rate: every 60s, sync queue monitor: every 5 min)

- **Given** `processPendingSuspensions()` has no execution trigger
- **When** this story is complete
- **Then** it runs daily at 02:00 UTC via the Edge Function cron or the cron runner

- **Given** audit chain verification has no staleness detection
- **When** the cron job stops running
- **Then** a heartbeat mechanism detects the missed run within 2x the scheduled interval
- **And** a P2 alert is emitted

- **Given** the Supabase Edge Function `subscription-lifecycle`
- **When** its cron schedule is configured
- **Then** it runs daily and processes trial expirations, grace period transitions, and suspension enforcement

### Story 34.3: Module-Level Singleton HMR Safety

As a developer,
I want module-level singletons to be safe across Hot Module Replacement,
So that development doesn't produce stale caches, leaked timers, or duplicate intervals.

**Acceptance Criteria:**

- **Given** module-level singletons: Redis client, Fuse instance, drug cache map, rate limit maps, `collectDefaultMetrics` timer
- **When** HMR replaces the module
- **Then** the old singleton is disposed (timers cleared, connections closed)
- **And** the new module creates a fresh singleton

- **Given** the pattern for HMR-safe singletons
- **When** implemented
- **Then** it uses `if (module.hot) { module.hot.dispose(() => cleanup()) }` or a global registry keyed by module path
- **And** production builds skip the HMR guard with zero overhead

- **Given** `cachedMap` in `checker.ts` (drug-db)
- **When** a second adapter is instantiated (e.g., in tests)
- **Then** it gets its own cache (per-adapter, not module-global)

### Story 34.4: Bounded Rate Limit Maps with TTL Eviction

As a system operator,
I want in-memory rate limit maps to have bounded size and automatic eviction,
So that long-running processes don't leak memory.

**Acceptance Criteria:**

- **Given** `rateLimitMap` in `admin.ts` and other modules grows unbounded
- **When** this story is complete
- **Then** all in-memory rate limit maps use a `BoundedMap` with max entries: 10,000, TTL per entry: 2x the rate limit window, LRU eviction when max entries reached

- **Given** stale entries currently only evict when `map.size > MAX_ENTRIES`
- **When** the bounded map is used
- **Then** eviction runs on every write (amortized O(1) via LRU linked list)

- **Given** a module-level consent cache (`aiConsentCache`) with no size bound
- **When** this story is complete
- **Then** it uses the same `BoundedMap` with max 1,000 entries

### Story 34.5: Case-Transform Type Guards and Safety

As a developer,
I want `toSnakeCase`/`toCamelCase` to handle non-plain objects safely,
So that Date, Map, Set, and circular references don't cause crashes or data loss.

**Acceptance Criteria:**

- **Given** `toSnakeCase` or `toCamelCase` receives a `Date`, `Map`, `Set`, or `RegExp` instance
- **When** the transform runs
- **Then** the instance is returned as-is (not destructured into a plain object)

- **Given** a circular reference in the input object
- **When** the transform runs
- **Then** it detects the cycle via a `WeakSet` and returns the circular reference as-is
- **And** does NOT stack overflow

- **Given** normal FHIR data (acyclic, string-based)
- **When** the transform runs
- **Then** behavior is identical to the current implementation (no regression)

### Story 34.6: StaleDataBanner NaN Guard and updated_at Triggers

As a clinician,
I want the stale data banner to show correctly even when sync timestamps are invalid,
So that I'm never falsely assured my data is fresh.

**Acceptance Criteria:**

- **Given** `StaleDataBanner` receives an invalid `lastSyncedAt` string
- **When** `new Date(lastSyncedAt)` produces `NaN`
- **Then** the banner treats the data as maximally stale and displays immediately

- **Given** `updated_at` columns across all migrations have no auto-update trigger
- **When** this story is complete
- **Then** a PostgreSQL trigger function `set_updated_at()` is created
- **And** it is applied to all tables with an `updated_at` column via migration

### Story 34.7: Redis Graceful Shutdown and Connection Lifecycle

As a system operator,
I want Redis connections to be properly managed during deployment rollover,
So that connection limits are not exhausted.

**Acceptance Criteria:**

- **Given** no `SIGTERM` handler exists for Redis cleanup
- **When** this story is complete
- **Then** `process.on('SIGTERM', () => client.quit())` is registered

- **Given** SSR module-level `createDexieDrugAdapter()` runs at import time
- **When** the module is imported during SSR (IndexedDB unavailable)
- **Then** the adapter creation is lazy (deferred to first use)
- **And** SSR does not crash

- **Given** the health check endpoint returns hardcoded version `0.1.0`
- **When** this story is complete
- **Then** it reads version from `package.json` or `process.env.APP_VERSION`

---

## Epic 35: UX Polish, Accessibility & RTL Completion

All apps render correctly in RTL mode with proper font loading, i18n integration, WCAG accessibility compliance, and consistent design tokens.

### Story 35.1: DirectionalIcon Integration Across All Apps

As an Arabic-speaking clinician,
I want navigation arrows and chevrons to mirror correctly in RTL mode,
So that the UI is intuitive in my language direction.

**Acceptance Criteria:**

- **Given** `DirectionalIcon` is exported from `@ultranos/ui-kit` but unused
- **When** this story is complete
- **Then** all navigation arrows, back buttons, and chevrons across OPD-Lite, Pharmacy-Lite, Lab-Lite, and Admin Portal import and use `DirectionalIcon`

- **Given** a medical icon (pill, stethoscope, lab flask)
- **When** rendered in RTL mode
- **Then** it does NOT mirror (per CLAUDE.md RTL rules)

- **Given** the icon migration
- **When** RTL snapshot tests run
- **Then** all migrated icons pass the RTL snapshot comparison

### Story 35.2: Clinical Arabic Font Wiring and Verification

As an Arabic-speaking clinician,
I want clinical document views to use the Noto Naskh Arabic serif font,
So that clinical text is rendered with appropriate typography for medical documents.

**Acceptance Criteria:**

- **Given** `--font-family-serif-ar` is defined in `tokens.css` but unused
- **When** this story is complete
- **Then** clinical document views (SOAP notes, prescriptions, diagnostic reports) apply the serif Arabic font when locale is `ar` or `fa`

- **Given** patient-lite-mobile references `NotoSansArabic-Bold`
- **When** the font is used
- **Then** a `useFonts` hook or equivalent ensures the font is loaded before rendering
- **And** a fallback system font is used during loading

### Story 35.3: Patient-Lite-Mobile i18n Initialization

As a patient using the mobile app,
I want the app to display in my chosen language from startup,
So that I can navigate the app without reading English.

**Acceptance Criteria:**

- **Given** `initI18n()` exists at `src/i18n/index.ts` but is never called
- **When** this story is complete
- **Then** `App.tsx` calls `initI18n()` during initialization (before first render)
- **And** the stored locale preference is loaded from AsyncStorage

- **Given** hardcoded English strings exist across patient-lite-mobile components
- **When** they are extracted
- **Then** all user-facing strings use `t()` translation function calls
- **And** message catalogs exist for English, Arabic, and Dari

- **Given** the language onboarding gateway (Story 18.3)
- **When** the user selects a language
- **Then** `initI18n()` applies the selection immediately
- **And** subsequent screens render in the chosen language

### Story 35.4: RTL Snapshot Test Completion

As a QA engineer,
I want comprehensive RTL snapshot tests for all patient-facing components,
So that RTL regressions are caught in CI.

**Acceptance Criteria:**

- **Given** components missing RTL snapshots: EncounterDashboard, PatientSearchScreen, PatientResultList (OPD-Lite), LabelPreviewPanel (Pharmacy-Lite), ErrorBoundary, StaleDataBanner
- **When** this story is complete
- **Then** each has a snapshot test rendered with `dir="rtl"` container wrapper

- **Given** admin portal dialogs (AddModuleDialog, RemoveModuleDialog)
- **When** RTL snapshots are added
- **Then** they verify logical CSS properties are used (no physical left/right)

- **Given** the CI RTL snapshot pipeline
- **When** a component is modified
- **Then** both LTR and RTL snapshots must pass for the PR to merge

### Story 35.5: Admin Portal Dialog Accessibility

As an admin portal user navigating with keyboard,
I want dialogs to trap focus, support Escape to close, and have proper ARIA attributes,
So that the admin portal meets WCAG 2.1 AA requirements.

**Acceptance Criteria:**

- **Given** AddModuleDialog and RemoveModuleDialog use bare `<div>`
- **When** this story is complete
- **Then** they use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the dialog title

- **Given** a dialog is open
- **When** the user presses Tab
- **Then** focus cycles within the dialog (focus trap)
- **When** the user presses Escape
- **Then** the dialog closes

- **Given** interactive elements in AppShell (nav links, avatar button, dropdown)
- **When** this story is complete
- **Then** hover and focus-visible styles are applied via CSS classes (replacing inline styles where pseudo-classes are needed)

### Story 35.6: AppShell Viewport Resize Fix

As a clinician rotating a tablet,
I want the mobile navigation drawer to close when the viewport crosses the desktop breakpoint,
So that the nav doesn't unexpectedly reappear.

**Acceptance Criteria:**

- **Given** `mobileNavOpen` state is `true` and the viewport is resized above 641px
- **When** a `matchMedia` listener fires
- **Then** `mobileNavOpen` is reset to `false`

- **Given** the viewport is resized back below 641px
- **When** the user has not toggled the hamburger
- **Then** the nav drawer remains closed (not auto-open)

### Story 35.7: Consumer Theme Dark Mode Variant

As a patient using the app at night,
I want the consumer theme to support dark mode,
So that the app is comfortable to use in low-light conditions.

**Acceptance Criteria:**

- **Given** the consumer theme has only light-mode HSL values
- **When** this story is complete
- **Then** dark-mode HSL values are defined for all consumer theme tokens

- **Given** the `ThemeProvider` and `useTheme` hook exist (Story 18.11)
- **When** the user selects dark mode
- **Then** consumer-themed screens (patient app) apply dark mode tokens

- **Given** `SAFETY_COLORS` uses flat light/dark keys
- **When** this story is complete
- **Then** they are restructured to match the per-theme pattern used by `healthCardColors`

### Story 35.8: PWA Icon and Offline Fallback Polish

As a clinician installing the PWA,
I want proper app icons and an offline fallback page,
So that the installed app looks professional and handles network loss gracefully.

**Acceptance Criteria:**

- **Given** `purpose: 'any maskable'` on placeholder icons causes poor Android cropping
- **When** real branded icons are created
- **Then** separate icon entries exist: one with `purpose: 'any'` and one with `purpose: 'maskable'` (with safe zone padding)

- **Given** OPD-Lite has no offline navigation fallback page
- **When** an uncached navigation request fails offline
- **Then** a `/offline` route renders a graceful fallback: "You're offline — cached data is available"

### Story 35.9: Lab Lite Dashboard i18n, Accessibility & UX Hardening

As an Arabic or Dari-speaking lab technician,
I want the Lab Lite dashboard and all supporting views to render in my language with proper accessibility,
So that I can use the application natively without encountering hard-coded English strings or inaccessible controls.

**Acceptance Criteria:**

- **Given** dashboard components (LabIdentityCard, QueueStatusCard, ActivitySummaryCard, QuickActions, RecentUploadsList) contain hard-coded English strings
- **When** this story is complete
- **Then** all user-facing text uses `useTranslations()` from next-intl with keys from en.json/ar.json/prs.json

- **Given** UploadQueue and UploadHistoryList contain hard-coded English strings for status labels, button text, confirmation prompts, and empty states
- **When** this story is complete
- **Then** all text uses `useTranslations('queue')` and `useTranslations('history')` respectively

- **Given** InstallPrompt contains hard-coded English strings
- **When** this story is complete
- **Then** all text uses `useTranslations('install')`

- **Given** layout.tsx has a hard-coded `<h1>Lab Diagnostics Portal</h1>`
- **When** this story is complete
- **Then** it uses the existing `LayoutHeaderTitleClient` component (which uses `useTranslations('app')`)

- **Given** QueueStatusCard and ActivitySummaryCard badge counts are not announced by screen readers
- **When** this story is complete
- **Then** each badge has `role="status"` and `aria-label` (e.g., "2 Pending") with inner text marked `aria-hidden="true"`

- **Given** no skip-to-content link exists
- **When** this story is complete
- **Then** a sr-only skip link targets `<main id="main-content">`

- **Given** AuthGuard returns `null` (blank page) while checking session
- **When** this story is complete
- **Then** it renders skeleton loading cards with `aria-busy="true"`

- **Given** the error banner has no retry action
- **When** this story is complete
- **Then** a "Try Again" button calls `useDashboardData.retry()` to re-fetch

- **Given** action buttons in UploadQueue and UploadHistoryList use `px-2 py-1` (~28px height)
- **When** this story is complete
- **Then** all action buttons have `min-h-[44px]` for WCAG 2.5.8 touch target compliance

- **Given** CSS transitions and animations run regardless of user motion preferences
- **When** this story is complete
- **Then** `motion-safe:` prefix is applied to all transition/animation classes in modified components
- **And** a global `@media (prefers-reduced-motion: reduce)` rule exists in globals.css

> **Status: ✅ COMPLETE (2026-05-22, branch `internationalization-01`)**
> 14 files modified. 11/11 dashboard tests pass with updated i18n mock.

---

## Epic 36: Data Integrity & Race Condition Fixes

Eliminate data corruption and inconsistency from race conditions, partial failures, and stale state across all critical code paths.

### Story 36.1: Transactional Integrity in recordDispense

As a pharmacist,
I want dispensing operations to be atomic,
So that partial failures don't create orphan records or inconsistent state.

**Acceptance Criteria:**

- **Given** `recordDispense` currently inserts a dispense record before validating the prescription
- **When** this story is complete
- **Then** prescription lookup and validation occur BEFORE any insert
- **And** the dispense insert and conflict log insert are wrapped in a database transaction

- **Given** the conflict log insert fails
- **When** the transaction catches the error
- **Then** the entire transaction (including the dispense insert) is rolled back
- **And** an operational error is logged

- **Given** `confirmDispense` in pharmacy-lite processes multiple items in a loop
- **When** item 3 of 5 fails
- **Then** the store tracks per-item status: `{ itemId, status: 'dispensed'|'failed', error? }`
- **And** the UI shows which items succeeded and which failed

### Story 36.2: Auth Redirect Without Store Destruction

As a clinician logging in,
I want the login redirect to preserve the freshly populated session store,
So that I don't need to re-authenticate or lose state.

**Acceptance Criteria:**

- **Given** OPD-Lite and Pharmacy-Lite use `window.location.href = '/'` after login
- **When** this story is complete
- **Then** login success triggers `router.push('/')` (Next.js router) instead of full page reload
- **And** the Zustand session store survives the navigation

- **Given** the Supabase `onAuthStateChange` fires `SIGNED_IN` during re-auth
- **When** the event fires
- **Then** registered listeners check if this is a re-auth (existing session) vs. fresh login
- **And** re-auth does NOT re-run full login initialization logic

### Story 36.3: Re-Auth Session Consistency

As a clinician re-authenticating after timeout,
I want my session metadata to be updated consistently,
So that audit events reference the correct session.

**Acceptance Criteria:**

- **Given** `signInWithPassword` re-auth creates a new Supabase session
- **When** re-auth succeeds
- **Then** the Zustand auth store's `sessionId` is updated to match the new session
- **And** the encryption key is re-derived if needed (from new JWT)

- **Given** re-auth via the re-auth modal
- **When** the modal closes after success
- **Then** the app continues with the new session — no stale `sessionId` in flight

- **Given** OPD-Lite `login/page.tsx` has a dangling session bug on null JWT post-MFA
- **When** this story is complete
- **Then** OPD-Lite calls `signOut()` when JWT is null after MFA verify success (matching the Pharmacy-Lite fix)

### Story 36.4: signOut Error Handling in Auth Flows

As a user,
I want logout operations to complete gracefully even when Supabase errors,
So that partial sessions don't persist.

**Acceptance Criteria:**

- **Given** Lab-Lite MFA rejection path calls `signOut()` without error handling
- **When** `signOut()` throws
- **Then** the error is caught, the local session state is cleared anyway, and the user is redirected to login

- **Given** Lab-Lite "Back to sign in" handler has no try-catch
- **When** `signOut()` throws
- **Then** the error is caught and local state is cleared

- **Given** any spoke app's `handleExpired` clears session before redirect
- **When** `clearSession()` sets `isAuthenticated = false`
- **Then** the redirect fires synchronously after state clear
- **And** a brief flash of unauthenticated content is prevented via a loading overlay during cleanup

### Story 36.5: Scanner Processing Lock Reset and Concurrent Verification Guard

As a pharmacist scanning prescriptions,
I want the scanner to recover from errors and prevent duplicate verification,
So that I don't get stuck or accidentally verify twice.

**Acceptance Criteria:**

- **Given** `processingRef.current` stays `true` after `handleFetchKey` failure
- **When** the error catch block executes
- **Then** `processingRef.current` is reset to `false`

- **Given** paste and camera verification can fire concurrently
- **When** both trigger at the same time
- **Then** a mutex (`processingRef`) prevents the second from executing
- **And** the second attempt is silently dropped (not queued)

- **Given** `confirmDispense` can be double-tapped
- **When** the async gap between guard check and state set allows a second call
- **Then** an optimistic lock (`phase` check inside `set()` callback) prevents double execution

### Story 36.6: Flush Autosave Before Encounter End

As a clinician ending an encounter,
I want all pending autosave operations to complete before the encounter finalizes,
So that the last few seconds of clinical notes are not lost.

**Acceptance Criteria:**

- **Given** `flushAutosave()` and `flushVitalsAutosave()` are called before `endEncounter()`
- **When** they are async
- **Then** `endEncounter()` awaits both flush calls before proceeding

- **Given** a flush call fails
- **When** `endEncounter()` catches the error
- **Then** the clinician is warned: "Some recent changes may not have been saved"
- **And** the encounter is still finalized (not blocked)

### Story 36.7: Database Constraint and Cleanup for TOCTOU Races

As a system developer,
I want database-level constraints to prevent data corruption from race conditions,
So that application-level TOCTOU gaps have a safety net.

**Acceptance Criteria:**

- **Given** `organizations.slug` has no UNIQUE constraint
- **When** a migration adds `UNIQUE(slug)`
- **Then** concurrent registration with the same org name gets a constraint violation
- **And** the registration endpoint catches the violation and retries with an incremented slug suffix

- **Given** org creation fails and the compensating DELETE also fails
- **When** orphaned org rows exist
- **Then** a daily cleanup job identifies orgs with no linked admin user
- **And** orgs in `PENDING_VERIFICATION` status older than 24h with no admin are deleted

- **Given** `(org_id, module_code)` has no unique constraint in subscriptions
- **When** a migration adds `UNIQUE(org_id, module_code)` where `status != 'CANCELLED'`
- **Then** concurrent `selectInitialModules` calls produce at most one active subscription per module

### Story 36.8: handleInteractionOverride Form Preservation

As a clinician overriding a drug interaction,
I want my prescription data to be preserved if the override fails,
So that I don't have to re-enter the entire prescription.

**Acceptance Criteria:**

- **Given** `handleInteractionOverride` closes the modal at line 250 before `await addPrescription()` at line 252
- **When** this story is complete
- **Then** `addPrescription()` is awaited FIRST
- **And** the modal is only closed after successful prescription addition

- **Given** `addPrescription()` fails
- **When** the error is caught
- **Then** the modal remains open with the override data intact
- **And** an error message is shown within the modal

---

# Addendum 8: MPI Phase 1 — Patient Identity & Deduplication (2026-05-22)

> Afghan patronymic MPI deduplication engine, atomic consent-at-creation, and Hub API integration.
> Extends Story 16.2 (Patient CRUD) and Story 27.10 (Patient Self-Registration).
> New package: `packages/mpi-engine`. New migrations 018–023c. New Hub API endpoints.

## MPI-1: mpi-engine Package — Normalization & Phonetic Tokenization

As a Hub API developer,
I want a pure TypeScript MPI engine that normalizes Afghan names and produces phonetic tokens,
So that the Hub can perform fuzzy duplicate detection without external services.

**Acceptance Criteria:**

- **Given** an Arabic-script Afghan name (e.g., "احمد")
- **When** `normalizeNameComponent()` is called
- **Then** it performs NFD normalization → ALA-LC romanization → variant expansion → lowercase
- **And** `computePhoneticTokens()` produces Double Metaphone codes for the romanized form

- **Given** a Latin-script name with common Afghan variants (e.g., "Mohammad", "Mohammed", "Muhammed")
- **When** normalized
- **Then** all variants reduce to the same canonical form ("muhammad")
- **And** produce identical phonetic tokens

## MPI-2: mpi-engine Package — Scoring & Decision Engine

As a Hub API developer,
I want a weighted scoring system that compares input fields against candidate records,
So that the system can classify matches as BLOCK (≥90), WARN (60–89), or ALLOW (<60).

**Acceptance Criteria:**

- **Given** an input patient and a list of candidate records from the DB
- **When** `computeMpiResult()` is called
- **Then** each candidate is scored using Jaro-Winkler similarity across weighted fields:
  - givenName (30), fatherName (25), grandfatherName (10), birthYear (15), gender (5), districtOrigin (5), provinceOrigin (3), phone (7)
- **And** hard identifier matches (nationalIdHash, tazkiraPaperHash, biometricHash) bypass scoring → immediate BLOCK (score 100)
- **And** the result includes `{ decision: 'BLOCK'|'WARN'|'ALLOW', topScore, candidates[] }` with per-candidate scoreBreakdown

## MPI-3: shared-types — Afghan Patient Data Model Extensions

As a developer working with FHIR Patient resources,
I want the shared types to include Afghan patronymic fields, address validation, and MPI input schemas,
So that all apps share a single validated data model for MPI Phase 1.

**Acceptance Criteria:**

- **Given** `packages/shared-types/src/fhir/patient.ts`
- **Then** `FhirPatient._ultranos` includes: nameGiven, nameFather, nameGrandfather, birthYear, addressOrigin (PatientAddress), addressCurrent, isNomadic, biometricFingerprintHash, biometricAlgorithmVersion, mpiScore, identifiers
- **And** `PatientAddress.province` uses `z.enum(AFGHAN_PROVINCES)` — 34 provinces validated at parse time
- **And** `CreatePatientMpiInputSchema` includes cross-field validation (birthDate/birthYear, verbal consent witness, birthYearOnly=false requires birthDate)
- **And** `firstName` is accepted as a deprecated alias for `nameGiven` (Patient Lite backward compat)

## MPI-4: Database Migrations — Patient MPI Fields & Atomic Consent RPC

As a database administrator,
I want the patients table extended with MPI fields and an atomic RPC for patient+consent creation,
So that MPI scoring can operate on indexed phonetic data and consent is never orphaned from patient creation.

**Acceptance Criteria:**

- **Given** migrations 018–023c applied to the Supabase database
- **Then** `patients` table has: name_given, name_father, name_grandfather, name_phonetic_given (TEXT[]), name_phonetic_father (TEXT[]), name_phonetic_grandfather (TEXT[]), birth_year (SMALLINT), address_province_origin, address_district_origin, address_village_origin, address_province_current, address_district_current, address_village_current, tazkira_paper_hash, biometric_fingerprint_hash, biometric_algorithm_version, mpi_score, mpi_warn, is_nomadic, name_given_enc, name_father_enc, name_grandfather_enc
- **And** GIN indexes exist on phonetic array columns; scalar indexes on birth_year, address_district_origin, biometric_fingerprint_hash, tazkira_paper_hash, mpi_warn
- **And** `consent_records` has: consent_method (WRITTEN|VERBAL_WITNESSED|SELF_REGISTERED), witnessed_by (FK→practitioners), consent_language (en|ar|prs), with VERBAL_WITNESSED requiring witnessed_by
- **And** `create_patient_with_consent(p_patient JSONB, p_consent JSONB)` atomically inserts patient + consent, using explicit column list (no mass-assignment), grantor_id NULL guard, safe scope defaulting, SHA-256 audit_hash
- **And** `fetch_mpi_candidates(p_input JSONB)` returns candidates matching phonetic overlap, hard ID match, birth_year+district combo, or phone match (LIMIT 50), returning `'[]'::JSONB` on empty

## MPI-5: Hub API — MPI-Aware Patient Create, Search, and Duplicate Check

As a clinician,
I want patient creation to check for duplicates and require confirmation before creating potential duplicates,
So that the MPI prevents accidental duplicate records.

**Acceptance Criteria:**

- **Given** a clinician calls `patient.create` with MPI input
- **When** MPI scores ≥90 (BLOCK)
- **Then** the endpoint throws CONFLICT with opaque candidateIds (no PHI in error payload)
- **And** when MPI scores 60–89 (WARN) without proceedToken, throws PRECONDITION_FAILED with candidateIds + proceedToken
- **And** when WARN + valid proceedToken provided, verifies issuedTo matches calling user, consumes token before insert, creates patient with mpi_warn=true via atomic RPC
- **And** proceedToken is RS256 JWT (10-min TTL, one-time-use via Redis, fail-closed on Redis unavailable)

- **Given** a clinician calls `patient.search`
- **Then** the response includes MPI fields: nameGiven, nameFather, nameGrandfather, birthYear, addressDistrictOrigin, addressProvinceOrigin, mpiScore, mpiWarn in `_ultranos`

- **Given** a clinician calls `patient.checkDuplicates` (new endpoint)
- **Then** it returns `{ decision, topScore, proceedToken?, candidates[] }` with per-candidate scoreBreakdown
- **And** the endpoint is rate-limited to 20 requests/minute
- **And** emits PHI_READ audit with resourceId='mpi-check' (no PHI in audit metadata)

## MPI-6: Patient Self-Registration — MPI Integration

As a patient self-registering via Patient Lite Mobile,
I want the system to check for duplicates before creating my record,
So that I don't accidentally create a second record for myself.

**Acceptance Criteria:**

- **Given** a patient completes OTP verification and submits registration
- **When** MPI scores ≥90 (BLOCK)
- **Then** the endpoint returns `{ blocked: true, message: 'You may already be registered...' }` (no throw, anti-enumeration)
- **And** when MPI scores 60–89 (WARN), the patient is created with mpi_warn=true (no proceedToken needed for self-registration)
- **And** the phone uniqueness check is removed (MPI handles deduplication)
- **And** patient creation uses atomic `create_patient_with_consent` RPC with `consent_method: 'SELF_REGISTERED'`

## Implementation Status

| Story | Status | Commits | Tests |
|-------|--------|---------|-------|
| MPI-1: Normalization & Phonetic | ✅ Done | 177fb92, efd77d2, cba17e7 | normalization.test.ts |
| MPI-2: Scoring & Decision | ✅ Done | 66cbf7f, b336275, b4076dd | scoring.test.ts |
| MPI-3: shared-types Extensions | ✅ Done | aa6d635, 4b5d6bf | (validated via typecheck) |
| MPI-4: Database Migrations | ✅ Done | 9785304, fce20e6, db14d6e, 8ee2495, 7006cd1 | (applied via Supabase MCP) |
| MPI-5: Hub API Integration | ✅ Done | dfe9eb4, bca2897, 2c86cb9, 9cc4a68, c81ed41, e17d554 | patient-mpi.test.ts (7), patient-consent-atomic.test.ts (12), patient-crud.test.ts (20) |
| MPI-6: Self-Registration MPI | ✅ Done | (in patient-registration.ts) | patient-registration-mpi.test.ts (5) |

## Known Gaps (Fast-Follow)

1. **Audit failures silently swallowed:** All PHI access paths catch and console.warn audit failures. CLAUDE.md Rule #6 says "no exceptions." Needs durable audit fallback queue.
2. **BLOCK/PRECONDITION_FAILED paths not audited:** When patient.create returns BLOCK or issues a proceedToken, no audit event is emitted for the attempted access.

---

# Addendum 9 — MPI Phase 2: Registration UI, Offline MPI Reconciliation & Duplicate Review

**Date:** 2026-05-22
**Branch:** `internationalization-01`
**Commit:** 76a8eb8

## Overview

MPI Phase 2 extends Phase 1's deduplication engine with: OPD Lite patient registration UI, offline-first two-pass MPI reconciliation via `patient.syncCreate`, a clinician-facing duplicate review queue, and enriched Patient Lite Mobile registration (nameFather + gender).

## MPI-P2-1: Afghan District Reference Dataset

As a developer building geography-aware registration forms,
I want a typed, validated Afghan district dataset,
So that province/district cascading dropdowns are consistent across all apps.

**Acceptance Criteria:**
- `AFGHAN_DISTRICTS` exported from `@ultranos/shared-types` with 100+ districts across all 34 provinces
- Each district has `name` (English), `nameLocal` (Dari/Pashto script), `province` (validated parent)
- `getDistrictsByProvince(province)` helper returns filtered districts
- `PatientAddressSchema` `.refine()` validates district belongs to selected province
- All province names match the canonical `AFGHAN_PROVINCES` constant

**Status:** ✅ Done — 7 tests pass

## MPI-P2-2: Database Migration — `duplicate_reviews` Table

As a clinician reviewing flagged duplicate patients,
I want duplicate match records stored in a dedicated table,
So that I can review, dismiss, or flag them for merge.

**Acceptance Criteria:**
- `duplicate_reviews` table with: patient_id (FK→patients), candidate_ids (UUID[]), top_score, mpi_decision (WARN/BLOCK), status (PENDING→DISMISSED|FLAGGED_FOR_MERGE→MERGED), reviewed_by, reviewed_at
- Partial index on `status='PENDING'` for fast dashboard badge queries
- Index on `patient_id` for inline banner lookups
- RLS enabled with select/insert/update policies for authenticated users

**Status:** ✅ Done — Migration 024 applied via Supabase MCP

## MPI-P2-3: Async MPI Scoring Function

As a system processing offline-synced patient records,
I want MPI scoring to run asynchronously after record insertion,
So that offline registration is never blocked by MPI.

**Acceptance Criteria:**
- `runAsyncMpiScoring(patientId, fields, supabase)` is fire-and-forget (never throws)
- ALLOW: sets `mpi_score` on patient, no review created
- WARN/BLOCK: sets `mpi_warn=true`, `mpi_score`, creates `duplicate_reviews` row with PENDING status
- Self-exclusion: filters out the patient's own ID from candidates
- Errors logged with opaque patientId only (no PHI)

**Status:** ✅ Done — 4 tests pass

## MPI-P2-4: `patient.syncCreate` Endpoint

As a spoke app syncing offline-created patients to the Hub,
I want a sync endpoint that always succeeds insertion,
So that offline registration is reliable with post-hoc MPI scoring.

**Acceptance Criteria:**
- `patient.syncCreate` mutation accepts `CreatePatientMpiInputSchema` + `offlineCreatedAt`
- Pass 1: inserts patient + consent atomically via `create_patient_with_consent` RPC (no MPI blocking)
- Pass 2: fires `runAsyncMpiScoring` (fire-and-forget) after successful insert
- Emits `PHI_WRITE` audit event with `operation: 'sync_create'`
- Existing `patient.create` (with MPI blocking) is unmodified

**Status:** ✅ Done — 3 tests pass, 20 existing patient-crud tests pass

## MPI-P2-5: `duplicateReview` Router

As a clinician managing duplicate patient records,
I want API endpoints to list, dismiss, and flag duplicate reviews,
So that I can resolve MPI-flagged records from the OPD Lite UI.

**Acceptance Criteria:**
- `duplicateReview.pendingCount` returns count of PENDING reviews
- `duplicateReview.list` returns paginated reviews with optional status filter
- `duplicateReview.dismiss` sets status=DISMISSED, clears `mpi_warn` on patient, emits audit
- `duplicateReview.flagForMerge` sets status=FLAGGED_FOR_MERGE, emits audit
- All endpoints protected with `enforceResourceAccess('Patient')`

**Status:** ✅ Done — 4 tests pass

## MPI-P2-6: Patient Self-Registration Enrichment

As a patient self-registering via Patient Lite Mobile,
I want to provide my father's name and gender during registration,
So that MPI scoring is more accurate and my record is more complete.

**Acceptance Criteria:**
- `patientRegistration.register` input schema accepts optional `nameFather` and `gender`
- `nameFather` passed to `fetchMpiCandidates` and `computeMpiResult`
- `gender` passed to `computeMpiResult`
- Both fields stored in patient row via `db.toRow()`
- Backward compatible: existing registrations without these fields still work

**Status:** ✅ Done — 2 new tests pass, 5 existing registration-mpi tests pass

## MPI-P2-7: OPD Lite Registration Form

As a clinician at an OPD desk,
I want a patient registration form with MPI pre-flight checking,
So that I can register new patients while preventing duplicates.

**Acceptance Criteria:**
- Registration page at `/register-patient` with optional `?nameGiven=` pre-fill from search
- Form sections: name (given/father/grandfather), demographics (gender, DOB/birth year, phone), identity docs, geography (origin/current address with cascading province/district), consent
- Province/district autocomplete dropdowns using Afghan district dataset
- On submit: calls `patient.checkDuplicates`, then ALLOW→create, WARN→modal with proceed, BLOCK→modal with "Go to Patient"
- MpiResultModal shows candidate comparison cards with score breakdown
- All text via i18n keys (en/ar/prs)
- RTL-safe with logical CSS properties

**Status:** ✅ Done — 8 components created

## MPI-P2-8: OPD Lite Navigation & "Register New Patient"

As a clinician searching for a patient,
I want a "Register New Patient" button when search results are sparse,
So that I can quickly register a new patient when they're not found.

**Acceptance Criteria:**
- "Register New Patient" dashed button appears in PatientResultList when results < 3
- Button passes current search query as `?nameGiven=` to registration page
- "Register New Patient" CTA added to ClinicalDashboard header
- i18n keys added to `dashboard` namespace (en/ar/prs)

**Status:** ✅ Done

## MPI-P2-9: OPD Lite Duplicate Review UI

As a clinician reviewing MPI-flagged patients,
I want a duplicate review page and dashboard indicator,
So that I can resolve flagged records efficiently.

**Acceptance Criteria:**
- `DuplicateReviewsCard` on dashboard showing pending count (30s polling)
- `/duplicate-review` page with expandable review table
- Each row shows patient, score, decision, status; expanded view shows CandidateComparisonCard per candidate
- Score badge color: green (<60), amber (60-89), red (>=90)
- Action buttons: "Dismiss" and "Flag for Merge"
- `MpiWarnBanner` inline amber alert for patient views when `mpi_warn=true`
- All text via i18n keys (en/ar/prs)

**Status:** ✅ Done — 5 components created

## MPI-P2-10: Patient Lite Mobile — Registration Enrichment

As a patient registering via the mobile app,
I want to provide my father's name and gender,
So that my MPI identity profile is more complete from the start.

**Acceptance Criteria:**
- `ProfileSetupScreen` adds: father's name (text input, required), gender (4-option selector, required)
- `onComplete` callback includes `nameFather` and `gender`
- `registration-api.ts` `RegistrationInput` interface includes optional `nameFather` and `gender`
- Form validation requires both fields before submission

**Status:** ✅ Done

## MPI-P2-11: Patient Lite Mobile — Profile Completion

As a patient with an incomplete profile,
I want a dashboard nudge prompting me to complete optional fields,
So that my record is enriched for better healthcare continuity.

**Acceptance Criteria:**
- `ProfileCompletionCard` shows on dashboard when profile fields are incomplete
- Progress indicator: "X of Y fields completed" with progress bar
- Dismissible up to 3 times (tracked in AsyncStorage), then hidden permanently
- `ProfileCompletionScreen` collects: grandfather's name, origin address (province/district/village)
- `ProvinceDistrictPicker` React Native cascading dropdown using Afghan district dataset
- Pre-populates fields already present in patient record

**Status:** ✅ Done — 3 components created

## Implementation Status

| Story | Status | Tests |
|-------|--------|-------|
| MPI-P2-1: District Dataset | ✅ Done | afghanistan-districts.test.ts (7) |
| MPI-P2-2: duplicate_reviews Migration | ✅ Done | (applied via Supabase MCP) |
| MPI-P2-3: Async MPI Scoring | ✅ Done | async-mpi-scoring.test.ts (4) |
| MPI-P2-4: patient.syncCreate | ✅ Done | sync-create.test.ts (3) |
| MPI-P2-5: duplicateReview Router | ✅ Done | duplicate-review.test.ts (4) |
| MPI-P2-6: Registration Enrichment | ✅ Done | patient-registration-enrichment.test.ts (2) |
| MPI-P2-7: Registration Form | ✅ Done | (UI components) |
| MPI-P2-8: Navigation | ✅ Done | (UI changes) |
| MPI-P2-9: Duplicate Review UI | ✅ Done | (UI components) |
| MPI-P2-10: Mobile Registration | ✅ Done | (UI changes) |
| MPI-P2-11: Profile Completion | ✅ Done | (UI components) |

---

# Addendum 10 — MPI Phase 3: Spoke App Completeness & Admin Tools

**Date:** 2026-05-22
**Branch:** `internationalization-01`
**Plan:** `docs/superpowers/plans/2026-05-22-mpi-phase3-spoke-completeness.md`

## Stories

## MPI-P3-1: Database Migrations — Merge Infrastructure

As a system administrator,
I need database support for patient merging and dispense reviews,
So that merge operations are tracked and reversible, and offline dispenses are auditable.

**Acceptance Criteria:**
- Migration 025: `merged_into` UUID column on `patients` (FK to self, partial index where NOT NULL)
- Migration 025: `merge_audits` table with survivor/duplicate snapshots, field_resolutions JSONB, 72-hour unmerge_deadline, ACTIVE/REVERSED/ARCHIVED status
- Migration 026: `dispense_reviews` table with override_reason, override_supervisor, PENDING/APPROVED/FLAGGED status
- RLS enabled on both new tables

**Status:** ✅ Done — Applied via Supabase MCP + local migration files

## MPI-P3-2: Hub API — Patient Admin Router (Merge/Unmerge)

As an admin user,
I want to search, merge, and unmerge patient records,
So that duplicate records can be consolidated with a reversible safety window.

**Acceptance Criteria:**
- `patientAdmin.getById` — admin-only fetch by UUID with audit logging
- `patientAdmin.adminSearch` — name-based search with MPI/inactive filters, pagination
- `patientAdmin.merge` — field-level resolution, sets merged_into + deactivates duplicate, creates merge_audit, clears mpi_warn if no pending reviews
- `patientAdmin.unmerge` — restores both patients within 72h, throws FORBIDDEN after deadline
- `patient.read` follows `merged_into` link transparently
- All endpoints enforce ADMIN role, emit PHI audit events

**Status:** ✅ Done — 5 tests passing (patient-merge.test.ts)

## MPI-P3-3: Admin Portal — Patient Pages & Merge Tool

As an admin user,
I want a patient management UI in the Admin Portal,
So that I can search patients, view details, and perform supervised merges.

**Acceptance Criteria:**
- `/patients` search page with text search, MPI/inactive filters, paginated results table
- `/patients/[patientId]` detail page with demographics card, MPI & status card, consent timeline placeholder
- `/patients/merge` 3-step wizard: select patients → field resolution → preview & confirm (requires typing "MERGE")
- PatientComparisonTable highlights differing fields
- All pages follow Admin Portal design system (rounded-3xl cards, bg-brand-lime CTAs, bg-black table headers)
- Sidebar navigation entries added

**Status:** ✅ Done — 7 files created + Sidebar modified

## MPI-P3-4: Lab Lite — Offline Verification Fallback

As a lab technician working offline,
I want to verify patients via cached QR signatures,
So that I can continue processing samples during network outages.

**Acceptance Criteria:**
- Dexie v2 schema with `practitioner_keys` and `verified_patients` tables
- Ed25519 signature verification (tweetnacl) iterating cached practitioner keys
- Verified patient cache: firstName + age ONLY (CLAUDE.md Rule #7 data minimization)
- 24-hour cache TTL with auto-cleanup on stale reads
- PatientVerifyScanner: offline → parse QR → verify signature → show cached card with "Offline Verified" badge
- PatientVerifyForm: offline → check cache → show "Cached" badge or "Use QR scan" message
- OnlineStatusIndicator: green/red dot with "Online"/"Offline" text
- Online path caches patients after successful verification

**Status:** ✅ Done — 3 new files, 3 modified files

## MPI-P3-5: Pharmacy Lite — Manual Rx Fallback

As a pharmacist with a failed QR scanner or offline connectivity,
I want to manually enter a prescription ID with offline grace dispensing,
So that urgent medications can still be dispensed with proper audit trail.

**Acceptance Criteria:**
- ManualRxEntry: text input for Rx ID, online lookup, offline triggers grace form
- OfflineGraceForm: supervisor text input, reason textarea (10-500 chars), 5-per-shift limit (sessionStorage)
- When limit reached: form disabled with "Maximum grace dispenses reached (5/5)" message
- UnverifiedDispensesCard: dashboard card showing PENDING dispense review count (follows DispensingSummaryCard pattern)
- dispense_reviews migration already applied (Task 1)

**Status:** ✅ Done — 3 files created

## MPI-P3-6: Consent Expiry Warning

As a clinician,
I want to see which patients have expiring consent and renew it,
So that data access remains compliant with consent requirements.

**Acceptance Criteria:**
- Hub API `consent.expiringCount` — count of ACTIVE consents expiring within 90 days
- Hub API `consent.expiringSoon` — paginated list sorted by nearest expiry
- Hub API `consent.renew` — supersedes old consent, creates new 3-year consent with SHA-256 audit hash
- OPD Lite ExpiringConsentsCard: dashboard card with count + amber badge, 30s auto-refresh
- OPD Lite expiring-consents page: table with patient ref, expiry date, color-coded days-until-expiry
- OPD Lite ConsentExpiryBanner: amber alert on patient detail with "Renew Consent" button
- OPD Lite ConsentRenewalModal: method/witness/language/version form

**Status:** ✅ Done — 7 tests passing (consent-expiry.test.ts)

## MPI-P3-7: Biometric Re-enrolment

As a clinician,
I want to see when a patient's biometric data uses an outdated algorithm,
So that I can trigger re-enrolment for improved matching accuracy.

**Acceptance Criteria:**
- Hub API `patient.updateBiometric` — updates fingerprint hash + algorithm version with audit logging
- OPD Lite BiometricStaleBanner: blue informational banner when `biometricAlgorithmVersion` mismatches `NEXT_PUBLIC_BIOMETRIC_ALGORITHM_VERSION`
- Uses `role="status"` (informational, not alert)
- "Update Biometric" button triggers capture flow callback

**Status:** ✅ Done — 2 files (1 modified, 1 created)

## Implementation Status

| Story | Status | Tests |
|-------|--------|-------|
| MPI-P3-1: DB Migrations (025, 026) | ✅ Done | (applied via Supabase MCP) |
| MPI-P3-2: Patient Admin Router | ✅ Done | patient-merge.test.ts (5) |
| MPI-P3-3: Admin Portal Pages | ✅ Done | (UI components) |
| MPI-P3-4: Lab Lite Offline Verify | ✅ Done | (functional, TODO: key caching) |
| MPI-P3-5: Pharmacy Lite Manual Rx | ✅ Done | (UI components) |
| MPI-P3-6: Consent Expiry Warning | ✅ Done | consent-expiry.test.ts (7) |
| MPI-P3-7: Biometric Re-enrolment | ✅ Done | (endpoint + UI) |

---

# Addendum 11 — Navigation Systems & Appointment Scheduling

**Date:** 2026-05-22
**Branch:** `internationalization-01`

## Context

All three PWA spoke apps (OPD-Lite, Pharmacy-Lite, Lab-Lite) currently lack proper persistent navigation. OPD-Lite and Lab-Lite have header-only layouts with no sidebar. Pharmacy-Lite has a basic `AppShellWrapper` with a flat nav list but no badges, no collapsible state, and missing routes. OPD-Lite also lacks a patient directory (patients are only reachable via search) and has no appointment scheduling system — a critical gap for OPD clinic workflows.

Story 14.4 created a basic `<AppShell>` component in `@ultranos/ui-kit` with a horizontal navbar. This epic replaces that with a collapsible sidebar pattern and extends all three apps with complete navigation, a patient directory, and an appointment scheduling system.

## New Functional Requirements

FR35: Collapsible Sidebar Navigation for All PWA Spoke Apps (OPD-Lite, Pharmacy-Lite, Lab-Lite with badge-driven urgency, sync footer, RTL support)
FR36: Patient Directory & Browsing (searchable, filterable, sortable patient list for OPD-Lite clinicians)
FR37: Appointment Scheduling & Walk-In Queue Management (FHIR R4 Appointment/Slot, day/week views, walk-in queue, offline-first, Hub API sync)

## Stories

## Epic 37: Navigation Systems & Appointment Scheduling

Upgrade all three PWA spoke apps from basic header-only layouts to collapsible sidebar navigation with badge-driven urgency indicators, add a patient directory to OPD-Lite, and build a complete appointment scheduling system for OPD clinics including FHIR R4 types, offline-first storage, walk-in queue management, and Hub API sync.

---

### Story 37.1: Upgrade AppShell in ui-kit — Collapsible Sidebar with Badges

As a developer,
I want the shared `<AppShell>` component in `@ultranos/ui-kit` upgraded from a horizontal navbar to a collapsible sidebar with badge support,
So that all PWA spoke apps can adopt a consistent, feature-rich navigation pattern.

**Acceptance Criteria:**
- **Given** `packages/ui-kit/src/components/AppShell.tsx` exists
- **When** the component is upgraded
- **Then** it renders a vertical collapsible sidebar instead of a horizontal navbar
- **And** the sidebar supports two states: expanded (icons + labels) and collapsed (icons only)
- **And** collapse/expand is toggled via a chevron button at the top of the sidebar
- **And** collapse state is persisted via a `persistKey` prop (apps store in localStorage)
- **And** each `NavItem` accepts an optional `badge?: number | null` prop, rendered as a count pill (red background, white text) next to the label
- **And** badges with value `0` or `null` are hidden; badges > 99 render as "99+"
- **And** `NavItem` accepts an optional `group?: string` prop for visual grouping with a subtle divider between groups
- **And** the sidebar footer renders three slots: `syncIndicator`, `userSection`, and `languageSelector` (all via render props)
- **And** the `userSection` slot shows user avatar/initials, name, role badge, and a sign-out button that fires `onSignOut`
- **And** the sidebar flips to the right edge in RTL mode using logical CSS properties (`inset-inline-start`)
- **And** the component is fully keyboard-navigable (Tab through items, Enter/Space to activate, Escape to collapse)
- **And** ARIA attributes are correct: `nav` landmark, `aria-label="Main navigation"`, `aria-current="page"` on active item, `aria-expanded` on collapse toggle
- **And** the component has snapshot tests in both LTR and RTL, and unit tests for collapse toggle, badge rendering, keyboard navigation, and group rendering
- **And** the existing horizontal `AppShell` API is preserved as a deprecated `variant="horizontal"` prop for backward compatibility during migration

---

### Story 37.2: OPD-Lite — Adopt Sidebar Navigation

As a clinician,
I want a persistent sidebar in OPD-Lite with all clinical sections accessible in one click,
So that I can navigate between dashboard, patients, appointments, and admin features without relying on dashboard cards or the back button.

**Acceptance Criteria:**
- **Given** the upgraded `<AppShell>` from Story 37.1
- **When** the OPD-Lite locale layout (`apps/opd-lite/src/app/[locale]/layout.tsx`) is updated
- **Then** it renders the sidebar `<AppShell>` with these nav items in order:

| Group | Label | Icon | Route | Badge Source |
|-------|-------|------|-------|-------------|
| Core | Dashboard | `LayoutDashboard` | `/` | — |
| Core | Appointments | `Calendar` | `/appointments` | — (placeholder until Story 37.9) |
| Core | Patients | `Users` | `/patients` | — |
| Core | Register Patient | `UserPlus` | `/register-patient` | — |
| Clinical | Notifications | `Bell` | `/notifications` | Unread count from notification polling |
| Clinical | Conflicts | `AlertTriangle` | `/conflicts` | Unresolved count from `patient.unresolvedConflictCount` |
| Clinical | Duplicate Reviews | `UserSearch` | `/duplicate-review` | Pending count from `duplicateReview.pendingCount` |
| Clinical | Expiring Consents | `FileWarning` | `/expiring-consents` | Expiring count from `consent.expiringCount` |
| Admin | KYC Verification | `ShieldCheck` | `/kyc` | — |
| System | Settings | `Settings` | `/settings` | — |

- **And** the `AppHeader` is simplified to: app logo/name (left), patient search bar (center, keeping existing `SearchInput` + `PatientResultList`), and screen-sharing warning area (right)
- **And** `NotificationBell` is removed from the header (its count drives the Notifications badge in sidebar)
- **And** `SyncPulse` moves from the header to the sidebar footer `syncIndicator` slot
- **And** `UserDropdown` is removed from the header; user info + logout moves to sidebar footer `userSection` slot
- **And** the sidebar collapse state is persisted in localStorage under key `opd-lite-sidebar-collapsed`
- **And** all existing i18n keys in `nav.*` namespace are extended with new keys for each sidebar item label (en/ar/prs)
- **And** the sidebar is hidden on the `/login` route (layout checks pathname)
- **And** context-dependent routes (`/encounter/[patientId]`, `/patient/[patientId]`) do NOT appear in the sidebar

---

### Story 37.3: OPD-Lite — Patient Directory Page

As a clinician,
I want a dedicated patient directory page where I can browse, search, filter, and sort all my patients,
So that I can find patients without needing to remember their exact name for the search bar.

**Acceptance Criteria:**
- **Given** an authenticated clinician navigates to `/patients`
- **When** the page loads
- **Then** it displays a paginated table of all patients from the local IndexedDB patient store
- **And** columns are: Name (given + father's name), Age/DOB, Gender, Phone, Last Visit Date, Status (Active/Inactive/Merged), Allergy Flag (red dot if allergies exist)
- **And** the table supports sorting by any column (click column header to toggle asc/desc)
- **And** a search input above the table filters by name or phone number (client-side, debounced 300ms)
- **And** filter controls allow filtering by: Status (Active/Inactive/All), Has Allergies (yes/no/all), Last Visit (Today/This Week/This Month/All)
- **And** each row is clickable and navigates to `/patient/[patientId]`
- **And** when the table has fewer than 3 results, a "Register New Patient" dashed button appears below (consistent with existing `PatientResultList` pattern from MPI-P2-8)
- **And** the table works fully offline (reads from IndexedDB)
- **And** an "empty state" is shown when no patients exist: "No patients registered yet" with a CTA to `/register-patient`
- **And** pagination shows 25 patients per page with Previous/Next controls
- **And** the allergy flag column renders a red circle icon (not text) to maintain prominence per CLAUDE.md safety rule 4
- **And** all text uses i18n keys in a new `patients` namespace (en/ar/prs)
- **And** the table layout is RTL-safe with logical CSS properties

**Enhancement (2026-05-23): Hub API Bulk Sync**
The original implementation only read from local IndexedDB, leaving the directory empty on fresh installs or when patients were registered on other devices. Fixed by:
- Adding `patient.list` cursor-based paginated endpoint to Hub API (50/page, `created_at` cursor)
- Raising `patient.search` limit from 20 to 50
- Background sync on every `/patients` mount — local data renders instantly, Hub data merges in via `usePatientListSync` hook
- "Syncing..." indicator with pulsing blue dot during background fetch

---

### Story 37.4: Pharmacy-Lite — Upgrade to Sidebar Navigation

As a pharmacist,
I want the existing Pharmacy-Lite navigation upgraded from a basic app shell to a collapsible sidebar with badges and missing routes,
So that I can see actionable item counts at a glance and access all pharmacy workflows from one place.

**Acceptance Criteria:**
- **Given** the upgraded `<AppShell>` from Story 37.1
- **When** `AppShellWrapper.tsx` in Pharmacy-Lite is refactored to use the new sidebar variant
- **Then** it renders these nav items:

| Group | Label | Icon | Route | Badge Source |
|-------|-------|------|-------|-------------|
| Primary | Dashboard | `LayoutDashboard` | `/` | — |
| Primary | Scan Rx | `ScanLine` | `/scan` | — |
| Primary | Paper Rx | `FileText` | `/paper-rx` | — |
| Primary | Queue | `ClipboardList` | `/queue` | Active prescription count from queue store |
| Clinical | Dispensing History | `History` | `/history` | — |
| Clinical | Controlled Substances | `ShieldAlert` | `/controlled` | Flagged count (placeholder until page exists) |
| Clinical | Unverified Dispenses | `AlertCircle` | `/unverified` | Pending count from `dispense_reviews` query |
| System | Sync Queue | `RefreshCw` | `/sync` | Failed sync count from sync store |
| System | Settings | `Settings` | `/settings` | — |

- **And** the sidebar footer contains: `SyncPulse` in sync indicator slot, geofence status indicator (green circle if within 500m per PH-002, red if outside — reads from a new `useGeofenceStatus` hook that returns a boolean, defaulting to `true` until geofencing is implemented), user info (pharmacist name + pharmacy name from session store) + sign out in user section slot, and language selector
- **And** the existing `AppShellWrapper` nav items array is replaced with the new configuration
- **And** the header simplifies to: app logo and prescription search (if applicable)
- **And** existing translation keys in `nav.*` are extended with new item labels (en/ar/prs)
- **And** collapse state persists in localStorage under key `pharmacy-lite-sidebar-collapsed`

---

### Story 37.5: Pharmacy-Lite — Controlled Substances Log Page

As a pharmacist,
I want a dedicated page to view all controlled substance dispensing events,
So that I can maintain regulatory compliance and review flagged transactions (per PRD PH-020).

**Acceptance Criteria:**
- **Given** an authenticated pharmacist navigates to `/controlled`
- **When** the page loads
- **Then** it displays a paginated table of all dispenses where the medication has a controlled substance schedule flag
- **And** columns are: Date/Time, Patient (first name + DOB only per RBAC), Medication Name, Schedule Class, Prescriber, Status (Dispensed/Flagged/Under Review), Confirmation Required (boolean)
- **And** flagged items (where additional confirmation was required per PH-020) are highlighted with an amber background
- **And** a filter bar allows filtering by: Date Range, Schedule Class (I–V), Status
- **And** each row expands to show: dispensing pharmacist, batch/lot number, prescription ID, and whether override confirmation was used
- **And** the table reads from the local Dexie `dispenses` table filtered by a `controlledSubstanceSchedule` field
- **And** an export button allows downloading the filtered list as CSV for regulatory reporting
- **And** the page works fully offline
- **And** all text uses i18n keys in a new `controlled` namespace (en/ar/prs)
- **And** an empty state reads: "No controlled substance dispenses recorded"

---

### Story 37.6: Pharmacy-Lite — Unverified Dispenses Page

As a pharmacist,
I want a dedicated page listing all dispenses that were made under offline grace and require supervisor verification,
So that I can systematically review and resolve unverified dispenses rather than only seeing a count on the dashboard card.

**Acceptance Criteria:**
- **Given** an authenticated pharmacist navigates to `/unverified`
- **When** the page loads
- **Then** it displays all dispenses from `dispense_reviews` with status `PENDING`
- **And** columns are: Date/Time, Patient (first name + DOB), Medication, Grace Reason, Supervisor Name (entered at grace time), Status
- **And** each row has two action buttons: "Approve" (sets status to `APPROVED`) and "Flag" (sets status to `FLAGGED` and requires a reason text input)
- **And** approved/flagged items move to a "Resolved" tab below the pending list
- **And** the `UnverifiedDispensesCard` on the dashboard links to this page
- **And** badge count in the sidebar updates in real-time when items are resolved
- **And** all actions emit audit events via `dispenseAuditService`
- **And** the page works fully offline (writes to local Dexie, syncs when online)
- **And** all text uses i18n keys in a new `unverified` namespace (en/ar/prs)

---

### Story 37.7: Lab-Lite — Adopt Sidebar Navigation

As a lab technician,
I want Lab-Lite to have proper sidebar navigation instead of just a header,
So that I can quickly navigate between uploading results, viewing history, checking queue status, and managing settings.

**Acceptance Criteria:**
- **Given** the upgraded `<AppShell>` from Story 37.1
- **When** the Lab-Lite locale layout (`apps/lab-lite/src/app/[locale]/layout.tsx`) is updated
- **Then** it renders the sidebar `<AppShell>` with these nav items:

| Group | Label | Icon | Route | Badge Source |
|-------|-------|------|-------|-------------|
| Primary | Dashboard | `LayoutDashboard` | `/` | — |
| Primary | Upload Result | `Upload` | `/upload` | — |
| Primary | Upload History | `History` | `/history` | — |
| Clinical | Upload Queue | `Clock` | `/queue` | Pending + Failed count from queue store |
| Clinical | Notifications | `Bell` | `/notifications` | Unread count from notification polling |
| System | Settings | `Settings` | `/settings` | — |

- **And** the root layout header (`apps/lab-lite/src/app/layout.tsx`) is simplified to: app logo/name only (the existing "Lab Diagnostics Portal" title)
- **And** the existing `NotificationBell` component is removed from inline page usage; its unread count drives the sidebar Notifications badge
- **And** `OnlineStatusIndicator` moves to the sidebar footer sync indicator slot
- **And** `LabIdentityCard` information (lab name + technician name) moves to the sidebar footer user section slot with a sign-out button
- **And** language selector (`LanguageSelectorClient`) moves to the sidebar footer
- **And** the sidebar is hidden on the `/login` route
- **And** collapse state persists in localStorage under key `lab-lite-sidebar-collapsed`
- **And** all text uses i18n keys in an extended `nav.*` namespace (en/ar/prs)
- **And** the `/offline` page continues to work without sidebar (it's a fallback page)

---

### Story 37.8: Lab-Lite — Dedicated Upload Queue Page

As a lab technician,
I want a dedicated page for managing my upload queue separate from the dashboard,
So that I can focus on retrying failed uploads, discarding expired items, and monitoring upload progress without dashboard clutter.

**Acceptance Criteria:**
- **Given** an authenticated lab technician navigates to `/queue`
- **When** the page loads
- **Then** it displays the full upload queue from IndexedDB with tabs: Pending, Uploading, Failed, Expired
- **And** each tab shows a count badge in the tab header
- **And** each queue item shows: patient name + age (data-minimized per LAB-010), test category (LOINC label), file name + size, queued timestamp, status badge, and verification method (online/offline/cached via `OfflineVerificationBadge`)
- **And** Failed items have a "Retry" button that resets status to `pending` and re-queues
- **And** a "Retry All Failed" button appears when multiple failed items exist
- **And** Expired items (>48 hours) have a "Re-upload" button that navigates to `/upload` with pre-populated patient info
- **And** all items have a "Discard" button with a confirmation dialog
- **And** all actions (retry, discard, re-upload) emit audit events
- **And** the existing `UploadQueue` component is refactored to be reusable between dashboard (compact view) and this page (full view)
- **And** all text uses i18n keys in a new `queuePage` namespace (en/ar/prs)

---

### Story 37.9: Lab-Lite — Notification Center Page

As a lab technician,
I want a dedicated notification center page,
So that I can review all notifications including result upload confirmations, status changes, and system notices rather than only seeing them in a dropdown.

**Acceptance Criteria:**
- **Given** an authenticated lab technician navigates to `/notifications`
- **When** the page loads
- **Then** it displays a paginated list of all notifications fetched from the Hub API
- **And** notifications are grouped by type with tab filters: All, Result Updates, System Notices
- **And** each notification shows: type icon, message, timestamp (relative using existing `time.*` i18n keys), and read/unread status
- **And** unread notifications have a subtle left border highlight
- **And** clicking a notification marks it as read (calls acknowledge endpoint) and navigates to the relevant context if applicable (e.g., upload history for result notifications)
- **And** a "Mark All Read" button appears when unread notifications exist
- **And** the existing `NotificationPanel` dropdown is preserved for quick-view but adds a "See All" link to this page
- **And** an empty state reads: "No notifications yet"
- **And** all text uses i18n keys in the existing `notifications.*` namespace extended as needed (en/ar/prs)

---

### Story 37.10: Lab-Lite — Settings Page

As a lab technician,
I want a settings page in Lab-Lite,
So that I can view my profile, lab affiliation, session info, MFA status, and manage preferences.

**Acceptance Criteria:**
- **Given** an authenticated lab technician navigates to `/settings`
- **When** the page loads
- **Then** it displays four cards following the same pattern as Pharmacy-Lite's `PharmacySettingsView`:
  1. **Profile Card** — technician name, email, role badge ("Lab Technician"), practitioner ID
  2. **Lab Info Card** — lab name, operating license status, ISO 15189 accreditation status (if available)
  3. **Session Info Card** — session start time, time remaining (8h max for LAB_TECH), session ID (truncated)
  4. **MFA Status Card** — TOTP enrollment status, last verified timestamp
- **And** a language preference selector is included (switching updates locale cookie and redirects)
- **And** a "Sign Out" button at the bottom clears the auth session, wipes the encryption key, and redirects to `/login`
- **And** all text uses i18n keys in a new `settings` namespace (en/ar/prs)

---

### Story 37.11: FHIR R4 Appointment & Slot Types in shared-types

As a developer,
I want FHIR R4 `Appointment` and `Slot` type definitions in `@ultranos/shared-types`,
So that the appointment scheduling system uses standardized types consistent with the rest of the ecosystem.

**Acceptance Criteria:**
- **Given** `packages/shared-types/src/fhir/`
- **When** `appointment.ts` and `slot.ts` are created
- **Then** `Appointment` includes: `id`, `status` (enum: `proposed | pending | booked | arrived | fulfilled | cancelled | noshow | entered-in-error`), `serviceType` (coded: new-consult, follow-up, urgent, walk-in), `start` (ISO 8601), `end` (ISO 8601), `participant` (array with patient ref + practitioner ref + status), `description`, `_ultranos.createdAt`, `_ultranos.walkIn` (boolean), `_ultranos.queuePosition` (number | null), `_ultranos.hlcTimestamp` (string), `meta.lastUpdated`, `meta.versionId`
- **And** `Slot` includes: `id`, `schedule` (reference to practitioner), `status` (enum: `free | busy | busy-unavailable | busy-tentative | entered-in-error`), `start` (ISO 8601), `end` (ISO 8601), `_ultranos.slotDurationMinutes` (number), `_ultranos.hlcTimestamp` (string)
- **And** both types are exported from `packages/shared-types/src/fhir/index.ts`
- **And** a `AppointmentServiceType` enum is exported with values matching FHIR `service-type` value set subset relevant to OPD: `NEW_CONSULT`, `FOLLOW_UP`, `URGENT`, `WALK_IN`
- **And** unit tests validate type guards for valid/invalid appointment and slot objects
- **And** conflict resolution tier is documented in JSDoc: Appointments are Tier 3 (LWW), Walk-in queue positions are Tier 4 (HLC replay)

---

### Story 37.12: OPD-Lite — Appointment IndexedDB Store & Offline Queue

As a clinician,
I want appointments stored locally in IndexedDB with offline queue support,
So that I can view and book appointments even without network connectivity.

**Acceptance Criteria:**
- **Given** the FHIR types from Story 37.11
- **When** an `appointmentStore` is created in OPD-Lite using Dexie
- **Then** it has two tables: `appointments` (indexed by `id`, `start`, `status`, `participant.patient`) and `slots` (indexed by `id`, `start`, `status`, `schedule`)
- **And** both tables are encrypted via the existing Dexie encryption middleware (appointments contain patient refs which are PHI-adjacent)
- **And** a sync adapter exists that pushes local appointment creates/updates to the Hub API when online
- **And** the sync adapter pulls the practitioner's appointments for the current week from the Hub API on startup and on each sync cycle
- **And** appointment creates and status changes are stamped with HLC timestamps
- **And** double-booking detection runs locally: if a slot is `busy` and a new appointment targets that slot, the create is rejected with a user-visible warning
- **And** when offline, appointments are queued in the existing sync engine queue with priority level below prescriptions but above metadata (per CLAUDE.md sync priority)
- **And** post-sync double-booking conflicts (two devices booked same slot offline) are flagged for manual resolution rather than auto-rejected

---

### Story 37.13: OPD-Lite — Daily Schedule View

As a clinician,
I want to see my daily appointment schedule,
So that I can plan my day, see who's checked in, and manage walk-ins alongside booked patients.

**Acceptance Criteria:**
- **Given** an authenticated clinician navigates to `/appointments`
- **When** the page loads
- **Then** it displays today's date prominently with Previous/Next day navigation arrows
- **And** a date picker allows jumping to any date
- **And** the day view shows a time-slot grid from clinic open to clinic close (default 08:00–17:00, configurable per deployment)
- **And** each slot shows: time, patient name (or "Available" if free), appointment type badge (New Consult / Follow-up / Urgent / Walk-in), and status badge (Scheduled / Checked In / In Progress / Completed / No-Show / Cancelled)
- **And** clicking an occupied slot opens a brief patient summary with: name, age, allergies (if any, in red per safety rule 4), appointment type, and two action buttons: "Start Encounter" (navigates to `/encounter/[patientId]`) and "Change Status" (dropdown: Checked In → In Progress → Completed / No-Show)
- **And** clicking an "Available" slot opens a "Book Appointment" flow (Story 37.15)
- **And** a "Walk-In Queue" section below the schedule grid shows today's walk-in patients ordered by queue position (Story 37.14)
- **And** the view works fully offline (reads from IndexedDB)
- **And** a "Week View" toggle switches to Story 37.16's week view
- **And** all text uses i18n keys in a new `appointments` namespace (en/ar/prs)
- **And** the daily view is RTL-safe (time column on the right in RTL)

---

### Story 37.14: OPD-Lite — Walk-In Queue Management

As a clinician,
I want to manage walk-in patients in a queue alongside my booked schedule,
So that unscheduled patients are tracked, prioritized, and seen in order without losing their place.

**Acceptance Criteria:**
- **Given** the daily schedule view from Story 37.13
- **When** a clinician clicks "Add Walk-In" on the appointments page
- **Then** a modal opens with: patient search (existing `SearchInput` component), appointment type selector (defaults to "Walk-In", can be "Urgent"), and an optional notes field
- **And** submitting creates a FHIR `Appointment` with `status: arrived`, `serviceType: WALK_IN`, `_ultranos.walkIn: true`, and `_ultranos.queuePosition` set to the next available integer
- **And** the walk-in queue section on the daily view shows all walk-in appointments ordered by `queuePosition`
- **And** each walk-in row shows: queue number (#1, #2...), patient name, wait time (calculated from `_ultranos.createdAt`), urgency badge (if type is Urgent, shown in red), and status
- **And** drag-and-drop reordering is supported to reprioritize the queue (updates `queuePosition` values)
- **And** "Urgent" walk-ins are visually distinguished (red left border) and sort to the top by default
- **And** clicking a walk-in patient shows the same summary popup as booked patients with "Start Encounter" and "Change Status" actions
- **And** when a walk-in is marked "In Progress", their row highlights to show they're being seen
- **And** the walk-in queue persists in IndexedDB and works fully offline
- **And** walk-in queue changes sync to Hub with Tier 4 HLC replay conflict resolution

---

### Story 37.15: OPD-Lite — Book Appointment Flow

As a clinician,
I want to book an appointment for a patient by selecting a date, time slot, and appointment type,
So that patients have confirmed visit times and my schedule is organized.

**Acceptance Criteria:**
- **Given** a clinician clicks an "Available" slot on the daily/weekly view, or clicks a "Book Appointment" button
- **When** the booking modal opens
- **Then** it shows: a patient search field (uses existing `SearchInput`), a date picker (pre-filled with the selected date if coming from a slot), available time slots for the selected date (read from IndexedDB `slots` table, showing only `free` slots), appointment type selector (New Consult / Follow-up / Urgent), and an optional notes field
- **And** selecting a patient shows their allergy status prominently (red banner if allergies exist)
- **And** the "Confirm Booking" button creates a FHIR `Appointment` with `status: booked` and updates the corresponding `Slot` to `status: busy`
- **And** if the patient doesn't exist yet, a "Register New Patient" link opens the registration page (consistent with existing pattern)
- **And** double-booking prevention: if the slot status is already `busy` when confirming, the modal shows a warning "This slot has been taken" and refreshes available slots
- **And** the booking is saved to IndexedDB immediately (optimistic UI) and queued for Hub sync
- **And** a cancellation flow exists: from any booked appointment, "Cancel" sets status to `cancelled` and frees the slot
- **And** all actions emit audit events (appointment booked, cancelled)
- **And** all text uses i18n keys in the `appointments` namespace (en/ar/prs)

---

### Story 37.16: OPD-Lite — Weekly Schedule View

As a clinician,
I want a weekly view of my schedule,
So that I can plan ahead, identify open slots, and see the overall week at a glance.

**Acceptance Criteria:**
- **Given** an authenticated clinician toggles to "Week View" on the appointments page
- **When** the week view renders
- **Then** it displays a 7-day grid (Saturday–Friday for MENA locale, configurable) with time rows
- **And** each cell shows: appointment count for that slot, color-coded by type (green = New Consult, blue = Follow-up, red = Urgent, amber = Walk-in)
- **And** clicking a day header navigates to the daily view for that day
- **And** clicking a specific cell opens the booking modal pre-filled with that date/time
- **And** today's column is highlighted with a subtle background color
- **And** navigation arrows allow moving to previous/next week
- **And** the view reads from IndexedDB and works fully offline
- **And** the week starts on Saturday by default (configurable via a `NEXT_PUBLIC_WEEK_START` env var for different regions)
- **And** the grid is responsive: on viewports < 1024px, it stacks to a list view showing one day at a time with swipe navigation
- **And** the view is RTL-safe (days flow right-to-left in RTL mode)

---

### Story 37.17: Hub API — Appointment CRUD & Sync Endpoints

As a developer,
I want Hub API endpoints for appointment and slot CRUD operations,
So that appointments sync between devices and the central hub maintains the authoritative schedule.

**Acceptance Criteria:**
- **Given** the FHIR types from Story 37.11
- **When** a new `appointment` tRPC router is created in `apps/hub-api/`
- **Then** it exposes these procedures:
  1. `appointment.listByPractitioner` — returns appointments for a practitioner within a date range, paginated
  2. `appointment.listByPatient` — returns appointments for a patient (used for encounter history context)
  3. `appointment.create` — creates an appointment + updates slot status, with double-booking validation
  4. `appointment.updateStatus` — transitions appointment status (booked → arrived → fulfilled, or booked → cancelled → slot freed)
  5. `appointment.syncBatch` — accepts a batch of offline-created appointments with HLC timestamps, applies Tier 3 LWW resolution for status conflicts, flags double-booking conflicts for manual review
  6. `slot.listByPractitioner` — returns slots for a practitioner on a given date
  7. `slot.generateDaily` — generates slot entries for a practitioner's working day (called by a daily cron or on first query of a new day)
- **And** all endpoints enforce RBAC: only the practitioner themselves or ADMIN can modify their appointments
- **And** all endpoints emit audit events for PHI access (appointment references patient)
- **And** the `patients` table is NOT joined — appointment responses contain only `patientRef` (opaque ID), not demographics
- **And** the router has comprehensive tests covering: CRUD operations, double-booking rejection, offline batch sync with conflicts, RBAC enforcement, and audit event emission

---

### Story 37.18: OPD-Lite — Appointment Sync Integration

As a clinician,
I want my locally created appointments to sync to the Hub and remote appointments to appear locally,
So that my schedule stays consistent across devices and is backed up centrally.

**Acceptance Criteria:**
- **Given** the IndexedDB store from Story 37.12 and the Hub API from Story 37.17
- **When** the app comes online or the periodic sync cycle fires
- **Then** all locally created/modified appointments with unsynced HLC timestamps are batched and sent to `appointment.syncBatch`
- **And** the Hub response includes any conflicts (double-bookings detected across devices), which are surfaced as amber warning banners on the daily view: "Scheduling conflict detected for [time] — please review"
- **And** the Hub's authoritative appointment list for the current week is pulled and merged into local IndexedDB (newer Hub entries overwrite local per Tier 3 LWW)
- **And** deleted/cancelled appointments from the Hub are reflected locally
- **And** the sync priority for appointments is: below prescriptions and consent, above demographics (added to the sync engine priority list)
- **And** sync failures for appointments do not block higher-priority sync items (allergies, consent, prescriptions)
- **And** the `SyncPulse` indicator in the sidebar footer reflects appointment sync status

---

### Story 37.19: OPD-Lite — Appointment Badge in Sidebar

As a clinician,
I want the Appointments sidebar item to show today's appointment count as a badge,
So that I can see at a glance how many patients are on my schedule for today.

**Acceptance Criteria:**
- **Given** the sidebar from Story 37.2
- **When** the appointments page or any page loads
- **Then** the Appointments nav item badge shows the count of today's non-cancelled appointments (status: booked, arrived, or in-progress)
- **And** the badge updates when appointments are created, cancelled, or their status changes
- **And** the badge reads from a lightweight IndexedDB query (count only, not full records)
- **And** if the count is 0, no badge is shown

## Implementation Status

| Story | Status | Tests |
|-------|--------|-------|
| 37.1: AppShell Sidebar Upgrade | ✅ Done | Sidebar.test.tsx (20) |
| 37.2: OPD-Lite Sidebar Adoption | ✅ Done | (UI changes) |
| 37.3: OPD-Lite Patient Directory | ✅ Done (+ Hub sync 2026-05-23) | patient-directory.test.tsx (7) |
| 37.4: Pharmacy-Lite Sidebar Upgrade | ✅ Done | (UI changes) |
| 37.5: Pharmacy Controlled Substances Page | ✅ Done | (UI + data wiring) |
| 37.6: Pharmacy Unverified Dispenses Page | ✅ Done | (UI + data wiring) |
| 37.7: Lab-Lite Sidebar Adoption | ✅ Done | (UI changes) |
| 37.8: Lab-Lite Upload Queue Page | ✅ Done | (UI changes) |
| 37.9: Lab-Lite Notification Center Page | ✅ Done | (UI changes) |
| 37.10: Lab-Lite Settings Page | ✅ Done | (UI changes) |
| 37.11: FHIR Appointment & Slot Types | ✅ Done | shared-types build (99) |
| 37.12: OPD-Lite Appointment IndexedDB Store | ✅ Done | (Dexie v18) |
| 37.13: OPD-Lite Daily Schedule View | ✅ Done | appointments.test.tsx (8) |
| 37.14: OPD-Lite Walk-In Queue | ✅ Done | appointments.test.tsx (8) |
| 37.15: OPD-Lite Book Appointment Flow | ✅ Done | appointments.test.tsx (8) |
| 37.16: OPD-Lite Weekly Schedule View | ✅ Done | (UI changes) |
| 37.17: Hub API Appointment Endpoints | ✅ Done | (migration 027 applied) |
| 37.18: OPD-Lite Appointment Sync | ✅ Done | (Hub API connected) |
| 37.19: OPD-Lite Appointment Sidebar Badge | ✅ Done | (badge wired) |

## Recommended Build Sequence

**Phase 1 — Foundation (Stories 37.1, 37.11)**
Build the shared AppShell sidebar component and FHIR types first. Everything else depends on these.

**Phase 2 — Sidebar Adoption (Stories 37.2, 37.4, 37.7) — parallelizable**
All three apps adopt the new sidebar simultaneously. These are independent and can be built in parallel by separate developers or agents.

**Phase 3 — Missing Pages (Stories 37.3, 37.5, 37.6, 37.8, 37.9, 37.10) — parallelizable**
New pages for each app. Patient directory (OPD), controlled substances + unverified dispenses (Pharmacy), queue + notifications + settings (Lab). All independent.

**Phase 4 — Scheduling Backend (Stories 37.12, 37.17)**
IndexedDB store and Hub API endpoints. 37.12 can start immediately after 37.11; 37.17 is independent.

**Phase 5 — Scheduling UI (Stories 37.13, 37.14, 37.15, 37.16, 37.19)**
Daily view, walk-in queue, booking flow, weekly view, and badge. Sequential — daily view first, then walk-in and booking in parallel, then weekly view.

**Phase 6 — Sync Integration (Story 37.18)**
Connects local scheduling to Hub API. Requires both 37.12 and 37.17 to be complete.

---

# Addendum 12 — Lab Lite Enterprise UX Overhaul

> Addresses FR38–FR40. Transforms Lab Lite from functional prototype to enterprise-grade lab diagnostics app.
> Branch: `ux-v1.0`
> Date: 2026-05-23
> Commits: `ab35ea0` through `e5b9709` (12 commits)
> Plan: `docs/superpowers/plans/2026-05-23-lab-lite-enterprise-ux.md`

## Epic 38: Lab Lite Enterprise UX

### Story 38.1: Upload Success Confirmation Banner (P0)
As a lab technician, I want to see a clear confirmation when my upload is queued, so that I know the result was received and don't re-upload duplicates.

**Acceptance Criteria:**
- **Given** the technician completes the 4-step upload wizard and is redirected to `/?uploaded=true`
- **When** the dashboard loads
- **Then** a green success banner appears with a checkmark icon and message "Result queued successfully"
- **And** the `?uploaded=true` query param is cleaned from the URL via `history.replaceState`
- **And** the banner has `role="status"` and `aria-live="polite"` for screen reader announcement
- **And** the banner can be dismissed via a "Dismiss" button
- **And** all strings are i18n'd via `useTranslations('dashboard')`

> **Status:** ✅ Done — Commit `ab35ea0`

### Story 38.2: Cancel/Recall Queued Uploads from Dashboard
As a lab technician, I want to cancel a queued upload from the dashboard before it syncs, so that I can correct mistakes (e.g., wrong patient).

**Acceptance Criteria:**
- **Given** a recent upload in "pending" or "failed" status from the local queue
- **When** the technician clicks "Cancel" on the upload item
- **Then** a two-step confirmation appears ("Yes, cancel" / "No, keep")
- **And** confirming deletes the item from IndexedDB via `removeQueueItem`
- **And** a `QUEUE_ITEM_DISCARDED` audit event is emitted
- **And** the dashboard data refreshes immediately
- **And** recent uploads now show patient first name prefix (e.g., "Ahmad — Blood Work CBC")
- **And** `patientFirstName` and `localQueueId` are exposed on `RecentUploadItem`

> **Status:** ✅ Done — Commit `a8b23d0`

### Story 38.3: Complete i18n Coverage for Upload Workflow
As a lab technician using a non-English locale, I want all upload workflow text to be translated, so that I can use the app in my language.

**Acceptance Criteria:**
- **Given** the StepIndicator, MetadataForm, ReviewStep, upload page, and offline page
- **When** rendering in any supported locale
- **Then** all user-facing text comes from `next-intl` translations, not hardcoded strings
- **And** StepIndicator step labels use `useTranslations('steps')` with dynamic keys
- **And** MetadataForm uses `useTranslations('metadata')` for all labels, errors, OCR status, confidence labels
- **And** ReviewStep uses `useTranslations('results')` with interpolated values for patient/file display
- **And** upload page uses `useTranslations()` for title, toggle labels, navigation buttons
- **And** offline page uses `useTranslations('offline')` for message and button

> **Status:** ✅ Done — Commit `ae03b12`

### Story 38.4: Date Validation and Error Messaging
As a lab technician, I want the collection date field to prevent future dates, so that I don't accidentally submit incorrect metadata.

**Acceptance Criteria:**
- **Given** the MetadataForm collection date input
- **When** the technician selects a date
- **Then** the browser's native date picker constrains to today or earlier via `max` attribute
- **And** client-side validation rejects future dates with a clear error message
- **And** the error message is i18n'd via `metadata.errorFutureDate`

> **Status:** ✅ Done — Commit `5d782c4`

### Story 38.5: Dashboard Visual Hierarchy Redesign
As a lab technician, I want the dashboard to clearly show what needs my attention, so that I can quickly start uploads or address failures.

**Acceptance Criteria:**
- **Given** the lab-lite dashboard at `/`
- **When** the page loads
- **Then** the layout renders in this order: success banner, error banner, greeting header ("Welcome back, {name}"), Upload CTA (pill button with plus icon, no card wrapper), queue status card, activity summary card, recent uploads list
- **And** the `LabIdentityCard` is replaced by a `DashboardHeader` component (non-card greeting)
- **And** the `QuickActions` button has no card wrapper (standalone elevated CTA)
- **And** the `QueueStatusCard` highlights with red border and background when `failed > 0`
- **And** the `QueueStatusCard` shows "N failed — tap to review" link to `/queue` when failures/expired exist
- **And** the `ActivitySummaryCard` shows "Updated HH:MM" timestamp from `lastRefreshedAt`
- **And** `useDashboardData` exposes `lastRefreshedAt: string | null`
- **And** the old `LabIdentityCard.tsx` file is deleted

> **Status:** ✅ Done — Commit `457d6fc`

### Story 38.6: Dexie Schema Extension for Patient Cache
As a developer, I want the lab-lite Dexie schema to support full patient records, so that patient search and registration can work offline-first.

**Acceptance Criteria:**
- **Given** the lab-lite Dexie database at version 2
- **When** the migration runs
- **Then** version 3 adds `patients` table (indexed on `&id`, `_ultranos.nameLocal`, `_ultranos.nameLatin`, `meta.lastUpdated`)
- **And** version 3 adds `syncQueue` table (indexed on `&id`, `resourceType`, `resourceId`, `status`, `createdAt`)
- **And** helper functions `getPatients`, `putPatient`, `putPatients`, `getPatientById` are exported
- **And** all existing v1/v2 tables and functions are unchanged

> **Status:** ✅ Done — Commit `e68d3bc`

### Story 38.7: Two-Phase Patient Search Hook
As a lab technician, I want to search for patients by name, so that I can find patients without their national ID.

**Acceptance Criteria:**
- **Given** a search query of 2+ characters
- **When** the search executes
- **Then** Phase 1: immediate local Dexie search on `_ultranos.nameLocal`, `nameGiven`, `nameLatin` (case-insensitive includes)
- **And** Phase 2: background Hub API revalidation via `lab.searchPatients` (non-blocking)
- **And** results merge by ID with remote items taking precedence
- **And** both phases are independently try/caught (offline-safe)
- **And** `searchPatients` tRPC function is added with 10-second timeout

> **Status:** ✅ Done — Commit `2ec3a3c`

### Story 38.8: Recent Patients List in Upload Wizard
As a lab technician, I want to see recently verified patients when starting an upload, so that I can quickly select without re-entering their ID.

**Acceptance Criteria:**
- **Given** the upload wizard Step 1 (Verify Patient)
- **When** the step renders and the `verified_patients` cache has entries
- **Then** a "Recent Patients" card appears above the verification tabs
- **And** each patient shows first name and age with a clickable button
- **And** clicking a patient sets the wizard patient state and advances to Step 2
- **And** the list returns null when empty (no empty-state card)

> **Status:** ✅ Done — Commit `43801c3`

### Story 38.9: Patient Search Autocomplete in Upload Wizard
As a lab technician, I want to search for patients by name during upload, so that I have an alternative to manual ID lookup or QR scan.

**Acceptance Criteria:**
- **Given** the upload wizard Step 1
- **When** the page loads
- **Then** the default verification mode is "Search" (new tab, before "Manual ID" and "QR Scan")
- **And** the search input uses the `usePatientSearch` hook with 250ms debounce
- **And** a dropdown shows results with first name and age
- **And** shows "Searching..." during search, "No patients found" on empty results
- **And** clicking a result sets patient and advances to Step 2
- **And** the dropdown closes on outside click or result selection
- **And** the pre-existing syntax error in upload/page.tsx (double `}}`) is fixed

> **Status:** ✅ Done — Commit `43801c3`

### Story 38.10: Patient Registration with MPI Duplicate Detection
As a lab technician, I want to register a new patient when they don't exist in the system, so that I can upload results for first-time patients.

**Acceptance Criteria:**
- **Given** the `/patients/register` page
- **When** the technician fills the registration form
- **Then** the form collects: given name (required), father's name (optional), gender (required), birth info (year-only toggle or full date), phone (optional), consent (written or verbal with witness)
- **And** client-side validation enforces required fields and year range (1900-current)
- **And** submitting calls `patient.checkDuplicates` Hub API endpoint
- **And** if ALLOW: calls `patient.create`, saves to local Dexie, redirects to `/upload`
- **And** if WARN: shows MpiResultModal with candidates, score badges (red ≥80, amber ≥60, gray <60), "Add Anyway" with proceedToken, "Use This Patient"
- **And** if BLOCK: shows MpiResultModal without "Add Anyway", only "Use This Patient" or "Cancel"
- **And** a "Register Patient" nav item is added to the sidebar
- **And** the FHIR Patient structure with `_ultranos` extensions is used for local persistence
- **And** consent is mandatory (method + optional witness for verbal)

> **Status:** ✅ Done — Commit `dd9f380`

### Story 38.11: Contextual Tooltips for MetadataForm
As a lab technician, I want help text on the LOINC category and collection date fields, so that I understand what to enter.

**Acceptance Criteria:**
- **Given** the MetadataForm
- **When** hovering or focusing the "?" icon next to "Test Category" or "Sample Collection Date"
- **Then** a tooltip appears with contextual help text
- **And** the tooltip is keyboard-accessible (shows on focus, hides on blur)
- **And** the tooltip has `role="tooltip"` and `aria-label` on the trigger button
- **And** help text explains LOINC categories, collection date meaning

> **Status:** ✅ Done — Commit `7df064e`

### Story 38.12: Keyboard Shortcuts for Upload Wizard
As a lab technician, I want keyboard shortcuts to navigate the upload wizard, so that I can work more efficiently.

**Acceptance Criteria:**
- **Given** the upload wizard on any step except Step 1
- **When** the technician presses Escape (and focus is not on an input/textarea/select)
- **Then** the wizard navigates back one step
- **And** the shortcut does not fire when typing in form fields

> **Status:** ✅ Done — Commit `c922ace`

### Story 38.13: Input Styling Unification and Polish
As a developer, I want consistent input styling and no duplicate utilities, so that the app feels cohesive.

**Acceptance Criteria:**
- **Given** the login page inputs use `rounded-md` and `focus:ring-1`
- **When** the polish is applied
- **Then** all inputs use `rounded-lg` and `focus:ring-2` consistently
- **And** the duplicate `formatFileSize` functions in `ResultUpload.tsx` and `ReviewStep.tsx` are replaced with a single shared utility at `lib/format.ts`
- **And** the Settings page removes the Session Info and MFA Status cards (which showed only `--` placeholders)

> **Status:** ✅ Done — Commit `e5b9709`

## Implementation Summary

| Phase | Stories | What it delivers |
|-------|---------|-----------------|
| **1. Harden** | 38.1–38.4 | P0 success banner, cancel queued uploads, i18n completion, date validation |
| **2. Dashboard** | 38.5 | Visual hierarchy, elevated CTA, attention states, last-refreshed timestamp |
| **3. Patients** | 38.6–38.10 | Dexie schema, search hook, recent patients, search autocomplete, registration + MPI |
| **4. Onboard** | 38.11 | Tooltip component, contextual help on LOINC/OCR/dates |
| **5. Efficiency** | 38.12 | Escape key shortcut for wizard navigation |
| **6. Polish** | 38.13 | Unified styling, shared utilities, settings cleanup |

---

# Addendum 13: Pharmacy Lite Enterprise UX Overhaul (Epic 39)

**Date:** 2026-05-24
**Branch:** `ux-v1.0`
**Commits:** `bd59eff` through `b240b31` (9 commits)
**Plan:** `docs/superpowers/plans/2026-05-24-pharmacy-lite-enterprise-ux.md`

**Trigger:** `/impeccable critique` design review scored the app 20/40 on Nielsen's heuristics. Critical gaps identified: no patient intake workflow (P0), no dispensing safety gates (P1), cramped content width (P2), dead-end empty states (P3), no keyboard shortcuts (P4).

## Epic 39: Pharmacy Lite Enterprise UX Overhaul

Transform pharmacy-lite from a functional prototype into an enterprise-grade pharmacy workstation with patient intake, dispensing safety gates, responsive layouts, confident visual identity, meaningful onboarding, and power-user efficiency. Standalone pharmacies can now operate independently without OPD-Lite.

### Story 39.1: Button Component Accessibility
As a pharmacist using keyboard navigation, I want focus rings only visible on keyboard use and smooth transitions scoped to intended properties, so that mouse users aren't distracted and animations are performant.

**Acceptance Criteria:**
- `focus:` classes replaced with `focus-visible:` globally via Button component
- `transition-all` replaced with `transition-[transform,filter,background-color]`
- Default `ease-out` replaced with custom Ultranos easing `cubic-bezier(0.23,1,0.32,1)`
- `motion-reduce:transition-none` replaces verbose per-property motion guards

> **Status:** ✅ Done — Commit `bd59eff`

### Story 39.2: Motion-Reduce Guards & Design Token Usage
As a user with motion sensitivity, I want animations to respect `prefers-reduced-motion`, and I want the codebase to use design tokens consistently.

**Acceptance Criteria:**
- `animate-pulse` and `animate-spin` in QueueItemCard and SyncPulse get `motion-reduce:animate-none`
- `bg-black/40` replaced with `bg-neutral-900/40` (DESIGN.md compliance)
- Hardcoded `#163300` replaced with `pill-text` design token

> **Status:** ✅ Done — Commit `6b79a82`

### Story 39.3: Responsive Content Width & Dark Mode Cleanup
As a pharmacist reviewing controlled substance logs on a wide monitor, I want table-heavy pages to use available screen width.

**Acceptance Criteria:**
- Table pages (`/controlled`, `/unverified`, `/history`, `/sync`, `/queue`) get `max-w-5xl`
- Form pages (scan, settings, dashboard) remain `max-w-2xl`
- All incomplete `dark:*` classes removed from ControlledSubstancesView and UnverifiedDispensesView
- `alert()` calls replaced with inline `setError()` state

> **Status:** ✅ Done — Commit `784824a`

### Story 39.4: Patient Database Schema & Store
As a standalone pharmacy, I need a local patient registry so I can serve walk-in patients without requiring them to have a QR code.

**Acceptance Criteria:**
- Dexie v5 migration adds `patients` table (indexed: id, nameGiven, phone, createdAt)
- `LocalPatient` interface: id, nameGiven, nameFather, gender, birthYear, phone, allergies, source
- PHI encryption configured for patients table
- Zustand `usePatientStore` with activePatient state

> **Status:** ✅ Done — Commit `6646684`

### Story 39.5: Two-Phase Patient Search Hook
As a pharmacist searching for a returning patient, I want instant local results with background Hub enrichment.

**Acceptance Criteria:**
- `searchPatientsLocal()`: Dexie filter, case-insensitive name prefix + phone prefix, limit 20
- `searchPatientsHub()`: Hub API call with abort signal, returns additional matches
- `usePatientSearch` hook: 300ms debounce, local-first, background Hub merge, deduped by ID
- Graceful offline fallback (Hub phase skipped when offline)

> **Status:** ✅ Done — Commit `6646684`

### Story 39.6: Patient Search UI Components
As a pharmacist, I want to search patients by name/phone with inline results and a register option.

**Acceptance Criteria:**
- `PatientSearchBar`: input with spinner, results dropdown, accessibility (focus-visible)
- `PatientSearchResults`: list with patient info, allergy badge (red "ALLERGIES" tag), "Register new patient" link when <5 results or no results
- Keyboard accessible (Enter/Space to select)

> **Status:** ✅ Done — Commit `bd3a0c1`

### Story 39.7: Patient Registration Form
As a pharmacist registering a walk-in patient, I want a minimal form that captures essential info including allergies.

**Acceptance Criteria:**
- Fields: name (required), father's name, gender (required), birth year, phone, allergies
- Allergy input styled in red (CLAUDE.md rule #4), tag-based with add/remove
- Saves to local Dexie + enqueues sync to Hub
- Prefills name from search query when no results found

> **Status:** ✅ Done — Commit `bd3a0c1`

### Story 39.8: Multi-Entry Dashboard Action Hub
As a pharmacist, I want the dashboard to clearly present all entry paths: patient search, QR scan, paper Rx, and walk-in registration.

**Acceptance Criteria:**
- Patient search bar as primary action (search → select → navigate to scan)
- Three action cards below: Scan QR Rx (from OPD-Lite), Paper Rx (OCR), Walk-in (new patient)
- Registration form inline when "Walk-in" is selected
- Patient set in store before navigation to scan page

> **Status:** ✅ Done — Commit `39c218e`

### Story 39.9: Allergy Banner (Safety-Critical)
As a pharmacist about to dispense medication, I want patient allergies prominently displayed in red so I never miss them.

**Acceptance Criteria:**
- Red border-2, bg-red-50, `role="alert"`, `aria-live="assertive"`
- Warning icon + "KNOWN ALLERGIES" uppercase heading
- Allergy tags as red pills (bg-red-200, font-bold)
- Never collapsed, never behind a tab (CLAUDE.md rule #4)

> **Status:** ✅ Done — Commit `a70f0f4`

### Story 39.10: Drug Interaction Check Banner
As a pharmacist, I want clear feedback on drug interaction status so I never unknowingly dispense a contraindicated combination.

**Acceptance Criteria:**
- 5 states: checking, clear, warning, contraindicated, unavailable
- "Unavailable" state explicitly warns (CLAUDE.md rule #3: never default to "no interactions")
- "Contraindicated" blocks dispensing with imperative messaging
- Exported `InteractionStatus` type for integration

> **Status:** ✅ Done — Commit `a70f0f4`

### Story 39.11: Dispensing Confirmation Modal
As a pharmacist, I want a confirmation gate before final dispensing that re-displays allergies and requires acknowledgement.

**Acceptance Criteria:**
- Modal with patient allergies (AllergyBanner), medication summary, and pharmacist acknowledgement checkbox
- "Dispense Medication" button disabled until checkbox checked
- Integrated into FulfillmentChecklist (replaces direct onConfirm call)
- AllergyBanner also shown inline in FulfillmentChecklist above medication list

> **Status:** ✅ Done — Commit `a70f0f4`

### Story 39.12: Reusable Empty State Component
As a new pharmacy onboarding, I want meaningful empty states with guidance and CTAs instead of dead-end gray text.

**Acceptance Criteria:**
- `EmptyState` component with 6 icon variants, title, description, optional action button/link
- Deployed to PrescriptionQueueView (active tab: "Scan Prescription" CTA) and RecentDispensingList ("Start Scanning" CTA)
- Green circle icon container matching brand

> **Status:** ✅ Done — Commit `941b432`

### Story 39.13: Dispensing Summary Card Visual Hierarchy
As a pharmacist glancing at the dashboard, I want the primary metric (dispensed today) visually distinct from secondary metrics (pending/failed).

**Acceptance Criteria:**
- Primary metric: large card, `text-3xl`, green-tinted border, descriptive subtitle
- Secondary metrics: smaller two-column row, `text-lg`
- Failed metric turns red when non-zero (border-red-300, bg-red-50)
- Pending turns amber when non-zero
- `tabular-nums` on all numeric values

> **Status:** ✅ Done — Commit `941b432`

### Story 39.14: Session Expiry Warning Banner
As a pharmacist mid-shift, I want a proactive warning when my session is about to expire so I can save work.

**Acceptance Criteria:**
- `useSessionExpiryWarning` hook: polls every 30s, warns at 15 minutes remaining
- Amber banner with `role="alert"` shows ceiling-rounded minutes
- Rendered in AppShellWrapper between SyncCapacityBanner and page content

> **Status:** ✅ Done — Commit `b240b31`

### Story 39.15: Keyboard Shortcuts System
As a pharmacist dispensing 80+ prescriptions per shift, I want keyboard shortcuts for primary navigation.

**Acceptance Criteria:**
- Alt+1: Dashboard, Alt+2: Scan, Alt+3: Queue, Alt+4: History
- Shortcuts disabled when focus is in input/textarea/select
- `useKeyboardShortcuts` hook registered in AppShellWrapper

> **Status:** ✅ Done — Commit `b240b31`

### Story 39.16: Login Page Branding
As a pharmacist signing in, I want the login page to feel branded and professional.

**Acceptance Criteria:**
- "Pharmacy Lite" heading + "Powered by Ultranos" above the card
- "Sign In" heading (not "Pharmacy Lite Sign In" — redundant)
- Footer: "Secure healthcare platform"
- All inputs use `focus-visible:` instead of `focus:`

> **Status:** ✅ Done — Commit `b240b31`

### Story 39.17: Patient Name Display in Recent Dispensing
As a pharmacist reviewing recent activity, I want to see patient names instead of FHIR UUIDs.

**Acceptance Criteria:**
- `RecentDispenseItem` interface extended with optional `patientName`
- `queryDashboardStats()` enriches dispenses with names from local `db.patients`
- Display falls back to `patientRef` when name unavailable

> **Status:** ✅ Done — Commit `b240b31`

## Implementation Summary

| Phase | Stories | What it delivers |
|-------|---------|-----------------|
| **1. Foundation** | 39.1–39.3 | Button a11y, motion guards, responsive width, dark mode cleanup |
| **2. Patient Intake (P0)** | 39.4–39.8 | DB schema, search, registration, multi-entry dashboard hub |
| **3. Safety Gates (P1)** | 39.9–39.11 | Allergy banner, interaction check, confirmation modal |
| **4. Onboarding (P3)** | 39.12 | EmptyState component with CTAs |
| **5. Visual (P4)** | 39.13–39.14 | Summary card hierarchy, session expiry warning |
| **6. Efficiency (P4)** | 39.15 | Alt+1-4 keyboard shortcuts |
| **7. Polish** | 39.16–39.17 | Login branding, patient name display |

### New Files Created
- `apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx`
- `apps/pharmacy-lite/src/hooks/usePatientSearch.ts`
- `apps/pharmacy-lite/src/hooks/useKeyboardShortcuts.ts`
- `apps/pharmacy-lite/src/hooks/useSessionExpiryWarning.ts`
- `apps/pharmacy-lite/src/lib/patient-search.ts`
- `apps/pharmacy-lite/src/lib/patient-register.ts`
- `apps/pharmacy-lite/src/stores/patient-store.ts`
- `apps/pharmacy-lite/src/__tests__/button-accessibility.test.tsx`

### Files Modified
- `apps/pharmacy-lite/src/components/ui/Button.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/ShiftSummary.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx`
- `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`
- `apps/pharmacy-lite/src/app/[locale]/login/page.tsx`
- `apps/pharmacy-lite/src/lib/db.ts`

### New Files Created
- `apps/lab-lite/src/components/dashboard/UploadSuccessBanner.tsx`
- `apps/lab-lite/src/components/dashboard/DashboardHeader.tsx`
- `apps/lab-lite/src/hooks/usePatientSearch.ts`
- `apps/lab-lite/src/hooks/useRecentPatients.ts`
- `apps/lab-lite/src/components/upload/RecentPatientsList.tsx`
- `apps/lab-lite/src/components/upload/PatientSearchInput.tsx`
- `apps/lab-lite/src/components/patients/PatientRegistrationForm.tsx`
- `apps/lab-lite/src/components/patients/MpiResultModal.tsx`
- `apps/lab-lite/src/app/[locale]/patients/register/page.tsx`
- `apps/lab-lite/src/components/ui/Tooltip.tsx`
- `apps/lab-lite/src/lib/format.ts`

### Files Modified
- `apps/lab-lite/src/app/[locale]/page.tsx` — dashboard redesign
- `apps/lab-lite/src/app/[locale]/upload/page.tsx` — i18n, search/recent patients, keyboard shortcuts
- `apps/lab-lite/src/app/[locale]/offline/page.tsx` — i18n
- `apps/lab-lite/src/app/[locale]/login/page.tsx` — unified input styling
- `apps/lab-lite/src/components/upload/StepIndicator.tsx` — i18n
- `apps/lab-lite/src/components/MetadataForm.tsx` — i18n, tooltips, date validation
- `apps/lab-lite/src/components/upload/ReviewStep.tsx` — i18n, shared formatFileSize
- `apps/lab-lite/src/components/ResultUpload.tsx` — shared formatFileSize
- `apps/lab-lite/src/components/dashboard/QueueStatusCard.tsx` — attention states
- `apps/lab-lite/src/components/dashboard/ActivitySummaryCard.tsx` — lastRefreshedAt
- `apps/lab-lite/src/components/dashboard/QuickActions.tsx` — card wrapper removed
- `apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx` — cancel action, patient names
- `apps/lab-lite/src/components/settings/LabSettingsView.tsx` — removed placeholder cards

# Addendum 14: Patient Profile UX — Data Fetch Fixes, National ID & Form Consistency (Epic 40)

**Date:** 2026-05-25
**Branch:** `ux-v1.0`
**Specs:** `docs/superpowers/specs/2026-05-25-national-id-field-nid-badge-design.md`, `docs/superpowers/specs/2026-05-25-patient-workflows-shared-package-design.md`
**Plans:** `docs/superpowers/plans/2026-05-25-national-id-field-nid-badge.md`

**Trigger:** Patient demographics (especially address data) were being saved to the database but not fetched by the patient profile page or Edit Profile modal. Root cause investigation revealed 6 compounding bugs, plus a need for National ID capture and form consistency across registration and edit flows.

## Epic 40: Patient Profile UX Hardening

Fix patient data fetch pipeline, add National ID# field with "NID Missing" badges, and align registration and edit forms to a consistent field order.

### Story 40.1: Fix Patient Data Fetch Pipeline
As a clinician viewing a patient profile, I want to see complete patient data (including address, phone, blood group) so that I have the full picture.

**Acceptance Criteria:**
- `fetchPatientFromHub` calls `patient.read` (not the non-existent `patient.getById`)
- Profile page always fetches full record from Hub even if Dexie has partial data
- `normalizeFhirPatient` handles flat address keys from `_ultranos` (from list/search responses)
- `patient.list` and `patient.search` SELECT all address, phone, blood group, nomadic, preferred language columns
- Response mapping builds nested `addressOrigin`/`addressCurrent` objects in FHIR shape

> **Status:** Done

### Story 40.2: Fix PatientEditModal Payload Alignment
As a clinician editing a patient profile, I want address and phone updates to actually persist so that my edits are not silently lost.

**Acceptance Criteria:**
- Edit modal sends flat field names (`addressProvinceOrigin`, `telecomPhone`) matching `patient.update` Zod schema
- After successful save, modal uses optimistic `buildUpdatedPatient()` with server timestamp instead of minimal server response
- Dexie cache updated with full patient object after save

> **Status:** Done

### Story 40.3: National ID# Field in Registration
As a clinician registering a patient, I want to capture their National ID number so that the system can use it for MPI deduplication and identity verification.

**Acceptance Criteria:**
- National ID# text input added as first field in Demographics section (before Gender)
- Optional, max 200 chars, wired into `patient.checkDuplicates` for MPI dedup
- Passed to `patient.create` — backend hashes via HMAC blind index
- Saved to local Dexie cache on creation

> **Status:** Done

### Story 40.4: National ID# Field in Edit Modal
As a clinician editing a patient profile, I want to add a National ID when the patient obtains one.

**Acceptance Criteria:**
- National ID# field appears first in Demographics section
- When NID already exists: shows masked read-only display ("National ID ••••••")
- When NID is empty: editable text input
- On save, passed to `patient.update` which re-hashes and checks for duplicates

> **Status:** Done

### Story 40.5: "NID Missing" Badge
As a clinician, I want to see at a glance which patients are missing a National ID so I can prompt them to bring it on their next visit.

**Acceptance Criteria:**
- Amber `NidMissingBanner` on patient profile page (in `PatientBannerStack`, priority #4 after MPI warn)
- Amber pill badge ("NID Missing") in patient directory name column
- Both render when `nationalIdHash` is falsy
- i18n keys for en, ar, prs

> **Status:** Done

### Story 40.6: Registration Form Consistency
As a clinician, I want the same fields available in both registration and edit forms so I don't have to immediately edit a profile I just created.

**Acceptance Criteria:**
- Registration form gains: Preferred Language, Blood Group, Nomadic toggle
- Nomadic toggle relocated into `GeographySection` (shared between both forms)
- Field order consistent: Name > Demographics (NID, Gender, Birth, Phone, Language) > Geography (Origin, Current, Nomadic) > Clinical (Blood Group) > Consent
- `GeographySection` accepts optional `isNomadic`/`onIsNomadicChange` props

> **Status:** Done

### Story 40.7: Shared Patient Workflows Package Design
As a platform architect, I want a design for sharing patient workflows across all spoke apps so that changes propagate automatically.

**Acceptance Criteria:**
- Design spec written for `packages/patient-workflows/` with adapter pattern
- Adapter interface defined (checkDuplicates, createPatient, updatePatient, saveLocally, getAuthHeaders)
- React context provider pattern documented
- i18n export strategy documented
- OPD-Lite migration plan documented
- Design spec committed

> **Status:** Done (design spec only — implementation is Sub-project A)

# Addendum 15: Audit Trail & Last Updated Display (Epic 41)

**Date:** 2026-05-25
**Branch:** `ux-v1.0`
**Spec:** `docs/superpowers/specs/2026-05-25-audit-trail-last-updated-design.md`
**Plan:** `docs/superpowers/plans/2026-05-25-audit-trail-last-updated.md`

**Trigger:** With multiple organizations/individuals registering and editing patient details, clinicians need visibility into who changed what and when. Audit data already existed in `audit_log` table — this feature surfaces it in the UI.

## Epic 41: Audit Trail & Last Updated Display

Surface audit trail data on the patient profile (role-tiered collapsible) and add "Last updated by" display to the patient header card and directory.

### Story 41.1: Database — updated_by Column
As a system, I need to track which practitioner last modified each patient record.

**Acceptance Criteria:**
- `updated_by UUID` column added to `patients` table (nullable for existing rows)
- `patient.update` mutation writes `ctx.user.sub` to `updated_by`

> **Status:** Done

### Story 41.2: Resolve Updater Identity in patient.read
As a clinician viewing a patient profile, I want to see who last updated the record.

**Acceptance Criteria:**
- `patient.read` joins `practitioners` table to resolve `updated_by` UUID to display name + role
- Returns `_ultranos.updatedByName` ("Dr. Fatima") and `_ultranos.updatedByRole` ("DOCTOR")
- Falls back gracefully when `updated_by` is null (legacy records)
- `FhirPatient._ultranos` type extended with `updatedByName` and `updatedByRole`
- `normalizeFhirPatient` handles the new fields

> **Status:** Done

### Story 41.3: patient.auditTrail Endpoint
As a clinician or admin, I want to fetch audit entries for a specific patient.

**Acceptance Criteria:**
- New `patient.auditTrail` tRPC query with `patientId`, `limit`, `cursor` inputs
- Role-based limit: clinical staff capped at 10 entries, admins get full pagination (up to 50)
- Batch-resolves actor UUIDs to practitioner display names
- Returns `entries[]` with action, actorName, actorRole, fieldsUpdated (names only, never values), operation, timestamp
- Cursor-based pagination with `nextCursor` and `hasMore`
- Self-audits the read (CLAUDE.md Rule #6)

> **Status:** Done

### Story 41.4: "Last Updated By" on PatientHeaderCard
As a clinician, I want to see who last modified this patient record directly on the profile header.

**Acceptance Criteria:**
- "Last updated by Dr. Fatima (DOCTOR), 2h ago" line below vitals in PatientHeaderCard
- Falls back to "Last updated 2h ago" when updater name unavailable
- Uses `formatRelativeTime` from `@ultranos/ui-kit` for locale-aware timestamps

> **Status:** Done

### Story 41.5: "Last Updated" Column in PatientDirectory
As a clinician browsing the patient directory, I want to see when each patient was last modified.

**Acceptance Criteria:**
- New sortable "Last Updated" column after Status in patient directory table
- Shows relative time ("2h ago", "3 days ago") using locale-aware formatting
- `SortField` type extended with `'lastUpdated'`

> **Status:** Done

### Story 41.6: PatientAuditTrail Collapsible Component
As a clinician, I want to review recent changes to a patient record in a collapsible audit trail section.

**Acceptance Criteria:**
- Collapsible component matching `PatientDetailsAccordion` visual pattern
- Lazy-loads audit entries on expand (not on page load)
- Clinical staff: up to 10 entries, no "Load more"
- Admin: 10 initial entries, "Load more" button loads next 50 via cursor pagination
- Each entry shows: actor name (role), action description, humanized field names, relative timestamp
- Field names mapped to human-readable labels (e.g. `nameGiven` -> "given name")
- Never shows field values (CLAUDE.md Rule #1 — PHI safety)
- Timeline-style layout with left border
- Placed after PatientDetailsAccordion, before ActiveMedicationsList on profile page

> **Status:** Done

### Story 41.7: i18n for Audit Trail
As a user in any supported locale, I want audit trail UI text in my language.

**Acceptance Criteria:**
- 11 new keys added to en.json, ar.json, prs.json (lastUpdatedBy, lastUpdated, auditTrail, auditTrailCount, auditCreated, auditUpdated, auditViewed, auditLoadMore, auditLoading, auditEmpty, lastUpdatedCol)

> **Status:** Done
- `apps/lab-lite/src/components/AppSidebar.tsx` — register patient nav item
- `apps/lab-lite/src/hooks/useDashboardData.ts` — lastRefreshedAt, patientFirstName, localQueueId
- `apps/lab-lite/src/lib/db.ts` — Dexie v3 (patients + syncQueue)
- `apps/lab-lite/src/lib/trpc.ts` — searchPatients, checkDuplicates, createPatient
- `apps/lab-lite/messages/en.json` — 40+ new translation keys

---

# Addendum 14: Pharmacy Inventory & POS System (Epic 40)

**Date:** 2026-05-25
**Branch:** `ux-v1.0`
**Commits:** 29 commits across 4 sub-projects
**Design Spec:** `docs/superpowers/specs/2026-05-25-pharmacy-inventory-pos-design.md`
**Plans:** `docs/superpowers/plans/2026-05-25-pharmacy-inventory-subproject-{a,b,c,d}.md`

**Trigger:** Audit identified that pharmacy-lite had zero inventory management — no stock tracking, no product catalog, no POS, no supplier management. Independent pharmacies cannot operate without these capabilities.

## Epic 40: Pharmacy Inventory & Point of Sale

Enterprise-grade pharmacy operations platform with inventory management, procurement, inter-pharmacy transfers, point-of-sale (cash/card/credit), and operational reporting. Progressive complexity via settings toggles.

### Sub-project A: Catalog + Stock Core (15 stories, all Done)

| Story | Description | Status |
|-------|-------------|--------|
| 40-A1 | Inventory type definitions | Done |
| 40-A2 | Dexie v6 — inventory tables | Done |
| 40-A3 | Inventory Zustand store | Done |
| 40-A4 | Catalog sync from Hub API | Done |
| 40-A5 | Stock service — FEFO, deduct, add, alerts | Done |
| 40-A6 | Expiry watchdog + stock alerts hook | Done |
| 40-A7 | Goods receipt service | Done |
| 40-A8 | Receive Stock page (catalog search + form) | Done |
| 40-A9 | Stock table component | Done |
| 40-A10 | Stock Overview page + alert panel | Done |
| 40-A11 | Catalog Browse page | Done |
| 40-A12 | Dispensing FEFO integration + stock deduction | Done |
| 40-A13 | Dashboard inventory alert widget | Done |
| 40-A14 | Inventory sidebar nav items + i18n | Done |
| 40-A15 | Catalog sync + expiry watchdog hook wiring | Done |

### Sub-project B: POS + Financial (13 stories, all Done)

| Story | Description | Status |
|-------|-------------|--------|
| 40-B1 | POS type definitions | Done |
| 40-B2 | Dexie v7 — POS tables | Done |
| 40-B3 | POS Zustand store | Done |
| 40-B4 | Invoice service (create, status, void, revenue) | Done |
| 40-B5 | Payment service (cash/card/credit, ledger) | Done |
| 40-B6 | Cash drawer service (open/close/reconcile) | Done |
| 40-B7 | Patient account service (ledger, aging) | Done |
| 40-B8 | POS page — invoice summary + payment form | Done |
| 40-B9 | Cash Drawer page | Done |
| 40-B10 | Patient Accounts page (credit ledgers) | Done |
| 40-B11 | Dispensing → invoice auto-creation | Done |
| 40-B12 | Dashboard drawer widget + POS sidebar nav | Done |
| 40-B13 | "Collect Payment" CTA after dispensing | Done |

### Sub-project C: Procurement + Counts (11 stories, all Done)

| Story | Description | Status |
|-------|-------------|--------|
| 40-C1 | Procurement type definitions | Done |
| 40-C2 | Dexie v9 — procurement tables | Done |
| 40-C3 | Supplier service (CRUD + sync) | Done |
| 40-C4 | Purchase order service (lifecycle) | Done |
| 40-C5 | Stock count service (adjust + controlled flag) | Done |
| 40-C6 | Supplier form component | Done |
| 40-C7 | Suppliers page | Done |
| 40-C8 | Stock count form (scan, enter actuals, variances) | Done |
| 40-C9 | Stock Count page | Done |
| 40-C10 | Controlled substances running balance upgrade | Done |
| 40-C11 | Procurement sidebar nav + i18n | Done |

### Sub-project D: Network + Reports (10 stories, all Done)

| Story | Description | Status |
|-------|-------------|--------|
| 40-D1 | Transfer type definitions | Done |
| 40-D2 | Dexie v10 — stockTransfers table | Done |
| 40-D3 | Transfer service (request/approve/ship/receive) | Done |
| 40-D4 | Network stock query (Hub API) | Done |
| 40-D5 | Consumption + wastage report services | Done |
| 40-D6 | Financial + controlled discrepancy reports | Done |
| 40-D7 | Transfers page (card + lifecycle actions) | Done |
| 40-D8 | Report cards (4 components) | Done |
| 40-D9 | Reports page | Done |
| 40-D10 | Transfers + Reports sidebar nav + i18n | Done |

### Architecture Decisions

- **Stock deduction:** Immediate local on dispense (offline-first)
- **Conflict resolution:** StockMovements = Tier 1 (append-only), quantities = Tier 2 (timestamp merge)
- **Catalog:** Hub-managed, locally cached
- **FEFO:** Enforced (nearest-expiry batch selected first)
- **Expiry:** Auto-quarantine (expired stock cannot be dispensed)
- **Payments:** Cash + card + patient credit/tab
- **Money:** Integer minor units (no floating point)
- **Transfers:** Full lifecycle via Hub (both pharmacies create StockMovements)
- **Progressive complexity:** Settings toggles for PO mode, zones, credit, transfers

### Dexie Schema Evolution

| Version | Tables Added |
|---------|-------------|
| v6 | catalogItems, stockBatches, stockMovements, goodsReceipts, pharmacySettings |
| v7 | invoices, payments, ledgerEntries, patientAccounts, cashDrawers |
| v8 | catalogItems index fix (lastSyncedAt) |
| v9 | suppliers, purchaseOrders, stockCounts |
| v10 | stockTransfers |

### New Pages (10)

| Route | Purpose |
|-------|---------|
| /inventory | Stock Overview (table + filters + alerts) |
| /inventory/receive | Receive Stock (barcode scan + form) |
| /inventory/catalog | Catalog Browse (Hub formulary) |
| /inventory/suppliers | Supplier Management (CRUD) |
| /inventory/transfers | Inter-Pharmacy Transfers |
| /inventory/count | Stock Count (full/spot/controlled) |
| /pos | Payment Collection |
| /pos/cash-drawer | Cash Drawer Sessions |
| /pos/accounts | Patient Credit Ledgers |
| /reports | Reports Dashboard |
| /register-patient | Patient Registration (shared OPD-Lite form) |

---

# Addendum 15: Pharmacy-Lite UX Consistency (2026-05-26)

**Date:** 2026-05-26
**Branch:** `ux-v1.0`
**Commits:** `1c84553` through `5481241`

**Trigger:** Sidebar wasn't visible (missing layout composition), dashboard cards weren't aligned with OPD-Lite patterns, and pharmacy-lite used a simplified patient registration form instead of the full OPD-Lite form with MPI, geography, and consent.

## Fixes Applied

### Fix 1: Root Layout — Remove Legacy Header + max-w-2xl
The pre-sidebar root layout (`app/layout.tsx`) had a `<header>` bar and `<main className="mx-auto max-w-2xl">` wrapping the entire app — including the sidebar. Everything was squeezed into 672px. Removed to match OPD-Lite pattern: `<body> → <ClientErrorBoundary> → {children}`.

> **Status:** Done — Commit `1c84553`

### Fix 2: Sidebar Layout — Match OPD-Lite
`AppShellWrapper` content area changed from `mx-auto max-w-2xl/5xl` to `px-4 py-6 sm:px-6 lg:px-8`. Sidebar sticks left, content fills remaining space. Removed `wideRoutes` logic.

> **Status:** Done — Commit `bdbbe55`

### Fix 3: Dashboard Card Grid Placement
Dashboard container updated to `mx-auto max-w-3xl px-4 py-8` with `mb-8` section spacing. Summary cards placed in `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`. Card component styling preserved (no text/font changes).

> **Status:** Done — Commit `2f7db16`

### Fix 4: Shared Patient Registration Form
Copied 10 OPD-Lite components into pharmacy-lite to replace the simplified 5-field registration form:
- `Card.tsx` — shared card wrapper
- `registration/` — PatientRegistrationForm, NameInputSection, GeographySection, ConsentSection, ConsentTextModal, MpiResultModal
- `shared/` — ProvinceAutocomplete, DistrictAutocomplete
- `patient/PatientEditModal.tsx`

All `@/` imports resolve correctly (both apps use same alias convention). Dependencies (`auditPhiAccess`, `EncryptionKeyNotAvailableError`, Supabase client, Dexie db) all exist in pharmacy-lite.

> **Status:** Done — Commit `720a09d`

### Fix 5: Register Patient Route + DashboardActionHub Wiring
Created `/register-patient` route (same as OPD-Lite). DashboardActionHub updated: Walk-in button now links to `/register-patient` instead of rendering the old inline form. Search "Register new" also navigates to the route with `?nameGiven=` prefill.

> **Status:** Done — Commit `f781d78`

### Fix 6: Registration i18n Namespace
Copied the full `registration` namespace (116 keys including nested `consentDocument` with consent text in en/ar/prs) from OPD-Lite's message files into all 3 pharmacy-lite locale files.

> **Status:** Done — Commit `5481241`

---

# Addendum 16: Lab-Lite Enterprise Transformation (2026-05-30)

**Source:** Brainstorming session — 108 features across 11 domains, scored and prioritized into 4 tiers.
**Input documents:** `_bmad-output/brainstorming/brainstorming-session-2026-05-30-001.md`, `docs/superpowers/plans/2026-05-23-lab-lite-enterprise-ux.md` (for deduplication)

### New Functional Requirements (Lab-Lite Enterprise Transformation)

FR42: Lab Operations Core — Electronic test order reception (FHIR ServiceRequest), sample accessioning, chain of custody, structured result templates, result authorization workflow, write-once distribute-many, smart sample prioritization, digital lab logbook
FR43: Quality Assurance & Legal Shield — Immutable result audit chain, QC-result temporal binding, amendment & correction protocol, patient ID verification log, plausibility checker, drift detection, aviation-style checklists, localized reference ranges
FR44: Lab Financial Operations — Payment collection & receipt system, cost-per-test calculator, reagent waste & expiry tracking
FR45: Patient Safety & Inclusive Access — Audio + thumbprint consent, patient queue token system, family delegate result access, plain-language audio results, one-trip optimization, cultural sensitivity flags, family account & payment delegation
FR46: SOPs Training & Professional Development — SOP library with acknowledgment, micro-learning modules, competency self-assessment, peer network "Ask a Tech", mentorship pairing, certification pathway tracker, personal quality streaks
FR47: Bio-Safety & Occupational Health — Post-exposure emergency protocol, sharps & waste tracking, employee health & vaccination registry, temperature monitoring, spill protocol, anonymous safety reporting, infection control audit
FR48: Intelligent Decision Support — Power-aware workload scheduler, predictive reagent burndown, pre-shift readiness forecast, critical value escalation chain
FR49: Offline Resilience & Communication — Data budget mode, SMS critical result fallback, Bluetooth P2P sync, conflict zone security protocols, offline AI audit cache
FR50: Reporting & Surveillance Automation — Auto-compiled HMIS monthly report, multi-donor report templates, disease surveillance alerts, daily activity log (WhatsApp-shareable)
FR51: Multi-Tech Lab Management — Shift handover protocol, workload balancing dashboard, technician performance metrics, sample collision prevention, equipment booking, RAG readiness board, dynamic sample dispatch, gamified team engagement
FR52: Cross-App Integration & Pharmacy Awareness — Pharmacy-Lite prescription awareness, shared inventory visibility, Hub-managed reagent ordering, cross-app patient timeline, distributed inventory hub
FR53: AI-Assisted Clinical Support — Contextual knowledge cards, visual atlas for microscopy, anomaly flagging, tele-consultation request builder, AI microscopy assist, confidence inversion principle, AI provenance trail, patient-facing public health guidance
FR54: Lab Network & Outbreak Response — WhatsApp integration layer, multi-branch lab network management, courier & sample transport tracking, external reference lab integration, solar power integration, outbreak response mode, mass casualty triage protocol, CHW collection module, seasonal operations planner

### FR Coverage Map (Addendum 16)

FR42: Epic 42 — Lab Operations Core
FR43: Epic 43 — Quality Assurance & Legal Shield
FR44: Epic 44 — Lab Financial Operations
FR45: Epic 45 — Patient Safety & Inclusive Access
FR46: Epic 46 — SOPs, Training & Professional Development
FR47: Epic 47 — Bio-Safety & Occupational Health
FR48: Epic 48 — Intelligent Decision Support
FR49: Epic 49 — Offline Resilience & Communication
FR50: Epic 50 — Reporting & Surveillance Automation
FR51: Epic 51 — Multi-Tech Lab Management
FR52: Epic 52 — Cross-App Integration & Pharmacy Awareness
FR53: Epic 53 — AI-Assisted Clinical Support
FR54: Epic 54 — Lab Network & Outbreak Response

## Epic 42: Lab Operations Core — Orders, Samples & Results

Lab techs receive electronic test orders from OPD-Lite, track samples through their lifecycle, enter structured results via templates, authorize results through a multi-tier workflow, and deliver them back to ordering physicians — replacing paper requisitions, manual logbooks, and verbal handoffs.
**FRs covered:** FR42 (brainstorm #2, #7, #21, #22, #23, #41, #42, #65, #100)
**Tier:** 1 (Foundation)

### Story 42.1: Role-Based Access Control for Lab Staff

As a lab manager,
I want to assign role-based permissions (Tech, Senior Tech, Supervisor, Lab Manager) to lab staff,
So that junior techs cannot release results without authorization and sensitive operations are restricted to qualified personnel.

**Acceptance Criteria:**

**Given** the Lab-Lite auth system with a single LAB_TECH role
**When** a lab manager accesses user management in settings
**Then** they can assign one of four roles: LAB_TECH, SENIOR_TECH, SUPERVISOR, LAB_MANAGER
**And** each role has a defined permission set (LAB_TECH: enter results; SENIOR_TECH: enter + release routine results; SUPERVISOR: enter + release all + override QC lockout; LAB_MANAGER: all permissions + user management)
**And** the role is stored in the auth session and enforced on every protected action
**And** role changes are audit-logged with the modifier's identity and timestamp

**Admin Portal Surface:** Role assignment and user management (creating lab staff accounts, assigning LAB_TECH/SENIOR_TECH/SUPERVISOR/LAB_MANAGER roles) is performed in the Admin Portal. Lab-Lite displays the authenticated user's role, enforces the permission set locally, and shows a read-only role indicator in settings -- but does not provide UI for assigning or changing roles.

### Story 42.2: Electronic Test Order Reception from OPD-Lite

As a lab technician,
I want to receive electronic test orders from OPD-Lite as structured FHIR ServiceRequests,
So that I no longer rely on paper requisitions with illegible handwriting.

**Acceptance Criteria:**

**Given** a physician in OPD-Lite creates a test order for a patient
**When** the order syncs to the Hub and Lab-Lite pulls pending orders
**Then** a new order appears in the lab worklist with: patient reference (first name + age only), tests requested (LOINC codes), clinical urgency flag, ordering physician, and special instructions
**And** the order status is set to RECEIVED and a timestamp is recorded
**And** the ordering physician sees the status change in OPD-Lite
**And** orders are persisted in Dexie for offline access
**And** data minimization is enforced — no diagnosis, medication, or clinical history is transmitted to Lab-Lite

### Story 42.3: Sample Accessioning & Chain of Custody

As a lab technician,
I want to accession incoming samples with a unique ID and log every handoff,
So that every sample has a documented chain of custody from collection to result.

**Acceptance Criteria:**

**Given** an electronic order has been received
**When** the tech taps "Receive Sample" on the order
**Then** a unique sample ID is generated (format: LAB-YYYYMMDD-NNNN, configurable per lab)
**And** the system logs: who received the sample, from whom, timestamp, sample type (blood/urine/swab/other), and condition at receipt (acceptable/hemolyzed/clotted/insufficient/mislabeled)
**And** if condition is not acceptable, the tech selects a rejection reason and the ordering physician is notified with a re-collection request
**And** the sample status pipeline begins: Received → In Processing → Completed → Reported
**And** every subsequent handoff is logged with identity and timestamp
**And** the chain of custody is viewable as a timeline on the sample detail screen

### Story 42.4: Lab Result Templates & Structured Data Entry

As a lab technician,
I want to enter results into structured templates specific to each test type,
So that results are standardized, auto-calculated fields reduce errors, and abnormal values are automatically flagged.

**Acceptance Criteria:**

**Given** a sample is in In Processing status
**When** the tech opens the result entry form
**Then** a template matching the test type is loaded with: field names, data types (numeric/text/select), units of measure, decimal precision, and reference ranges (age/gender-specific)
**And** results outside reference ranges are auto-flagged: Low (L), High (H), Critical Low (LL), Critical High (HH)
**And** auto-calculated fields compute in real-time as values are entered
**And** templates are bundled offline and versioned — old results reference the template version they were entered against
**And** the system ships with templates for the 8 existing LOINC categories plus a generic template for unlisted tests
**And** a comment field is available for per-field and per-report annotations

### Story 42.5: Result Authorization Workflow

As a lab supervisor,
I want to review and authorize results before they are released to the ordering physician,
So that no result reaches a clinician without appropriate quality verification.

**Acceptance Criteria:**

**Given** a tech has entered and saved a result
**When** the result requires authorization (based on role permissions from Story 42.1)
**Then** the result appears in the supervisor's Pending Authorization queue
**And** the supervisor can approve (release), reject (return to tech with comments), or hold (flag for discussion)
**And** auto-verification rules allow automatic release for results that are: within normal reference ranges AND QC was passing AND the entering tech has SENIOR_TECH or higher role
**And** critical values ALWAYS require supervisor authorization regardless of auto-verify rules
**And** released results flow to the ordering physician via the existing notification system
**And** the authorization action is audit-logged

### Story 42.6: Write-Once, Distribute-Many Result Delivery

As a lab technician,
I want to enter a result once and have it automatically distributed to all relevant systems,
So that I eliminate triple-copy transcription to doctor, patient record, logbook, and monthly statistics.

**Acceptance Criteria:**

**Given** a result has been authorized and released
**When** the system processes the release
**Then** the result is simultaneously: (a) delivered as a FHIR DiagnosticReport to OPD-Lite embedded in the patient encounter timeline, (b) made available in Patient-Lite for the patient health passport view, (c) appended to the digital lab logbook, (d) counted in monthly statistics aggregation
**And** each destination receives only the data its minimization rules allow
**And** the distribution is queued for offline delivery if any destination is unreachable

### Story 42.7: Smart Sample Prioritization Queue

As a lab technician,
I want the worklist to automatically prioritize samples by urgency, stability, and efficiency,
So that I process the most critical samples first and batch similar tests for instrument efficiency.

**Acceptance Criteria:**

**Given** multiple orders exist in the worklist
**When** the tech views the worklist
**Then** samples are auto-sorted by: (1) clinical urgency flag (STAT > Urgent > Routine), (2) sample stability window, (3) test type batching to minimize reagent swaps, (4) time in queue
**And** the tech can manually override the suggested order by drag-reordering
**And** samples approaching their stability window show a warning badge with countdown
**And** the prioritization algorithm runs locally (Dexie) and works fully offline

### Story 42.8: Digital Lab Logbook

As a lab manager,
I want an auto-populated digital logbook that replaces the legally required paper register,
So that the logbook is always current, searchable, backed up, and ready for inspection.

**Acceptance Criteria:**

**Given** a result has been authorized and released
**When** the system appends it to the digital logbook
**Then** the logbook entry contains the same columns the Afghan MoPH paper register requires: sequential number, date, patient reference, test type, result summary, technician ID, authorization status
**And** the logbook is searchable by date range, test type, patient reference, and technician
**And** it can be exported as a printable PDF matching the MoPH register format
**And** the logbook is stored in Dexie (offline-first) with sync to Hub
**And** logbook entries are append-only and cannot be edited or deleted

## Epic 43: Quality Assurance & Legal Shield

Lab results are protected by an immutable audit chain with QC records temporally bound to results, amendments preserve full history with mandatory reason codes, and every result can be defended with cryptographic evidence — transforming Lab-Lite into Khalid's legal defense system.
**FRs covered:** FR43 (brainstorm #61, #62, #63, #67, #9, #10, #48, #99)
**Tier:** 1-2 (Foundation + Operational)

### Story 43.1: Immutable Result Audit Chain

As a lab manager,
I want every result to have a complete, tamper-proof audit chain from sample receipt to report delivery,
So that I can defend any result with cryptographic evidence when questioned.

**Acceptance Criteria:**

**Given** a sample enters the lab workflow
**When** any action occurs (receive, process, enter result, authorize, release, amend)
**Then** a structured audit event is emitted with: action type, actor identity, timestamp (HLC), resource references, and a SHA-256 hash linking to the previous event in the chain
**And** the audit chain covers the full lifecycle: collection → accessioning → processing → result entry → authorization → release → delivery → amendment (if any)
**And** audit events are append-only and cannot be modified or deleted
**And** the audit chain is stored locally in Dexie and synced to Hub
**And** a chain verification function can detect any tampering by re-computing hashes

### Story 43.2: QC-Result Temporal Binding

As a lab supervisor,
I want every patient result to be stamped with the QC status that was active at the time of processing,
So that I can prove QC was passing when any specific result was produced.

**Acceptance Criteria:**

**Given** a tech enters a patient result
**When** the result is saved
**Then** the system records the most recent QC run for the relevant analyte/instrument: QC run ID, timestamp, result (pass/fail), control values, and whether it was within acceptable range
**And** this QC snapshot is immutably linked to the patient result
**And** if no QC has been run today for that analyte, the system shows a warning: "No QC recorded for [analyte] today — run QC before releasing patient results"
**And** if QC was failing, the result is flagged: "QC advisory — verify result"
**And** the temporal QC linkage is visible in the result detail view and audit trail

### Story 43.3: Amendment & Correction Protocol

As a lab technician,
I want to correct a released result with full traceability and mandatory notification,
So that errors are fixed transparently while preserving the complete history for legal and clinical purposes.

**Acceptance Criteria:**

**Given** a released result needs correction
**When** a tech initiates an amendment
**Then** the original result is preserved and marked as superseded (never deleted or overwritten)
**And** the amendment requires: mandatory reason code (clerical error, instrument malfunction, wrong patient, QC failure discovered post-release), free-text explanation, and supervisor authorization
**And** the ordering physician is automatically notified of the correction with both original and amended values
**And** if the patient has already viewed the result in Patient-Lite, a patient notification is also generated
**And** the digital logbook receives a new entry referencing the original with amendment details
**And** the full amendment chain is visible in the audit trail

### Story 43.4: Patient ID Verification Logging

As a lab technician,
I want the system to log HOW patient identity was verified at sample collection,
So that there is a documented, auditable answer to "Did you verify this was the right patient?"

**Acceptance Criteria:**

**Given** a tech is about to collect a sample
**When** the tech verifies the patient's identity
**Then** the system logs the verification method(s) used: National ID card (scanned), verbal confirmation of name + father's name, QR code from Health Passport, or other
**And** a minimum of two identifiers is required before sample collection can proceed
**And** if only one identifier is used, the system logs "Verification: INCOMPLETE — single identifier only" as a visible deviation record
**And** the verification log is part of the sample's chain of custody and audit trail

### Story 43.5: Result Plausibility Checker

As a lab technician working alone,
I want the system to automatically check results for plausibility,
So that I have a "second opinion" that catches data entry errors and implausible analyzer outputs.

**Acceptance Criteria:**

**Given** a result has been entered
**When** the tech saves the result
**Then** the system runs automatic checks: (a) absolute range check — flags physiologically impossible values (e.g., WBC > 500,000), (b) delta check — compares to patient's last result for the same test if available and flags significant changes (configurable per analyte), (c) internal consistency — flags combinations that are clinically inconsistent (e.g., very low RBC with normal hemoglobin)
**And** flagged results show a warning with the reason: "Result flagged: [reason]. Please verify before releasing."
**And** the tech can acknowledge the flag with an explanation (e.g., "confirmed — patient has known CML") or re-enter the result
**And** flag acknowledgments are logged in the audit trail

### Story 43.6: Analyzer Drift Detection & Recalibration Alerts

As a lab supervisor,
I want the system to detect when analyzer QC values are trending outside acceptable limits,
So that we catch calibration drift before it affects patient results.

**Acceptance Criteria:**

**Given** QC results are being entered over multiple days
**When** the system detects a trend: (a) 5+ consecutive QC values trending in the same direction, (b) 2 consecutive values exceeding 2 standard deviations from the mean, (c) any single value exceeding 3 standard deviations
**Then** an alert is displayed: "[Analyte] QC trending [high/low] for [N] consecutive runs. Recommend recalibration before processing patient samples."
**And** if the alert is ignored, all subsequent patient results for that analyte are flagged: "QC advisory — produced during drift warning"
**And** drift alerts are logged and visible in the QC history view

### Story 43.7: Pre-Release Critical Value Checklist

As a lab supervisor,
I want a mandatory checklist before releasing critical values,
So that critical results are verified through a structured process before reaching the clinician.

**Acceptance Criteria:**

**Given** a result contains one or more critical values (e.g., Potassium > 6.5, Glucose < 40, Hgb < 5)
**When** the supervisor attempts to release the result
**Then** a mandatory checklist is displayed: "☐ QC passed today for this analyte ☐ Patient ID verified ☐ Result reviewed for plausibility ☐ Delta check reviewed (if prior result exists) ☐ Repeat testing performed (if required by lab policy)"
**And** the supervisor must check each item before the Release button is enabled
**And** the completed checklist is stored as part of the result's audit trail
**And** the checklist items are configurable per lab

### Story 43.8: Localized Reference Ranges

As a lab manager,
I want to configure reference ranges specific to our patient population,
So that results are not inappropriately flagged based on Western reference values.

**Acceptance Criteria:**

**Given** the lab is at altitude >2000m or serves a population with known physiological differences
**When** the lab manager accesses reference range settings
**Then** they can override default reference ranges per analyte with: age-specific ranges, gender-specific ranges, altitude-adjusted ranges, and population-specific ranges
**And** overridden ranges are used for all auto-flagging (normal/abnormal/critical)
**And** the reference range source (default vs. custom) is visible on result reports
**And** range changes are versioned and audit-logged
**And** historical results retain the reference ranges that were active when they were produced

**Admin Portal Surface:** Reference range configuration is an operational lab function that stays in Lab-Lite. The Admin Portal provides a default reference range template library (e.g., altitude-adjusted, population-specific baselines) that labs can pull from and customize locally. Lab managers override ranges within Lab-Lite for their facility.

## Epic 44: Lab Financial Operations

Labs can collect payments, generate receipts, calculate true cost-per-test, and track reagent waste — transforming the lab from a cost center with no visibility into a managed business unit that can prove its financial viability.
**FRs covered:** FR44 (brainstorm #79, #82, #84)
**Tier:** 1 (Foundation)

### Story 44.1: Payment Collection & Receipt System

As a lab cashier or technician,
I want to record patient payments, generate receipts, and reconcile daily cash,
So that lab revenue is tracked, patients have payment proof, and cash handling is transparent.

**Acceptance Criteria:**

**Given** a patient has tests to pay for
**When** the tech records a payment
**Then** the system captures: patient reference, tests paid for, amount, payment method (cash/card/insurance/waiver), and timestamp
**And** a receipt is generated that can be printed (thermal printer compatible) or sent via SMS to the patient or delegate
**And** partial payments are supported with outstanding balance tracking
**And** end-of-day cash reconciliation shows: expected total, collected total, outstanding, variance
**And** payment records are stored in Dexie (offline-first) with sync to Hub
**And** all payment transactions are audit-logged

### Story 44.2: Cost-Per-Test Calculator

As a lab manager,
I want to know the true cost of each test type,
So that I can identify which tests are profitable, which are subsidized, and make informed pricing decisions.

**Acceptance Criteria:**

**Given** the lab has inventory data (reagent costs, consumable costs) and operational data (tests performed, staff costs)
**When** the lab manager opens the cost analysis view
**Then** the system calculates per test type: reagent cost per test (from auto-deduction data if available, or manual entry), consumable cost (tubes, slides, tips), labor cost allocation (staff salary / tests per shift), and overhead allocation
**And** compares cost-per-test to the current price charged
**And** displays margin per test: positive (profitable) or negative (subsidized)
**And** highlights tests with negative margins with recommendations
**And** data can be exported for reporting to hospital administration

### Story 44.3: Reagent Waste & Expiry Loss Tracking

As a lab manager,
I want to track how much reagent is consumed versus how much expires unused,
So that I can identify and reduce waste — the silent budget killer.

**Acceptance Criteria:**

**Given** reagent inventory is being tracked (manual entry initially, auto-deduction in future epic)
**When** a reagent is opened, the system records: open date, lot number, expiry date, and expected tests per unit
**And** when a reagent is used up or expires, the system records: actual tests performed, remaining quantity at disposal, and waste reason (expired/contaminated/depleted)
**Then** the waste dashboard shows: consumption efficiency per reagent (tests performed / tests expected), waste rate (% of reagent expired before depletion), financial loss from waste per period
**And** the system alerts when a reagent is projected to expire before depletion: "Chemistry strips opened [date] — at current usage rate, [X] tests will remain at expiry. Consider batching chemistry tests on fewer days."

## Epic 45: Patient Safety & Inclusive Access

Patients — including illiterate, elderly, and culturally conservative patients — can give legally valid consent via audio and thumbprint, navigate the lab via visual symbol-based queuing, receive results in plain-language audio, and delegate access to family members.
**FRs covered:** FR45 (brainstorm #57, #58, #53, #54, #55, #60, #104)
**Tier:** 1-2 (Foundation + Operational)

### Story 45.1: Audio & Thumbprint Consent Capture

As a lab technician,
I want to capture legally valid patient consent from illiterate patients via audio recording and thumbprint,
So that consent is obtained without requiring reading or writing ability.

**Acceptance Criteria:**

**Given** a patient cannot read or sign their name
**When** the tech initiates consent capture
**Then** the system plays a pre-recorded consent explanation in the patient's language (Dari, Pashto, Arabic, or English) describing: what samples will be collected, what tests will be performed, and their right to refuse
**And** the patient's verbal consent is captured via audio recording (stored encrypted, linked to the encounter)
**And** alternatively or additionally, a thumbprint can be captured via the device touchscreen
**And** the consent record includes: method (audio/thumbprint/both), language, timestamp, witnessing tech ID, and the consent text version
**And** consent is revocable — a "withdraw consent" action is available that halts processing and notifies the ordering physician
**And** consent records are part of the audit trail and cannot be deleted

### Story 45.2: Patient Queue Token System

As a lab receptionist or technician,
I want to assign patients visual tokens (color + symbol) instead of calling names aloud,
So that patient privacy is protected and illiterate patients can navigate the queue.

**Acceptance Criteria:**

**Given** a patient arrives at the lab
**When** they are registered in the queue
**Then** the system assigns a unique token: a color + symbol combination (e.g., "Blue Star", "Red Circle", "Green Triangle")
**And** the token is displayed on screen or printed on a small card for the patient
**And** the lab display shows which token is currently being called: "Now serving: Blue Star"
**And** patient names are never announced aloud (PHI protection)
**And** tokens are recycled after the patient's visit is complete
**And** the queue display is visible on a wall-mounted tablet or monitor

### Story 45.3: Family Delegate Result Access

As a patient's family member,
I want to be designated as a result delegate so I can receive and view lab results on behalf of my illiterate parent,
So that results reach someone who can understand and act on them.

**Acceptance Criteria:**

**Given** a patient designates a family delegate at registration
**When** results are ready
**Then** the delegate receives the SMS receipt code and can view results in Patient-Lite on the patient's behalf
**And** delegation requires one-time consent from the patient (audio + thumbprint from Story 45.1 or verbal witnessed)
**And** the delegate's phone number and relationship are recorded
**And** delegation is revocable by the patient at any time
**And** the delegation relationship and all access events are audit-logged
**And** the delegate sees the same data minimization as the patient — no internal lab notes or raw values beyond what the patient view shows

### Story 45.4: Plain-Language Audio Result Summaries

As a patient who cannot read,
I want to hear my lab results explained in simple language in my own language,
So that I understand what my results mean without needing someone to read to me.

**Acceptance Criteria:**

**Given** a result has been released and the patient or delegate accesses it
**When** they tap the audio button on the result view
**Then** a pre-recorded, physician-approved audio explanation plays in the patient's language (Dari, Pashto, Arabic, or English)
**And** the explanation uses plain language: not "Hemoglobin: 9.2 g/dL [L]" but "Your blood strength is a little low. This is not dangerous but your doctor will discuss it with you."
**And** a visual color indicator (green/yellow/red) accompanies each result field for at-a-glance understanding
**And** the audio scripts are physician-authored, versioned, and bundled offline
**And** the audio is never AI-generated — only curated, reviewed scripts are used

### Story 45.5: One-Trip Optimization

As a patient who traveled far to reach the lab,
I want the lab to minimize the number of return trips I need to make,
So that I don't lose additional days of work and travel for follow-up visits.

**Acceptance Criteria:**

**Given** a patient has multiple tests ordered
**When** the tech reviews the orders at sample collection
**Then** the system identifies: which tests can produce results today (rapid tests, CBC, chemistry), which require extended processing (cultures, specialized panels), and the optimal return date if any test requires a return visit
**And** for rapid tests, the patient is advised to wait (with estimated turnaround time displayed)
**And** for extended tests, the result is delivered remotely to the doctor and the patient is told "You do not need to return — your doctor will contact you"
**And** if a return IS needed, the system calculates the single optimal date that covers all pending results

### Story 45.6: Cultural Sensitivity Flags

As a lab technician,
I want to see cultural care preferences for each patient,
So that I can provide culturally respectful care that doesn't drive patients away.

**Acceptance Criteria:**

**Given** a patient has cultural preferences recorded
**When** the tech views the patient's lab order
**Then** relevant flags are displayed prominently: "Female phlebotomist preferred", "Privacy screen required", "Fasting patient — offer water and date after collection", "Male family members should not be present during female sample collection"
**And** flags are recordable at registration and editable by the tech
**And** flags persist across visits in the patient's local profile
**And** flag adherence is not tracked punitively — these are care guidance, not mandates

## Epic 46: SOPs, Training & Professional Development

Lab techs access an offline SOP library, receive contextual micro-learning at point-of-need, track competency decay, and connect with peer networks — breaking professional isolation and building a career ladder where none exists.
**FRs covered:** FR46 (brainstorm #36, #33, #34, #35, #37, #38, #107)
**Tier:** 1-2 (Foundation + Operational)

### Story 46.1: SOP Library with Offline Access & Acknowledgment

As a lab technician,
I want to access Standard Operating Procedures for every test and procedure offline,
So that I always have the correct protocol available even when connectivity is gone.

**Acceptance Criteria:**

**Given** the lab has SOPs for its test menu
**When** a tech opens the SOP library
**Then** SOPs are organized by category (hematology, chemistry, microbiology, general lab safety) and searchable by keyword
**And** each SOP includes: title, version, effective date, author, step-by-step procedure with images where applicable
**And** SOPs are bundled offline in the PWA and sync updates when connectivity is available
**And** when an SOP is new or updated, the system requires acknowledgment: "New SOP: [title]. Please review and confirm."
**And** acknowledgment tracking shows: who read it, when, and who hasn't yet
**And** SOP acknowledgment records are part of the inspection readiness documentation

### Story 46.2: Contextual Micro-Learning Modules

As a lab technician working alone,
I want to receive short training refreshers triggered by my current context,
So that I can learn at point-of-need without leaving the lab.

**Acceptance Criteria:**

**Given** a tech is performing a procedure
**When** context triggers apply (first time performing a test type, hasn't performed a procedure in >30 days, new SOP for this procedure)
**Then** a non-intrusive notification appears: "Quick refresher available: [Procedure Name] (3 min)"
**And** the module includes: step-by-step with images/video, key tips, and a 2-3 question self-assessment
**And** modules are bundled offline (no streaming dependency)
**And** completed modules are tracked in the tech's professional development record
**And** the tech can dismiss the notification — learning is encouraged, not forced

### Story 46.3: Competency Self-Assessment & Skill Decay Detection

As a lab technician,
I want the system to track which procedures I perform regularly and alert me when skills may be decaying,
So that I can proactively refresh techniques I haven't practiced recently.

**Acceptance Criteria:**

**Given** a tech has a history of test procedures performed
**When** a procedure hasn't been performed in >45 days (configurable)
**Then** the system surfaces a gentle notification: "You haven't performed [procedure] in [N] days. Would you like to review the technique?"
**And** the tech's competency dashboard shows: procedures performed regularly (green), procedures with decay risk (yellow), procedures not performed in >90 days (red)
**And** the dashboard is visible to the tech themselves (for professional pride) and optionally to their supervisor (for support planning)
**And** competency records feed into the certification pathway (Story 46.6)

### Story 46.4: Peer Network — "Ask a Tech"

As a lab technician working in an isolated facility,
I want to post questions with photos to a moderated peer network,
So that I can get help from experienced techs without needing real-time connectivity.

**Acceptance Criteria:**

**Given** a tech encounters something they can't identify or interpret
**When** they post to the peer network
**Then** they can include: a text question, photos (blood smear, analyzer error, precipitate in reagent), and their lab context (test type, instrument)
**And** posts are anonymized by default (no patient identifiers, no lab name unless opted in)
**And** the network uses store-and-forward messaging — works over intermittent connectivity
**And** designated mentors or senior techs can respond with guidance
**And** posts and responses are searchable (knowledge base effect)
**And** moderation flags inappropriate content

### Story 46.5: Mentorship Pairing System

As a district health officer,
I want to pair experienced techs with isolated or junior techs for structured mentorship,
So that professional isolation is addressed and knowledge transfer happens even without travel.

**Acceptance Criteria:**

**Given** the Hub has a registry of lab technicians across the network
**When** a mentorship pairing is created
**Then** the mentor and mentee are linked in Lab-Lite with: monthly check-in prompts, a shared learning journal for case discussions, and progress tracking
**And** all interactions are asynchronous (no real-time requirement)
**And** the district health officer can see which techs are mentored and which are unmatched
**And** mentorship activity is tracked in the tech's professional development record

**Admin Portal Surface:** Mentorship pairing management (creating, editing, and dissolving mentor-mentee pairs) is performed by district health officers in the Admin Portal, which has cross-lab visibility of all technicians. Lab-Lite shows the mentorship relationship to the paired techs, enables async communication (shared learning journal, check-in prompts), and tracks participation -- but does not provide the pairing management UI.

### Story 46.6: Certification Pathway Tracker

As a lab technician,
I want to track my progress toward professional certification milestones,
So that I have a visible career ladder and evidence of my professional growth.

**Acceptance Criteria:**

**Given** certification levels are defined (if applicable in the jurisdiction)
**When** the tech views their certification pathway
**Then** they see: modules completed, competency assessments passed, supervised procedures logged, continuing education hours accumulated, and progress toward the next milestone
**And** when a milestone is met, a verifiable digital certificate is generated
**And** the pathway is visible in the tech's profile and exportable for external verification

**Admin Portal Surface:** Certification milestone definitions (module requirements, competency criteria, CE hour thresholds) and credential management (issuing, revoking, verifying credentials) are managed in the Admin Portal. Lab-Lite shows the tech their own progress dashboard, logs supervised procedures, and generates printable/verifiable certificates upon milestone completion.

### Story 46.7: Personal Quality Streak & Achievement System

As a solo lab technician,
I want to see my quality streaks and achievements,
So that I have evidence I'm doing good work even when nobody else sees it.

**Acceptance Criteria:**

**Given** a tech is working alone
**When** they view their quality dashboard
**Then** they see: current QC streak (consecutive passing days), zero rejection streak (days without a rejected sample), training modules completed this quarter, and monthly quality metrics (e.g., hemoglobin CV%)
**And** milestone achievements award digital badges visible in their professional profile
**And** the system is self-reinforcement, not competitive — no leaderboard for solo techs
**And** streaks reset with explanation, not punishment

## Epic 47: Bio-Safety & Occupational Health

When a needle-stick happens, the app walks the tech through the emergency protocol, auto-identifies the source patient, tracks sharps and waste, maintains vaccination records, and provides spill response guidance — because the tech's own health matters as much as the patient's.
**FRs covered:** FR47 (brainstorm #71, #72, #73, #74, #75, #77, #78)
**Tier:** 1-2 (Foundation + Operational)

### Story 47.1: Post-Exposure Emergency Protocol

As a lab technician who just had a needle-stick,
I want the app to guide me through the post-exposure protocol step-by-step,
So that I take the right actions immediately when I'm panicking and can't think clearly.

**Acceptance Criteria:**

**Given** a tech activates the emergency button (persistent, always accessible)
**When** they select "Needle-stick / Sharp Injury"
**Then** the system launches a guided workflow: (1) Immediate first aid instructions, (2) Auto-identification of the source patient from the last processed sample, (3) Display of source patient's relevant status (e.g., "Hep B: POSITIVE"), (4) PEP protocol based on exposure type and source status, (5) Nearest PEP provider contact info
**And** an incident report is auto-generated with: time, location, mechanism, source patient status, tech's vaccination status (from Story 47.3), and first aid actions taken
**And** the lab manager and infection control officer are notified immediately
**And** the workflow works fully offline
**And** all data is audit-logged

### Story 47.2: Sharps & Waste Tracking

As a lab manager,
I want to track biohazard waste generation and sharps container status,
So that full containers are replaced proactively and waste disposal is documented for compliance.

**Acceptance Criteria:**

**Given** sharps containers and waste bins are in use
**When** a tech logs a container replacement (date started, date full, disposed by whom)
**Then** the system tracks: fill rate per container location, average days to full, and alerts when approaching full ("Sharps container in Station 2 started 14 days ago — average fill time is 12 days. Replace today.")
**And** waste disposal is logged: type (sharps/infectious/chemical), quantity, disposal method, handler ID, and date
**And** waste tracking feeds into the inspection readiness documentation
**And** the system generates monthly waste summaries

### Story 47.3: Employee Health & Vaccination Registry

As a lab manager,
I want to maintain each tech's occupational health record,
So that vaccination status is instantly available during exposure incidents and screening reminders are automated.

**Acceptance Criteria:**

**Given** a tech is employed at the lab
**When** their health record is maintained
**Then** it tracks: Hepatitis B vaccination status and titer date, tetanus, COVID, TB screening dates and results, and any occupational exposure history with outcomes
**And** when an exposure occurs (Story 47.1), the system instantly retrieves the tech's relevant vaccination status to guide PEP decisions
**And** screening reminders are generated: "Your TB screening is due in 30 days"
**And** health records are encrypted and access-restricted to the tech themselves and the lab manager

**Admin Portal Surface:** Employee health record management (creating records, editing vaccination status, logging screening results, managing exposure history) is performed by lab managers in the Admin Portal. Lab-Lite provides read-only emergency access to a tech's vaccination status during exposure incidents (Story 47.1 dependency) and displays screening reminders -- but does not allow editing health records.

### Story 47.4: Temperature & Environment Monitoring

As a lab technician,
I want to monitor reagent fridge temperatures and receive alerts on excursions,
So that temperature-sensitive reagents are not used after storage failures.

**Acceptance Criteria:**

**Given** reagent storage requires temperature monitoring
**When** using BLE temperature sensors ($15 IoT loggers) or manual twice-daily readings
**Then** temperatures are logged with timestamp and location (fridge 1, fridge 2, ambient)
**And** excursion alerts fire when temperature exceeds acceptable range: "Reagent fridge exceeded 8°C at [time] — duration [X] hours. Affected reagents may be compromised."
**And** the manual fallback prompts twice-daily readings with a color-coded trend display
**And** temperature logs feed into the inspection readiness documentation
**And** affected reagents are flagged for review before use

### Story 47.5: Spill & Decontamination Protocol

As a lab technician alone during a spill,
I want a risk-tiered guided response,
So that I decontaminate correctly without needing to call someone for instructions.

**Acceptance Criteria:**

**Given** a spill occurs
**When** the tech taps the "Spill" emergency button
**Then** the system asks: "What spilled?" with options: Blood/Serum, Urine, Chemical/Reagent, Culture/Microbiology
**And** each selection triggers the appropriate protocol: PPE requirements, decontamination agent, contact time, area clearance time, and disposal method
**And** a microbiology culture spill triggers a more aggressive protocol than a urine spill
**And** the event is logged as an incident with decontamination actions taken

### Story 47.6: Anonymous Safety Reporting

As a lab technician,
I want to report safety concerns anonymously,
So that issues like hand hygiene non-compliance are reported without creating interpersonal conflict.

**Acceptance Criteria:**

**Given** a tech observes a safety concern
**When** they submit an anonymous report
**Then** the report describes the concern category (hand hygiene, PPE non-use, improper waste disposal, equipment misuse, other) and free-text details
**And** the report is flagged to the lab manager with NO identifying information about the reporter
**And** the lab manager can acknowledge, investigate, and close the concern
**And** a trend dashboard shows: concern categories over time, resolution rate, and recurring issues

### Story 47.7: Infection Control Self-Audit Checklist

As a lab manager,
I want a monthly self-audit checklist for infection control,
So that compliance is continuously monitored and inspection-ready at all times.

**Acceptance Criteria:**

**Given** a month has passed since the last audit
**When** the lab manager opens the infection control audit
**Then** a checklist is presented: hand hygiene stations stocked, PPE inventory adequate, sharps containers not overfilled, work surfaces decontaminated on schedule, autoclave validation current, waste disposal compliant
**And** each item is marked pass/fail with optional photo evidence
**And** a compliance score is generated and tracked over time
**And** the completed audit is stored in the inspection readiness pack

## Epic 48: Intelligent Decision Support

Solo techs get a "co-pilot" — power-aware workload scheduling, predictive reagent burndown, pre-shift readiness forecasts, and a critical value escalation chain. The app thinks alongside Fatima so she can focus on the science, not the logistics.
**FRs covered:** FR48 (brainstorm #8, #11, #12, #16)
**Tier:** 2 (Operational Power)

### Story 48.1: Power-Aware Workload Scheduler

As a lab technician with limited generator fuel,
I want the system to schedule my work around available power hours,
So that I prioritize analyzer-dependent tests during power availability and defer manual tests to non-power hours.

**Acceptance Criteria:**

**Given** the tech has entered generator schedule (start time, duration in hours)
**When** viewing the worklist
**Then** the system calculates estimated analyzer time needed for pending tests and warns if it exceeds available power: "You have 4 hours of power. Your pending queue needs ~5.5 hours of analyzer time. Here's what to prioritize."
**And** tests are tagged: requires-power (analyzer) vs. manual (microscopy, urinalysis)
**And** a recommended schedule is generated: "Run chemistry batch NOW — if you wait 30 min, you won't finish before shutdown"
**And** the scheduler works fully offline from local data

### Story 48.2: Predictive Reagent Burndown

As a lab technician who is also the procurement department,
I want the system to predict when reagents will run out,
So that I can order resupply before a stockout leaves patients unserved.

**Acceptance Criteria:**

**Given** reagent inventory data is entered (quantity, expiry date)
**When** the system has consumption history
**Then** it calculates projected depletion date based on average daily consumption AND chemical expiry date — whichever comes first
**And** it factors in supplier lead time (configurable per supplier): "Order by [date] to avoid stockout given [N]-day delivery time"
**And** the dashboard shows each reagent with: current stock, projected depletion date, expiry date, and recommended reorder date
**And** alerts fire at configurable thresholds (30 days, 14 days, 7 days before projected stockout)

### Story 48.3: Pre-Shift Readiness Forecast

As a lab technician starting my day,
I want a morning readiness briefing,
So that I know what I can and can't do today before patients arrive.

**Acceptance Criteria:**

**Given** it is the start of a shift
**When** the tech opens the dashboard
**Then** a readiness briefing is displayed: personnel status (who's working today), reagent stock status per test type (sufficient / low / stockout), equipment status (operational / maintenance due / down), pending orders from overnight, and power/generator forecast
**And** each area is color-coded: green (good), amber (caution), red (action needed)
**And** actionable recommendations are included: "Chemistry strips low — defer non-urgent panels", "Maintenance due on hematology analyzer — schedule for today"
**And** the briefing generates entirely from local Dexie data (works offline)

### Story 48.4: Critical Value Escalation Chain

As a lab supervisor,
I want critical results to trigger an unstoppable notification chain until a physician acknowledges receipt,
So that life-threatening results never sit unread in a notification queue.

**Acceptance Criteria:**

**Given** a result contains a critical value (configurable thresholds per test — e.g., Potassium > 6.5, Glucose < 40, Hemoglobin < 5)
**When** the result is released
**Then** the system triggers a multi-step escalation: (1) Full-screen alert to the releasing tech requiring acknowledgment, (2) Urgent in-app notification to the ordering physician in OPD-Lite, (3) If no physician acknowledgment within 15 minutes → SMS to physician, (4) If no acknowledgment within 30 minutes → SMS to facility medical director, (5) If no acknowledgment within 60 minutes → flag to district health officer
**And** every step is audit-logged: notification sent, received, acknowledged (or escalated)
**And** the critical thresholds are physician-configured and modifiable by lab managers
**And** the escalation chain is deterministic — no AI judgment, just rules

## Epic 49: Offline Resilience & Communication

Labs operate through complete connectivity blackouts — Bluetooth P2P sync with OPD-Lite in the same building, SMS fallback for critical results, data budget tracking for prepaid SIMs, and conflict zone security protocols for data protection under threat.
**FRs covered:** FR49 (brainstorm #4, #5, #6, #76, #106)
**Tier:** 2 (Operational Power)

### Story 49.1: Data Budget Mode

As a lab technician on a prepaid SIM,
I want to track how much data each sync costs and forecast when my data will run out,
So that I can manage connectivity as a finite resource.

**Acceptance Criteria:**

**Given** the tech's device uses prepaid mobile data
**When** they enable Data Budget Mode in settings
**Then** the system tracks estimated data consumption per sync operation (KB per result upload, per notification pull, per audit drain)
**And** a dashboard shows: "You've used ~45MB of ~500MB this month. At current rate, you'll run out on the 18th."
**And** a "Low Data Mode" toggle batches syncs, compresses payloads, and skips non-essential pulls (e.g., notification polling frequency reduced)
**And** the tech can set their data plan size and billing cycle date

### Story 49.2: SMS Fallback for Critical Results

As a lab technician with no internet connectivity,
I want critical results to be sent to the ordering physician via SMS,
So that life-threatening findings reach the doctor even during a complete internet blackout.

**Acceptance Criteria:**

**Given** internet connectivity is unavailable AND a critical result has been released
**When** the escalation chain (Story 48.4) cannot deliver via in-app notification
**Then** the system sends a compressed, coded SMS to the ordering physician's registered phone number: "Patient [ID-code] — [Test] — CRITICAL — [Key value] — Confirm receipt"
**And** the SMS contains NO PHI beyond what is clinically necessary for the critical value alert
**And** the system tracks SMS delivery status if available
**And** SMS fallback is only used for critical values, not routine results
**And** the physician can confirm receipt by replying to the SMS

### Story 49.3: Bluetooth Peer-to-Peer Sync with OPD-Lite

As a lab technician in a facility with no internet,
I want to sync results directly to the doctor's OPD-Lite device over Bluetooth or local WiFi,
So that results reach the physician across the hallway without needing cloud connectivity.

**Acceptance Criteria:**

**Given** both Lab-Lite and OPD-Lite are running on devices in the same building
**When** the tech taps "Send to [Doctor Name]" on a released result
**Then** the system discovers nearby OPD-Lite devices via Bluetooth Low Energy or local WiFi Direct
**And** the result is transmitted as a signed FHIR DiagnosticReport bundle
**And** the receiving OPD-Lite device verifies the signature and imports the result into the patient's encounter
**And** the transfer is logged in both apps' audit trails
**And** no internet or Hub connectivity is required at any point in this flow
**And** the transfer is encrypted in transit

### Story 49.4: Conflict Zone Security Protocols

As a lab manager in an area with deteriorating security,
I want to protect patient data when the facility is at risk of being compromised,
So that sensitive health information cannot be exploited if devices are seized.

**Acceptance Criteria:**

**Given** security conditions deteriorate
**When** the lab manager activates "Security Alert" mode
**Then** the system: (a) encrypts all patient data with emergency encryption (device becomes read-only without re-authentication), (b) generates a minimal-data backup to encrypted USB or cloud (enough to restore operations, no exploitable PHI), (c) displays a rapid shutdown checklist: secure biohazards, lock sample storage, power down instruments, (d) optionally: device wipe of all PHI with confirmation ("This will erase all patient data. Hub backup is available. Proceed?")
**And** the security event is logged for institutional records
**And** the system can be restored from Hub backup when conditions improve

## Epic 50: Reporting & Surveillance Automation

Monthly HMIS reports, donor-specific reports, daily activity logs, and disease surveillance alerts all generate automatically — killing Fatima's 2-day end-of-month reporting burden and turning every lab into a sentinel surveillance node.
**FRs covered:** FR50 (brainstorm #3, #28, #29, #30, #31)
**Tier:** 2-3 (Operational + Enterprise)

### Story 50.1: Auto-Compiled HMIS Monthly Report

As a lab technician,
I want the monthly health directorate report to generate automatically from my operational data,
So that my 2-day end-of-month reporting chore becomes a button press.

**Acceptance Criteria:**

**Given** a month of lab data exists
**When** the tech or manager taps "Generate Monthly Report"
**Then** the system compiles: total tests by category, positivity rates (malaria, TB, hepatitis), demographic breakdowns (age/gender), and reagent consumption summary
**And** the report is formatted in the exact Afghan MoPH HMIS template
**And** the tech reviews, can make minor corrections, and taps "Finalize"
**And** the report exports as PDF for printing or as structured data for DHIS2 upload
**And** report generation works from local Dexie data (offline capable)

### Story 50.2: Multi-Donor Report Templates

As a lab manager with multiple funding sources,
I want donor-specific reports to generate automatically in each donor's required format,
So that I never manually compile a donor report again.

**Acceptance Criteria:**

**Given** the lab is registered with multiple programs (e.g., WHO TB, MSF malaria, USAID hepatitis)
**When** the manager selects a program and reporting period
**Then** the system generates a report in that donor's specific format with the data fields they require
**And** program-specific test tracking is automatic (tests tagged by program at order time)
**And** the report includes reimbursement calculations where applicable
**And** reports are exportable as PDF and shareable via email or WhatsApp

### Story 50.3: Automated Disease Surveillance Alerts

As a district health officer,
I want labs to automatically alert me when positivity rates spike,
So that outbreaks are detected early from lab data — the earliest epidemiological signal.

**Acceptance Criteria:**

**Given** the lab has historical positivity rate data
**When** the system detects a significant deviation: (a) positivity rate for any test category exceeds 2x the 4-week rolling average, or (b) 3+ confirmed cases of a reportable disease within 48 hours
**Then** an automated surveillance alert is generated and transmitted to the district health officer and national surveillance system
**And** the alert includes: lab location, test category, current positivity rate vs. baseline, number of cases, and time period
**And** the tech is notified that a surveillance alert was generated
**And** alerts are logged and auditable

**Admin Portal Surface:** Alert recipient configuration (which district health officers and surveillance contacts receive alerts, per geographic area and disease category) is managed in the Admin Portal. Lab-Lite generates surveillance alerts per the configured rules and transmits them to the Hub for routing -- but does not manage the recipient list.

### Story 50.4: Daily Activity Log (WhatsApp-Shareable)

As a lab technician,
I want a daily summary auto-generated as a shareable image,
So that hospital administration gets their daily report via WhatsApp without me writing anything.

**Acceptance Criteria:**

**Given** a day of lab operations has occurred
**When** end-of-day arrives (or the tech manually triggers)
**Then** the system generates a formatted daily summary: tests run by type, samples received vs. completed, turnaround times, rejected samples, stockout alerts, equipment status
**And** the summary renders as a clean image (PNG) optimized for WhatsApp sharing
**And** the image includes the lab name, date, and a verification watermark
**And** the tech can share it directly via the device's share sheet (WhatsApp, email, etc.)

## Epic 51: Multi-Tech Lab Management

Khalid's 6-tech lab runs smoothly with automated shift handover protocols, real-time workload balancing, sample collision prevention, equipment scheduling, and a RAG readiness board — bringing military-grade operational awareness to clinical labs.
**FRs covered:** FR51 (brainstorm #39, #40, #43, #44, #45, #46, #47, #98)
**Tier:** 2-3 (Operational + Enterprise)

### Story 51.1: Shift Handover Protocol

As an incoming shift technician,
I want an auto-generated handover report from the outgoing shift,
So that I know exactly what's pending, what's broken, and what needs attention without relying on verbal handoff.

**Acceptance Criteria:**

**Given** a shift change is occurring
**When** the outgoing tech triggers "End Shift" or the incoming tech starts their shift
**Then** the system generates a structured handover: pending samples (count, urgency), equipment alerts (malfunctions, QC failures), incomplete orders, QC status for each analyte, and free-text notes from the outgoing tech
**And** the incoming tech acknowledges the handover with their identity
**And** unacknowledged handovers are flagged to the lab manager
**And** the handover record is stored for accountability

### Story 51.2: Workload Balancing Dashboard

As a lab manager,
I want to see real-time workload distribution across all techs,
So that I can rebalance work and identify when someone is consistently overloaded.

**Acceptance Criteria:**

**Given** multiple techs are processing samples
**When** the manager opens the workload dashboard
**Then** each tech's current load is displayed: pending samples, in-progress samples, completed today, and estimated completion time
**And** the manager can drag-reassign samples between techs
**And** when a tech marks themselves unavailable (break, absent), their queue is flagged for redistribution
**And** historical data shows patterns: who's consistently overloaded, who's underutilized

**Admin Portal Surface:** This dashboard is operational and stays in Lab-Lite. However, the staff roster and shift assignments (who works which shift, absences, leave) are managed in the Admin Portal. Lab-Lite consumes the roster data for workload distribution, availability display, and redistribution logic.

### Story 51.3: Sample Collision Prevention

As a lab technician,
I want the system to prevent two techs from accidentally processing the same sample,
So that duplicate runs are eliminated and reagent is not wasted.

**Acceptance Criteria:**

**Given** a tech accepts a sample for processing
**When** they scan or tap "Start Processing"
**Then** the sample is locked to that tech with a timestamp
**And** if another tech tries to process the same sample, they see: "This sample is currently being processed by [Name] (started [time]). Duplicate run prevented."
**And** the lock releases when the result is entered or the tech explicitly releases it
**And** locks older than a configurable timeout (default 4 hours) auto-release with a notification to the lab manager

### Story 51.4: Equipment Booking & Scheduling

As a lab technician in a resource-constrained lab,
I want to queue my sample batches for shared instruments,
So that I know when it's my turn and can prepare accordingly.

**Acceptance Criteria:**

**Given** an instrument is shared by multiple techs
**When** a tech queues a batch for an instrument
**Then** the system shows: current batch (owner, estimated completion time), queued batches (order, estimated start times), and availability windows
**And** techs receive a notification when their batch is next
**And** the manager can prioritize or reorder the queue

### Story 51.5: RAG Readiness Board

As a lab manager,
I want a single dashboard showing Red/Amber/Green status across all operational dimensions,
So that I can assess lab readiness at a glance.

**Acceptance Criteria:**

**Given** operational data exists across multiple domains
**When** the manager opens the readiness board
**Then** the following dimensions are displayed with RAG status: Personnel (Green: all present / Amber: 1 absent / Red: <minimum staffing), Equipment (Green: all operational / Amber: maintenance due / Red: critical instrument down), Supplies (Green: >2 weeks stock / Amber: <1 week / Red: stockout), QC (Green: all passing / Amber: drift warning / Red: failed — results blocked)
**And** clicking any dimension drills down to details
**And** the board auto-refreshes from local data

### Story 51.6: Technician Performance Portfolio

As a lab technician,
I want a professional development portfolio based on my work data,
So that I have objective evidence for annual evaluations and career growth.

**Acceptance Criteria:**

**Given** a tech has work history
**When** they view their portfolio
**Then** they see: tests processed per shift (avg and trend), average turnaround time, QC pass rate, sample rejection rate, training modules completed, mentorship participation
**And** the portfolio is framed as professional development, not surveillance — the tech sees their own data
**And** the supervisor can view it with the tech's knowledge for evaluation conversations
**And** data is exportable for annual review documentation

**Admin Portal Surface:** The supervisor/manager review dashboard (viewing portfolios across all techs, comparative analytics, and formal evaluation workflows) is in the Admin Portal. Lab-Lite provides the self-service portfolio view for the tech themselves, showing their own performance data and development trajectory.

### Story 51.7: Gamified Team Quality Engagement

As a lab team,
I want team quality achievements recognized and celebrated,
So that quality metrics feel like accomplishments rather than surveillance.

**Acceptance Criteria:**

**Given** a multi-tech lab team
**When** quality milestones are achieved
**Then** the system recognizes: "QC Champion of the Month" (best QC compliance), "Zero Rejection Week" (no rejected samples for 7 days), "Speed Star" (fastest TAT while maintaining quality)
**And** achievements are displayed on the team dashboard (opt-in)
**And** the framing is collaborative, not competitive: "The whole team achieved Zero Rejection Week — celebrate!"
**And** individual achievements are visible in the tech's portfolio (Story 51.6)

## Epic 52: Cross-App Integration & Pharmacy Awareness

Lab-Lite becomes a fully connected node in the Ultranos ecosystem — Pharmacy-Lite pushes medication monitoring flags, inventory is visible network-wide, Hub coordinates procurement, and patient timelines show results across all apps.
**FRs covered:** FR52 (brainstorm #24, #25, #26, #27, #105)
**Tier:** 3 (Enterprise)

### Story 52.1: Pharmacy-Lite Medication Monitoring Flags

As a lab technician,
I want to see which patients need follow-up labs based on their medications,
So that I can proactively schedule monitoring tests for patients who might forget to return.

**Acceptance Criteria:**

**Given** Pharmacy-Lite dispenses a medication requiring lab monitoring (e.g., Warfarin → INR, Metformin → renal function, Lithium → serum levels)
**When** the dispensing event syncs to Hub
**Then** Lab-Lite receives a monitoring flag: "Patient [ID] started [Medication] on [date]. [Test] monitoring due [frequency]."
**And** a "Monitoring Due" section appears on the Lab-Lite dashboard with upcoming monitoring tests
**And** the system can generate reminders to the patient or ordering physician when monitoring is overdue

### Story 52.2: Shared Inventory Visibility Across Network

As a district health officer,
I want to see reagent stock levels across all labs in my network,
So that I can redistribute supplies before any lab hits a stockout.

**Acceptance Criteria:**

**Given** multiple labs report inventory data to the Hub
**When** the district health officer views the inventory dashboard
**Then** they see a heat map: which labs are stocked, low, or stocked out per reagent category
**And** recommendations surface: "Lab A has 0 malaria RDTs. Lab B (30km away) has 50 — recommend transfer."
**And** individual lab managers can see their own stock relative to network peers

**Admin Portal Surface:** The district health officer inventory dashboard (cross-network heat map, redistribution recommendations, transfer coordination) is in the Admin Portal. Individual lab managers see their own stock levels and network-relative position in Lab-Lite.

### Story 52.3: Hub-Managed Coordinated Procurement

As a lab technician requesting resupply,
I want my reagent request to flow to a central coordinator who can batch orders across labs,
So that procurement is efficient and cost-effective at the network level.

**Acceptance Criteria:**

**Given** predictive burndown (Story 48.2) flags an upcoming stockout
**When** the tech taps "Request Resupply"
**Then** the request flows to Hub where a procurement coordinator sees all pending requests across the network
**And** the coordinator can batch orders to suppliers, negotiate volume pricing, and route deliveries efficiently
**And** the tech sees status updates: "Request received → Approved → Ordered → Shipped → ETA: [date]"
**And** order history tracks past deliveries, costs, and lead times

**Admin Portal Surface:** The procurement coordinator dashboard (viewing all pending requests across the network, batching orders, negotiating volume pricing, routing deliveries) is in the Admin Portal. Lab-Lite provides the resupply request flow for individual techs and shows status updates on their requests.

### Story 52.4: Cross-App Patient Result Timeline

As a physician in OPD-Lite,
I want to see all lab results for a patient in a longitudinal timeline,
So that I can track trends and see the full diagnostic picture across visits.

**Acceptance Criteria:**

**Given** a patient has lab results from multiple visits
**When** the physician views the patient's clinical timeline in OPD-Lite
**Then** lab results appear inline with encounters, prescriptions, and notes
**And** results are grouped by test type with trend visualization (e.g., glucose values over 6 months)
**And** abnormal values are highlighted in the timeline
**And** each result links to its full DiagnosticReport detail
**And** data minimization is enforced — the patient's view in Patient-Lite shows simplified, plain-language results only

## Epic 53: AI-Assisted Clinical Support

AI serves as librarian (knowledge cards), pattern flagger (anomaly detection), and communication bridge (tele-consultation builder) — with the confidence inversion principle ensuring AI is loudest when least certain. Never a diagnostician.
**FRs covered:** FR53 (brainstorm #13, #14, #15, #17, #18, #19, #20, #108)
**Tier:** 3-4 (Enterprise + Innovation)

### Story 53.1: Contextual Knowledge Cards

As a lab technician encountering an unfamiliar result pattern,
I want physician-curated reference cards to appear automatically based on my current result,
So that I have a textbook that opens to the right page without searching.

**Acceptance Criteria:**

**Given** a tech enters or reviews a result
**When** the result matches a trigger pattern (e.g., WBC > 50,000 with blasts, severely low hemoglobin, critical electrolyte values)
**Then** a reference card appears with: condition description, recommended actions (e.g., "IMMEDIATE referral required"), and clinical context
**And** all cards are physician-authored, named, and versioned — NOT AI-generated content
**And** cards are bundled offline in the PWA
**And** the card display is non-intrusive — appears as a side panel, not a blocker

### Story 53.2: Visual Atlas for Microscopy

As a lab technician looking at a blood smear,
I want to search an offline visual atlas by what I'm seeing under the microscope,
So that I can identify cells and parasites even without a colleague to ask.

**Acceptance Criteria:**

**Given** the tech is performing microscopy
**When** they open the visual atlas
**Then** they can browse by category: blood cells (normal and abnormal), parasites (malaria species, filaria), bacteria (Gram stain morphologies), urine sediment, and body fluid cells
**And** each reference image includes: photomicrograph, description, clinical significance, and recommended next steps
**And** the atlas is curated by hematopathologists and bundled offline
**And** search is available by keyword or visual browsing

### Story 53.3: AI Anomaly Flagging for Physician Review

As a lab system,
I want to detect statistical anomalies in result data and flag them for physician review,
So that potentially dangerous patterns are caught even when the tech is tired or overloaded.

**Acceptance Criteria:**

**Given** a result has been entered
**When** the AI reviews the structured result data (numbers only, no PHI context)
**Then** it identifies statistical anomalies: unusual combinations of values, patterns consistent with urgent conditions, significant changes from prior results
**And** the AI NEVER names a diagnosis — it says "This pattern warrants urgent physician review" not "This is TTP"
**And** the flag is sent as a priority notification to the ordering physician
**And** the flag includes a confidence level and the explicit statement: "Statistical pattern flag — not a diagnosis. Clinical correlation required."
**And** the Confidence Inversion Principle applies: lower confidence = LOUDER alert (Story 53.5)

### Story 53.4: Tele-Consultation Request Builder

As a lab technician who can't interpret a result,
I want AI to help me package a clear consultation request for a remote expert,
So that the expert gets all the information they need to help me without a back-and-forth exchange.

**Acceptance Criteria:**

**Given** the tech encounters something they can't interpret
**When** they tap "Request Consultation"
**Then** the system helps them build a structured request: result data, their observations (free text), microscopy photos (phone camera), and the relevant knowledge card for context
**And** the package is sent to a remote pathologist or reference lab — a HUMAN expert, not an AI
**And** the AI's role is limited to helping the tech communicate clearly — formatting the question, suggesting relevant observations to include
**And** the consultation operates store-and-forward (no real-time requirement)
**And** responses from the expert attach to the patient's result record as consultation notes

### Story 53.5: Confidence Inversion Principle

As a lab system designer,
I want AI to be loudest when it's least certain,
So that false confidence is structurally impossible and uncertainty always triggers human review.

**Acceptance Criteria:**

**Given** any AI-assisted action in Lab-Lite
**When** the AI generates an output with a confidence level
**Then** the UI reflects: High confidence → subtle green indicator, Medium confidence → yellow with explanation text, Low confidence → red full-screen alert: "I cannot reliably assess this. Request human consultation."
**And** the AI is never allowed to suppress its uncertainty — every output includes a visible confidence indicator
**And** below a configurable confidence threshold, the system auto-escalates to the ordering physician regardless of other rules
**And** the principle is documented in the UI: "This system is designed to alert more aggressively when less certain."

### Story 53.6: AI Provenance Trail

As a lab manager or regulator,
I want every AI-assisted action to be logged with full provenance,
So that I can always answer "Did AI make this decision?" with verifiable evidence.

**Acceptance Criteria:**

**Given** any AI-assisted interaction occurs
**When** the interaction is logged
**Then** the provenance record includes: model version (or ONNX model hash for offline), input description (no PHI — e.g., "CBC result set, 5 numeric values"), AI output (what it suggested or flagged), confidence score, what the tech decided, and what the physician confirmed
**And** the provenance trail is immutable (append-only, hash-chained)
**And** provenance records are queryable: "Show all AI-assisted decisions for [date range]"
**And** offline AI decisions are cached locally and synced to Hub (Story 49 architecture)

### Story 53.7: Patient-Facing Public Health Guidance

As a patient receiving a positive test result,
I want to receive simple, actionable health guidance along with my result,
So that I know what to do next to protect myself and my family.

**Acceptance Criteria:**

**Given** a result triggers a public health guidance condition (malaria positive, TB positive, hepatitis positive)
**When** the result is delivered to Patient-Lite or the family delegate
**Then** a physician-approved guidance message accompanies the result in the patient's language (audio + text): "Your malaria test is positive. Your doctor will give you medicine. Important: (1) Sleep under a bed net tonight, (2) Bring your children for testing within 2 days, (3) Drink clean water and rest."
**And** guidance messages are condition-specific and versioned
**And** guidance messages are NEVER AI-generated — only physician-authored scripts

## Epic 54: Lab Network & Outbreak Response

Multi-branch labs manage satellite collection points, courier logistics, reference lab send-outs, and outbreak response mode — scaling Lab-Lite from a single-facility tool to a network platform.
**FRs covered:** FR54 (brainstorm #89, #90, #91, #92, #93, #94, #101, #102, #103)
**Tier:** 3-4 (Enterprise + Innovation)

### Story 54.1: Multi-Branch Lab Network Management

As a lab manager running a main lab with satellite collection points,
I want to manage the entire network from one dashboard,
So that I have visibility across all locations without traveling between them.

**Acceptance Criteria:**

**Given** a lab network with a main lab and satellite collection points
**When** the manager views the network dashboard
**Then** they see: all locations with their operational status (active/inactive), pending samples per location, stock levels per location, and staffing status
**And** satellite collection points run a simplified "Collection Only" mode of Lab-Lite (register patient, collect sample, print label)
**And** the main lab receives all samples for processing and routes results back to satellites for patient pickup

**Admin Portal Surface:** The network management dashboard (all locations, operational status, staffing overview, adding/removing satellite sites) is in the Admin Portal. Lab-Lite handles individual site operations: the main lab processes samples and manages its local workflow; satellite sites run in "Collection Only" mode.

### Story 54.2: Community Health Worker Collection Module

As a village health worker at a remote health post,
I want an ultra-simplified sample collection interface,
So that I can register patients and collect samples without lab training.

**Acceptance Criteria:**

**Given** a non-tech health worker with a basic smartphone
**When** they open Lab-Lite in CHW mode
**Then** they see: (1) patient identification (QR scan or name + father's name), (2) sample type selection via pictographic menu (blood tube, urine cup, swab icons), (3) label generation (handwritten barcode number or printed if available), (4) "Samples Collected" log with timestamps
**And** when the courier arrives, each sample barcode is scanned to create a handoff record
**And** the module syncs store-and-forward when connectivity appears
**And** NO result entry, QC, or inventory functions are available in CHW mode

**Admin Portal Surface:** CHW user enrollment (creating accounts, assigning CHW role, provisioning credentials, linking to collection sites) is done via the Admin Portal. Lab-Lite provides the simplified CHW mode interface for sample collection and handoff -- the CHW never interacts with Admin Portal directly.

### Story 54.3: Courier & Sample Transport Tracking

As a lab manager,
I want to track samples during transport from collection points to the main lab,
So that transit conditions are documented and stability windows are monitored.

**Acceptance Criteria:**

**Given** samples are being transported by motorcycle courier
**When** the courier picks up samples
**Then** the system records: pickup location, timestamp, courier ID, sample count, and temperature at pickup (if sensor available)
**And** at delivery, the system records: arrival timestamp, temperature at arrival, sample condition assessment
**And** if transit time exceeds the stability window for any sample type, the system flags: "Sample [ID] exceeded [N]-hour stability window. Flag for pre-analytical error."
**And** transport records become part of the chain of custody

### Story 54.4: External Reference Lab Integration

As a lab technician sending samples to a reference lab,
I want to manage send-outs with tracking and result import,
So that reference lab results are incorporated into the patient's record seamlessly.

**Acceptance Criteria:**

**Given** a test cannot be performed locally
**When** the tech initiates a "Send to Reference Lab"
**Then** the system generates: a referral form (patient ID, test requested, clinical context), a shipping manifest, and a tracking record
**And** the tech tracks status: "Sent → Received by Reference Lab → Processing → Results Available"
**And** results from the reference lab can be entered manually or imported via structured data
**And** the result report notes: "Performed at: [Reference Lab Name], Accreditation #[X]"
**And** TAT tracking shows: average reference lab TAT and alerts when overdue

### Story 54.5: Outbreak Response Mode

As a provincial health officer,
I want to activate "Outbreak Mode" for all labs in an affected area,
So that lab operations shift to support the outbreak response with maximum throughput and real-time surveillance.

**Acceptance Criteria:**

**Given** an outbreak is declared
**When** the health officer activates Outbreak Mode for the affected area
**Then** participating labs switch to: (a) prioritized testing queue for the target pathogen, (b) real-time result reporting to the surveillance system (instead of monthly), (c) simplified data entry for the target test (reduced fields, faster throughput), (d) inventory alerts recalibrated for surge demand, (e) auto-generated daily situation reports
**And** normal operations resume when Outbreak Mode is deactivated
**And** all outbreak mode actions are audit-logged with the activation authority

**Admin Portal Surface:** Outbreak Mode activation and deactivation (selecting affected area, target pathogen, participating labs) is performed by provincial health officers in the Admin Portal. Lab-Lite receives the mode switch via Hub sync and adjusts operations accordingly (prioritized queue, real-time reporting, simplified entry, surge alerts). Labs cannot self-activate Outbreak Mode.

### Story 54.6: Seasonal Operations Planner

As a lab manager preparing for malaria season,
I want a unified seasonal operations plan 30 days ahead of projected demand surges,
So that I can pre-position reagents, adjust staffing, and prepare protocols proactively.

**Acceptance Criteria:**

**Given** historical data shows seasonal demand patterns
**When** a demand surge is projected
**Then** the system generates a seasonal plan covering: power forecast (solar availability, generator needs), reagent forecast (projected consumption vs. current stock), staffing forecast (shift adjustments needed), and clinical protocol recommendations (priority worklist templates, QC schedule adjustments)
**And** the plan includes actionable deadlines: "Order RDTs by [date] for bulk pricing, pre-position backup stock from [partner lab]"
**And** the plan is exportable and shareable with hospital administration

### Addendum 17: Admin Portal Centralization (2026-05-30)

**Decision:** All user creation, role assignment, staff management, and cross-facility oversight functions are centralized in the Admin Portal (`apps/admin-portal/`). Spoke apps (Lab-Lite, OPD-Lite, Pharmacy-Lite, Patient-Lite) consume roles and permissions for operational gating but do NOT provide management UIs for user lifecycle.

**Rationale:** All spoke apps require Admin Portal for organizational sign-ups. Centralizing people management eliminates N duplicate staff UIs, ensures consistent role assignment workflows, and maintains a single source of truth for user lifecycle across the platform.

**Affected stories:** 42.1, 46.5, 46.6, 47.3, 50.3, 51.2, 51.6, 52.2, 52.3, 54.1, 54.2, 54.5

**Pattern:** Stories that involve cross-facility dashboards (district health officer views, network management, coordinated procurement) render in Admin Portal. Stories that involve facility-level operations (sample processing, result entry, QC) remain in the spoke app.

### FR Coverage Map (Addendum 17)

FR55: Epic 55 — Admin Portal People & Facility Management

## Epic 55: Admin Portal People & Facility Management

The Admin Portal becomes the single management surface for user lifecycle, role assignment, staff oversight, cross-facility dashboards, and operational configuration — centralizing functions that were previously scattered across spoke apps or deferred entirely. Spoke apps consume roles and permissions but never assign them.
**FRs covered:** FR55 (Addendum 17 centralization mandate + deferred items from Stories 42.1, 46.5, 46.6, 47.3, 50.3, 51.6, 52.2, 52.3, 54.1, 54.2, 54.5)
**Tier:** 1 (Foundation — unblocks role management across all spoke apps)

### Story 55.1: Lab Staff Role Management

As an organization administrator,
I want to assign lab-specific roles (LAB_TECH, SENIOR_TECH, SUPERVISOR, LAB_MANAGER) to lab staff from the Admin Portal,
So that role assignment is centralized, auditable, and consistent across all labs in my organization.

**Acceptance Criteria:**

**Given** the Admin Portal with an authenticated org administrator
**When** they navigate to a lab's staff management page
**Then** they see all staff members in that lab with their current roles, email (truncated for display), and assignment date
**And** they can assign one of four roles: LAB_TECH, SENIOR_TECH, SUPERVISOR, LAB_MANAGER
**And** role changes require confirmation ("Change [name] from [old] to [new]?")
**And** last-manager protection prevents demoting the only LAB_MANAGER in a lab (enforced atomically via Supabase RPC with SELECT...FOR UPDATE)
**And** role changes emit an audit event with: action UPDATE, resourceType PRACTITIONER, previousRole, newRole, modifiedBy (practitioner UUID)
**And** the `listStaff` Hub API endpoint uses targeted user lookups instead of `listUsers()` to avoid pagination issues
**And** role labels are localized in all Admin Portal locale files

**Dev Notes:**
- Hub API endpoints `lab.listStaff` and `lab.updateStaffRole` already exist — this story builds the Admin Portal UI that calls them
- Fix the `listUsers()` pagination issue: replace with `supabase.auth.admin.getUserById()` per practitioner, or batch with `in()` filter
- Fix the TOCTOU race: wrap last-manager check in a Supabase RPC function with `SELECT...FOR UPDATE` inside a transaction
- Reuse the `StaffManagementPanel` design pattern (confirmation dialog, role dropdown, truncated email) from the removed Lab-Lite component

### Story 55.2: Cross-Lab Staff Overview Dashboard

As an organization administrator,
I want a single dashboard showing all staff across all my labs with their roles and activity status,
So that I can manage staffing, identify gaps, and ensure every lab has adequate coverage.

**Acceptance Criteria:**

**Given** an org with multiple labs
**When** the admin views the staff overview
**Then** they see a table of all staff grouped by lab: name/email, role, last active date, lab assignment
**And** they can filter by role, lab, and activity status
**And** they can reassign a staff member to a different lab (with audit logging)
**And** labs with no LAB_MANAGER are flagged with a warning
**And** the dashboard is paginated and searchable

### Story 55.3: Employee Health & Vaccination Registry (Admin Surface)

As an organization administrator or lab manager (via Admin Portal),
I want to maintain each tech's occupational health record centrally,
So that vaccination status is instantly available during exposure incidents and screening reminders are automated.

**Acceptance Criteria:**

**Given** the Admin Portal employee management section
**When** managing a tech's health record
**Then** the admin can record: Hepatitis B vaccination status and titer date, tetanus, COVID, TB screening dates and results, and occupational exposure history
**And** screening reminders are generated and visible in the Admin Portal dashboard
**And** health records are encrypted and access-restricted
**And** Lab-Lite retains read-only emergency access to vaccination status during exposure incidents (Story 47.1 dependency)

**Admin Portal Surface:** Full CRUD for employee health records. Lab-Lite gets read-only API access for emergency protocol (Story 47.1).

### Story 55.4: Mentorship Pairing Management

As a district health officer (via Admin Portal),
I want to pair experienced techs with isolated or junior techs for structured mentorship,
So that professional isolation is addressed and knowledge transfer happens across the network.

**Acceptance Criteria:**

**Given** the Admin Portal mentorship section
**When** a district health officer creates a mentorship pairing
**Then** the mentor and mentee are linked with: monthly check-in prompts, progress tracking, and pairing metadata (start date, goals)
**And** the officer can see which techs are mentored and which are unmatched
**And** pairings can be dissolved with a reason code
**And** Lab-Lite displays the mentorship relationship and enables async communication (Story 46.5)

**Admin Portal Surface:** Pairing creation, dissolution, and oversight dashboard. Lab-Lite shows the relationship and enables communication.

### Story 55.5: Certification & Credential Management

As an organization administrator,
I want to define certification milestones and manage credential records for lab staff,
So that professional development is tracked centrally and credentials are verifiable.

**Acceptance Criteria:**

**Given** the Admin Portal certification section
**When** managing certification pathways
**Then** the admin can: define milestone requirements per certification level, review and approve completed milestones, issue verifiable digital certificates, and track expiry dates for credentials
**And** Lab-Lite shows the tech their own progress and generates certificates (Story 46.6)

**Admin Portal Surface:** Milestone definitions, credential issuance, and expiry monitoring. Lab-Lite provides self-service progress view.

### Story 55.6: Cross-Facility Inventory & Procurement Dashboard

As a district health officer or procurement coordinator,
I want to see reagent stock levels across all labs and coordinate procurement centrally,
So that supplies are redistributed before stockouts and procurement is batched for efficiency.

**Acceptance Criteria:**

**Given** multiple labs report inventory data to the Hub
**When** the coordinator views the inventory dashboard
**Then** they see a heat map of stock levels per lab per reagent category
**And** redistribution recommendations surface when one lab is stocked out while another has surplus
**And** the coordinator can batch orders to suppliers across labs
**And** individual lab managers see their own stock in Lab-Lite (Stories 52.2, 52.3)

**Admin Portal Surface:** Network-wide inventory visibility and coordinated procurement. Lab-Lite provides single-lab stock view and resupply request flow.

### Story 55.7: Lab Network & Outbreak Management

As a provincial health officer,
I want to manage multi-branch lab networks and activate outbreak response mode from the Admin Portal,
So that network operations and emergency responses are coordinated from a single command surface.

**Acceptance Criteria:**

**Given** a lab network with a main lab and satellite collection points
**When** the officer views the network dashboard
**Then** they see all locations with operational status, pending samples, stock levels, and staffing
**And** they can activate/deactivate Outbreak Mode for affected areas (Story 54.5)
**And** they can enroll Community Health Workers with simplified credentials (Story 54.2)
**And** Lab-Lite receives mode switches and adjusts operations accordingly

**Admin Portal Surface:** Network management, outbreak activation, CHW enrollment. Lab-Lite handles individual site operations and CHW collection mode.

### Story 55.8: Surveillance Alert Configuration

As a district health officer,
I want to configure which surveillance alerts I receive and set thresholds,
So that I get the right alerts for my jurisdiction without noise from irrelevant facilities.

**Acceptance Criteria:**

**Given** the Admin Portal alert configuration section
**When** the officer configures their alert preferences
**Then** they can: select which labs they monitor, set positivity rate thresholds per test category, configure notification channels (in-app, SMS, email), and review alert history
**And** Lab-Lite generates and transmits alerts per the configured rules (Story 50.3)

**Admin Portal Surface:** Alert recipient and threshold configuration. Lab-Lite generates alerts per rules.
