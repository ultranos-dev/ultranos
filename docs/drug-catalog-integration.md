# Drug-Catalog Integration — As-Built Architecture

> **Status date:** 2026-06-25
> **Scope:** How the enriched Pharmopedia drug catalog (generic drugs + branded medications + prices + clinical content) is integrated across the Ultranos apps — the source data, the Supabase schema, the Hub API, the shared sync package, and each consuming app (Pharmopedia, OPD-Lite, Pharmacy-Lite).
> **Companion docs:** `docs/drug-catalog-enrichment-report.md` (the data/ETL program), `docs/drug-catalog-integration-plan.md` (the integration plan), and the per-phase plans under `docs/superpowers/plans/2026-06-2*-phase-*.md`.
> **Branch / commits:** `ux-v1.5` — `8f70d2d` (Phase 0+1), `4804281` (Phase 2 Foundation), `4646d4c` (Phase 2 Features), `97645ce` (Phase 2 Final), `4f35e61` (Phase 3), `78f984b` (Phase 3C).

---

## 1. Overview

The drug catalog has two data layers, both non-PHI reference data:

1. **Generic drugs** — `drug_catalog` (≈3,883 rows): identity (ATC, INN, brand-name shadow, dose forms, therapeutic class) + tiered clinical content (mechanism, interactions, contraindications, pregnancy, adverse events, pharmacokinetics, dosing, recall alerts).
2. **Branded medications** — `drug_brands` → `drug_brand_presentations` (≈179 brands / 283 presentations from Afghan manufacturers): trade name → manufacturer/strength/form/pack/**reference price**/GTIN, each linked to a generic by ATC.

It flows **offline-first** through five layers:

```
[ batch / offline ]            [ online, role-scoped, delta ]     [ on-device, offline ]
ETL pipeline ──▶ Supabase Postgres ──▶ Hub API (tRPC) ──▶ device mirror ──▶ app UI
(@ultranos/        drug_catalog          drugCatalog.*       (SQLite or         (search, brands,
 drug-catalog-etl)  drug_brands           medicationStmt.*    Dexie tables)      safety, monograph,
                    drug_brand_           (role tiers,        + version           dispensing)
                    presentations          watermarks)         watermarks
```

**Consuming apps and how they integrate:**

| App | Platform | Local store | Sync mechanism | Role tier received |
|-----|----------|-------------|----------------|--------------------|
| **Pharmopedia** | Expo / React Native | `expo-sqlite` + FTS5 | **bespoke** sync (`src/sync/*`) | per signed-in role |
| **OPD-Lite** | Next.js PWA | Dexie / IndexedDB (schema **v24**) | **`@ultranos/drug-catalog-sync`** | Tier-2 (clinical: DOCTOR/NURSE) |
| **Pharmacy-Lite** | Next.js PWA | Dexie / IndexedDB (schema **v13**) | **`@ultranos/drug-catalog-sync`** | Tier-3 (pharmacist) |
| **Hub API** | Node / tRPC | Supabase (source of truth) | — | serves all tiers |
| OPD-Lite Mobile / Patient Lite Mobile | Expo / RN | — | *not yet integrated (scaffolded)* | — |

> **Key distinction:** Pharmopedia predates the shared package and has its **own** sync implementation. **OPD-Lite and Pharmacy-Lite are the two consumers of the shared `@ultranos/drug-catalog-sync` package**, each providing a Dexie-backed store adapter.

---

## 2. Layer 1 — Source data & ETL

The catalog is populated by an offline batch pipeline, **`@ultranos/drug-catalog-etl`** (`scripts/etl/drug-catalog/`), which streams source datasets into Supabase. It is fully documented in `docs/drug-catalog-enrichment-report.md`; summary of the per-field provenance:

