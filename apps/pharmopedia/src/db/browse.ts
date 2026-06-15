import * as SQLite from 'expo-sqlite'
import type { DrugSearchResult } from '@ultranos/shared-types'
import type { Lang } from '@/store/lang-store'

export interface TherapeuticClass {
  name: string
  count: number
}

interface ClassRow {
  therapeutic_class: string
  count: number
}

interface DrugRow {
  atc_code: string
  inn_name: string
  brand_names: string | null
  dose_forms: string | null
  therapeutic_class: string | null
  local_names: string | null
}

/**
 * Return distinct therapeutic classes from the local catalog, with drug count each.
 * Ordered alphabetically. Returns [] if the catalog is empty.
 */
export async function getTherapeuticClasses(
  db: SQLite.SQLiteDatabase,
): Promise<TherapeuticClass[]> {
  const rows = await db.getAllAsync<ClassRow>(
    `SELECT therapeutic_class, COUNT(*) as count
     FROM drug_catalog
     WHERE therapeutic_class IS NOT NULL AND therapeutic_class != ''
     GROUP BY therapeutic_class
     ORDER BY therapeutic_class ASC`,
  )
  return rows.map((r) => ({ name: r.therapeutic_class, count: r.count }))
}

/**
 * Return drugs in a given therapeutic class, ordered by INN name.
 * Maps localName for prs/ps langs; 'ar' and 'en' show INN only.
 */
export async function getDrugsByTherapeuticClass(
  db: SQLite.SQLiteDatabase,
  therapeuticClass: string,
  lang: Lang,
  limit = 100,
): Promise<DrugSearchResult[]> {
  const rows = await db.getAllAsync<DrugRow>(
    `SELECT atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names
     FROM drug_catalog
     WHERE therapeutic_class = ?
     ORDER BY inn_name ASC
     LIMIT ?`,
    [therapeuticClass, limit],
  )
  return rows.map((row) => {
    const localNames: Record<string, string> = row.local_names
      ? JSON.parse(row.local_names)
      : {}
    const localName =
      lang !== 'en' ? localNames[lang] : undefined
    return {
      atcCode: row.atc_code,
      innName: row.inn_name,
      brandNames: row.brand_names ? JSON.parse(row.brand_names) : [],
      doseForms: row.dose_forms ? JSON.parse(row.dose_forms) : [],
      therapeuticClass: row.therapeutic_class ?? '',
      localName,
    }
  })
}
