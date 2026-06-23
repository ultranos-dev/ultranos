# Pharmopedia Drug-Catalog Enrichment & Localization — Program Report

> **Status date:** 2026-06-23
> **Scope:** The full drug-reference data program for the Pharmopedia app — generic-drug enrichment (DrugBank/OnSIDES/openFDA), Localization Phase 1 (machine translation), the **branded-medications subsystem** (schema, ingestion of real manufacturer lists, app UX), and the offline-sync + bookmarking workflows.
> **Database:** Supabase Postgres, project `hqgxvrjccmfjzkhotyib`.
> **Catalog size:** **3,883 generic drugs** in `drug_catalog` (3,868 DrugBank-seeded + 15 hand-added "stub" generics — see §6.4). **179 branded products / 283 presentations** in `drug_brands` + `drug_brand_presentations`, from 2 Afghan manufacturers.

---

## 1. Executive summary

Pharmopedia's reference data has two layers:

1. **Generic drugs** (`drug_catalog`, 3,883 rows) — re-seeded from DrugBank and enriched from OnSIDES, openFDA and MedlinePlus via the streaming ETL package `@ultranos/drug-catalog-etl`, with Arabic/Dari/Pashto machine translation of patient prose behind an unverified-translation banner (rule #2).
2. **Branded medications** (`drug_brands` → `drug_brand_presentations`, 179 brands / 283 presentations) — trade-name products linked to a generic by ATC, carrying manufacturer, strength, form, pack, and (where available) price. Loaded from two real Afghan manufacturer lists: **Afghan Medicine Pharmaceuticals** (CSV) and **Snow Pharma** (PDF).

Data flows end-to-end and offline-first: **dataset → ETL/loader → Supabase → hub-api role-scoping → version-watermark delta sync → device SQLite → Pharmopedia UI**. The app lets users search by **generic or brand name** (unified results with `All · Generics · Brands` filter chips), open a **brand-detail view** (commercial layer → generic link → clinical sourced from the generic), **bookmark** both generics and brands, and stay current via **automatic background sync** (sign-in + foreground + 30-min interval, online-gated and throttled).

**Known gaps:** generic dosing fields and several Tier-1 patient fields remain empty (see §9); branded-product clinical content is always shown *from the generic* (single source of truth), so it is sparse for the hand-added stub generics until those are enriched.

---

## 2. Program timeline (in order)

| Phase | What was done | Key refs |
|------|----------------|----------|
| **0. API review** | Reviewed RxNav/RxNorm + granted GitHub resources (DrugBank, OnSIDES, TWOSIDES); verified dataset schemas before coding. | `92b4262` |
| **1. DrugBank re-seed** | Streaming `sax` parse of the 1.6 GB DrugBank XML → 3,868 drugs: identity, brand names, dose forms, class, MOA, PK, base interactions. | `84f06af`, `2d26904` |
| **2. OnSIDES adverse effects** | OnSIDES v3.1.1 (FDA-label ADRs, MedDRA PT-filtered) → `adverse_events`. | `a6e2b9a` |
| **3. MedlinePlus patient prose** | Plain-language summaries → `summary_plain`. | `8b7362c` |
| **4. openFDA label (API + bulk)** | SPL pregnancy/contraindications/warnings/admin notes. | `828a5b1`, `f10d7c1`, `bcb88ab` |
| **5. Matching refinement** | INN↔USAN/US-brand alias map to raise openFDA match rates. | `bcb88ab` |
| **6. Recall alerts** | openFDA enforcement feed → `recall_alerts` (Tier-3). | `5fe0e35` |
| **7. Render verification** | Locked end-to-end render of enriched fields (snapshot/RTL). | `f2758fa` |
| **8. Structured pregnancy model** | `pregnancy_clinical` JSONB replaces flat category. | `5b449cd`, mig `037` |
| **9. Localization Phase 1** | Gemini ar/prs/ps machine-translate of patient prose, behind the rule-#2 banner; `translation_status` tracking. | `69950f6`, `1948036`, `df8eb8c`, `d03d9b4`, mig `038` |
| **10. Translation backoff** | 429/503 exponential backoff honoring Gemini `retryDelay`. | — |
| **11. Name search + brand chips** | Pharmopedia search matches generic **and** brand names (FTS over the `brand_names` shadow); generic cards show matched-brand chips (Option B2). | *this session* |
| **12. Brand coverage runners (Option D)** | `transforms/brand-merge.ts` (safe append+dedup), `sources/rxnav-brands.ts` + `run-rxnav-brands`, `sources/regional-brands.ts` + `run-regional-brands`; `brand_sources` provenance. | *this session*, mig `039` |
| **13. Branded-medications subsystem** | Two normalized tables (`drug_brands`, `drug_brand_presentations`), hub-api endpoints, `run-branded-medications` loader, Pharmopedia local mirror + sync + drug-detail "Brands" section. | *this session*, mig `040` |
| **14. Afghan Medicine Pharmaceuticals load** | Parsed the 65-product CSV; INN→ATC verification report; 10 stub generics; **48 brands / 65 presentations** loaded. | *this session* |
| **15. Snow Pharma load** | `pdfplumber` table extraction of the 23-page PDF; verification report; 5 stub generics + alias fixes; **131 brands / 218 presentations** loaded, with trade prices. | *this session* |
| **16. Brand-vs-generic UX (Option A)** | Local brand search (`searchBrandsLocal`, `getBrandDetail`), unified results with `All · Generics · Brands` filter chips, `BrandResultCard`, brand-detail screen (`app/brand/[id].tsx`). | *this session* |
| **17. Background sync** | `useAutoSync` rewritten: sign-in + app-foreground + 30-min interval delta sync, online-gated, throttled, silent for returning users. | *this session* |
| **18. Brand bookmarking** | `brand_bookmarks` local table, store methods, heart toggle on brand cards + brand detail, unified Saved tab. | *this session* |

> **Commit status:** all of phases 10–18 are implemented and green but **uncommitted**, pending an explicit commit instruction (per the repo's no-autonomous-commits rule).

---

## 3. How the system works now

### 3.1 Generic-drug data sources & per-field provenance

All source datasets live under `docs/datasets/` (gitignored, ~14 GB). The ETL is an **offline batch pipeline** that writes to Supabase; the app only reads the synced device copy.

| Catalog field(s) | Source | How |
|------------------|--------|-----|
| `atc_code`, `inn_name`, `brand_names`, `dose_forms`, `therapeutic_class`, `drugbank_id`, `mechanism_of_action`, `pharmacokinetics`, `indications_clinical`, base `interactions` | **DrugBank** XML (commercial) | streamed with `sax` |
| `interactions` severity | **DrugBank DDI + TWOSIDES** | `transforms/ddi-severity.ts`, cap 50/drug |
| `adverse_events` | **OnSIDES v3.1.1** | PT-only filter |
| `summary_plain` | **MedlinePlus** + openFDA purpose | `sources/medlineplus.ts`, `sources/openfda-label.ts` |
| `pregnancy_clinical`, `contraindications`, `warnings_summary_plain`, `administration_notes` | **openFDA** SPL | live API + 13-partition bulk (`stream-json`) |
| `recall_alerts` | **openFDA** enforcement | bulk enforcement file |
| `rxnorm_cui` crosswalk | **RxNav/RxNorm** | identity matching |
| patient prose → `ar`/`prs`/`ps` | **Gemini 2.5 Flash** | `sources/translator.ts` |
| **`brand_names` enrichment** | **RxNorm BN concepts** / **regional registries** | `run-rxnav-brands`, `run-regional-brands` |

### 3.2 ETL pipeline

- **Package:** `scripts/etl/drug-catalog/` (`@ultranos/drug-catalog-etl`, TS ESM, `tsx`, Vitest).
- **Streaming parsers:** `sax` (DrugBank) and `stream-json` (openFDA bulk).
- **Runners** (each idempotent; generic runners `upsert onConflict: atc_code`):

  | Command | Purpose |
  |---------|---------|
  | `run-drugbank` | Re-seed + identity/MOA/PK/interactions |
  | `run-onsides` | Adverse events |
  | `run-medlineplus` | Patient summaries |
  | `run-openfda-label` / `run-openfda-bulk` | Pregnancy/contraindications/warnings |
  | `run-enforcement` | Recall alerts |
  | `run-translate` | Gemini ar/prs/ps translation |
  | `run-rxnav-brands` | Merge RxNorm brand-name (TTY=BN) concepts into `brand_names` |
  | `run-regional-brands` | Merge an operator-supplied regional brand dataset into `brand_names` |
  | **`run-branded-medications`** | Load a manufacturer's structured branded products into `drug_brands` + `drug_brand_presentations` (see §6) |

- **Idempotency & protection:** re-running fills gaps only; `ETL_PROTECTED_FIELDS` in hub-api blocks app-side curation from clobbering ETL-owned columns (now includes `brand_sources`). The brand-merge helper appends + case-insensitively dedupes brand names, never replacing.

### 3.3 Database & sync watermark

- `drug_catalog`, `drug_brands`, `drug_brand_presentations`: non-PHI, RLS = service-role write / authenticated read.
- Each table has a **version trigger** (epoch-ms watermark). `drug_brands`/`drug_brand_presentations` fire on **INSERT and UPDATE** (so new rows sync immediately — the original `drug_catalog` trigger was UPDATE-only and later patched).
- Devices pull deltas with `.gt('version', sinceVersion)` per table.

### 3.4 Hub API (tRPC) — role scoping & brand endpoints

`apps/hub-api/src/services/drug-catalog.service.ts` → `scopeEntryToTier` (Tier 1 patient prose / Tier 2 clinical / Tier 3 pharmacist).

`apps/hub-api/src/services/branded-medications.service.ts` + the `drugCatalog` router add (branded data is **non-PHI, role-agnostic**):
- `getBrandsByAtc(atcCode)` — brands + nested presentations for a generic.
- `syncBrands(sinceVersion)` / `syncBrandPresentations(sinceVersion)` — independent delta cursors for the two tables.

### 3.5 Pharmopedia (Expo / React Native)

- **Search (Option A):** one search box; `All · Generics · Brands` filter chips **narrow** the results (not a mode switch). Generic hits render as `DrugCard` (with a "Generic" pill-icon label + matched-brand chips); brand hits as `BrandResultCard` (a "Brand" tag-icon label, generic + manufacturer + price). Generic search is local FTS (`searchDrugs`); brand search is `searchBrandsLocal` (LIKE over the local `drug_brands`). Pre-sync, generics fall back to the hub-api `search` (which also matches brand names → returns the generic); brand rows appear once synced.
- **Brand detail** (`app/brand/[id].tsx`): commercial layer (presentations + price) → prominent "Generic ingredient →" link → sibling brands (substitution loop) → **clinical content rendered from the generic** (`SafetyZone` + the generic's full `buildDrugSections`, edge-to-edge), attributed "Clinical information from {generic}". Clinical is never re-authored per brand — single source of truth.
- **Bookmarking:** heart toggle on generic cards/detail (existing) and now on brand cards/detail; the **Saved** tab merges both, newest-first.
- **Offline sync:** `useAutoSync` runs a full cold-start sync (with progress UI) on first launch, then **silent delta syncs** on sign-in, app foreground, and a 30-min interval — online-gated (`NetInfo`), throttled (15 min), single-flight. Brand sync runs alongside (best-effort).
- **No section open by default:** all collapsible drug-detail sections (generic and brand pages) start collapsed.

### 3.6 Runtime data flow (offline-first)

```
[ Batch, offline ]                         [ Online, delta ]                [ Offline at point of care ]
docs/datasets/*  ──ETL/loaders──▶  Supabase  ──version delta sync──▶  device SQLite  ──▶  Pharmopedia UI
(DrugBank, OnSIDES, openFDA,        drug_catalog                         drug_catalog +       (unified search,
 MedlinePlus, TWOSIDES, Gemini,     drug_brands                          drug_brands +         brand chips,
 RxNorm, manufacturer lists)        drug_brand_presentations             drug_brand_presentations   brand detail,
                                    (+ version triggers)                 + bookmarks/brand_bookmarks  MT banner)
```

---

## 4. Current data coverage

**Generic clinical fields** (measured 2026-06-20; unchanged this session):

| Field | % | | Field | % |
|-------|--:|-|-------|--:|
| `mechanism_of_action` | 92% | | `contraindications` | 55% |
| `interactions` | 91% | | `warnings_summary_plain` | 41% |
| `pharmacokinetics` | 85% | | `used_for` | ~0% |
| `pregnancy_clinical` | 60% | | `adult_dosing` / `pediatric_dosing` | 0% |
| `adverse_events` | 59% | | `when_to_seek_help` / `storage_instructions` / `common_side_effects` | 0% |
| `summary_plain` | 56% | | `translation_status` (any lang) | 0.5% |

**Branded medications** (this session):

| Metric | Value |
|--------|------:|
| Branded products (`drug_brands`) | **179** |
| Presentations (`drug_brand_presentations`) | **283** |
| Generics with ≥1 brand | 121 |
| Generics with ≥2 brands (substitution case) | 39 |
| Manufacturers loaded | 2 (Afghan Medicine Pharmaceuticals, Snow Pharma) |
| Presentations with a price | 218 (all Snow; Afghan list had no prices) |
| Stub generics added (`etl_source='manual-supplement'`) | 15 |

---

## 5. Localization subsystem (Phase 1)

Unchanged this session. Arabic/Dari/Pashto machine translation of patient Tier-1 prose via Gemini, `translation_status` JSONB (`machine` | future `confirmed`), shown only under the always-on unverified banner (rule #2). Live fill is metered by the free Gemini daily quota; daily idempotent re-runs accumulate. Phase-2 clinician confirm/edit workflow is deferred. **Branded products do not have their own translations** — their clinical content comes from the generic.

---

## 6. Branded-medications subsystem

### 6.1 Data model

**Supabase (migration `040`):**

```
drug_brands                         -- the trade-name level
  id uuid PK, generic_atc_code → drug_catalog(atc_code) ON DELETE CASCADE,
  brand_name, manufacturer (''=unknown), brand_name_local jsonb, rx_status,
  etl_source, version (trigger), …                 UNIQUE(generic_atc_code, brand_name, manufacturer)

drug_brand_presentations            -- the marketed product/pack level
  id uuid PK, brand_id → drug_brands(id) ON DELETE CASCADE,
  presentation_key (deterministic slug — idempotent upsert target),
  strength, dose_form, route, pack_size, pack_unit, volume, gtin,
  registration_number, registration_status, market,
  reference_price numeric, currency, packaging_photo_url, version (trigger)
                                                    UNIQUE(brand_id, presentation_key)
```

- **One brand → many presentations** (e.g. SNOCIP = 125/250 syrups + 250/500/750 tablets, each with its own price).
- `reference_price` is an **indicative/trade price**, deliberately distinct from the per-pharmacy real-time `pharmacy_prices.retail_price`. (Snow Pharma's column is the **trade price (TP)**, stored as such; Afghan Medicine's list had no prices.)
- The flat `drug_catalog.brand_names TEXT[]` remains as the **offline search shadow** — the loader merges brand names into it so FTS keeps finding drugs by brand without syncing the heavy tables for search alone.

**Device-local mirror (Pharmopedia SQLite, schema versions):**

| `user_version` | Adds |
|--------------:|------|
| 1 | `drug_catalog` + FTS5 + `sync_meta` |
| 2 | `bookmarks` (generics) |
| 3 | `profile_cache` |
| **4** | `drug_brands` + `drug_brand_presentations` (synced on `brandsVersion` / `presentationsVersion` cursors) |
| **5** | `brand_bookmarks` |

### 6.2 Loader: `run-branded-medications`

Ingests a **nested JSON dataset** (one record per brand, presentations nested) into both tables and keeps the `brand_names` shadow in sync. Idempotent and safe:
- Brands upsert on `(generic_atc_code, brand_name, manufacturer)`.
- Presentations upsert on `(brand_id, presentation_key)`, **deduped within the batch** (two identical presentations would otherwise trip Postgres `ON CONFLICT … cannot affect row a second time`).
- Shadow update uses `UPDATE` (not upsert) on existing `drug_catalog` rows (an upsert's INSERT arm would violate `inn_name NOT NULL`).

Dataset schema (camelCase or snake_case keys accepted):

```json
[{ "genericAtcCode": "J01MA02", "brandName": "SNOCIP", "manufacturer": "Snow Pharma",
   "rxStatus": "rx",
   "presentations": [
     { "strength": "500mg", "doseForm": "tablet", "packSize": 10, "packUnit": "tablets",
       "referencePrice": 83.30, "currency": "AFN", "market": "AF", "registrationStatus": "marketed" }
   ] }]
```

### 6.3 Sources loaded

- **Afghan Medicine Pharmaceuticals** — `docs/datasets/Brands-List/Afghan-Medicine-Pharmaceuticals-Products-List.csv`, 65 products. Clean CSV columns (Product, Composition, Pack Size); no prices. Parsed with a throwaway helper (`scripts/etl/drug-catalog/afghan-medicine-report.ts`). → **48 brands / 65 presentations.**
- **Snow Pharma** — `docs/datasets/Brands-List/Snow-Pharma-Products-List.pdf`, ~229 products across 23 pages, **with trade prices**. `pdftotext` scrambled the image-table; `pdfplumber` (Python) `extract_tables()` read it cleanly. Parsed with `snow-parse.py` → matched/reported with `snow-report.py`. → **131 brands / 218 presentations.**

> The per-manufacturer parsing scripts (`afghan-medicine-report.ts`, `snow-parse.py`, `snow-report.py` + their intermediate JSON/CSV) are **throwaway analysis artifacts**, regenerated per source. The stable contract is the loader JSON + `run-branded-medications`.

### 6.4 Stub generics (`etl_source='manual-supplement'`)

Many brands are combinations, vitamins, ORS or herbals whose generic **has a real WHO ATC that simply isn't in the DrugBank seed** (e.g. ivy leaf `R05CA12`, ispaghula `A06AC01`, ORS `A07CA`, multivitamins `A11AA03`, antacid+antiflatulent `A02AF02`, macrogol `A06AD65`, calcium `A12AA`, magnesium `A12CC`, clopidogrel+ASA `B01AC30`, levosulpiride `N05AL07`). Because `drug_brands.generic_atc_code` is a **NOT-NULL FK**, these brands can't load until that generic row exists. We added **15 minimal stub rows** (atc_code + inn_name + therapeutic_class, clinical fields empty, flagged `etl_source='manual-supplement'`) so the FK resolves and the brand is searchable. Their clinical content is intentionally sparse until enriched (e.g. a MedlinePlus pass).

### 6.5 Runbook — reviewing & adding a manufacturer's branded drugs (future)

This is the repeatable process for each new local manufacturer list. **The matching step is safety-critical: a wrong brand→generic→clinical link is a defect, so multi-ATC actives are human-reviewed, never auto-picked.**

1. **Obtain & place the list.** Drop the CSV/Excel/PDF under `docs/datasets/Brands-List/` (gitignored). Prefer a structured CSV/Excel from the manufacturer; PDFs are last resort.
2. **Parse into structured rows.** Write a per-manufacturer parse script (throwaway). For PDFs with a real table, use **`pdfplumber` `extract_tables()`** — `pdftotext` interleaves image-tables. Extract per product:
   - **Brand name** — strip the trailing strength/form suffix (e.g. "SNOPANT - 40 CAP" → "SNOPANT"); keep variant words (PLUS, DS).
   - **Active(s) + strength** from the composition — split combos on `+`; strip pharmacopoeia tags (USP/BP/IP), salts ("as oxalate", "HCl"), dot-leaders; correct obvious typos (e.g. `Gabpentin`→gabapentin, `Sodium Valporate`→valproate). Beware salt words that are part of the INN ("sodium picosulfate", "sodium valproate").
   - **Pack/form** (tablets/capsules/ml/sachets/g) and **price** (label trade vs MRP; store as `reference_price` + `currency`).
3. **Resolve generic → ATC.**
   - Normalize the extracted INN; apply the **WHO-INN↔USAN alias map** (`transforms/inn-aliases.ts`: paracetamol→acetaminophen, salbutamol→albuterol, ivy leaf→"Ivy leaf (Hedera helix)", psyllium→ispaghula, etc.).
   - Match against `drug_catalog` by **exact `inn_name`** (case-insensitive), not substring.
   - **Disambiguate multi-ATC actives by hand.** Most actives map to several ATCs (route/use/combination): e.g. ibuprofen → 9 codes (oral `M01AE01` vs topical `M02AA13`), azithromycin → oral `J01FA10` vs eye `S01AA26`, metronidazole → 11 codes. Pick the systemic/oral mono code; **flag every multi-candidate for review** (the catalog's `dose_forms` is INN-aggregated and cannot disambiguate).
4. **Generate a verification report (CSV)** — one row per product: brand, raw + corrected INN, **proposed ATC**, **all candidate ATCs**, status (`OK` single-ATC / `REVIEW` multi-ATC / `COMBO` hand-mapped / `NO MATCH`), price, basis. A human reviews — focus on the `REVIEW` and `COMBO` rows.
5. **Handle missing generics.** For an active/combination whose ATC isn't in `drug_catalog`:
   - If it has a real ATC → add a **stub generic** (`INSERT … drug_catalog (atc_code, inn_name, therapeutic_class, etl_source='manual-supplement')` via the Supabase MCP). Verify it doesn't already exist under a different name (e.g. "Cephalexin" not "cefalexin", "Butylscopolamine" not "hyoscine butylbromide") before creating one.
   - Truly codeless products (proprietary herbal blends, plain "mouthwash"): defer / leave out.
6. **Produce the loader JSON** (`docs/datasets/branded-medications.json` or `Brands-List/<mfr>-branded-medications.json`) grouped by brand, in the §6.2 schema.
7. **Load:** `BRANDED_FILE=<path> pnpm -F @ultranos/drug-catalog-etl run-branded-medications` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Idempotent; updates the `brand_names` search shadow.
8. **Verify in DB** (counts, a multi-form brand groups correctly, `reference_price` populated). **Reversible** via `DELETE … WHERE etl_source IN ('branded-loader','manual-supplement')`.
9. **Sync to devices** happens automatically (background delta sync) or via Profile → Sync Now.

---

## 7. Schema & migrations

**Supabase (`supabase/migrations/`):**

| Migration | Change |
|-----------|--------|
| `033_drug_catalog.sql` | Base catalog, indexes, version trigger, RLS |
| `036_…brand_names_text.sql` | `brand_names_text` generated column + trigram index (brand search) |
| `037_…pregnancy_clinical.sql` | `pregnancy_clinical` JSONB |
| `038_…translation_status.sql` | `translation_status` JSONB |
| `039_…brand_sources.sql` | `brand_sources` JSONB (per-brand provenance; opt-in, `WRITE_BRAND_SOURCES=1`) |
| **`040_branded_medications.sql`** | `drug_brands` + `drug_brand_presentations` (FKs, indexes, INSERT/UPDATE version triggers, RLS) |

Also applied as data inserts (not migration files): **15 `manual-supplement` stub generics** in `drug_catalog` (§6.4).

**Device-local SQLite:** schema versions 1–5 (§6.1) — `drug_brands`/`drug_brand_presentations` at v4, `brand_bookmarks` at v5.

---

## 8. Testing

- **ETL suite:** **144/144** passing (`pnpm -F @ultranos/drug-catalog-etl test`) — parser/transform/runner/translator + the new `brand-merge`, `rxnav-brands`, `regional-brands`, and `run-branded-medications` (incl. dataset-template locks).
- **Pharmopedia:** **365/365** vitest passing — brand search/detail DB queries, `BrandResultCard`, `SearchResults` filter behavior, brand-detail screen, brand bookmarking (store + DB + Saved merge), `useAutoSync` (cold/delta/throttle/offline/guards), plus the existing generic render/RTL snapshots. The local v4/v5 migrations run clean under the jest catalog-sync test on a real in-memory DB.
- **hub-api:** branded-medications service + router tests green alongside the existing `drug-catalog` suite.
- **Discipline:** every load was verified against the live DB via the Supabase MCP (counts, spot-checks); matching bugs (oral-vs-topical/eye ATCs, salt over-stripping, duplicate-presentation upsert) were caught this way.

---

## 9. Pending / gaps

### Generic data
1. **Live translation population** — incremental fill on the free Gemini key (stay on free key per current instruction).
2. **Dosing fields empty** (`adult_dosing`/`pediatric_dosing`) — highest-value generic gap; confirm SPL dosage parsing.
3. **Empty Tier-1 fields** — `used_for`, `when_to_seek_help`, `storage_instructions`, `common_side_effects`.
4. **Coverage tail** — second matching pass (aliases, RxNorm CUI) could raise match rates.

### Branded medications
5. **Stub generics are clinically sparse** — the 15 `manual-supplement` rows have identity only; their brand-detail clinical section is thin until enriched (MedlinePlus/openFDA pass for psyllium, ivy leaf, ORS, etc.).
6. **A few judgment-call combo ATCs** to confirm (e.g. cough syrups `R05X`, herbal expectorants `R05CA10`, multivitamin/calcium blends) — see each load's verification CSV.
7. **More manufacturers** — repeat §6.5 for additional Afghan/regional suppliers; brand coverage is the main lever for real-world search hits.
8. **Per-presentation provenance / registration numbers / GTIN** — not in the two lists obtained; request from manufacturers.

### Deferred
9. **Localization Phase 2** clinician confirm/edit; possible brand-name local translations.
10. **Online brand-search endpoint** — not built (deemed unnecessary: pre-sync is a brief one-time window and the generic search API already surfaces brand-name matches). Revisit only if telemetry shows pre-sync brand-search friction.
11. **True OS background sync** (app closed) — deferred; foreground + interval cover the realistic freshness need.

### Housekeeping
12. **Uncommitted work** — phases 10–18 are green but uncommitted (no-autonomous-commits rule).
13. **Paid Gemini key rotation** — a paid key pasted in chat earlier should be rotated (never written to `.env`).

---

## 10. How to operate the pipeline

```bash
# From repo root. Generic runners are idempotent (fill gaps only).
pnpm -F @ultranos/drug-catalog-etl run-drugbank        # re-seed + identity/MOA/PK
pnpm -F @ultranos/drug-catalog-etl run-onsides         # adverse events
pnpm -F @ultranos/drug-catalog-etl run-medlineplus     # patient summaries
pnpm -F @ultranos/drug-catalog-etl run-openfda-bulk    # pregnancy/contra/warnings
pnpm -F @ultranos/drug-catalog-etl run-enforcement     # recall alerts
pnpm -F @ultranos/drug-catalog-etl run-translate       # ar/prs/ps machine translation

# Brand-name coverage (generic search shadow):
pnpm -F @ultranos/drug-catalog-etl run-rxnav-brands                       # RxNorm BN concepts (free)
REGIONAL_BRANDS_FILE=docs/datasets/regional-brands.json \
  pnpm -F @ultranos/drug-catalog-etl run-regional-brands                  # operator-supplied registry

# Branded products (drug_brands + presentations):
BRANDED_FILE=docs/datasets/Brands-List/<mfr>-branded-medications.json \
  pnpm -F @ultranos/drug-catalog-etl run-branded-medications

pnpm -F @ultranos/drug-catalog-etl test                # 144/144

# Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps/hub-api/.env.local); GEMINI_API_KEY (.env) for run-translate.
# Optional: ETL_CHUNK (200), TRANSLATE_CONCURRENCY (4), RXNAV_CONCURRENCY (4), WRITE_BRAND_SOURCES.
# Schema changes & data inserts (incl. stub generics) go through the Supabase MCP tools, never raw psql.
```

See `scripts/etl/drug-catalog/datasets/README.md` for the brand-coverage runners and dataset templates.

---

## 11. Risk register (healthcare-specific)

| Risk | Mitigation |
|------|-----------|
| AI translation presented as authoritative (rule #2) | Always-on unverified banner + stored AI version; Phase-2 confirm gate |
| Wrong brand→generic→clinical link (safety) | INN→ATC matching is human-verified (verification report); multi-ATC actives never auto-picked; clinical shown only from the generic |
| Silent drug-interaction failure (rule #3) | Interaction checks never default to "none found" |
| PHI in logs (rule #1) | Catalog + brands are **non-PHI** reference data; runners log shapes/counts only |
| Stale offline catalog/brands | Version-watermark delta sync + automatic background sync (sign-in/foreground/30-min) |
| Empty dosing / sparse stub generics rendered as "no data" | Tracked as gaps #2/#5 — must be filled before clinicians rely on them |
| Indicative `reference_price` mistaken for retail | Stored as trade/indicative price, distinct from per-pharmacy `pharmacy_prices` |
