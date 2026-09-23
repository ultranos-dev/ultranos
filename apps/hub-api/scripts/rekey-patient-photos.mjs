/**
 * One-off migration (Story 58.1 / audit C-SYS-4): re-key patient photo objects
 * from the UUID-derived key `<patientUUID>.webp` to an OPAQUE random key, so that
 * lab-facing signed photo URLs stop embedding the real patient UUID (which defeated
 * the HMAC blind index and allowed cross-order patient correlation).
 *
 * For each patient whose `photo_url` is still a legacy `<uuid>.webp` key:
 *   1. Copy the storage object to a fresh random key (`<randomUUID>.webp`).
 *   2. Verify the copy exists (list the new key).
 *   3. Update `patients.photo_url` to the new opaque key.
 *   4. (Only when RUN_MODE=purge) remove the legacy UUID-keyed original.
 *
 * ── DEFERRED APPLICATION ──────────────────────────────────────────────────────
 * Per project rules this script is AUTHORED, NOT APPLIED. Do NOT run it against the
 * shared Supabase project from an agent session. It is applied at deploy time by an
 * operator, in two passes:
 *   Pass 1 (default):   node ... rekey-patient-photos.mjs
 *                       → copies + repoints photo_url; legacy objects KEPT (rollback window).
 *   Pass 2 (after soak): RUN_MODE=purge node ... rekey-patient-photos.mjs
 *                       → deletes the now-orphaned legacy <uuid>.webp objects.
 *
 * Rollback (during the window, before purge): set photo_url back to `<id>.webp` for
 * affected rows — the legacy object is still present. The new opaque objects can be
 * left in place or removed; they are only referenced once photo_url points at them.
 *
 * Idempotent + safe to re-run: rows whose photo_url is already an opaque key (i.e.
 * does not equal `<id>.webp`) are skipped. Logs COUNTS ONLY — never PHI (Rule #1);
 * patient ids are opaque UUIDs, not PHI, but no names/photos/content are logged.
 *
 * Run from repo root:
 *   node --env-file=apps/hub-api/.env.local apps/hub-api/scripts/rekey-patient-photos.mjs
 *   RUN_MODE=purge node --env-file=apps/hub-api/.env.local apps/hub-api/scripts/rekey-patient-photos.mjs
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'patient-photos'
const PURGE = process.env.RUN_MODE === 'purge'

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

/** A key is "legacy UUID-derived" when it equals `<patientId>.webp`. */
const isLegacyKey = (id, key) => typeof key === 'string' && key === `${id}.webp`

const { data: rows, error } = await supabase
  .from('patients')
  .select('id, photo_url')
  .not('photo_url', 'is', null)

if (error) {
  console.error('Select failed:', error.message)
  process.exit(1)
}

let scanned = 0
let rekeyed = 0
let purged = 0
let skipped = 0
let failed = 0

for (const row of rows ?? []) {
  scanned++
  const legacyKey = `${row.id}.webp`

  if (!isLegacyKey(row.id, row.photo_url)) {
    // Already opaque (or an unexpected value we won't touch).
    skipped++
    if (PURGE) {
      // In purge mode, remove any leftover legacy object now that photo_url is opaque.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([legacyKey])
      if (!rmErr) purged++
    }
    continue
  }

  // Pass 1: copy legacy object → opaque key, verify, repoint photo_url.
  const newKey = `${randomUUID()}.webp`

  const { error: copyErr } = await supabase.storage.from(BUCKET).copy(legacyKey, newKey)
  if (copyErr) {
    // The referenced object may be missing (dangling photo_url). Skip — do not lose data.
    console.error(`Copy failed for one patient (id ${row.id}): ${copyErr.message}`)
    failed++
    continue
  }

  // Verify the new object exists before repointing.
  const { data: listed, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list('', { search: newKey, limit: 1 })
  if (listErr || !listed?.some((o) => o.name === newKey)) {
    console.error(`Verify failed for one patient (id ${row.id}) — new object not found; leaving photo_url unchanged.`)
    failed++
    continue
  }

  const { error: updErr } = await supabase
    .from('patients')
    .update({ photo_url: newKey })
    .eq('id', row.id)
  if (updErr) {
    console.error(`photo_url update failed for one patient (id ${row.id}): ${updErr.message}`)
    // Best-effort cleanup of the orphaned copy so a re-run starts clean.
    await supabase.storage.from(BUCKET).remove([newKey]).catch(() => {})
    failed++
    continue
  }
  rekeyed++

  // Legacy object is intentionally KEPT here for the rollback window; the separate
  // RUN_MODE=purge pass removes it after soak.
}

console.log(
  `Re-key ${PURGE ? '(PURGE) ' : ''}complete. Scanned: ${scanned}, re-keyed: ${rekeyed}, ` +
    `skipped(already-opaque): ${skipped}, legacy purged: ${purged}, failed: ${failed}.`,
)
if (failed > 0) process.exit(1)
