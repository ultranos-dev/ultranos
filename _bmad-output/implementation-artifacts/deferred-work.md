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

## Deferred from: code review of 3-1-medication-search-prescription-entry (2026-04-28)

- **D51: PHI stored unencrypted in IndexedDB** — `medications` table written via `db.medications.put()` with no encryption wrapper. Systemic gap across all Dexie tables. Consistent with D10/D24/D26/D34/D37.
- **D52: Hardcoded practitioner reference 'Practitioner/current-user'** — Pre-existing pattern in encounter-dashboard.tsx:41. Consistent with D29/D44.
- **D53: Formulary uses internal codes (urn:ultranos:formulary/RX001) instead of standard terminology** — `medications_subset.json` uses internal system. Standard FHIR practice is RxNorm/SNOMED/ATC codes. Address when real formulary integration is built.
- **D54: formatAge produces negative age for future birthDate** — Pre-existing code in encounter-dashboard.tsx:26-37. Consistent with D32.
- **D55: No allergy display in prescription context** — CLAUDE.md requires allergies first/red/uncollapsed in clinician views. No allergy data schema exists yet. Consistent with D25/D31.
- **D56: No audit events on prescription create, read, or cancel** — No client-side audit infrastructure exists. Consistent with D9/D23/D38.
- **D57: No duplicate medication detection** — Same medication can be prescribed multiple times. Needs clinical workflow input; duplicates can be clinically valid.
- **D58: clearPhiState does not clear IndexedDB medications table** — Systemic gap; no store clears its Dexie table on clearPhi. Solve at DB layer.
- **D59: Search uses static JSON import instead of Dexie vocabulary store** — Functionally works for 100 items but won't scale. Formulary will grow to thousands; needs Dexie vocabulary table with indexed queries and runtime update support.

## Deferred from: code review 2 of 3-1-medication-search-prescription-entry (2026-04-29)

- **W3: No drug interaction test coverage** — CLAUDE.md requires tests for CONTRAINDICATED, ALLERGY_MATCH, override-with-reason, and "check unavailable" fallback. Blocked by Story 3.2 (drug interaction checker). Add tests when 3.2 ships.
- **D2: Static "Interaction check unavailable" banner, not contextual per-prescription** — Story 3.2 will redesign interaction UX; static banner adequate until then. When 3.2 ships, review must enforce contextual per-medication interaction warnings.

## Deferred from: code review of 3-2-local-drug-drug-interaction-checker (2026-04-29)

- **W1: Audit log missing SHA-256 hash chaining** — CLAUDE.md Rule #6 requires append-only audit with SHA-256 hash chaining. `interactionAuditService.ts` does simple IndexedDB add with no hash computation. Architectural pattern not yet implemented anywhere in the project. Address in Story 6-2 (immutable cryptographic audit logging).
- **W2: Stale `pendingPrescriptions` race condition on rapid adds** — `handleAddPrescription` captures `pendingPrescriptions` from React closure at render time. Two rapid adds may use stale medication list for the second check. Requires ref-based latest state or architectural change.
- **W3: Dexie v7 repeats all existing store definitions / no migration rollback** — Version 7 stores block repeats all prior table definitions. Maintenance-prone pattern consistent with D33. Dexie doesn't support downgrades natively.
- **W4: Canceled prescription deduplication logic fragile** — `loadPrescriptions` deduplicates by splitting on `:cancelled:`. Pre-existing in prescription-store.ts, not introduced by this change.
- **W5: No test for "check unavailable" fallback path** — No test exercises the code path where `checkInteractions()` throws and the UNAVAILABLE flow is triggered. CLAUDE.md testing requirements list this as mandatory.
- **D1: Override data stored in `_ultranos` instead of FHIR `detectedIssue`** — Spec says use FHIR `detectedIssue` field, but implementation uses `_ultranos` extension namespace. No sync layer or Hub consumer exists yet. Add FHIR DetectedIssue mapping when Hub sync is built.
- **D2: Interaction check only runs against pending prescriptions, not patient's active medications** — AC #1 and Task 2 require checking against MedicationStatement (chronic meds). MedicationStatement data model doesn't exist yet. Wire into interaction checker when MedicationStatement is implemented. Critical clinical safety item.
- **D4: Interaction check compares by display name, not medication code/ID** — Curated 100-med formulary has controlled names. Switch to code-based matching when formulary scales or external drug data is integrated.

## Deferred from: code review of 3-4-global-prescription-invalidation-check (2026-04-29)

