---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
inputDocuments:
  - docs/ultranos_master_prd_v3.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/wireframes-lofi.md
  - docs/findings.md
  - docs/implementation_plan.md
  - docs/progress.md
  - docs/task_plan.md
workflowType: 'architecture'
project_name: 'Ultranos'
date: '2026-04-28'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._


## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
Ultranos operates as a decentralized healthcare ecosystem. The core functional requirement is allowing GPs to conduct full consultations, prescribe medications (with drug interaction checks), and generate QR prescriptions completely offline. Pharmacists must be able to verify and invalidate these prescriptions globally to prevent fraud. Patients require a low-literacy, multilingual Health Passport to view their records and manage consent.

**Non-Functional Requirements:**
- **Offline Reliability:** Zero-latency UI resolution with background queuing.
- **Security & Compliance:** AES-256 encryption at rest (SQLCipher for Android, key-in-memory IndexedDB for PWA), immutable hash-chained audit logs, and FHIR R4 schema alignment.
- **Performance:** 500ms max response for local patient search, <50ms for optimistic UI state changes.

**Scale & Complexity:**
- **Primary domain:** Distributed Full-Stack (Offline-First Mobile/PWA + Cloud Hub)
- **Complexity level:** Enterprise / High (SaMD Regulatory classification)
- **Estimated architectural components:** 6 core nodes (Hub API, Sync Engine, OPD Lite Mobile, OPD Lite, Patient Lite Mobile, Pharmacy Lite)

### Technical Constraints & Dependencies

- **Data Residency:** Cloud infrastructure must support deployment in specific regional boundaries (e.g., UAE, KSA) without cross-border PHI transmission.
- **FHIR R4:** The underlying database must map directly to FHIR R4 resources without complex transformation layers.
- **Edge AI Limitations:** The offline device footprint is constrained (e.g., target 2GB RAM Android devices); offline AI must rely on lightweight predictive macros and a subset (top 500) of the drug interaction database.

### Cross-Cutting Concerns Identified

- **Asynchronous Sync & Conflict Resolution:** Implementing Hybrid Logical Clocks (HLC) and tiered conflict resolution (Append-only for clinical data, Timestamp-based for operational data).
- **Universal State Management:** Managing optimistic UI updates and global sync indicators consistently across both web and native platforms.
- **Internationalization (i18n):** Deep RTL support and culturally-tuned Edge TTS integration.
- **Authentication & Consent:** Unified session management across heterogeneous clients with differing offline capabilities.


## Starter Template & Framework Evaluation

### Primary Technology Domain
The project is already initialized as a **Turborepo Monorepo** using `pnpm` and **Supabase** for the backend infrastructure. The ecosystem consists of distributed Full-Stack applications (Offline-First Mobile/PWA + Cloud Hub).

### Selected Application Starters

Given the existing Turborepo foundation, we will scaffold the individual applications using the following frameworks:

**1. PWA Applications (OPD Lite, Pharmacy Lite, Lab Portal)**
- **Framework:** Next.js (App Router)
- **Rationale:** Native integration with Turborepo, excellent PWA support (`next-pwa`), and highly optimized for rich, dense web interfaces required by clinical users.

**2. Mobile Native Applications (OPD Lite Mobile, Patient Lite Mobile)**
- **Framework:** Expo (React Native)
- **Rationale:** Allows sharing of business logic and UI tokens with the Next.js web apps. Supports native module plugins for SQLCipher (required for AES-256 local encrypted PHI) and robust offline background sync tasks.

**3. Internal Shared Packages**
- **Framework:** standard TypeScript libraries compiled via `tsup`.
- **Rationale:** We must isolate the Sync Engine (Hybrid Logical Clocks), the Design System (Wise-inspired tokens), and the FHIR R4 TypeScript types into shared packages consumed by both Next.js and Expo.

### Architectural Decisions Provided by this Stack:
- **Language & Runtime:** TypeScript strictly enforced across all apps and packages. Node.js backend.
- **Styling Solution:** Vanilla CSS / CSS Modules or Tailwind CSS (pending final decision), wrapped in our custom Wise-inspired tokens.
- **Code Organization:** Monorepo pattern (Apps in `apps/`, shared logic in `packages/`).


## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Edge Data Architecture (PWA & Mobile)
- Sync Engine API & Communication Layer
- Frontend State Management for Optimistic UI

### Data Architecture

**Edge Database (PWA): Dexie.js (v4.4.x)**
- *Rationale:* Provides a clean, promise-based API over IndexedDB without enforcing rigid, proprietary sync paradigms. This flexibility is essential for building our custom Hybrid Logical Clock (HLC) append-only sync engine.

**Edge Database (Mobile): expo-sqlite with sqlcipher**
- *Rationale:* A hard requirement to achieve the AES-256 encryption at rest mandated by the PRD for mobile devices, ensuring HIPAA/MENA regulatory compliance for offline PHI storage.

### Frontend Architecture

**State Management: Zustand (v5.x)**
- *Rationale:* Ultranos is a Local-First application where the local database is the source of truth. Zustand provides the lightweight, unopinionated foundation needed to build a custom `useOptimisticSync` hook. This hook will simultaneously update the in-memory store (achieving the <50ms UI update requirement) and queue the action in the local Dexie/SQLite database.

### API & Communication Patterns

**API Layer: tRPC (v11) over Node API (`hub-api`)**
- *Rationale:* Direct-to-database connections (e.g., Supabase JS Client) bypass necessary middle-tier logic. tRPC enables a robust backend validation layer necessary for the Drug Interaction Checker (SaMD) and AI safety macros. It also provides seamless, end-to-end TypeScript safety, ensuring our FHIR R4 schemas are strictly enforced across the Edge clients and the Hub API.

### Decision Impact Analysis

**Cross-Component Dependencies:**
- The choice of tRPC and Zustand means our shared Turborepo packages (`packages/types`, `packages/sync-engine`) must be rigorously defined first, as they form the contract between the Dexie/SQLite local stores and the `hub-api` validation layer.


## Implementation Patterns & Consistency Rules

### Pattern Categories Defined
**Critical Conflict Points Identified:** 4 key areas where AI agents could make diverging choices (Naming, Formatting, Structure, Communication).

### Naming Patterns

**Database Naming Conventions (Supabase/PostgreSQL):**
- **Tables and Columns:** MUST use strictly `snake_case` (e.g., `patient_records`, `encounter_id`). No `camelCase` at the database level.
- **Indexes:** MUST follow the pattern `idx_[table]_[column]` (e.g., `idx_patients_national_id`).

**Code Naming Conventions (React / Next.js / Expo):**
- **Components & Files:** MUST use `PascalCase` for React components and their filenames (e.g., `OptimisticButton.tsx`, `PatientCard.tsx`).
- **Utility Functions:** MUST use `camelCase` (e.g., `formatFhirDate.ts`).
- **Types/Interfaces:** MUST use `PascalCase` and preferably be prefixed or clearly named without an `I` (e.g., `PatientResource`, not `IPatient`).

### Format Patterns

**Data Exchange Formats (Dates & Enums):**
- **Dates/Times:** MUST be transmitted and stored as UTC **ISO 8601 Strings** (e.g., `2024-04-28T12:00:00Z`). Epoch timestamps are forbidden to maintain strict FHIR R4 compatibility.
- **Enums/Status Codes:** MUST use uppercase snake string literals instead of numbers (e.g., `STATUS_ACTIVE`, `PRESCRIPTION_FULFILLED`) for database readability and debugging.
- **FHIR R4 `Meta` Fields:** All resource `meta` objects MUST use FHIR R4 canonical field names: `lastUpdated` (ISO 8601 instant of last change) and `versionId` (version identifier). The `createdAt` timestamp is an Ultranos extension and MUST be placed in `_ultranos.createdAt`, never in `meta`. Do NOT use `createdAt`/`updatedAt` as `meta` field names.

### Communication Patterns

**Sync Engine Action Naming:**
- **Namespacing:** Offline actions queued into Dexie/SQLite MUST use the `domain:action` namespace format. Example: `{ action: "encounter:prescribe_medication", payload: {...}, hlc: "..." }`. This ensures robust routing in the backend API layer.

