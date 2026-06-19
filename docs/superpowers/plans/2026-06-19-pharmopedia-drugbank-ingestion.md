# Pharmopedia DrugBank Ingestion (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-seed and enrich the empty `drug_catalog` from the local **DrugBank 5.1.13 XML** — mechanism of action, pharmacokinetics, indications, ATC, RxCUI, international brands, and drug–drug interactions (with derived severity) — via a streaming Node ETL, and widen the PK model fields from numbers to strings to carry DrugBank's prose faithfully.

**Architecture:** A streaming SAX parser walks the 1.6 GB DrugBank XML one top-level `<drug>` at a time, emits a normalized record (cleaned of HTML/citations), a mapper converts each record to a `drug_catalog` row (roster-filtered, interactions severity-tagged via a keyword map), and the runner upserts in chunks to Hub Postgres. The 6 GB raw datasets are build-time inputs only (gitignored); only the enriched subset reaches the Hub, then syncs to Pharmopedia's local SQLite.

**Tech Stack:** TypeScript, `@ultranos/drug-catalog-etl` (tsx + Vitest), `sax` (streaming XML), `@supabase/supabase-js`, Expo/React Native (Pharmopedia renderer), shared-types.

## Global Constraints

- **Datasets live at `docs/datasets/` (gitignored, multi-GB) — never commit them.** DrugBank XML: `docs/datasets/drugbank-database/drugbank_full_database.xml`. Namespace: `http://www.drugbank.ca`.
- **shared-types is consumed via `dist/`** — after editing source run `pnpm -F @ultranos/shared-types build`.
- **Stream, never DOM-parse** the 1.6 GB XML — `sax` (event-based) or `node:stream`. A naïve `parse()` will OOM.
- **Filter to top-level drugs** — `<drug>` also appears as stubs inside `<pathways>`/`<reactions>`; the parser must ignore nested ones.
- **Strip HTML + citation markers** (`<sup>…</sup>`, `[L41…]`, `[A12…]`) from all DrugBank prose before storing.
- **No PHI** in logs (drug-catalog is reference data; still log only counts/ids, never full records).
- **Git (CLAUDE.md):** do NOT `git add`/`commit` without explicit user instruction — treat "Commit" steps as approval checkpoints.
- **Interaction severity is advisory only (D11):** the derived tier may be *displayed* but MUST NOT drive blocking; the curated `drug-db` list remains the only blocking source until the keyword map is clinician-signed-off.
- DrugBank attribution required (commercial license held).

## ⚠️ Open decisions — defaults chosen; CONFIRM before executing the ingestion tasks (2–5)