- **D2: Offline mode completely blocks pharmacist** — No offline dispensing path exists. Pharmacist can only "Try Again" when Hub is unreachable. CLAUDE.md says every workflow must work offline. Requires sync-engine integration to queue local MedicationDispense records. Address in Epic 6.
- **P2: No audit events on PHI access** — `getStatus` and `complete` endpoints access/modify prescription data without emitting audit events. `@ultranos/audit-logger` has no hub-api integration yet. Consistent with D5/D9/D23/D38. Address in Story 6-2.
- **P3: QR signature never verified** — `parsePrescriptionIds` extracts IDs from QR payload without verifying Ed25519 signature. Forged QR codes accepted for status lookup. Ed25519 verify function not yet available in the codebase. Address in dedicated security hardening story.
- **P6: `new Date()` used instead of HLC timestamps** — `dispensed_at` and `meta_last_updated` use wall-clock `new Date().toISOString()`. The `hlc_timestamp` column exists but is not populated. HLC generation is not wired to hub-api server-side. Address with sync-engine integration.
- **W1: `created_at` column not in `_ultranos` namespace** — `005_medication_requests.sql` has `created_at` as top-level column. CLAUDE.md requires `createdAt` in `_ultranos` namespace. Consistent naming convention gap across all migrations (D3, D10, etc.).
- **W2: FHIR Meta field naming inconsistency** — `meta_last_updated` / `meta_version_id` in migration instead of FHIR canonical `lastUpdated` / `versionId`. DB-layer snake_case is reasonable but API responses don't map back to FHIR `meta` block. Consistent with existing tables.

## Deferred from: code review of 4-2-medication-fulfillment-labeling (2026-04-29)