| Field(s) | Source | Runner |
|----------|--------|--------|
| identity, MOA, PK, base interactions | DrugBank XML | `run-drugbank` |
| `adverse_events` | OnSIDES v3.1.1 | `run-onsides` |
| `summary_plain` | MedlinePlus + openFDA | `run-medlineplus` |
| `pregnancy_clinical`, `contraindications`, `warnings_summary_plain` | openFDA SPL | `run-openfda-label` / `run-openfda-bulk` |
| `recall_alerts` | openFDA enforcement | `run-enforcement` |
| `ar`/`prs`/`ps` translations | Gemini 2.5 Flash (machine, unverified-banner gated) | `run-translate` |
| `brand_names` shadow | RxNorm BN / regional registries | `run-rxnav-brands` / `run-regional-brands` |
| **branded products** (`drug_brands` + presentations) | manufacturer lists (CSV/PDF) | **`run-branded-medications`** |

The apps never read the ETL output directly — they read the synced device copy.

---

## 3. Layer 2 — Supabase schema

**Tables** (`supabase/migrations/`):

| Table | Key columns | Migration |
|-------|-------------|-----------|
| `drug_catalog` | `atc_code` (PK), `inn_name`, `brand_names[]`, `interactions` (JSONB), `pregnancy_clinical` (JSONB), `contraindications`, `recall_alerts`, `version` (epoch-ms watermark) | `033`, `036`–`039` |
| `drug_brands` | `id` (PK), `generic_atc_code` (FK→`drug_catalog`), `brand_name`, `manufacturer`, `rx_status`, `version` | `040` |
| `drug_brand_presentations` | `id` (PK), `brand_id` (FK), `strength`, `dose_form`, `pack_size`, `reference_price`, `currency`, `gtin`, `version` | `040` |

**Sync watermark:** every table has a version trigger writing an epoch-ms `version`. `drug_brands`/`drug_brand_presentations` fire on **INSERT and UPDATE** so new rows sync immediately. Devices pull deltas with `version > sinceVersion` per table.

**RLS:** all three tables are **non-PHI**, `service-role write / authenticated read`. No field-level encryption.

---

## 4. Layer 3 — Hub API (tRPC)

### 4.1 Drug-catalog router — `apps/hub-api/src/trpc/routers/drug-catalog.ts`

Backed by `services/drug-catalog.service.ts` (`scopeEntryToTier`) and `services/branded-medications.service.ts`. **Role tiers** (`getTierForRole`):

- **Tier 1 (public/PATIENT):** identity + patient-prose (summary, used-for, storage, when-to-seek-help, pregnancy-summary), translations.
- **Tier 2 (DOCTOR/NURSE/LAB_TECH):** + `mechanismOfAction`, `indicationsClinical`, `adultDosing`/`pediatricDosing`, `renalAdjustment`, `adverseEvents`, `contraindications`, `interactions`, `pregnancyClinical`, `pharmacokinetics`, `administrationNotes`.
- **Tier 3 (PHARMACIST/ADMIN):** + `formularyStatus`, `dispensingNotes`, `substitutes`, **`recallAlerts`**, `unitCost`.

| Procedure | Input | Output | Used by |
|-----------|-------|--------|---------|
| `search` | `{ q, lang, limit }` | `DrugSearchResult[]` (identity only; matches INN/ATC/local/brand names) | OPD-Lite online search fallback |
| `getByAtcCode` | `{ atcCode }` | `DrugEntryTier1\|2\|3` (role-scoped) | — |
| **`sync`** | `{ sinceVersion, limit }` | `{ entries: DrugEntry[], latestVersion }` | OPD + Pharmacy mirror sync |
| **`syncBrands`** | `{ sinceVersion, limit }` | `{ brands: DrugBrand[], latestVersion }` | OPD + Pharmacy mirror sync |
| **`syncBrandPresentations`** | `{ sinceVersion, limit }` | `{ presentations: DrugBrandPresentation[], latestVersion }` | OPD + Pharmacy mirror sync |
| `getBrandsByAtc` | `{ atcCode }` | `DrugBrandWithPresentations[]` | (available; apps read local mirror) |
| `enrich` (mutation) | `{ atcCode, fields }` | role-scoped entry | OPD local-name enrichment |
| `getPrices` | `{ atcCode, lat, lng, … }` | `PharmacyPrice[]` (live, not cached) | — |
| `setPrice` (mutation) | `{ atcCode, facilityId, retailPrice, … }` | ack | Pharmacy goods-receipt price publish |

