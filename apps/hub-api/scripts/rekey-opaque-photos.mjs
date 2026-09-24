import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'

/**
 * Story 58.1 / audit C-SYS-4 — one-time patient-photo opaque re-key.
 *
 * Legacy patient photos were stored under a key DERIVED FROM THE PATIENT UUID
 * (`<patient_id>.<ext>`). Now that patient photos are shown on lab-facing surfaces
 * (Rule #7, revised 2026-09-24), a signed URL over such a key would embed the real
 * patient UUID in the URL path — defeating the HMAC blind index and letting a lab
 * correlate a photo to a patient.
 *
 * This script moves every legacy `patient-photos` object to a fresh OPAQUE key
 * (random UUID, unrelated to the patient), updates `patients.photo_url`, and removes
 * any leftover UUID-derived objects (e.g. an old `.jpg` when `.webp` is current).
 *
 * Rules:
 *  - Idempotent: a photo_url already opaque (not prefixed with the patient id) is skipped.
 *  - Preserves the object's original extension (the move relabels, never transcodes).
 *  - Storage move is copy+delete; on any per-patient failure it logs (opaque ids only)
 *    and continues — a half-moved patient is retried on the next run.
 *  - Logs NO PHI: only opaque patient ids, storage key names, and counts.
 *
 * Usage (dry run first):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node apps/hub-api/scripts/rekey-opaque-photos.mjs --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node apps/hub-api/scripts/rekey-opaque-photos.mjs
 */

const BUCKET = 'patient-photos'

/** A key is "legacy/UUID-derived" when its filename (sans extension) equals the patient id. */
export function isLegacyKey(patientId, key) {
  if (!key) return false
  const base = key.replace(/\.[^.]+$/, '') // strip extension
  return base === patientId
}

async function main() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')

  const dryRun = process.argv.includes('--dry-run')
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  console.log(`[REKEY_PHOTOS] starting${dryRun ? ' (DRY RUN — no writes)' : ''}`)

  const report = { scanned: 0, reKeyed: 0, alreadyOpaque: 0, orphansRemoved: 0, failed: 0 }

  // Page through patients that have a photo.
  const PER_PAGE = 500
  for (let from = 0; ; from += PER_PAGE) {
    const { data: rows, error } = await supabase
      .from('patients')
      .select('id, photo_url')
      .not('photo_url', 'is', null)
      .range(from, from + PER_PAGE - 1)
    if (error) throw new Error(`patients query failed: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      report.scanned++
      const oldKey = row.photo_url
      if (!isLegacyKey(row.id, oldKey)) {
        report.alreadyOpaque++
        continue
      }

      const ext = extname(oldKey) || '.webp'
      const newKey = `${randomUUID()}${ext}`

      if (dryRun) {
        console.log('[REKEY_PHOTOS] would re-key', { patientId: row.id, from: oldKey, to: newKey })
        report.reKeyed++
        continue
      }

      // 1. Move the object to the opaque key (copy+delete).
      const { error: moveErr } = await supabase.storage.from(BUCKET).move(oldKey, newKey)
      if (moveErr) {
        console.error('[REKEY_PHOTOS] move failed', { patientId: row.id, status: moveErr.message ? 'error' : 'unknown' })
        report.failed++
        continue
      }

      // 2. Point photo_url at the opaque key.
      const { error: updErr } = await supabase.from('patients').update({ photo_url: newKey }).eq('id', row.id)
      if (updErr) {
        // Best-effort rollback of the move so we don't strand a renamed object.
        await supabase.storage.from(BUCKET).move(newKey, oldKey).catch(() => {})
        console.error('[REKEY_PHOTOS] photo_url update failed', { patientId: row.id })
        report.failed++
        continue
      }

      // 3. Remove any leftover UUID-derived objects for this patient (e.g. an old .jpg).
      for (const staleExt of ['.webp', '.jpg', '.jpeg', '.png']) {
        const staleKey = `${row.id}${staleExt}`
        if (staleKey !== oldKey) {
          const { data: removed } = await supabase.storage.from(BUCKET).remove([staleKey]).catch(() => ({ data: null }))
          if (removed && removed.length > 0) report.orphansRemoved++
        }
      }

      report.reKeyed++
      console.log('[REKEY_PHOTOS] re-keyed', { patientId: row.id })
    }

    if (rows.length < PER_PAGE) break
  }

  console.log('[REKEY_PHOTOS] complete', report)
  if (report.failed > 0) process.exitCode = 1
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && process.argv[1].includes('rekey-opaque-photos')) {
  main().catch((e) => {
    console.error('[REKEY_PHOTOS] failed', e instanceof Error ? e.message : 'unknown error')
    process.exit(1)
  })
}
