# Deferred Work

## Deferred from: code review of 1-1-monorepo-foundation-shared-contracts (2026-04-28)

- **D1: No Encounter/MedicationRequest TS interfaces alongside Zod schemas** — Pattern consistency issue. Patient has both `FhirPatient` interface and `FhirPatientSchema` Zod schema, but Encounter and MedicationRequest only have Zod schemas. Add interfaces when those resources are consumed.
- **D2: No test coverage for drug interaction safety invariants / Tier 1 append-only merge** — CLAUDE.md mandates testing for drug interaction code paths (BLOCKED, ALLERGY_MATCH, override-with-reason, check unavailable fallback) and Tier 1 append-only sync behavior. These are real requirements but belong to the sync/conflict resolution story, not this foundation story.

## Deferred from: code review of 1-2-hub-api-trpc-scaffolding (2026-04-28)

- **D3: Patients table missing `version_id`, `last_updated` FHIR Meta fields** — Pre-existing in migration 001. FHIR R4 Meta requires `lastUpdated` and `versionId`; patients table only has `created_at`/`updated_at`. Address when patient CRUD is implemented.
- **D4: Patients table missing `hlc_timestamp` column** — Pre-existing in migration 001. Sync-eligible entities need HLC timestamps for conflict resolution. Address with sync-engine integration.
- **D5: No `@ultranos/audit-logger` integration in hub-api** — CLAUDE.md requires audit logging for all PHI access. Not in scope for scaffolding; implement when CRUD endpoints are built.
- **D6: PHI columns (`diagnosis`, `reason_code`) no field-level encryption** — CLAUDE.md requires AES-256-GCM on PHI columns. Encryption is app-layer; implement when encounter CRUD is built.
- **D7: Case-transform destroys Date/Map/Set class instances** — `toSnakeCase`/`toCamelCase` treat all objects as plain records. Low risk with FHIR string-based data + superjson, but add type guards when `db.toRow`/`db.fromRow` are first used with complex types.
- **D8: Case-transform has no circular reference protection** — Recursive transform will stack overflow on cyclic objects. FHIR data is acyclic; add cycle detection if non-FHIR data flows through these helpers.

## Deferred from: code review of 1-3-pwa-identity-verification-dexie-persistence (2026-04-28)

- **D9: No audit logging for PHI access** — CLAUDE.md rule #6 violated. Neither Hub API `patient.search` nor PWA Dexie search emit audit events. Deferred to story 6-2.
- **D10: IndexedDB stores PHI unencrypted** — CLAUDE.md requires Web Crypto API AES-GCM wrapping IndexedDB with key-in-memory (wiped on tab close). `src/lib/db.ts` uses plain Dexie with no encryption layer. Patient names, identifiers, gender, birth dates stored in plaintext. Cross-cutting concern — warrants a dedicated encryption story using `packages/crypto/` helpers.
- **D11: bulkPut overwrites local data without conflict-aware merge** — `use-sync.ts:33` does blind LWW overwrite. Story 1.3 is read-only search; no clinical edits flow here. Deferred to sync-engine integration (Epic 6). When sync-engine lands, this cache-write path must route through tiered conflict resolution.
- **D12: No authentication on patient search endpoint** — `baseProcedure` appears unauthenticated; patient data queryable without auth. Depends on RBAC story 6-1.
- **D13: Layout hardcodes `dir="ltr"` with no RTL switching mechanism** — `lang="en" dir="ltr"` is hardcoded. RTL support is explicitly story 1-5 scope.
- **D14: Physical CSS properties used instead of logical for horizontal padding** — `px-4`, `py-3`, `px-5` etc. should use `ps-*`/`pe-*` for RTL. Story 1-5 handles RTL comprehensively.
- **D15: No rate limiting on Hub API patient search endpoint** — Endpoint can be called at high frequency to enumerate patient data. Infrastructure concern.
- **D16: No React error boundary wrapping patient search or encounter pages** — Dexie/IndexedDB errors (quota exceeded, version conflict) crash to white screen with no recovery.
- **D17: Unhandled promise rejection in revalidation `.then()` chain** — No `.catch()` on the fire-and-forget promise. Low risk since `revalidate` has internal try/catch.
- **D18: `patient.gender` rendered without null/undefined fallback** — DB could return null despite TypeScript type. Minor display issue.
- **D19: `getIdentifier()` called twice per patient row render** — Minor inefficiency; result should be stored in a variable.

## Deferred from: code review of 2-1-encounter-lifecycle-zustand-store (2026-04-28)

- **D20: sessionStorage per-tab HLC node ID / SSR concerns** — `getOrCreateNodeId()` uses `sessionStorage` (per-tab), so each tab generates a different HLC node ID. On SSR, `sessionStorage` is undefined, so a new UUID is generated each render. Pre-existing architectural decision about node identity scope.
- **D21: Dexie nested keypath index fragility** — `subject.reference` compound index works in Dexie 4.x but is fragile if objects are stored without the nested path. Monitor for issues.
- **D22: No RTL snapshot tests for encounter dashboard** — CLAUDE.md requires RTL snapshot tests for all patient-facing components. RTL testing infrastructure is a cross-cutting concern (story 1-5).
- **D23: No audit events emitted on encounter lifecycle** — `startEncounter`, `endEncounter`, `loadActiveEncounter` access PHI without `@ultranos/audit-logger` events. Audit infrastructure is story 6-2 scope. Consistent with D5, D9.
- **D24: No encryption on IndexedDB encounter storage** — Encounters stored cleartext in Dexie. Encryption-at-rest is a dedicated cross-cutting story. Consistent with D10.
- **D25: Allergy section missing from encounter dashboard** — CLAUDE.md requires allergies first/red/uncollapsed in clinician views. Allergy data/schema doesn't exist yet; belongs in clinical display story.

