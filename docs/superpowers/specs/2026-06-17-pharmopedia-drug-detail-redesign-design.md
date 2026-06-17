# Pharmopedia — Drug Detail Page Redesign + Basic Image Subsystem

**Date:** 2026-06-17
**Status:** Design — awaiting review
**App:** `apps/pharmopedia`
**Related prior work:** RTL bidi / Arabic-fallback fixes (A1 + B1) already landed in
`DrugCard`, `SectionCard`, `OverviewTab`, `ClinicalTab`, `drug/[atcCode].tsx`,
and `src/lib/localized-text.ts`.

---

## 1. Problem

The drug detail screen ([apps/pharmopedia/app/drug/[atcCode].tsx](../../../apps/pharmopedia/app/drug/[atcCode].tsx))
is structurally and visually poor:

1. **Double header** — the root layout enables the native stack header
   (`headerShown: true`, [_layout.tsx:111](../../../apps/pharmopedia/app/_layout.tsx)) *and*
   the screen draws its own custom header inside `SafeAreaView`. Two stacked bars.
2. **Tab scaffold is wrong for the audience** — a 4-tab structure
   (Overview / Clinical / Pricing / Enrich) collapses to 2 tabs for patients, with an
   animated underline that starts collapsed at x=0 until first tap. Content is hidden
   behind taps that mostly aren't there.
3. **Sparse content reads as broken** — when plain-language fields are empty, the
   Overview tab is just "Brand names" + "Dose forms" floating cards.
4. **Heavy card stacking** — each section is a bordered card with `marginBottom: Spacing[5]`,
   so short pages look like disconnected boxes.

### Data-source clarification (a reported but incorrect concern)

The data is **not** loaded from a JSON file. The catalog is synced from the Hub API into
local SQLite ([catalog-sync.ts](../../../apps/pharmopedia/src/sync/catalog-sync.ts) →
`upsertDrugBatch`), and the detail screen reads SQLite first with a live API fallback
([drug/[atcCode].tsx:84-86](../../../apps/pharmopedia/app/drug/[atcCode].tsx)). There are no
JSON data files in the app. The "looks like JSON / looks terrible" impression came from the
layout problems above and from sparse content, not the data source.

---

## 2. Goals / Non-goals

### Goals
- Replace the tabbed detail screen with a **single scrollable page** of **collapsible
  sections**, with a **pinned, non-collapsible safety zone** at the top.
- Remove the double header via one collapsing large-title shell.
- Render sections **only when they have data**; show one honest line when a drug has
  essentially no detailed content.
- Add a **basic image subsystem**: entry-level images, a primary "profile" image in the
  header, a collapsible Photos gallery, online-only with disk caching, and an
  enrich-based upload path.
- Preserve role-based tiering (public / clinical / pharmacist) and RTL correctness.

### Non-goals (explicitly deferred)
- Per-brand entities or restructuring `brandNames: string[]`.
- Pill/package *identification* features (matching a photo to a physical product).
- Region-specific image variants (the model allows it later; not built now).
- A full media CMS / bulk image pipeline. Upload is single-image via Enrich.

---

## 3. Page shell

Use the existing **`CollapsibleScreen`** (ui-kit native) as the page shell so the screen
owns one collapsing large-title header and a sticky compact bar on scroll. This removes the
double header.

- Root layout change: set `headerShown: false` for the `drug/[atcCode]` stack screen
  ([_layout.tsx:111](../../../apps/pharmopedia/app/_layout.tsx)); the screen provides its own
  header + back affordance.
- **Header content:**
  - Leading: **header thumbnail** — primary image (`isPrimary` DrugImage) rendered via
    ui-kit `Avatar`; fallback to a generic medical pill icon when absent/offline-uncached.
  - Title: local name (or INN), subtitle: `INN · ATC` (clinical only — ATC hidden for public).
  - Actions: bookmark (heart) + share, as header actions.
  - Therapeutic-class `Chip` beneath the title.

---

## 4. Section model & ordering

Single vertical scroll. Top-to-bottom:

