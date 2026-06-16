import type * as SQLite from 'expo-sqlite'

export interface RecallSummary {
  atcCode: string
  innName: string
  description: string
}

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const TERMINAL_STATUSES = new Set(['completed', 'terminated', 'closed', 'resolved', 'cancelled'])

function isActive(status: unknown): boolean {
  if (typeof status !== 'string' || !status.trim()) return true
  return !TERMINAL_STATUSES.has(status.trim().toLowerCase())
}

/**
 * Scan the local catalog's Tier-3 data for drugs with an active recall.
 * Returns [] for roles without Tier-3 access. Tolerant of missing/malformed JSON.
 */
export async function getActiveRecalls(
  db: Pick<SQLite.SQLiteDatabase, 'getAllAsync'>,
  role: string,
  limit = 5,
): Promise<RecallSummary[]> {
  if (!PHARMACIST_ROLES.has(role)) return []
  const rows = await db.getAllAsync<{ atc_code: string; inn_name: string; tier3_json: string | null }>(
    'SELECT atc_code, inn_name, tier3_json FROM drug_catalog WHERE tier3_json IS NOT NULL',
  )
  const collected: Array<RecallSummary & { date: string }> = []
  for (const row of rows) {
    if (!row.tier3_json) continue
    try {
      const entry = JSON.parse(row.tier3_json) as { recallAlerts?: Array<{ description?: string; initiationDate?: string; status?: string }> }
      const alerts = Array.isArray(entry?.recallAlerts) ? entry.recallAlerts : []
      for (const a of alerts) {
        if (isActive(a?.status)) {
          collected.push({
            atcCode: row.atc_code,
            innName: row.inn_name,
            description: typeof a?.description === 'string' ? a.description : '',
            date: typeof a?.initiationDate === 'string' ? a.initiationDate : '',
          })
        }
      }
    } catch {
      // skip malformed Tier-3 JSON
    }
  }
  collected.sort((x, y) => y.date.localeCompare(x.date))
  return collected.slice(0, limit).map(({ atcCode, innName, description }) => ({ atcCode, innName, description }))
}
