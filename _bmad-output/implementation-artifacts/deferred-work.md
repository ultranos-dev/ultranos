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

## Deferred from: code review of 16-6-hub-api-drug-interaction-check-endpoint (2026-05-11)

- **W1: `@ultranos/audit-logger` undeclared in hub-api `package.json`** — Pre-existing: AuditLogger is imported across many hub-api files without being declared in `package.json`. Works via pnpm workspace hoisting but will break if hoisting behavior changes. Add `"@ultranos/audit-logger": "workspace:*"` to dependencies.
- **W2: Module-level `cachedMap` in drug-db checker has no invalidation strategy** — The interaction vocabulary cache in `checker.ts` persists in process memory indefinitely. If `vocab_interactions` is updated without restarting the server, stale data is served. Requires an ops-level cache invalidation mechanism (e.g., `invalidateCache()` call after vocab sync).
- **W3: No pagination on `getInteractions()` — loads entire vocab table** — `supabase-drug-adapter.ts` `getInteractions()` does `select(...)` with no limit. Large interaction databases could cause memory pressure. Consider pagination or streaming.

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

## Deferred from: code review of 7-1-pwa-dexie-encryption-key-in-memory (2026-04-29)

- **D74: Patient names in cleartext as indexed fields** — `_ultranos.nameLocal` and `_ultranos.nameLatin` remain unencrypted in IndexedDB for Dexie query support. Hashing breaks fuzzy search. Create dedicated search-encryption story (encrypted Fuse.js or homomorphic approach).
- **D75: Key derivation from JWT/PIN not implemented** — Current `generateSessionKey()` creates a random key. Page refresh = permanent local data loss. Accepted because sync engine will re-populate from Hub on re-auth. Implement PBKDF2 derivation from Supabase JWT or user PIN in a follow-up story.
- **W1: `update()` read-modify-write not atomic** — Concurrent updates cause lost writes via read-decrypt-modify-encrypt-put outside a Dexie transaction. Pre-existing architectural limitation of proxy approach.
- **W2: No guard preventing `_enc` as indexed field name** — If `_enc` is added to `indexedFields`, `setNestedValue` overwrites the ciphertext blob with cleartext. No current risk but no guard.
- **W3: Key wipe mid-flight TOCTOU** — `wipe()` during async decrypt/encrypt operations leaves system in inconsistent state. Inherent to async Web Crypto + module singleton design.
- **W4: `beforeunload` unreliable in mobile PWA** — Mobile browsers may not fire the event (tab crashes, OS kills). Key is GC'd on page destruction anyway, so no real security impact.
- **W5: No key versioning or rotation mechanism** — No key-ID embedded in encrypted payloads. Key rotation makes old records permanently unreadable with generic errors. Related to JWT/PIN derivation decision.
- **W6: Corrupted base64 throws untyped browser errors** — `decryptPayload` throws raw `DOMException` or `OperationError` on corrupted input. No domain-specific error wrapping.
- **W7: `soapLedger.createdAt` not in indexed fields** — Encrypted into `_enc` blob. Future code assuming `createdAt` is queryable will get `undefined`.
- **W8: Redundant encryption of indexed field values inside `_enc` blob** — Full record encrypted including indexed fields, which also exist in cleartext. Larger ciphertext, no security issue (AES-256-GCM resists known-plaintext attacks).

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
- **W3: Module-level HLC with hardcoded nodeId 'patient-lite-mobile'** — `useConsentSettings.ts:369` creates `new HybridLogicalClock('patient-lite-mobile')` at module scope. All devices share the same nodeId, producing ambiguous HLC timestamps in multi-device sync scenarios. Architectural concern beyond this story; consistent with D20.
- **D2: consent.sync has no authorization check** — Any authenticated user can forge consent for any patient via `consent.sync`. No `ctx.user.sub === input.grantorId` check. Defer to Story 6-1 (RBAC). Consistent with D12.
- **D3: No emergency/break-glass bypass in consent enforcement** — `enforceConsentMiddleware` has no provision for emergency access. `GrantorRole.EMERGENCY_OVERRIDE` exists as an enum but is never checked. Needs dedicated spec-level design for emergency access model (audit trail, time-bounded override, abuse prevention).

## Deferred from: code review of 6-1-role-based-access-control-rbac (2026-04-29)

- **W1: No audit logging of authorization failures** — Neither `enforceResourceAccess`, `roleRestrictedProcedure`, nor `protectedProcedure` emit audit events on denial. Spec guardrail defers to Epic 8 audit trail.
- **W2: No audit on `medication.getStatus` (PHI read)** — Returns medication_display, dispensed_at without audit event. Pre-existing. Consistent with D5/D9/P2.
- **W3: No audit on `medication.complete` (PHI write)** — Updates prescription status without audit event. Pre-existing. Consistent with D5/D9/P2.
- **W4: No audit on `patient.search` (PHI read)** — Returns patient identity data without audit event. Pre-existing. Consistent with D9.
- **W5: PostgREST injection via unsanitized `%`/`_` wildcards in patient.search** — `sanitizeFilterValue` strips `,.*()\\` but not SQL LIKE wildcards. Pre-existing in patient.ts.
- **W6: `pharmacistRef` in `recordDispense` is client-supplied** — Should come from `ctx.user`; enables false attribution. Pre-existing in medication router.
- **W7: `recordDispense` doesn't check drug interactions** — Prescription with `interaction_check === 'BLOCKED'` can be dispensed through `recordDispense`. CLAUDE.md rule #3. Pre-existing. Consistent with W5 from 4-3.
- **W8: JWK cache never invalidated on key rotation** — Module-level `_cachedJwk` has no TTL. Key rotation requires process restart.
- **W9: `recordDispense` creates dispense record before prescription validation** — Insert happens before prescription lookup; orphan records on non-existent prescriptions. Pre-existing.
- **W10: `patientRef` in `recordDispense` not validated against prescription** — Client-supplied `patientRef` could differ from actual patient on prescription. Pre-existing.
- **W11: Any user with MedicationRequest access can look up any prescription by ID** — No patient-scoping on `getStatus`. Pre-existing.

## Deferred from: code review of 7-3-hub-api-field-level-encryption (2026-04-30)

- **No audit events emitted for PHI decrypt/access** — Pre-existing gap across all routers. Consistent with D5/D9/D23/D38/P2. Address in Story 6-2 (audit infrastructure).
- **No key rotation mechanism** — Spec explicitly says "for future key rotation." The `v1:` version prefix is in place. Implementation deferred by design.
- **`getFieldEncryptionKeys()` has no authorization guard** — Master key is global, not scoped to clinician session. AC3 intent enforced at router level via `protectedProcedure` + RBAC. Architectural concern for future hardening.
- **Blind index hashes unsanitized query input** — `hashNationalId(input.query)` uses the raw query while stored values may have been hashed from a different representation. Low risk with current usage patterns.
- **No audit log on patient search** — `patient.search` returns identity data (names, birth dates, national ID hashes) but emits no audit event. Pre-existing gap across routers. Address in Story 6-2.
- **Read-modify-write cycle could corrupt data via placeholder** — If decryption fails, `[Encrypted Content]` placeholder is returned. If the row is subsequently updated, original ciphertext is permanently destroyed. Needs update-path safeguards.
- **Blind index brute-forceable for low-entropy national IDs** — Single HMAC-SHA256 with no iteration/stretching. National IDs have fixed-format numeric patterns. Consider HKDF or iterated construction for future hardening.
- **Blanket catch in `decryptField` swallows tampered data without alerting** — AES-GCM auth tag verification failure silently returns placeholder. No logging or alerting. Needs audit infra (D5/D9).

## Deferred from: code review of 7-2-mobile-sqlcipher-migration (2026-04-29)

- **W1: deletePassphrase() leaves DB file encrypted with lost key** — Exported utility in `mobile-key-service.ts` deletes the SecureStore passphrase without re-keying the SQLCipher database. Any caller using this for key rotation without first re-keying the DB will make all patient data permanently irrecoverable. Not called in current change; intended for future key rotation story.
- **W2: No `requireAuthentication: true` on SecureStore for Android** — `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` is iOS-only. Android needs `requireAuthentication: true` on expo-secure-store to enforce hardware-backed biometric binding at the OS keystore level. Deferred because adding it changes SecureStore access patterns (every read triggers biometric prompt). Revisit when auth architecture is finalized.
- **W3: isUnlocked hook state can diverge from actual DB singleton state** — `useDatabaseUnlock` tracks `isUnlocked` in React state, but the DB singleton is module-level. If another code path calls `closeDatabase()` directly (e.g., logout handler), the hook state is stale. Requires context provider or event-based sync pattern. Architectural concern, not a bug in current scope.

## Deferred from: code review 2 of 7-2-mobile-sqlcipher-migration (2026-04-30)

- **W3: SecureStore `requireAuthentication: true` not set** — Pre-existing deferred item D2. App-level biometric check accepted for now; OS-level enforcement deferred to auth architecture finalization.
- **W4: `closeDatabase()` doesn't wait for in-flight DB operations** — Close can interrupt active queries from other code paths. Architectural concern requiring operation tracking. Pre-existing design (extends W2).
- **W5: Timer cleanup on unmount doesn't lock database** — Component unmount leaves DB open with `authenticated = true`. Same root cause as W2 (lifecycle/singleton coupling).
- **W6: `deletePassphrase()` can permanently destroy encryption key** — Not called in current code paths. Pre-existing deferred W1.
- **W7: Background lock timer race on return to foreground** — setTimeout callback may already be queued when `active` event fires. Low probability, lock is idempotent.
- **W8: `getOrCreateDbPassphrase` TOCTOU race on concurrent first-launch calls** — Two calls could generate different passphrases. Extremely unlikely in single-threaded JS with single entry point.
- **W9: No schema migration/versioning strategy beyond `user_version = 1`** — Version is write-only, never read. Forward-looking concern for future schema changes.
- **W10: `INSERT OR REPLACE` can overwrite newer SQLCipher data** — Only possible if migration runs after app is already in use, which normal flow prevents.

## Deferred from: code review of 1-6-opd-lite-mobile-scaffold (2026-04-30)

- **W1: RTL support absent in scaffold UI** — Scaffold placeholder uses hardcoded styles with no RTL consideration. Acceptable for placeholder; address when active development begins.
- **W2: No SQLCipher configured** — CLAUDE.md requires SQLCipher for Android. Explicitly out of scope per story — scaffold only.
- **W3: Hardcoded English strings** — No i18n infrastructure. Accept at scaffold stage; implement with active development.
- **W4: No expo-status-bar** — Uses RN StatusBar directly instead of expo-status-bar. Replace when building real screens.
- **W5: No app.json icon/splash/bundleId** — Minimal Expo config. Add assets when active development begins.

