// ---------------------------------------------------------------------------
// Visual Atlas Seed Data (Story 53.2)
// Physician-curated reference entries — placeholder images until real
// photomicrographs are provided by clinical partners.
//
// To replace placeholders: run `scripts/optimize-atlas-images.ts` after placing
// source images in `apps/lab-lite/src/assets/atlas/`.
//
// Author attribution: curated by Dr. Placeholder, MD (replace before GA release).
// ---------------------------------------------------------------------------

import type { AtlasEntry } from './visual-atlas'

// ---------------------------------------------------------------------------
// Placeholder base64 JPEG — 1×1 pixel gray image.
// Replaced per-entry by the optimize-atlas-images.ts pipeline.
// This is a valid JPEG: SOI + APP0 + SOF0 + DHT + SOS + EOI.
// ---------------------------------------------------------------------------
const PLACEHOLDER_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAU' +
  'AQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A' +
  'JQAB/9k='

const PLACEHOLDER_THUMB = PLACEHOLDER_JPEG

// Default placeholder author — replace with real credentials before GA.
const PLACEHOLDER_AUTHOR = {
  name: 'Dr. A. Placeholder',
  credentials: 'MD, FRCPath',
  institution: 'Ultranos Clinical Partners',
}

const VERSION = '0.1.0'
const REVIEWED_AT = '2026-01-01T00:00:00.000Z'

// ---------------------------------------------------------------------------
// Helper to build a seed entry with defaults
// ---------------------------------------------------------------------------
function entry(
  id: string,
  subcategoryId: string,
  categoryId: string,
  nameKey: string,
  tags: string[],
  nextStepKeys: string[],
): AtlasEntry {
  return {
    id,
    subcategoryId,
    categoryId,
    name: `entries.${nameKey}.name`,
    image: PLACEHOLDER_JPEG,
    imageMimeType: 'image/jpeg',
    thumbnailImage: PLACEHOLDER_THUMB,
    description: `entries.${nameKey}.description`,
    clinicalSignificance: `entries.${nameKey}.clinicalSignificance`,
    nextSteps: nextStepKeys.map((k) => `entries.${nameKey}.nextSteps.${k}`),
    tags,
    author: PLACEHOLDER_AUTHOR,
    version: VERSION,
    lastReviewedAt: REVIEWED_AT,
    placeholder: true,
  }
}

// ---------------------------------------------------------------------------
// Blood Cells — Normal (7 entries)
// ---------------------------------------------------------------------------
export const BLOOD_CELLS_NORMAL_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-BC-NORM-NEUT-001',
    'blood-cells-normal',
    'blood-cells',
    'neutrophil',
    ['neutrophil', 'granulocyte', 'pmn', 'white blood cell', 'wbc', 'normal'],
    ['consider', 'report'],
  ),
  entry(
    'ATLAS-BC-NORM-LYMP-001',
    'blood-cells-normal',
    'blood-cells',
    'lymphocyte',
    ['lymphocyte', 'white blood cell', 'wbc', 'normal', 'mononuclear'],
    ['consider', 'report'],
  ),
  entry(
    'ATLAS-BC-NORM-MONO-001',
    'blood-cells-normal',
    'blood-cells',
    'monocyte',
    ['monocyte', 'white blood cell', 'wbc', 'normal', 'mononuclear', 'phagocyte'],
    ['consider', 'report'],
  ),
  entry(
    'ATLAS-BC-NORM-EOSI-001',
    'blood-cells-normal',
    'blood-cells',
    'eosinophil',
    ['eosinophil', 'granulocyte', 'white blood cell', 'wbc', 'normal', 'bilobed'],
    ['consider', 'report'],
  ),
  entry(
    'ATLAS-BC-NORM-BASO-001',
    'blood-cells-normal',
    'blood-cells',
    'basophil',
    ['basophil', 'granulocyte', 'white blood cell', 'wbc', 'normal'],
    ['consider', 'report'],
  ),
  entry(
    'ATLAS-BC-NORM-RETIC-001',
    'blood-cells-normal',
    'blood-cells',
    'reticulocyte',
    ['reticulocyte', 'red blood cell', 'rbc', 'immature', 'normal', 'polychromatophilic'],
    ['consider', 'report', 'correlate'],
  ),
  entry(
    'ATLAS-BC-NORM-PLT-001',
    'blood-cells-normal',
    'blood-cells',
    'platelet',
    ['platelet', 'thrombocyte', 'normal', 'small', 'anucleate'],
    ['consider', 'report'],
  ),
]