| # | Section | Collapsible? | Default | Roles |
|---|---------|-------------|---------|-------|
| 0 | Header (collapsing title, thumbnail, chip, actions) | n/a | n/a | all |
| 1 | **Safety zone** — warnings, when-to-seek-help; + interactions & contraindications | ❌ pinned | always open | all (clinical sees more) |
| 2 | What it is (summary) | ✅ | **open** | all |
| 3 | What it's used for | ✅ | **open** | all |
| 4 | Side effects | ✅ | collapsed | all |
| 5 | Pregnancy & breastfeeding | ✅ | collapsed | all |
| 6 | How to store | ✅ | collapsed | all |
| 7 | Forms & brand names (merged) | ✅ | collapsed | all |
| 8 | **Photos** (brand-labeled gallery + disclaimer) | ✅ | collapsed | all |
| 9 | Pricing near you (lazy-loads on expand) | ✅ | collapsed | all |
| 10 | **Clinical details** (mechanism, dosing, renal, adverse events, PK, admin notes) | ✅ | collapsed | clinical+ |
| 11 | **Dispensing & formulary** (+ edit affordance, replaces Enrich tab) | ✅ | collapsed | pharmacist/admin |

### Default-open set
Safety (pinned) + "What it is" + "What it's used for". All others collapsed.

### Clinical depth
One grouped **"Clinical details"** collapsible containing sub-rows (not one collapsible per
clinical topic), so patient and clinician both get a clean page.

### Safety exemption (healthcare rule)
Per project safety rules, safety-critical content is never hidden behind a collapse or tab.
The **Safety zone (section 1)** is the implementation of this: it is always rendered, always
expanded, cannot be collapsed, and uses the danger/warning visual treatment. It carries, for
all roles, `warningsSummaryPlain` and `whenToSeekHelp`; for clinical roles it additionally
carries `interactions` and `contraindications` (currently only surfaced via the
clinical-only `SafetyBanner`).

### Empty / sparse handling
- A section with no data **does not render** (no empty cards).
- If a drug has none of the informational fields populated, render a single line
  ("Detailed information isn't available yet for this medicine") in place of the body —
  not a page of blank boxes.

---

## 5. Image subsystem (basic)

### 5.1 Data model
Add to `packages/shared-types/src/fhir/drug-catalog.ts`:

```ts
export interface DrugImage {
  url: string            // Supabase Storage URL — never a blob in the synced catalog
  brand?: string         // brand depicted; undefined = generic/representative image
  caption?: string
  isPrimary?: boolean     // the one shown as the header "profile" image
}
```
Add `images?: DrugImage[]` to `DrugEntryTier1` (so all roles can see images). Because the
entry is serialized whole into `tier1_json`/`tier2_json`/`tier3_json`, **no new SQLite
column is required** — `images` rides inside the existing entry JSON. The FTS index is
unaffected (images are not searchable text).

`brandNames: string[]` is **unchanged**. An image associates to a brand by its `brand`
string. The generic entry never claims to *be* a brand; a primary image is presentational.

### 5.2 Storage & delivery
- Images live in a **Supabase Storage** bucket (per project DB rules — all DB/storage ops
  via Supabase tooling). The catalog entry carries only **URLs**.
- Display via **`expo-image`** (new app dependency) using its built-in disk cache.
- **Offline posture:** online-only, cached-after-first-view (same as Pricing). Never block
  render; on offline-and-uncached, fall back to the generic pill icon (header) or hide the
  Photos gallery body with a short "Photos unavailable offline" note.

### 5.3 Display
- **Header thumbnail:** primary image → `Avatar`; else generic pill icon.
- **Photos section (collapsible, all roles):** horizontal gallery of `images`, each tile
  labeled with its `brand` (or "Generic" when absent), with a persistent disclaimer:
  **"Illustrative only — verify the actual packaging."**

### 5.4 Upload / populate (pharmacist/admin)
- Extend the **Enrich** flow (`EnrichTab` → becomes the Dispensing/edit affordance) and
  `enrichDrugApi` / `EnrichFields` to accept a single image upload (pick from library / take
  photo) with a `brand` label and an optional `isPrimary` toggle.
- Upload target: Supabase Storage via the Hub (`drugCatalog.enrich` mutation extended), which
  returns the stored URL and persists the updated `images[]` on the entry.
