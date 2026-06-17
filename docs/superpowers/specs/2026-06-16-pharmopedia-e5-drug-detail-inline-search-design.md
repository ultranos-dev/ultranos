# Pharmopedia E5 — Drug-Detail Rework + Inline Home Search + P0 Fixes (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Part of:** the Pharmopedia UX overhaul (E1–E4 ✓, O1–O3 ✓ → **E5** → E6).

---

## 1. Background

The drug-detail screen's Clinical tab is incomplete and is the source of the only red tests left in the suite (4 `clinical-tab-extended` failures). Separately, the Home dashboard's search bar is a static button that navigates to a standalone `/search` screen; the product requirement is that search must be **fully functional inline on the dashboard** and never route the user to a standalone search page/tab. E5 closes the drug-detail gaps, brings the drug-detail screen to Clinical-Calm parity with E4, and makes Home the single search surface.

**Findings that shape the design (from exploration):**
- **ClinicalTab** (`src/components/DrugDetail/ClinicalTab.tsx`) does not accept the `lang` prop the tests pass, renders `ix.description` (the real field is `ix.mechanism`), and is **missing** the pharmacokinetics, pediatric dosing, and administration-notes sections. All `drug.clinical.*` i18n keys already exist.
- **`lang` plumbing bug:** `getDrugByAtcCodeApi(atcCode, lang, token)` is 3-arg, but `app/drug/[atcCode].tsx` and `__tests__/api/drug-catalog.test.ts` call it with 2; `<ClinicalTab>` is rendered without `lang`. `[atcCode].tsx` also has type errors (ShareButton `entry`, interactions assertion, `scopeEntryForRole`/tab types).
- **DrugCard/SearchBar test failures** are test-side mismatches with the components' current `lang` props (the components are correct).
- **Home search** (`app/(tabs)/index.tsx`) renders `HomeSearchField` (a static `Pressable` → `router.push('/search')`); recent chips navigate to `/search?q=`. The real search logic lives in `app/search.tsx` (`searchDrugs` FTS local-first → `searchDrugsApi` fallback, 300ms-debounced `SearchBar`, `DrugCard` results, `addRecent` + `router.push('/drug/[atcCode]')`).
- Search building blocks: `searchDrugs(db, q, lang, limit)` (FTS, `src/db/fts.ts`), `searchDrugsApi(q, lang, limit, token)` (`src/api/drug-catalog.ts`), `useRecentSearchStore` (persisted, capped at 10), `DrugCard({ result, lang, onPress })`.
- Drug-detail tabs use ad-hoc `View`/`Text` + a local `SectionCard`, not `@ultranos/ui-kit/native`.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Drug-detail scope | **Fixes + full Clinical-Calm rework** of the drug-detail screen (Overview/Clinical/Pricing tabs to ui-kit native). Enrich tab = token alignment only. |
| Safety prominence | `CONTRAINDICATED`/`MAJOR` interactions + contraindications elevated to a prominent **destructive Banner/Card at the top** of the Clinical tab (CLAUDE.md safety rule). |
| Home search | **Inline on the dashboard**; empty query → dashboard sections, non-empty → inline `DrugCard` results. **Never navigates to a search screen.** |
| Standalone `/search` | **Removed entirely** (route + screen). Home is the single search surface. Browse tab stays. |
| Shared search logic | Extracted to a **`useDrugSearch`** hook (offline-first, debounced) used by Home. |
| DrugCard/Browse visual restyle | **Out of scope** (E6). E5 fixes only the `lang` plumbing/test bugs touching them. |

## 3. Scope

### 3.1 Part A — P0 bug cluster

1. **`ClinicalTab`** (`src/components/DrugDetail/ClinicalTab.tsx`):
   - Signature → `{ entry: DrugEntryTier2; lang: Lang }` (mirror `OverviewTab`).
   - Interaction row: render `ix.mechanism` (not `ix.description`).
   - Add **pharmacokinetics** section (`halfLifeHours`, `proteinBindingPct`, `volumeOfDistribution`, `metabolism`, `excretion`) rendered only when present.
   - Add **pediatric dosing** section (mirror adult dosing, from `entry.pediatricDosing`).
   - Add **administration notes** section, localized via a `localText(field: DrugLocalizedText, lang)` helper (reuse/extract from `OverviewTab`), rendered when the selected-lang (or `en` fallback) text exists.
2. **`lang` plumbing:**
   - `app/drug/[atcCode].tsx`: call `getDrugByAtcCodeApi(code, lang, token)` (3-arg) and render `<ClinicalTab entry={...} lang={lang} />`.
   - Fix the remaining `[atcCode].tsx` type errors (ShareButton `entry` typing, `(entry as DrugEntryTier2).interactions` assertion, `scopeEntryForRole`/`Tab` typing).
   - Update `__tests__/api/drug-catalog.test.ts` to call `getDrugByAtcCodeApi` with the 3-arg signature.
3. **DrugCard/SearchBar tests:** realign `DrugCard.test.tsx` (pass the required `lang` prop) and `SearchBar.test.tsx` (drop the non-existent props) to the components' current APIs.

### 3.2 Part B — Clinical-Calm drug-detail rework