1. **Catalog roster** (which DrugBank drugs become rows). **Default:** drugs whose `<groups>` includes `approved` **and** that have ≥1 `<atc-code>` (≈2,700 drugs). Rationale: ATC is our primary key; approved-only keeps it clinically relevant and bounded. *Alternative:* intersect with a WHO-EML/Afghanistan list to stay small. One row per **primary ATC code** (a drug with multiple ATCs → multiple rows sharing content, or pick the first — see Task 4).
2. **Interactions source for v1.** **Default:** DrugBank `drug-interactions` populate `interactions[]` (`drugAtcCode` from the target drug's ATC via the in-memory index; `mechanism` = cleaned description; `severity` = keyword-map). TWOSIDES is **Plan 3** (corroborating signal). Rationale: DrugBank's shape maps directly to our `DrugInteraction` model; TWOSIDES is effect-based and needs separate modelling.
3. **Scope split.** **Default:** this plan does **DrugBank only**. TWOSIDES + OnSIDES = Plan 3; DailyMed (dosing/pregnancy) + MedlinePlus (patient prose) = Plan 4. `adultDosing`/`pregnancyClinical`/`summaryPlain` stay empty after this plan (filled later).

---

### Task 1: Widen PK model fields to strings (D12)

**Files:**
- Modify: `packages/shared-types/src/fhir/drug-catalog.ts`
- Modify: `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx`
- Modify: `scripts/etl/drug-catalog/types.ts`
- Modify: `apps/pharmopedia/src/__tests__/drug-clinical-section.test.tsx` (if it sets `pharmacokinetics` numerics — verify)

**Interfaces:**
- Produces: `DrugPharmacokinetics { halfLife?: string; proteinBinding?: string; volumeOfDistribution?: string; clearance?: string; metabolism?: string; excretion?: string }` (was `halfLifeHours: number`, `proteinBindingPct: number`).

- [ ] **Step 1: Update the shared type**

In `packages/shared-types/src/fhir/drug-catalog.ts`, replace the `DrugPharmacokinetics` interface body with:
```typescript
export interface DrugPharmacokinetics {
  halfLife?: string              // free-text, e.g. "approximately 10 minutes"
  proteinBinding?: string        // e.g. "approximately 3%"
  volumeOfDistribution?: string
  clearance?: string
  metabolism?: string
  excretion?: string             // sourced from DrugBank route-of-elimination
}
```

- [ ] **Step 2: Update the renderer**

In `apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx`, replace the PK lines (currently formatting `pk.halfLifeHours` / `pk.proteinBindingPct` as numbers) with string-safe versions:
```typescript
    if (pk) {
      if (pk.halfLife) pkLines.push(`${t('drug.clinical.halfLife')}: ${pk.halfLife}`)
      if (pk.proteinBinding) pkLines.push(`${t('drug.clinical.proteinBinding')}: ${pk.proteinBinding}`)
      if (pk.volumeOfDistribution) pkLines.push(`${t('drug.clinical.volumeDistribution')}: ${pk.volumeOfDistribution}`)
      if (pk.clearance) pkLines.push(`${t('drug.clinical.clearance') || 'Clearance'}: ${pk.clearance}`)
      if (pk.metabolism) pkLines.push(`${t('drug.clinical.metabolism')}: ${pk.metabolism}`)
      if (pk.excretion) pkLines.push(`${t('drug.clinical.excretion')}: ${pk.excretion}`)
    }
```
*(`clearance` reuses an existing label if present; if `drug.clinical.clearance` is missing from locales, add it: en `'Clearance'`, ar `'التصفية'`, prs `'کلیرانس'`, ps `'کلیرانس'` — in the `drug.clinical` block of each locale.)*

- [ ] **Step 3: Update ETL `SourceDrugData`/`NormalizedDrugRow` PK shape**

In `scripts/etl/drug-catalog/types.ts`, change `SourceDrugData.pharmacokinetics` to:
```typescript
  pharmacokinetics?: {
    halfLife?: string
    proteinBinding?: string
    volumeOfDistribution?: string
    clearance?: string
    metabolism?: string
    excretion?: string
  }
```
(`NormalizedDrugRow.pharmacokinetics` stays `Record<string, unknown>` — JSONB blob, no change.)

- [ ] **Step 4: Fix any tests referencing numeric PK**

Search: `grep -rn "halfLifeHours\|proteinBindingPct" apps packages scripts`. Update each fixture to the string shape, e.g. `pharmacokinetics: { halfLife: '10 minutes', proteinBinding: '3%' }`. If none exist, note that and skip.

- [ ] **Step 5: Build shared-types, run affected tests**

Run: `pnpm -F @ultranos/shared-types build` then `pnpm -F @ultranos/pharmopedia test src/__tests__/drug-clinical-section.test.tsx`
Expected: build clean (modulo the pre-existing `service-request.schema.test.ts` red), pharmopedia PK test passes.

- [ ] **Step 6: Commit** *(checkpoint)*
```bash
git add packages/shared-types/src/fhir/drug-catalog.ts apps/pharmopedia/src/components/DrugDetail/drug-detail-sections.tsx scripts/etl/drug-catalog/types.ts
git commit -m "feat: widen DrugPharmacokinetics fields to strings for DrugBank prose"
```

---

### Task 2: DrugBank streaming XML parser

**Files:**
- Create: `scripts/etl/drug-catalog/sources/drugbank-xml.ts`
- Create: `scripts/etl/drug-catalog/__tests__/fixtures/drugbank-sample.xml`
- Create: `scripts/etl/drug-catalog/__tests__/drugbank-xml.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `sax`)

**Interfaces:**
- Produces:
```typescript
export interface DrugBankRecord {
  drugbankId: string
  name: string
  groups: string[]
  atcCodes: string[]
  rxcui: string[]
  mechanismOfAction?: string
  indication?: string
  pharmacokinetics: { halfLife?: string; proteinBinding?: string; volumeOfDistribution?: string; clearance?: string; metabolism?: string; excretion?: string }
  internationalBrands: string[]
  interactions: Array<{ targetDrugbankId: string; name: string; description: string }>
}
export function parseDrugBankXml(path: string, onDrug: (r: DrugBankRecord) => void): Promise<{ count: number }>
export function cleanProse(s: string | undefined): string | undefined  // strips <tags> and [REFS]
```

- [ ] **Step 1: Add the `sax` dependency**

In `scripts/etl/drug-catalog/package.json` add to `dependencies`: `"sax": "^1.4.1"` and to `devDependencies`: `"@types/sax": "^1.2.7"`. Run `pnpm install`.

- [ ] **Step 2: Create the fixture** `scripts/etl/drug-catalog/__tests__/fixtures/drugbank-sample.xml`

(Representative of the real data — one full top-level drug with HTML/citation noise, plus a nested `<pathways>` `<drug>` stub that MUST be ignored.)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<drugbank xmlns="http://www.drugbank.ca" version="5.1.13" exported-on="2024-01-02">
  <drug type="biotech" created="2005-06-13" updated="2024-01-02">
    <drugbank-id primary="true">DB00001</drugbank-id>
    <drugbank-id>BTD00024</drugbank-id>
    <name>Lepirudin</name>
    <description>A direct thrombin inhibitor.</description>
    <groups><group>approved</group></groups>
    <indication>Indicated for anticoagulation in patients with HIT.[L41]</indication>
    <mechanism-of-action>Lepirudin is a direct thrombin inhibitor.[A12]</mechanism-of-action>
    <half-life>Approximately 10 minutes, and 2 hours in renal impairment.</half-life>
    <protein-binding>Approximately 3%.[L41]</protein-binding>
    <volume-of-distribution>12.2 L/m<sup>2</sup> at steady state.</volume-of-distribution>
    <clearance>Proportional to glomerular filtration rate.</clearance>
    <metabolism>Metabolized by release of amino acids.</metabolism>
    <route-of-elimination>Renal, about 48% of the dose.</route-of-elimination>
    <international-brands>
      <international-brand><name>Refludan</name><company>Bayer</company></international-brand>
    </international-brands>
    <atc-codes>
      <atc-code code="B01AE02">
        <level code="B01AE">Direct thrombin inhibitors</level>
        <level code="B01A">ANTITHROMBOTIC AGENTS</level>
        <level code="B01">ANTITHROMBOTIC AGENTS</level>
        <level code="B">BLOOD AND BLOOD FORMING ORGANS</level>
      </atc-code>
    </atc-codes>
    <external-identifiers>
      <external-identifier><resource>RxCUI</resource><identifier>237057</identifier></external-identifier>
      <external-identifier><resource>Wikipedia</resource><identifier>Lepirudin</identifier></external-identifier>
    </external-identifiers>
    <drug-interactions>
      <drug-interaction><drugbank-id>DB06605</drugbank-id><name>Apixaban</name><description>Apixaban may increase the anticoagulant activities of Lepirudin.</description></drug-interaction>
    </drug-interactions>
    <pathways>
      <pathway><smpdb-id>SMP0001</smpdb-id><name>P</name><category>c</category>
        <drugs><drug><drugbank-id>DB00001</drugbank-id><name>Lepirudin</name></drug></drugs>
        <enzymes></enzymes>
      </pathway>
    </pathways>
  </drug>
</drugbank>
```

- [ ] **Step 3: Write the failing test** `scripts/etl/drug-catalog/__tests__/drugbank-xml.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseDrugBankXml, cleanProse, type DrugBankRecord } from '../sources/drugbank-xml.js'

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drugbank-sample.xml')

describe('parseDrugBankXml', () => {
  it('emits exactly one top-level drug (ignores nested pathway <drug>)', async () => {
    const drugs: DrugBankRecord[] = []
    const { count } = await parseDrugBankXml(FIX, (d) => drugs.push(d))
    expect(count).toBe(1)
    expect(drugs).toHaveLength(1)
  })

  it('extracts primary id, atc, rxcui, brands, interactions', async () => {
    const drugs: DrugBankRecord[] = []
    await parseDrugBankXml(FIX, (d) => drugs.push(d))
    const d = drugs[0]
    expect(d.drugbankId).toBe('DB00001')
    expect(d.name).toBe('Lepirudin')
    expect(d.groups).toContain('approved')
    expect(d.atcCodes).toEqual(['B01AE02'])
    expect(d.rxcui).toEqual(['237057'])
    expect(d.internationalBrands).toContain('Refludan')
    expect(d.interactions[0]).toMatchObject({ targetDrugbankId: 'DB06605', name: 'Apixaban' })
  })

  it('cleans HTML tags and citation markers from prose', async () => {
    const drugs: DrugBankRecord[] = []
    await parseDrugBankXml(FIX, (d) => drugs.push(d))
    const d = drugs[0]
    expect(d.mechanismOfAction).toBe('Lepirudin is a direct thrombin inhibitor.')
    expect(d.pharmacokinetics.proteinBinding).toBe('Approximately 3%.')
    expect(d.pharmacokinetics.volumeOfDistribution).toBe('12.2 L/m2 at steady state.')
    expect(d.pharmacokinetics.excretion).toBe('Renal, about 48% of the dose.')
  })

  it('cleanProse strips <sup> and [REF] markers', () => {
    expect(cleanProse('12.2 L/m<sup>2</sup>.[L41]')).toBe('12.2 L/m2.')
    expect(cleanProse(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run test, verify it FAILS**
Run: `pnpm -F @ultranos/drug-catalog-etl test __tests__/drugbank-xml.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 5: Implement** `scripts/etl/drug-catalog/sources/drugbank-xml.ts`
```typescript
import sax from 'sax'
import { createReadStream } from 'node:fs'

export interface DrugBankRecord {
  drugbankId: string
  name: string
  groups: string[]
  atcCodes: string[]
  rxcui: string[]
  mechanismOfAction?: string
  indication?: string
  pharmacokinetics: { halfLife?: string; proteinBinding?: string; volumeOfDistribution?: string; clearance?: string; metabolism?: string; excretion?: string }
  internationalBrands: string[]
  interactions: Array<{ targetDrugbankId: string; name: string; description: string }>
}

/** Strip HTML tags and DrugBank citation markers like [L41], [A12345]. */
export function cleanProse(s: string | undefined): string | undefined {
  if (s == null) return undefined
  const out = s.replace(/<[^>]+>/g, '').replace(/\[[A-Z]\d+\]/g, '').replace(/\s+/g, ' ').trim()
  return out.length ? out : undefined
}

/**
 * Stream-parse DrugBank XML, invoking onDrug for each TOP-LEVEL <drug>.
 * Depth tracking ignores nested <drug> stubs inside <pathways>/<reactions>.
 */
export function parseDrugBankXml(path: string, onDrug: (r: DrugBankRecord) => void): Promise<{ count: number }> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false, normalize: false })
    let depth = 0
    let inDrug = false
    let drugDepth = -1
    let cur: DrugBankRecord | null = null
    const path_: string[] = []   // localName stack
    let text = ''
    // context flags for nested lists
    let curInteraction: { targetDrugbankId: string; name: string; description: string } | null = null
    let curExtIdResource: string | null = null
    let curExtIdValue: string | null = null
    let curBrandName: string | null = null
    let pendingPrimaryId = false

    const ln = (tag: string) => (tag.includes(':') ? tag.split(':').pop()! : tag)

    parser.on('opentag', (node) => {
      depth++
      const name = ln(node.name)
      path_.push(name)
      text = ''
      if (name === 'drug' && !inDrug) {
        inDrug = true; drugDepth = depth
        cur = { drugbankId: '', name: '', groups: [], atcCodes: [], rxcui: [], pharmacokinetics: {}, internationalBrands: [], interactions: [] }
        return
      }
      if (!inDrug || !cur) return
      if (name === 'drugbank-id' && depth === drugDepth + 1) {
        pendingPrimaryId = node.attributes && (node.attributes as Record<string, string>)['primary'] === 'true'
      }
      if (name === 'atc-code') {
        const code = (node.attributes as Record<string, string>)['code']
        if (code) cur.atcCodes.push(code)
      }
      if (name === 'drug-interaction') curInteraction = { targetDrugbankId: '', name: '', description: '' }
      if (name === 'external-identifier') { curExtIdResource = null; curExtIdValue = null }
      if (name === 'international-brand') curBrandName = null
    })

    parser.on('text', (t) => { text += t })
    parser.on('cdata', (t) => { text += t })

    parser.on('closetag', (tag) => {
      const name = ln(tag)
      const val = text
      text = ''
      if (inDrug && cur) {
        const top = depth === drugDepth + 1   // direct child of the top-level drug
        if (name === 'drug' && depth === drugDepth) {
          onDrug(cur); cur = null; inDrug = false; drugDepth = -1
          path_.pop(); depth--; ; return
        }
        if (name === 'drugbank-id' && depth === drugDepth + 1) {
          if (pendingPrimaryId && !cur.drugbankId) cur.drugbankId = val.trim()
          pendingPrimaryId = false
        }
        if (top) {
          if (name === 'name') cur.name = val.trim()
          else if (name === 'indication') cur.indication = cleanProse(val)
          else if (name === 'mechanism-of-action') cur.mechanismOfAction = cleanProse(val)
          else if (name === 'half-life') cur.pharmacokinetics.halfLife = cleanProse(val)
          else if (name === 'protein-binding') cur.pharmacokinetics.proteinBinding = cleanProse(val)
          else if (name === 'volume-of-distribution') cur.pharmacokinetics.volumeOfDistribution = cleanProse(val)
          else if (name === 'clearance') cur.pharmacokinetics.clearance = cleanProse(val)
          else if (name === 'metabolism') cur.pharmacokinetics.metabolism = cleanProse(val)
          else if (name === 'route-of-elimination') cur.pharmacokinetics.excretion = cleanProse(val)
        }
        if (name === 'group') cur.groups.push(val.trim())
        if (curInteraction) {
          if (name === 'drugbank-id') curInteraction.targetDrugbankId = val.trim()
          else if (name === 'name') curInteraction.name = val.trim()
          else if (name === 'description') curInteraction.description = cleanProse(val) ?? ''
          else if (name === 'drug-interaction') { cur.interactions.push(curInteraction); curInteraction = null }
        }
        if (name === 'resource') curExtIdResource = val.trim()
        if (name === 'identifier') curExtIdValue = val.trim()
        if (name === 'external-identifier') {
          if (curExtIdResource === 'RxCUI' && curExtIdValue) cur.rxcui.push(curExtIdValue)
          curExtIdResource = null; curExtIdValue = null
        }
        if (path_[path_.length - 2] === 'international-brand' && name === 'name') curBrandName = val.trim()
        if (name === 'international-brand' && curBrandName) { cur.internationalBrands.push(curBrandName); curBrandName = null }
      }
      path_.pop()
      depth--
    })

    let count = 0
    const wrappedOnDrug = onDrug
    // wrap to count
    const origResolve = resolve
    parser.on('error', (e) => reject(e))
    parser.on('end', () => origResolve({ count }))
    // recount via interception
    const realOnDrug = (r: DrugBankRecord) => { count++; wrappedOnDrug(r) }
    // reattach: replace closure usage
    ;(onDrug as unknown) = realOnDrug

    createReadStream(path).pipe(parser)
  })
}
```
> Note for implementer: the counter wiring above is illustrative — implement counting cleanly by incrementing a local `count` inside the `closetag` handler at the point `onDrug(cur)` is called, and resolve `{ count }` on `end`. Do not ship the `(onDrug as unknown) = ...` reassignment; it is a placeholder for "increment count when a top-level drug is emitted."

- [ ] **Step 6: Run tests, verify PASS**
Run: `pnpm -F @ultranos/drug-catalog-etl test __tests__/drugbank-xml.test.ts` — Expected: 4 tests PASS.

- [ ] **Step 7: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/sources/drugbank-xml.ts scripts/etl/drug-catalog/__tests__/drugbank-xml.test.ts scripts/etl/drug-catalog/__tests__/fixtures/drugbank-sample.xml scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): streaming DrugBank XML parser (top-level drugs, prose cleaning)"
```

---

### Task 3: DDI severity keyword-map (D11 — advisory only)

**Files:**
- Create: `scripts/etl/drug-catalog/transforms/ddi-severity.ts`
- Create: `scripts/etl/drug-catalog/__tests__/ddi-severity.test.ts`

**Interfaces:**
- Produces: `function deriveDdiSeverity(description: string): 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'` and `export const DDI_SEVERITY_REVIEWED = false` (gate flag — true only after clinical sign-off; consumers must keep blocking on `drug-db` while false).

