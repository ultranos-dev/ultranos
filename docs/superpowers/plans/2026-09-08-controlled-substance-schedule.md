# Controlled-Substance Schedule on Dispense — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Capture the controlled-substance schedule (II/III/IV/V) on each `MedicationDispense` at fulfillment time so the Controlled Substances register displays the schedule and filters to controlled-only — replacing the hardcoded `"---"` placeholder + "shows ALL dispenses" TODO in `ControlledSubstancesView`.

**Design / current state (verified):**
- `ControlledSubstancesView.tsx:13-19,322-323` shows `"---"` for Schedule and lists ALL dispenses because `MedicationDispense` has no schedule field (explicit TODO). The "Running Balances" section already resolves schedule from `CatalogItem.controlledSchedule` via `getControlledSubstanceBalances()`.
- `CatalogItem.controlledSchedule?: 'II'|'III'|'IV'|'V'` (`inventory/types.ts`).
- The fulfillment store already resolves the local `CatalogItem` for a prescription via `.filter(c => c.name === item.prescription.medN || c.barcode === item.prescription.med)` (`fulfillment-store.ts:170,192,290`) and uses `catalogItem.id` for stock movements — so the schedule is reachable at dispense-creation time (`fulfillment-store.ts:235` calls `createMedicationDispense`).
- `MedicationDispenseUltranosExtSchema` (`packages/shared-types/src/fhir/medication-dispense.schema.ts:30`) already carries `batchLot?: string` — add the schedule alongside.

**Architecture:** capture-at-dispense (authoritative for a regulatory register), not live-lookup. Additive + optional (a non-controlled dispense has no schedule). shared-types is a shared package → rebuild after the schema change (mirrors the crypto/sync-engine rebuilds).

**Tech Stack:** Next.js/Zustand/Dexie/Vitest (pharmacy-lite), `@ultranos/shared-types`.

## Global Constraints

- **Optional end-to-end** — `controlledSubstanceSchedule?: string`; non-controlled dispenses omit it and record exactly as today. No existing dispense test may break.
- **Capture at dispense time** from the resolved `CatalogItem.controlledSchedule` (the item actually dispensed) — authoritative; do NOT resolve live in the view.
- **Register semantics:** once schedule is on dispenses, `ControlledSubstancesView` shows **only** dispenses that have a `controlledSubstanceSchedule` (a true controlled register) and renders the schedule value; the running-balances section is unchanged.
- **No PHI in logs**; the schedule is not PHI (a regulatory class) but the dispense is patient-linked — keep the existing opaque-log pattern.
- **Shared-package rebuild:** after editing `@ultranos/shared-types`, run `pnpm --filter @ultranos/shared-types build` so consumers pick it up.
- **NO-COMMIT mode.**

---

### Task 1: shared-types — add `controlledSubstanceSchedule` + rebuild

**Files:** Modify `packages/shared-types/src/fhir/medication-dispense.schema.ts` (+ its test if one exists).

- [ ] **Step 1:** In `MedicationDispenseUltranosExtSchema` (line ~30, alongside `batchLot`), add `controlledSubstanceSchedule: z.string().optional(),` with a comment (controlled-substance schedule II/III/IV/V, captured at dispense from CatalogItem.controlledSchedule; regulatory register). If there's a schema test, add an assertion that a dispense with `_ultranos.controlledSubstanceSchedule: 'II'` parses.
- [ ] **Step 2:** `pnpm --filter @ultranos/shared-types build` — confirm the built `dist` includes the field. Run `pnpm -F @ultranos/shared-types test` if tests exist.
- [ ] **Step 3: Commit** (skip in NO-COMMIT).

**NOTE:** Controller may do this edit + rebuild directly (small shared-package change).

---

### Task 2: `createMedicationDispense` — populate the schedule

**Files:** Modify `apps/pharmacy-lite/src/lib/medication-dispense.ts`; Test `apps/pharmacy-lite/src/__tests__/medication-dispense.test.ts`.

**Interfaces:** Consumes an optional `controlledSubstanceSchedule` (via the existing options/param path — mirror how `batchLot` is threaded). Produces: `_ultranos.controlledSubstanceSchedule` set when provided.

