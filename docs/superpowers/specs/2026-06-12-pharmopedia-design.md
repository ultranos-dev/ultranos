# Pharmopedia — Design Spec

**Date:** 2026-06-12
**Status:** Approved for implementation planning
**Branch context:** ux-v1.5

---

## 1. Overview

Pharmopedia is a new standalone React Native mobile app in the Ultranos ecosystem. It is a centralized drug reference database serving three distinct user types — general public, clinicians, and pharmacists — with role-tiered content. It is not a clinical workflow app; it is a pure reference and discovery tool.

**Core value proposition:**
- Any registered user can look up a drug and get information appropriate to their role
- Clinicians get Medscape-style clinical depth (indication-specific dosing, interactions, adverse effects) offline
- Pharmacists get full clinical detail plus formulary status, facility availability, and market pricing intelligence
- General public gets plain-language summaries and a pharmacy finder showing nearby prices in AFN

---

## 2. Scope

### In scope (v1)
- React Native mobile app (iOS + Android), offline-first
- Three user tiers: public, clinician, pharmacist
- Drug catalog seeded from DrugBank + OpenFDA + NLM (RxNorm, MedlinePlus, DailyMed)
- Local enrichment layer (Dari/Pashto names, dispensing notes, formulary status, pricing) curated in OPD-Lite and Pharmacy-Lite
- Pharmacy finder: real-time prices from Pharmacy-Lite network, sortable by distance or lowest price
- Full RTL support (Dari, Pashto)
- Offline drug lookup (all tabs except Pharmacy Finder require connectivity)
- Ultranos credential login (no new auth system)
- Deep links from OPD-Lite and Pharmacy-Lite into drug detail by ATC code

### Out of scope (v1)
- NGO/donor programme pricing or availability
- Drug catalog curation UI within Pharmopedia (curation happens in OPD-Lite and Pharmacy-Lite)
- Web version
- Anonymous or guest access — all users (including general public) must create an account and verify via OTP before any content is accessible
- Drug interaction checker (stays in `packages/drug-db`, not duplicated)
- Medical calculators
- CME/education content

---

## 3. Architecture

### Approach: Hub Service + drug-db as Interaction-Only Package

The canonical drug content lives in a new Hub API service (`/drug-catalog`). The existing `packages/drug-db` is not modified — it remains scoped to interaction checking logic (CONTRAINDICATED / ALLERGY_MATCH / WARNING severity) used by OPD-Lite and Pharmacy-Lite internally.

```
OPD-Lite ──curates──▶ Hub /drug-catalog ◀──curates── Pharmacy-Lite
                              │
              sync down (role-scoped subsets)
         ┌────────────┴────────────┬──────────────────┐
      OPD-Lite            Pharmacy-Lite          Pharmopedia RN
   (search/names)        (formulary subset)      (full catalog)

packages/drug-db → interaction checking only (unchanged)
```

### App platform
React Native (same stack as `apps/patient-lite-mobile`), TypeScript, SQLCipher for local storage, Android Keystore / iOS Secure Enclave for encryption key management.

### Offline strategy
- Full drug catalog synced to local SQLCipher on first login via `GET /drug-catalog/sync`
- Incremental sync on subsequent sessions using HLC watermark (`since=` parameter)
- All drug detail tabs work fully offline from local cache
- Pharmacy Finder (`/prices` endpoint) is online-only — shows "prices unavailable offline" state when disconnected
- Sync timestamp shown on Profile tab ("Last updated X ago")

---

## 4. Data Model

### Drug Entry Schema

**Core Identity** (all tiers)
| Field | Source |
|---|---|
| `atcCode` | WHO EML (canonical ID) |
| `rxnormCui` | NLM RxNorm (join key across sources) |
| `drugbankId` | DrugBank (reference) |
| `innName` | WHO / NLM |
| `brandNames[]` | OpenFDA |
| `localNames` | Local enrichment — Dari/Pashto names from OPD-Lite/Pharmacy-Lite |
| `therapeuticClass` | WHO ATC category |
| `doseForms[]` | OpenFDA |

**Tier 1 — Public** (all logged-in users)
| Field | Source |
|---|---|
| `summaryPlain` | MedlinePlus |
| `usedFor[]` | MedlinePlus |
| `commonSideEffects[]` | MedlinePlus |
| `whenToSeekHelp` | MedlinePlus |
| `storageInstructions` | DailyMed |
| `pregnancySummaryPlain` | MedlinePlus (simplified) |
| `warningsSummaryPlain` | MedlinePlus (simplified) |

