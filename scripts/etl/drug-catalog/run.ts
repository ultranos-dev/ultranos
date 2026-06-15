#!/usr/bin/env tsx
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { EmlDrugEntry, NormalizedDrugRow } from './types.js'
import { fetchFromNlm } from './sources/nlm.js'
import { fetchFromOpenFda } from './sources/openfda.js'
import { fetchFromDrugBank } from './sources/drugbank.js'
import { normalizeDrug } from './normalizer.js'

const UPSERT_CHUNK_SIZE = 50

interface RunDeps {
  supabase?: SupabaseClient
}

async function processOneDrug(entry: EmlDrugEntry): Promise<NormalizedDrugRow> {
  const [nlm, openFda, drugBank] = await Promise.all([
    fetchFromNlm(entry.atcCode, entry.innName),
    fetchFromOpenFda(entry.atcCode, entry.innName),
    fetchFromDrugBank(entry.atcCode, entry.innName),
  ])
  return normalizeDrug(entry, [nlm, openFda, drugBank])
}

async function upsertChunk(supabase: SupabaseClient, rows: NormalizedDrugRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('drug_catalog')
    .upsert(rows, { onConflict: 'atc_code' })
  if (error) throw new Error(`Upsert failed: ${error.message}`)
}

export async function runEtl(
  entries: EmlDrugEntry[],
  deps: RunDeps = {}
): Promise<{ processed: number; failed: number }> {
  const supabase = deps.supabase ?? createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let processed = 0
  let failed = 0

  for (let i = 0; i < entries.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + UPSERT_CHUNK_SIZE)
    const results = await Promise.allSettled(chunk.map(processOneDrug))
    const rows = results
      .filter((r): r is PromiseFulfilledResult<NormalizedDrugRow> => r.status === 'fulfilled')
      .map(r => r.value)
    const chunkFailed = results.filter(r => r.status === 'rejected')
    chunkFailed.forEach((r) => {
      const reason = r.status === 'rejected' ? (r.reason as Error).message : 'unknown'
      console.error(`Failed in chunk starting at index ${i}: ${reason}`)
    })
    processed += rows.length
    failed += chunkFailed.length

    await upsertChunk(supabase, rows)
    console.log(`Progress: ${Math.min(i + UPSERT_CHUNK_SIZE, entries.length)}/${entries.length}`)
  }

  return { processed, failed }
}

// Entry point — only executed when run directly via `npx tsx run.ts`
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required')
    process.exit(1)
  }
  const __dirname = dirname(__filename)
  const entries: EmlDrugEntry[] = JSON.parse(
    readFileSync(join(__dirname, 'seed/who-eml-phase1.json'), 'utf-8')
  )
  console.log(`Starting ETL for ${entries.length} drugs...`)
  runEtl(entries)
    .then(({ processed, failed }) => {
      console.log(`ETL complete. Processed: ${processed}, Failed: ${failed}`)
      process.exit(failed > 0 ? 1 : 0)
    })
    .catch((err: Error) => {
      console.error('ETL fatal error:', err.message)
      process.exit(1)
    })
}