// ---------------------------------------------------------------------------
// Blood Cells — Abnormal (8 entries)
// ---------------------------------------------------------------------------
export const BLOOD_CELLS_ABNORMAL_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-BC-ABN-BLAST-001',
    'blood-cells-abnormal',
    'blood-cells',
    'blast',
    ['blast', 'blast cell', 'immature', 'leukemia', 'acute', 'large nucleolus', 'auer rod'],
    ['urgent', 'refer', 'notify'],
  ),
  entry(
    'ATLAS-BC-ABN-SCHISTO-001',
    'blood-cells-abnormal',
    'blood-cells',
    'schistocyte',
    ['schistocyte', 'helmet cell', 'fragmented', 'microangiopathic', 'hemolysis', 'maha', 'ttp', 'hus'],
    ['urgent', 'notify', 'correlate'],
  ),
  entry(
    'ATLAS-BC-ABN-SPHERO-001',
    'blood-cells-abnormal',
    'blood-cells',
    'spherocyte',
    ['spherocyte', 'spherical', 'hemolysis', 'hereditary spherocytosis', 'autoimmune', 'hs'],
    ['consider', 'correlate', 'report'],
  ),
  entry(
    'ATLAS-BC-ABN-TARGET-001',
    'blood-cells-abnormal',
    'blood-cells',
    'targetCell',
    ['target cell', 'codocyte', 'thalassemia', 'liver disease', 'hemoglobin c', 'iron deficiency'],
    ['consider', 'correlate', 'report'],
  ),
  entry(
    'ATLAS-BC-ABN-SICKLE-001',
    'blood-cells-abnormal',
    'blood-cells',
    'sickleCell',
    ['sickle cell', 'drepanocyte', 'hemoglobin s', 'sickle cell disease', 'hbs', 'vaso-occlusion'],
    ['urgent', 'correlate', 'notify'],
  ),
  entry(
    'ATLAS-BC-ABN-AUER-001',
    'blood-cells-abnormal',
    'blood-cells',
    'auerRod',
    ['auer rod', 'blast', 'aml', 'acute myeloid leukemia', 'myeloblast', 'pink inclusion'],
    ['urgent', 'refer', 'notify'],
  ),
  entry(
    'ATLAS-BC-ABN-HYPERSEG-001',
    'blood-cells-abnormal',
    'blood-cells',
    'hypersegmentedNeutrophil',
    ['hypersegmented neutrophil', 'megaloblastic', 'b12 deficiency', 'folate deficiency', 'macrocytic anemia', 'five lobes'],
    ['consider', 'correlate', 'report'],
  ),
  entry(
    'ATLAS-BC-ABN-ROULX-001',
    'blood-cells-abnormal',
    'blood-cells',
    'rouleauxFormation',
    ['rouleaux', 'rouleaux formation', 'rbc stacking', 'myeloma', 'multiple myeloma', 'inflammation', 'esr elevated'],
    ['consider', 'correlate', 'report'],
  ),
]

// ---------------------------------------------------------------------------
// Parasites — Malaria (6 entries)
// ---------------------------------------------------------------------------
export const PARASITES_MALARIA_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-PAR-MAL-PF-RING-001',
    'parasites-malaria',
    'parasites',
    'pFalciparumRing',
    ['plasmodium falciparum', 'malaria', 'ring form', 'falciparum', 'thin ring', 'double dot', 'marginal form', 'accole'],
    ['urgent', 'notify', 'repeat'],
  ),
  entry(
    'ATLAS-PAR-MAL-PF-TROPHO-001',
    'parasites-malaria',
    'parasites',
    'pFalciparumTrophozoite',
    ['plasmodium falciparum', 'malaria', 'trophozoite', 'falciparum', 'maurer clefts'],
    ['urgent', 'notify', 'repeat'],
  ),
  entry(
    'ATLAS-PAR-MAL-PF-GAMT-001',
    'parasites-malaria',
    'parasites',
    'pFalciparumGametocyte',
    ['plasmodium falciparum', 'malaria', 'gametocyte', 'falciparum', 'banana-shaped', 'crescent'],
    ['urgent', 'notify'],
  ),
  entry(
    'ATLAS-PAR-MAL-PV-RING-001',
    'parasites-malaria',
    'parasites',
    'pVivaxRing',
    ['plasmodium vivax', 'malaria', 'ring form', 'vivax', 'schuffner dots', 'enlarged rbc'],
    ['urgent', 'notify', 'repeat'],
  ),
  entry(
    'ATLAS-PAR-MAL-PV-TROPHO-001',
    'parasites-malaria',
    'parasites',
    'pVivaxTrophozoite',
    ['plasmodium vivax', 'malaria', 'trophozoite', 'vivax', 'schuffner dots', 'amoeboid', 'enlarged rbc'],
    ['urgent', 'notify', 'repeat'],
  ),
  entry(
    'ATLAS-PAR-MAL-PV-SCHIZ-001',
    'parasites-malaria',
    'parasites',
    'pVivaxSchizont',
    ['plasmodium vivax', 'malaria', 'schizont', 'vivax', 'merozoites', 'rosette', 'enlarged rbc'],
    ['urgent', 'notify', 'repeat'],
  ),
]

