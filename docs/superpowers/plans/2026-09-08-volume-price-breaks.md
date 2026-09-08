# Wholesale Volume / Quantity Price Breaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add quantity-tiered pricing to per-(customer, item) contract prices: a `tiers` array on `ContractPrice`, `resolveContractPrice(customer, item, quantity)` tier selection, order-line re-resolution on quantity change, a tiers editor on the customer detail page, and one JSONB column reusing the existing ContractPrice sync.

**Architecture:** `ContractPrice` gains `tiers: {minQuantity, priceMinor}[]` (JSONB on the Hub). The flat `priceMinor` stays the below-first-break base price. Resolution picks the highest tier with `minQuantity ≤ quantity`, else the base. Sync reuses ContractPrice push/pull/delete (add one `tiers` JSONB column + a one-line flattener passthrough; pull is already generic).

**Tech Stack:** Next.js/Dexie/Vitest (pharmacy-lite), Node/tRPC/Supabase (hub-api).

**Spec:** `docs/superpowers/specs/2026-09-08-volume-price-breaks-design.md`

## Global Constraints

- **Tier model:** `PriceBreak { minQuantity: number; priceMinor: number }`; `ContractPrice.tiers?: PriceBreak[]` ascending by `minQuantity`. The flat `priceMinor` = base price for quantities below the first break. Backward compatible (tier-less rows behave as today).
- **Resolution:** `resolveContractPrice(customerId, catalogItemId, quantity = 1)` → largest tier with `minQuantity ≤ quantity`, else base `priceMinor`, else `null` (no row). `quantity` DEFAULTS to 1 so existing callers stay valid.
- **Money:** integer minor units everywhere, incl. tier `priceMinor` (a JSON integer inside the `tiers` JSONB — NOT a BIGINT column). `db.toRow`/`db.fromRows` recurse (snake `min_quantity`/`price_minor` at rest, camel on pull) — same as `SalesOrder.lines`.
- **Sync reuse:** NO new resource type. Add `tiers JSONB NOT NULL DEFAULT '[]'` to `contract_prices`; `flattenContractPrice` adds `tiers: p.tiers ?? []`; pull unchanged (`tiers` rides in `...rest`). Delete-sync tombstone path unaffected.
- **Order line:** pass the line quantity to resolution; re-resolve on quantity change; a manual per-line price override still wins; pack unit still × packSize on the resolved base.
- **DB ops via Supabase MCP only.** Migration applied live (user-authorized standing directive).
- **NO-COMMIT mode:** implement + test, never `git add`/`git commit`.

---

## File Structure

**Create:** `supabase/migrations/051_contract_prices_tiers.sql`.
**Modify:** `apps/hub-api/src/lib/resource-mappers.ts` (flatten passthrough) + `apps/hub-api/src/__tests__/sync.test.ts` (tiers round-trip); `apps/pharmacy-lite/src/lib/wholesale/types.ts` (PriceBreak + tiers) + `contract-price-service.ts` (setContractPrice tiers + resolveContractPrice quantity) + its test; `apps/pharmacy-lite/src/components/pharmacy/wholesale/NewOrderPage.tsx` (quantity-aware resolution) + its test; `apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomerDetailPage.tsx` (tiers editor) + its test; `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts` (tiers survive pull).

---

### Task 1: Migration `051` + Hub flatten passthrough + round-trip test

**Files:** Create `supabase/migrations/051_contract_prices_tiers.sql`; Modify `apps/hub-api/src/lib/resource-mappers.ts`, `apps/hub-api/src/__tests__/sync.test.ts`.

- [ ] **Step 1:** `list_migrations` (confirm `051` free). Write `051_contract_prices_tiers.sql`:
```sql
ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
```
Apply via `apply_migration` (name `051_contract_prices_tiers`). Verify via `execute_sql`: `SELECT data_type FROM information_schema.columns WHERE table_name='contract_prices' AND column_name='tiers';` → `jsonb`.
- [ ] **Step 2: Write the failing test** — add to the ContractPrice push block in `sync.test.ts`: a ContractPrice push whose payload includes `tiers: [{minQuantity:10, priceMinor:1500}]` lands the tiers on the upserted row (assert `upsertedRow.tiers` has length 1 with `minQuantity:10`/`priceMinor:1500` — the mock row is camelCase pre-`db.toRow`, per precedent). Run `pnpm -F hub-api test sync` → FAIL (flattener drops `tiers`).
- [ ] **Step 3: Implement** — in `flattenContractPrice`, add `tiers: p.tiers ?? []` to the returned object (keep `price: p.priceMinor` and the rest).
- [ ] **Step 4:** `pnpm -F hub-api test sync` → PASS (+ existing sync green).
- [ ] **Step 5: Commit** (checkpoint — skip in NO-COMMIT).