## Deferred from: code review of 4-4-pharmacy-lite-pwa-extraction (2026-04-30)

- **W1: `syncQueue` deduplication — no idempotency guard on retry** — `enqueueForRetry()` generates new UUID per call. Same dispense can be queued multiple times. Needs Hub-side dedup or local dedup guard. Pre-existing pattern from opd-lite (consistent with W4 from 4-3).
- **W2: `fetchAndCachePractitionerKey` cache key mismatch (base64 normalization)** — Cache `put` uses `data.publicKey` (Hub response) as primary key, but lookup queries by `bundle.pub` (QR). Different base64 encodings (standard vs URL-safe, padding differences) could cause infinite fetch-and-cache loop. Requires Hub API response format investigation.
- **W3: Non-standard Tailwind classes in FulfillmentChecklist** — `rounded-pill`, `bg-pill-green`, `text-pill-text` in FulfillmentChecklist.tsx:149. Not standard Tailwind; likely defined in shared UI kit theme. Pre-existing from opd-lite.

## Deferred from: code review of 1-7-lab-lite-pwa-scaffold (2026-04-30)

## Deferred from: code review of 12-1-lab-credentialing-technician-auth (2026-04-30)

- **W1: Migration file written manually instead of Supabase MCP tools** — Process concern. `006_lab_tables.sql` created as raw SQL file instead of via `mcp__plugin_supabase_supabase__apply_migration`. Migration content is correct.
- **W2: No RTL snapshot tests for login page** — CLAUDE.md requires RTL snapshots for patient-facing components. Lab login page has no RTL tests. Cross-cutting concern (Story 1-5/11-1).
- **W3: No inactivity timeout on lab-lite session** — CLAUDE.md requires 30-min inactivity re-auth for clinical views. No session timeout mechanism in lab-lite. Cross-cutting session management concern.
- **W4: Audit hash chain race condition on concurrent requests** — `AuditLogger.emit()` does read-then-write on chain hash without serialization. Two concurrent events fork from same parent hash. Pre-existing in `packages/audit-logger/src/logger.ts`.
- **W6: Replace client-callable `reportAuthEvent` with server-side auth event capture** — Current `reportAuthEvent` uses `baseProcedure` (unauthenticated) and is inherently spoofable. Rate limiting + actorId validation applied as interim fix. Long-term: remove client-callable endpoint entirely and use Supabase Auth webhooks to capture auth events (login, MFA, failures) server-side. This eliminates the spoofing surface completely. Requires Supabase webhook configuration and a dedicated webhook handler endpoint.
- **W5: x-forwarded-for header trust without proxy validation** — `reportAuthEvent` trusts `x-forwarded-for` directly. IP is hashed before storage, but attribution is spoofable without trusted proxy config. Infrastructure-level concern.

- **Missing `@ultranos/crypto` and `@ultranos/audit-logger` dependencies** — AC #2 specifies only shared-types, sync-engine, ui-kit. Crypto and audit-logger will be required when Epic 12 implements PHI-touching workflows (result upload, patient verification).
- **`dir="auto"` without explicit RTL locale handling** — All sibling spoke apps use the same pattern. Will be addressed in Epic 11 (RTL/i18n framework).
- **Hardcoded `lang="en"` without i18n** — Same pattern across all spoke apps. Epic 11 scope.
- **Google Fonts CDN in offline PWA context** — Inter loaded via CDN will fail on first offline load. Address when service worker infrastructure is added.
- **No PWA manifest or service worker** — Story is a scaffold; PWA infrastructure will be added in a future story.
- **No CSP or security headers in `next.config.js`** — No sibling app sets these either. Should be addressed as cross-cutting infrastructure.

## Deferred from: code review of 12-2-restricted-patient-verification (2026-04-30)

- **No rate limiting on `verifyPatient` endpoint** — Allows PHI enumeration by brute-forcing National IDs. An authenticated LAB_TECH could iterate National ID patterns and harvest firstName + age. Pre-existing architectural gap — `reportAuthEvent` has rate limiting but `verifyPatient` does not. Consistent with D15.

## Deferred from: code review of 12-3-result-upload-metadata-tagging (2026-04-30)

- **No server-side MIME type / magic byte verification** — File type trusted from client input. Would require magic byte detection library. ClamAV covers some cases when configured.

## Deferred from: code review of 12-5-upload-queue-offline-resilience (2026-04-30)

- **W1: Audit events silently dropped with no local fallback** — `queue-audit.ts` fire-and-forget pattern swallows all fetch failures with no local retry queue, console warning, or fallback storage. Systemic across all lab-lite audit reporting (auth + queue events). Consistent with D9/D23/D38. Address when client-side audit infrastructure is built.
- **D1: Adopt `@ultranos/audit-logger` across lab-lite** — All lab-lite audit events (auth + queue) use raw `fetch` instead of the canonical `@ultranos/audit-logger` with SHA-256 hash chaining. Consistent pattern across lab-lite but violates CLAUDE.md rule #6. Migrate all lab-lite audit calls to audit-logger in a dedicated story. Reason: systemic gap, not a single-story regression.

## Deferred from: code review of 12-4-notification-dispatch (2026-04-30)

- **`list` endpoint QUEUED→SENT update error silently ignored** — If the bulk status update fails in notification.ts:141-144, the client sees SENT but DB says QUEUED. Pre-existing error-handling pattern.
- **No exponential backoff retry mechanism implemented** — AC 7 requires retry with exponential backoff on dispatch failure. DB columns exist (`retry_count`, `next_retry_at`) but no scheduled job or retry logic populates them. Requires infrastructure for scheduled background jobs.
- **BACKOFFICE escalation has no delivery path** — 48h escalation creates notifications with `recipient_ref='BACKOFFICE'` but no user or UI exists to consume them. Dead-letter notifications. Defer until back-office dashboard story is created.
- **Deferred virus scan has no background processor** — Files stored with `pending` virus_scan_status but no mechanism to scan them later. Separate story/infrastructure needed.
- **File content stored in TEXT column — blob storage recommended** — 20MB+ encrypted base64 in PostgreSQL TEXT causes table bloat. Should use object storage (S3/Supabase Storage) with only a reference in the DB.
- **Memory pressure from base64-in-JSON pattern** — Single request holds ~47MB in memory (base64 + buffer + encrypted). Would require streaming upload architecture.
- **`updated_at` column has no trigger — will never update** — Pre-existing pattern across project migrations. No ON UPDATE trigger or application-level update logic.

## Deferred from: code review of 12-6-ai-metadata-extraction-ocr (2026-04-30)

- **W1: No rate limiting on analyzeUpload** — Authenticated LAB_TECH can call analyzeUpload at high frequency, consuming server memory and OCR API costs. Pre-existing pattern — no other authenticated lab endpoints have rate limiting either. Address with infrastructure-level rate limiting.
- **W2: Frontend OcrSuggestion type not from shared package** — `trpc.ts` defines its own `OcrSuggestion` interface structurally identical to `ocr.ts`. Type drift undetected by TypeScript. Pre-existing pattern — lab-lite uses raw fetch, not shared types.
- **W3: Keyword substring false positives in LOINC matching** — Keywords like "hepatic" match inside "nonhepatic"/"prehepatic", "lipid" matches inside "hyperlipidemia". Known limitation of keyword-based matching; mitigated by confirmation gate (technician must confirm all OCR suggestions).

## Deferred from: code review of 7-4-practitioner-key-lifecycle-management (2026-05-01)

- **AC2: No caller invokes revalidateKey when cache is stale** — `getCachedKey` returns `stale: true` but no verification flow calls `revalidateKey()`. Revalidation function exists but is not wired into any active code path. Requires hook/UI integration in pharmacy and OPD verification flows.
- **AC3: KRLSyncService not integrated with sync engine queue** — `KRLSyncService` class exists with applySnapshot/addRevocation methods, but no code subscribes to Hub push events, registers with the sync queue, or triggers KRL refresh on reconnect. Requires sync-engine internals integration work.
- **KRL not stored as Bloom filter/hash list per guardrail** — Developer Guardrail says "compact Bloom filter or sorted list of hashes to minimize sync bandwidth." Implementation stores full base64 key strings. Optimization for scale — acceptable at current revocation volumes.
- **OPD Lite missing KRL/cache implementation** — AC4 says "All scanners (OPD/Pharmacy) immediately reject." Only Pharmacy Lite has the KRL guard. OPD Lite scope is a separate story.
- **Revocation gap window between revokeKey and KRL propagation** — Inherent in async sync architecture. Between Hub revocation and KRL sync to edge devices, a revoked key could still verify locally. Mitigated by 24h TTL on cache + priority-1 sync classification.

## Deferred from: code review of 7-3b-mandatory-encryption-wiring (2026-05-01)

- **Encryption key cached indefinitely — no rotation support** [field-encryption.ts:50] — `_cachedKeys` is never cleared. Key rotation requires process restart. By design — `v1:` prefix in place for future rotation story.
- **medication.ts has 5 raw .insert()/.update() calls bypassing db.\* helpers** [medication.ts] — No SENSITIVE_FIELDS currently written, but inconsistent with mandatory-encryption pattern. Should use `db.toRowRaw()` for audit trail.
- **lab.ts diagnostic_reports/lab_result_files inserts bypass db helpers** [lab.ts:597,612] — `encrypted_content` manually encrypted via `encryptField()`. `diagnostic_reports` insert has no SENSITIVE_FIELDS. Both should use `db.toRowRaw()` for consistency.
- **practitioner-key.ts has 3 raw Supabase calls not using db.\* helpers** [practitioner-key.ts] — No SENSITIVE_FIELDS involved. Consistency gap.
- **notification.ts list read uses manual camelCase mapping instead of db.fromRowRaw()** [notification.ts:70-86] — Write paths correctly use `db.toRowRaw()` but read path was not migrated.
- **db.toRow()/fromRow() return type T is misleading** [supabase.ts:64,93] — Returns snake_cased + encrypted object but TypeScript type claims `T`. Type improvement for future.

## Deferred from: code review of 9-1-tiered-conflict-resolution-hlc-integration (2026-05-01)

- **NaN wallMs causes silent nondeterministic behavior** — If `HlcTimestamp.wallMs` is `NaN` (corrupted deserialization), `compareHlc` returns `NaN`, `isWithinConflictWindow` returns `false`, and `determineWinner` always picks `remote`. HLC generates valid timestamps by construction; input validation belongs at the sync worker boundary (Story 9.2).
- **drain-worker.ts marks conflicts as synced without onConflict handler** — When 409 conflict response received and `onConflict` is undefined, falls through to `markSynced` silently. Conflicting entries swallowed. Pre-existing in drain-worker.ts.
- **drain-worker.ts SyncRecord version field inconsistency** — `version: entry.hlcTimestamp` sets version to serialized HLC string. Not consumed by `resolveConflict` but inconsistent contract. Pre-existing.

