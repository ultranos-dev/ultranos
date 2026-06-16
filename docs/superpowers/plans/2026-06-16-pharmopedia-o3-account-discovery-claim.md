# Pharmopedia O3 — Account Discovery + Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public identity a real linked `patients` record, with post-OTP account discovery (claim an existing record by phone, gated by a birth-year factor) and a staff-phone bounce, built on the Hub's existing patient/MPI machinery.

**Architecture:** New Hub `patientRegistration` procedures (`discover`/`claim`/`registerFromSession`) on `protectedProcedure`, two migrations (`patients.auth_user_id`, `practitioners.telecom_phone_index`) + a practitioner-phone backfill, the admin-invite write path, an app `account.ts` client, and a post-OTP branch in the signup wizard. Patient phone is plaintext+unique (exact match); practitioner phone is matched via HMAC blind index.

**Tech Stack:** Hub: Next.js tRPC, Supabase, `@ultranos/crypto/server` (`encryptField`/`decryptField`/`generateBlindIndex`), `@ultranos/mpi-engine`, `@ultranos/audit-logger`, Vitest. App: Expo Router, Supabase, Vitest.

**Conventions (keep):** audit with **opaque ids only** (never phone/name/DOB); field-encrypt PHI; tokens-only RN styling; built on the O1 `AuthShell`. **Commits:** repo forbids autonomous commits — `Commit` steps run only on the user's go-ahead with the `Co-Authored-By` trailer. **Controller-run:** Task 1 (migrations) is applied by the controller via the Supabase MCP.

**Reference (verbatim patterns to mirror):** the existing `patientRegistration.register` mutation in `apps/hub-api/src/trpc/routers/patient-registration.ts` (encryption via `encryptField`/`db.toRow`, `create_patient_with_consent` RPC, `auth.admin.updateUserById`, `AuditLogger.emit` with retry). `computeMpiResult(candidates, input) → { decision: 'BLOCK'|'WARN'|'ALLOW', topScore, candidates }`. `getFieldEncryptionKeys() → { encryptionKey, hmacKey }` (sync). `generateBlindIndex(value, hmacKey)` (sync, 64-hex). Hub tests: Vitest, `createCallerFactory(appRouter)`, mock `ctx.supabase` query-builder + `.rpc`.

---

## File Structure

**Created:**
- `apps/hub-api/scripts/backfill-practitioner-phone-index.ts` — one-time backfill (decrypt → blind index).
- `apps/pharmopedia/src/api/account.ts` — discover/claim/registerFromSession client.
- Hub tests: `apps/hub-api/src/__tests__/account-discovery.test.ts` (discover/claim/registerFromSession).
- App tests: `apps/pharmopedia/src/__tests__/account-api.test.ts`, and additions to `signup-wizard.test.tsx`.

**Modified:**
- DB (migrations, MCP): `patients.auth_user_id`, `practitioners.telecom_phone_index`.
- `apps/hub-api/src/trpc/routers/patient-registration.ts` — add `discover`, `claim`, `registerFromSession`.
- `apps/hub-api/src/trpc/routers/admin.ts` — write `telecom_phone_index` on practitioner invite.
- `apps/pharmopedia/app/(auth)/register.tsx` — post-OTP discover branch + claim/DOB.
- `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts` — discovery/claim `signup` keys.

---

## Task 1: Migrations (controller-run via Supabase MCP)

- [ ] **Step 1: Apply `o3_patient_auth_link` migration**
```sql
alter table patients add column if not exists auth_user_id uuid;
create unique index if not exists patients_auth_user_id_key on patients (auth_user_id) where auth_user_id is not null;
```

- [ ] **Step 2: Apply `o3_practitioner_phone_index` migration**
```sql
alter table practitioners add column if not exists telecom_phone_index text;
create index if not exists practitioners_telecom_phone_index_idx on practitioners (telecom_phone_index);
```

- [ ] **Step 3: Verify**
Run a `select` (MCP `execute_sql`) confirming both columns exist (`information_schema.columns` for `patients.auth_user_id` and `practitioners.telecom_phone_index`).