// ---------------------------------------------------------------------------
// Parasites — Other (2 entries)
// ---------------------------------------------------------------------------
export const PARASITES_OTHER_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-PAR-OTH-MICRO-001',
    'parasites-other',
    'parasites',
    'microfilaria',
    ['microfilaria', 'filariasis', 'wuchereria bancrofti', 'brugia', 'night blood', 'sheath', 'lymphatic filariasis'],
    ['urgent', 'notify', 'report'],
  ),
  entry(
    'ATLAS-PAR-OTH-TRYP-001',
    'parasites-other',
    'parasites',
    'trypanosoma',
    ['trypanosoma', 'sleeping sickness', 'chagas', 'trypanosomiasis', 'flagellate', 'kinetoplast', 'undulating membrane'],
    ['urgent', 'notify', 'refer'],
  ),
]

// ---------------------------------------------------------------------------
// Bacteria — Gram Stain (5 entries)
// ---------------------------------------------------------------------------
export const BACTERIA_GRAM_STAIN_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-BAC-GS-GPCC-001',
    'bacteria-gram-stain',
    'bacteria',
    'gramPositiveCocciClusters',
    ['gram positive', 'cocci', 'clusters', 'staphylococcus', 'staphylococci', 'grape-like', 'gram stain'],
    ['culture', 'sensitivity', 'report'],
  ),
  entry(
    'ATLAS-BAC-GS-GPCC-CHAIN-001',
    'bacteria-gram-stain',
    'bacteria',
    'gramPositiveCocciChains',
    ['gram positive', 'cocci', 'chains', 'streptococcus', 'streptococci', 'pairs', 'gram stain'],
    ['culture', 'sensitivity', 'report'],
  ),
  entry(
    'ATLAS-BAC-GS-GNROD-001',
    'bacteria-gram-stain',
    'bacteria',
    'gramNegativeRods',
    ['gram negative', 'rods', 'bacilli', 'enterobacteriaceae', 'e. coli', 'klebsiella', 'gram stain'],
    ['culture', 'sensitivity', 'report'],
  ),
  entry(
    'ATLAS-BAC-GS-GNDIP-001',
    'bacteria-gram-stain',
    'bacteria',
    'gramNegativeDiplococci',
    ['gram negative', 'diplococci', 'neisseria', 'gonorrhoeae', 'meningitidis', 'coffee bean', 'intracellular', 'gram stain'],
    ['urgent', 'culture', 'sensitivity', 'notify'],
  ),
  entry(
    'ATLAS-BAC-GS-AFB-001',
    'bacteria-gram-stain',
    'bacteria',
    'acidFastBacilli',
    ['acid fast', 'afb', 'mycobacterium', 'tuberculosis', 'tb', 'ziehl neelsen', 'red beaded', 'zn stain'],
    ['urgent', 'notify', 'precautions', 'report'],
  ),
]