- Refactor the drug-detail **shell + tab bar** and the **Overview / Clinical / Pricing** tab components to `@ultranos/ui-kit/native` primitives (`Card`, `CardSection`, `ListRow`, `Chip`, `Banner`), theme-aware (`useThemeColors`) and RTL-aware (`isRtlLang`), matching E4's visual language. The local `SectionCard` is re-expressed via `CardSection` (or restyled to tokens and kept if it carries severity semantics ui-kit lacks).
- **Safety elevation:** at the top of the Clinical tab, surface any `CONTRAINDICATED`/`MAJOR` interactions and contraindications in a prominent destructive `Banner`/`Card` before dosing/PK content. Severity badges retain high-contrast styling.
- Preserve all existing testIDs (`tab-overview`/`tab-clinical`/`tab-pricing`/`tab-enrich`, `bookmark-btn`) and behavior (role-gated tabs, bookmark, share, offline "drug not found").
- Enrich tab: token/spacing alignment only (no form redesign).

### 3.3 Part C — Inline Home search + remove `/search`

- **`useDrugSearch` hook** (`src/hooks/useDrugSearch.ts`): `useDrugSearch(lang, token, lastVersion) → { query, setQuery, results, loading }`. Debounced (300ms), offline-first (`searchDrugs` when `lastVersion > 0`, else `searchDrugsApi` when `token`), empty query → empty results, failures clear results gracefully (no false "no results" vs. error conflation beyond current behavior). Lifted from `app/search.tsx`.
- **Home dashboard** (`app/(tabs)/index.tsx`):
  - Replace the static `HomeSearchField` with an inline `SearchBar` (real `TextInput`, 300ms debounce) wired to `useDrugSearch`.
  - **Empty query →** render the existing dashboard sections (safety alerts, recent searches, saved drugs).
  - **Non-empty query →** render `DrugCard` results inline (FlatList/list), with a no-results `EmptyState`; tapping a result → `addRecent(query)` then `router.push('/drug/[atcCode]')`.
  - Recent-search **chips set the inline query** (`setQuery(q)`), no navigation.
  - Loading indicator while `loading`.
- **Remove** `app/search.tsx` and its `Stack.Screen name="search"` registration in `app/_layout.tsx`; retire the `HomeSearchField` component.
- **Offline-first preserved:** inline search works offline via local FTS exactly as the standalone screen did.

### 3.4 i18n

`drug.clinical.*` keys already exist (pharmacokinetics, pediatricDosing, adminNotes, halfLife, proteinBinding, etc.). Add only any genuinely missing labels surfaced during the rework (e.g. a home "no results"/search placeholder if not already present — `home.searchPlaceholder` exists). Any new keys go in all four locales (en/prs/ps/ar) with real translations.

## 4. Testing

- **ClinicalTab:** the 4 `clinical-tab-extended` tests pass; add edge cases for the 3 new sections (absent fields → section omitted) and the safety-elevation ordering (contraindicated interaction appears before dosing).
- **Drug-detail rework:** existing role-gating/tab tests still pass; RTL snapshot of the reworked Clinical tab (LTR + RTL).
- **Inline search:** `useDrugSearch` hook test (debounce, offline FTS vs API branch, graceful failure, empty query). Rewrite `home-screen.test.tsx`: typing shows inline `DrugCard` results; tapping a result calls `addRecent` + pushes `/drug/[atcCode]`; recent chips set the query (no `/search` push); empty query shows dashboard sections. Delete the obsolete `search-screen.test.tsx` (its coverage migrates to the hook + home tests).
- **Bug fixes:** `drug-catalog.test.ts` (3-arg), `DrugCard.test.tsx`, `SearchBar.test.tsx` pass.
- Full suite green (no remaining `clinical-tab-extended` failures); hub/native/ui-kit typechecks introduce no new errors.

## 5. Out of Scope (E5)

- DrugCard / Browse / search-results **visual** restyle (E6).
- Full translation completeness pass (E6).
- Broader a11y/motion polish (E6).
- Enrich tab form redesign.
- Any change to the search FTS/API infrastructure beyond extracting the shared hook.

## 6. Success Criteria

- The Clinical tab renders contraindications, interactions (with `mechanism`), mechanism, indications, adverse events, adult **and pediatric** dosing, pregnancy category, renal adjustment, **pharmacokinetics**, and **administration notes** (localized) — with contraindicated/major risks elevated to the top.
- The drug-detail screen matches E4's Clinical-Calm visual language; all role-gated tabs + bookmark/share behaviors preserved.
- Searching from the Home dashboard returns results **inline**, offline-capable; tapping a result opens the drug; the app **never** navigates to a standalone search page/tab; `/search` is gone.
- The 4 `clinical-tab-extended` failures and the `lang`-plumbing/type bugs are fixed; the full suite is green; typechecks introduce no new errors.

## 7. Risks / Open Questions (pinned at plan time)

- **`localText` reuse:** confirm the exact helper in `OverviewTab` (signature + `en` fallback order) so ClinicalTab matches it; extract to a shared util if cleaner than duplicating.
- **ui-kit native severity semantics:** if `CardSection`/`Banner` can't express the danger/warning severity the local `SectionCard` provides, keep a thin severity wrapper rather than losing the safety affordance.
- **Removing `/search`:** verify no other route/deep-link depends on `/search` (grep for `'/search'` and `pathname: '/search'`); update every caller (home recent chips) to inline behavior; ensure `_layout.tsx` route removal doesn't break navigation typing.
- **Home test rewrite:** `home-screen.test.tsx` currently asserts navigation; it must be rewritten, not patched, to assert inline results — ensure the mock provides `searchDrugs`/`searchDrugsApi` + a synced `lastVersion` for the FTS branch.
- **DrugCard now on Home:** DrugCard renders inline on the dashboard; its `lang` prop must be threaded from the Home `lang` store (it already takes `lang`).
- Real-device/Expo validation of the inline-search UX (standing caveat).