**Tier 2 — Clinical** (clinician + pharmacist roles)
| Field | Source |
|---|---|
| `mechanismOfAction` | DrugBank |
| `indicationsClinical[]` | DrugBank / DailyMed (ICD-10 mapped) |
| `adultDosing` | DailyMed (indication-specific) |
| `pediatricDosing` | DailyMed (weight-based) |
| `renalAdjustment` | DrugBank |
| `adverseEvents[]` | OpenFDA FAERS (frequency-graded) |
| `contraindications[]` | DrugBank / OpenFDA |
| `interactions[]` | DrugBank (severity + mechanism) |
| `pregnancyCategory` | OpenFDA / DrugBank |
| `administrationNotes` | DailyMed |
| `pharmacokinetics` | DrugBank (half-life, protein binding, Vd) |

**Tier 3 — Pharmacist only** (all of Tier 1 + 2, plus)
| Field | Source |
|---|---|
| `formularyStatus` | Local enrichment (BPHS on/off formulary) |
| `facilityAvailability[]` | Pharmacy-Lite (static per-facility stock signal — shown in Formulary tab, distinct from the real-time pharmacy finder in Pricing & Savings) |
| `dispensingNotes` | Local enrichment |
| `substitutes[]` | DrugBank / NLM |
| `recallAlerts[]` | OpenFDA (active recalls) |
| `unitCost` | Local enrichment (procurement cost) |

**Pharmacy Prices** (real-time, not cached — online only)
| Field | Source |
|---|---|
| `pharmacyName` | Pharmacy-Lite facility record |
| `distanceKm` | Calculated from user coords vs facility GPS |
| `retailPrice` | Pharmacy-Lite (set by pharmacist) |
| `stockSignal` | Pharmacy-Lite (in_stock / low_stock / out_of_stock) |

### ETL Source Priority
When the same field exists in multiple sources, merge priority is:
1. DrugBank
2. OpenFDA
3. NLM (RxNorm / MedlinePlus / DailyMed)

Local enrichment fields are stored in a separate column set and are never touched by ETL refreshes.

---

## 5. ETL Seed Pipeline

Location: `scripts/etl/drug-catalog/`

**Sources:**
- **DrugBank API** — commercial license required for full dataset + interactions. Provides: interactions, MOA, pharmacokinetics, substitutes, renal dosing, pregnancy category.
- **OpenFDA API** — free. Provides: drug labels, adverse event reports (FAERS), recalls, brand names, pregnancy category, administration notes.
- **NLM APIs** — free. RxNorm API (canonical CUI), MedlinePlus Connect (plain-language summaries), DailyMed (structured product labeling, indication-specific dosing).

**Pipeline steps:**
1. Pull from all three APIs (paginated, rate-limited)
2. Normalize: deduplicate on ATC code + RxNorm CUI as join keys
3. Merge fields by source priority; flag conflicts for admin review
4. Never overwrite local enrichment fields (`localNames`, `dispensingNotes`, `formularyStatus`, `unitCost`, `facilityAvailability`)
5. Upsert into Hub `drug_catalog` PostgreSQL table with `updatedAt` HLC timestamp
6. Schedule: initial full seed at launch, monthly refresh thereafter

---

## 6. Hub API Endpoints

### New endpoints under `/drug-catalog`

#### `GET /drug-catalog/search`
**Params:** `q` (string), `lang` (en/prs/ps), `limit` (default 20)
**Auth:** Any authenticated Ultranos role
**Returns:** `[{ atcCode, innName, localName, brandNames, therapeuticClass }]`
**Used by:** OPD-Lite (prescription search), Pharmacy-Lite (catalog browse), Pharmopedia (search tab)
**Notes:** Fuzzy match on INN name, brand names, local Dari/Pashto names, ATC code. Returns identity fields only — no tier content.

#### `GET /drug-catalog/:atcCode`
**Auth:** Any authenticated Ultranos role
**Returns:** Drug entry scoped to the role in the JWT claim (public → Tier 1, clinician/nurse → Tier 1+2, pharmacist → Tier 1+2+3)
**Used by:** Pharmopedia drug detail screen
**Notes:** Single endpoint, role-scoped response. Hub strips fields not belonging to the caller's tier before returning.