**NOTE:** Controller may run the migration directly via Supabase MCP (as with 048/049/050).

---

### Task 2: Client model + service (tiers + quantity resolution)

**Files:** Modify `apps/pharmacy-lite/src/lib/wholesale/types.ts`, `apps/pharmacy-lite/src/lib/wholesale/contract-price-service.ts`; Test `apps/pharmacy-lite/src/__tests__/contract-price-service.test.ts` (+ a tiers-survive-pull case in `wholesale-pull.test.ts`).

**Interfaces:**
- Produces: `PriceBreak` type; `ContractPrice.tiers?`; `setContractPrice({..., tiers?})`; `resolveContractPrice(customerId, catalogItemId, quantity?)`.

- [ ] **Step 1: Write failing tests** (add to `contract-price-service.test.ts`):
```ts
it('resolveContractPrice returns the base price below the first break and the tier at/above it', async () => {
  await setContractPrice({ customerId: 'c1', catalogItemId: 'i1', priceMinor: 2000, createdBy: 'p1', tiers: [{ minQuantity: 10, priceMinor: 1500 }, { minQuantity: 100, priceMinor: 1200 }] })
  expect(await resolveContractPrice('c1', 'i1', 1)).toBe(2000)   // below first break → base
  expect(await resolveContractPrice('c1', 'i1', 9)).toBe(2000)
  expect(await resolveContractPrice('c1', 'i1', 10)).toBe(1500)  // at break
  expect(await resolveContractPrice('c1', 'i1', 50)).toBe(1500)  // between breaks
  expect(await resolveContractPrice('c1', 'i1', 120)).toBe(1200) // highest applicable
})
it('resolveContractPrice defaults quantity to 1 and returns null when no row', async () => {
  expect(await resolveContractPrice('c1', 'none')).toBeNull()
})
it('setContractPrice persists tiers on the row (sorted) and enqueues them', async () => {
  const cp = await setContractPrice({ customerId: 'c2', catalogItemId: 'i2', priceMinor: 900, createdBy: 'p1', tiers: [{ minQuantity: 100, priceMinor: 700 }, { minQuantity: 10, priceMinor: 800 }] })
  expect(cp.tiers?.map((t) => t.minQuantity)).toEqual([10, 100]) // sorted ascending
  const enq = (await db.syncQueue.toArray()).find((e) => e.resourceId === cp.id)
  expect(enq).toBeTruthy()
})
```
Also add to `wholesale-pull.test.ts`: a pulled ContractPrice whose Hub `data` includes `tiers:[{minQuantity:10,priceMinor:1500}]` lands with `tiers` preserved on the local row (generic passthrough — no code change, just proves it).
- [ ] **Step 2:** `pnpm -F pharmacy-lite test contract-price-service wholesale-pull` → FAIL (tiers not persisted; resolve ignores quantity).
- [ ] **Step 3: Implement:**
  - `types.ts`: add `PriceBreak` + `tiers?: PriceBreak[]` to `ContractPrice` (per spec §3.1).
  - `contract-price-service.ts`:
    - `setContractPrice` param gains `tiers?: PriceBreak[]`; normalize (`(tiers ?? []).filter(t => t.minQuantity > 0 && Number.isFinite(t.priceMinor)).sort((a,b)=>a.minQuantity-b.minQuantity)`) and store on the row (both the create and the update-existing branch). The enqueue payload already serializes the whole row → tiers ride along.
    - `resolveContractPrice(customerId, catalogItemId, quantity = 1)` → per spec §3.2 tier logic.
- [ ] **Step 4:** `pnpm -F pharmacy-lite test contract-price-service wholesale-pull` → PASS (+ existing green).
- [ ] **Step 5: Commit** (checkpoint — skip).

---

### Task 3: Order-line quantity-aware resolution (`NewOrderPage.tsx`)

**Files:** Modify `apps/pharmacy-lite/src/components/pharmacy/wholesale/NewOrderPage.tsx`; Test `apps/pharmacy-lite/src/__tests__/WholesaleNewOrderPage.test.tsx`.

**Interfaces:** Consumes `resolveContractPrice(customerId, itemId, quantity)`.