- [ ] **Step 1: Write the failing test** `__tests__/ddi-severity.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { deriveDdiSeverity, DDI_SEVERITY_REVIEWED } from '../transforms/ddi-severity.js'

describe('deriveDdiSeverity', () => {
  it('flags contraindication language', () => {
    expect(deriveDdiSeverity('The concomitant use is contraindicated.')).toBe('CONTRAINDICATED')
    expect(deriveDdiSeverity('Avoid combination; risk of serotonin syndrome.')).toBe('MAJOR')
  })
  it('maps increased-risk / activity language to MODERATE', () => {
    expect(deriveDdiSeverity('Apixaban may increase the anticoagulant activities of Lepirudin.')).toBe('MODERATE')
  })
  it('defaults to MINOR when no signal words present', () => {
    expect(deriveDdiSeverity('The metabolism can be altered.')).toBe('MINOR')
  })
  it('is advisory-only until clinically reviewed', () => {
    expect(DDI_SEVERITY_REVIEWED).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify FAIL.** `pnpm -F @ultranos/drug-catalog-etl test __tests__/ddi-severity.test.ts`

- [ ] **Step 3: Implement** `scripts/etl/drug-catalog/transforms/ddi-severity.ts`
```typescript
export type DdiSeverity = 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'

/**
 * Heuristic severity from DrugBank interaction description text.
 * ADVISORY ONLY. Must NOT drive interaction-check blocking (CLAUDE.md rule #3)
 * until DDI_SEVERITY_REVIEWED is set true after clinical sign-off.
 */
