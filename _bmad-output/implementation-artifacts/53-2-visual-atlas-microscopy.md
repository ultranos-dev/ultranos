# Story 53.2: Visual Atlas for Microscopy

Status: complete

## Story

As a lab technician looking at a blood smear,
I want to search an offline visual atlas by what I'm seeing under the microscope,
So that I can identify cells and parasites even without a colleague to ask.

## Context

Lab technicians in remote clinics often work without senior colleagues or reference textbooks. When performing microscopy (blood smears, urine sediment, Gram stains), identification of cells, parasites, and bacteria requires visual comparison against known references. This story provides an offline-bundled visual atlas curated by hematopathologists, browsable by category and searchable by keyword.

The atlas is a **static, physician-curated reference** — not AI-generated content. Images are optimized for PWA storage (compressed, appropriately sized) and bundled in Dexie for offline access. The atlas is independent of patient data and contains no PHI.

**PRD Requirements:** FR53 (brainstorm #14)
**Dependencies:** Story 1.7 (Lab-Lite PWA Scaffold), Story 42.4 (Result Templates — for contextual linking)

## Acceptance Criteria

1. [ ] The tech can browse the visual atlas by category: blood cells (normal and abnormal), parasites (malaria species, filaria), bacteria (Gram stain morphologies), urine sediment, and body fluid cells.
2. [ ] Each category supports subcategories (e.g., blood cells > normal > neutrophil, eosinophil; blood cells > abnormal > blast, schistocyte).
3. [ ] Each reference entry includes: photomicrograph image, description, clinical significance, and recommended next steps.
4. [ ] The atlas is curated by hematopathologists with author attribution and version tracking.
5. [ ] All atlas content is bundled offline in the PWA and accessible without network connectivity.
6. [ ] Keyword search filters entries across all categories by name, description, and tags.
7. [ ] Images are optimized for PWA storage: compressed WebP/JPEG, max 200KB per image, stored as base64 in Dexie.
8. [ ] The atlas UI is RTL-compatible and all text labels are i18n-ready.
9. [ ] Atlas access emits an audit event (no PHI — only records that the atlas was accessed and which entry was viewed).
10. [ ] The atlas is accessible from the main sidebar navigation and from a contextual link within the result entry form.

## Tasks / Subtasks

- [x] **Task 1: Atlas Data Model** (AC: 1, 2, 3, 4)
  - [x] Create `apps/lab-lite/src/lib/visual-atlas.ts` with type definitions
  - [x] Export `ATLAS_CATEGORY_TREE` array with the full category tree (5 categories, 9 subcategories)

- [x] **Task 2: Atlas Content — Initial Seed Data** (AC: 1, 2, 3, 4)
  - [x] Create `apps/lab-lite/src/lib/atlas-seed-data.ts` with placeholder entries for each category
  - [x] 37 entries spanning all 9 subcategories with full clinical descriptions and next steps
  - [x] Placeholder images with `placeholder: true` flag
  - [x] i18n keys added to `messages/en.json`, `messages/ar.json`, `messages/prs.json`, `messages/ps.json` under `visualAtlas` namespace
  - [x] i18n key format: short keys (`entries.neutrophil.name`) not full namespace paths

- [x] **Task 3: Dexie Schema Update for Atlas** (AC: 5, 7)
  - [x] Added `atlas_entries` and `atlas_categories` class declarations to `LabLiteDatabase`
  - [x] v15 migration block with `atlas_entries: '&id, categoryId, subcategoryId, *tags, version'` and `atlas_categories: '&id'`
  - [x] `semverIsNewer()` helper for version comparison
  - [x] `seedAtlas()` function with version-check upsert logic (never throws)

- [x] **Task 4: Atlas Browse UI** (AC: 1, 2, 3, 8, 10)
  - [x] `apps/lab-lite/src/components/atlas/AtlasBrowser.tsx` with category/subcategory nav, entry grid, detail view
  - [x] RTL-compatible: logical CSS properties throughout (`ps-`, `pe-`, `ms-`, `me-`)
  - [x] All text via `useTranslations('visualAtlas')`
  - [x] Lazy image loading for thumbnails

- [x] **Task 5: Keyword Search** (AC: 6)
  - [x] `apps/lab-lite/src/lib/atlas-search.ts` with `searchAtlas()` function
  - [x] AND-logic multi-word search; case-insensitive; tags as primary search surface
  - [x] Relevance scoring by tag match count
  - [x] Debounced search input in `AtlasBrowser`

- [x] **Task 6: Atlas Page Route** (AC: 10)
  - [x] `apps/lab-lite/src/app/[locale]/atlas/page.tsx` with `AuthGuard`
  - [x] Sidebar nav item: `<Microscope size={20} />` icon, `href="/atlas"`, in clinical group
  - [x] "Open Atlas" contextual link added to `ResultEntryForm.tsx` (above template fields)

- [x] **Task 7: Audit Integration** (AC: 9)
  - [x] `reportAtlasView()` added to `apps/lab-lite/src/lib/audit-client.ts`
  - [x] Emits `ATLAS_ENTRY_VIEWED` with `entryId` and `categoryId` only — no PHI
  - [x] Fire-and-forget, never throws

- [x] **Task 8: Image Optimization Pipeline** (AC: 7)
  - [x] `scripts/optimize-atlas-images.ts` created — build-time sharp pipeline for future real images
  - [x] Documented for future clinical image contributors

## Dev Notes

- **Physician-curated content only.** The atlas is a static reference — no AI generation, no ML-based image recognition. All content is authored by hematopathologists. This is explicitly outside the AI confirmation gate requirement.
- **Image storage strategy:** Base64 in Dexie is pragmatic for PWA offline but adds ~33% overhead vs binary. With a max 200KB per image and ~40 initial entries, total storage is ~10MB — acceptable for PWA. If the atlas grows significantly, consider switching to IndexedDB Blob storage.
- **Placeholder images:** Initial seed data uses colored rectangles with text labels. These are sufficient for UI development and testing. Real photomicrographs will be provided by clinical partners and processed through the optimization pipeline.
- **No PHI involvement.** The atlas is a standalone reference tool. It does not access patient data, result values, or any PHI. Atlas audit events record only `entryId` and `categoryId`.
- **Search is client-side only.** With ~40-100 entries, in-memory search on Dexie data is fast enough. No server-side search needed.
- **i18n for atlas content:** Entry names, descriptions, and next steps are i18n keys. Tags remain in English for search consistency. Translations live in `messages/{locale}.json` under the `visualAtlas` namespace.
- **Contextual linking from result entry:** When a tech is entering CBC results and opens the atlas, ideally pre-navigate to the "Blood Cells" category. This is a UX enhancement that can be deferred if needed.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.2)
- Result template data model: Story 42.4
- Dexie database: `apps/lab-lite/src/lib/db.ts`
- Sidebar navigation: `apps/lab-lite/src/components/AppSidebar.tsx`
- i18n messages: `apps/lab-lite/messages/en.json`
- Image optimization: WebP format for best compression-to-quality ratio in modern browsers

