/**
 * One-off backfill: encrypt allergy_intolerances substance PHI columns that were
 * written in plaintext before substance_text / substance_free_text were added to
 * the encryption config.
 *
 * Safe to re-run: rows already in the "v1:" ciphertext format are skipped.
 * Logs counts only — never PHI content.
 *
 * Run from repo root:
 *   node --env-file=apps/hub-api/.env.local apps/hub-api/scripts/backfill-encrypt-allergy-substance.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { encryptField } from '@ultranos/crypto/server'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const KEY = process.env.FIELD_ENCRYPTION_KEY

if (!SUPABASE_URL || !SERVICE_ROLE || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FIELD_ENCRYPTION_KEY in env.')
  process.exit(1)
}

const ENC_COLUMNS = ['substance_text', 'substance_free_text']
const isPlaintext = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('v1:')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const { data: rows, error } = await supabase
  .from('allergy_intolerances')
  .select(['id', ...ENC_COLUMNS].join(','))

if (error) {
  console.error('Select failed:', error.message)
  process.exit(1)
}

let rowsUpdated = 0
let fieldsEncrypted = 0

for (const row of rows ?? []) {
  const patch = {}
  for (const col of ENC_COLUMNS) {
    if (isPlaintext(row[col])) {
      patch[col] = encryptField(row[col], KEY)
      fieldsEncrypted++
    }
  }
  if (Object.keys(patch).length === 0) continue

  const { error: updErr } = await supabase.from('allergy_intolerances').update(patch).eq('id', row.id)
  if (updErr) {
    console.error(`Update failed for one allergy: ${updErr.message}`)
    process.exit(1)
  }
  rowsUpdated++
}

console.log(`Backfill complete. Rows scanned: ${rows?.length ?? 0}, rows updated: ${rowsUpdated}, fields encrypted: ${fieldsEncrypted}.`)