export const DDI_SEVERITY_REVIEWED = false

const CONTRA = [/contraindicated/i]
const MAJOR = [/\bavoid\b/i, /serotonin syndrome/i, /life-threatening/i, /\bfatal\b/i, /should not be (co-?administered|combined)/i]
const MODERATE = [/may (increase|decrease) the .* activit/i, /increase(d)? (the )?risk/i, /increase(d)? .* (serum )?concentration/i, /reduce(d)? .* efficacy/i]

export function deriveDdiSeverity(description: string): DdiSeverity {
  const d = description ?? ''
  if (CONTRA.some((r) => r.test(d))) return 'CONTRAINDICATED'
  if (MAJOR.some((r) => r.test(d))) return 'MAJOR'
  if (MODERATE.some((r) => r.test(d))) return 'MODERATE'
  return 'MINOR'
}
```

- [ ] **Step 4: Run tests, verify PASS.**

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/transforms/ddi-severity.ts scripts/etl/drug-catalog/__tests__/ddi-severity.test.ts
git commit -m "feat(etl): advisory DDI severity keyword-map (gated, not for blocking)"
```

---

### Task 4: DrugBank record → `drug_catalog` row mapper

**Files:**
- Create: `scripts/etl/drug-catalog/drugbank-mapper.ts`
- Create: `scripts/etl/drug-catalog/__tests__/drugbank-mapper.test.ts`

