import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseDrugBankXml } from './sources/drugbank-xml.js'
import { isInRoster, mapDrugBankToRows, type DrugBankCatalogRow } from './drugbank-mapper.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)

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

  // Pass 2 — map all rows (dedupe by atc_code, last-wins), then chunked upsert
  const now = new Date().toISOString()
  const byAtc = new Map<string, DrugBankCatalogRow>()
  await parseDrugBankXml(xmlPath, (d) => {
    for (const r of mapDrugBankToRows(d, atcByDbId, now)) byAtc.set(r.atc_code, r)
  })
  const all = [...byAtc.values()]

  let upserts = 0
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK)
    const { error } = await supabase.from('drug_catalog').upsert(chunk, { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }

  return { rostered, rows: all.length, upserts }
}

// Run when executed directly (tsx/node) but NOT when imported by tests.
// Basename check is cross-platform; import.meta.url vs argv[1] differs on Windows (file:///C:/…).
const isMain = !!process.argv[1] && /run-drugbank\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const xml = process.env.DRUGBANK_XML ?? 'docs/datasets/drugbank-database/drugbank_full_database.xml'
  runDrugBankEtl(xml)
    .then((r) => { console.log('DrugBank ETL:', r); process.exit(0) })
    .catch((e) => { console.error('DrugBank ETL failed:', (e as Error).message); process.exit(1) })
}