- **PHI governance:** uploader UI must warn that catalog images show **generic packaging
  only — no patient information, labels, or dispensed-bottle photos**. (Catalog images are
  not PHI; this prevents accidental PHI capture.)

---

## 6. Components

### New
- `packages/ui-kit/src/native/CollapsibleSection.tsx` — shared accordion/disclosure: header
  row (title, chevron, optional count/badge), animated expand/collapse honoring
  `useReducedMotion`, RTL-correct chevron via the native directional pattern. Exported from
  `packages/ui-kit/src/native/index.ts`. (Rebuild ui-kit after change.)
- `apps/pharmopedia/src/components/DrugDetail/SafetyZone.tsx` — pinned, non-collapsible
  safety block (absorbs/extends `SafetyBanner`).
- `apps/pharmopedia/src/components/DrugDetail/MediaSection.tsx` — Photos gallery + disclaimer.
- `apps/pharmopedia/src/components/DrugDetail/sections/*` — section bodies migrated from the
  former tab components (reuse `SectionCard` + `localized-text` helpers already in place).

### Modified
- `apps/pharmopedia/app/drug/[atcCode].tsx` — rewritten from tabbed layout to single-scroll
  `CollapsibleScreen` + sections; remove tab state, `tabLayouts`, indicator animation.
- `apps/pharmopedia/app/_layout.tsx` — `headerShown: false` for the drug screen.
- `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx` — becomes the Dispensing & edit
  surface (incl. image upload), no longer a tab.
- `packages/shared-types/src/fhir/drug-catalog.ts` — add `DrugImage` + `images?`.
- `apps/pharmopedia/src/api/drug-catalog.ts` — extend `EnrichFields` + enrich call for image
  upload; image URL handling.
- `apps/hub-api` — extend `drugCatalog.enrich` to accept/store the image and persist
  `images[]`; provision the Supabase Storage bucket.
- `apps/pharmopedia/package.json` — add `expo-image`.

### Removed (folded into sections)
- The tab-bar machinery and the `OverviewTab` / `ClinicalTab` / `PricingTab` tab wrappers
  become plain section bodies (content preserved, chrome dropped).

---

## 7. Role gating
- **public/patient:** sections 1–9.
- **clinical (DOCTOR/NURSE/LAB_TECH):** + section 10; ATC shown in subtitle; clinical safety
  items in the Safety zone.
- **pharmacist/admin:** + section 11 (Dispensing & formulary) and image upload via Enrich.

Tier scoping is unchanged (`scopeEntryForRole`); the page renders sections conditionally on
the resolved tier and on field presence.

---

## 8. RTL / i18n
- Reuse the already-landed `localized-text` resolver + `SectionCard` content-direction rules
  (RTL content → Arabic font + `writingDirection: rtl`; Latin → explicit `ltr`).
- New strings (Photos title, disclaimer, empty-state line, upload warnings, section titles)
  added to all four locale files (`en`, `prs`, `ps`, `ar`) — `locale-parity.test.ts` enforces
  key parity.
- `CollapsibleSection` chevron mirrors in RTL; gallery scroll direction respects RTL.

---

## 9. Testing
- **Snapshot:** single-scroll page in LTR + RTL, patient vs clinical role (replaces the
  current `drug-detail-rtl` tab snapshots).
- **Safety:** test that the Safety zone renders, is expanded, and exposes no collapse
  control (healthcare rule coverage).
- **Collapsible:** `CollapsibleSection` expand/collapse, reduced-motion path, RTL chevron.
- **Empty/sparse:** entry with no informational fields → single honest line, no empty cards.
- **Images:** primary → header avatar; none → pill icon; gallery renders brand labels +
  disclaimer; offline-uncached → fallback (no crash/block).
- **Enrich upload:** image field plumbs through `enrichDrugApi`; PHI warning present.
- **i18n:** locale parity for new keys.

---

## 10. Out of scope / future
- Per-brand entity model; region-specific image variants; pill identification.
- Bulk image ingestion / CMS; image moderation workflow.
- Caching policy tuning beyond `expo-image` defaults.

---

## 11. Open questions
- None blocking. Supabase bucket name + Hub enrich contract details to be finalized in the
  implementation plan.