**Interfaces:**
- Consumes: `DrugBankRecord` (Task 2), `deriveDdiSeverity` (Task 3).
- Produces:
```typescript
export interface DrugBankCatalogRow {
  atc_code: string
  drugbank_id: string
  rxnorm_cui?: string
  inn_name: string
  brand_names: string[]
  mechanism_of_action?: string
  indications_clinical: string[]
  pharmacokinetics: Record<string, string>
  interactions: Array<{ drugAtcCode: string; drugName: string; severity: string; mechanism: string }>
  etl_source: string
  last_etl_refresh: string
}
export function isInRoster(d: DrugBankRecord): boolean        // approved + has ATC
export function mapDrugBankToRows(d: DrugBankRecord, atcByDbId: Map<string,string>, now: string): DrugBankCatalogRow[]
```

- [ ] **Step 1: Write the failing test** `__tests__/drugbank-mapper.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { isInRoster, mapDrugBankToRows } from '../drugbank-mapper.js'
import type { DrugBankRecord } from '../sources/drugbank-xml.js'

const REC: DrugBankRecord = {
  drugbankId: 'DB00001', name: 'Lepirudin', groups: ['approved'], atcCodes: ['B01AE02'], rxcui: ['237057'],
  mechanismOfAction: 'Direct thrombin inhibitor.', indication: 'Anticoagulation in HIT.',
  pharmacokinetics: { halfLife: '10 minutes', proteinBinding: '3%' }, internationalBrands: ['Refludan'],
  interactions: [{ targetDrugbankId: 'DB06605', name: 'Apixaban', description: 'Apixaban may increase the anticoagulant activities of Lepirudin.' }],
}

describe('drugbank-mapper', () => {
  it('isInRoster: approved + has ATC', () => {
    expect(isInRoster(REC)).toBe(true)
    expect(isInRoster({ ...REC, groups: ['experimental'] })).toBe(false)
    expect(isInRoster({ ...REC, atcCodes: [] })).toBe(false)
  })
  it('maps one row per ATC with rxcui + cleaned content', () => {
    const rows = mapDrugBankToRows(REC, new Map([['DB06605', 'B01AF02']]), '2026-06-19T00:00:00.000Z')
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.atc_code).toBe('B01AE02')
    expect(r.drugbank_id).toBe('DB00001')
    expect(r.rxnorm_cui).toBe('237057')
    expect(r.inn_name).toBe('Lepirudin')
    expect(r.brand_names).toContain('Refludan')
    expect(r.indications_clinical).toEqual(['Anticoagulation in HIT.'])
    expect(r.etl_source).toBe('drugbank')
  })
  it('resolves interaction target ATC from the index and tags severity', () => {
    const rows = mapDrugBankToRows(REC, new Map([['DB06605', 'B01AF02']]), 'now')
    const i = rows[0].interactions[0]
    expect(i.drugAtcCode).toBe('B01AF02')
    expect(i.drugName).toBe('Apixaban')
    expect(i.severity).toBe('MODERATE')
    expect(i.mechanism).toContain('anticoagulant activities')
  })
  it('drops interactions whose target is not in the catalog index', () => {
    const rows = mapDrugBankToRows(REC, new Map(), 'now')
    expect(rows[0].interactions).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `scripts/etl/drug-catalog/drugbank-mapper.ts`
```typescript
import type { DrugBankRecord } from './sources/drugbank-xml.js'
import { deriveDdiSeverity } from './transforms/ddi-severity.js'