## Deferred from: code review of 8-2-immutable-hash-chained-audit-logging (2026-05-01)

- **Hash chain race condition in emit() — concurrent calls can fork the chain** — `packages/audit-logger/src/logger.ts`. `emit()` reads previous hash, computes new hash, inserts. No serialization (advisory lock, SELECT FOR UPDATE). Two concurrent emits read same parent hash, producing a fork. verifyChain reports false negatives. Low risk at current single-clinic scale but must be fixed before multi-tenant or high-throughput deployment.
- ~~**checkConsent ignores provision_end — expired consent grants access indefinitely**~~ — RESOLVED (2026-05-02). Patched `enforceConsent.ts`: added `provision_end` to select query, added expiry check before granting access. 3 tests added to `enforce-consent.test.ts`.
- **Lab register orphaned record on compensating delete failure** — `lab.ts:181-195`. If `lab_technicians` insert fails, compensating delete of `labs` row is fire-and-forget (error not checked). Failed delete leaves orphaned PENDING lab with no technician. Needs DB transaction or RPC.
- **recordDispense insert before conflict check with no rollback** — `medication.ts:132-215`. Dispense row commits before HLC conflict check. On `alreadyCompleted && incomingIsOlder` branch, dispense record persists with no corresponding prescription status update. Permanent data inconsistency.
- **rateLimitMap unbounded memory growth** — `lab.ts:112-126`. Module-level Map grows by one entry per unique IP hash. Stale entries never pruned. OOM risk on long-running processes under distributed load.
- **notification-escalation 48h alert uses wrong recipient_role** — `notification-escalation.ts:86-93`. Escalation notification inserted with `recipient_role: 'CLINICIAN'` and `recipient_ref: 'BACKOFFICE'`. No user resolves `BACKOFFICE` ref. Escalation alerts are dead-lettered. Patient safety concern.
- **decryptRow returns '[Encrypted Content]' placeholder with no error signal** — `field-encryption.ts:125-140`. Failed decryption (wrong key, tampered ciphertext) silently returns placeholder string. Callers cannot distinguish success from failure. Placeholder can reach UI as clinical content, and if row is subsequently updated, original ciphertext is permanently destroyed.
- **notification.list concurrent QUEUED-to-SENT race** — `notification.ts:43-70`. Two concurrent `list` calls read same QUEUED IDs, both update to SENT, both emit audit events. Duplicate audit entries inflate log. Fix: conditional `.eq('status', 'QUEUED')` on update.
- **getRevocationList cursor pagination breaks on duplicate timestamps** — `practitioner-key.ts:86-119`. Cursor uses `revoked_at` which isn't unique. Bulk revocation skips keys. Security gap: edge devices miss revoked keys.
- **loincCode in notification payload leaks diagnostic category** — `lab.ts:710-716`. LOINC code stored in notification payload, returned to PATIENT-role users via `notification.list`. Reveals diagnostic test type without consent/access flow.
- **handleInteractionOverride clears pendingForm before addPrescription completes** — `encounter-dashboard.tsx:246-279`. Modal closed at line 250, before `await addPrescription()` at line 252. On failure, prescription data is lost. Clinician must re-enter everything.

## Deferred from: code review of 8-1-client-side-audit-ledger (2026-05-01)

- **Unbounded growth of synced/failed events in IndexedDB** — No pruning or TTL for `clientAuditLog` table. Over weeks of clinical use, table grows unbounded with `synced`/`failed` records never cleaned up. `getPending` becomes expensive on large tables. Pruning is a separate operational concern, not a correctness bug.
- **Sequential event processing in audit.sync blocks on slow emit** — `for...of` with `await audit.emit()` in Hub audit.sync means one slow event blocks the entire batch of 50. Performance optimization, not a correctness issue. Consider parallel processing or Promise.allSettled in a follow-up.

## Deferred from: code review of 9-3-global-sync-dashboard (2026-05-01)

- **Multi-tab concurrent drain race condition** — Both tabs instantiate separate drain workers, read same pending entries, and push duplicates to Hub. No cross-tab lock. Pre-existing sync-engine design issue.
- **QuotaExceededError unhandled in sync queue operations** — IndexedDB quota exceeded causes retry loop (markFailed itself fails). Pre-existing in sync-engine.
- **Tab close leaves entries stuck in 'syncing' status** — No beforeunload handler resets in-flight entries. 2-minute blackout until recoverStale runs. Pre-existing.
- **recoverStale uses wall clock vulnerable to system clock changes** — Clock backward adjustment prematurely resets syncing entries, causing duplicate pushes. Pre-existing.
- **SyncQueueEntry type mismatch between db.ts and sync-engine** — db.ts defines 3 statuses, sync-engine defines 4. Runtime works but types diverge. Pre-existing (W1 from 9-2 review).
- **Conflict silently swallowed when no onConflict handler** — drain-worker marks conflicts as synced when no handler configured. Tier 1 safety data could be lost. Pre-existing.
- **getByResourceId deduplication only matches first entry** — Multiple pending entries for same resource causes stale data sync. Pre-existing.

## Deferred from: code review of 9-2-background-sync-worker-retry-logic (2026-05-01)

- **W1: Dexie db.ts SyncQueueEntry type diverges from sync-engine type** — db.ts defines status as `'pending' | 'in-flight' | 'failed'`, sync-engine uses `'pending' | 'syncing' | 'failed' | 'synced'`. Dexie is schema-flexible so it works at runtime, but TypeScript types diverge. Needs db.ts schema alignment.
- **W2: TOCTOU race in enqueue deduplication** — `enqueue()` does read-then-write without Dexie transaction. Concurrent calls for same resourceId can create duplicates. Needs Dexie transaction wrapper.
- **W3: Hub sync.push TOCTOU race between conflict check and upsert** — No database-level optimistic locking (WHERE hlc_timestamp = $expected). Concurrent pushes from different spokes can silently overwrite each other. Needs DB constraint or conditional upsert.
- **W4: Hub sync.pull uses lexicographic HLC comparison via SQL `>`** — HLC format has non-zero-padded numeric strings; lexicographic ordering is incorrect for temporal comparison. Needs schema change (numeric column) or custom SQL comparison function.
- **W5: No cleanup of synced/failed entries — unbounded IndexedDB growth** — Entries transition to synced/failed and remain forever. No purge mechanism. On long-running clinic devices, causes quota pressure and degraded query performance.
- **W6: clearPhiState clears Zustand but sync queue retains PHI payloads in IndexedDB** — Tab close clears memory state but serialized PHI payloads persist in sync queue. Needs design decision on encrypting sync queue or clearing it on PHI wipe.
- **W7: No handling for expired auth tokens in drain worker** — JWT expires at 15 min, drain polls at 30s. Expired tokens cause 401s, exhausting retries and permanently failing entries. Needs token refresh integration or 401-specific pause.
- **W8: Sync status store updated once after full drain cycle, not per-item** — AC9 says "real-time" but `updateStatus()` called only in finally block. Minor UX concern during long drain cycles.


## Deferred from: code review of 10-3-terminology-service-migration-dexie-vocabulary (2026-05-01)

- **D86: Module-level `lookupMap` singleton survives HMR in development** — `interactionService.ts` module-level singleton is not reset by Hot Module Replacement during development, causing stale interaction data until full page reload. Dev-time only; no production impact.

## Deferred from: code review of 10-2-global-allergy-management-high-visibility-banners (2026-05-01)

- **D87: checkAllergyMatch free-text substring quality** — Substring matching on drug display names produces cross-class false negatives (PCN ≠ Penicillin) and false positives (iron ∈ ciprofloxacin). Dev Notes explicitly acknowledge this as a follow-up enhancement. Address when RxNorm/SNOMED cross-reference data is available.
- **D88: meta.lastUpdated stale on client after Hub sync** — `allergy.create` sets `metaLastUpdated: now` server-side but returns only `{success, allergyId, alreadySynced}`. Client's IndexedDB copy retains the client-generated `lastUpdated` value permanently. Broader pattern affects all synced resources; address with sync response envelope standardization.
- **D89: No coded substance selection UI (AC 3 "optional coded")** — AllergyEntry.tsx provides free-text only; the `code.coding` field is never populated from the UI. AC 3 marks this as optional. Implement coded lookup (SNOMED CT substances or local drug DB) when vocabulary service supports it.
- **D90: Duplicate allergy submission on retry** — If `addAllergy()` throws after DB write, user can resubmit the same substance creating a duplicate local record. ID-level idempotency on the Hub prevents Hub-side duplication. Client-side duplicate detection (by substance name + patient) deferred until UX review.
- **D91: Unicode whitespace-equivalent substance passes trim() validation** — A substance string composed entirely of Unicode non-breaking spaces passes `!substance.trim()` check. Low clinical risk given UI text entry context. Add `\S` regex check when input hardening is prioritized.
- **D87: `localStorage` vocab version not reset on Dexie v14 schema upgrade** — If a user upgrades from a hypothetical prior schema variant, `localStorage` version keys persist but vocabulary tables are cleared by Dexie's `onUpgrade` handler. The subsequent delta sync correctly fetches all data (sinceVersion=N but table empty), but only if the seeder re-seeds first. Pre-existing migration edge case; addressed by ensuring seeder runs before sync on empty tables.

## Deferred from: code review of 13-1-react-error-boundaries-safe-mode (2026-05-02)

- **D92: Invalid `lastSyncedAt` string produces NaN** — `StaleDataBanner` passes an invalid date string to `new Date()`, resulting in `NaN` comparison that suppresses the banner instead of showing it. Safe failure mode should treat invalid dates as maximally stale. [`packages/ui-kit/src/StaleDataBanner.tsx:17`]
- **D93: Error object stored in React state may contain PHI** — `getDerivedStateFromError` stores the raw error in component state. While `sanitizeErrorMessage` prevents PHI from rendering, the error object is accessible via React DevTools or error monitoring tools. Consider scrubbing at ingestion time. [`packages/ui-kit/src/ErrorBoundary.tsx:61`]
- **D94: RTL: inline styles use physical CSS properties** — `ErrorBoundary` and `StaleDataBanner` use physical CSS properties (margin, padding shorthand) instead of logical properties (margin-inline-start, etc.). No RTL snapshot tests exist for these components. Defer to Story 11.1 (RTL/i18n framework). [`packages/ui-kit/src/ErrorBoundary.tsx`, `packages/ui-kit/src/StaleDataBanner.tsx`]

