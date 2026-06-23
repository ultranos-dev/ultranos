import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { cleanText, stripSectionHeader } from './openfda-label.js'

// The INN↔USAN alias map moved to transforms/inn-aliases.ts so the regional
// brand source can share it without importing this (stream-json-heavy) module.
// Re-exported here to keep existing import paths working.
export { INN_US_ALIASES, candidateNamesFor } from '../transforms/inn-aliases.js'

// stream-json is a CJS package with no ESM exports field.
// Under ESM/tsx/Vitest, named imports from CJS submodules are unreliable.
// We use createRequire to load each submodule safely.
const require = createRequire(import.meta.url)
const { parser } = require('stream-json') as { parser: (opts?: unknown) => NodeJS.ReadWriteStream }
const { pick } = require('stream-json/filters/Pick') as { pick: (opts?: unknown) => NodeJS.ReadWriteStream }
const { streamArray } = require('stream-json/streamers/StreamArray') as { streamArray: (opts?: unknown) => NodeJS.ReadWriteStream }

const MAX = 3000

export interface BulkLabelFields {
  pregnancyClinical?: { pregnancy?: string; lactation?: string; legacyCategory?: string }
  contraindications: string[]
  administrationNotes?: string
  warnings?: string
}

function stripHeaderClean(s: string | undefined): string | undefined {
  const c = cleanText(s)
  return c ? stripSectionHeader(c) : undefined
}

function clean3000(s: string | undefined): string | undefined {
  const c = stripHeaderClean(s)
  return c ? c.slice(0, MAX) : undefined
}

function splitContra(text: string | undefined): string[] {
  const c = stripHeaderClean(text)
  if (!c) return []
  return c
    .split(/(?<=\.)\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 15)
    .slice(0, 8)
}

interface RawLabel {
  pregnancy?: string[]
  nursing_mothers?: string[]
  contraindications?: string[]
  dosage_and_administration?: string[]
  boxed_warning?: string[]
  warnings?: string[]
}

export function extractBulkLabel(result: unknown): BulkLabelFields | null {
  const r = result as RawLabel
  const pregnancy = stripHeaderClean(r.pregnancy?.[0])
  const lactation = stripHeaderClean(r.nursing_mothers?.[0])
  const legacyCategory = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)?.[1]
  const pregnancyClinical =
    pregnancy || lactation || legacyCategory
      ? {
          ...(pregnancy ? { pregnancy } : {}),
          ...(lactation ? { lactation } : {}),
          ...(legacyCategory ? { legacyCategory } : {}),
        }
      : undefined
  const contraindications = splitContra(r.contraindications?.[0])
  const administrationNotes = clean3000(r.dosage_and_administration?.[0])
  const warnings = clean3000(r.boxed_warning?.[0] ?? r.warnings?.[0])
  if (!pregnancyClinical && contraindications.length === 0 && !administrationNotes && !warnings) return null
  return { pregnancyClinical, contraindications, administrationNotes, warnings }
}

interface StreamArrayData {
  value: { openfda?: { generic_name?: string[] } }
}

export function streamPartition(
  filePath: string,
  onLabel: (genericNames: string[], r: unknown) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0
    const pipeline = createReadStream(filePath)
      .pipe(parser())
      .pipe(pick({ filter: 'results' }))
      .pipe(streamArray())
    pipeline.on('data', ({ value }: StreamArrayData) => {
      try { count++; onLabel(value.openfda?.generic_name ?? [], value) }
      catch (err) { reject(err as Error) }
    })
    pipeline.on('end', () => resolve(count))
    pipeline.on('error', reject)
  })
}

function mergeInto(acc: BulkLabelFields, ext: BulkLabelFields): void {
  if (!acc.pregnancyClinical && ext.pregnancyClinical) acc.pregnancyClinical = ext.pregnancyClinical
  if (acc.contraindications.length === 0 && ext.contraindications.length)
    acc.contraindications = ext.contraindications
  if (!acc.administrationNotes && ext.administrationNotes) acc.administrationNotes = ext.administrationNotes
  if (!acc.warnings && ext.warnings) acc.warnings = ext.warnings
}

export async function buildOpenFdaBulk(
  dir: string,
  nameToCanonical: Map<string, string>,
): Promise<Map<string, BulkLabelFields>> {
  const entries = await readdir(dir, { withFileTypes: true })
  const re = /^drug-label-\d{4}-of-\d{4}\.json$/
  const partitionPaths: string[] = []
  for (const e of entries) {
    if (e.isFile() && re.test(e.name)) partitionPaths.push(join(dir, e.name))
    else if (e.isDirectory() && re.test(e.name)) partitionPaths.push(join(dir, e.name, e.name))
  }
  const acc = new Map<string, BulkLabelFields>()
  for (const path of partitionPaths) {
    await streamPartition(path, (genericNames, r) => {
      // collect candidate label names: generic_name(s) + substance_name(s), lowercased
      const labelNames = new Set<string>()
      for (const g of genericNames) labelNames.add(g.toLowerCase())
      const subs = (r as { openfda?: { substance_name?: string[] } }).openfda?.substance_name ?? []
      for (const s of subs) labelNames.add(s.toLowerCase())
      // map any matching label name back to its catalog canonical
      const canonicals = new Set<string>()
      for (const n of labelNames) { const c = nameToCanonical.get(n); if (c) canonicals.add(c) }
      if (canonicals.size === 0) return
      const ext = extractBulkLabel(r); if (!ext) return
      for (const canon of canonicals) {
        let cur = acc.get(canon)
        if (!cur) { cur = { contraindications: [] }; acc.set(canon, cur) }
        mergeInto(cur, ext)
      }
    })
  }
  return acc
}