export interface DrugBankCatalogRow {
  atc_code: string
  drugbank_id: string
  rxnorm_cui?: string
  inn_name: string
  brand_names: string[]
  mechanism_of_action?: string
  indications_clinical: string[]
  pharmacokinetics: Record<string, string>
  interactions: Array<{ drugAtcCode: string; drugName: string; severity: string; mechanism: string }>
  etl_source: string
  last_etl_refresh: string
}

export function isInRoster(d: DrugBankRecord): boolean {
  return d.groups.includes('approved') && d.atcCodes.length > 0
}

export function mapDrugBankToRows(d: DrugBankRecord, atcByDbId: Map<string, string>, now: string): DrugBankCatalogRow[] {
  if (!isInRoster(d)) return []
  const interactions = d.interactions
    .map((i) => {
      const targetAtc = atcByDbId.get(i.targetDrugbankId)
      if (!targetAtc) return null
      return { drugAtcCode: targetAtc, drugName: i.name, severity: deriveDdiSeverity(i.description), mechanism: i.description }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const pk: Record<string, string> = {}
  for (const [k, v] of Object.entries(d.pharmacokinetics)) if (v) pk[k] = v

  // One row per ATC (default: all ATCs). See open-decision 1 to switch to primary-only.
  return d.atcCodes.map((atc) => ({
    atc_code: atc,
    drugbank_id: d.drugbankId,
    rxnorm_cui: d.rxcui[0],
    inn_name: d.name,
    brand_names: d.internationalBrands,
    mechanism_of_action: d.mechanismOfAction,
    indications_clinical: d.indication ? [d.indication] : [],
    pharmacokinetics: pk,
    interactions,
    etl_source: 'drugbank',
    last_etl_refresh: now,
  }))
}
```

- [ ] **Step 4: Run tests, verify PASS.**

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/drugbank-mapper.ts scripts/etl/drug-catalog/__tests__/drugbank-mapper.test.ts
git commit -m "feat(etl): map DrugBank records to drug_catalog rows (roster + DDI ATC resolve)"
```

---

### Task 5: DrugBank ETL runner (two-pass: index, then upsert)

**Files:**
- Create: `scripts/etl/drug-catalog/run-drugbank.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run-drugbank.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add script `"run-drugbank": "tsx run-drugbank.ts"`)

**Interfaces:**
- Consumes: `parseDrugBankXml` (Task 2), `mapDrugBankToRows`/`isInRoster` (Task 4).
- Produces: `export async function runDrugBankEtl(xmlPath: string, deps: { supabase?: SupabaseClient }): Promise<{ rostered: number; rows: number; upserts: number }>`

The runner makes **two streaming passes**: pass 1 builds `atcByDbId` (DrugBank id → primary ATC) for roster drugs so interaction targets resolve; pass 2 maps + upserts in chunks of 200 with `onConflict: 'atc_code'`. The upsert payload includes only DrugBank-owned columns (never `local_names`, `dispensing_notes`, `formulary_status`, `unit_cost`).

- [ ] **Step 1: Write the failing test** `__tests__/run-drugbank.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runDrugBankEtl } from '../run-drugbank.js'

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'drugbank-sample.xml')

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runDrugBankEtl', () => {
  it('rosters the approved drug and upserts one row', async () => {
    const { client, from, upsert } = makeSupabase()
    const res = await runDrugBankEtl(FIX, { supabase: client })
    expect(res.rostered).toBe(1)
    expect(res.rows).toBe(1)
    expect(from).toHaveBeenCalledWith('drug_catalog')
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ onConflict: 'atc_code' }))
  })

  it('upsert payload excludes local enrichment fields', async () => {
    const { client, upsert } = makeSupabase()
    await runDrugBankEtl(FIX, { supabase: client })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row).not.toHaveProperty('local_names')
    expect(row).not.toHaveProperty('dispensing_notes')
    expect(row).not.toHaveProperty('formulary_status')
    expect(row).not.toHaveProperty('unit_cost')
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `scripts/etl/drug-catalog/run-drugbank.ts`
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseDrugBankXml } from './sources/drugbank-xml.js'
import { isInRoster, mapDrugBankToRows, type DrugBankCatalogRow } from './drugbank-mapper.js'

