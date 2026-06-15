import * as SQLite from 'expo-sqlite'
import type { DrugSearchResult } from '@ultranos/shared-types'

interface FtsRow {
  atc_code: string
  inn_name: string
  brand_names: string | null
  dose_forms: string | null
  therapeutic_class: string | null
  local_names: string | null
}

/** Sanitise FTS5 query: strip special chars, append prefix wildcard. */
function toFtsQuery(q: string): string {
  return q.replace(/["*^()]/g, '').trim() + '*'
}

/**
 * Full-text search against the local FTS5 index.
 * Searches inn_name, atc_code, brand_names_flat, local_names_flat.
 * Returns DrugSearchResult[] ordered by relevance rank.
 */
export async function searchDrugs(
  db: SQLite.SQLiteDatabase,
  q: string,
  lang: 'en' | 'prs' | 'ps',
  limit: number,
): Promise<DrugSearchResult[]> {
  const ftsQuery = toFtsQuery(q)
  const rows = await db.getAllAsync<FtsRow>(
    `SELECT dc.atc_code, dc.inn_name, dc.brand_names, dc.dose_forms,
            dc.therapeutic_class, dc.local_names
     FROM drug_catalog dc
     JOIN drug_catalog_fts fts ON fts.rowid = dc.rowid
     WHERE drug_catalog_fts MATCH ?
     ORDER BY fts.rank
     LIMIT ?`,
    [ftsQuery, limit]
  )

  return rows.map((row) => {
    const localNames: Record<string, string> = row.local_names
      ? JSON.parse(row.local_names)
      : {}
    return {
      atcCode: row.atc_code,
      innName: row.inn_name,
      brandNames: row.brand_names ? JSON.parse(row.brand_names) : [],
      doseForms: row.dose_forms ? JSON.parse(row.dose_forms) : [],
      therapeuticClass: row.therapeutic_class ?? '',
      localName: localNames[lang],
    }
  })
}
