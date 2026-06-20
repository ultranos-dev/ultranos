import { readFileSync } from 'node:fs'

export interface RecallAlert { recallId: string; description: string; initiationDate: string; status: string }

const MAX_RECALLS = 10

function fmtDate(yyyymmdd: string | undefined): string {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return yyyymmdd ?? ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

interface EnforcementRecord {
  recall_number?: string; status?: string; reason_for_recall?: string
  recall_initiation_date?: string; classification?: string
  openfda?: { generic_name?: string[]; substance_name?: string[] }
}

export function parseEnforcement(rec: EnforcementRecord): { recall: RecallAlert; names: string[] } | null {
  const recallId = rec.recall_number
  if (!recallId) return null
  const names = [...(rec.openfda?.generic_name ?? []), ...(rec.openfda?.substance_name ?? [])].map((n) => n.toLowerCase())
  if (names.length === 0) return null
  const recall: RecallAlert = {
    recallId,
    description: rec.reason_for_recall ?? '',
    initiationDate: fmtDate(rec.recall_initiation_date),
    status: rec.status ?? '',
  }
  return { recall, names }
}

export function buildRecallsByDrug(filePath: string, nameToCanonical: Map<string, string>): Map<string, RecallAlert[]> {
  const json = JSON.parse(readFileSync(filePath, 'utf-8')) as { results?: EnforcementRecord[] }
  const acc = new Map<string, RecallAlert[]>()
  for (const rec of json.results ?? []) {
    const p = parseEnforcement(rec)
    if (!p) continue
    const canon = new Set<string>()
    for (const n of p.names) { const c = nameToCanonical.get(n); if (c) canon.add(c) }
    for (const c of canon) { const a = acc.get(c); if (a) a.push(p.recall); else acc.set(c, [p.recall]) }
  }
  for (const [k, list] of acc) {
    list.sort((a, b) => (b.initiationDate || '').localeCompare(a.initiationDate || ''))
    acc.set(k, list.slice(0, MAX_RECALLS))
  }
  return acc
}