- [ ] **Step 1: Write failing tests** (add to `WholesaleNewOrderPage.test.tsx`; the file already mocks `resolveContractPrice`): make the mock quantity-aware (e.g. `resolveContractPrice(cust, item, qty) => qty >= 10 ? 1500 : 2000` for c1/i1). Assert: adding item i1 at qty 1 prices the line at 2000; increasing the line quantity to 12 re-prices it to 1500 (assert via the line's unit price input value or via submit → `mockCreateDraft` line `unitPrice`). Keep the existing contract/fallback + snapshot tests green.
- [ ] **Step 2:** `pnpm -F pharmacy-lite test WholesaleNewOrderPage` → FAIL (quantity not passed / no re-resolve on qty change).
- [ ] **Step 3: Implement** — `resolveLineUnitPriceMinor(customerId, item, unit, quantity)` passes `quantity` to `resolveContractPrice`. On the quantity `<input onChange>`, after updating the line's quantity, re-resolve that line's `unitPriceMinor` from the new quantity (unless the line was manually overridden — a manual price still wins; reuse whatever override-tracking the file already has, or: re-resolve only lines with a `catalogItemId` and skip if the operator has manually edited the price). Keep add / unit-change / customer-change re-resolution, now passing the line's current quantity. Pack unit still × packSize on the resolved base.
- [ ] **Step 4:** `pnpm -F pharmacy-lite test WholesaleNewOrderPage` → PASS (+ existing incl. snapshots green).
- [ ] **Step 5: Commit** (checkpoint — skip).

---

### Task 4: Tiers editor on the customer detail page (`CustomerDetailPage.tsx`)

**Files:** Modify `apps/pharmacy-lite/src/components/pharmacy/wholesale/CustomerDetailPage.tsx`; Test `apps/pharmacy-lite/src/__tests__/WholesaleCustomerDetailPage.test.tsx` (+ new i18n keys in all 4 message files).

**Interfaces:** Consumes `setContractPrice({..., tiers})`, `getContractPrices` (rows now carry `tiers`).

- [ ] **Step 1: Write the failing test** — render the detail page with a contract-price row that has `tiers: [{minQuantity:10, priceMinor:1500}]` (mock `getContractPrices` to return it); assert the tier is shown (e.g. text containing the min quantity `10`). Add an "add volume break" interaction: entering a minQuantity + price and submitting calls `setContractPrice` with a `tiers` array including the new break. (Adapt to the file's existing mock harness.)
- [ ] **Step 2:** `pnpm -F pharmacy-lite test WholesaleCustomerDetailPage` → FAIL (no tiers UI).
- [ ] **Step 3: Implement** — in the Contract-prices card, under each price row render its `tiers` (minQuantity · unit price via `formatAmount` · remove-tier) and an add-tier sub-row (minQuantity number input + major-unit price input → append to the row's tiers → `setContractPrice({ customerId: id, catalogItemId: row.catalogItemId, priceMinor: row.priceMinor, createdBy: getPractitionerRef(), tiers: nextTiers })` then reload). Money conversion via `parseMajorToMinor`/`formatAmount`. Only show tiers UI when present or behind an "Add volume break" affordance. Layout standard + semantic tokens + logical RTL + `@ultranos/ui-kit/icons`. Add the new `wholesale.*` i18n keys (e.g. `volumeBreaks`, `addVolumeBreak`, `minQuantity`, `breakPrice`, `removeBreak`) to ALL FOUR message files (`en`/`ar`/`prs`/`ps`) — native translations where straightforward, English fallback acceptable (note it).
- [ ] **Step 4:** `pnpm -F pharmacy-lite test WholesaleCustomerDetailPage` → PASS.
- [ ] **Step 5: Add LTR+RTL snapshots + commit** (checkpoint — skip commit).

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Hub** — `pnpm -F hub-api test sync` → tiers round-trip case + existing green.
- [ ] **Step 2: Pharmacy** — `pnpm -F pharmacy-lite test contract-price-service wholesale-pull WholesaleNewOrderPage WholesaleCustomerDetailPage` → new cases pass; existing green (only the known `DatabaseClosedError` flake tolerated).
- [ ] **Step 3: Typecheck** — `pnpm -F pharmacy-lite typecheck` (slice files clean) + `pnpm -F hub-api typecheck` (no NEW `resource-mappers.ts` errors; pre-existing noise out of scope).
- [ ] **Step 4: Live (deferred)** — set a break (10+ @ lower) for a customer/item, start an order, type qty 12 → line auto-prices to the break. Else record deferred.

---

## Self-Review

**Spec coverage:** §3.1 type → T2. §3.2 resolve + §setContractPrice tiers → T2. §4 order line → T3. §5 UI → T4. §6.1 migration + §6.2 flatten → T1; §6.3 pull (no change) → proven by T2's pull test. §7 tests → each task + T5.

**Placeholder scan:** no TBD/TODO. T3/T4 defer exact harness specifics to "the file's existing pattern" (real code the implementer reads) but give concrete resolution logic + assertions + money conversion.

**Type consistency:** `PriceBreak { minQuantity, priceMinor }` consistent T2 (type/service) ↔ T1 (Hub JSONB inner keys min_quantity/price_minor) ↔ T3 (resolution) ↔ T4 (UI). `resolveContractPrice(customerId, catalogItemId, quantity=1)` consistent T2 ↔ T3. Migration `051`. Backward-compat: tier-less rows → base price (default quantity 1).