## Deferred from: code review of 25-1-create-packages-drug-db-package (2026-05-02)

- **D95: Global singleton cache not per-adapter** — `checker.ts` module-level `cachedMap`/`buildInFlight` ignore adapter identity. Second adapter silently gets first adapter's data. Not a current issue (one adapter per app process), but relevant for multi-adapter future. [`packages/drug-db/src/checker.ts:55-56`]
- **D96: Module-level adapter instantiation SSR risk** — `createDexieDrugAdapter()` runs at module load; IndexedDB unavailable during SSR. Pre-existing pattern in OPD Lite client modules. [`apps/opd-lite/src/services/interactionService.ts:25`]
- **D97: Allergy substring matching false positives** — 3-char minimum reduces but doesn't prevent false positives (e.g., "iron" matching "envirion"). Pre-existing design from original code. Consistent with D87. [`packages/drug-db/src/checker.ts:155`]
- **D98: `checkAllergyMatch` crashes if `_ultranos` undefined** — `allergy._ultranos.substanceFreeText` throws TypeError if `_ultranos` is missing on corrupted/foreign FHIR data. Type contract requires it but no runtime guard. [`packages/drug-db/src/checker.ts:149`]
- **D99: Duplicate drug pairs — last entry overwrites first in lookup map** — No "take highest severity" logic for duplicate drug pairs in vocabulary data. Pre-existing behavior. [`packages/drug-db/src/checker.ts:62-78`]
- **D100: Dexie adapter has zero error handling** — Errors propagate correctly to UNAVAILABLE via caller's catch, but adapter could add resilience. Error messages from Dexie may contain table/schema details. [`apps/opd-lite/src/lib/dexie-drug-adapter.ts:10-18`]
- **D101: Audit trail incomplete for failure-mode prescriptions** — When interaction check throws, audit log records `interactionsFound: 0` without listing active allergies at time of check. Pre-existing in encounter-dashboard. Reduces forensic capability.

## Deferred from: code review of 25-2-drug-database-staleness-enforcement (2026-05-02)

- **D102: Module-level cache not per-adapter** — `checker.ts` uses module-level `cachedMap` shared across all callers regardless of adapter identity. Pre-existing from Story 25.1. Consistent with D95. [`packages/drug-db/src/checker.ts:62-63`]
- **D103: Allergy substring matching produces false positives** — `checkAllergyMatch` uses bidirectional substring matching (e.g., "ASA" matches "Dapagliflozin"). Pre-existing from Story 10.2. Consistent with D87/D97. [`packages/drug-db/src/checker.ts:156-167`]
- **D104: ensureMap returns stale data on cache generation mismatch** — When `gen !== cacheGeneration`, the stale build result is returned to the current caller (but not cached). Pre-existing from Story 25.1. [`packages/drug-db/src/checker.ts:96`]
- **D105: Unsafe `null as unknown as LookupMap` cast** — When entries are empty, null is cast to LookupMap type. Caller checks `if (!map)` but the type system is lying. Pre-existing from Story 25.1. [`packages/drug-db/src/checker.ts:99`]
- **D106: NONE severity returns CLEAR with non-empty interactions array** — Drug entries with severity NONE produce interactions that don't trigger BLOCKED or WARNING, resulting in contradictory `{ result: 'CLEAR', interactions: [...] }`. Pre-existing from Story 25.1. [`packages/drug-db/src/checker.ts:279-285`]
- **D107: System clock drift in field deployments** — Timestamps use `Date.now()`. If the system clock is set far forward during sync then corrected, the database appears permanently stale until 45 days pass. Inherent to timestamp-based design; needs server-time anchor to fix. [`packages/drug-db/src/checker.ts:225`]

## Deferred from: code review of 25-3-diagnosticreport-medicationdispense-fhir-types (2026-05-02)

- **D108: FHIR datetime strictness** — `z.string().datetime()` rejects partial FHIR dates (e.g. `2025-06-15`) across all schemas. All shared-types schemas use this same validator instead of `FhirDateTimeOrDateSchema` from `common.schema.ts`. Project-wide decision needed.
- **D109: AttachmentSchema `data` field has no max size constraint** — Base64 `data` field in DiagnosticReport attachments accepts arbitrarily large payloads. Could bloat IndexedDB/sync queue. Architectural concern for a future storage-limits story.

## Deferred from: code review of 14-2-pharmacy-lite-supabase-auth-login-page (2026-05-04)

- **D112: `dispense-sync` enqueue can fail silently, losing dispense data** — If `enqueueForRetry` throws (IndexedDB quota, DB locked), the exception is unhandled. Dispense persists locally but never syncs to Hub with no mechanism to detect or recover.
- **D113: `confirmDispense` partial failure leaves items in inconsistent state** — If the loop processes 2 of 3 items then the 3rd throws, first 2 are persisted/synced but UI shows a generic error with no per-item status tracking.
- **D114: `AbortSignal.timeout()` not supported in Safari <16.4 or older Android WebView** — PWA targets low-resource clinical environments where older browsers are likely. TypeError from missing API is classified as offline error, masking the real issue.
- **D115: `fulfillment-store` hardcoded actor ID `'pharmacy-user'`** — Auth session store now exists (added in this story). `auditPhiAccess('pharmacy-user', ...)` should read from `useAuthSessionStore.getState().session?.userId`. Out of scope for Story 14.2 but should be addressed in a follow-up.
- **D116: `processingRef` not reset after `handleFetchKey` failure** — In PharmacyScannerView, if `handleFetchKey` catches an error, `processingRef.current` stays true, permanently blocking subsequent camera scans until page reload.
- **D117: `window.location.href` destroys Zustand store on redirect** — After login, `window.location.href = '/'` triggers full page reload, destroying the just-populated session store. Same pattern as OPD Lite. Story 14.5 (route protection) must handle session rehydration from Supabase cookies.
- **D118: OPD Lite login page has same dangling session bug on null JWT post-MFA** — OPD Lite `login/page.tsx:122-126` also does not call `signOut()` when JWT is null after MFA verify success. Fix in OPD Lite to match the Pharmacy Lite patch.

## Deferred from: code review of 14-1-opd-lite-supabase-auth-login-page (2026-05-04)

- **D110: No client-side MFA retry limit** — No retry counter or re-challenge after N TOTP failures. Server-side Supabase rate limiting is the primary control. Client-side limit is defense-in-depth. Not caused by this change — same pattern as Lab Lite.
- **D111: Supabase session auto-refresh handling on login page** — If a previous expired session exists, Supabase client may trigger background refresh on the login page, potentially causing redirect loops with future route protection. Deferred to Story 14.5 (Route Protection Middleware).

## Deferred from: code review of 14-3-shared-session-management-hook-reauth-modal (2026-05-04)

- **D119: `inactivityMs < WARNING_BEFORE_MS` creates immediate warning state** — If a consumer passes `inactivityMs` smaller than `WARNING_BEFORE_MS` (5 min), warning fires immediately on first tick. Won't occur with spec-defined `INACTIVITY_TIMEOUT` (30 min) constant, but no runtime guard prevents it.
- **D120: No `SessionManagerProvider` test file** — Provider is thin glue code wiring hook + toast + modal. Integration testing will be covered in stories 14.3a/b/c when spoke apps integrate the provider.

## Deferred from: code review of 14-3a-opd-lite-session-timeout-integration (2026-05-04)

- **D121: `signInWithPassword` re-auth creates mismatched sessionId in store** — Re-auth via `signInWithPassword` creates a new Supabase session but the Zustand auth store retains the old `sessionId`. Audit events and API calls reference a stale session. Architectural concern — requires design decision on whether re-auth should update store session metadata.
- **D122: No audit event on session expiry or re-auth attempt** — `handleExpired` (PHI cleanup) and `handleReAuth` (security event) emit no structured audit events. Session timeout and failed re-auth attempts are security-relevant but auditing was not in the acceptance criteria for this story.
- **D123: `signInWithPassword` may trigger `onAuthStateChange` listeners** — Re-auth call fires Supabase `SIGNED_IN` event, which could trigger registered listeners (e.g., re-running login logic, re-deriving keys). Requires investigation across auth listener registrations.

## Deferred from: code review of 14-3b-pharmacy-lite-session-timeout-integration (2026-05-04)

- **D124: `handleExpired` clearSession triggers re-render before redirect** — `clearSession()` sets `isAuthenticated = false` at step 3 of cleanup, which can cause a React re-render before `window.location.href = '/login'` fires at step 5. Briefly shows unauthenticated children. Cosmetic only — redirect fires in same event loop tick. Same pattern as OPD Lite 14-3a. Architectural choice.

## Deferred from: code review of 14-3c-lab-lite-session-timeout-integration (2026-05-04)

- **D125: No error handling for signOut in MFA rejection path** — `login/page.tsx:68`. If `signOut()` throws when rejecting a user without TOTP, exception propagates unhandled. Partial Supabase session remains active. Pre-existing in login page, not introduced by this change.
- **D126: No error handling for signOut in "Back to sign in" handler** — `login/page.tsx:137`. `handleBackToSignIn` has no try-catch. If `signOut()` throws, partial session persists. Pre-existing in login page.

## Deferred from: code review of 14-5-route-protection-middleware (2026-05-08)

- **AuthGuard does not react to session changes/expiry after mount** — `useEffect` runs once with `[isLoginPage]` dependency. No `onAuthStateChange` listener. If Supabase session expires while user is on a protected page, AuthGuard won't re-check until next mount. SessionTimeoutWrapper partially covers this but there's a gap window. Architectural enhancement beyond story scope.
- **Three near-identical AuthGuard implementations (DRY violation)** — AuthGuard is copy-pasted across OPD Lite, Pharmacy Lite, and Lab Lite with minor variations (JWT decode vs user_metadata, hardcoded role). Spec explicitly chose per-app AuthGuard due to per-app auth store differences. Extracting to shared package with config injection is a future optimization.

## Deferred from: code review of 14-4-shared-appshell-component-in-ui-kit (2026-05-05)

- **W1: `dangerouslySetInnerHTML` for `<style>` injection** — Tokens are hardcoded HSL values (not user-controlled), so current risk is low. Pattern is fragile if tokens ever become dynamic or sourced from external config. [`packages/ui-kit/src/AppShell.tsx`]
- **W2: Hamburger resize stale state on viewport changes** — `mobileNavOpen` state stays `true` when viewport crosses 641px breakpoint via resize or device rotation. Nav drawer reappears unexpectedly on resize back to mobile. Needs `matchMedia` listener to reset state. [`packages/ui-kit/src/AppShell.tsx`]
- **W3: `navItems` keyed by `href` — duplicate href risk** — `key={item.href}` assumes unique hrefs. Duplicate hrefs produce React key warnings. Low probability in practice. [`packages/ui-kit/src/AppShell.tsx:156`]
- **W4: No hover/focus-visible styles on interactive elements**

