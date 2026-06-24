/**
 * afghan-medicine-report.ts — ONE-OFF analysis tool (not part of the sync pipeline).
 *
 * Parses the Afghan Medicine Pharmaceuticals product CSV into structured brand/
 * presentation records, extracts + spelling-corrects the active ingredient(s),
 * and (pass 2) joins against a catalog-candidates JSON to emit a human-review
 * verification report. NOTHING is written to Supabase here.
 *
 *   Pass 1 (extract):  tsx afghan-medicine-report.ts extract
 *     -> writes afghan-parsed.json + prints the distinct corrected INNs to query
 *   Pass 2 (report):   tsx afghan-medicine-report.ts report
 *     -> reads afghan-parsed.json + afghan-catalog-matches.json -> verification-report.csv
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..', '..', '..', 'docs', 'datasets', 'Brands-List')
const CSV = join(DIR, 'Afghan-Medicine-Pharmaceuticals-Products-List.csv')
const PARSED = join(HERE, 'afghan-parsed.json')

/** Quote-aware CSV parse (handles multi-line quoted cells + "" escapes). */
function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (q) {
      if (c === '"') { if (content[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Known INN spelling fixes in this file (raw lowercased -> corrected WHO INN).
const TYPO: Record<string, string> = {
  'gabpentin': 'gabapentin', 'enticavir': 'entecavir', 'esomperazole': 'esomeprazole',
  'orphinadrine': 'orphenadrine', 'pseudoepdedrine': 'pseudoephedrine', 'meberverine': 'mebeverine',
  'meberverin': 'mebeverine', 'mebeverin': 'mebeverine', 'domperidon': 'domperidone',
  'sosium': 'sodium', 'selinium': 'selenium', 'cyanobalamine': 'cyanocobalamin',
  'chlorpheniramine maleat': 'chlorphenamine', 'chlorpheniramine': 'chlorphenamine',
  'pizotifen': 'pizotifen', 'al hydroxide': 'aluminium hydroxide', 'ca carbonate': 'calcium carbonate',
  'mg hydroxide': 'magnesium hydroxide', 'simethicon': 'simeticone',
}

// Salt / qualifier tails to strip to reach the base INN.
const SALT = /\b(as\s+\w+|hcl|2hcl|hydrochloride|monohydrochloride|sulphate|sulfate|so4|gluconate|carbonate|bicarbonate|hydroxide|oxalate|maleat|maleate|citrate|fumarate|dihydrate|hemihydrate|monohydrate|disoproxil|benzoyl|acetate|sodium|potassium|picosulfate|eq\.?\s*to.*|complex.*)\b.*/i

// Vitamin / mineral common-name -> catalog INN (these never match a raw label).
// Vitamin D/A use the catalog's US spellings so they resolve.
const SYNONYM: Record<string, string> = {
  'vitamin d3': 'cholecalciferol', 'vitamin d': 'cholecalciferol', 'vit d': 'cholecalciferol',
  'vitamin c': 'ascorbic acid', 'vitamin a': 'vitamin a', 'vit a': 'vitamin a',
  'zinc': 'zinc sulfate', 'tenofovir': 'tenofovir disoproxil',
  'iron iii': 'ferric oxide polymaltose', 'iron(iii)': 'ferric oxide polymaltose',
}

// Full multi-word INNs that must NOT be salt-stripped (their name contains a
// token the salt regex would otherwise eat, e.g. "sodium picosulfate").
const KEEP = ['sodium picosulfate']

function cleanIngredient(line: string): string {
  let s = line.replace(/[.…]+/g, ' ')           // dot leaders
    .replace(/\d+(\.\d+)?\s*(mg|mcg|g|iu|ml|%)\b/gi, ' ')  // strengths
    .replace(/\/\s*\d+\s*(ml|g)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase()
  for (const k of KEEP) if (s.startsWith(k)) return k
  s = s.replace(SALT, '')
    .replace(/[/(),].*$/, '')                    // cut at first slash/paren/comma
    .replace(/\s+\d.*$/, '')                     // trailing standalone numbers
    .replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim()
  // longest-prefix lookup against typo + synonym maps
  const words = s.split(' ')
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const cand = words.slice(0, n).join(' ')
    if (TYPO[cand]) return TYPO[cand]
    if (SYNONYM[cand]) return SYNONYM[cand]
  }
  return TYPO[s] ?? SYNONYM[s] ?? s
}

/** Extract first strength token from a line e.g. "250mg", "0.5mg", "70mg/10ml". */
function strengthOf(line: string): string | undefined {
  const m = line.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|iu|%)(?:\s*\/\s*\d*\.?\d*\s*ml)?)/i)
  return m ? m[1].replace(/\s+/g, '') : undefined
}

interface Parsed {
  sr: string
  rawProduct: string
  brandBase: string
  productStrength?: string
  rawComposition: string
  ingredients: { raw: string; inn: string; strength?: string }[]
  isCombo: boolean
  packRaw: string
  packSize?: number
  packUnit?: string
  volume?: string
  doseForm?: string
}

function splitBrand(product: string): { base: string; strength?: string } {
  const p = product.trim().replace(/^AM\s+/i, 'AM-')
  // trailing numeric strength like "250mg" or "450+35" or "50+0.35"
  const m = p.match(/^(.*?)[\s-]*((?:\d+(?:\.\d+)?\s*(?:mg|mcg|g|iu|ml))|(?:\d+\s*\+\s*\d+(?:\.\d+)?))\s*$/i)
  if (m && m[1].trim()) return { base: m[1].trim(), strength: m[2].replace(/\s+/g, '') }
  return { base: p }
}

function parsePack(pack: string): Pick<Parsed, 'packSize' | 'packUnit' | 'volume' | 'doseForm'> {
  const p = pack.replace(/\s+/g, ' ').trim()
  const ml = p.match(/(\d+(?:\.\d+)?)\s*ml/i)
  if (ml) return { volume: `${ml[1]} ml`, doseForm: 'oral liquid' }
  const g = p.match(/^(\d+(?:\.\d+)?)\s*g(m)?\b/i)
  if (g && !/sachet/i.test(p)) return { volume: `${g[1]} g`, doseForm: 'powder' }
  const mult = p.match(/(\d+)\s*[x×]\s*(\d+)\s*(tablet|capsule|sachet)/i)
  if (mult) return { packSize: Number(mult[1]) * Number(mult[2]), packUnit: `${mult[3].toLowerCase()}s`, doseForm: mult[3].toLowerCase() }
  const u = p.match(/(\d+)\s*(tablet|capsule|sachet)/i)
  if (u) return { packSize: Number(u[1]), packUnit: `${u[2].toLowerCase()}s`, doseForm: u[2].toLowerCase() }
  return {}
}

function extract(): Parsed[] {
  const rows = parseCsv(readFileSync(CSV, 'utf8'))
  // header is row index 2 ("Sr#,Product,Composition,Pack Size"); data starts at 3
  const data = rows.slice(3).filter((r) => r[0]?.trim() && /^\d+$/.test(r[0].trim()))
  return data.map((r) => {
    const [sr, product, composition, pack] = [r[0], r[1] ?? '', r[2] ?? '', r[3] ?? '']
    const { base, strength } = splitBrand(product)
    const ingLines = composition.split('\n').map((l) => l.trim()).filter(Boolean)
    const ingredients = ingLines.map((raw) => ({ raw, inn: cleanIngredient(raw), strength: strengthOf(raw) })).filter((i) => i.inn)
    return {
      sr: sr.trim(), rawProduct: product.trim(), brandBase: base, productStrength: strength,
      rawComposition: composition.replace(/\n/g, ' | ').replace(/\s+/g, ' ').trim(),
      ingredients, isCombo: ingredients.length > 1,
      packRaw: pack.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
      ...parsePack(pack),
    }
  })
}

// Proposed oral/systemic ATC for actives that map to MULTIPLE ATCs (route/use
// ambiguity). These are PROPOSALS for human verification, not auto-truth.
const PREFERRED: Record<string, { atc: string; basis: string }> = {
  'ascorbic acid': { atc: 'A11GA01', basis: 'vitamin C, plain (vs topical/genito)' },
  'azithromycin': { atc: 'J01FA10', basis: 'oral macrolide (vs S01 eye)' },
  'celecoxib': { atc: 'M01AH01', basis: 'oral coxib (vs combos/oncology)' },
  'cetirizine': { atc: 'R06AE07', basis: 'oral antihistamine (vs S01 eye)' },
  'ciprofloxacin': { atc: 'J01MA02', basis: 'systemic fluoroquinolone (vs eye/ear)' },
  'ibuprofen': { atc: 'M01AE01', basis: 'oral NSAID (vs M02 topical)' },
  'levofloxacin': { atc: 'J01MA12', basis: 'systemic (vs H.pylori combo/eye)' },
  'metronidazole': { atc: 'J01XD01', basis: 'systemic antibacterial (alt P01AB01 antiprotozoal)' },
  'moxifloxacin': { atc: 'J01MA14', basis: 'systemic (vs S01 eye)' },
  'vitamin a': { atc: 'A11CA01', basis: 'plain vitamin A (vs topical/eye/nasal)' },
  'cholecalciferol': { atc: 'A11CC05', basis: 'plain vitamin D3 (vs combo A11CC55)' },
  'ofloxacin': { atc: 'J01MA01', basis: 'systemic (vs eye/ear)' },
  'omeprazole': { atc: 'A02BC01', basis: 'PPI, plain (vs combo A02BC51)' },
  'paracetamol': { atc: 'N02BE01', basis: 'analgesic/antipyretic, plain' },
  'zinc sulfate': { atc: 'A12CB01', basis: 'oral zinc (vs B05 IV additive)' },
}

// Hand-mapped combination ATCs (matched by brand substring). PROPOSALS — verify.
const COMBO: Array<{ key: string; atc: string; basis: string }> = [
  { key: 'metranide', atc: 'P01AB51', basis: 'metronidazole + diloxanide (antiprotozoal combo)' },
  { key: 'amgesic', atc: 'M03BC51', basis: 'paracetamol + orphenadrine' },
  { key: 'amamol cf', atc: 'N02BE51', basis: 'paracetamol + pseudoephedrine + chlorphenamine' },
  { key: 'amacid', atc: 'A02AF02', basis: 'antacid + antiflatulent (Al/Mg + simeticone)' },
  { key: 'firmin', atc: 'B03AD03', basis: 'iron + folic acid' },
  { key: 'iron(iii)', atc: 'B03AD03', basis: 'iron polymaltose + folic acid' },
  { key: 'calvitamin', atc: 'A11AA03', basis: 'multivitamin + minerals' },
  { key: 'amylysine', atc: 'A11EA', basis: 'vitamin B complex (+ lysine)' },
  { key: 'calmin', atc: 'A11AA03', basis: 'multivitamin + minerals' },
  { key: 'am-iron', atc: 'B03AB05', basis: 'ferric oxide polymaltose (oral iron)' },
  { key: 'mevrin fibro', atc: 'A03AA04', basis: 'mebeverine + ispaghula (primary mebeverine)' },
  { key: 'pedicare', atc: 'A07CA', basis: 'oral rehydration salts' },
  { key: 'lexamin', atc: 'A06AD65', basis: 'macrogol + electrolytes' },
  { key: 'instamin', atc: 'A02BC01', basis: 'omeprazole + sodium bicarbonate (IR)' },
  { key: 'mc-cal', atc: 'A12AX', basis: 'calcium + vitamin C combination' },
  { key: 'amacid', atc: 'A02AF02', basis: 'antacid + antiflatulent (Al/Mg + simeticone)' },
  { key: 'amcuf', atc: 'R05X', basis: 'multi-ingredient cold/cough syrup' },
  { key: 'am-leaf', atc: 'R05CA10', basis: 'herbal expectorant combination (ivy ± others)' },
]

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const mode = process.argv[2] ?? 'extract'
if (mode === 'report') {
  const parsed: Parsed[] = JSON.parse(readFileSync(PARSED, 'utf8'))
  const matches: Record<string, string[]> = JSON.parse(readFileSync(join(HERE, 'afghan-catalog-matches.json'), 'utf8'))
  const header = ['Sr#', 'Brand (raw)', 'Brand (base)', 'Strength', 'Dose form', 'Pack',
    'Active(s) — raw', 'Active(s) — extracted INN', 'Combo?', 'Match status', 'Proposed ATC', 'Candidate ATCs', 'Basis / notes — VERIFY']
  const lines = [header.join(',')]
  const resolved: Array<{ p: Parsed; proposed: string }> = []
  const counts = { ok: 0, review: 0, combo: 0, nomatch: 0 }

  for (const p of parsed) {
    const activesRaw = p.ingredients.map((i) => i.raw.replace(/\s+/g, ' ').trim()).join(' + ')
    const activesInn = p.ingredients.map((i) => i.inn).join(' + ')
    const strength = p.productStrength ?? p.ingredients[0]?.strength ?? ''
    let status = '', proposed = '', candidates = '', basis = ''

    if (p.isCombo) {
      const hit = COMBO.find((c) => p.brandBase.toLowerCase().includes(c.key) || p.rawProduct.toLowerCase().includes(c.key))
      status = 'COMBO — hand-mapped, VERIFY'
      proposed = hit?.atc ?? ''
      basis = hit ? hit.basis : 'combination — no proposal, assign ATC manually'
      counts.combo++
    } else {
      const inn = p.ingredients[0]?.inn ?? ''
      const atcs = matches[inn] ?? []
      if (atcs.length === 0) {
        status = 'NO MATCH — orphan'
        basis = 'not in catalog (herbal/vitamin/alias?) — source or hand-map'
        counts.nomatch++
      } else if (atcs.length === 1) {
        status = 'OK — unambiguous'
        proposed = atcs[0]!
        basis = 'single ATC in catalog'
        counts.ok++
      } else {
        status = 'REVIEW — multiple ATCs'
        proposed = PREFERRED[inn]?.atc ?? ''
        candidates = atcs.join(' | ')
        basis = PREFERRED[inn]?.basis ?? 'pick correct route/use'
        counts.review++
      }
    }
    lines.push([p.sr, p.rawProduct, p.brandBase, strength, p.doseForm ?? '', p.packRaw,
      activesRaw, activesInn, p.isCombo ? 'yes' : '', status, proposed, candidates, basis].map(csvCell).join(','))
    resolved.push({ p, proposed })
  }

  const out = join(DIR, 'verification-report.csv')
  writeFileSync(out, lines.join('\n'))
  console.log(`Wrote ${out}`)

  // ── Emit the loader-ready JSON for FK-valid products only ──────────────────────
  // Combo ATCs only load if they exist in drug_catalog (FK). Singles' ATCs come
  // from the catalog so are always valid.
  const VALID_COMBO_ATCS = new Set(['P01AB51', 'M03BC51', 'N02BE51', 'B03AD03', 'A03AA04', 'A02BC01', 'A06AD65',
    'A02AF02', 'A11AA03', 'A11EA', 'A07CA', 'A12AX', 'R05CA10', 'R05X', 'B03AB05'])
  const byBrand = new Map<string, { genericAtcCode: string; brandName: string; manufacturer: string; rxStatus: string; presentations: object[] }>()
  const deferred: string[] = []
  for (const { p, proposed } of resolved) {
    const loadable = proposed && (!p.isCombo || VALID_COMBO_ATCS.has(proposed))
    if (!loadable) { deferred.push(`${p.sr} ${p.rawProduct}`); continue }
    const key = `${proposed}||${p.brandBase.toLowerCase()}`
    if (!byBrand.has(key)) {
      byBrand.set(key, { genericAtcCode: proposed, brandName: p.brandBase, manufacturer: 'Afghan Medicine Pharmaceuticals', rxStatus: 'unknown', presentations: [] })
    }
    byBrand.get(key)!.presentations.push({
      strength: p.productStrength ?? p.ingredients[0]?.strength,
      doseForm: p.doseForm, packSize: p.packSize, packUnit: p.packUnit, volume: p.volume,
      market: 'AF', registrationStatus: 'marketed',
    })
  }
  const records = [...byBrand.values()]
  const jsonOut = join(DIR, 'branded-medications.json')
  writeFileSync(jsonOut, JSON.stringify(records, null, 2))
  console.log(`Wrote ${jsonOut} (${records.length} brands, ${records.reduce((n, r) => n + r.presentations.length, 0)} presentations; ${deferred.length} products deferred)`)
  console.log('\nDeferred (no FK-valid ATC):\n  ' + deferred.join('\n  '))
  console.log(`\nSummary of ${parsed.length} products:`)
  console.log(`  OK (unambiguous single ATC):   ${counts.ok}`)
  console.log(`  REVIEW (multiple ATCs):        ${counts.review}`)
  console.log(`  COMBO (hand-mapped proposal):  ${counts.combo}`)
  console.log(`  NO MATCH (orphan):             ${counts.nomatch}`)
} else if (mode === 'extract') {
  const parsed = extract()
  writeFileSync(PARSED, JSON.stringify(parsed, null, 2))
  const singleInns = [...new Set(parsed.filter((p) => !p.isCombo).flatMap((p) => p.ingredients.map((i) => i.inn)))].sort()
  const comboInns = [...new Set(parsed.filter((p) => p.isCombo).flatMap((p) => p.ingredients.map((i) => i.inn)))].sort()
  console.log(`Parsed ${parsed.length} products (${parsed.filter((p) => !p.isCombo).length} single, ${parsed.filter((p) => p.isCombo).length} combo).`)
  console.log('\n--- DISTINCT SINGLE-INGREDIENT INNs (' + singleInns.length + ') ---')
  console.log(singleInns.join('\n'))
  console.log('\n--- DISTINCT INNs IN COMBOS (' + comboInns.length + ') ---')
  console.log(comboInns.join('\n'))
}
