# Pharmopedia — RxNav-Aligned Drug Catalog Enrichment (Design)

> **Status:** Design / decisions locked 2026-06-19.
> **Amends:** [`2026-06-12-pharmopedia-design.md`](./2026-06-12-pharmopedia-design.md) §4 (data-source mapping) and the [`2026-06-12-pharmopedia-plan-2-etl.md`](../plans/2026-06-12-pharmopedia-plan-2-etl.md) source adapters.
> This document supersedes the **DrugBank-first** sourcing in those docs. Where they conflict, this document wins.

## 1. Why this exists

The original ETL design was authored DrugBank-first and before two material facts:

1. **The NLM RxNav Drug Interaction API was permanently discontinued on 2 Jan 2024.** RxNav can no longer supply `interactions[]` at all. (Refs: [NLM RxNav news](https://lhncbc.nlm.nih.gov/RxNav/news/news.html), [DrugBank announcement](https://blog.drugbank.com/nih-discontinues-their-drug-interaction-api/).)
2. RxNav is **US-only, online-only terminology** — it normalizes *what a drug is*; it is not a clinical-content source (no dosing regimens, PK, adverse-event prose, patient education).

## 2. Locked decisions (2026-06-19)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where enrichment runs | **Hub-side at seed/sync time.** Devices only ever receive pre-enriched, tier-scoped SQLite rows. No device makes an external API call (offline-first rule). RxNav-in-a-Box is an optional self-host to remove the external dependency + rate limit. |
| D2 | RxNorm's role vs curated catalog | **Both** — seed the candidate list once by walking ATC classes, then enrich-only for ongoing maintenance. Curated Afghanistan/BPHS entries remain source of truth. |
| D3 | Interaction source | **Keep `packages/drug-db` + curated list** (e.g. ONC high-priority DDI list). RxNav/DrugBank are NOT the interaction source. CLAUDE.md healthcare rule #3 ("Interaction check unavailable" fallback) stays intact. |
| D4 | Fields RxNav can't provide | **Free NLM/NIH stack:** openFDA/DailyMed (dosing, AE, contraindications, pregnancy, recalls), MedlinePlus Connect (patient prose), NLM RxImage (photos). DrugBank becomes an *optional, deferred* commercial overlay, not a dependency. |
| D5 | `pregnancyCategory` | **Option A** — replace the single letter-badge `string` with PLLR-structured clinical prose (Pregnancy / Lactation / Females & Males of Reproductive Potential), keeping a `legacyCategory` slot. See §6. |
| D6 | DrugBank overlay | **Fully deferred.** D3 removed its strongest use case (interactions); cost/licensing isn't justified before the free pipeline's coverage is proven. `drugbank.ts` stays as the optional overlay stub at conflict priority #6 — seam open, zero rework to enable later. Re-evaluate with measured `pharmacokinetics`/`mechanismOfAction` coverage gaps after the Phase-1 seed. |
| D7 | RxNav hosting | **Hosted RxNav (public REST).** Batch-seed volume (~500 drugs × ~5–8 calls, monthly) makes the 20 req/s limit a non-issue, and the Hub caches enriched output so nothing hits RxNav at runtime. RxNav-in-a-Box is reserved for concrete future triggers: many-thousand-drug catalog with frequent refreshes, air-gap/data-sovereignty compliance, or RxNav uptime becoming a build-pipeline risk. |

Localization, provenance, and licensing flags from the review are all **agreed** and folded into §7–§8.

## 3. Architecture

```
ATC seed list ─► [Hub enrichment service] ─► drug_catalog (Postgres) ─► sync ─► device SQLite (offline)
                       │
   ┌───────────────────┼───────────────────────────────┬────────────────────┐
   RxNav                openFDA / DailyMed               MedlinePlus          NLM RxImage
   (RxNorm/RxClass/     (label, FAERS, enforcement)      Connect              (pill photos)
    RxTerms)                                             (patient prose)
                       │
                packages/drug-db + curated list ─► interactions[] (unchanged)
```

All external calls happen **Hub-side**, rate-limited (RxNav ≤ 20 req/s), cached, with per-field provenance stamped (§7). Schedule: full seed at launch, monthly refresh; local-enrichment columns never touched by refresh.

## 4. RxNav usage detail (which function → which field)

Base: `https://rxnav.nlm.nih.gov/REST`. Free, no API key.

| Purpose | API / function | Field(s) populated |
|---------|----------------|--------------------|
| Resolve canonical CUI from ATC | RxNorm `findRxcuiById?idtype=ATC&id=<atc>` (fallback `findRxcuiByString?name=<inn>`) | `rxnormCui` |
| Generic/INN name | RxNorm `getRelatedByType` TTY=IN / RxTerms `FULL_GENERIC_NAME` | verify `innName` |
| Brand names (US — *suggestions only*) | RxNorm `getRelatedByType` TTY=BN | `brandNames[]` (curated wins) |
| Dose forms | RxNorm DF / RxTerms `NEW_DOSE_FORM` | `doseForms[]` |
| Therapeutic class | RxClass `getClassByRxNormDrugId?relaSource=ATC` (+ EPC/MOA) | `therapeuticClass`, MOA label |
| Therapeutic substitutes (Tier 3) | RxClass `getClassMembers?relaSource=ATC&classId=<atc>` | `substitutes[]` |
| Strength / route normalization | RxTerms `getAllRxTermInfo` | dosing display cleanup |
| Seed candidate list (D2) | RxClass `getClassMembers` walked per ATC class | seed roster |
| Search / autocomplete | RxNorm `getApproximateMatch` + `getSpellingSuggestions` | app search index |

**Not usable:** the Interaction API (discontinued) and RxClass DrugBank-sourced relations `ci_with` / `may_treat` (withdrawn by DrugBank). Only MED-RT–sourced RxClass relations remain.

## 5. Revised field → source mapping (replaces §4 of the 2026-06-12 design)

Legend: **Curated** = local, never overwritten by ETL. **Optional DB** = DrugBank overlay if/when licensed.

### Identity (Tier 1 base)
| Field | Primary source | Notes |
|-------|----------------|-------|
| `atcCode` | WHO EML | canonical ID |
| `rxnormCui` | **RxNorm** | join key |
| `innName` | RxNorm IN / WHO | |
| `brandNames[]` | openFDA + RxNorm BN | US brands = suggestions; curated Afghan brands authoritative |
| `doseForms[]` | RxNorm / RxTerms / openFDA | |
| `therapeuticClass` | **RxClass** (ATC/EPC) | *changed from WHO/openFDA* |
| `localNames` | **Curated** | Dari/Pashto |
| `images[]` | **NLM RxImage** | illustrative only |

### Tier 1 — patient prose (all localized → translation layer, §7)
| Field | Primary source |
|-------|----------------|
| `summaryPlain`, `usedFor[]`, `commonSideEffects[]`, `whenToSeekHelp` | **MedlinePlus Connect** |
| `storageInstructions` | DailyMed |
| `pregnancySummaryPlain` | MedlinePlus (simplified) |
| `warningsSummaryPlain` | MedlinePlus / DailyMed (simplified) |

### Tier 2 — clinical
| Field | Primary source | Changed from |
|-------|----------------|--------------|
| `mechanismOfAction` | openFDA SPL `mechanism_of_action` + RxClass MOA label | ~~DrugBank~~ |
| `indicationsClinical[]` | DailyMed / openFDA `indications_and_usage` | |
| `adultDosing` / `pediatricDosing` | DailyMed `dosage_and_administration` | |
| `renalAdjustment` | DailyMed (use in specific populations) | ~~DrugBank~~ |
| `adverseEvents[]` | openFDA label `adverse_reactions` (FAERS optional) | |
| `contraindications[]` | openFDA `contraindications` | |
| `interactions[]` | **`packages/drug-db` + curated (D3)** | ~~DrugBank / Interaction API~~ |
| `pregnancyClinical` *(new, §6)* | openFDA SPL PLLR subsections | ~~`pregnancyCategory` from openFDA/DrugBank~~ |
| `administrationNotes` | DailyMed | |
| `pharmacokinetics` | DailyMed `clinical_pharmacology` (parsed) — *low confidence, curation likely* | ~~DrugBank~~ |

### Tier 3 — pharmacist
| Field | Primary source |
|-------|----------------|
| `formularyStatus`, `dispensingNotes`, `unitCost` | **Curated** (BPHS / procurement) |
| `substitutes[]` | **RxClass** `getClassMembers` |
| `recallAlerts[]` | openFDA enforcement |

### Conflict priority (overlapping fields only)
1. **Curated / local** (interactions, localNames, formulary, unitCost) — never overwritten.
2. **DailyMed** (structured SPL) for clinical prose + dosing.
3. **openFDA** (label + enforcement).
4. **RxNorm / RxClass / RxTerms** (terminology backbone — names, class, CUI, substitutes).
5. **MedlinePlus** (patient prose).
6. **DrugBank** *(optional overlay)* — when licensed, may supersede #2/#3 clinical fields; never `interactions[]` unless D3 is revisited.

> ETL adapter impact vs plan-2: keep `nlm.ts`; **expand it** to RxClass + RxTerms (currently only fetches `rxnorm_cui`). Add a `dailymed.ts` adapter and a `medlineplus.ts` adapter. Demote `drugbank.ts` to a permanent optional overlay (already a stub). Drop any reliance on an interaction adapter.

## 6. Pregnancy — Option A type change (D5)

### `packages/shared-types/src/fhir/drug-catalog.ts`
```typescript
export interface DrugPregnancyClinical {
  pregnancy?: string             // PLLR 8.1
  lactation?: string             // PLLR 8.2 — clinically critical, currently homeless
  reproductivePotential?: string // PLLR 8.3
  legacyCategory?: string        // A/B/C/D/X when an older reference still carries one
}
```
- In `DrugEntryTier2`: **remove** `pregnancyCategory?: string`; **add** `pregnancyClinical?: DrugPregnancyClinical`.
- Plain `string` subfields (not `DrugLocalizedText`) — consistent with the other Tier-2 clinical fields (`contraindications`, `mechanismOfAction`, `renalAdjustment`); the §7 translation layer handles localization uniformly.
- Tier-1 `pregnancySummaryPlain: DrugLocalizedText` (patient prose) is **unchanged**.

### Downstream touch points (implementation scope, not done here)
| Area | Change |
|------|--------|
| `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx` | Clinical pregnancy section: "summary + category badge" → summary + three labelled prose blocks; badge only when `legacyCategory` present. |
| i18n `en/ar/prs/ps.ts` | Keep `drug.clinical.pregnancyCategory` (legacy badge); add `drug.clinical.lactation`, `drug.clinical.reproductivePotential`. |
| Hub `drug_catalog` Postgres | Migrate column `pregnancy_category text` → `pregnancy_clinical jsonb` (via Supabase MCP `apply_migration`). |
| ETL `scripts/etl/drug-catalog/types.ts` + `normalizer.ts` | `pregnancyCategory?: string` → `pregnancyClinical?: {...}`; map openFDA `pregnancy` / `nursing_mothers` / `pregnancy_or_breast_feeding` SPL fields into the three subsections. |
| Device SQLite | No schema migration (`tier2_json` is a serialized blob), but existing rows need re-enrichment to populate the new shape. |
| `apps/pharmopedia/src/__tests__/drug-detail-sections.test.tsx` | Update fixtures/assertions referencing `pregnancyCategory`. |

## 7. Provenance, versioning, localization

- **Per-field provenance:** each enriched field carries `{ source, fetchedAt }` (or a per-row `etl_source` + `last_etl_refresh` as in plan-2, extended to per-field where feasible) so clinicians can judge staleness and the `version` / `lastUpdated` (`Meta`) fields reflect real provenance. Feeds `packages/drug-db` `STALENESS_THRESHOLD_MS` (45 days).
- **Localization:** every openFDA/DailyMed/MedlinePlus free-text field arrives **English, US-labeled**. A translation/curation layer produces Dari/Pashto. Any AI-assisted translation of clinical content MUST pass the **physician-confirmation gate** (CLAUDE.md rule #2) and store both AI and confirmed versions.

## 8. Licensing

- RxNav APIs: free, no key, but RxNorm bundles UMLS-sourced vocabularies — confirm UMLS license terms **if self-hosting RxNav-in-a-Box**. The hosted REST API itself is open.
- openFDA, DailyMed, MedlinePlus, RxImage: US-gov, public domain.
- DrugBank: commercial license required — only if the optional overlay (#6) is pursued.

## 9. Next steps

1. ~~DrugBank overlay now vs deferred~~ — **resolved: deferred (D6).** *(Superseded by §10 D8 — DrugBank is now a primary source.)*
2. ~~RxNav-in-a-Box vs hosted~~ — **resolved: hosted (D7).**
3. Produce a task-by-task implementation plan amending `plan-2-etl.md`: expand `nlm.ts` → RxClass/RxTerms, add `dailymed.ts` + `medlineplus.ts`, demote `drugbank.ts`, and apply the §6 pregnancy change end-to-end (types → ETL → Postgres migration → UI → i18n → tests).

---

## 10. Revision (2026-06-19b) — DrugBank XML + TWOSIDES + OnSIDES granted

We were granted a **commercial DrugBank license** plus access to parsed/raw datasets: DrugBank 5.1.13 (via [interstellar-egypt/dbdataset](https://github.com/interstellar-egypt/dbdataset), built with [dbparser](https://docs.ropensci.org/dbparser) 2.0.3), [TWOSIDES](https://docs.ropensci.org/dbparser/reference/parseTWOSIDES.html), and [OnSIDES v3.1.1](https://github.com/tatonetti-lab/onsides/releases/tag/v3.1.1). This **supersedes D3 and D6**.

### New decisions
| # | Decision | Choice |
|---|----------|--------|
| D8 | DrugBank role | **Primary clinical source** (supersedes D6 deferral). Commercial license held → DrugBank-derived fields are shippable. DrugBank attribution per license terms. |
| D9 | Interaction source | DrugBank `drug-interactions` (named pair + description) **+ TWOSIDES** (RxNorm pair + MedDRA effect + PRR). Supersedes D3. **The curated `drug-db` list remains the ONLY authoritative source for blocking CONTRAINDICATED/MAJOR** until D11's severity mapping is clinician-signed-off (rule #3). |
| D10 | Ingestion | **Parse raw DrugBank XML in Node** (no R, no `.rda`). TWOSIDES + OnSIDES ingested as **CSV**. Provider will supply: DrugBank XML, TWOSIDES CSV, OnSIDES v3.1.1 CSV. |
| D11 | DDI severity (safety-critical) | **Derive**: keyword-map DrugBank description text → tier (e.g. "contraindicated/avoid" → CONTRAINDICATED/MAJOR), with TWOSIDES **PRR as a corroborating signal**. The mapping table requires **clinical sign-off before it may drive any blocking**; until then signals are display-only and blocking stays on `drug-db`. PRR is a statistic, **never** equated to clinical severity. |

### Verified source schemas (from dbparser source + dataset docs — not assumed)
- **DrugBank** (`drug_pharmacology_parser.R`, `drug_parsers.R`): `mechanism_of_action`, `pharmacodynamics`, `indication`, `toxicity`, `metabolism`, `absorption`, `half_life`, `protein_binding`, `route_of_elimination`, `volume_of_distribution`, `clearance`; `drug-interactions` (target id + name + **description**, **no severity**); `dosages` (form/route/**strength only — NOT regimens**); `food-interactions`; ATC codes; classifications; `international_brands`; `products`; categories; synonyms; CETT.
- **TWOSIDES**: `drug_1_rxnorm_id`, `drug_1_concept_name`, `drug_2_rxnorm_id`, `drug_2_concept_name`, `condition_meddra_id`, `condition_concept_name`, `A`, `B`, `C`, `D`, `PRR`, `PRR_error`, `mean_reporting_frequency`.
- **OnSIDES v3.1.1**: `product_adverse_effect` CSV, ~6.93M associations, 1,866 ingredients; effects MedDRA-coded, drugs by **RxNorm ingredient**, BERT confidence threshold `pred1 > 3.258`. **Single-drug only — no DDIs.**

### Revised field ownership (overrides §5 where they overlap)
| Field | New primary source | Note |
|-------|--------------------|------|
| `mechanismOfAction` | DrugBank `mechanism_of_action` | direct |
| `pharmacokinetics` | DrugBank `half_life`/`protein_binding`/`volume_of_distribution`/`clearance`/`metabolism`/`route_of_elimination`/`absorption` | **free text** → see transform below |
| `interactions[]` | DrugBank + TWOSIDES (D9/D11) | severity derived, blocking gated |
| `adverseEvents[]` | **OnSIDES** `product_adverse_effect` (+ DrugBank `toxicity`) | MedDRA-coded |
| `indicationsClinical` | DrugBank `indication` | one free-text block → split |
| `brandNames[]` (international) | DrugBank `international_brands` + `products` | better than US-only openFDA |
| `substitutes[]`, `therapeuticClass` | DrugBank ATC/classifications | |
| **`adultDosing`/`pediatricDosing`** | **still DailyMed** | DrugBank has no regimens |
| **`pregnancyClinical`** | **still DailyMed/openFDA PLLR** | DrugBank has no PLLR section |
| **patient prose** (`summaryPlain`, `usedFor`…) | **still MedlinePlus** | DrugBank is clinician-grade, not patient-friendly |
| `localNames` (Dari/Pashto) | **still curation** | |

> So DrugBank+TWOSIDES+OnSIDES are a large **complement** — they do NOT remove the need for DailyMed (dosing, pregnancy) or MedlinePlus (patient prose).

### Ingestion architecture
- These are **large raw files** (DrugBank XML ≈ 1.4 GB uncompressed; TWOSIDES CSV multi-GB; OnSIDES CSVs sizable) — **never committed to git**. Stage in object storage / a known local path; the Node ETL **stream-parses** them and **filters to the catalog's RxNorm/DrugBank IDs** (we enrich the existing ~183-drug catalog first, then expand via D2).
- New adapters (replacing the demoted `drugbank.ts` stub): `drugbank-xml.ts` (streaming XML), `twosides.ts` (CSV), `onsides.ts` (CSV). RxNorm CUI is the join key across all three; DrugBank ID joins DrugBank↔TWOSIDES via DrugBank's RxNorm external identifiers.

### Required transforms (new work)
1. **PK free-text → model.** DrugBank PK is prose ("Approximately 1 hour"); our `DrugPharmacokinetics` uses **numeric** `halfLifeHours`/`proteinBindingPct`. Decision needed (mirrors the pregnancy refactor): either parse numbers best-effort, or **widen the PK fields to strings** to carry the source prose faithfully. **Flagged for the Plan, not resolved here.**
2. **MedDRA → display string** for OnSIDES/TWOSIDES effects (via UMLS/OMOP map shipped with OnSIDES).
3. **`indication` block → `indicationsClinical[]`** (sentence/segment split).
4. **DDI severity keyword-map** (D11) — a reviewed lookup, clinician sign-off gated.

### Next
- Reshape `plan-2-etl.md` into the new adapter set (`drugbank-xml`, `twosides`, `onsides`, plus the still-needed `dailymed`, `medlineplus`), the severity-map module, and the transforms above.
- Resolve the PK-field type decision (transform #1) before writing the DrugBank adapter task. **Resolved 2026-06-19: widen PK fields to strings (D12, §11).**

---

## 11. Verified against the actual datasets (`docs/datasets`, 6.0 GB)

Reviewed the real files (DrugBank XSD in full; XML + CSVs sampled with live values). The earlier schemas (§10) are **confirmed**; this section records the verified specifics and supersedes §10's inferred parts. Raw files live at `docs/datasets/` (gitignored — never committed).

### Inventory
- `drugbank-database/drugbank_full_database.xml` (1.6 GB, **DrugBank 5.1.13**) + `drugbank-data-structure.xsd` (authoritative) + `drugbank-parsing.ipynb` (provider reference parser).
- `TWOSIDES.csv/TWOSIDES.csv` (4.3 GB).
- `onsides-v3.1.1/csv/` — `product_adverse_effect.csv` (400 MB), `product_label.csv`, `product_to_rxnorm.csv`, `vocab_rxnorm_ingredient.csv`, `vocab_rxnorm_ingredient_to_product.csv`, `vocab_meddra_adverse_effect.csv`, `vocab_rxnorm_product.csv`, **`high_confidence.csv`** (pre-joined `ingredient_id,effect_meddra_id`); `schema/postgres.sql`; `annotations/` (training data, not used by ETL).

### Join architecture (the linchpin — verified on real drugs)
**RxCUI is the universal join key.** DrugBank `<drug>` carries `<external-identifiers>` with `resource="RxCUI"`, plus `<atc-codes>`:
```
DrugBank <drug> ──atc-code──►  drug_catalog.atc_code (our PK)
       └──external-identifier RxCUI──►  TWOSIDES drug_{1,2}_rxnorm_id   (DDIs)
                                  └────►  OnSIDES vocab_rxnorm_ingredient (adverse effects)
```
Confirmed: Lepirudin `DB00001` → ATC `B01AE02`, RxCUI `237057`, 653 interactions; Cetuximab `DB00002` → ATC `L01FE01`, RxCUI `318341`, 411 interactions.

### Verified DrugBank `<drug>` fields (namespace `http://www.drugbank.ca`)
- Primary id: `<drugbank-id primary="true">` (e.g. `DB00001`); plus secondary ids.
- PK/clinical prose: `mechanism-of-action`, `half-life`, `protein-binding`, `volume-of-distribution`, `clearance`, `metabolism`, `route-of-elimination`, `absorption`, `indication`, `pharmacodynamics`, `toxicity`.
- `atc-codes/atc-code[@code]`; `external-identifiers/external-identifier` (resource `RxCUI`); `international-brands/international-brand` (name+company); `products/product` (NDC, dosage-form, strength, route, country); `dosages/dosage` (form/route/strength — **NOT regimens**); `drug-interactions/drug-interaction` (drugbank-id + name + **description, no severity**); `categories`, `food-interactions`.

### Verified TWOSIDES columns (note header typo)
`drug_1_rxnorn_id` *(sic — misspelled)*, `drug_1_concept_name`, `drug_2_rxnorm_id`, `drug_2_concept_name`, `condition_meddra_id`, `condition_concept_name`, `A`, `B`, `C`, `D`, `PRR`, `PRR_error`, `mean_reporting_frequency`. RxNorm ids are bare integers.

### Verified OnSIDES (per `schema/postgres.sql`)
`product_adverse_effect`(product_label_id, effect_id, `label_section` [AR/BW/…], `effect_meddra_id`, match_method, pred0, `pred1`) → `product_label`(label_id, source [US/UK/EU/JP], …) → `product_to_rxnorm`(label_id, rxnorm_product_id) → `vocab_rxnorm_ingredient_to_product` → `vocab_rxnorm_ingredient`(rxnorm_id, name). MedDRA via `vocab_meddra_adverse_effect`(meddra_id, name, term_type). **Shortcut:** `high_confidence.csv`(`ingredient_id`,`effect_meddra_id`) is pre-joined ingredient→effect — the simplest path to `adverseEvents[]`.

### Gotchas confirmed from real data (must handle in parsers)
1. DrugBank PK/prose contains **HTML** (`<sup>`) and **citation markers** (`[L41…]`) → strip before storing.
2. Nested `<drug>` stubs inside `<pathways>`/`<reactions>` → parser must **filter to top-level drugs** (e.g. child-count guard).
3. OnSIDES RxNorm ids can be **OMOP-prefixed strings** (`OMOP997977`) → treat ids as strings, not ints.
4. RxCUI **level mismatch** (DrugBank RxCUI vs OnSIDES ingredient-level vs TWOSIDES drug-level) → ingredient-rollup/normalization step required.
5. TWOSIDES header **misspelling** `drug_1_rxnorn_id` → match literally.
6. DDI descriptions are **templated** ("X may increase the … activities of Y") → tractable for the D11 severity keyword-map.

### New decision
| # | Decision | Choice |
|---|----------|--------|
| D12 | PK field type | **Widen `DrugPharmacokinetics` numeric fields to strings** (`halfLifeHours:number`→`halfLife:string`, `proteinBindingPct:number`→`proteinBinding:string`), with HTML/citation cleaning. DrugBank PK is prose; numeric parsing is lossy. Mirrors the PLLR pregnancy refactor. |

### Licensing / attribution
Commercial DrugBank license held (D8) → DrugBank shippable with required attribution. **OnSIDES** and **TWOSIDES** (Tatonetti Lab, nSIDES) are permissive but require **attribution**; record in app legal/credits.

### Data flow (answers "does it end up at the Hub, cached by Pharmopedia?")
The 6 GB raw datasets are **build-time inputs only** — they never reach the Hub or devices. The ETL runs **off-device** (dev/CI/Hub-side), streams the raw files, filters to the catalog's drugs, maps fields, and **upserts enriched rows into Hub Postgres `drug_catalog`**. The Hub API serves them tier-scoped; **Pharmopedia syncs them into local SQLite** (`tier{1,2,3}_json` blobs) and reads them **offline**. So: enriched *subset* → Hub → synced/cached on device. Writing Plan 2 produces the code; the catalog is populated only when the ETL is **run**.