The **`sync`** endpoint returns role-scoped entries, so the on-device mirror already contains the correct tier for that app (OPD stores Tier-2; Pharmacy stores Tier-3 including `recallAlerts`).

### 4.2 Pharmacist active-meds endpoint (Phase 2 Final)

`apps/hub-api/src/trpc/routers/medication-statement.ts`:

```
listActiveForPharmacist: roleRestrictedProcedure(['PHARMACIST','ADMIN'])
  .use(enforceVerifiedOrg())
  .use(enforceEntitlement('PHARMACY_LITE'))
  .input({ patientRef })
  .query(...) // returns { statements, count }; emits a PHI_READ audit event
```

- **Scoped to this read endpoint only** via `roleRestrictedProcedure` — `ROLE_PERMISSIONS.PHARMACIST` is **not** broadened, so pharmacists gain no access to `listActive`/`create`/`updateStatus` (data-minimization).
- **No per-access consent gate** — consistent with the clinician `listActive` and the consent-scope map (`MedicationStatement` is treatment-essential for dispensing). Governed by org verification + `PHARMACY_LITE` entitlement + role + audit.

### 4.3 Types — `packages/shared-types/src/fhir/drug-catalog.ts`

`DrugEntryTier1/2/3`, `DrugSearchResult`, `DrugBrand`, `DrugBrandPresentation`, `DrugBrandWithPresentations`, `DrugDosing`, `DrugInteraction`, `AdverseEvent`, `DrugPregnancyClinical`, `DrugPharmacokinetics`, `RecallAlert`, `DrugLocalNames`. Interaction severity + roles in `packages/shared-types/src/enums.ts`.

---

## 5. Layer 4 — Shared sync package `@ultranos/drug-catalog-sync`

**Path:** `packages/drug-catalog-sync/` — storage-agnostic, the foundation OPD-Lite and Pharmacy-Lite both consume. (Phase 0, commit `8f70d2d`.) 24 unit tests.