## Deferred from: code review of 14-6-opd-lite-practitioner-reference-replacement (2026-05-08)

- **W5: `ReferenceSchema` accepts any string — no FHIR reference format validation** — `ReferenceSchema` in `common.schema.ts` uses `z.string()` with no format check. Malformed references (empty, missing `/`, wrong resource type) pass validation and persist to IndexedDB, only failing on Hub API sync. Add a `.refine()` or regex guard when FHIR validation is hardened. [`packages/shared-types/src/fhir/common.schema.ts`] — Inline styles cannot express pseudo-classes. No visual feedback on hover or keyboard focus for nav links, avatar button, or dropdown items. Known limitation of the project's inline-style approach. [`packages/ui-kit/src/AppShell.tsx`]

## Deferred from: code review of 14-6a-pharmacy-lite-identity-trust-fix (2026-05-08)

- **W6: Stale pharmacistRef baked into queued retry payloads** — When Hub sync fails (offline), `enqueueForRetry` serializes the mutation payload containing the current `pharmacistRef`. If a different pharmacist logs in before retry fires, the queued payload still contains the original pharmacist's identity. Pre-existing sync design issue — retry would need to re-derive identity at replay time.
- **W7: TOCTOU between dual getPractitionerRef() calls** — `confirmDispense` calls `getPractitionerRef()` and then `syncDispenseToHub` calls it again independently (belt-and-suspenders per spec). Session could theoretically expire between the two calls, creating a window where the local dispense has one ref and the Hub sync fails or uses a different ref. Intentional tradeoff per spec design.
- **W8: Audit service reads pharmacistRef from dispense.performer, not from auth store** — `logDispenseEvent` and `auditPhiAccess` extract pharmacistRef from `dispense.performer[0].actor.reference` rather than from the auth session store. Inconsistent with the security posture of this story, but audit service was out of scope.
- **W9: No error state in fulfillment store for auth failure** — When `getPractitionerRef()` throws in `confirmDispense`, the error propagates as an unhandled promise rejection. The store has no dedicated error field — a UI reading `syncStatus` for errors will miss auth failures. UI concern beyond story scope.

## Deferred from: code review of 15-1-opd-lite-pwa-manifest-service-worker (2026-05-10)

- **W10: No offline navigation fallback page** — OPD-Lite has no `/offline` route (unlike Lab-Lite). Uncached navigation requests show browser-level network error instead of a graceful fallback. Not in story ACs.
- **W11: `beforeinstallprompt` timing race conditions** — Event may fire before React hydration (lost) or after the 2-min timer already ran (banner never shows). Unlikely in practice; a global event capture in `<head>` would mitigate.
- **W12: Icon `purpose: 'any maskable'` on placeholder icons** — Combined purpose causes poor cropping on Android. Will matter when real branded icons replace placeholders.

## Deferred from: code review of 16-7-practitioner-key-registration-endpoint (2026-05-10)

- **No cap on active keys per practitioner** — A practitioner can accumulate unlimited active (non-revoked, non-expired) keys. No count check or throttle. Policy decision — consider max active keys per practitioner or auto-revoking previous keys on new registration.
- **`practitionerId` not verified to exist in system** — `practitionerId` accepts any valid UUID without verifying it corresponds to an actual practitioner record. If no FK constraint exists, orphan keys can be created. If FK exists, `23503` error is caught by generic `INTERNAL_SERVER_ERROR` handler with no descriptive message.
- **No upper bound on key expiry duration** — A caller can set `expiresAt` decades into the future. No max expiry enforced (e.g., 2 years). Policy decision for healthcare key lifecycle management.

## Deferred from: code review of 16-4-dispensing-idempotency-guard (2026-05-11)

- **W12: `patientRef` not validated against prescription's `subject_reference` in `recordDispense`** — Consent middleware checks consent for the `patientRef` in input, not the actual patient on the prescription. Dispense record and audit trail reference the wrong patient if `patientRef` mismatches. Pre-existing since `recordDispense` was introduced. Consistent with W10 from 6-1 review. [medication.ts:448-451]
- **W13: HLC string comparison has no format validation** — `hlcTimestamp` input validated as `z.string().min(1)` with no format enforcement; lexicographic comparison assumes zero-padded format. Pre-existing across all HLC-using endpoints. Consistent with W4 from 9-2 review. [medication.ts:440,543]
- **W14: Conflict log insert failure throws INTERNAL_SERVER_ERROR, orphaning dispense record** — The `dispense_conflicts` insert failure path at line 561 throws instead of log-and-continue. The already-inserted dispense record persists as an orphan. Pre-existing conflict logging pattern. [medication.ts:561-567]
- **W15: Audit payload fields not deeply asserted in duplicate-dispense test** — Test only verifies `from('audit_log')` was called, not that payload contains `existingDispenseId` and `attemptedDispenseId` per spec testing standards. Consistent with existing audit test patterns across the file. [medication.test.ts:671-672]

## Deferred from: code review of 16-3-medication-create-prescription-lifecycle (2026-05-11)

- **Audit failure silently swallowed with no rollback/retry** — `create` and `read` procedures wrap `audit.emit()` in try/catch, logging a warning on failure. Prescription persists without audit trail. Project-wide pattern matching spec ("audit failures must not crash procedure"). Consistent with allergy router, other routers. Address with transactional audit or dead-letter queue architecture.
- **`dosageInstruction`/`dispenseRequest` accept arbitrary nested objects** — `z.record(z.unknown())` allows any JSON shape. FHIR R4 dosage instruction is complex and variable. Full structural validation is a broader FHIR compliance effort.
- **`hlcTimestamp` not format-validated** — `z.string().min(1)` accepts any non-empty string. HLC timestamps have specific format for lexicographic comparison. Pre-existing across all router procedures.
- **`interactionOverride` accepted when `interactionCheck` is CLEAR** — Override reason stored even when no interaction was detected. Minor data hygiene, no safety risk.

## Deferred from: code review of 16-8-diagnosticreport-read-list-endpoints (2026-05-11)

- **W1: Audit failure silently swallowed** — All audit emit() calls wrapped in try/catch with console.warn. Request succeeds without audit record. CLAUDE.md Rule #6 says "No exceptions." Pre-existing systemic pattern across all routers (D5, D9, D23, D38, P2).
- **W2: Decryption failure detection via magic string** — `decryptField` returns `'[Encrypted Content]'` placeholder on failure, detected via string equality comparison. Pre-existing pattern in `@ultranos/crypto/server`.
- **W3: No rate limiting on file download endpoint** — `/api/lab-files/[fileId]` is a raw Next.js route handler outside tRPC, so any tRPC-level rate limiting doesn't apply. Combined with memory-intensive file loading, susceptible to resource exhaustion. Pre-existing infrastructure gap.
- **W4: Large file memory pressure** — File download loads entire `encrypted_content` (up to 20MB encrypted base64) into Node.js Buffer. Concurrent downloads could cause OOM. Acknowledged in spec dev notes.

## Deferred from: code review of 16-2-patient-crud-endpoints (2026-05-10)

- **W1: `db.toRow()`/`db.fromRow()` unhandled throws** — If encryption key is missing or data is malformed, these helpers throw uncaught exceptions in all CRUD procedures. Cross-cutting concern — validate encryption config at startup rather than per-call.
- **W2: Migration 013 non-atomic index swap** — `DROP INDEX` then `CREATE UNIQUE INDEX` leaves a window with no index under concurrent load. Use a transaction or CONCURRENTLY when applying to production.
- **W3: Consent middleware test is a no-op** — Test "blocks access when consent middleware denies" cannot verify denial because the router is already constructed with the pass-through mock. Middleware IS correctly wired in production. Test title is misleading.

## Deferred from: code review of 16-1-encounter-crud-endpoints (2026-05-10)

- **W13: No pagination on `listByPatient`** — Returns unbounded result set for a patient's encounters. No `.limit()` or cursor. Matches AC 5 ("returns all encounters") but causes performance issues for high-volume patients. Address when encounter volume grows.
- **W14: No-op update allowed when no optional fields provided** — If only `hlcTimestamp` is passed without `status`, `classCode`, or `reasonCode`, the update only advances the HLC with no meaningful data change. Unnecessary DB write and audit event.

## Deferred from: code review of 21-1-global-redis-backed-rate-limiting (2026-05-12)

- **IP-based rate limiting trusts X-Forwarded-For without proxy validation** — `deriveIdentifier()` reads `x-forwarded-for` header directly. Unauthenticated clients can spoof the header to cycle through fake IPs and bypass the 20 req/min limit. Requires trusted proxy configuration or connection-level IP extraction at the infrastructure layer.
- **Redis singleton leaks connections on Next.js HMR in dev mode** — Module-level `let client` in `redis.ts` is not reset by Hot Module Replacement. Old client references are lost without `disconnect()`, leaking Redis connections during development. Dev-mode only; no production impact.
- **Missing await on dispatchResultNotifications** — `lab.ts` fire-and-forget promise for notification dispatch has no retry mechanism. If the async function fails, the upload response is already sent. Pre-existing pattern, not introduced by this change.

## Deferred from: code review of 21-6-audit-hash-chain-race-condition-fix (2026-05-13)

- **D2: JS timestamp assigned before PG advisory lock — low probability accepted** — `emit()` generates `id` and `timestamp` in JS before the RPC call acquires the advisory lock. Concurrent calls can produce out-of-order timestamps vs chain position. Low probability in single-server deployments. [`packages/audit-logger/src/logger.ts:39-40`]
- **D3: `audit.sync` silently swallows per-event compliance failures** — The try/catch returns `{ success: false }` per event and continues. A full batch could silently fail with 200 OK. Pre-existing behavior, not introduced by Story 21.6. [`apps/hub-api/src/trpc/routers/audit.ts:71-73`]
- **W1: Concurrency tests only exercise JS mock, not real PG advisory lock** — `hash-chain-concurrency.test.ts` uses `createSerializedMockSupabase` which simulates serialization in JS. No integration test proves the actual PostgreSQL `pg_advisory_xact_lock` serializes real concurrent requests. [`packages/audit-logger/src/__tests__/hash-chain-concurrency.test.ts`]
- **W2: `verifyChain()` always starts from genesis hash — cannot verify mid-chain slice** — `prevHash` initialized to `GENESIS_HASH` on every call. Any call with `limit < total_records` that doesn't start from the first record will report false chain breaks. [`packages/audit-logger/src/logger.ts:98`]
- **W3: `audit.sync` hardcodes `outcome: 'SUCCESS'` — client DENIED events lose true outcome** — Zod schema doesn't include `outcome` field. All synced events written as SUCCESS regardless of client-side outcome. [`apps/hub-api/src/trpc/routers/audit.ts:61`]
- **W4: `ctx.user.sub` presence not validated — missing sub silently becomes null actorId** — No assertion that `sub` is present and non-empty on the JWT context. A token without `sub` claim produces anonymous audit records. [`apps/hub-api/src/trpc/routers/audit.ts:49`]