**State Management Patterns (Zustand):**
- **Store Structure:** Every domain-specific Zustand store MUST include a standard `syncStatus` object (`{ isPending: boolean, isError: boolean, lastSyncedAt: string }`). This ensures the "Global Sync Pulse" UI component functions identically across all features.

### Enforcement Guidelines
**All AI Agents MUST:**
- Apply `snake_case` mapping when writing to Supabase, but use `camelCase` in the TypeScript UI logic.
- Ensure all `DateTime` UI components explicitly parse UTC ISO strings before displaying localized time.
- Implement a route-level Error Boundary that triggers the "Stale Data / Offline Mode" high-contrast yellow banner on failures, strictly avoiding blank crash screens.


## Project Structure & Boundaries

### Complete Project Directory Structure

```text
ultranos/
├── apps/
│   ├── hub-api/                 # Node.js tRPC Server (Existing Hub)
│   │   ├── src/api/root.ts      # tRPC router entry
│   │   └── src/services/        # Safety gates, FHIR validation & Audit verification
│   ├── opd-lite/                # Next.js Desktop App (Clinicians)
│   │   ├── src/app/             # App Router pages
│   │   ├── src/store/           # <--- Zustand Store (Clinician UI State)
│   │   │   ├── usePatientStore.ts
│   │   │   └── useSyncStore.ts  # Handles "Global Sync Pulse" UI state
│   │   └── src/lib/db.ts        # Dexie.js (Offline Persistence)
│   ├── opd-lite-mobile/         # Expo Android App (Clinicians) [SCAFFOLDED — future development]
│   │   ├── src/screens/         # Native layouts
│   │   ├── src/store/           # <--- Zustand Store (Mobile Native UI)
│   │   └── src/lib/db.ts        # Expo SQLite/SQLCipher (Encrypted Persistence)
│   ├── pharmacy-lite/           # Next.js PWA (Pharmacists — standalone spoke)
│   │   ├── src/app/             # App Router pages
│   │   ├── src/components/pharmacy/  # Scanner, Fulfillment, Label, SyncPulse
│   │   ├── src/stores/          # <--- Zustand Store (Pharmacy Fulfillment State)
│   │   └── src/lib/             # Prescription verify, dispense sync, status client
│   ├── patient-lite-mobile/     # Expo Mobile App (Patients)
│   └── lab-lite/                # Next.js PWA (Lab Technicians — near-online, push-only)
│       ├── src/app/             # App Router pages
│       ├── src/components/      # Upload, verification, queue UI
│       └── src/lib/             # LOINC mappings, upload queue, Dexie
├── packages/
│   ├── sync-engine/             # Shared HLC & Append-only ledger logic
│   ├── ui-kit/                  # Wise-inspired design tokens & React components
│   ├── shared-types/            # FHIR R4 TS Definitions & Schemas
│   ├── audit-logger/            # Cryptographic hashing & audit trail logic
│   └── config-typescript/       # Shared tsconfig configurations
├── supabase/
│   ├── migrations/              # FHIR-compliant SQL migrations
│   └── functions/               # Cloud Edge AI functions (Generative SOAP, etc.)
├── turbo.json                   # Monorepo task orchestration
└── pnpm-workspace.yaml          # PNPM monorepo definition
```

### Architectural Boundaries

**API Boundaries:**
- The **Hub API** is the sole validator for the ecosystem. All sync queues from edge clients must pass through tRPC endpoints for clinical safety and audit-log integrity checks.
- Direct database access via Supabase Client is restricted to read-only non-sensitive metadata.

**Component & State Boundaries:**
- **Zustand** is the mandatory state management layer for all interactive apps.
- UI state and Persistence state are decoupled: The UI reads from Zustand, while the `sync-engine` package coordinates writes between Zustand and the local database (`Dexie`/`SQLite`).

**Data Boundaries:**
- **Local-First:** Edge clients operate on local data first. The Sync Engine manages eventual consistency using Hybrid Logical Clocks (HLC).
- **PHI Isolation:** Personal Health Information is stored only in the `opd-lite` clients (encrypted) and the central Hub. No PHI should reside in shared browser storage across different users.

### Requirements to Structure Mapping

