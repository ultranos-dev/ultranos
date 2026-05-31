// ---------------------------------------------------------------------------
// Visual Atlas for Microscopy — Data Model (Story 53.2)
// Physician-curated reference. NO AI-generated content. NO PHI.
// Atlas is independent of patient data — safe for offline access by all roles.
// ---------------------------------------------------------------------------

export interface AtlasCategory {
  id: string                      // e.g., 'blood-cells'
  name: string                    // i18n key under visualAtlas namespace
  icon: string                    // icon identifier for atlas sidebar panel
  subcategories: AtlasSubcategory[]
}

export interface AtlasSubcategory {
  id: string                      // e.g., 'blood-cells-abnormal'
  name: string                    // i18n key under visualAtlas namespace
  categoryId: string              // parent category reference
  entries: AtlasEntry[]
}

export interface AtlasEntry {
  id: string                      // unique entry ID (e.g., 'ATLAS-BC-BLAST-001')
  subcategoryId: string           // parent subcategory reference
  categoryId: string              // parent category reference
  name: string                    // i18n key for entry name
  image: string                   // base64-encoded optimized image (WebP/JPEG)
  imageMimeType: 'image/webp' | 'image/jpeg'
  thumbnailImage: string          // base64 thumbnail (max 20KB) for list view
  description: string             // i18n key for detailed description
  clinicalSignificance: string    // i18n key for clinical significance
  nextSteps: string[]             // i18n keys for recommended next steps
  tags: string[]                  // searchable tags (English only, for keyword matching)
  author: {
    name: string
    credentials: string
    institution: string
  }
  version: string                 // semver
  lastReviewedAt: string          // ISO 8601
  placeholder?: boolean           // true until real photomicrograph is provided
}

// ---------------------------------------------------------------------------
// Category ID constants — used in route pre-navigation and search grouping
// ---------------------------------------------------------------------------
export const CATEGORY_BLOOD_CELLS = 'blood-cells'
export const CATEGORY_PARASITES = 'parasites'
export const CATEGORY_BACTERIA = 'bacteria'
export const CATEGORY_URINE_SEDIMENT = 'urine-sediment'
export const CATEGORY_BODY_FLUID = 'body-fluid'

// ---------------------------------------------------------------------------
// Full category tree — populated by ATLAS_CATEGORIES (entries injected from seed data)
// ---------------------------------------------------------------------------
export const ATLAS_CATEGORY_TREE: AtlasCategory[] = [
  {
    id: CATEGORY_BLOOD_CELLS,
    name: 'categories.bloodCells',
    icon: 'droplet',
    subcategories: [
      {
        id: 'blood-cells-normal',
        name: 'subcategories.bloodCellsNormal',
        categoryId: CATEGORY_BLOOD_CELLS,
        entries: [],
      },
      {
        id: 'blood-cells-abnormal',
        name: 'subcategories.bloodCellsAbnormal',
        categoryId: CATEGORY_BLOOD_CELLS,
        entries: [],
      },
    ],
  },
  {
    id: CATEGORY_PARASITES,
    name: 'categories.parasites',
    icon: 'microscope',
    subcategories: [
      {
        id: 'parasites-malaria',
        name: 'subcategories.parasitesMalaria',
        categoryId: CATEGORY_PARASITES,
        entries: [],
      },
      {
        id: 'parasites-other',
        name: 'subcategories.parasitesOther',
        categoryId: CATEGORY_PARASITES,
        entries: [],
      },
    ],
  },
  {
    id: CATEGORY_BACTERIA,
    name: 'categories.bacteria',
    icon: 'flask',
    subcategories: [
      {
        id: 'bacteria-gram-stain',
        name: 'subcategories.bacteriaGramStain',
        categoryId: CATEGORY_BACTERIA,
        entries: [],
      },
    ],
  },
  {
    id: CATEGORY_URINE_SEDIMENT,
    name: 'categories.urineSediment',
    icon: 'beaker',
    subcategories: [
      {
        id: 'urine-casts',
        name: 'subcategories.urineCasts',
        categoryId: CATEGORY_URINE_SEDIMENT,
        entries: [],
      },
      {
        id: 'urine-crystals',
        name: 'subcategories.urineCrystals',
        categoryId: CATEGORY_URINE_SEDIMENT,
        entries: [],
      },
      {
        id: 'urine-cells',
        name: 'subcategories.urineCells',
        categoryId: CATEGORY_URINE_SEDIMENT,
        entries: [],
      },
    ],
  },
  {
    id: CATEGORY_BODY_FLUID,
    name: 'categories.bodyFluid',
    icon: 'activity',
    subcategories: [
      {
        id: 'body-fluid-cells',
        name: 'subcategories.bodyFluidCells',
        categoryId: CATEGORY_BODY_FLUID,
        entries: [],
      },
    ],
  },
]

/**
 * Build a flat map of all entries across all categories.
 * Used by the search service.
 */
export function buildEntryIndex(categories: AtlasCategory[]): Map<string, AtlasEntry> {
  const index = new Map<string, AtlasEntry>()
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      for (const entry of sub.entries) {
        index.set(entry.id, entry)
      }
    }
  }
  return index
}

/**
 * Get all entries as a flat array, preserving category/subcategory context.
 */
export function getAllEntries(categories: AtlasCategory[]): AtlasEntry[] {
  return categories.flatMap((cat) => cat.subcategories.flatMap((sub) => sub.entries))
}