// ---------------------------------------------------------------------------
// Urine Sediment — Casts (3 entries)
// ---------------------------------------------------------------------------
export const URINE_CASTS_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-URI-CAST-RBC-001',
    'urine-casts',
    'urine-sediment',
    'rbcCast',
    ['rbc cast', 'red blood cell cast', 'glomerulonephritis', 'nephritis', 'hematuria', 'cast'],
    ['urgent', 'notify', 'refer'],
  ),
  entry(
    'ATLAS-URI-CAST-WBC-001',
    'urine-casts',
    'urine-sediment',
    'wbcCast',
    ['wbc cast', 'white blood cell cast', 'pyelonephritis', 'interstitial nephritis', 'pyuria', 'cast'],
    ['urgent', 'notify', 'culture'],
  ),
  entry(
    'ATLAS-URI-CAST-GRAN-001',
    'urine-casts',
    'urine-sediment',
    'granularCast',
    ['granular cast', 'muddy brown', 'atn', 'acute tubular necrosis', 'cast', 'coarse granular'],
    ['urgent', 'notify', 'correlate'],
  ),
]

// ---------------------------------------------------------------------------
// Urine Sediment — Crystals (2 entries)
// ---------------------------------------------------------------------------
export const URINE_CRYSTALS_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-URI-CRYS-CAOX-001',
    'urine-crystals',
    'urine-sediment',
    'calciumOxalateCrystal',
    ['calcium oxalate', 'crystal', 'oxalate', 'envelope shaped', 'dumbbell', 'nephrolithiasis', 'kidney stone'],
    ['correlate', 'report'],
  ),
  entry(
    'ATLAS-URI-CRYS-URIC-001',
    'urine-crystals',
    'urine-sediment',
    'uricAcidCrystal',
    ['uric acid', 'crystal', 'gout', 'hyperuricemia', 'diamond', 'rhomboid', 'yellow-brown', 'acidic urine'],
    ['correlate', 'report'],
  ),
]

// ---------------------------------------------------------------------------
// Urine Sediment — Cells (1 entry)
// ---------------------------------------------------------------------------
export const URINE_CELLS_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-URI-CELL-EPIT-001',
    'urine-cells',
    'urine-sediment',
    'epithelialCells',
    ['epithelial cells', 'squamous', 'transitional', 'renal tubular', 'urothelial', 'contamination'],
    ['consider', 'correlate', 'report'],
  ),
]

// ---------------------------------------------------------------------------
// Body Fluid Cells (3 entries)
// ---------------------------------------------------------------------------
export const BODY_FLUID_CELLS_ENTRIES: AtlasEntry[] = [
  entry(
    'ATLAS-BFC-MESO-001',
    'body-fluid-cells',
    'body-fluid',
    'mesothelialCells',
    ['mesothelial', 'pleural', 'peritoneal', 'pericardial', 'serous fluid', 'reactive mesothelial'],
    ['correlate', 'report'],
  ),
  entry(
    'ATLAS-BFC-MALIG-001',
    'body-fluid-cells',
    'body-fluid',
    'malignantCells',
    ['malignant', 'malignant cells', 'adenocarcinoma', 'effusion', 'pleural', 'metastatic', 'cytology', 'large atypical'],
    ['urgent', 'notify', 'refer', 'cytology'],
  ),
  entry(
    'ATLAS-BFC-REACT-001',
    'body-fluid-cells',
    'body-fluid',
    'reactiveLymphocytes',
    ['reactive lymphocytes', 'lymphocytes', 'body fluid', 'viral', 'inflammation', 'pleural', 'activated'],
    ['correlate', 'report'],
  ),
]

// ---------------------------------------------------------------------------
// All entries keyed by subcategoryId — used in seedAtlas()
// ---------------------------------------------------------------------------
export const ALL_SEED_ENTRIES_BY_SUBCATEGORY: Record<string, AtlasEntry[]> = {
  'blood-cells-normal': BLOOD_CELLS_NORMAL_ENTRIES,
  'blood-cells-abnormal': BLOOD_CELLS_ABNORMAL_ENTRIES,
  'parasites-malaria': PARASITES_MALARIA_ENTRIES,
  'parasites-other': PARASITES_OTHER_ENTRIES,
  'bacteria-gram-stain': BACTERIA_GRAM_STAIN_ENTRIES,
  'urine-casts': URINE_CASTS_ENTRIES,
  'urine-crystals': URINE_CRYSTALS_ENTRIES,
  'urine-cells': URINE_CELLS_ENTRIES,
  'body-fluid-cells': BODY_FLUID_CELLS_ENTRIES,
}

/** Flat array of all seed entries across all subcategories */
export const ALL_SEED_ENTRIES: AtlasEntry[] = Object.values(ALL_SEED_ENTRIES_BY_SUBCATEGORY).flat()
