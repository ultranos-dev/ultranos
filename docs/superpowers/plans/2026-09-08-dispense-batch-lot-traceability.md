# Dispense Batch/Lot Traceability to Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Forward the dispensed `batchLot` from Pharmacy-Lite to the Hub so `MedicationDispense` records carry the manufacturing lot — enabling batch-level recall traceability server-side (the recall-alert feature already exists client-side).

**Design / current state (verified):**
- The pharmacy fulfillment flow captures `batchLot` and stores it on the local dispense at `dispense._ultranos.batchLot` (`apps/pharmacy-lite/src/lib/medication-dispense.ts:50-54`).
- The client `syncDispenseToHub` mutation payload OMITS it (`apps/pharmacy-lite/src/lib/dispense-sync.ts:51-61`).
- The Hub `medication.recordDispense` input schema has no batch field and the insert omits it (`apps/hub-api/src/trpc/routers/medication.ts:739-748` schema, `:855-867` insert).
- The `medication_dispenses` table has no batch column (verified via schema query).
So batch/lot dies at the client→Hub boundary. This slice threads it through.

**Architecture:** additive + backward-compatible. `batch_lot` is a nullable TEXT column (not all dispenses have a lot; a lot number is NOT PHI → plaintext, like `medication_code`). Optional everywhere so existing dispenses/tests are unaffected.

**Tech Stack:** Node/tRPC/Supabase (hub-api), Next.js/Vitest (pharmacy-lite).

## Global Constraints

- **`batch_lot` is non-PHI** (manufacturing lot number) → plaintext column; do NOT add it to crypto `randomizedFields`.
- **Optional/nullable end-to-end** — `batchLot?: string`; a dispense without a lot must still record exactly as today (backward compatible). No existing test may break.
- **Server-verified identity unchanged** — do not touch the `verifiedPharmacistRef` override, idempotency guard, or prescription-status logic. Purely ADD `batch_lot`.
- **Clinical path — no PHI in logs.** `recordDispense` already logs only error codes; preserve that.
- **DB ops via Supabase MCP only.** Migration applied live. **NO-COMMIT mode.**

---

### Task 1: Migration — `medication_dispenses.batch_lot`

**Files:** Create `supabase/migrations/055_medication_dispenses_batch_lot.sql`

- [ ] **Step 1:** `list_migrations` (confirm `055` free; 048-054 used). SQL:
```sql
ALTER TABLE medication_dispenses ADD COLUMN IF NOT EXISTS batch_lot TEXT;
```
- [ ] **Step 2:** `apply_migration` (name `055_medication_dispenses_batch_lot`).
- [ ] **Step 3: Verify** via `execute_sql`: `batch_lot` present, type `text`, is_nullable YES.
- [ ] **Step 4: Commit** (skip in NO-COMMIT).

**NOTE:** Controller may run directly via Supabase MCP.

---

### Task 2: Hub `recordDispense` — accept + store `batchLot`

**Files:** Modify `apps/hub-api/src/trpc/routers/medication.ts`; Test `apps/hub-api/src/__tests__/` (the existing recordDispense test file — find it, e.g. `medication-record-dispense.test.ts` or within `medication*.test.ts`).

**Interfaces:** Produces: `recordDispense` accepts an optional `batchLot` and writes it to `medication_dispenses.batch_lot`.

- [ ] **Step 1: Write the failing test** — in the existing recordDispense test, add a case: a recordDispense call WITH `batchLot: 'LOT-XYZ-123'` results in the insert row carrying `batch_lot: 'LOT-XYZ-123'`. Reuse the file's existing mock harness (it mocks the supabase insert; capture the inserted row). Also confirm an existing no-batch case still inserts `batch_lot: null` (or omitted) without error.
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F hub-api test medication` (or the specific file) → FAIL (schema rejects `batchLot` OR insert lacks `batch_lot`).
- [ ] **Step 3: Implement:**
  - Input schema (~line 739): add `batchLot: z.string().min(1).optional()` (optional — absent for lot-less dispenses).
  - Insert (~line 855-867): add `batch_lot: input.batchLot ?? null,`.
  - Do NOT change anything else in the procedure.
- [ ] **Step 4: Run to verify PASS** — the recordDispense suite green (new + existing).
- [ ] **Step 5: Commit** (skip).

---

### Task 3: Client `dispense-sync` — forward `batchLot`

**Files:** Modify `apps/pharmacy-lite/src/lib/dispense-sync.ts`; Test `apps/pharmacy-lite/src/__tests__/` (the existing dispense-sync test).

**Interfaces:** Consumes `dispense._ultranos.batchLot`. Produces: the mutation payload includes `batchLot` when present.

- [ ] **Step 1: Write the failing test** — in the existing dispense-sync test, add: a dispense whose `_ultranos.batchLot` is set produces a `sync.push`/recordDispense body whose `json.batchLot` equals that value; a dispense WITHOUT a batchLot produces a body with no `batchLot` key (or undefined) and still syncs. Reuse the file's fetch-mock harness (assert on the POSTed body).
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test dispense-sync` → FAIL (payload lacks batchLot).
- [ ] **Step 3: Implement** in `dispense-sync.ts` `mutationPayload` (~line 51-61): add
```ts
...(dispense._ultranos?.batchLot ? { batchLot: dispense._ultranos.batchLot } : {}),
```
(spread-conditional so a lot-less dispense sends no `batchLot` key — matching the Hub's optional schema). Do NOT change the existing required-field validation or the retry/queue path.
- [ ] **Step 4: Run to verify PASS** — dispense-sync suite green (new + existing).
- [ ] **Step 5: Commit** (skip).

---

### Task 4: Verification

**Files:** none.

- [ ] **Step 1: Hub** — `pnpm -F hub-api test medication` (recordDispense) → new batch case + existing green.
- [ ] **Step 2: Pharmacy** — `pnpm -F pharmacy-lite test dispense-sync` (+ `medication-dispense` if touched) → new case + existing green.
- [ ] **Step 3: Typecheck** — `pnpm -F hub-api typecheck` + `pnpm -F pharmacy-lite typecheck` → no NEW errors in `medication.ts` / `dispense-sync.ts` (pre-existing noise out of scope).
- [ ] **Step 4: Live (optional)** — if a session is available, dispense with a batch → confirm `medication_dispenses.batch_lot` is populated on the Hub for that dispense. Else defer.
- [ ] **Step 5: Final review** — dispatch the final reviewer (batchLot optional + nullable end-to-end; no change to identity/idempotency/status logic; non-PHI plaintext; backward compatible).

---

## Self-Review

**Coverage:** migration → T1; Hub schema+insert → T2; client payload → T3; verify → T4. **Type consistency:** `batchLot` (client `_ultranos.batchLot` → payload `batchLot`) ↔ Hub input `batchLot` ↔ column `batch_lot` — symmetric, optional/nullable throughout. Migration `055`. **Placeholder scan:** none. **Backward-compat:** all optional; lot-less dispenses unchanged.
