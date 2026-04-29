# Story 1.1: Monorepo Foundation & Shared Contracts

## User Story
As a developer, I want the Turborepo monorepo and shared clinical packages initialized so that I can build apps against a unified FHIR R4 and Sync contract.

## Status: done

## Acceptance Criteria
- [x] Turborepo is initialized with pnpm workspaces.
- [x] `packages/shared-types` exports Zod schemas for FHIR R4 Patient, Encounter, and MedicationRequest.
- [x] `packages/sync-engine` implements a Hybrid Logical Clock (HLC) for timestamping.
- [x] `packages/ui-kit` defines Wise-inspired typography (Inter) and HSL color tokens.
- [x] Root scripts for `dev`, `build`, and `lint` are functional across the monorepo.

## Technical Requirements & Constraints
- **Monorepo:** Use Turborepo with pnpm.
- **FHIR:** Use `zod` for schema validation. Follow FHIR R4 structure exactly.
- **Sync:** HLC should be a standalone utility class in `packages/sync-engine`.
- **UI Kit:** Use Vanilla CSS or CSS Modules with CSS Variables for tokens.

## Developer Guardrails
- **Naming:** Packages must be prefixed with `@ultranos/` (e.g., `@ultranos/shared-types`).
- **Dependencies:** Use `workspace:*` for internal package references.
- **Linting:** Shared ESLint/Prettier config in `packages/config-eslint`.

## Tasks/Subtasks
- [x] 1. Verify Turborepo + pnpm workspace configuration is correct
- [x] 2. Add Zod to shared-types; create Zod schemas for FHIR R4 Patient, Encounter, MedicationRequest
  - [x] 2a. Install zod dependency
  - [x] 2b. Create Patient Zod schema
  - [x] 2c. Create Encounter Zod schema
  - [x] 2d. Create MedicationRequest Zod schema
  - [x] 2e. Update barrel exports
- [x] 3. Create packages/sync-engine with Hybrid Logical Clock (HLC)
  - [x] 3a. Initialize package scaffold (package.json, tsconfig)
  - [x] 3b. Implement HLC utility class
  - [x] 3c. Export from barrel
- [x] 4. Create packages/ui-kit with Wise-inspired tokens
  - [x] 4a. Initialize package scaffold
  - [x] 4b. Define Inter typography CSS variables
  - [x] 4c. Define HSL color tokens
  - [x] 4d. Export token files
- [x] 5. Create packages/config-eslint with shared ESLint/Prettier config
- [x] 6. Verify root scripts (dev, build, lint) work across all packages
- [x] 7. Write and run tests for shared-types, sync-engine, ui-kit

## Dev Notes
- Existing shared-types uses plain TS interfaces. AC requires Zod schemas — added Zod schemas alongside existing interfaces.
- Follow FHIR R4 resource structure: https://hl7.org/fhir/R4/resourcelist.html
- HLC per architecture docs: used for offline-first sync timestamping.
- UI Kit uses CSS Variables (not Tailwind) per Technical Requirements.
- All packages prefixed @ultranos/.
- **FHIR R4 Meta Decision (2026-04-28):** All `meta` objects must use FHIR R4 canonical names (`lastUpdated`, `versionId`). `createdAt` moves to `_ultranos.createdAt`. Applies to Patient, Encounter, MedicationRequest schemas and TS interfaces (patient.ts, practitioner.ts, consent.ts). Documented in CLAUDE.md, architecture.md, and epics.md.

## Dev Agent Record

### Implementation Plan
- Added Zod to shared-types, created schemas aligned with existing TS interfaces and FHIR R4 spec
- Built sync-engine as standalone package with HLC class (now(), receive(), serialize/deserialize/compare helpers)
- Built ui-kit with CSS custom properties for typography (Inter) and HSL color palette (Wise-inspired)
- Built config-eslint with ESLint flat config (typescript-eslint) and Prettier config
- Added root eslint.config.js and prettier.config.js importing from @ultranos/config-eslint
- Added "type": "module" to root package.json
- Cleaned stale .d.ts artifacts from shared-types/src/

### Debug Log
- hub-api has pre-existing build errors (TS6059 rootDir, JWT type issues) — not in scope for this story
- Stale .d.ts files in shared-types/src/ caused lint false positives — cleaned them

### Completion Notes
- 61 tests passing across 3 packages (30 shared-types, 18 sync-engine, 13 ui-kit)
- All packages build and lint cleanly
- Zod schemas follow FHIR R4 spec with Ultranos extensions (_ultranos namespace)
- Meta fields use FHIR R4 canonical names (lastUpdated, versionId); createdAt in _ultranos
- Shared FHIR building-block schemas (CodingSchema, CodeableConceptSchema, etc.) in common.schema.ts
- Zod schemas use z.nativeEnum() for existing TS enums (AdministrativeGender, PrescriptionStatus)
- interactionCheckResult is required; override reason enforced when BLOCKED
- birthDate validated with FHIR R4 date regex; birthYearOnly defaults to false
- HLC has counter overflow guard (MAX_COUNTER=99999) and NaN validation on deserialize
- CodeableConceptSchema enforces at least coding or text
- UI kit tokens.ts mirrors all tokens from tokens.css including letterSpacing, borderRadius, shadows, transitions
- All packages have lint scripts for turbo task execution
- HLC supports now(), receive() (merge), serialize/deserialize, and compare operations
- Config-eslint enforces consistent-type-imports, no-unused-vars, no-console

