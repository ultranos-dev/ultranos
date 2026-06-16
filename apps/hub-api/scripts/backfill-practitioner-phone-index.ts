import { createClient } from '@supabase/supabase-js'
import { decryptField, generateBlindIndex } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '../src/lib/field-encryption'

/** Pure, unit-testable transform: stored (encrypted) phone -> blind index, or null. */
export function computePhoneIndex(storedPhone: string | null, encKey: string, hmacKey: string): string | null {
  if (!storedPhone) return null
  const plain = decryptField(storedPhone, encKey)
  if (!plain) return null
  return generateBlindIndex(plain, hmacKey)
}

/** One-time backfill. Logs counts only — never phone values. Idempotent (skips already-indexed rows). */
async function main() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  const { encryptionKey, hmacKey } = getFieldEncryptionKeys()
  const supabase = createClient(url, serviceKey)

  let updated = 0, skipped = 0, page = 0
  const PAGE = 500
  for (;;) {
    const { data, error } = await supabase
      .from('practitioners')
      .select('id, telecom_phone, telecom_phone_index')
      .is('telecom_phone_index', null)
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.code}`)
    if (!data || data.length === 0) break
    for (const row of data as Array<{ id: string; telecom_phone: string | null }>) {
      const idx = computePhoneIndex(row.telecom_phone, encryptionKey, hmacKey)
      if (!idx) { skipped++; continue }
      const { error: upErr } = await supabase.from('practitioners').update({ telecom_phone_index: idx }).eq('id', row.id)
      if (upErr) { console.error('[BACKFILL] update failed', { id: row.id, code: upErr.code }); skipped++; continue }
      updated++
    }
    page++
  }
  console.log(`[BACKFILL] practitioner phone index complete: updated=${updated} skipped=${skipped}`)
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes('backfill-practitioner-phone-index')) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[BACKFILL] failed', e); process.exit(1) })
}
