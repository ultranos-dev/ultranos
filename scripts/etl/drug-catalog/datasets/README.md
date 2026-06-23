# Brand-name enrichment (Option D)

Two complementary ways to widen `drug_catalog.brand_names` so users can search a
drug by a **generic or brand name** — including region-specific brands the
DrugBank seed lacks. Both runners are **idempotent** and **safe**: they *merge*
brands (never replace), dedupe case-insensitively, and only upsert rows that
actually gained a brand. No brand is ever invented — every brand comes from an
authoritative source (NLM RxNorm or an operator-supplied registry).

## 1. RxNav brand expansion — runs today, no new data

```bash
pnpm -F @ultranos/drug-catalog-etl run-rxnav-brands
```

For every catalog row that has an `rxnorm_cui`, fetches the RxNorm brand-name
(TTY=BN) concepts NLM relates to it and merges them in. Authoritative and
license-free, but RxNorm skews US/global — it raises overall brand coverage and
search hit-rate, but is **not** specifically MENA/Central-Asia.

> Coverage is bounded by `rxnorm_cui` population — rows without a CUI are skipped
> and reported. Improving the RxNorm crosswalk first improves this pass.

## 2. Regional registry ingestion — true regional coverage (you supply the data)

```bash
# Drop your dataset at docs/datasets/regional-brands.json (or .csv), then:
pnpm -F @ultranos/drug-catalog-etl run-regional-brands
# or point at a specific file:
REGIONAL_BRANDS_FILE=docs/datasets/afghan-brands.csv pnpm -F @ultranos/drug-catalog-etl run-regional-brands
```

Ingests a curated regional/national drug-registry export and matches its brand
names to catalog drugs by **ATC code** (preferred) or **INN** (alias-aware via
the WHO-INN↔USAN map). This is the path to real MENA & Central-Asia brand
coverage — **you provide the dataset** (e.g. a national formulary export). The
pipeline only parses, matches and merges it.

### Dataset format

Format is inferred from the file extension (`.csv` → CSV, otherwise JSON).
See [`regional-brands.example.json`](./regional-brands.example.json) and
[`regional-brands.example.csv`](./regional-brands.example.csv) — **templates
only; replace with authoritative registry data before relying on it.**

**JSON** — array of records (camelCase or snake_case keys accepted):

```json
[
  { "atcCode": "J01CA04", "innName": "amoxicillin",
    "brandNames": ["Amoxil", "Ospamox"], "market": "AF", "source": "MoPH-NEML" }
]
```

`brandName`/`brand_name` (singular string) and `brand_names` are also accepted.

**CSV** — header row required. Recognised columns (case-insensitive):
`atc_code`, `inn_name`, `brand_name` (one per row) **or** `brand_names`
(`;`/`|`-delimited), `market`, `source`.

A record needs at least one key (`atcCode` **or** `innName`) and at least one
brand, otherwise it is skipped.

## 3. Branded medications — structured products (separate tables)

```bash
# Drop your dataset at docs/datasets/branded-medications.json, then:
pnpm -F @ultranos/drug-catalog-etl run-branded-medications
# or: BRANDED_FILE=docs/datasets/my-products.json pnpm -F @ultranos/drug-catalog-etl run-branded-medications
```

For when a brand needs more than a name — **manufacturer, strength, form, pack,
reference price, registration #**. Ingests a nested JSON dataset into the two
normalized tables (`drug_brands` → `drug_brand_presentations`, migration 040)
and keeps the `drug_catalog.brand_names` search shadow in sync so name-search
still works offline. Idempotent (brands upsert on atc+brand+manufacturer;
presentations on a deterministic presentation key).

> `reference_price` here is an **indicative list price**, distinct from the
> per-pharmacy `pharmacy_prices.retail_price`.

See [`branded-medications.example.json`](./branded-medications.example.json) for
the schema (nested `presentations[]`, camelCase or snake_case keys). Template
only — replace with sourced product data.

## Optional: per-brand provenance

Both runners can record where each new brand came from (`drugbank` | `rxnav` |
`regional`) in a `brand_sources` JSONB column. It's **off by default**. To use
it, apply migration `039_drug_catalog_brand_sources.sql` (via the Supabase MCP
tools) and run with `WRITE_BRAND_SOURCES=1`.

## Env

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (from `apps/hub-api/.env.local`).
Optional: `ETL_CHUNK` (default 200), `RXNAV_CONCURRENCY` (default 4),
`REGIONAL_BRANDS_FILE`, `WRITE_BRAND_SOURCES`.