## File List
- packages/shared-types/src/fhir/common.schema.ts (new — shared FHIR building-block schemas)
- packages/shared-types/src/fhir/patient.schema.ts (new)
- packages/shared-types/src/fhir/encounter.schema.ts (new)
- packages/shared-types/src/fhir/medication-request.schema.ts (new)
- packages/shared-types/src/fhir/patient.ts (modified — Meta renamed to FHIR R4 names)
- packages/shared-types/src/fhir/practitioner.ts (modified — Meta renamed to FHIR R4 names)
- packages/shared-types/src/fhir/consent.ts (modified — Meta renamed to FHIR R4 names)
- packages/shared-types/src/index.ts (modified — added schema exports)
- packages/shared-types/package.json (modified — added zod, vitest, test script)
- packages/shared-types/src/__tests__/patient.schema.test.ts (new)
- packages/shared-types/src/__tests__/encounter.schema.test.ts (new)
- packages/shared-types/src/__tests__/medication-request.schema.test.ts (new)
- packages/sync-engine/package.json (new)
- packages/sync-engine/tsconfig.json (new)
- packages/sync-engine/src/hlc.ts (new)
- packages/sync-engine/src/index.ts (new)
- packages/sync-engine/src/__tests__/hlc.test.ts (new)
- packages/ui-kit/package.json (new)
- packages/ui-kit/tsconfig.json (new)
- packages/ui-kit/src/tokens.css (new)
- packages/ui-kit/src/tokens.ts (new)
- packages/ui-kit/src/index.ts (new)
- packages/ui-kit/src/__tests__/tokens.test.ts (new)
- packages/config-eslint/package.json (new)
- packages/config-eslint/index.js (new)
- packages/config-eslint/prettier.config.js (new)
- eslint.config.js (new)
- prettier.config.js (new)
- package.json (modified — added type:module, @ultranos/config-eslint devDep)

### Review Findings

- [x] [Review][Decision] F1: DECIDED — Rename to FHIR R4 `Meta` field names (`lastUpdated`, `versionId`); move `createdAt` to `_ultranos`. Documented in CLAUDE.md, architecture.md, epics.md, and affected stories.
- [x] [Review][Decision] F2: DECIDED — Make `interactionCheckResult` required; `UNAVAILABLE` as the safe default when check wasn't performed.
- [x] [Review][Decision] F3: DECIDED — Loosen `period.start` to optional; accept both date and datetime formats to match FHIR R4.
- [x] [Review][Decision] F4: DECIDED — Defer max-drift guard to sync/conflict resolution story. Flagged as priority.
- [x] [Review][Patch] P1: HLC counter overflow breaks 5-digit serialization format — FIXED: added MAX_COUNTER guard
- [x] [Review][Patch] P2: `deserializeHlc` accepts NaN silently — FIXED: added NaN validation
- [x] [Review][Patch] P3: Patient `birthDate` no format validation — FIXED: added FhirDateSchema regex
- [x] [Review][Patch] P4: `birthYearOnly` no default — FIXED: added .default(false)
- [x] [Review][Patch] P5: `interactionOverrideReason` not required when BLOCKED — FIXED: added .refine() conditional validation
- [x] [Review][Patch] P6: Zod schemas use z.enum() instead of z.nativeEnum() — FIXED: switched to z.nativeEnum()
- [x] [Review][Patch] P7: Packages lack `lint` scripts — FIXED: added "lint": "eslint ." to all packages
- [x] [Review][Patch] P8: Shared schemas duplicated — FIXED: extracted to common.schema.ts
- [x] [Review][Patch] P9: tokens.ts missing tokens — FIXED: added letterSpacing, borderRadius, shadows, transitions
- [x] [Review][Patch] P10: CodeableConceptSchema allows empty — FIXED: added .refine() requiring coding or text
- [x] [Review][Defer] D1: No Encounter/MedicationRequest TS interfaces alongside Zod schemas — deferred, pattern consistency not blocking for story 1.1
- [x] [Review][Defer] D2: No test coverage for drug interaction safety invariants / Tier 1 append-only merge — deferred, sync conflict resolution is a separate story

## Change Log
- 2026-04-28: Story started, structure added, status set to in-progress
- 2026-04-28: Implemented all tasks — Zod schemas, HLC, ui-kit tokens, config-eslint, tests. 45 tests passing. Status set to review.
- 2026-04-28: Code review complete — 4 decision-needed, 10 patch, 2 deferred, 6 dismissed.
- 2026-04-28: All decisions resolved, all patches applied. 61 tests passing. Status set to done.

## Context Links
- Architecture: [architecture.md](../planning-artifacts/architecture.md)
- PRD: [prd.md](../planning-artifacts/prd.md)
- UX: [ux-design-specification.md](../planning-artifacts/ux-design-specification.md)