## Deferred from: code review of 21-5-mobile-device-security-root-detection-certificate-pinning (2026-05-12)

- **pinnedFetch not wired into any HTTP client** — `pinnedFetch` exists but is never imported. `drain-sync-fn.ts` and `notification-api.ts` use plain `fetch`. Requires HTTP client unification story to replace all Hub API fetch calls with pinned variant.
- **Read-only mode doesn't render existing local data** — CompromisedDeviceWarning shows text notice only, no actual data viewer for appointments/medication history. Requires UX design.
- **Read-only mode has no API-level write blocking** — Enforcement is UI-only (App.tsx gate). API-level guards needed as defense-in-depth when navigation/deep links are added.
- **TLS 1.3 minimum not enforced** — `pkPinning: true` is public key pinning, not TLS version control. Requires native Android `network_security_config.xml` and iOS ATS configuration.
- **Audit uses local `@/lib/audit` instead of `@ultranos/audit-logger`** — Local audit module feeds into sync queue. Migration to shared package with SHA-256 hash chaining is a broader refactor across patient-lite-mobile.
- **Placeholder certificate pins with no runtime guard** — `certificate-pins.ts` contains dummy hashes (AAAA/BBBB). Must be replaced with real SHA-256 SPKI hashes before production. Consider adding a build-time assertion or startup-time validation.
- **Integrity check runs once — no re-check on app foreground** — `App.tsx` runs `checkDeviceIntegrity()` once at mount. A device could be rooted while the app is backgrounded. Add AppState listener to re-check on foreground resume in a hardening pass.
- **No test for App.tsx integration** — The component orchestrating device integrity check, conditional rendering, and audit emission has no dedicated test. Integration test gap.

## Deferred from: code review of 21-3-consent-authorization-identity-trust-fixes (2026-05-13)

- **W1: ADMIN consent bypass lacks dedicated audit trail** — When ADMIN syncs consent on behalf of another user, no metadata records this was an admin-on-behalf-of action. The success audit has `actorId: ctx.user.sub` but no `grantorId` in metadata. Enhancement for compliance traceability.
- **W2: Client pharmacistRef has no max length constraint** — `pharmacistRef: z.string().min(1)` accepts arbitrarily long strings that get persisted in immutable audit log metadata. Input validation hardening.
- **W3-W10: Story 21.2 scope findings** — parsedPayload not validated after JSON.parse (SQL injection risk), .refine() removal from GetStatusInputSchema, verifyEd25519Signature sync/async ambiguity, console.warn audit fallback inconsistency, breaking API for unsigned lookups, isKeyRevoked error handling gap, resourceId missing from some audit events, dead schema fields. All belong to Story 21.2 review scope.

## Deferred from: code review of 21-2-qr-signature-verification-enforcement (2026-05-13)

- **W1: Audit failure on SECURITY_VIOLATION is swallowed (no retry/alert)** — Three SECURITY_VIOLATION audit emit() calls wrapped in try/catch with console.warn fallback. If audit system is down during an attack, security events go unrecorded. Broader audit infrastructure concern — current fail-open-for-audit, fail-closed-for-request is acceptable first pass.
- **W2: KRL base64 normalization / multiple rows handling** — `isKeyRevoked` does `.eq('public_key', publicKey)` with exact string match. Different base64 variants of the same key bytes could bypass match. `.single()` errors on multiple rows (safe, returns revoked). Data integrity concern about practitioner_keys table schema.
- **W3: `INTERACTION_CHECK` not in `AuditResourceType` enum** — `checkInteractions` handler emits `resourceType: 'INTERACTION_CHECK'` which is not in the enum. Pre-existing from checkInteractions handler, not introduced by Story 21.2.
- **W4: KRL check uses caller's Supabase client (RLS context)** — `isKeyRevoked` receives `ctx.supabase` which carries caller's RLS context. A caller who manipulates JWT claims could affect their own KRL check visibility. Needs service-role client investigation.

## Deferred from: code review of 16-5-soap-note-sync-endpoints (2026-05-11)

- **W1: Audit failure silently swallowed in try/catch** — Both `addSOAPNote` and `listSOAPNotes` catch audit emit errors and only `console.warn`. CLAUDE.md Rule #6 says "no exceptions." Project-wide pattern across all routers. Address with transactional audit or dead-letter queue architecture.
- **W2: Audit hash chain race condition under concurrent requests** — `AuditLogger.emit()` reads previous hash, computes new, inserts without serialization. Concurrent emits fork the chain. Pre-existing in `packages/audit-logger/src/logger.ts`. Consistent with prior reviews.
- **W3: No pagination on `listSOAPNotes`** — Returns unbounded result set. Long-running encounters with many SOAP notes cause memory pressure. Address with cursor pagination.
- **W4: HLC timestamp no format validation at DB or Zod level** — `z.string().min(1)` accepts any non-empty string. Lexicographic ordering only works with consistent format. Pre-existing pattern across all routers.

## Deferred from: code review of 27-3-hub-api-entitlement-middleware (2026-05-13)

- **W1: Exempt router list in JSDoc will drift** — `enforceEntitlement.ts` docblock lists 8 exempt routers but there's no compile-time or runtime enforcement. New routers will silently lack entitlement checks unless a developer reads the comment. Consider a registry pattern or exhaustive-enum guard in a future story.
- **W2: `cause` field in TRPCError may not serialize to client** — No other TRPCError in the codebase uses the `cause` field. Depending on tRPC serialization config, `error.cause.requiredModule` may not reach the client. Low-risk until Story 27.4 (UI gate) consumes it; verify during that story.

## Deferred from: code review of 21-4-hub-api-security-headers-cors (2026-05-13)

- **Missing `Content-Security-Policy` header** — AC1 lists 4 specific headers; CSP not required but would prevent accidentally-served HTML from loading external resources. Additive security hardening for API-only service. [`apps/hub-api/next.config.js`]

## Deferred from: code review of 27-4-spoke-app-entitlement-gate-ui (2026-05-13)

- **Lab-Lite AuthGuard hardcodes role as `'LAB_TECH'`** — `apps/lab-lite/src/components/AuthGuard.tsx:49` hardcodes `role: 'LAB_TECH'` instead of reading from JWT claims like OPD and Pharmacy. Pre-existing; affects downstream RBAC checks if non-LAB_TECH users log in.
- **`adminEmail` never passed from any AuthGuard; API doesn't return it** — AC 1 says "if available." The `<EntitlementGate>` component accepts the prop but no data source exists. Wire when `entitlement.check` API is extended to return org admin email.

## Deferred from: code review of 21-4a-pwa-security-headers-via-next-config (2026-05-13)

- **Missing `upgrade-insecure-requests` CSP directive** — HSTS is present but CSP lacks `upgrade-insecure-requests`. First visit before HSTS is cached allows mixed content. Not in current AC scope.
- **`report-uri` deprecated in CSP Level 3, `report-to` missing** — Modern browsers prefer `report-to` with `Reporting-Endpoints` header. `report-uri` still functional but being phased out. Not in current AC scope.
- **No `Permissions-Policy` header** — Missing header to restrict camera, microphone, geolocation, etc. Defense-in-depth for healthcare PWA. Not in current AC scope.
- **`worker-src 'self'` may block Serwist blob URLs in dev mode** — Speculative concern. If Serwist uses blob: URLs for worker threads during development, CSP blocks them. Needs runtime verification.

## Deferred from: code review of 26-7-practitioner-key-revalidation-wiring (2026-05-14)

- **handleVerify has no try/catch — unhandled rejection if verifyPrescriptionQr throws** — `PharmacyScannerView.tsx:handleVerify`. Camera path calls without await. Pre-existing scanner behavior.
- **processingRef never reset after camera scan handleVerify completes** — `PharmacyScannerView.tsx`. Scan locked until explicit `handleReset`. Pre-existing.
- **confirmDispense partial failure loses track of which items dispensed vs failed** — `fulfillment-store.ts:confirmDispense`. Catch block sets `phase: 'completed'` with generic error. No per-item status. Pre-existing.
- **confirmDispense race condition — double-tap can bypass phase guard** — `fulfillment-store.ts`. Async gap between `get()` guard and `set()` state change. Pre-existing.
- **paste + camera concurrent verification race** — `PharmacyScannerView.tsx`. No mutex between paste-verify and camera-verify paths. Pre-existing.
- **TOCTOU gap — confirmDispense does not re-verify key freshness before dispensing** — `fulfillment-store.ts`. Unbounded time between verification and dispensing. Design question beyond story scope.
- **fetchAndCachePractitionerKey does not check local KRL before caching** — `prescription-verify.ts:fetchAndCachePractitionerKey`. Hub-fetched key cached without KRL cross-check. Pre-existing.

## Deferred from: code review of 27-5-admin-subscription-dashboard (2026-05-14)

- **W1: No RTL support / hardcoded en-US locale in Admin Portal** — Layout hardcodes `lang="en"`, no `dir` attribute, physical CSS properties. `formatDate` uses `'en-US'` locale. Pre-existing architectural gap; RTL is Epic 11 scope. [layout.tsx, page.tsx]
- **W2: No dialog accessibility (focus trap, aria attributes, Escape key)** — Both AddModuleDialog and RemoveModuleDialog use bare `div` with no `role="dialog"`, `aria-modal`, focus trapping, or keyboard dismiss. Admin portal scaffold scope. [AddModuleDialog.tsx, RemoveModuleDialog.tsx]
- **W3: Inconsistent `resourceType` casing between Story 27.2 and 27.5 audit events** — Story 27.5 uses `'Subscription'` (correct per spec) but pre-existing 27.2 code uses `'SUBSCRIPTION'`. Pre-existing. [subscription.ts]
- **W4: `listOrgSubscriptions` and `getOrgSubscriptions` are near-duplicate procedures** — Different access control and response shapes. Pre-existing from Story 27.2. [subscription.ts]
- **W5: Floating-point rounding in cost totals** — IEEE 754 addition can produce values like `80.00000000000001`. Masked by `.toFixed(2)` in display but raw API value may break downstream comparisons. [subscription.ts]
- **W6: Expired trial shows "0 days remaining" with no visual distinction** — `Math.max(0, ...)` clamps expired trials to 0. Trial lifecycle management not in scope. [page.tsx]
- **W7: `isLastModule` warning uses stale client-side data** — `activeSubscriptions.length` computed at page load; concurrent session changes not reflected. Server doesn't depend on this value. [page.tsx]
- **D1: PLATFORM_ADMIN access to admin subscription procedures** — 4 new admin procedures use `roleRestrictedProcedure(['ADMIN'])` only; PLATFORM_ADMIN excluded. Defer to Epic 22 when platform admin role is fully designed. [subscription.ts]
- **D4: Hub API tests are tautological — test mocks not router code** — Tests construct mock data then assert properties of that mock data. RBAC tests check a local array. Defer to dedicated test infrastructure story. [subscription-admin.test.ts]

