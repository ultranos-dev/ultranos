# Story 53.2: Visual Atlas for Microscopy

Status: pending

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

- [ ] **Task 1: Atlas Data Model** (AC: 1, 2, 3, 4)
  - [ ] Create `apps/lab-lite/src/lib/visual-atlas.ts` with type definitions:
    ```typescript
    interface AtlasCategory {
      id: string                      // e.g., 'blood-cells'
      name: string                    // i18n key
      icon: string                    // icon identifier for sidebar
      subcategories: AtlasSubcategory[]
    }

    interface AtlasSubcategory {
      id: string                      // e.g., 'blood-cells-abnormal'
      name: string                    // i18n key
      categoryId: string              // parent category reference
      entries: AtlasEntry[]
    }

    interface AtlasEntry {
      id: string                      // unique entry ID (e.g., 'ATLAS-BC-BLAST-001')
      name: string                    // i18n key for entry name
      image: string                   // base64-encoded optimized image (WebP/JPEG)
      imageMimeType: 'image/webp' | 'image/jpeg'
      thumbnailImage: string          // base64 thumbnail (max 20KB) for list view
      description: string             // i18n key for detailed description
      clinicalSignificance: string    // i18n key for clinical significance
      nextSteps: string[]             // i18n keys for recommended next steps
      tags: string[]                  // searchable tags (English, for keyword matching)
      author: {
        name: string
        credentials: string
        institution: string
      }
      version: string                 // semver
      lastReviewedAt: string          // ISO 8601
    }
    ```
  - [ ] Export `ATLAS_CATEGORIES` array with the full category tree.

- [ ] **Task 2: Atlas Content — Initial Seed Data** (AC: 1, 2, 3, 4)
  - [ ] Create `apps/lab-lite/src/lib/atlas-seed-data.ts` with placeholder entries for each category:
    - **Blood Cells — Normal:** Neutrophil, Lymphocyte, Monocyte, Eosinophil, Basophil, Reticulocyte, Platelet (normal morphology).
    - **Blood Cells — Abnormal:** Blast cell, Schistocyte, Spherocyte, Target cell, Sickle cell, Auer rod, Hypersegmented neutrophil, Rouleaux formation.
    - **Parasites:** P. falciparum (ring, trophozoite, gametocyte), P. vivax (ring, trophozoite, schizont), Microfilaria, Trypanosoma.
    - **Bacteria (Gram Stain):** Gram-positive cocci in clusters, Gram-positive cocci in chains, Gram-negative rods, Gram-negative diplococci, Acid-fast bacilli.
    - **Urine Sediment:** RBC cast, WBC cast, Granular cast, Calcium oxalate crystal, Uric acid crystal, Epithelial cells.
    - **Body Fluid Cells:** Mesothelial cells, Malignant cells (generic), Reactive lymphocytes.
  - [ ] Use placeholder images (solid color with text overlay) until real photomicrographs are provided. Mark entries with `placeholder: true`.
  - [ ] Each entry fully populated with description, clinical significance, and next steps.
  - [ ] Add i18n keys to `messages/en.json` under a `visualAtlas` namespace.

- [ ] **Task 3: Dexie Schema Update for Atlas** (AC: 5, 7)
  - [ ] Add `atlas_entries` table to Dexie schema: `&id, categoryId, subcategoryId, *tags, version`.
  - [ ] Add `atlas_categories` table: `&id`.
  - [ ] Create migration to next Dexie version.
  - [ ] Implement `seedAtlas()` function that populates categories and entries on first load.
  - [ ] Version-check logic: if bundled entry version > stored version, update. Never delete entries (append-only content updates).

- [ ] **Task 4: Atlas Browse UI** (AC: 1, 2, 3, 8, 10)
  - [ ] Create `apps/lab-lite/src/components/atlas/AtlasBrowser.tsx` — main atlas page component.
  - [ ] Left sidebar (or inline-start panel): category list with icons, expandable to show subcategories.
  - [ ] Main content area: grid of entry cards (thumbnail + name) for the selected subcategory.
  - [ ] Entry detail view: full image, description, clinical significance, next steps list, author attribution.
  - [ ] Image rendered via `<img src="data:{mimeType};base64,{image}" />` with lazy loading for thumbnails.
  - [ ] RTL-compatible: logical CSS properties, mirrored navigation layout.
  - [ ] All text via `useTranslations('visualAtlas')`.

- [ ] **Task 5: Keyword Search** (AC: 6)
  - [ ] Create `apps/lab-lite/src/lib/atlas-search.ts`.
  - [ ] Implement `searchAtlas(query: string): AtlasEntry[]` that searches across entry names, descriptions, and tags.
  - [ ] Case-insensitive, partial match (substring search).
  - [ ] Search operates on Dexie data (offline-capable).
  - [ ] Search input at the top of the atlas browser with debounced filtering (300ms).
  - [ ] Results displayed as a flat list across all categories, grouped by category.

- [ ] **Task 6: Atlas Page Route** (AC: 10)
  - [ ] Create `apps/lab-lite/src/app/[locale]/atlas/page.tsx` — the atlas page.
  - [ ] Add "Visual Atlas" entry to the sidebar navigation in `AppSidebar.tsx` with a microscope icon.
  - [ ] Add contextual "Open Atlas" link in the result entry form (Story 42.4) that opens the atlas in a new panel or navigates to the atlas page.

- [ ] **Task 7: Audit Integration** (AC: 9)
  - [ ] Add `reportAtlasView()` to `apps/lab-lite/src/lib/audit-client.ts`.
  - [ ] Emit audit event when an atlas entry is viewed: action `ATLAS_ENTRY_VIEWED`, metadata includes `entryId`, `categoryId` (no PHI).
  - [ ] Follow existing pattern: never throw, fire-and-forget.

- [ ] **Task 8: Image Optimization Pipeline** (AC: 7)
  - [ ] Create `scripts/optimize-atlas-images.ts` — a build-time script that:
    - Reads source images from `apps/lab-lite/src/assets/atlas/` (when real images are provided).
    - Converts to WebP, resizes to max 800x600 for full view and 200x150 for thumbnails.
    - Compresses to target max 200KB (full) and 20KB (thumbnail).
    - Outputs base64-encoded strings into the seed data file.
  - [ ] Document the pipeline in the script header for future contributors.

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
