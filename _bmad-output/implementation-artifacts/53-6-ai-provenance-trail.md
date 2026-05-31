# Story 53.6: AI Provenance Trail

Status: pending

## Story

As a lab manager or regulator,
I want every AI-assisted action to be logged with full provenance,
So that I can always answer "Did AI make this decision?" with verifiable evidence.

## Context

Regulatory bodies and lab accreditation standards require traceability for all clinical decisions. When AI assists in any capacity — anomaly flagging, consultation formatting, or future features — every interaction must be logged with enough detail to reconstruct what happened: what the AI received (described without PHI), what it output, how confident it was, what the technician decided, and what the physician confirmed.

This story extends the existing audit infrastructure in Lab-Lite (`apps/lab-lite/src/lib/audit-client.ts`) with a dedicated AI provenance layer. The provenance trail is **append-only and hash-chained** (consistent with CLAUDE.md's audit requirements: "append-only with SHA-256 hash chaining — never update or delete audit records"). Provenance records are stored in Dexie for offline access and synced to Hub for centralized querying.

The provenance trail is distinct from the general audit log — it captures AI-specific metadata (model version, confidence score, input description) that the standard audit events don't carry. However, it uses the same underlying `@ultranos/audit-logger` infrastructure and `DexieAuditAdapter` for consistency.

**PRD Requirements:** FR53 (brainstorm #20, #108)
**Dependencies:** Story 17.5 / 29.3 (Audit logger migration — done), Story 43.1 (Immutable Result Audit Chain — hash-chaining pattern)

## Acceptance Criteria

1. [ ] Every AI-assisted interaction in Lab-Lite creates a provenance record with: model version (or ONNX model hash for offline models), input description (no PHI — e.g., "CBC result set, 5 numeric values"), AI output (what it suggested or flagged), confidence score, technician decision, and physician confirmation.
2. [ ] The provenance trail is immutable: append-only storage with SHA-256 hash chaining. Each record's hash includes the previous record's hash, creating a tamper-evident chain.
3. [ ] Provenance records are queryable by date range: "Show all AI-assisted decisions from [start] to [end]."
4. [ ] Provenance records are stored locally in Dexie and synced to Hub when online (using the existing `AuditDrainWorker` pattern from Story 49 architecture).
5. [ ] The provenance record explicitly separates: what the AI suggested, what the tech decided, and what the physician confirmed — making it clear at every step whether a human or AI made each decision.
6. [ ] Input descriptions in provenance records NEVER contain PHI — only structural descriptions like "CBC result set, 7 numeric values" or "Urinalysis, 5 numeric + 2 coded values."
7. [ ] The provenance trail integrates with the existing `@ultranos/audit-logger` client architecture (same adapter pattern, same drain worker, same hash-chaining).
8. [ ] A `verifyProvenanceChain(dateRange)` function re-computes SHA-256 hashes for all provenance records in the range and returns chain integrity status.
9. [ ] Comprehensive tests cover: provenance record creation, hash chain integrity, tamper detection, PHI guard (no PHI in input descriptions), date range query, offline storage and sync.

## Tasks / Subtasks

- [ ] **Task 1: Provenance Record Data Model** (AC: 1, 5, 6)
  - [ ] Create `apps/lab-lite/src/lib/ai-provenance.ts` with type definitions:
    ```typescript
    interface AiProvenanceRecord {
      id: string                          // UUID
      timestamp: string                   // ISO 8601
      hlcTimestamp: string                // HLC for sync ordering

      // AI Model Information
      modelVersion: string                // e.g., 'rule-engine-v1.0.0', 'gpt-4o-mini-2024-07-18'
      modelHash: string | null            // SHA-256 hash for offline ONNX models, null for cloud APIs
      modelType: 'rule_engine' | 'cloud_llm' | 'edge_onnx'

      // Input (no PHI)
      inputDescription: string            // structural description only (e.g., 'CBC result set, 7 numeric values')
      inputFieldCount: number             // number of input fields/values
      inputTemplateCode: string | null     // LOINC template code (if applicable)

      // AI Output
      aiOutput: string                    // what the AI suggested/flagged (may contain clinical terms but never PHI)
      confidenceScore: number             // 0.0 - 1.0
      confidenceLevel: ConfidenceLevel    // HIGH | MEDIUM | LOW

      // Human Decisions
      techDecision: TechDecision | null   // null until tech acts
      physicianConfirmation: PhysicianConfirmation | null  // null until physician reviews

      // Chain Integrity
      previousHash: string | null         // SHA-256 hash of previous record (null for first record)
      recordHash: string                  // SHA-256 hash of this record (computed on creation)

      // Metadata
      sourceFeature: string               // 'anomaly-detection' | 'consultation-formatter' | etc.
      sampleId: string | null             // opaque reference (no PHI)
      syncStatus: 'pending' | 'synced'
    }

    interface TechDecision {
      action: 'accepted' | 'modified' | 'rejected' | 'deferred'
      modifiedOutput?: string             // what the tech changed (if modified)
      decisionTimestamp: string
      techId: string                      // opaque user ID
    }

    interface PhysicianConfirmation {
      action: 'confirmed' | 'overridden' | 'dismissed'
      notes?: string                      // physician's note (optional)
      confirmationTimestamp: string
      physicianId: string                 // opaque user ID
    }
    ```
  - [ ] Export `ConfidenceLevel` re-export from `confidence.ts` (Story 53.5).

- [ ] **Task 2: Dexie Schema Update** (AC: 4)
  - [ ] Add `ai_provenance` table to Dexie schema: `&id, timestamp, hlcTimestamp, sourceFeature, sampleId, syncStatus, [timestamp+sourceFeature]`.
  - [ ] Create migration to next Dexie version.
  - [ ] Compound index on `[timestamp+sourceFeature]` for efficient date range + feature queries.

- [ ] **Task 3: Hash Chain Implementation** (AC: 2, 8)
  - [ ] Create `apps/lab-lite/src/lib/provenance-chain.ts`.
  - [ ] Implement `computeRecordHash(record: Omit<AiProvenanceRecord, 'recordHash'>, previousHash: string | null): Promise<string>`:
    - Serialize record fields (excluding `recordHash` and `syncStatus`) to a canonical JSON string.
    - Prepend `previousHash` (or empty string for first record).
    - Compute SHA-256 hash using Web Crypto API (`crypto.subtle.digest`).
    - Return hex-encoded hash string.
  - [ ] Implement `getLastProvenanceHash(): Promise<string | null>`:
    - Query Dexie for the most recent provenance record.
    - Return its `recordHash`, or `null` if no records exist.
  - [ ] Implement `verifyProvenanceChain(startDate: string, endDate: string): Promise<ChainVerificationResult>`:
    ```typescript
    interface ChainVerificationResult {
      valid: boolean
      checkedCount: number
      brokenAt?: string                   // record ID where chain breaks
      firstRecordTimestamp?: string
      lastRecordTimestamp?: string
    }
    ```
    - Query all records in the date range, ordered by timestamp.
    - Re-compute each record's hash and verify it matches `recordHash`.
    - Verify each record's `previousHash` matches the prior record's `recordHash`.
    - Return result.
  - [ ] Unit tests: valid chain verification, tamper detection (modified record breaks chain), empty range, single-record chain.

- [ ] **Task 4: Provenance Record Creation API** (AC: 1, 6, 7)
  - [ ] In `apps/lab-lite/src/lib/ai-provenance.ts`, implement:
    ```typescript
    async function createProvenanceRecord(
      input: Omit<AiProvenanceRecord, 'id' | 'previousHash' | 'recordHash' | 'syncStatus' | 'techDecision' | 'physicianConfirmation'>
    ): Promise<string>  // returns record ID
    ```
  - [ ] Auto-generates `id` (UUID), fetches `previousHash`, computes `recordHash`, sets `syncStatus: 'pending'`.
  - [ ] Validates `inputDescription` does NOT contain common PHI patterns (names, dates of birth, medical record numbers) — throw if PHI detected. Use a simple regex guard, not an exhaustive filter.
  - [ ] Stores record in Dexie `ai_provenance` table.
  - [ ] Emits an `AI_PROVENANCE_CREATED` audit event via the existing audit client.

- [ ] **Task 5: Tech Decision & Physician Confirmation Updates** (AC: 1, 5)
  - [ ] Implement `recordTechDecision(provenanceId: string, decision: TechDecision): Promise<void>`:
    - Reads the provenance record from Dexie.
    - Sets `techDecision` field (append — does not modify existing fields).
    - Does NOT recompute hash (the original record's hash is immutable; the decision is an addendum).
    - Emits `AI_TECH_DECISION_RECORDED` audit event.
  - [ ] Implement `recordPhysicianConfirmation(provenanceId: string, confirmation: PhysicianConfirmation): Promise<void>`:
    - Same pattern as tech decision.
    - Emits `AI_PHYSICIAN_CONFIRMATION_RECORDED` audit event.
  - [ ] Design note: Tech decisions and physician confirmations are stored as sub-documents on the provenance record, not as separate records. This keeps the full provenance context in one queryable document. The hash chain covers the initial AI output; human decisions are addenda tracked by separate audit events.

- [ ] **Task 6: Date Range Query** (AC: 3)
  - [ ] Implement `queryProvenance(startDate: string, endDate: string, options?: { sourceFeature?: string }): Promise<AiProvenanceRecord[]>`:
    - Query Dexie `ai_provenance` table using the compound index `[timestamp+sourceFeature]`.
    - Filter by date range and optional source feature.
    - Return records ordered by timestamp ascending.
  - [ ] This is a local-only query (operates on Dexie data). Hub-side querying is a future Hub API feature.

- [ ] **Task 7: Sync Integration** (AC: 4)
  - [ ] Extend the existing `AuditDrainWorker` pattern to sync provenance records to Hub.
  - [ ] Create a `ProvenanceDrainWorker` (or extend the existing drain worker) that:
    - Queries Dexie for records with `syncStatus: 'pending'`.
    - Sends to Hub API endpoint (e.g., `/ai-provenance.sync`).
    - Updates `syncStatus` to `'synced'` on success.
  - [ ] Sync includes the hash chain — Hub can verify chain integrity on receipt.

- [ ] **Task 8: Tests** (AC: 9)
  - [ ] Unit tests for `createProvenanceRecord()`: correct field population, hash computation, PHI guard rejection.
  - [ ] Unit tests for hash chain: create 5 sequential records, verify chain, tamper one, verify chain breaks.
  - [ ] Unit tests for `recordTechDecision()` and `recordPhysicianConfirmation()`: addendum pattern, audit event emission.
  - [ ] Unit tests for `queryProvenance()`: date range filtering, source feature filtering, empty range.
  - [ ] PHI guard tests: verify `inputDescription` rejects strings containing name patterns, DOB patterns, MRN patterns.
  - [ ] Integration test: create provenance -> record tech decision -> record physician confirmation -> verify chain -> query by date range.

## Dev Notes

- **Extends existing audit infrastructure.** The provenance trail uses the same `@ultranos/audit-logger` client and `DexieAuditAdapter` pattern established in `apps/lab-lite/src/lib/audit-client.ts`. It adds a dedicated Dexie table (`ai_provenance`) with AI-specific fields, but audit events for provenance actions flow through the existing audit pipeline.
- **Hash chain design.** The hash chain covers the initial provenance record (AI output, input description, confidence). Human decisions (tech decision, physician confirmation) are stored as sub-documents on the same record but are NOT included in the hash chain — they are tracked by separate audit events. This design allows human decisions to be recorded after the fact without invalidating the hash chain.
- **PHI guard is defense-in-depth.** The `inputDescription` field is populated by the calling code (anomaly engine, consultation formatter), which should already strip PHI. The provenance module adds a regex-based guard as a second layer. This is NOT a comprehensive PHI detector — it catches obvious patterns (names, DOBs, MRNs) but relies on callers to provide clean descriptions.
- **No PHI in provenance records.** `inputDescription` says "CBC result set, 7 numeric values" — never "John's CBC shows WBC 50,000." `sampleId` is an opaque identifier. `aiOutput` may contain clinical terms ("Combination of elevated LDH and low haptoglobin detected") but never patient identifiers.
- **CLAUDE.md alignment:** "Audit every PHI access" and "append-only with SHA-256 hash chaining — never update or delete audit records." The provenance trail is append-only by design. The Dexie table does allow `put()` for adding tech decisions and physician confirmations, but the `recordHash` is immutable and any modification to chain-critical fields would be detected by `verifyProvenanceChain()`.
- **Sync to Hub.** Provenance records sync using the same store-and-forward pattern as audit events. The Hub API endpoint (`/ai-provenance.sync`) is a future Hub API story — this story only implements the client-side sync infrastructure.
- **Web Crypto API for hashing.** Use `crypto.subtle.digest('SHA-256', ...)` which is available in all modern browsers and service workers. No additional crypto dependencies needed.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.6)
- Existing audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Audit logger package: `packages/audit-logger/`
- Hash chaining pattern: Story 43.1 (Immutable Result Audit Chain)
- Confidence types: Story 53.5
- Dexie database: `apps/lab-lite/src/lib/db.ts`
- CLAUDE.md: "Audit every PHI access", "append-only with SHA-256 hash chaining"
- CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate"
