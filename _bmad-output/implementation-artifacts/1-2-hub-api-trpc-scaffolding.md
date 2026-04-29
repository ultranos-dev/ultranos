# Story 1.2: Hub API & tRPC Scaffolding

## User Story
As a system administrator, I want a centralized Hub API so that clinical data can be validated and synchronized across the ecosystem.

## Status: done

## Acceptance Criteria
- [x] `apps/hub-api` is a Next.js App Router project.
- [x] tRPC v11 router is configured with a base health-check procedure.
- [x] Supabase client is initialized with environment variables.
- [x] Database client uses a middleware to transform `camelCase` JS objects to `snake_case` Postgres records.
- [x] Initial migration script for FHIR Patient and Encounter tables is provided.

## Technical Requirements & Constraints
- **Framework:** Next.js 14+ (App Router).
- **API:** tRPC v11 (latest).
- **Database:** Supabase (PostgreSQL).
- **Security:** Middleware must verify JWT from Supabase Auth (placeholders allowed for now).

## Developer Guardrails
- **Structure:** Procedures should be grouped by domain (e.g., `patientRouter`, `encounterRouter`).
- **Persistence:** Ensure all HLC timestamps are stored as strings to preserve precision.

## Tasks/Subtasks
- [x] 1. Convert hub-api from Fastify to Next.js App Router project
  - [x] 1a. Replace package.json dependencies (remove Fastify, add Next.js)
  - [x] 1b. Create next.config.js and App Router directory structure
  - [x] 1c. Update tsconfig.json for Next.js
- [x] 2. Set up tRPC v11 router with health-check procedure
  - [x] 2a. Install tRPC v11 dependencies
  - [x] 2b. Create tRPC initialization (context, router, procedures)
  - [x] 2c. Create health-check procedure
  - [x] 2d. Create domain router stubs (patientRouter, encounterRouter)
  - [x] 2e. Wire tRPC to Next.js App Router API route
- [x] 3. Initialize Supabase client with environment variables
  - [x] 3a. Create server-side Supabase client utility
  - [x] 3b. Integrate into tRPC context
- [x] 4. Create camelCase↔snake_case database middleware
  - [x] 4a. Create case transformation utility functions
  - [x] 4b. Create tRPC middleware for automatic case conversion
- [x] 5. Create initial FHIR Encounter migration script
- [x] 6. Write tests
  - [x] 6a. Tests for case transformation utilities
  - [x] 6b. Tests for tRPC health-check procedure
  - [x] 6c. Tests for Supabase client initialization
  - [x] 6d. Tests for JWT auth middleware placeholder
- [x] 7. Run validations (lint, typecheck, full test suite)

## Dev Notes
- Existing hub-api is a Fastify server — converting to Next.js App Router per story ACs and architecture doc (tRPC v11 over Next.js).
- Existing Fastify code (auth, patients, services) will be migrated in later stories; this story is scaffolding only.
- Patient table already exists in supabase/migrations/001_fhir_schema.sql; Encounter table needs to be added.
- Architecture doc specifies: tRPC v11 for API, Supabase for DB, domain-grouped routers.
- FHIR R4 Meta fields: use `lastUpdated`, `versionId` in meta; `createdAt` in `_ultranos` namespace.
- HLC timestamps stored as strings per Developer Guardrails.
- JWT auth placeholder allowed per Technical Requirements.

## Dev Agent Record

### Implementation Plan
- Removed Fastify server code (app.ts, server.ts, plugins/, routes/, services/, types.d.ts)
- Replaced with Next.js 15 App Router project (package.json, next.config.js, tsconfig.json, src/app/)
- Created tRPC v11 initialization with context carrying Supabase client and user info
- Created root router aggregating health, patient (stub), and encounter (stub) domain routers
- Created health-check procedure that verifies Supabase connectivity
- Created Supabase server client singleton with env var validation
- Created camelCase↔snake_case transformation utilities and tRPC middleware (`dbProcedure`)
- Created protectedProcedure with JWT auth placeholder (throws UNAUTHORIZED when user is null)
- Created FHIR Encounter migration (004) aligned with shared-types Encounter schema
- Used superjson as tRPC transformer for proper Date/BigInt serialization
- Wired tRPC to Next.js via fetchRequestHandler at /api/trpc/[trpc]

### Debug Log
- No issues encountered during implementation