- [ ] **Step 4: Regenerate types (optional)** — if the repo commits generated Supabase types, run the MCP `generate_typescript_types` and update the checked-in file; otherwise skip. (No commit of secrets.)

---

## Task 2: Practitioner phone-index backfill + invite write-path

**Files:**
- Create: `apps/hub-api/scripts/backfill-practitioner-phone-index.ts`
- Modify: `apps/hub-api/src/trpc/routers/admin.ts` (practitioner invite)
- Test: `apps/hub-api/src/__tests__/backfill-practitioner-phone-index.test.ts`

- [ ] **Step 1: Write the failing unit test for the per-row transform**

Create `apps/hub-api/src/__tests__/backfill-practitioner-phone-index.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@ultranos/crypto/server', () => ({
  decryptField: (c: string) => c.replace('enc:', ''),
  generateBlindIndex: (v: string) => `idx:${v}`,
}))
import { computePhoneIndex } from '../../scripts/backfill-practitioner-phone-index'

describe('computePhoneIndex', () => {
  it('decrypts the stored phone then blind-indexes it', () => {
    expect(computePhoneIndex('enc:+93700000000', 'k', 'h')).toBe('idx:+93700000000')
  })
  it('returns null for empty/missing phone', () => {
    expect(computePhoneIndex('', 'k', 'h')).toBeNull()
    expect(computePhoneIndex(null, 'k', 'h')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/backfill-practitioner-phone-index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill script (with a unit-testable transform)**

Create `apps/hub-api/scripts/backfill-practitioner-phone-index.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/backfill-practitioner-phone-index.test.ts`
Expected: PASS (2 tests). (Confirm `decryptField` is exported from `@ultranos/crypto/server`; it mirrors `encryptField`. If the export name differs, adjust the import and the test mock to match.)

- [ ] **Step 5: Update the admin invite to write the index**

In `apps/hub-api/src/trpc/routers/admin.ts`, where the practitioner row is built with `telecom_phone: encryptedPhone`, also compute and set the index. Near the encryption block add `const { hmacKey } = getFieldEncryptionKeys()` (import if not present) and in the inserted row add:
```ts
        telecom_phone_index: generateBlindIndex(input.phone, hmacKey),
```
(Ensure `generateBlindIndex` and `getFieldEncryptionKeys` are imported in `admin.ts`.)

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @ultranos/hub-api typecheck 2>&1 | grep -E "admin.ts|backfill" | head`
Expected: empty (no new errors from these files).

- [ ] **Step 7: Run the backfill (controller, once, with env keys)**