- **D1: Drug interaction / allergy check before dispensing** — Pharmacy trusts prescriber-side checks (Epic 3). Full interaction re-check at dispensing requires MedicationStatement data (patient's full active med list) which doesn't exist yet. Consistent with 3-2 review D2. Revisit when MedicationStatement is implemented.
- **W1: No duplicate-dispensing guard** — Same prescription can be dispensed multiple times via `createMedicationDispense` with no idempotency check against existing dispense records in IndexedDB. Needs design discussion: should deduplication live in the mapper, store, or DB constraint?
- **W2: Dexie schema version repetition risk** — Each `version(N).stores()` call must redeclare all tables. Omitting a table in a future version silently drops it. Pre-existing pattern (D33).
- **W3: `startReview` phase transition unused in UI** — `fulfillment-store.ts` defines `startReview()` transitioning to `'reviewing'` phase, but `FulfillmentChecklist.tsx` never invokes it or checks the phase. Dead code or incomplete feature.
- **W4: `scannedAt` uses `new Date().toISOString()` instead of HLC** — Pre-existing pattern consistent with D62.
- **W5: `whenHandedOver` and `meta.lastUpdated` use wall-clock time** — FHIR-facing timestamps in `medication-dispense.ts` use `new Date().toISOString()`, not HLC. Pre-existing pattern consistent with P6/D62.
- **W6: `dir="auto"` may cause LTR/RTL layout inconsistency** — Direction determined by first strong character in content. Latin-script medication names force LTR container direction in otherwise RTL interfaces.

## Deferred from: code review of 4-1-pharmacy-scan-load (2026-04-29)

- **D60: Practitioner key cache has no TTL/staleness** — Revoked/suspended practitioner keys remain trusted in the local IndexedDB cache indefinitely. No expiry check on `cachedAt`. Architectural concern — needs key lifecycle management (revocation list sync or TTL-based revalidation).
- **D61: `fetchAndCachePractitionerKey` overwrites cached data via `put`** — `db.practitionerKeys.put()` silently overwrites existing entries with no conflict detection or audit trail. If Hub returns different metadata for the same key (bug or compromise), local trust state changes with no record. Related to key lifecycle architecture.
- **D63: No audit events emitted for PHI access in pharmacy scan/verify flow** — Neither verification, fraud detection, nor fulfillment load emit audit events. AuditLogger is server-side only (SupabaseClient + Node.js crypto). Consistent with D9/D23/D38/D56. Address in Story 6-2 when client-side audit infrastructure is built.
- **D62: `new Date().toISOString()` used instead of HLC timestamps** — `fulfillment-store.ts:scannedAt` and `prescription-verify.ts:cachedAt` use wall-clock time. If these stores ever participate in sync, they'll need HLC. Consistent with D20/P6.

## Deferred from: code review of 4-3-real-time-dispensing-sync (2026-04-29)

- **W1: No retry/drain mechanism for sync queue** — `syncQueue` entries written by `enqueueForRetry()` are never processed. No background worker, service worker hook, or `online` event listener exists to drain the queue. Queued dispenses never reach the Hub.
- **W2: SyncPulse doesn't reflect queued state after page refresh** — `SyncPulse` reads only in-memory Zustand `syncStatus`. After page refresh, shows green while `syncQueue` IndexedDB table may have pending entries.
- **W3: Browser refresh mid-dispensing loses batch state** — In-memory fulfillment store resets on refresh. Partially-completed batch (some items persisted to IndexedDB, others not) has no resume mechanism. Pharmacist may re-scan and double-dispense.
- **W4: No deduplication on sync queue** — `enqueueForRetry()` always generates a new UUID via `crypto.randomUUID()`. Same dispense can be queued multiple times if retry logic is added later.
- **W5: Drug interaction check not enforced in recordDispense** — The existing `complete` mutation checks `interaction_check` before dispensing; `recordDispense` bypasses this. Pre-existing decision: pharmacy trusts prescriber-side checks (D1 from 4-2). Revisit when MedicationStatement is implemented.
- **W6: Local audit doesn't log sync attempt or result** — `dispenseAuditService.ts` logs dispense creation but not the Hub sync attempt, failure, or queue-for-retry event. Consistent with D9/D23/D38. Address in Story 6-2.

## Deferred from: code review of 3-3-cryptographically-signed-qr-generation (2026-04-29)

- **W1: Audit log failure silently swallowed** — Three catch blocks in encounter-dashboard.tsx swallow audit log errors with empty bodies. No client-side audit retry/queue exists. Consistent with D9/D23/D38. Address in Story 6-2 (immutable cryptographic audit logging).
- **W2: Interaction check only against pending prescriptions** — `activeMedNames` built from `pendingPrescriptions` only, not patient's full active medication list. MedicationStatement data model doesn't exist yet. Consistent with 3-2 review D2. Critical clinical safety item — wire into interaction checker when MedicationStatement is implemented.
- **W3: `asNeededBoolean` not in Zod DosageSchema** — `compress-prescription.ts:58` checks `d?.asNeededBoolean` but DosageSchema doesn't define it. Zod strips unknown keys, so PRN flag is always omitted from QR payload. Add `asNeededBoolean: z.boolean().optional()` to DosageSchema when PRN workflow is built.

## Deferred from: code review of 5-1-patient-profile-qr-identity (2026-04-29)

- **D64: No i18n/localization framework** — All Health Passport UI strings hardcoded in English. Broader i18n effort beyond this story's scope.
- **D65: `birthYearOnly` field outside `_ultranos` namespace** — Type definition issue in shared-types. Not introduced by this change; address at shared-types level.
- **D66: No dark mode variant in consumer theme** — Consumer theme has light-mode HSL only. Not in scope for Story 5.1.
- **D67: `qrcode.react` not used for PWA as specified** — Only `react-native-qrcode-svg` used. Depends on PWA architecture decisions.
- **D68: No QR render performance test (<100ms budget)** — Developer guardrail verification. Nice-to-have.
- **D69: Mobile SQLCipher migration needed** — expo-secure-store has 2KB iOS limit. Create follow-up story to implement SQLCipher for Health Passport mobile storage.
- **D70: ECDSA-P256 QR signing** — Requires `@ultranos/crypto` mobile infrastructure. Implement when crypto package supports mobile key generation/signing.

## Deferred from: code review of 5-2-medical-history-timeline-low-literacy-ui (2026-04-29)

- **D71: Memory store lifecycle not tied to session** — `offline-store.ts:15,131`. Module-level `Map` persists across patient switches on web. `wipeMemoryStore()` exists but isn't called on logout/patient switch. Pre-existing architecture concern consistent with D10/D58.
- **D72: Medications never flagged as sensitive** — `fhir-humanizer.ts:215-228`. `humanizeMedication` always returns `isSensitive: false`. Antiretrovirals, psychiatric meds display with full names. Needs RxNorm-based sensitivity mapping with clinical input. Privacy gap.
- **D73: SecureStore 2048-byte limit for medical history** — Already tracked as D69. Consolidate into SQLCipher migration story.

## Deferred from: code review of 5-3-data-sharing-consent-management (2026-04-29)

- **W1: consumerStyles import from @/theme/consumer unverified** — PrivacySettingsScreen.tsx imports `consumerStyles` from `@/theme/consumer`, a path not present in the diff. Likely a Story 5.2 dependency. Verify the import resolves when both stories are committed.
- **W2: Hardcoded pixel values in StyleSheet instead of spacing tokens** — PrivacySettingsScreen.tsx styles use raw pixel values (`gap: 4`, `marginBottom: 12`, `paddingVertical: 12`) instead of `consumerSpacing` tokens consistently. RTL-safe but inconsistent with token-based design.
- **W3: Module-level HLC with hardcoded nodeId 'health-passport'** — `useConsentSettings.ts:369` creates `new HybridLogicalClock('health-passport')` at module scope. All devices share the same nodeId, producing ambiguous HLC timestamps in multi-device sync scenarios. Architectural concern beyond this story; consistent with D20.
- **D2: consent.sync has no authorization check** — Any authenticated user can forge consent for any patient via `consent.sync`. No `ctx.user.sub === input.grantorId` check. Defer to Story 6-1 (RBAC). Consistent with D12.
- **D3: No emergency/break-glass bypass in consent enforcement** — `enforceConsentMiddleware` has no provision for emergency access. `GrantorRole.EMERGENCY_OVERRIDE` exists as an enum but is never checked. Needs dedicated spec-level design for emergency access model (audit trail, time-bounded override, abuse prevention).
