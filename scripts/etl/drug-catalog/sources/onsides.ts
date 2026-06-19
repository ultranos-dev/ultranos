import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { severityForSection, SEVERITY_RANK, MAX_ADVERSE_EFFECTS, type AdverseSeverity } from '../transforms/onsides-severity.js'

export interface AdverseEvent { effect: string; frequency: 'unknown'; severity: AdverseSeverity }

const PRED1_THRESHOLD = 3.258

/** Minimal quote-aware CSV line split (handles "a,b" quoted fields). */
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}

async function eachLine(path: string, onLine: (cols: string[], idx: number) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let idx = 0
  for await (const line of rl) { if (line.length) onLine(splitCsv(line), idx); idx++ }
}

function pushMulti(m: Map<string, string[]>, k: string, v: string) {
  const a = m.get(k); if (a) a.push(v); else m.set(k, [v])
}

export async function loadOnsidesLookups(dir: string) {
  const labelToProducts = new Map<string, string[]>()
  const productToIngredients = new Map<string, string[]>()
  const meddraName = new Map<string, string>()
  await eachLine(join(dir, 'product_to_rxnorm.csv'), (c, i) => { if (i) pushMulti(labelToProducts, c[0], c[1]) })
  await eachLine(join(dir, 'vocab_rxnorm_ingredient_to_product.csv'), (c, i) => { if (i) pushMulti(productToIngredients, c[0], c[1]) })
  await eachLine(join(dir, 'vocab_meddra_adverse_effect.csv'), (c, i) => { if (i && c[2] === 'PT') meddraName.set(c[0], c[1]) })
  return { labelToProducts, productToIngredients, meddraName }
}

export async function buildAdverseEventsByIngredient(
  dir: string,
  lookups: Awaited<ReturnType<typeof loadOnsidesLookups>>,
  catalogCuis: Set<string>
): Promise<Map<string, AdverseEvent[]>> {
  const { labelToProducts, productToIngredients, meddraName } = lookups
  const acc = new Map<string, Map<string, AdverseSeverity>>()
  await eachLine(join(dir, 'product_adverse_effect.csv'), (c, i) => {
    if (!i) return
    const labelId = c[0], section = c[2], meddraId = c[3], pred1 = Number(c[6])
    if (!(pred1 > PRED1_THRESHOLD)) return
    const name = meddraName.get(meddraId); if (!name) return
    const sev = severityForSection(section)
    const products = labelToProducts.get(labelId); if (!products) return
    for (const p of products) {
      const ings = productToIngredients.get(p); if (!ings) continue
      for (const ing of ings) {
        if (!catalogCuis.has(ing)) continue
        let em = acc.get(ing); if (!em) { em = new Map(); acc.set(ing, em) }
        const prev = em.get(name)
        if (prev === undefined || SEVERITY_RANK[sev] < SEVERITY_RANK[prev]) em.set(name, sev)
      }
    }
  })
  const out = new Map<string, AdverseEvent[]>()
  for (const [ing, em] of acc) {
    const evs = [...em.entries()].map(([effect, severity]) => ({ effect, frequency: 'unknown' as const, severity }))
    evs.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    out.set(ing, evs.slice(0, MAX_ADVERSE_EFFECTS))
  }
  return out
}