## Deferred from: code review of 2-2-soap-note-entry-subjective-objective (2026-04-28)

- **D26: Unencrypted SOAP notes in IndexedDB** — Cross-cutting concern consistent with D10/D24. All Dexie tables need encryption via `@ultranos/crypto`. Should be prioritized as a dedicated story.
- **D27: No sync status/tier field on SOAP ledger entries** — `SoapLedgerEntry` has no field for sync tier classification (Tier 2). Sync engine integration is a separate concern.
- **D28: Placeholder text not localizable** — SOAP note textarea placeholders are English-only. i18n infrastructure not yet built; cross-cutting concern.
- **D29: `PRACTITIONER_REF` hardcoded placeholder** — Auth session integration not yet available. Acknowledged with inline comment. Consistent with pre-existing pattern.
- **D30: FHIR ClinicalImpression status never transitions to `completed`** — No code path finalizes the SOAP note FHIR resource on encounter end. Out of scope for Subjective & Objective entry story.
- **D31: Allergy section missing from encounter dashboard** — Consistent with D25. CLAUDE.md requires allergies first, in red, never collapsed.
- **D32: `formatAge` produces negative age for future birth dates** — No guard for data entry errors in encounter dashboard. Pre-existing.
- **D33: Dexie version upgrades repeat all store definitions** — Maintenance-prone pattern in db.ts. Pre-existing.

## Deferred from: code review of 2-3-vital-signs-charting (2026-04-28)

- **D34: IndexedDB not encrypted / PHI persists on disk** — Vitals (weight, height, BP, temperature) stored in plaintext Dexie `observations` table. `beforeunload` only clears Zustand state, not IndexedDB. Consistent with D10/D24/D26. Encryption epic.
- **D35: No sync queue integration for vitals** — `persistObservations` writes to local Dexie only; observations never enqueued for upstream sync to Central Hub. Consistent with D27. Sync engine integration story.
- **D36: BMI observation lacks FHIR `derivedFrom` reference** — BMI Observation has no `derivedFrom` linking to source weight/height Observations. FHIR compliance enhancement, not in Story 2.3 ACs.

## Deferred from: code review of 2-4-diagnosis-entry-icd-10-search (2026-04-28)

- **D37: PHI in IndexedDB without encryption** — Conditions (diagnosis names, patient/encounter refs) stored in plaintext Dexie. Consistent with D10/D24/D26/D34. Encryption epic.
- **D38: No audit events on PHI access** — `addDiagnosis`, `removeDiagnosis`, `updateRank`, `loadConditions` emit no audit events. AuditLogger is server-side only (SupabaseClient); no client-side audit infrastructure exists. Consistent with D9/D23.
- **D39: Command palette trigger UX-DR4 not implemented** — DiagnosisSearch uses inline input only; no global keyboard shortcut to open. Story 2.5 (Clinical Command Palette) is the dedicated scope for this.
- **D40: `CodeableConceptSchema` coding array may allow empty** — If `common.schema.ts` permits an empty `coding` array, a Condition with no ICD-10 code passes validation. Depends on shared schema; verify when common.schema is next modified.
- **D41: Fuse singleton stale on Service Worker update** — `fuseInstance` is module-level and never invalidated. Background SW updates can replace `icd10_subset.json` while stale Fuse index persists. Cross-cutting SW lifecycle concern.
- **D42: `db.ts` no `versionchange` handler** — Open tabs block Dexie schema upgrades silently. Consistent with D33. Cross-cutting Dexie infrastructure concern.
- **D43: `encounter` required in FhirConditionSchema but FHIR R4 marks it 0..1 optional** — Keep required for now (scoped to encounter-diagnosis). Relax to `.optional()` when problem-list condition support is added.

## Deferred from: code review of 2-5-clinical-command-palette-ux-dr4 (2026-04-28)

- **D44: Hardcoded practitioner reference `Practitioner/current-user`** — encounter-dashboard.tsx:37. Static placeholder attributed to all encounters regardless of logged-in user. Consistent with D29. Address with auth session integration.
- **D45: Patient `nameLocal` displayed without null-safety fallback** — encounter-dashboard.tsx:192. Renders empty if `_ultranos.nameLocal` is missing; no indication of absent data. Consistent with D18.
- **D46: Autosave delay 300ms aggressively short for low-resource environments** — encounter-dashboard.tsx:73,93. Both SOAP and vitals autosave debounce at 300ms, causing high I/O on low-resource devices. Pre-existing from vitals/SOAP stories.
- **D47: `flushAutosave`/`flushVitalsAutosave` not awaited before `endEncounter`** — encounter-dashboard.tsx:141-144. Flush calls are synchronous but may be async; encounter may finalize before last edits persist. Potential data loss.
- **D48: `useCommandPalette` hook registers duplicate listeners if reused by multiple components** — use-command-palette.ts. Currently single consumer; lift to context/store if second consumer added.
- **D49: Missing `Prescribe` command in command palette** — AC2 requires `>Prescribe` but Prescribe UI doesn't exist until Epic 3. Add to CLINICAL_COMMANDS when prescription section ships.
- **D50: Palette not globally available / not in Navbar** — Spec locates trigger in Navbar.tsx but Navbar doesn't exist yet. All commands target EncounterDashboard sections. Globalize when Navbar is built and commands span multiple views.