### Completion Notes
- 33 tests passing across 4 test files (22 case-transform, 5 health, 4 supabase, 2 auth)
- 94 total tests passing across full monorepo (zero regressions)
- Encounter migration includes all FHIR R4 fields from shared-types schema
- HLC timestamps stored as TEXT (string) per Developer Guardrails
- Domain routers grouped per Developer Guardrails (patientRouter, encounterRouter)
- JWT auth is a placeholder — protectedProcedure checks ctx.user presence
- dbProcedure auto-applies camelCase↔snake_case conversion for any DB procedure
- Old Fastify code preserved in git history (commit 08ce5ce)

## File List
- apps/hub-api/package.json (replaced — Fastify deps removed, Next.js + tRPC v11 added)
- apps/hub-api/next.config.js (new)
- apps/hub-api/tsconfig.json (replaced — Next.js App Router config)
- apps/hub-api/vitest.config.ts (new)
- apps/hub-api/src/app/layout.tsx (new)
- apps/hub-api/src/app/page.tsx (new)
- apps/hub-api/src/app/api/trpc/[trpc]/route.ts (new — tRPC API handler)
- apps/hub-api/src/trpc/init.ts (new — tRPC context, procedures, middleware)
- apps/hub-api/src/trpc/routers/_app.ts (new — root router)
- apps/hub-api/src/trpc/routers/health.ts (new — health-check procedure)
- apps/hub-api/src/trpc/routers/patient.ts (new — domain router stub)
- apps/hub-api/src/trpc/routers/encounter.ts (new — domain router stub)
- apps/hub-api/src/lib/supabase.ts (new — Supabase server client)
- apps/hub-api/src/lib/case-transform.ts (new — camelCase↔snake_case utilities)
- apps/hub-api/src/__tests__/case-transform.test.ts (new — 22 tests)
- apps/hub-api/src/__tests__/health.test.ts (new — 5 tests)
- apps/hub-api/src/__tests__/supabase.test.ts (new — 4 tests)
- apps/hub-api/src/__tests__/auth-middleware.test.ts (new — 2 tests)
- supabase/migrations/004_fhir_encounters.sql (new — FHIR Encounter table)
- apps/hub-api/src/app.ts (deleted — old Fastify app)
- apps/hub-api/src/server.ts (deleted — old Fastify server)
- apps/hub-api/src/types.d.ts (deleted — old Fastify type augmentation)
- apps/hub-api/src/plugins/ (deleted — old Fastify plugins)
- apps/hub-api/src/routes/ (deleted — old Fastify routes)
- apps/hub-api/src/services/ (deleted — old Fastify services)

### Review Findings
- [x] [Review][Patch] camelToSnake mangles uppercase-starting strings and consecutive capitals [case-transform.ts:14] — FIXED
- [x] [Review][Patch] Health check exposes Postgres error codes to unauthenticated callers [health.ts:17] — FIXED
- [x] [Review][Patch] Encounters migration missing RLS enablement and service_role policy [004_fhir_encounters.sql] — FIXED
- [x] [Review][Patch] caseTransformMiddleware refactored from tRPC middleware to Supabase query boundary helpers (Option B) [init.ts, supabase.ts] — FIXED
- [x] [Review][Defer] Patients table missing `version_id`, `last_updated` FHIR Meta fields — deferred, pre-existing (migration 001)
- [x] [Review][Defer] Patients table missing `hlc_timestamp` column — deferred, pre-existing (migration 001)
- [x] [Review][Defer] No `@ultranos/audit-logger` integration in hub-api — deferred, future story
- [x] [Review][Defer] PHI columns (`diagnosis`, `reason_code`) no field-level encryption — deferred, app-layer concern for CRUD stories
- [x] [Review][Defer] Case-transform destroys Date/Map/Set class instances — deferred, low risk with FHIR string data
- [x] [Review][Defer] Case-transform has no circular reference protection — deferred, FHIR data is acyclic

## Change Log
- 2026-04-28: Story started, structure added, status set to in-progress
- 2026-04-28: Implemented all tasks — Next.js App Router, tRPC v11, Supabase client, case transform middleware, Encounter migration. 33 tests passing, 94 total monorepo. Status set to review.
- 2026-04-28: Code review complete. 4 patches applied (camelToSnake acronym handling, health check error leakage, encounters RLS, case transform moved to DB boundary). 6 deferred. 35 tests passing. Status set to done.

## Context Links
- Architecture: [architecture.md](../planning-artifacts/architecture.md)
- Story 1.1: [1-1-monorepo-foundation-shared-contracts.md](1-1-monorepo-foundation-shared-contracts.md)