#### `GET /drug-catalog/sync`
**Params:** `since` (HLC watermark), `lang` (en/prs/ps)
**Auth:** Any authenticated Ultranos role
**Returns:** All drug entries updated since the watermark, role-scoped
**Used by:** Pharmopedia offline sync only
**Notes:** Same HLC incremental sync pattern as other spokes. Initial sync (no `since`) returns full catalog. Role-scoped — pharmacists get Tier 3 fields in their local cache.

#### `PATCH /drug-catalog/:atcCode/enrich`
**Auth:** Clinician → `localNames` only. Pharmacist → all enrichment fields.
**Body:** `{ localNames?, dispensingNotes?, formularyStatus?, unitCost? }`
**Used by:** OPD-Lite (clinicians add Dari/Pashto names), Pharmacy-Lite (pharmacists set formulary, pricing, notes)
**Notes:** Never touches ETL-sourced fields. Emits structured audit event via `@ultranos/audit-logger` on every write. Facility-scoped for pharmacist role (`facilityId` from JWT).

#### `GET /drug-catalog/:atcCode/prices`
**Params:** `lat` (float), `lng` (float), `sort` (distance|price — distance = nearest first, price = lowest retail price first), `limit` (default 10)
**Auth:** Any authenticated Ultranos role
**Returns:** `[{ pharmacyName, facilityId, distanceKm, retailPrice, stockSignal }]`
**Used by:** Pharmopedia Pricing & Savings tab (online only)
**Notes:** Queries `pharmacy_prices` table joined to facility GPS coordinates. Real-time only — not included in `/sync`. Client detects offline state before calling this endpoint and shows "prices unavailable offline" instead — endpoint is not called when there is no connectivity.

#### `PUT /drug-catalog/:atcCode/prices/:facilityId`
**Auth:** Pharmacist role, facility-scoped (facilityId must match JWT claim)
**Body:** `{ retailPrice, stockSignal, doseForms[] }`
**Used by:** Pharmacy-Lite when pharmacist saves a drug price
**Notes:** Creates or updates price record. Emits audit event.

---

## 7. App Navigation & Screens

### Bottom Tab Bar
| Tab | Icon | Description |
|---|---|---|
| Search | 🔍 | Primary landing — drug search, recent history, category chips |
| Browse | 📂 | Browse by ATC therapeutic class |
| Saved | 🔖 | Bookmarked drugs |
| Profile | 👤 | Role badge, language selector, sync status, settings |

### Drug Detail Screen (pushed from any tab)
Sticky scrollable tab bar. Tabs available depend on user role:

| Tab | Public | Clinician | Pharmacist | Primary source |
|---|---|---|---|---|
| Overview | ✓ | ✓ | ✓ | MedlinePlus |
| Side Effects (plain) | ✓ | — | — | MedlinePlus |
| Dosing & Uses | — | ✓ | ✓ | DailyMed / DrugBank |
| Adverse Effects | — | ✓ | ✓ | OpenFDA FAERS |
| Interactions | — | ✓ | ✓ | DrugBank |
| Warnings & Contraindications | simplified | full | full | OpenFDA / DrugBank |
| Pharmacology (MOA, PK) | — | ✓ | ✓ | DrugBank |
| Pregnancy & Lactation | simplified | full | full | OpenFDA / DrugBank |
| Administration | — | ✓ | ✓ | DailyMed |
| Formulary & Availability | — | — | ✓ | Local enrichment |
| Pricing & Savings | ✓ | ✓ | ✓ | Local enrichment + real-time |

### Pricing & Savings tab (all tiers, tiered content)
- **Public:** BPHS free availability callout + pharmacy finder (sort by nearest/cheapest)
- **Clinician:** Affordability summary (BPHS free vs private lowest price) + pharmacy finder sorted cheapest + cost vs therapeutic alternatives
- **Pharmacist:** Own pharmacy's retail price + margin + market comparison list + pharmacy finder

Pharmacy finder list items: pharmacy name, distance (km), price in AFN, stock signal badge. Online-only; shows "prices unavailable offline" state when disconnected.

### Deep Links
OPD-Lite and Pharmacy-Lite can deep-link into Pharmopedia drug detail using the ATC code scheme:
`pharmopedia://drug/:atcCode`

Share button on drug detail generates the same deep link for peer sharing.

---

## 8. Integration with OPD-Lite and Pharmacy-Lite

### OPD-Lite changes
- Prescription entry drug search: switch from local vocabulary to `GET /drug-catalog/search`
- Add enrichment write: when clinician adds a Dari/Pashto name to a drug, call `PATCH /drug-catalog/:atcCode/enrich`
- Add deep-link button on prescription entry drug detail → opens Pharmopedia

