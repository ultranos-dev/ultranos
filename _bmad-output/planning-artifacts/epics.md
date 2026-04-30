---
stepsCompleted: [1, 2, 3, 4]
workflowType: 'epics-and-stories'
status: 'complete'
completedAt: '2026-04-28'
inputDocuments:
  - docs/ultranos_master_prd_v3.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
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

## Epic List

### Epic 1: Ecosystem Foundation & Identity
Establish the Hub-and-Spoke connectivity, initialize the shared sync engine contracts, and enable the core "Patient Identity" workflow.
**FRs covered:** FR1, FR11, FR13, FR14, FR15, FR18

### Epic 2: Clinical Encounter & SOAP Charting
Build the core "OPD Lite" clinician experience for charting encounters.
**FRs covered:** FR2, FR3, FR4, FR5

### Epic 3: E-Prescribing & Medication Safety
Implement the prescribing lifecycle and clinical safety gates.
**FRs covered:** FR6, FR7, FR8, FR10

### Epic 4: Pharmacy Operations
Enable the pharmacist's fulfillment workflow via the standalone `pharmacy-lite-pwa` spoke app.
**FRs covered:** FR9

### Epic 5: Patient Health Passport & Consent
Build the patient-facing "Health Passport" mobile experience.
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
As a system architect, I want to extract all pharmacy fulfillment functionality from `opd-lite-pwa` into a standalone `pharmacy-lite-pwa` application, so that pharmacists have an independently deployable spoke app that integrates with the ecosystem exclusively via `hub-api`.

**Acceptance Criteria:**
- **Given** the existing pharmacy components in `opd-lite-pwa`
- **When** the extraction is complete
- **Then** `apps/pharmacy-lite-pwa/` exists as a standalone Next.js 15 PWA (`@ultranos/pharmacy-lite-pwa`)
- **And** all pharmacy fulfillment components, stores, services, and tests are located in the new app
- **And** clinician-side prescription components remain in `opd-lite-pwa` unchanged
- **And** the pharmacy app communicates with the Hub API via tRPC (no spoke-to-spoke dependencies)
- **And** all existing pharmacy tests pass in the new location with zero regressions in `opd-lite-pwa`

> **Architecture Decision (2026-04-30):** Pharmacy operations MUST be a standalone spoke app (`pharmacy-lite-pwa`), not embedded in the clinician PWA. Each spoke integrates via `hub-api` only. Online-only for now; offline pharmacy operations are a future enhancement.

## Epic 5: Patient Health Passport & Consent
Build the patient-facing "Health Passport" mobile experience.

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

## Epic 11: Internationalization & UX Resilience
Provide a world-class, accessible experience for all regional users.

### Story 11.1: Global RTL & i18n Framework
As a multilingual user, I want the entire application to respect RTL rules so that I can work natively in Arabic or Dari.

**Acceptance Criteria:**
- **Given** the application
- **When** the locale is switched to Arabic/Dari
- **Then** the layout mirrors (RTL) and all physical CSS properties are replaced by logical ones (e.g., padding-inline-start) (FR18)

### Story 11.2: Resilience & Error Recovery
As a user, I want the application to recover gracefully from storage errors so that I never lose data due to a browser quota issue.

**Acceptance Criteria:**
- **Given** a local storage error (e.g., IndexedDB failure)
- **When** it occurs
- **Then** a React Error Boundary catches the crash and offers a "Safe Mode" recovery path
- **And** critical data is backed up to memory until storage is restored