| Module | Exports | Responsibility |
|--------|---------|----------------|
| `src/client.ts` | `createCatalogClient(config)`, `CatalogClient`, `DrugEntry`, `DrugSyncPage`/`BrandSyncPage`/`PresentationSyncPage` | tRPC GET client over `drugCatalog.sync` / `syncBrands` / `syncBrandPresentations`; injectable `getToken` + `fetchImpl`; decodes the `{result:{data:{json}}}` envelope |
| `src/store.ts` | `DrugCatalogStore`, `CursorKey` | the storage contract apps implement: `getCursor`/`setCursor`/`upsertDrugs`/`upsertBrands`/`upsertPresentations` |
| `src/memory-store.ts` | `InMemoryDrugCatalogStore` | in-memory reference store (tests + app-adapter unit tests) |
| `src/sync.ts` | `runCatalogSync`, `runBrandSync`, `CATALOG_SYNC_PAGE_SIZE` | paged delta orchestrator with per-table version watermarks (`catalogVersion` / `brandsVersion` / `presentationsVersion`), a non-advancing-server guard, short/empty-page termination |
| `src/coverage.ts` | `hasText`, `hasList`, `hasValue`, `isTier2`, `isTier3`, `presence` | "honest empty-state" helpers so a UI renders **"No … data"** rather than implying safe on a gap (safety rule #3) |

**Cursor keys** (`CursorKey`): `catalogVersion`, `brandsVersion`, `presentationsVersion`, `lastSyncAt`.

Throttle / online-gating / single-flight are intentionally **out of scope** here — each app's sync wrapper handles them.

---

## 6. Layer 5a — Pharmopedia (Expo / React Native)

The original consumer (predates the shared package; has its **own** sync). Reference implementation that the OPD/Pharmacy mirror pattern was modeled on.

- **Local store:** `apps/pharmopedia/src/db/schema.ts` — `expo-sqlite`, `PRAGMA user_version` 1–5: `drug_catalog` (+ FTS5 `drug_catalog_fts`), `sync_meta`, `bookmarks`, `drug_brands`, `drug_brand_presentations`, `brand_bookmarks`. Tier content stored as `tier1_json`/`tier2_json`/`tier3_json` columns.
- **Sync:** `src/sync/catalog-sync.ts` (`runSync`), `src/sync/brands-sync.ts` (`runBrandsSync`) — paged, watermarked (`lastVersion`/`brandsVersion`/`presentationsVersion`). `src/api/drug-catalog.ts` calls `drugCatalog.sync`/`syncBrands`/`syncBrandPresentations`. `src/hooks/useAutoSync.ts` — cold-start + sign-in + foreground + 30-min interval, online-gated/throttled/single-flight.
- **Reads:** `src/db/fts.ts` (`searchDrugs`), `src/db/brands.ts` (`searchBrandsLocal`, `getBrandsWithPresentations`, `getBrandDetail`), `src/db/drug-catalog.ts` (`getDrugByAtcCode`). UI: unified generic/brand search, brand detail, bookmarking, dismissable recall banners, MT-unverified banner.

> Pharmopedia is feature-complete and unchanged by this integration effort except for the **QR `atc` field producer side is not involved** (it is a reference app, not a prescriber/dispenser).

---

## 7. Layer 5b — OPD-Lite (prescribing) — Phases 1, 3, 3C

Next.js PWA. Consumes the shared package; Dexie/IndexedDB store.

### 7.1 On-device mirror (Dexie **v24**) — `apps/opd-lite/src/lib/db.ts`

Four **non-PHI** tables (plaintext — not in the encryption middleware; registered in `PRESERVE_TABLES` in `apps/opd-lite/src/lib/phi-cleanup.ts`):

```
drugCatalogMirror             '&atcCode, innName, *brandNames'   // multiEntry brand index
drugBrandsMirror              '&id, genericAtcCode'
drugBrandPresentationsMirror  '&id, brandId'
drugCatalogSyncMeta           '&key'                              // cursors
```

The full tiered `DrugEntry` is stored as-is (Tier-2 for a clinician), so contraindications/pregnancy/PK/dosing are available offline for decision support (Phase 3).

### 7.2 Store adapter, sync runner, trigger

| File | Role |
|------|------|
| `src/lib/drug-catalog-store.ts` | `DexieDrugCatalogStore` — implements `DrugCatalogStore` over the v24 tables |
| `src/lib/drug-catalog-sync.ts` | `runDrugCatalogSync(store, client)` (testable core) + `syncDrugCatalog()` (wired: Supabase token, `getHubApiUrl`, online-gate, single-flight, 15-min throttle via `lastSyncAt`) |
| `src/components/providers/SyncProvider.tsx` | `triggerCatalogSyncOnAuth(true)` — best-effort catalog refresh on sign-in |
| `src/services/interactionService.ts` | `onStale` callback now calls `syncDrugCatalog()` |

### 7.3 1A — enriched interactions (safety-critical)

`src/lib/mirror-drug-adapter.ts` — `createMirrorDrugAdapter()` flattens each mirror entry's `interactions` (`{drugAtcCode, drugName, severity, mechanism}`) into the pairwise `VocabInteractionEntry` rows `@ultranos/drug-db` expects (`drugA = innName`, `drugB = drugName`, `severity`, `description = mechanism`). `resolveDrugAdapter()` returns the **mirror adapter when populated, else the existing JSON-seeded vocab adapter** (cold-start fallback). The `@ultranos/drug-db` checker is unchanged; UNAVAILABLE-on-stale/empty preserved (**never a false CLEAR**, rule #3).

### 7.4 1B — comprehensive offline search

`src/lib/medication-search.ts` — `searchMedications` offline path now queries `drugCatalogMirror` (INN + multiEntry `brandNames` shadow, Fuse-ranked), so typing a brand surfaces its generic offline. The selected `MedicationItem.code` **is the ATC**. The legacy JSON-seeded `vocabularyMedications` remains as the pre-first-sync fallback only.

### 7.5 3A/3B — point-of-prescribing decision support — Phase 3

| File | Role |
|------|------|
| `src/lib/drug-entry.ts` | `getMirrorDrugEntry(atc)` reader; `getBrandNamesForAtc(atc)` (3C) |
| `src/components/clinical/DrugSafetyPanel.tsx` | **3A** inline panel — contraindications (advisory, red) + pregnancy/lactation note for **female + age 13–55** (pregnancy status isn't tracked, so the alert is scoped + carries a "confirm applicability" note); explicit "No … data on file" when empty (rule #3); renders nothing when the drug is absent |
| `src/components/clinical/DrugMonographSheet.tsx` | **3B** ui-kit `Sheet` drawer — full Tier-2 monograph (mechanism, indications, contraindications, adult/pediatric dosing, full pregnancy, adverse effects, PK), each gated by coverage helpers; pregnancy always shown here as reference |
| `src/components/clinical/PrescriptionEntry.tsx` | renders both when a med is selected; gains optional `patientSex`/`patientAge` props |
| `src/components/encounter-dashboard.tsx` | threads `patient.gender` + computed `ageYears(patient.birthDate)` into `PrescriptionEntry` |

**Advisory, not blocking (D1):** the panel never blocks submission — the allergy match + interaction check remain the hard gates.

### 7.6 3C — prescribed-brand hint on the QR

Clinician optionally picks a preferred brand (`PrescriptionEntry` `<select>` reading `getBrandNamesForAtc`) → `PrescriptionFormData.brandHint` → the mapper (`src/lib/medication-request-mapper.ts`) appends a 2nd FHIR coding `system: 'urn:ultranos:brand'` (coding[0] stays the ATC) → `src/lib/compress-prescription.ts` reads it into `CompactRx.brand` → signed QR. Fully backward compatible (no `brand` key when unset).

### 7.7 OPD safety-rule alignment

Non-PHI mirror tables are plaintext + `PRESERVE_TABLES` (`phi-cleanup.ts`). The interaction-service unknown-severity test asserts the fail-safe `UNAVAILABLE` (never CLEAR). `phi-cleanup` classifies all Dexie tables (PHI vs PRESERVE) — the new mirror tables + several pre-existing tables were classified during this work.

---

## 8. Layer 5c — Pharmacy-Lite (dispensing) — Phase 2

Next.js PWA. Second consumer of the shared package; Dexie/IndexedDB store.

### 8.1 On-device mirror (Dexie **v13**) — `apps/pharmacy-lite/src/lib/db.ts`

Same four non-PHI tables as OPD (`drugCatalogMirror` / `drugBrandsMirror` / `drugBrandPresentationsMirror` / `drugCatalogSyncMeta`), plaintext (not in `PHI_TABLE_CONFIGS`), registered in `PRESERVE_TABLES` (`apps/pharmacy-lite/src/lib/phi-cleanup.ts`). The mirror stores **Tier-3** entries, so `recallAlerts` are present.

### 8.2 Store adapter, sync runner, trigger

| File | Role |
|------|------|
| `src/lib/drug-catalog-store.ts` | `DexieDrugCatalogStore` over the v13 tables |
| `src/lib/drug-catalog-sync.ts` | `runDrugCatalogSync` + `syncDrugCatalog()` (auth-session token, online-gate, single-flight, 15-min throttle) |
| `src/hooks/useDrugCatalogSync.ts` | fires `syncDrugCatalog()` on mount; wired into `CatalogBrowsePage` alongside the existing inventory `useCatalogSync` |
| `src/lib/mirror-drug-adapter.ts` | mirror-backed `DrugDatabaseAdapter`; `resolveDrugAdapter()` returns the adapter when populated, else **`null`** (the caller surfaces UNAVAILABLE — never CLEAR) |
| `src/lib/drug-catalog-queries.ts` | local reads: `getLocalBrandsByAtc`, `getRecallAlertsForAtc`, `getReferencePriceForAtc` |

### 8.3 The four features (commit `4646d4c`, + Final `97645ce`)

| Feature | Files | Behavior |
|---------|-------|----------|
| **2A — brand substitution** | `BrandSubstitutionPicker.tsx`, `FulfillmentChecklist.tsx`, `stores/fulfillment-store.ts`, `lib/medication-dispense.ts` | Replaces the free-text brand input at fulfillment with a picker from `getLocalBrandsByAtc(rx.atc)` (brand · strength · pack); free-text fallback when no `atc`/brands; `brandId`/`presentationId` persisted on the dispense |
| **2B — recall guard** | `RecallAlertBanner.tsx`, `DispensingConfirmationModal.tsx` | Active `recallAlerts` (from the Tier-3 mirror, by ATC) shown as a prominent red banner above the allergy banner at dispense (rule #4) |
| **2C — reference-price card** | `PriceCard.tsx`, `inventory/ReceiveStockItemRow.tsx` | Indicative minimum reference price for the ATC (from brand presentations), labeled distinct from retail, beside the selling-price input |
| **2D — interaction recheck** | `lib/dispense-interaction-check.ts`, `DispensingConfirmationModal.tsx`, `InteractionCheckBanner.tsx` (pre-existing), `lib/active-medications.ts` | Re-checks the prescribed meds against each other + the patient's local allergies **and** (online) the patient's active meds from the Hub; surfaced via `InteractionCheckBanner`; a contraindication **disables the dispense confirm**, and the button is also blocked while the check is still running |

### 8.4 2D online cross-check (Phase 2 Final, `97645ce`)

`src/lib/active-medications.ts` — `fetchActiveMedicationDisplays(patientId)` calls `medicationStatement.listActiveForPharmacist` (§4.2); **best-effort online-only** (returns `[]` on no-token/offline/error, never throws; no PHI persisted on device). `DispensingConfirmationModal` fetches them and passes them to `runDispenseInteractionCheck(meds, allergies, activeMedDisplays)`. **Rule #3:** the active meds only *add* peers — an empty/failed fetch never weakens the offline result.

### 8.5 The patient's ATC at dispense

`VerifiedPrescription` (`src/lib/prescription-verify.ts`) carries `atc?` (Phase 2 Foundation) and `brand?` (3C) decoded from the signed QR — these drive substitution / recall / price / brand-hint lookups offline.

---

## 9. Cross-cutting — the prescription QR

The signed prescription QR is the bridge from OPD-Lite (prescriber) to Pharmacy-Lite (dispenser). It is a JSON payload signed with Ed25519; the catalog integration added two **app-local** fields that ride the existing payload (no shared-types or signing change):

| Field | Producer (OPD `compress-prescription.ts` → `CompactRx`) | Consumer (Pharmacy `prescription-verify.ts` → `VerifiedPrescription`) |
|-------|----------------------------------------------------------|-----------------------------------------------------------------------|
| `atc` | set from `coding[0].code` when ATC-shaped (`^[A-Z]\d{2}`); omitted for legacy codes (`RX001`) | reliable generic key for brand/recall/interaction lookups |
| `brand` | set from the `urn:ultranos:brand` coding (3C) | seeds the fulfillment brand + "Prescribed brand: X" label |

Both are optional and backward compatible — a prescription without them produces an identical payload.

---

## 10. Safety & offline-first guarantees

- **Rule #1 (no PHI in logs):** the catalog/brands are non-PHI reference data; sync logs counts only; the pharmacist active-meds endpoint logs counts + a `PHI_READ` audit, never med content.
- **Rule #3 (never imply "none/safe" on a gap):** the interaction adapters return UNAVAILABLE (OPD) / `null`→UNAVAILABLE (Pharmacy) on empty/stale data; coverage helpers render explicit "No … data on file"; the dispense confirm blocks on a contraindication *and* while the check runs.
- **Rule #4 (allergy/recall prominence):** recall + allergy banners render red, uncollapsed, above the item list.
- **Offline-first:** every device read is from the local mirror; sync is delta/watermarked, online-gated, throttled, single-flight; the only online-only path is 2D's best-effort active-meds fetch, which degrades to the offline check.

---

## 11. Data coverage & remaining (data-gated) work

App integration is complete; the following surfaces are **built and render honest "no data" until ETL coverage fills** (see enrichment report §4/§9):

| Surface | Built in | Lights up when |
|---------|----------|----------------|
| Adult/pediatric dosing (monograph, safety panel) | Phase 3 | `adult_dosing`/`pediatric_dosing` filled (0% now) — **safety-gated: needs verified SPL parse + review before clinical reliance** |
| Counseling labels / localized prose | (surfaces exist) | patient-prose + translations fill (0–0.5%) |
| Brand substitution / recall / pricing at scale | Phase 2 | more manufacturer loads |
| GTIN scan-to-catalog | hook present | manufacturers supply GTINs |
| Renal-adjustment gating (OPD) | deferred | eGFR captured as a structured observation |

---

## 12. Source / file reference index

**Shared package** — `packages/drug-catalog-sync/src/`: `client.ts`, `store.ts`, `memory-store.ts`, `sync.ts`, `coverage.ts`, `index.ts`.

**Shared types** — `packages/shared-types/src/fhir/drug-catalog.ts`, `packages/shared-types/src/enums.ts`. **Interaction checker** — `packages/drug-db/src/checker.ts`, `types.ts`.

**Hub API** — `apps/hub-api/src/trpc/routers/drug-catalog.ts`, `medication-statement.ts`; `services/drug-catalog.service.ts`, `branded-medications.service.ts`; `trpc/rbac.ts`, `trpc/middleware/{enforceResourceAccess,enforceEntitlement,enforceVerifiedOrg,enforceConsent}.ts`.

**ETL** — `scripts/etl/drug-catalog/` (`@ultranos/drug-catalog-etl`). **Migrations** — `supabase/migrations/033_…`–`040_branded_medications.sql`.

**Pharmopedia** — `apps/pharmopedia/src/`: `db/{schema,drug-catalog,brands,fts}.ts`, `sync/{catalog-sync,brands-sync}.ts`, `api/drug-catalog.ts`, `hooks/useAutoSync.ts`, `store/sync-store.ts`.

**OPD-Lite** — `apps/opd-lite/src/`: `lib/{drug-catalog-store,drug-catalog-sync,mirror-drug-adapter,drug-entry,medication-search,compress-prescription,medication-request-mapper,prescription-config,db,phi-cleanup}.ts`, `services/interactionService.ts`, `components/clinical/{PrescriptionEntry,DrugSafetyPanel,DrugMonographSheet}.tsx`, `components/encounter-dashboard.tsx`, `components/providers/SyncProvider.tsx`.

**Pharmacy-Lite** — `apps/pharmacy-lite/src/`: `lib/{drug-catalog-store,drug-catalog-sync,mirror-drug-adapter,drug-catalog-queries,dispense-interaction-check,active-medications,prescription-verify,medication-dispense,db,phi-cleanup}.ts`, `hooks/useDrugCatalogSync.ts`, `stores/fulfillment-store.ts`, `components/pharmacy/{BrandSubstitutionPicker,RecallAlertBanner,PriceCard,FulfillmentChecklist,DispensingConfirmationModal,InteractionCheckBanner}.tsx`, `components/pharmacy/inventory/ReceiveStockItemRow.tsx`.

**Plans** — `docs/drug-catalog-integration-plan.md` (the plan), and per-phase plans in `docs/superpowers/plans/2026-06-2*-phase-*.md`.

---

## 13. Commit history (`ux-v1.5`)

| Commit | Title |
|--------|-------|
| `8f70d2d` | enriched-catalog sync package + OPD integration (Phases 0–1) |
| `4804281` | QR ATC field + Pharmacy enriched-catalog mirror (Phase 2 foundation) |
| `4646d4c` | branded-medication workflow — substitution, recall guard, price card, interaction recheck (Phase 2 features) |
| `97645ce` | pharmacist active-meds endpoint + 2D online cross-check (Phase 2 final) |
| `4f35e61` | point-of-prescribing clinical decision support (Phase 3) |
| `78f984b` | optional prescribed-brand hint on the QR (Phase 3C) |