### Pharmacy-Lite changes
- Catalog browse: switch to `GET /drug-catalog/search`
- Inventory receive: write retail price to `PUT /drug-catalog/:atcCode/prices/:facilityId` when pharmacist saves a price
- Stock signal write: update `stockSignal` via the same prices endpoint when stock level changes (in_stock / low_stock / out_of_stock)
- Add deep-link button from catalog item → opens Pharmopedia

### packages/drug-db — no changes
Interaction checking logic remains entirely in `packages/drug-db`. It uses its own offline subset for CONTRAINDICATED/ALLERGY_MATCH/WARNING checks and does not query Hub `/drug-catalog`.

---

## 9. Auth & Role Scoping

No new auth system. Pharmopedia uses the same Ultranos RS256 JWT with the existing role claim:

```json
{
  "sub": "user-uuid",
  "role": "pharmacist",
  "facilityId": "fac-uuid",
  "app": "pharmopedia"
}
```

Hub role mapping:
- `public` / `patient` → Tier 1 fields only
- `clinician` / `nurse` / `doctor` → Tier 1 + Tier 2
- `pharmacist` → Tier 1 + Tier 2 + Tier 3

**Public user registration:** General-public users must create an account before accessing any content. Registration flow: name, phone number, OTP verification, then a brief profile step (date of birth, gender — used for age-appropriate drug information). They receive a `public` role JWT. They have no access to any other Ultranos spoke.

**Patient Lite Mobile alignment:** Patient Lite Mobile follows the same rule — account creation is mandatory for all users including patients. No anonymous or guest access in either app.

`PATCH /enrich` and `PUT /prices` are facility-scoped — pharmacists can only enrich drugs and set prices for their own `facilityId`.

---

## 10. RTL & Localisation

- Language toggle in Profile tab: English / دری (Dari) / پښتو (Pashto)
- Full RTL layout flip when Dari or Pashto selected — same pattern as `apps/patient-lite-mobile`
- When a local name exists for the selected language, it is shown as the primary drug title; INN name shown as subtitle
- All UI strings via `i18n` (next-intl equivalent for React Native — react-i18next)
- Drug content fields (summaryPlain, usedFor, etc.) are stored per-language in Hub and returned in the requested `lang` param

---

## 11. Offline Behaviour Summary

| Feature | Offline available? | Notes |
|---|---|---|
| Drug search | ✓ | Searches local SQLCipher cache |
| All drug detail tabs | ✓ | Except Pricing & Savings pharmacy finder |
| Pharmacy Finder | ✗ | Shows "unavailable offline" state |
| Sync | ✗ | Queued, runs on reconnect |
| Login | ✗ | Requires initial online auth |

---

## 12. New Files & Packages

### New app
`apps/pharmopedia/` — React Native app (mirrors `apps/patient-lite-mobile/` structure)

### Hub API additions
`apps/hub-api/src/routes/drug-catalog.ts` — new router
`apps/hub-api/src/services/drug-catalog.service.ts`
`apps/hub-api/src/services/drug-prices.service.ts`
`apps/hub-api/db/migrations/XXXX_drug_catalog.sql`
`apps/hub-api/db/migrations/XXXX_pharmacy_prices.sql`

### ETL pipeline
`scripts/etl/drug-catalog/` — seed and refresh scripts
`scripts/etl/drug-catalog/sources/drugbank.ts`
`scripts/etl/drug-catalog/sources/openfda.ts`
`scripts/etl/drug-catalog/sources/nlm.ts`
`scripts/etl/drug-catalog/normalizer.ts`

### Shared types
`packages/shared-types/src/fhir/drug-catalog.ts` — DrugEntry, PharmacyPrice, DrugTier types

---

## 13. Open Questions / Decisions Deferred to Implementation

1. **DrugBank licensing** — confirm subscription tier required for full interaction data + API access before implementation starts.
2. **Facility GPS coordinates** — Pharmacy-Lite facility records need lat/lng stored in Hub for the pharmacy finder distance calculation. Confirm this exists or add it.
3. **Initial catalog scope** — seed full DrugBank/OpenFDA dataset or filter to WHO EML (~500 drugs) first. Recommendation: WHO EML as phase 1, expand in phase 2.
4. **Pharmopedia App Store registration** — separate app ID from Patient Lite required for iOS/Android store listings.