## Deferred from: code review of 27-6-organization-admin-self-registration (2026-05-14)

- **W1: TOCTOU race on slug uniqueness** — Slug check-then-insert has a race condition. Two concurrent registrations with the same org name can produce duplicate slugs. Needs DB UNIQUE constraint on `organizations.slug` + catch constraint-violation and retry. Low probability during onboarding. [registration.ts]
- **W2: No rate limiting on registration endpoint** — `registerOrganization` uses `baseProcedure` (unauthenticated). Spec notes say handle at API gateway level for MVP. [registration.ts]
- **W3: Org status query per request in enforceVerifiedOrg** — Issues a Supabase query on every protected request. Status changes are rare; a short TTL cache or JWT claim embedding would reduce DB load. [enforceVerifiedOrg.ts]
- **W4: Orphaned org row if rollback DELETE fails** — If `createUser` fails and the subsequent org DELETE also fails, an orphaned org row persists with no linked admin. Needs a reconciliation/cleanup job. [registration.ts]
- **W5: selectInitialModules TOCTOU race on existing subscriptions check** — Check-then-insert without DB unique constraint on `(org_id, module_code)`. Concurrent calls can create duplicate subscriptions. [registration.ts]
- **W6: Welcome email not implemented** — Task 4 (welcome email trigger) deferred. `email_confirm: true` triggers Supabase's built-in confirmation but not the custom onboarding email with KYC/staff provisioning steps. [registration.ts]

## Deferred from: code review of 27-6-organization-admin-self-registration R2 (2026-05-14)

- **W7: Plaintext password in tRPC input layer** — `adminPassword` traverses the tRPC input as a raw string. Could appear in request tracing, Sentry breadcrumbs, or validation error detail. Consider input redaction or `.transform()` to prevent leakage. [registration.ts]
- **W8: Org name enumeration via slug suffix** — Response returns the generated slug (e.g., `acme-clinic-2`), revealing that `acme-clinic` already exists. Attacker can enumerate org names via the public endpoint. [registration.ts]
- **W9: Non-Latin org names blocked by slugify** — Arabic/Dari/Farsi-only org names produce empty slugs and are rejected. Significant UX gap for MENA/Central Asia target market. Needs transliteration or hash-based slug fallback. [registration.ts:10-15]
- **W10: enforceVerifiedOrg middleware not using tRPC middleware builder** — Hand-rolled type signature loses compile-time safety. Should use `t.middleware()` from init.ts. [enforceVerifiedOrg.ts]
- **W11: Trial period calculated in application code** — `new Date()` uses server local time. Clock skew across instances could produce inconsistent trial end dates. Consider using `now() + interval '30 days'` at the DB level. [registration.ts:80-81]

## Deferred from: code review of 27-8-billing-integration (2026-05-14)

- **W3: No pagination for invoice listing** — `stripe.invoices.list` hard-limited to 100. Long-standing customers lose older records. Add cursor-based pagination when needed. [packages/billing/src/adapters/stripe.ts:122-125]
- **W4: notification_queue table may not exist** — `billing-notifications.ts` inserts into `notification_queue` which may not have a migration yet. Code handles absence gracefully (catches insert error). Queue infrastructure is a separate concern. [apps/hub-api/src/services/billing-notifications.ts:61]

## Deferred from: code review of 27-7-admin-user-provisioning-scoped-to-subscription (2026-05-14)

- **W1: N+1 query pattern in batch lifecycle operations** — `scheduleUserSuspension`, `processPendingSuspensions`, and `reactivateUsersForModule` loop individual UPDATE queries per practitioner. Refactor to bulk UPDATE when org scale grows. [apps/hub-api/src/lib/subscription-lifecycle.ts]
- **W2: Audit emit failures silently swallowed with console.warn** — Project-wide pattern. All audit calls catch errors and only console.warn. Applies to non-PHI operations in 27.7. [apps/hub-api/src/lib/subscription-lifecycle.ts, apps/hub-api/src/trpc/routers/subscription.ts]
- **W3: `listOrgSubscriptions` inline SUBSCRIPTION_READ_ROLES missing CLINICIAN** — Story 27.2 code has a manual role allowlist omitting CLINICIAN despite it being in ROLE_MODULE_MAP. [apps/hub-api/src/trpc/routers/subscription.ts:72]
- **W4: `removeModule` does not enforce minimum one active module** — Admin can cancel all modules, scheduling suspension of all clinical staff with no safeguard. [apps/hub-api/src/trpc/routers/subscription.ts:496]
- **W5: `addModule` uses `z.string()` instead of `z.enum` for moduleCode** — Relies on DB check instead of schema-level validation. Story 27.5 code. [apps/hub-api/src/trpc/routers/subscription.ts:334]
- **W6: No cron job or trigger configured for `processPendingSuspensions`** — Function exists and is tested but no infrastructure runs it. Spec notes this as infrastructure work.

## Deferred from: code review of 27-9-subscription-lifecycle-tier-transitions (2026-05-15)