## Dev Agent Record

### Completion Notes

All 8 tasks completed across two sessions (session 1 created the files; session 2 fixed i18n key paths, db.ts schema, audit integration, locale translations, Open Atlas link, and tests).

Key implementation decisions:
- **i18n key format**: Seed data stores SHORT keys (`entries.neutrophil.name`) not full namespace paths (`visualAtlas.entries.neutrophil.name`). `useTranslations('visualAtlas')` resolves short keys within its namespace.
- **Dexie version**: Added as v15 (concurrent Story 51.1/43.3/42.8 work added v14 on top of original v13 atlas slot).
- **`semverIsNewer()`**: Exported from `db.ts` for testability.
- **reportAtlasView()**: Added at end of `audit-client.ts`. Uses `'VISUAL_ATLAS' as AuditResourceType` — atlas is not a standard FHIR resource type, cast is intentional.
- **Open Atlas link**: Placed above template fields in `ResultEntryForm`, uses `next/link` directly (locale prefix is 'never' in routing config).
- **Translations**: All 4 locales (en, ar, prs, ps) include the full `visualAtlas` namespace with 38 clinical translations.

Tests: 35 unit tests in `src/__tests__/visual-atlas.test.ts` — all passing. Coverage: category tree structure, seed data integrity, i18n key format correctness, no-PHI validation, search AND logic, relevance scoring, semverIsNewer edge cases.

## File List

### New Files
- `apps/lab-lite/src/lib/visual-atlas.ts`
- `apps/lab-lite/src/lib/atlas-seed-data.ts`
- `apps/lab-lite/src/lib/atlas-search.ts`
- `apps/lab-lite/src/components/atlas/AtlasBrowser.tsx`
- `apps/lab-lite/src/app/[locale]/atlas/page.tsx`
- `apps/lab-lite/src/__tests__/visual-atlas.test.ts`
- `scripts/optimize-atlas-images.ts`

### Modified Files
- `apps/lab-lite/src/lib/db.ts` — Added `AtlasEntry`/`AtlasCategory` import, class declarations, v15 schema, `semverIsNewer()`, `seedAtlas()`
- `apps/lab-lite/src/lib/audit-client.ts` — Added `reportAtlasView()`
- `apps/lab-lite/src/components/AppSidebar.tsx` — Added `visualAtlas` nav item with `<Microscope>` icon
- `apps/lab-lite/src/components/ResultEntryForm.tsx` — Added `tAtlas`, "Open Atlas" contextual link
- `apps/lab-lite/messages/en.json` — Added `visualAtlas` sidebar key and full namespace
- `apps/lab-lite/messages/ar.json` — Added Arabic `visualAtlas` namespace
- `apps/lab-lite/messages/prs.json` — Added Dari `visualAtlas` namespace
- `apps/lab-lite/messages/ps.json` — Added Pashto `visualAtlas` namespace

## Change Log

- 2026-05-31: Story 53.2 complete. Visual Atlas for Microscopy implemented across two sessions. All 8 tasks done, 35 tests passing. (Dev Agent)
