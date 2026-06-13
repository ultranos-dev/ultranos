import * as SQLite from 'expo-sqlite'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

type DrugEntry = DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

function getTier(role: string): 'public' | 'clinical' | 'pharmacist' {
  if (PHARMACIST_ROLES.has(role)) return 'pharmacist'
  if (CLINICAL_ROLES.has(role)) return 'clinical'
  return 'public'
}

export interface DbRow {
  atc_code: string
  inn_name: string
  brand_names: string | null
  dose_forms: string | null
  therapeutic_class: string | null
  local_names: string | null
  tier1_json: string
  tier2_json: string | null
  tier3_json: string | null
  version: number
  brand_names_flat: string
  local_names_flat: string
}

/** Returns the DrugEntry from the appropriate tier column for the given role. */
export function scopeEntryForRole(
  row: DbRow,
  role: string,
): DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 {
  const tier = getTier(role)
  if (tier === 'pharmacist' && row.tier3_json) return JSON.parse(row.tier3_json)
  if ((tier === 'pharmacist' || tier === 'clinical') && row.tier2_json) return JSON.parse(row.tier2_json)
  return JSON.parse(row.tier1_json) as DrugEntryTier1
}

/** Upsert a batch of drug entries, then rebuild the FTS5 index. */
export async function upsertDrugBatch(
  db: SQLite.SQLiteDatabase,
  entries: DrugEntry[],
): Promise<void> {
  for (const entry of entries) {
    const brandNamesFlat = entry.brandNames.join(' ')
    const localNamesFlat = Object.values(entry.localNames ?? {}).filter(Boolean).join(' ')

    const hasTier2 = 'mechanismOfAction' in entry || 'indicationsClinical' in entry
    const hasTier3 = 'formularyStatus' in entry || 'dispensingNotes' in entry

    await db.runAsync(
      `INSERT OR REPLACE INTO drug_catalog
         (atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names,
          tier1_json, tier2_json, tier3_json, version, brand_names_flat, local_names_flat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.atcCode,
        entry.innName,
        JSON.stringify(entry.brandNames),
        JSON.stringify(entry.doseForms),
        entry.therapeuticClass,
        JSON.stringify(entry.localNames),
        JSON.stringify(entry),
        hasTier2 ? JSON.stringify(entry) : null,
        hasTier3 ? JSON.stringify(entry) : null,
        entry.version,
        brandNamesFlat,
        localNamesFlat,
      ]
    )
  }
  // Rebuild FTS index once after the whole batch
  if (entries.length > 0) {
    await db.runAsync(`INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild')`)
  }
}

/** Get the Tier 1 view of a drug by ATC code. Returns null if not found. */
export async function getDrugByAtcCode(
  db: SQLite.SQLiteDatabase,
  atcCode: string,
): Promise<DrugEntryTier1 | null> {
  const row = await db.getFirstAsync<DbRow>(
    'SELECT * FROM drug_catalog WHERE atc_code = ?',
    [atcCode]
  )
  if (!row) return null
  return JSON.parse(row.tier1_json) as DrugEntryTier1
}

/** Get raw DB row (all tier columns) — used by drug detail screen. */
export async function getDrugRowByAtcCode(
  db: SQLite.SQLiteDatabase,
  atcCode: string,
): Promise<DbRow | null> {
  return db.getFirstAsync<DbRow>(
    'SELECT * FROM drug_catalog WHERE atc_code = ?',
    [atcCode]
  )
}

/** Clear all drug_catalog rows, FTS index, and sync_meta. Called on logout. */
export async function clearCatalog(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM drug_catalog;
    INSERT INTO drug_catalog_fts(drug_catalog_fts) VALUES('rebuild');
    DELETE FROM sync_meta;
  `)
}

/** Read a sync_meta value by key. Returns null if not set. */
export async function getSyncMeta(
  db: SQLite.SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key]
  )
  return row?.value ?? null
}

/** Write a sync_meta value. */
export async function setSyncMeta(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value]
  )
}