- **Offline Consultation:** `apps/opd-lite-*` + `packages/sync-engine`.
- **E-Prescribing:** `apps/opd-lite-*` (Write) + `apps/pharmacy-lite` (Read/Verify).
- **Clinical Safety Gates:** `apps/hub-api/src/services/safety`.
- **Wise Visual Design:** `packages/ui-kit`.
- **Regulatory Audit:** `packages/audit-logger`.


## Privacy, Localization & Offline Security

### Data Privacy & PHI Minimization
- **PWA Persistence Policy:** In strict adherence to PRD v3.0, the Desktop PWA MUST NOT persist unencrypted PHI on disk. 
- **Key-in-Memory Strategy:** The encryption key for the local Dexie.js store must reside only in RAM. Upon session termination (logout or tab close), the key is wiped, rendering the local IndexedDB data inaccessible.
- **Mobile Retention:** The Expo Android app is permitted to retain an encrypted cache for up to 90 days or 1,000 records (as per PRD), utilizing **SQLCipher** with a key protected by the device's Biometric/Hardware keystore.

### Localization & RTL Patterns
- **Web Framework:** **`next-intl`** will be used for all Next.js applications to handle routing and translations.
- **Mobile Framework:** **`expo-localization`** combined with **`i18next`** will handle native localization.
- **Mirroring Rule:** The UI-kit must support a global `dir` context. When the language is set to Arabic or Dari, the entire layout must mirror (RTL) at the framework level, not just text alignment.

### Offline Authentication
- **Mechanism:** Encrypted JWT Persistence.
- **PWA Implementation:** The Supabase session token is stored in `sessionStorage` (wiped on tab close) to prevent persistent access on shared clinician computers.
- **Mobile Implementation:** The token is stored in **Expo SecureStore**, allowing clinicians to re-authenticate offline via biometrics/PIN if the token has not expired.
- **Validation:** The `sync-engine` must verify the local token signature before allowing any offline clinical actions to be queued.


## Architecture Validation Results

### Coherence Validation ✅
The integration of **Zustand** for in-memory state, **Dexie/SQLite** for local persistence, and **tRPC** for backend validation creates a coherent, type-safe pipeline that meets the "Zero-Latency" and "Offline-First" requirements. The use of a Turborepo ensures that shared logic (HLC, Audit Logging, FHIR types) is reused across all apps, preventing synchronization logic drift.

### Requirements Coverage Validation ✅
- **Offline Consultation:** Fully architected via local storage and the HLC Sync Engine.
- **Privacy & Security:** Met via key-in-memory PWA encryption, SQLCipher mobile storage, and hash-chained audit trails.
- **RTL/Localization:** Explicitly supported via `next-intl` and `expo-localization` with mandatory mirroring patterns.
- **Clinical Safety:** Enforced by the tRPC middle-tier validation before sync commitment.

### Implementation Readiness Validation ✅
The architecture is exhaustive. We have defined the "Physical Structure" (Turborepo tree), the "Logical Patterns" (Zustand -> DB -> Sync), the "Communication Layer" (tRPC), and the "Privacy/Security" constraints.

### Gap Analysis Results
- **Status:** All critical and important gaps identified in Step 6 have been resolved with the addition of the Privacy, Localization, and Offline Auth refinements.
- **Minor Note:** Development of the specific regional deployment scripts for UAE/KSA cloud providers is deferred to the infrastructure implementation phase.

### Architecture Completeness Checklist
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Enterprise/SaMD)
- [x] Technical stack fully specified (Next.js, Expo, Zustand 5, tRPC 11, Dexie 4)
- [x] Naming conventions established (snake_case DB, PascalCase UI)
- [x] Sync & Communication patterns defined (HLC + namespaced actions)
- [x] Privacy & PHI constraints documented (Key-in-memory PWA)
- [x] Localization & RTL frameworks locked in
- [x] Complete directory structure mapped to requirements

### Architecture Readiness Assessment
**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** HIGH

### Implementation Handoff
AI Agents must prioritize the initialization of the `packages/shared-types` and `packages/sync-engine` as the first implementation stories, as these form the foundational contracts for the entire ecosystem.