- **W1: Supabase query builder chain mutation bug in billing webhook handlers** — `billing.ts:130-141, 209-220`: conditional `.eq()` calls on the query builder may not correctly scope updates to a specific subscription. The update may affect ALL active/trial subscriptions for the org when `subscriptionId` is absent. Pre-existing from Story 27.8.
- **W2: Edge function auth check only validates header format** — `subscription-lifecycle/index.ts:65-68`: checks `Authorization: Bearer` prefix but never validates the token value. Standard Supabase Edge Function pattern, but the function is publicly reachable.
- **W3: Edge Function cron logic not directly tested** — `subscription-lifecycle-cron.test.ts` imports from hub-api's `subscription-state-machine.ts` instead of testing the Edge Function's inline logic. Date window calculations and deduplication logic in the Edge Function are untested.
- **W4: State machine logic duplicated between hub-api and Edge Function** — `subscription-state-machine.ts` and `subscription-lifecycle/index.ts` contain independent copies of ALLOWED_TRANSITIONS, transitionOrg, and email templates. Acknowledged architectural limitation (Edge Functions can't import from hub-api).

## Deferred from: code review of 22-1-back-office-admin-web-application-scaffold (2026-05-15)

- **W1: Supabase env var validation throws at module load time** — `apps/admin-portal/src/lib/supabase.ts:6-9` throws at import time if env vars missing, may crash SSR/build. Pre-existing pattern in all spoke apps.
- **W2: AuthGuard `isLoginPage` exact path match fails with Next.js basePath** — `apps/admin-portal/src/components/AuthGuard.tsx:13-14` uses `window.location.pathname === '/login'` which breaks if deployed at a subpath. Systemic issue across all apps.
- **W3: No Supabase project-level FIDO2/WebAuthn enablement documented** — No migration or configuration file ensuring FIDO2 is enabled in the Supabase project. Infrastructure config, not code.
- **W4: Rate limit key spoofable via x-forwarded-for** — `reportAuthEvent` rate limiter keys on client-controlled header. Revisit when deployment infrastructure (trusted proxy, API gateway) is defined. [admin.ts:75-78]

## Deferred from: code review of 22-5-provider-self-service-kyc-submission (2026-05-15)

- **D1: Cloud Vision API key exposed in client bundle** — `NEXT_PUBLIC_` prefix ships key to every browser. Server-side OCR proxy deferred to follow-up story. For now, restrict key in Google Cloud Console (referrer/IP restrictions). [ocr.ts:46,58]
- **D2: Synthetic OCR confidence scores** — Hardcoded 0.92/0.78 based on regex match index, not Cloud Vision API word-level confidence. v1 limitation. Real fix requires DOCUMENT_TEXT_DETECTION with fullTextAnnotation confidence. [ocr.ts:123-124]
- **D3: No OCR for PDF uploads** — Cloud Vision PDF support requires different API call (inputConfig with mimeType). Manual entry fallback works. [page.tsx:118-146]
- **W4: No RTL layout support on KYC page** — AC #12 unmet. Page uses minimal RTL-aware CSS (only `ms-2`). RTL snapshot test explicitly deferred in task checklist. [page.tsx]
- **W5: Audit failures silently swallowed in submitKyc** — `console.warn` on `audit.emit()` failure, submission still returns success. Pre-existing pattern used across the entire codebase (registerOrganization, selectInitialModules, etc.). [registration.ts:474-480]
- **W6: Supabase Storage access policies not verifiable from code** — Spec requires ADMIN-only read + submitter self-read on `kyc-documents` bucket. RLS/bucket policies not present in reviewed code files. Requires Supabase dashboard/migration verification. [registration.ts]

## Deferred from: code review of 22-3-lab-approval-suspension-workflow (2026-05-15)

- **W1: `reportAuthEvent` unauthenticated endpoint accepts caller-supplied `actorId`** — Pre-existing from Story 22.1. `baseProcedure` endpoint at `admin.ts:80` accepts `actorId` from unauthenticated callers and validates via DB lookup, allowing audit trail pollution. Move to `protectedProcedure` or add CAPTCHA/CSRF token.
- **W2: In-process `rateLimitMap` bypassed under multi-instance/serverless deployment** — Pre-existing from Story 22.1. Module-level `Map` at `admin.ts:25` is per-process. Redis-backed rate limiting exists in Epic 21 (`21-1-global-redis-backed-rate-limiting`); wire admin routes to use it.
- **W3: `labRestrictedProcedure` uses `.single()` — technician with multiple labs causes 406** — Pre-existing in `rbac.ts:127`. If a practitioner is affiliated with multiple labs, `.single()` throws `PGRST116`. Use `.limit(1).maybeSingle()` or add unique constraint on `lab_technicians.practitioner_id`.
- **W4: AC #9 — Registration documents not linked, only text references shown** — Spec says "lab registration documents" but implementation shows only license/accreditation references as text. Needs document storage model and download/viewer UI in a future story.

## Deferred from: code review of 22-4-provider-license-expiry-monitoring (2026-05-15)

- **W1: `notificationTypeMap` referenced before declaration in `reviewLab`** — `const` is not hoisted; runtime ReferenceError when reviewLab is called. Pre-existing from story 22.3. [admin.ts:412]
- **W2: In-memory rate limiter not safe for multi-replica deployments** — Module-level `Map` is per-process; ineffective in clustered/serverless deployments. Pre-existing from story 22.1. Redis-backed rate limiting exists in Epic 21. [admin.ts:25]
- **W3: `evictExpiredEntries` only runs when map exceeds MAX_ENTRIES** — Stale entries accumulate indefinitely below 10k threshold. Pre-existing from story 22.1. [admin.ts:28]
- **W4: `getLabDetail` exposes technician email without PHI audit event** — `telecom_email` is PII returned with no `audit.emit()`. CLAUDE.md rule 6 violation. Pre-existing from story 22.3. [admin.ts:271]
- **W5: No optimistic concurrency (versionId) on `_ultranos` updates** — Concurrent admin actions and job runs can silently clobber each other's `_ultranos` writes. Cross-cutting architectural concern affecting all practitioner mutations. [admin.ts, license-expiry-check.ts]

## Deferred from: code review of 22-6-prescribing-anomaly-alert-review (2026-05-15)

- **W1: Module-level controlled codes cache shared across serverless requests** — `getControlledCodes()` uses module-level `let` cache with 60s TTL. Stale data risk and potential cross-context contamination if RLS policies restrict medication visibility. [admin.ts:1401-1419]
- **W2: Fallback detection loads entire medication_requests table into memory** — `detectControlledSubstanceVolumeFallback` and `detectDrugFrequency` accumulate all prescription rows in Maps/Sets with no upper bound. Performance risk at scale for busy clinics. [anomaly-detection.ts:150-233]
- **W3: Date window uses UTC boundaries, may misalign with local clinic timezones** — `new Date().toISOString().split('T')[0]` uses UTC date. Prescriptions authored near midnight in UTC+4.5 (Afghanistan) may be systematically misclassified. Cross-cutting timezone design decision. [anomaly-detection.ts:36-39]

## Deferred from: code review of 22-2-kyc-verification-dashboard (2026-05-15)

- **W1: `ConfidenceIndicator` may show 8500% if OCR returns 0-100 range** — Depends on Story 22.5 OCR output normalization. [[submissionId]/page.tsx:69]
- **W2: `storageKey` path traversal risk if provider upload flow doesn't validate** — If `storageKey` is attacker-controlled via 22.5 upload, signed URL could reference arbitrary objects. Verify in Story 22.5 implementation. [admin.ts:813-820]
- **W3: SLA breach row highlight lacks screen reader/ARIA indicator** — `bg-red-50` background only; no `aria-label` or role for accessibility. [providers/page.tsx:168-171]
- **W4: `KycQueueEntry` type duplicated in shared-types and UI pages** — Same interface defined in three places. [kyc.ts:55-66, providers/page.tsx:9-21]
- **W5: `KycDocument.documents` typed non-nullable but DB column may be null** — Backend uses `?? []` fallback suggesting nullability. [kyc.ts:22, admin.ts:804]

## Deferred from: code review of 23-0-redis-infrastructure-provisioning (2026-05-15)

- **W1: No graceful Redis shutdown (SIGTERM handler)** — No `process.on('SIGTERM')` to call `client.quit()` during deployment rollover. On managed Redis (Upstash/ElastiCache), rapid instance restarts could exhaust connection limits. Platform-level concern for Vercel/serverless. [redis.ts]
- **W2: Hardcoded version `0.1.0` in health check** — Health endpoint returns hardcoded version string. Will drift from actual package version. Should read from package.json or env var. Pre-existing. [health.ts:43]
- **W3: Rate limiter `resetEpoch` calculation produces meaningless timestamp** — `resetEpoch = (windowKey + 1) * config.windowSec` produces a 1970-era Unix timestamp. Should multiply by 1000 for milliseconds. Pre-existing in rateLimit.ts. [rateLimit.ts:58-59]
- **W4: CJS direct invocation guard incompatible with ESM/tsx** — `require.main === module` idiom does not work under `npx tsx` (ESM loaders). Direct invocation silently fails. Low impact. [cron-runner.ts:70]

## Deferred from: code review of 23-1-infrastructure-application-metrics-collection (2026-05-16)

- **W1: Module-level singleton state unreliable in serverless** — Alert state (debounce, auto-resolve) and metric accumulators are in-memory singletons. Cold starts reset state; multi-instance deployments cause duplicate alerts. Architectural limitation of chosen in-memory approach. Revisit when deployment model is decided.
- **W2: collectDefaultMetrics timer leak in dev (HMR)** — `collectDefaultMetrics()` starts an interval with no stored reference. HMR creates duplicate intervals. Dev-mode only.
- **W3: Disk and network metrics absent (AC#2)** — Dev notes document these as infrastructure-layer (Vercel/CloudWatch) responsibility, not application-level.
- **W4: sendAlert blocks evaluation loop if webhook is slow**
- **D2: No scheduler invokes alerting functions** — `evaluateP95Alerts()`, `evaluateErrorRateAlerts()`, `runSyncQueueMonitor()` are exported but never registered in a cron/timer. Alerting logic is tested but dead code in production without wiring. Needs a cron integration story.
- **D3: Sync queue query assumes pre-aggregated view** — `supabase.from('sync_queue').select('spoke_type, count, oldest_created_at')` expects aggregated columns. Verify schema or create a DB view/RPC when sync queue table is confirmed. — `sendAlert()` is awaited inside the for-loop. Slow webhooks stall the entire 60s evaluation cycle. Could use fire-and-forget or Promise.allSettled.

## Deferred from: code review of 23-2-clinical-safety-metrics-alerting (2026-05-16)

- **W5: `sendAlert` bypasses AuditLogger hash chain** — `alert-notifier.ts:56` inserts directly into `audit_events` via Supabase, bypassing the `AuditLogger` class and its SHA-256 hash chaining. Pre-existing from Story 23.1.
- **W6: Concurrent monitor runs can fire duplicate alerts** — If Redis is unavailable, the cron lock is fail-open and two concurrent invocations can both run the monitor, emitting identical P1 alerts. Needs infrastructure-level deduplication or at-least-once delivery with idempotency keys.
- **W7: Negative resolution times silently accepted in monthly report** — `clinical-safety-report.ts:172` — if `resolved_at` < `created_at` due to clock skew, resolution time is negative, pulling down average/p95 stats. Low impact but could distort report.

## Deferred from: code review of 23-3-audit-chain-integrity-monitoring (2026-05-16)

- **W8: No staleness detection — no alert when cron stops running** — If the audit chain verification cron silently stops (misconfigured schedule, deployment issue), the chain goes unverified indefinitely with no automated alert. Infrastructure-level monitoring concern applicable to all cron jobs, not specific to this story.
- **W9: Admin portal component tests not implemented** — 2 tests for audit page render (chain status cards) and "Run Full Verification" button loading state are deferred due to missing React testing infrastructure for admin-portal.

## Deferred from: code review of 24-2-empathy-translation-engine-prescription-tts (2026-05-16)

- **W10: No rate limiting on TTS generation endpoint** — `medication.generatePrescriptionAudio` calls external paid TTS API with no per-user/per-patient rate limit. A malicious or buggy client could run up API costs. Cross-cutting infrastructure concern applicable to all external API-calling endpoints.
- **W11: Audio stored without field-level encryption in Supabase Storage** — Synthesized audio (verbally states medication + dosage) uploaded as plain MP3 to Supabase Storage. Platform-level encryption-at-rest may cover this, but not app-layer AES-256-GCM as CLAUDE.md requires for PHI columns. Investigate Supabase Storage encryption guarantees.
- **W12: Playback completion logging silently drops when offline** — `logPlaybackCompletion` in tts-api.ts fires network request with `.catch(() => {})`. Offline fragment playback (the exact scenario where this matters) always fails. Monthly playback rate report under-counts offline usage. Needs offline event queue (Epic 24.4 scope).
- **W13: expo-av may cache media in OS temp directory beyond playback** — `Audio.Sound.createAsync({ uri })` may write to device temp cache. While `unloadAsync()` is called, OS-level media cache is not explicitly purged. Platform investigation needed to verify PHI retention risk.

## Deferred from: code review of 24-3-paper-prescription-ocr (2026-05-16)

- **W14: complete procedure passes empty string for patientRef to createMedicationStatementOnDispense** — Pre-existing in `medication.ts` `complete` procedure. A prescription with null `subject_reference` produces a MedicationStatement with `subjectReference: ''` (invalid FHIR reference).
- **W15: setTimeout TTS audio cleanup unreliable in serverless/container deployment** — Pre-existing. In-process `setTimeout(..., 15min)` is lost on process recycle. Needs Supabase cron or scheduled function to sweep `tts-audio/` bucket.
- **W16: voidPrescription audit event discards caller-supplied input.reason** — Pre-existing. Audit metadata hardcodes `reason: 'prescription_voided'` instead of using `input.reason`. Clinical justification lost from audit trail.
- **W17: RTL snapshot tests for paper-rx page not implemented** — Acknowledged in story tasks. Requires snapshot infrastructure setup.
- **W18: PharmacyDashboard filter counts retryCount>0, misses first-attempt failures with retryCount===0** — Dashboard shows freshly failed sync items as "pending" not "failed". Requires alignment between `deriveSyncStatus` in queue-data.ts and dashboard filter logic.

## Deferred from: code review of 24-1-ai-clinical-scribe-soap-note-parsing (2026-05-16)

- **W19: No Tab navigation between S/O/A/P sections (AC 10)** — SOAP editor relies on browser default Tab behavior. Custom Tab-to-next-section requires UX design decision on whether to override browser defaults.
- **W20: Hardcoded fallback URL localhost:3000 in getHubApiUrl** — Pre-existing pattern in ai-scribe-service.ts. Misconfigured production would silently send requests to localhost.
- **W21: Module-level consent cache has no size bound** — `aiConsentCache` Map in ai-scribe-service.ts grows unbounded. Negligible for typical clinic volumes but should add LRU eviction for high-throughput deployments.

## Deferred from: code review of 24-4-edge-ai-model-update-service (2026-05-16)

- **W22: Staleness banner not wired into any UI component** — `getStalenessBannerMessage()` exported from model-staleness-checker.ts but no .tsx consumer renders it. UI integration belongs to a frontend wiring task.
- **W23: `startModelUpdateScheduler` never called from app entry points** — Scheduler exported but never imported by app layout or root component. App initialization wiring is separate integration work.
- **W24: `isDrugDatabaseStale` never called from prescription workflow** — Function exists but PrescriptionEntry doesn't gate on it. Prescription workflow integration belongs to drug-interaction story wiring.