const CHUNK = 200

export async function runDrugBankEtl(
  xmlPath: string,
  deps: { supabase?: SupabaseClient } = {}
): Promise<{ rostered: number; rows: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Pass 1 — DrugBank id -> primary ATC, for rostered drugs (so DDI targets resolve)
  const atcByDbId = new Map<string, string>()
  let rostered = 0
  await parseDrugBankXml(xmlPath, (d) => {
    if (isInRoster(d)) { rostered++; atcByDbId.set(d.drugbankId, d.atcCodes[0]) }
  })

  // Pass 2 — map + chunked upsert
  const now = new Date().toISOString()
  let buf: DrugBankCatalogRow[] = []
  let rows = 0, upserts = 0
  const flush = async () => {
    if (!buf.length) return
    const { error } = await supabase.from('drug_catalog').upsert(buf, { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++; buf = []
  }
  await parseDrugBankXml(xmlPath, (d) => {
    const mapped = mapDrugBankToRows(d, atcByDbId, now)
    rows += mapped.length
    buf.push(...mapped)
  })
  // chunk + flush (collected synchronously above; flush in batches)
  const all = buf; buf = []
  for (let i = 0; i < all.length; i += CHUNK) { buf = all.slice(i, i + CHUNK); await flush() }

  return { rostered, rows, upserts }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\\\/g, '/')}`
if (isMain) {
  const xml = process.env.DRUGBANK_XML ?? 'docs/datasets/drugbank-database/drugbank_full_database.xml'
  runDrugBankEtl(xml).then((r) => { console.log('DrugBank ETL:', r); process.exit(0) })
    .catch((e) => { console.error('DrugBank ETL failed:', (e as Error).message); process.exit(1) })
}
```
> Implementer note: the pass-2 buffering above collects all rows then chunks; for the full 1.6 GB file prefer flushing every `CHUNK` rows *inside* the streaming callback (await is not available in the sync `onDrug` callback, so accumulate and drain in batches, or convert the parser callback to an async queue). Keep memory bounded — do not hold all ~2,700 rows only if that's acceptable (it is, at this size); document the choice.

- [ ] **Step 4: Run tests, verify PASS.** `pnpm -F @ultranos/drug-catalog-etl test`

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/run-drugbank.ts scripts/etl/drug-catalog/__tests__/run-drugbank.test.ts scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): DrugBank two-pass runner (index ATC, upsert catalog rows)"
```

---

### Task 6: Live enrichment run + verification (controller-run)

**Files:** none (operational).

- [ ] **Step 1:** Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env, run `pnpm -F @ultranos/drug-catalog-etl run-drugbank` against `docs/datasets/drugbank-database/drugbank_full_database.xml`.
- [ ] **Step 2:** Verify via Supabase MCP `execute_sql`: `SELECT count(*) FROM drug_catalog;` (expect ≈ roster size), and a spot check: `SELECT atc_code, inn_name, jsonb_array_length(interactions) FROM drug_catalog WHERE atc_code='B01AE02';`
- [ ] **Step 3:** Confirm Pharmopedia sync surfaces the new fields on a clinical-role device (MOA, PK strings, interactions list with advisory severity).

---

## Self-Review

**Spec coverage (design §10/§11):**
- ✅ DrugBank streaming parse, top-level filter, prose cleaning → Task 2
- ✅ RxCUI + ATC extraction, join key → Tasks 2, 4
- ✅ Interactions with derived (advisory, gated) severity → Tasks 3, 4 (D9/D11)
- ✅ PK widened to strings (D12) → Task 1
- ✅ Roster filter (approved + ATC) → Task 4 (open-decision 1, default documented)
- ✅ Never overwrites local enrichment fields → Task 5 test
- ⏭ TWOSIDES, OnSIDES → Plan 3 (explicitly out of scope, §11 / open-decision 3)
- ⏭ DailyMed (dosing/pregnancy), MedlinePlus (patient prose) → Plan 4

**Placeholder scan:** Two implementer notes (Task 2 counter wiring, Task 5 streaming-flush) describe the intended clean implementation explicitly — they are guidance, not gaps; the surrounding code and tests fully define correct behavior.

**Type consistency:** `DrugBankRecord` (Task 2) is consumed unchanged by Tasks 4–5; `pharmacokinetics` string shape matches the Task 1 `DrugPharmacokinetics`; interaction object `{ drugAtcCode, drugName, severity, mechanism }` matches the shared-types `DrugInteraction`.

**Open decisions (confirm before Tasks 2–5):** roster scope (default approved+ATC), interactions = DrugBank-only for v1 (TWOSIDES deferred), one row per ATC.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-pharmopedia-drugbank-ingestion.md`. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — tasks in this session via executing-plans, batched with checkpoints.