Run the script against the project (controller executes with the service-role + field-encryption env vars set). Expected log: `[BACKFILL] ... complete: updated=<n> skipped=<m>`. (If env keys aren't available in this environment, defer the actual run and note it; the column + write-path still ship.)

- [ ] **Step 8: Commit**
```bash
git add apps/hub-api/scripts/backfill-practitioner-phone-index.ts apps/hub-api/src/__tests__/backfill-practitioner-phone-index.test.ts apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): practitioner phone blind index + backfill"
```

---

## Task 3: `discover` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient-registration.ts`
- Test: `apps/hub-api/src/__tests__/account-discovery.test.ts`

- [ ] **Step 1: Write the failing test (discover cases)**

Create `apps/hub-api/src/__tests__/account-discovery.test.ts` with the Hub harness pattern (mock `@/lib/supabase` `db` passthrough + `getSupabaseClient`, mock `@ultranos/crypto/server` `generateBlindIndex`, mock `@/lib/field-encryption` keys, mock `@ultranos/audit-logger`). Build a caller via `createCallerFactory(appRouter)` with an authenticated context (`user: { sub: 'auth-1', role: 'PATIENT', ... }`). Cover:
```ts
// staff match: practitioners blind-index hit -> { matchType: 'staff' }
// patient match: patients exact-phone hit, auth_user_id null -> { matchType: 'patient', candidate: { ref, maskedName, birthYear } }
// claimed-by-other -> { matchType: 'none' }
// no hit -> { matchType: 'none' }
```
(Model the supabase mock so `from('practitioners').select().eq('telecom_phone_index', …).maybeSingle()` and `from('patients').select().eq('telecom_phone', …).maybeSingle()` return the staged rows; assert the returned `matchType`/candidate. Use `generateBlindIndex` mock returning a deterministic string; `decryptField` mock returning a known name for masking.)

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts`
Expected: FAIL — `discover` not defined.

- [ ] **Step 3: Implement `discover` in `patient-registration.ts`**

Add (within the `patientRegistrationRouter`), importing `protectedProcedure` from `../init`, `generateBlindIndex`/`decryptField` from `@ultranos/crypto/server`, `getFieldEncryptionKeys` from `@/lib/field-encryption`, `AuditLogger` (already imported):
```ts
  discover: protectedProcedure
    .input(z.object({ phone: z.string().min(7).max(20).regex(/^\+\d+$/) }))
    .mutation(async ({ ctx, input }) => {
      const { encryptionKey, hmacKey } = getFieldEncryptionKeys()
      const audit = new AuditLogger(ctx.supabase)

      // Staff check (blind index over encrypted practitioner phone)
      const phoneIdx = generateBlindIndex(input.phone, hmacKey)
      const { data: staff } = await ctx.supabase
        .from('practitioners').select('id').eq('telecom_phone_index', phoneIdx).maybeSingle()
      if (staff) {
        await audit.emit({ action: 'READ', resourceType: 'PRACTITIONER', resourceId: String((staff as { id: string }).id), actorId: ctx.user.sub, actorRole: 'PATIENT', outcome: 'SUCCESS', sessionId: `discover:${ctx.user.sub}`, metadata: { operation: 'discover', matchType: 'staff' } }).catch(() => {})
        return { matchType: 'staff' as const }
      }

      // Patient check (plaintext unique phone)
      const { data: patient } = await ctx.supabase
        .from('patients').select('id, name_local, birth_date, birth_year, auth_user_id').eq('telecom_phone', input.phone).maybeSingle()
      const p = patient as { id: string; name_local: string | null; birth_date: string | null; birth_year: number | null; auth_user_id: string | null } | null
      if (p && (p.auth_user_id == null || p.auth_user_id === ctx.user.sub)) {
        const ref = generateBlindIndex(p.id, hmacKey)
        const given = p.name_local ? decryptField(p.name_local, encryptionKey) : ''
        const maskedName = given ? `${given.split(' ')[0]}` : ''
        const birthYear = p.birth_year ?? (p.birth_date ? Number(p.birth_date.slice(0, 4)) : null)
        await audit.emit({ action: 'READ', resourceType: 'PATIENT', resourceId: p.id, actorId: ctx.user.sub, actorRole: 'PATIENT', outcome: 'SUCCESS', sessionId: `discover:${ctx.user.sub}`, metadata: { operation: 'discover', matchType: 'patient' } }).catch(() => {})
        return { matchType: 'patient' as const, candidate: { ref, maskedName, birthYear } }
      }
      if (p && p.auth_user_id && p.auth_user_id !== ctx.user.sub) {
        await audit.emit({ action: 'SECURITY_VIOLATION', resourceType: 'PATIENT', resourceId: p.id, actorId: ctx.user.sub, actorRole: 'PATIENT', outcome: 'DENIED', denialReason: 'phone record claimed by another user', sessionId: `discover:${ctx.user.sub}`, metadata: { operation: 'discover' } }).catch(() => {})
      }
      return { matchType: 'none' as const }
    }),
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts`
Expected: PASS (discover cases).

- [ ] **Step 5: Commit**
```bash
git add apps/hub-api/src/trpc/routers/patient-registration.ts apps/hub-api/src/__tests__/account-discovery.test.ts
git commit -m "feat(hub-api): patientRegistration.discover (post-OTP phone match)"
```

---

## Task 4: `claim` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient-registration.ts`
- Test: `apps/hub-api/src/__tests__/account-discovery.test.ts` (extend)

- [ ] **Step 1: Add failing claim tests**

Extend the test file: claim with a `ref` that re-resolves to the caller's phone-matched patient + matching `birthYear` → sets `auth_user_id` (assert the `patients` update call) + audits SUCCESS; mismatched `birthYear` → throws `FORBIDDEN` + audits DENIED; patient already linked to a different user → throws.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts`
Expected: FAIL — `claim` not defined.

- [ ] **Step 3: Implement `claim`**

Add to the router:
```ts
  claim: protectedProcedure
    .input(z.object({ ref: z.string().length(64), phone: z.string().min(7).max(20).regex(/^\+\d+$/), birthYear: z.number().int().gte(1900).lte(2100) }))
    .mutation(async ({ ctx, input }) => {
      const { hmacKey } = getFieldEncryptionKeys()
      const audit = new AuditLogger(ctx.supabase)
      const { data: patient } = await ctx.supabase
        .from('patients').select('id, birth_date, birth_year, auth_user_id').eq('telecom_phone', input.phone).maybeSingle()
      const p = patient as { id: string; birth_date: string | null; birth_year: number | null; auth_user_id: string | null } | null
      // ref must re-derive from the caller's own phone-matched patient (prevents arbitrary-id claims)
      if (!p || generateBlindIndex(p.id, hmacKey) !== input.ref) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No matching record.' })
      }
      if (p.auth_user_id && p.auth_user_id !== ctx.user.sub) {
        await audit.emit({ action: 'SECURITY_VIOLATION', resourceType: 'PATIENT', resourceId: p.id, actorId: ctx.user.sub, actorRole: 'PATIENT', outcome: 'DENIED', denialReason: 'already claimed', sessionId: `claim:${ctx.user.sub}`, metadata: { operation: 'claim' } }).catch(() => {})
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This record cannot be claimed.' })
      }
      const recordYear = p.birth_year ?? (p.birth_date ? Number(p.birth_date.slice(0, 4)) : null)
      if (recordYear !== input.birthYear) {
        await audit.emit({ action: 'UPDATE', resourceType: 'PATIENT', resourceId: p.id, actorId: ctx.user.sub, actorRole: 'PATIENT', outcome: 'DENIED', denialReason: 'birth year mismatch', sessionId: `claim:${ctx.user.sub}`, metadata: { operation: 'claim' } }).catch(() => {})
        throw new TRPCError({ code: 'FORBIDDEN', message: 'The details did not match.' })
      }
      const { error } = await ctx.supabase.from('patients').update({ auth_user_id: ctx.user.sub }).eq('id', p.id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not link your account.' })
      try { await ctx.supabase.auth.admin.updateUserById(ctx.user.sub, { user_metadata: { role: 'PATIENT', patient_id: p.id } }) } catch { /* non-fatal: link row is set */ }
      await audit.emit({ action: 'UPDATE', resourceType: 'PATIENT', resourceId: p.id, actorId: ctx.user.sub, actorRole: 'PATIENT', outcome: 'SUCCESS', sessionId: `claim:${ctx.user.sub}`, metadata: { operation: 'claim' } }).catch(() => {})
      return { ok: true as const }
    }),
```
(The app passes `phone` too so the server re-resolves the match; `ref` is the integrity check.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/hub-api/src/trpc/routers/patient-registration.ts apps/hub-api/src/__tests__/account-discovery.test.ts
git commit -m "feat(hub-api): patientRegistration.claim (birth-year gated auth link)"
```

---

## Task 5: `registerFromSession` endpoint

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/patient-registration.ts`
- Test: `apps/hub-api/src/__tests__/account-discovery.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

Extend: `registerFromSession` with MPI `ALLOW` → creates a patient (assert `create_patient_with_consent` RPC called with `auth_user_id` set) + audit; `WARN` → creates with `mpi_warn: true`; `BLOCK` → returns `{ blocked: true }` without creating.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts`
Expected: FAIL — `registerFromSession` not defined.

- [ ] **Step 3: Implement `registerFromSession`**

Mirror the existing `register` mutation body **minus the OTP verify**, sourcing `userId` from `ctx.user.sub`, and adding `auth_user_id`, address, and `photo_url` columns to the patient row. Reuse `encryptField`, `db.toRow`, `fetchMpiCandidates`/`computeMpiResult`, the `create_patient_with_consent` RPC, the `auth.admin.updateUserById` link, and the `AuditLogger` retry pattern. Input:
```ts
  registerFromSession: protectedProcedure
    .input(z.object({
      firstName: z.string().min(1).max(200).transform((s) => s.trim()),
      nameFather: z.string().min(1).max(200).transform((s) => s.trim()).optional(),
      gender: z.enum(['male','female','other','unknown']).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidCalendarDate, 'invalid date'),
      preferredLanguage: z.enum(SUPPORTED_LOCALES),
      addressProvinceCurrent: z.string().max(100).optional(),
      addressDistrictCurrent: z.string().max(100).optional(),
      addressVillageCurrent: z.string().max(200).optional(),
      photoUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const encKey = process.env.FIELD_ENCRYPTION_KEY
      if (!encKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Registration failed.' })
      const userId = ctx.user.sub
      const birthYear = Number(input.dateOfBirth.split('-')[0])
      const mpiCandidates = await fetchMpiCandidates(ctx.supabase, { nameGiven: input.firstName, nameFather: input.nameFather, birthYear })
      const mpiResult = computeMpiResult(mpiCandidates, { nameGiven: input.firstName, nameFather: input.nameFather, birthYear, gender: input.gender })
      if (mpiResult.decision === 'BLOCK') return { blocked: true as const }
      const mpiWarn = mpiResult.decision === 'WARN'
      const now = new Date().toISOString()
      const patientId = crypto.randomUUID()
      const patientRow = db.toRow({
        id: patientId,
        nameLocal: input.firstName,
        nameLocalEnc: encryptField(input.firstName, encKey),
        nameFather: input.nameFather ?? null,
        gender: input.gender ?? null,
        birthDate: input.dateOfBirth,
        birthDateEnc: encryptField(input.dateOfBirth, encKey),
        birthYearOnly: false,
        isActive: true,
        patientTier: 'FREE',
        preferredLanguage: input.preferredLanguage,
        mpi_warn: mpiWarn,
        authUserId: userId,
        photoUrl: input.photoUrl ?? null,
        addressProvinceCurrent: input.addressProvinceCurrent ?? null,
        addressDistrictCurrent: input.addressDistrictCurrent ?? null,
        addressVillageCurrent: input.addressVillageCurrent ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const consentRow = { consent_method: 'SELF_REGISTERED' as const, grantor_id: userId, grantor_role: 'PATIENT' as const }
      const { data: rpcData, error: rpcError } = await ctx.supabase.rpc('create_patient_with_consent', { p_patient: patientRow, p_consent: consentRow })
      if (rpcError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Registration failed.' })
      const createdPatientId: string = (rpcData as Record<string, string>)?.['patientId'] ?? patientId
      try { await ctx.supabase.auth.admin.updateUserById(userId, { user_metadata: { role: 'PATIENT', patient_id: createdPatientId, preferred_language: input.preferredLanguage } }) } catch { /* link row already set */ }
      const audit = new AuditLogger(ctx.supabase)
      const auditEvent = { action: 'CREATE' as const, resourceType: 'PATIENT' as const, resourceId: createdPatientId, actorId: userId, actorRole: 'PATIENT' as const, outcome: 'SUCCESS' as const, sessionId: `self-reg:${createdPatientId}`, metadata: { operation: 'self-registration' } }
      try { await audit.emit(auditEvent) } catch { try { await audit.emit(auditEvent) } catch { console.error('[AUDIT_FAILURE] dropped', { resourceId: createdPatientId }) } }
      const { hmacKey } = getFieldEncryptionKeys()
      return { patientId: generateBlindIndex(createdPatientId, hmacKey) }
    }),
```
NOTE: confirm the exact `db.toRow` camel→snake mapping for `authUserId`→`auth_user_id`, `photoUrl`→`photo_url`, and the `address_*_current` columns by reading the existing `register` row mapping; if `db.toRow` doesn't map a key, pass the snake_case column directly. Confirm `create_patient_with_consent` accepts these added columns (it inserts the full row) — if the RPC has a fixed column list, instead insert via `db` then the consent separately, mirroring whatever `register` does.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/hub-api/src/trpc/routers/patient-registration.ts apps/hub-api/src/__tests__/account-discovery.test.ts
git commit -m "feat(hub-api): patientRegistration.registerFromSession (linked self-register)"
```

---

## Task 6: App account API client

**Files:**
- Create: `apps/pharmopedia/src/api/account.ts`
- Test: `apps/pharmopedia/src/__tests__/account-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/account-api.test.ts` mirroring `drug-catalog-api.test.ts`'s hubFetch-mock pattern: assert `discoverAccount`/`claimAccount`/`registerFromSession` hit the right tRPC paths with the right body and parse `{ result: { data: { json } } }`. (Read `src/api/drug-catalog.ts` for the exact `hubFetch` envelope + `authHeaders` helper to mirror.)

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/account-api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `account.ts`**

Create `apps/pharmopedia/src/api/account.ts` following `drug-catalog.ts`'s structure (same `BASE_URL`, `hubFetch`, `authHeaders`, tRPC envelope). Export:
```ts
export async function discoverAccount(token: string, input: { phone: string }): Promise<{ matchType: 'none'|'patient'|'staff'; candidate?: { ref: string; maskedName: string; birthYear: number | null } }>
export async function claimAccount(token: string, input: { ref: string; phone: string; birthYear: number }): Promise<{ ok: true }>
export async function registerFromSession(token: string, input: { firstName: string; nameFather?: string; gender?: string; dateOfBirth: string; preferredLanguage: string; addressProvinceCurrent?: string; addressDistrictCurrent?: string; addressVillageCurrent?: string; photoUrl?: string }): Promise<{ patientId?: string; blocked?: boolean }>
```
Each is a POST mutation (`drugCatalog`-style body `{"json": input}` to `patientRegistration.discover|claim|registerFromSession`) through `hubFetch` with `authHeaders(token)`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/account-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmopedia/src/api/account.ts apps/pharmopedia/src/__tests__/account-api.test.ts
git commit -m "feat(pharmopedia): account discovery/claim API client"
```

---

## Task 7: Wizard post-OTP discovery branch + i18n

**Files:**
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts`
- Test: `apps/pharmopedia/src/__tests__/signup-wizard.test.tsx` (extend)

- [ ] **Step 1: Add i18n keys to the `signup` block (all 4 locales)**

Add (real translations per locale): `foundAccountTitle`, `foundAccountBody` (e.g. "We found a record for {{name}}"), `confirmBirthYear`, `birthYear`, `claim`, `claimMismatch` ("The details didn’t match — try again."), `staffMatchTitle`, `staffMatchBody`, `goToMemberLogin`, `dob` ("Date of birth"). Keep parity.

- [ ] **Step 2: Extend the wizard test**

In `signup-wizard.test.tsx` add mocks for `@/api/account` (`discoverAccount`/`claimAccount`/`registerFromSession` as `vi.hoisted` fns) and cases:
- discover → `staff`: after OTP, a `wizard-staff-signin` control appears; pressing it calls `supabase.auth.signOut` + `router.replace('/(auth)/login')`.
- discover → `patient`: after OTP, a claim panel appears; entering birth year + pressing `wizard-claim` calls `claimAccount` and routes to `/(tabs)`.
- discover → `none`: proceeds to the name step (existing flow), and finish calls `registerFromSession` (not just `updateUser`).
(Default the discover mock to `{ matchType: 'none' }` so the existing happy-path tests still pass; override per-test.)

- [ ] **Step 3: Run to verify fail**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/signup-wizard.test.tsx`
Expected: FAIL — new branch not implemented.

- [ ] **Step 4: Implement the branch in `register.tsx`**

After `handleVerifyOtp` succeeds, instead of going straight to `name`, call `discoverAccount(token, { phone })` and set a `discovery` state:
- `staff` → set step `'staff'` (render an info screen + a `wizard-staff-signin` button → `supabase.auth.signOut()` then `router.replace('/(auth)/login')`).
- `patient` → set step `'claim'` (render `foundAccountBody` with `candidate.maskedName`, a birth-year `TextInput` (`claim-birthyear-input`), and a `wizard-claim` Button → `claimAccount(token, { ref: candidate.ref, phone, birthYear })`; on success `router.replace('/(tabs)')`, on error show `claimMismatch`).
- `none` → set step `'name'` (existing flow). At finish, call `registerFromSession(token, { firstName: given, nameFather: family, dateOfBirth, preferredLanguage: lang, addressProvinceCurrent: province, addressDistrictCurrent: district, addressVillageCurrent: village, photoUrl })` **in addition to** the existing photo upload + `updateUser` (registerFromSession creates the linked patient; `updateUser` keeps `user_metadata` for the E4 fallback). Add a **DOB step** before photo for the no-match path (a date input producing `YYYY-MM-DD`); claim path collects birth year inline.
Keep `ORDER`/progress updated for the no-match path (`name → dob → photo → address`). The token comes from `useAuthStore((s) => s.token)`.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/signup-wizard.test.tsx`
Expected: PASS (existing + new branch tests).

- [ ] **Step 6: Commit**
```bash
git add "apps/pharmopedia/app/(auth)/register.tsx" apps/pharmopedia/src/i18n/locales apps/pharmopedia/src/__tests__/signup-wizard.test.tsx
git commit -m "feat(pharmopedia): post-OTP account discovery + claim in signup wizard"
```

---

## Task 8: Finalize — full suites + typechecks

- [ ] **Step 1: Hub suite**

Run: `pnpm -F @ultranos/hub-api exec vitest run src/__tests__/account-discovery.test.ts src/__tests__/backfill-practitioner-phone-index.test.ts 2>&1 | grep -E "Test Files|Tests "` (expect all pass). Then `pnpm -F @ultranos/hub-api typecheck` (expect no new errors in the touched files).

- [ ] **Step 2: App suite + typechecks**

Run: `pnpm --filter @ultranos/pharmopedia test 2>&1 | grep -E "Test Files|Tests |FAIL " | sort | uniq`
Expected: new account-api + wizard tests pass; the only failing suites remain the pre-existing `clinical-tab-extended` ×4 (E5). No NEW failures.
Run: `pnpm --filter @ultranos/ui-kit typecheck >/dev/null 2>&1 && echo UIKIT_PASS; pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -c "native/"` (expect `UIKIT_PASS` + `0`).

- [ ] **Step 3: Commit (if verification-driven fixes were needed)**
```bash
git add -A
git commit -m "chore: O3 account discovery + claim complete"
```

---

## Self-Review

**Spec coverage (O3 spec §3):** migrations §3.1 → Task 1; practitioner index + backfill + admin write §3.1 → Task 2; `discover` §3.2 → Task 3; `claim` §3.2 → Task 4; `registerFromSession` §3.2 → Task 5; app client §3.3 → Task 6; wizard branch + i18n §3.4/§3.5 → Task 7; testing §4 → Tasks 2–7 + finalize Task 8. ✓

**Placeholder scan:** code is complete; the three NOTE callouts (decryptField export name; `db.toRow` snake mapping for the added columns / `create_patient_with_consent` column contract; mirroring `drug-catalog.ts`'s hubFetch envelope) are explicit "read X and match" instructions with the fallback stated — not vague placeholders. They exist because the exact RPC column contract + helper export must be confirmed against the live code at implementation time; each task says exactly what to read and how to adapt.

**Type consistency:** `discover`→`{matchType, candidate:{ref,maskedName,birthYear}}` consistent across Task 3 (Hub), Task 6 (client), Task 7 (wizard); `claim({ref,phone,birthYear})` consistent (Tasks 4/6/7); `registerFromSession` input consistent (Tasks 5/6/7); `computeMpiResult().decision` ∈ `BLOCK|WARN|ALLOW` (matches mpi-engine); `AuditLogger.emit` event fields match the audit-event interface (action/resourceType/resourceId/actorId/actorRole/outcome/sessionId/metadata); `generateBlindIndex`/`getFieldEncryptionKeys` sync usage matches the lib.

**Carried caveats:** the practitioner backfill decrypts staff phones in-process (run server-side with keys, batched, count-only logging); the `create_patient_with_consent` column contract for the new `auth_user_id`/`photo_url`/address columns must be confirmed (Task 5 NOTE); real-device/premium validation in an Expo run.
