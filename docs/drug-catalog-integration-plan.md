# Drug-Catalog Integration Plan — OPD-Lite + Pharmacy-Lite

> **Status date:** 2026-06-23
> **Scope:** Integrating the enriched Pharmopedia drug catalog (generics + branded medications + prices) into the OPD-Lite prescription workflow and the Pharmacy-Lite app.
> **Source report:** `docs/drug-catalog-enrichment-report.md`
> **Decisions locked:** Full phased plan across both apps; data-gap features are *wired now, lit up later*.

---

## Grounding facts

**What the data unlocks (hub-api `drugCatalog` router):**
- `getByAtcCode` returns **role-tiered** content — Tier 2 (DOCTOR/NURSE): dosing, interactions, contraindications, `pregnancyClinical`, adverse events, renal adjustment, PK; Tier 3 (PHARMACIST): + formulary status, recall alerts, substitutes, dispensing notes, unit cost.
- `getBrandsByAtc` + `syncBrands` / `syncBrandPresentations` give brand → presentation (strength/form/pack/**reference price**/GTIN), with independent version watermarks.
- `drugCatalog.sync` delta-syncs the generic catalog incl. the `brand_names` shadow.

**Constraints to design around (coverage, report §4):**
- **Dosing 0%**, `used_for`/`when_to_seek_help`/`storage` 0%, translations 0.5% — data-blocked; build behind the field.
- Contraindications 55%, pregnancy 60%, interactions 91%, adverse events 59% — usable but partial → graceful degradation mandatory (never imply "none/safe" on a gap — Rule #3).
- Brands = 179 products / 2 Afghan manufacturers — thin real-world hit rate until more load (report §9 #7).

---

## Phase 0 — Shared sync foundation (both apps depend on it)

**Goal:** reusable local mirror + delta sync of `drug_catalog` + `drug_brands` + `drug_brand_presentations`, modeled on the Pharmopedia watermark pattern.

- Factor a shared sync helper toward `@ultranos/sync-engine` wrapping `drugCatalog.sync`, `syncBrands`, `syncBrandPresentations` (each its own `sinceVersion` cursor) + `getByAtcCode` / `getBrandsByAtc` for on-demand detail.
- Local Dexie tables (both apps): `drugCatalog` (key `atcCode`), `drugBrands` (key `brandId`), `drugBrandPresentations` (key `presentationKey`), + `sync_meta` per cursor. Role scope is enforced server-side by JWT (OPD pulls Tier-2, Pharmacy pulls Tier-3 automatically).
- Shared `coverage(field)` helper → `present | absent`, so every surface can render an honest "no data" state (Rule #3 satisfied globally).

**Acceptance:** cold + delta sync green offline; role tiers verified; reference data treated as non-PHI (log counts only).

---

## Phase 1 — OPD-Lite safety foundation

**1A. Enriched interactions → offline check ⭐** — feed `drug_catalog.interactions` (91%, real severities) into `vocabularyInteractions`; `@ultranos/drug-db` + `dexie-drug-adapter.ts` read path unchanged. No UI change; keep UNAVAILABLE/stale behavior. Files: `lib/dexie-drug-adapter.ts`, sync producer, `services/interactionService.ts`.

**1B. Comprehensive offline search via `drugCatalog.sync`** — replace `medications_subset.json` with the synced mirror (~3,883 generics + `brand_names` shadow → brand→generic offline). Files: `lib/medication-search.ts`, vocab sync.

**Acceptance:** offline brand→generic hits; CONTRAINDICATED/MAJOR→BLOCKED with override logging; allergy suite green.

---

## Phase 2 — Pharmacy-Lite branded workflow

**2A. Substitution picker at fulfillment ⭐** — replace free-text `brandName` in `FulfillmentChecklist.tsx` with a `getBrandsByAtc` picker (brand · strength · form · pack); sibling brands = substitution loop; free-text fallback when no match.

**2B. Recall-alert guard ⭐** — Tier-3 `recallAlerts` banner (red, non-collapsed) on receive-batch and dispense. Files: `inventory/ReceiveStockForm.tsx`, `DispensingConfirmationModal.tsx`.

**2C. Reference-price / margin PriceCard ⭐** — new `components/pharmacy/PriceCard.tsx` showing presentation `reference_price`+`currency` beside pharmacy `costPrice`/`sellingPrice`, labeled indicative/distinct from retail. Used in `ReceiveStockItemRow.tsx` + POS `InvoiceSummary.tsx`.

**2D. Pharmacist-side interaction/allergy recheck** — re-run `checkInteractions` at script verification (defense-in-depth). Files: `lib/prescription-verify.ts` / queue view.

**Acceptance:** picker returns presentations / falls back cleanly; recall blocks-with-acknowledge; PriceCard not conflated with retail; recheck emits its own audit event.

---

## Phase 3 — OPD-Lite clinical decision support

**3A. Point-of-prescribing safety context ⭐** — on med select, `getByAtcCode` (Tier-2) surfaces contraindications + `pregnancyClinical`, gated on patient context (pregnant/pediatric/renal). Graceful-degradation copy via `coverage()`. Files: `PrescriptionEntry.tsx`, `encounter-dashboard.tsx`.

**3B. Drug monograph drawer** — read-only "ⓘ" → mechanism, PK, adverse events, pregnancy. Reference, not a gate.

**3C. Brand hint on prescription + QR** — optional brand pick; compact brand id into the signed QR payload (fits 2500-byte budget) → flows to Pharmacy 2A. Files: `PrescriptionEntry.tsx`, `lib/compress-prescription.ts`, Pharmacy `prescription-verify.ts` decode.

**Acceptance:** honest gaps render; monograph opens offline; QR brand hint round-trips OPD→Pharmacy under byte limit.

---

## Phase 4 — Wire-now / light-up-later

Surfaces built behind empty fields, activating automatically as ETL coverage fills:

| Feature | Built now | Lights up when |
|---|---|---|
| Dosing autofill (OPD) | `PrescriptionEntry` reads `adultDosing`/`pediatricDosing`, "no dosing data" placeholder | dosing 0% filled (report §9 #2) |
| Counseling label (Pharmacy) | `MedicationLabel` + panel bind `summaryPlain`/storage/when-to-seek-help + ar/prs/ps | patient prose + translations fill (§9 #1/#3) |
| Brand-at-scale (both) | substitution + brand-hint coded | more manufacturers loaded (§9 #7) |
| GTIN scan-to-catalog (Pharmacy) | `ReceiveStockForm` matches barcode → presentation `gtin` | manufacturers supply GTINs (§9 #8) |

All read through `coverage()` — "absent" is first-class today, real value tomorrow, zero code change.

---

## Build order

1. **Phase 0** (shared sync) — standalone PR, unblocks everything.
2. **Phase 1** (OPD 1A+1B) — strengthens existing safety path, no clinical-judgement liability.
3. **Phase 2** (Pharmacy 2A–2D) — branded subsystem's natural home.
4. **Phase 3** (OPD 3A–3C) — decision support, depends on Phase 0 graceful-degradation.
5. **Phase 4** — folded into each phase's PRs.

**Testing (per CLAUDE.md):** interaction paths get CONTRAINDICATED/ALLERGY_MATCH/override/UNAVAILABLE cases; allergy/recall surfaces get prominence snapshots; substitution + brand-hint round-trip tests; RTL snapshots for every new patient-facing component; audit-event assertions on the pharmacist recheck.