- [ ] **Step 1: Write the failing test** — passing a `controlledSubstanceSchedule: 'II'` (via the same mechanism batchLot uses — read the file to see whether it comes from the `item` or the 3rd options arg) results in `dispense._ultranos.controlledSubstanceSchedule === 'II'`; omitting it leaves the dispense unchanged (no key). Reuse the existing test harness (it builds FulfillmentItems + calls `createMedicationDispense`).
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test medication-dispense` → FAIL.
- [ ] **Step 3: Implement** — thread `controlledSubstanceSchedule` into `createMedicationDispense` the same way `batchLot` is handled, adding to `_ultranos` conditionally: `...(controlledSubstanceSchedule ? { controlledSubstanceSchedule } : {})`. (If `batchLot` comes off `item`, add a parallel field to `FulfillmentItem`; if via the 3rd options arg, add there. Match the existing pattern exactly — READ the file.)
- [ ] **Step 4: Run to verify PASS** — green (+ existing dispense tests).
- [ ] **Step 5: Commit** (skip).

---

### Task 3: fulfillment-store — source the schedule from the CatalogItem

**Files:** Modify `apps/pharmacy-lite/src/stores/fulfillment-store.ts`; Test its existing test (or a focused case).

**Interfaces:** Consumes `db.catalogItems` (the resolved item's `controlledSchedule`). Produces: `createMedicationDispense` is called with the schedule.

- [ ] **Step 1: Write the failing test** — seed `db.catalogItems` with a controlled item (e.g. `controlledSchedule: 'II'`, matching a fulfilled prescription's `medN`/`med`); run the store's dispense/confirm action; assert the created dispense (in `db.dispenses`) has `_ultranos.controlledSubstanceSchedule === 'II'`. Also a non-controlled item → no schedule on its dispense. Reuse the store test harness.
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test fulfillment` → FAIL.
- [ ] **Step 3: Implement** — at the dispense-creation site (`~line 235`), resolve the CatalogItem for the item using the SAME filter the file already uses (`c.name === item.prescription.medN || c.barcode === item.prescription.med`; the confirm action already does this lookup at ~290 for stock movements — reuse/lift it so it's available where `createMedicationDispense` is called), and pass `catalogItem?.controlledSchedule` into `createMedicationDispense`. Do NOT change the stock-movement or existing dispense logic beyond threading the schedule.
- [ ] **Step 4: Run to verify PASS** — green (+ existing fulfillment/store tests, incl. stock movements).
- [ ] **Step 5: Commit** (skip).

---

### Task 4: `ControlledSubstancesView` — display schedule + controlled-only filter

**Files:** Modify `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx`; Test its existing test (if any) + add cases.

- [ ] **Step 1: Write the failing test** — seed `db.dispenses` with a controlled dispense (`_ultranos.controlledSubstanceSchedule: 'II'`) and a non-controlled one (no schedule); render the view; assert the controlled dispense's row shows `II` (not `---`) and the non-controlled dispense is NOT listed (controlled-only register). (Adapt to the view's test harness / i18n-key-literal convention.)
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test Controlled` → FAIL.
- [ ] **Step 3: Implement** — (a) the schedule cell (line ~322-323): render `d._ultranos?.controlledSubstanceSchedule ?? '---'`; (b) filter the dispense list to only those with a `controlledSubstanceSchedule` (a true controlled-substances register); (c) remove the now-obsolete TODO comment (lines 13-19) and the `{/* controlledSubstanceSchedule not in schema yet */}` note. Keep the running-balances section, date/search filters, and pagination unchanged (pagination now counts only controlled dispenses).
- [ ] **Step 4: Run to verify PASS** — green.
- [ ] **Step 5: Commit** (skip).

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Suites** — `pnpm -F @ultranos/shared-types test` (if any); `pnpm -F pharmacy-lite test medication-dispense fulfillment Controlled` → new cases + existing green (only the known `DatabaseClosedError` flake tolerated).
- [ ] **Step 2: Typecheck** — `pnpm -F pharmacy-lite typecheck` → no NEW errors in `medication-dispense.ts` / `fulfillment-store.ts` / `ControlledSubstancesView.tsx` (pre-existing noise out of scope).
- [ ] **Step 3: Final review** — schedule optional + captured at dispense from the resolved CatalogItem; register filters controlled-only + shows schedule; non-controlled dispenses unaffected; no stock-movement/dispense-logic regression; shared-types rebuilt.

---

## Self-Review

**Coverage:** shared-types field → T1; dispense population → T2; catalog sourcing → T3; view display+filter → T4; verify → T5. **Type consistency:** `controlledSubstanceSchedule?: string` in the ext schema (T1) ↔ set in createMedicationDispense (T2) ↔ passed from the resolved CatalogItem.controlledSchedule (T3) ↔ read in the view (T4). **Placeholder scan:** none (the plan removes the stale TODO in T4). **Backward-compat:** optional; non-controlled dispenses unchanged; only the register's list is now controlled-filtered (intended).
