# Pharmopedia E4 — Profile Refactor + Hub `users.getProfile` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pharmopedia's thin profile tab with a Clinical-Calm read-only "full profile" fed by a new Hub `users.getProfile` endpoint, working offline via an encrypted on-device cache, with patient photos served through signed URLs.

**Architecture:** A new Hub `users` router exposes `getProfile` (protectedProcedure) that branches on `ctx.user.role` to read the caller's own `patients` or `practitioners` row by `auth_user_id`, decrypts PHI explicitly via `decryptField`, signs the photo path, and audits with opaque ids. The app gets a tRPC client (`users.ts`), an AES-256-GCM encrypted cache (`secure-crypto.ts` + `profile_cache` SQLite table), a `useProfile` hook (cache-first then network), and a refactored profile screen built from `@ultranos/ui-kit/native` primitives.

**Tech Stack:** Next.js tRPC + Supabase (Hub); Expo / React Native + expo-sqlite + expo-secure-store + `@noble/ciphers` + `expo-crypto` (app); Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-pharmopedia-e4-profile-refactor-design.md`

---

## File Structure

**Hub (`apps/hub-api/`):**
- Create `src/trpc/routers/users.ts` — `usersRouter` with `getProfile`; `extractPhotoPath` + `ageFromBirth` helpers.
- Modify `src/trpc/routers/_app.ts` — register `users: usersRouter`.
- Create `src/__tests__/users-profile.test.ts` — endpoint tests.

**App (`apps/pharmopedia/`):**
- Create `src/api/users.ts` — `getProfile(token)` client + `UserProfile` type.
- Create `src/lib/secure-crypto.ts` — AES-256-GCM helpers, key in SecureStore.
- Create `src/lib/profile-cache.ts` — encrypt/write, read/decrypt, clear.
- Modify `src/db/schema.ts` — `SCHEMA_VERSION = 3` + `CREATE_PROFILE_CACHE_SQL`.
- Modify `src/db/migrations.ts` — v3 migration.
- Modify `src/store/auth-store.ts` — `logout` clears the profile cache.
- Create `src/hooks/useProfile.ts` — cache-first then network hook.
- Modify `app/(tabs)/profile.tsx` — Clinical-Calm full profile.
- Modify `src/lib/profile-photo.ts` — store object path, not public URL.
- Modify `src/i18n/locales/{en,prs,ps,ar}.ts` — `profile.*` keys.
- Tests under `src/__tests__/`: `users-api.test.ts`, `secure-crypto.test.ts`, `profile-cache.test.ts`, `use-profile.test.ts`, `profile-screen.test.tsx`, `profile-rtl.test.tsx`, `profile-photo.test.ts` (extend).
- Extend `src/__mocks__/expo-secure-store.js` if needed; add `src/__mocks__/expo-crypto.js`.

**Shared `UserProfile` type:** defined in `apps/pharmopedia/src/api/users.ts` (the app owns its view type); the Hub constructs a matching shape (typed locally), mirroring how `account.ts` owns its result types.

```ts
export type UserProfile =
  | {
      kind: 'patient'
      displayName: string
      givenName: string
      photoUrl?: string
      phone?: string
      gender?: string
      birthDate?: string
      age?: number
      bloodGroup?: string
      currentAddress?: { province?: string; district?: string; village?: string }
      preferredLanguage?: string
      tier: 'FREE' | 'PREMIUM'
    }
  | {
      kind: 'practitioner'
      displayName: string
      givenName: string
      familyName: string
      role: string
      email?: string
      phone?: string
      organization?: string
      facility?: string
      qualificationDisplay?: string
      licenseId?: string
      licenseExpiry?: string
      status: string
    }
```

**Test commands:** Hub — `pnpm -F hub-api exec vitest run <path>`. App — `pnpm --filter @ultranos/pharmopedia exec vitest run <path>`.

---

## Task 1: Hub `users.getProfile` endpoint

**Files:**
- Create: `apps/hub-api/src/trpc/routers/users.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts`
- Test: `apps/hub-api/src/__tests__/users-profile.test.ts`

**Contracts to honor (verified):**
- `createTRPCRouter, protectedProcedure` from `../init`; `ctx.user = { sub, role, sessionId, orgId, facilityId, status }`.
- `db` from `@/lib/supabase`; `decryptField` from `@ultranos/crypto/server`; `getFieldEncryptionKeys` from `@/lib/field-encryption` (returns `{ encryptionKey, hmacKey }`).
- `AuditLogger` from `@ultranos/audit-logger`: `new AuditLogger(ctx.supabase).emit({ action, resourceType, resourceId, actorId, actorRole, outcome, sessionId, metadata })`.
- Patient encrypted columns: `name_local_enc`, `name_given_enc`, `name_family_enc`, `birth_date_enc` (decrypt with `encryptionKey`); plaintext fallbacks: `name_local`, `name_given`, `name_family`, `birth_date`.
- **Practitioner `telecom_phone` is encrypted in-column** (O3 backfill decrypts it) → decrypt with `decryptField(row.telecom_phone, encryptionKey)`. Other practitioner columns are plaintext.
- Storage: `ctx.supabase.storage.from('profile-photos').createSignedUrl(path, 3600)` → `data.signedUrl`.
- Org name: `ctx.supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()`.

> **Verify at implementation:** (1) the practitioners insert in `admin.ts` (`enrollChw`) encrypts `telecom_phone` — confirms decrypt-on-read is correct; if a `telecom_phone_enc` column is used instead, adapt. (2) Whether a `facilities` table with a `name` column exists; if not, return `facility_id` as the `facility` value.

- [ ] **Step 1: Write the failing test**

Create `apps/hub-api/src/__tests__/users-profile.test.ts`. Mirror the harness in `src/__tests__/account-discovery.test.ts` (mock `@/lib/supabase` with `db` identity passthrough + a chainable query-builder; mock `@ultranos/crypto/server`, `@/lib/field-encryption`, `@ultranos/audit-logger`; build a caller via `createCallerFactory(appRouter)` with an authenticated `ctx`). Add a `storage.from().createSignedUrl` mock.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDecrypt, mockEmit, mockCreateSignedUrl, mockQuery } = vi.hoisted(() => ({
  mockDecrypt: vi.fn((v: string) => (v?.startsWith('enc:') ? v.slice(4) : v)),
  mockEmit: vi.fn().mockResolvedValue(undefined),
  mockCreateSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/u.jpg' }, error: null }),
  mockQuery: vi.fn(),
}))

vi.mock('@ultranos/crypto/server', () => ({ decryptField: mockDecrypt, generateBlindIndex: vi.fn() }))
vi.mock('@/lib/field-encryption', () => ({ getFieldEncryptionKeys: () => ({ encryptionKey: 'k', hmacKey: 'h' }) }))
vi.mock('@ultranos/audit-logger', () => ({ AuditLogger: class { emit = mockEmit } }))
vi.mock('@/lib/supabase', () => ({
  db: { fromRow: (r: unknown) => r, toRow: (r: unknown) => r },
  getSupabaseClient: vi.fn(),
}))

import { appRouter } from '../trpc/routers/_app'
import { createCallerFactory } from '../trpc/init'

// A chainable supabase stub: each .from() returns an object whose terminal
// .maybeSingle() resolves to the queued result for that table.
function makeSupabase(tableResults: Record<string, unknown>) {
  const storage = { from: () => ({ createSignedUrl: mockCreateSignedUrl }) }
  const from = (table: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) chain[m] = () => chain
    chain.maybeSingle = async () => ({ data: tableResults[table] ?? null, error: null })
    return chain
  }
  return { from, storage } as unknown
}

function caller(role: string, supabase: unknown) {
  const createCaller = createCallerFactory(appRouter)
  return createCaller({
    supabase,
    user: { sub: 'auth-1', role, sessionId: 'sess-1', orgId: null, facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  } as never)
}

describe('users.getProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); mockDecrypt.mockImplementation((v: string) => (v?.startsWith('enc:') ? v.slice(4) : v)) })

  it('patient: decrypts name/dob, signs photo, audits PHI_READ', async () => {
    const supabase = makeSupabase({
      patients: {
        id: 'pat-1', name_local_enc: 'enc:Sara Ahmadi', name_given_enc: 'enc:Sara',
        gender: 'female', birth_date_enc: 'enc:1990-05-15', birth_year: 1990,
        telecom_phone: '+93700000000', blood_group: 'O+', photo_url: 'u1/avatar.jpg',
        preferred_language: 'prs', patient_tier: 'PREMIUM',
        address_province_current: 'Kabul', address_district_current: 'Kabul', address_village_current: null,
      },
    })
    const res = await caller('PATIENT', supabase).users.getProfile()
    expect(res.kind).toBe('patient')
    if (res.kind !== 'patient') throw new Error('kind')
    expect(res.displayName).toBe('Sara Ahmadi')
    expect(res.phone).toBe('+93700000000')
    expect(res.tier).toBe('PREMIUM')
    expect(res.photoUrl).toBe('https://signed/u.jpg')
    expect(res.currentAddress?.province).toBe('Kabul')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u1/avatar.jpg', 3600)
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'PHI_READ', resourceType: 'PATIENT', resourceId: 'pat-1', actorId: 'auth-1', outcome: 'SUCCESS' }))
    const meta = mockEmit.mock.calls[0][0].metadata
    expect(JSON.stringify(meta)).not.toContain('Sara')
  })

  it('practitioner: decrypts phone, resolves org name, audits READ', async () => {
    const supabase = makeSupabase({
      practitioners: {
        id: 'prac-1', given_name: 'Ahmad', family_name: 'Khan', telecom_email: 'a@x.io',
        telecom_phone: 'enc:+93701112222', role: 'DOCTOR', status: 'ACTIVE',
        org_id: 'org-1', facility_id: null, qualification_display: 'MD', identifier_value: 'LIC-9', license_expiry: '2030-01-01',
      },
      organizations: { name: 'Kabul Clinic' },
    })
    const res = await caller('DOCTOR', supabase).users.getProfile()
    if (res.kind !== 'practitioner') throw new Error('kind')
    expect(res.displayName).toBe('Ahmad Khan')
    expect(res.phone).toBe('+93701112222')
    expect(res.organization).toBe('Kabul Clinic')
    expect(res.licenseId).toBe('LIC-9')
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'READ', resourceType: 'PRACTITIONER', resourceId: 'prac-1' }))
  })

  it('no record: returns minimal shell, does not throw, still audits', async () => {
    const res = await caller('PATIENT', makeSupabase({})).users.getProfile()
    expect(res).toEqual({ kind: 'patient', displayName: '', givenName: '', tier: 'FREE' })
    expect(mockEmit).toHaveBeenCalled()
  })

  it('patient photo: legacy public URL is path-extracted before signing', async () => {
    const supabase = makeSupabase({
      patients: { id: 'pat-2', name_local: 'X', photo_url: 'https://h/storage/v1/object/public/profile-photos/u2/avatar.png', patient_tier: 'FREE' },
    })
    await caller('PATIENT', supabase).users.getProfile()
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u2/avatar.png', 3600)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F hub-api exec vitest run src/__tests__/users-profile.test.ts`
Expected: FAIL — `users` is not a property of the router / cannot read `getProfile`.

- [ ] **Step 3: Implement `users.ts`**

Create `apps/hub-api/src/trpc/routers/users.ts`:

```ts
import { createTRPCRouter, protectedProcedure } from '../init'
import { AuditLogger } from '@ultranos/audit-logger'
import { decryptField } from '@ultranos/crypto/server'
import { getFieldEncryptionKeys } from '@/lib/field-encryption'

const PHOTO_BUCKET = 'profile-photos'
const SIGNED_URL_TTL = 3600

/** Resolve a storage object path from a stored value that may be a bare path or a legacy public URL. */
export function extractPhotoPath(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.includes('://')) return stored.replace(/^\/+/, '')
  const marker = `/object/public/${PHOTO_BUCKET}/`
  const idx = stored.indexOf(marker)
  return idx >= 0 ? stored.slice(idx + marker.length) : null
}

/** Compute age in whole years from a birth date (ISO) or a birth year. Server wall-clock is fine here. */
export function ageFromBirth(birthDate?: string | null, birthYear?: number | null): number | undefined {
  let year = birthYear ?? null
  if (!year && birthDate && birthDate.length >= 4) year = Number(birthDate.slice(0, 4))
  if (!year || Number.isNaN(year)) return undefined
  const age = new Date().getFullYear() - year
  return age >= 0 && age < 150 ? age : undefined
}

async function emitProfileAudit(
  audit: AuditLogger,
  ctx: { user: { sub: string; role: string; sessionId: string } },
  action: 'PHI_READ' | 'READ',
  resourceType: 'PATIENT' | 'PRACTITIONER',
  resourceId: string,
): Promise<void> {
  try {
    await audit.emit({
      action,
      resourceType,
      resourceId,
      actorId: ctx.user.sub,
      actorRole: ctx.user.role,
      outcome: 'SUCCESS',
      sessionId: ctx.user.sessionId,
      metadata: { operation: 'getProfile' },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action, resourceType })
  }
}

export const usersRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const audit = new AuditLogger(ctx.supabase)
    const { encryptionKey } = getFieldEncryptionKeys()
    const dec = (v: unknown): string | undefined =>
      typeof v === 'string' && v.length > 0 ? decryptField(v, encryptionKey) : undefined

    if (ctx.user.role === 'PATIENT') {
      const { data } = await ctx.supabase
        .from('patients')
        .select(
          'id, name_local, name_local_enc, name_given, name_given_enc, name_family, name_family_enc, ' +
            'gender, birth_date, birth_date_enc, birth_year, telecom_phone, blood_group, photo_url, ' +
            'preferred_language, patient_tier, address_province_current, address_district_current, address_village_current',
        )
        .eq('auth_user_id', ctx.user.sub)
        .maybeSingle()

      if (!data) {
        await emitProfileAudit(audit, ctx, 'PHI_READ', 'PATIENT', ctx.user.sub)
        return { kind: 'patient', displayName: '', givenName: '', tier: 'FREE' } as const
      }
      const row = data as Record<string, unknown>
      const nameLocal = dec(row.name_local_enc) ?? (row.name_local as string) ?? ''
      const givenName = dec(row.name_given_enc) ?? (row.name_given as string) ?? ''
      const familyName = dec(row.name_family_enc) ?? (row.name_family as string) ?? ''
      const birthDate = dec(row.birth_date_enc) ?? (row.birth_date as string | null) ?? null
      const displayName = nameLocal || [givenName, familyName].filter(Boolean).join(' ')

      let photoUrl: string | undefined
      const path = extractPhotoPath(row.photo_url as string | null)
      if (path) {
        const { data: signed } = await ctx.supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
        if (signed?.signedUrl) photoUrl = signed.signedUrl
      }

      await emitProfileAudit(audit, ctx, 'PHI_READ', 'PATIENT', row.id as string)
      return {
        kind: 'patient',
        displayName,
        givenName: givenName.split(' ')[0] ?? givenName,
        photoUrl,
        phone: (row.telecom_phone as string) ?? undefined,
        gender: (row.gender as string) ?? undefined,
        birthDate: birthDate ?? undefined,
        age: ageFromBirth(birthDate, row.birth_year as number | null),
        bloodGroup: (row.blood_group as string) ?? undefined,
        currentAddress: {
          province: (row.address_province_current as string) ?? undefined,
          district: (row.address_district_current as string) ?? undefined,
          village: (row.address_village_current as string) ?? undefined,
        },
        preferredLanguage: (row.preferred_language as string) ?? undefined,
        tier: (row.patient_tier as string) === 'PREMIUM' ? 'PREMIUM' : 'FREE',
      } as const
    }

    // Practitioner branch
    const { data } = await ctx.supabase
      .from('practitioners')
      .select(
        'id, given_name, family_name, telecom_email, telecom_phone, role, status, ' +
          'org_id, facility_id, qualification_display, identifier_value, license_expiry',
      )
      .eq('auth_user_id', ctx.user.sub)
      .maybeSingle()

    if (!data) {
      await emitProfileAudit(audit, ctx, 'READ', 'PRACTITIONER', ctx.user.sub)
      return {
        kind: 'practitioner',
        displayName: '',
        givenName: '',
        familyName: '',
        role: ctx.user.role,
        status: ctx.user.status ?? 'ACTIVE',
      } as const
    }
    const row = data as Record<string, unknown>
    const given = (row.given_name as string) ?? ''
    const family = (row.family_name as string) ?? ''

    let organization: string | undefined
    if (row.org_id) {
      const { data: org } = await ctx.supabase.from('organizations').select('name').eq('id', row.org_id).maybeSingle()
      organization = ((org as { name?: string } | null)?.name) ?? undefined
    }
    let facility: string | undefined
    if (row.facility_id) {
      // Verify a facilities.name lookup exists; otherwise return the id.
      const { data: fac } = await ctx.supabase.from('facilities').select('name').eq('id', row.facility_id).maybeSingle()
      facility = ((fac as { name?: string } | null)?.name) ?? (row.facility_id as string)
    }

    await emitProfileAudit(audit, ctx, 'READ', 'PRACTITIONER', row.id as string)
    return {
      kind: 'practitioner',
      displayName: [given, family].filter(Boolean).join(' '),
      givenName: given,
      familyName: family,
      role: (row.role as string) ?? ctx.user.role,
      email: (row.telecom_email as string) ?? undefined,
      phone: dec(row.telecom_phone),
      organization,
      facility,
      qualificationDisplay: (row.qualification_display as string) ?? undefined,
      licenseId: (row.identifier_value as string) ?? undefined,
      licenseExpiry: (row.license_expiry as string) ?? undefined,
      status: (row.status as string) ?? ctx.user.status ?? 'ACTIVE',
    } as const
  }),
})
```

- [ ] **Step 4: Register the router**

In `apps/hub-api/src/trpc/routers/_app.ts`: add `import { usersRouter } from './users'` with the other imports, and add `users: usersRouter,` to the `createTRPCRouter({...})` map.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -F hub-api exec vitest run src/__tests__/users-profile.test.ts`
Expected: PASS (4 tests). If `createCallerFactory` import path differs, copy the exact import used by `account-discovery.test.ts`.

- [ ] **Step 6: Typecheck**

Run: `pnpm -F hub-api typecheck 2>&1 | grep "routers/users"`
Expected: no new errors (pre-existing `@ultranos/*` module-resolution errors may appear; those are baseline).

- [ ] **Step 7: Commit**

```bash
git add apps/hub-api/src/trpc/routers/users.ts apps/hub-api/src/trpc/routers/_app.ts apps/hub-api/src/__tests__/users-profile.test.ts
git commit -m "feat(hub): users.getProfile (patient + practitioner, signed photo, audited)"
```

> **Commit note:** Per project rule, do NOT commit autonomously — the controller commits only on explicit user instruction. Treat Step "Commit" blocks as staging checkpoints; the controller batches the E4 commit at the end.

---

## Task 2: Photo bucket privacy (O3-1)

**Files:**
- Supabase: make `profile-photos` bucket private (controller, via Supabase MCP).
- Modify: `apps/pharmopedia/src/lib/profile-photo.ts`
- Test: `apps/pharmopedia/src/__tests__/profile-photo.test.ts` (extend)

- [ ] **Step 1: Make the bucket private (controller, Supabase MCP)**

Set the `profile-photos` bucket `public = false` via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
update storage.buckets set public = false where id = 'profile-photos';
```
Confirm with:
```sql
select id, public from storage.buckets where id = 'profile-photos';
```
Expected: `public = false`. (If the bucket does not exist yet in this environment, note it and proceed — the upload path + signed-read still ship.)

- [ ] **Step 2: Write the failing test**

In `apps/pharmopedia/src/__tests__/profile-photo.test.ts`, add a case asserting `uploadProfilePhoto` returns the storage **object path** (e.g. `u1/avatar.jpg`), not a public URL:

```ts
it('returns the storage object path, not a public URL', async () => {
  const path = await uploadProfilePhoto('file:///x.jpg', 'u1')
  expect(path).toBe('u1/avatar.jpg')
  expect(path).not.toMatch(/^https?:\/\//)
})
```
(Match the existing mock setup in this file; the Supabase upload mock should resolve success and the test asserts the returned value is the path passed to `.upload(...)`.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-photo.test.ts`
Expected: FAIL — current code returns `getPublicUrl(...)`.

- [ ] **Step 4: Update `profile-photo.ts`**

Change the return so it stores/returns the object path instead of calling `getPublicUrl`. Keep the existing upload (`.upload(path, blob, { contentType, upsert: true })`) and the ext/contentType derivation from O2. Replace the trailing `getPublicUrl` block with `return path` (where `path = `${userId}/avatar.${ext}``). Remove the now-unused `getPublicUrl` call.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-photo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/lib/profile-photo.ts apps/pharmopedia/src/__tests__/profile-photo.test.ts
git commit -m "feat(pharmopedia): store profile photo object path; bucket now private"
```

---

## Task 3: App AES-256-GCM secure-crypto helper

**Files:**
- Create: `apps/pharmopedia/src/lib/secure-crypto.ts`
- Create: `apps/pharmopedia/src/__mocks__/expo-crypto.js`
- Test: `apps/pharmopedia/src/__tests__/secure-crypto.test.ts`
- Modify: `apps/pharmopedia/package.json` (add `@noble/ciphers`, `expo-crypto`)

**Dependency decision:** No native crypto lib exists and a native AES module would force a custom prebuild. Use **`@noble/ciphers`** (pure-JS, audited AES-256-GCM — runs in RN/Expo and node) + **`expo-crypto`** (CSPRNG via `getRandomBytes`). `@noble/ciphers` runs for real in vitest (no mock); only `expo-crypto` and `expo-secure-store` are mocked.

- [ ] **Step 1: Add dependencies**

Run: `pnpm --filter @ultranos/pharmopedia add @noble/ciphers expo-crypto`
Expected: both added to `apps/pharmopedia/package.json` dependencies.

- [ ] **Step 2: Add the expo-crypto mock**

Create `apps/pharmopedia/src/__mocks__/expo-crypto.js` (deterministic bytes for tests):
```javascript
let counter = 1
module.exports = {
  getRandomBytes: (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (counter + i) % 256; counter++; return a },
  getRandomBytesAsync: async (n) => module.exports.getRandomBytes(n),
}
```
Register it in `apps/pharmopedia/vitest.setup.ts` `STUB_MAP` alongside the others: `'expo-crypto': path.join(MOCKS_DIR, 'expo-crypto.js'),`.

- [ ] **Step 3: Write the failing test**

Create `apps/pharmopedia/src/__tests__/secure-crypto.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>()
  return { getItemAsync: async (k: string) => store.get(k) ?? null, setItemAsync: async (k: string, v: string) => { store.set(k, v) }, deleteItemAsync: async (k: string) => { store.delete(k) } }
})
vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 7 + 3) % 256; return a } }))

import { encryptJson, decryptJson, getOrCreateCacheKey } from '@/lib/secure-crypto'

describe('secure-crypto', () => {
  beforeEach(() => vi.clearAllMocks())
  it('round-trips an object through AES-256-GCM', async () => {
    const obj = { kind: 'patient', displayName: 'Sara', phone: '+93700000000' }
    const enc = await encryptJson(obj)
    expect(enc.ciphertext).toEqual(expect.any(String))
    expect(enc.iv).toEqual(expect.any(String))
    expect(enc.ciphertext).not.toContain('Sara')
    const back = await decryptJson<typeof obj>(enc)
    expect(back).toEqual(obj)
  })
  it('persists one key across calls', async () => {
    const k1 = await getOrCreateCacheKey()
    const k2 = await getOrCreateCacheKey()
    expect(k1).toBe(k2)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/secure-crypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `secure-crypto.ts`**

```ts
import * as SecureStore from 'expo-secure-store'
import { getRandomBytes } from 'expo-crypto'
import { gcm } from '@noble/ciphers/aes'
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils'

const KEY_NAME = 'pharmopedia.profileCacheKey.v1'
const KEY_BYTES = 32
const IV_BYTES = 12

/** Get the cache key from SecureStore, creating + persisting it on first use. Returns hex. */
export async function getOrCreateCacheKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME)
  if (existing) return existing
  const key = bytesToHex(getRandomBytes(KEY_BYTES))
  await SecureStore.setItemAsync(KEY_NAME, key)
  return key
}

export interface SealedBlob { ciphertext: string; iv: string }

export async function encryptJson(obj: unknown): Promise<SealedBlob> {
  const key = hexToBytes(await getOrCreateCacheKey())
  const iv = getRandomBytes(IV_BYTES)
  const plain = new TextEncoder().encode(JSON.stringify(obj))
  const ct = gcm(key, iv).encrypt(plain)
  return { ciphertext: bytesToHex(ct), iv: bytesToHex(iv) }
}

export async function decryptJson<T>(blob: SealedBlob): Promise<T> {
  const key = hexToBytes(await getOrCreateCacheKey())
  const pt = gcm(key, hexToBytes(blob.iv)).decrypt(hexToBytes(blob.ciphertext))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

/** Remove the cache key (used on logout/session-end). */
export async function clearCacheKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME)
}
```

> **Verify at implementation:** the `@noble/ciphers` import subpaths (`/aes`, `/utils`). If the installed version exports differently (e.g. `@noble/ciphers/aes.js` or named `randomBytes`), adapt imports — keep `gcm` AES-256-GCM and hex helpers. Do not switch away from `expo-crypto` for randomness.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/secure-crypto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/lib/secure-crypto.ts apps/pharmopedia/src/__mocks__/expo-crypto.js apps/pharmopedia/vitest.setup.ts apps/pharmopedia/package.json apps/pharmopedia/src/__tests__/secure-crypto.test.ts
git commit -m "feat(pharmopedia): AES-256-GCM secure-crypto (noble + expo-crypto + SecureStore key)"
```

---

## Task 4: Profile cache (SQLite table + read/write/clear + logout wipe)

**Files:**
- Modify: `apps/pharmopedia/src/db/schema.ts`
- Modify: `apps/pharmopedia/src/db/migrations.ts`
- Create: `apps/pharmopedia/src/lib/profile-cache.ts`
- Modify: `apps/pharmopedia/src/store/auth-store.ts`
- Test: `apps/pharmopedia/src/__tests__/profile-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/profile-cache.test.ts` using `better-sqlite3`-backed in-memory `expo-sqlite` (mirror how other `src/db` tests open a test db; reuse the existing test db helper if one exists, else `openDatabase(':memory:', testDb)`). Mock `secure-crypto` with a trivial reversible codec so the cache logic is tested independently of real crypto:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/secure-crypto', () => ({
  encryptJson: async (o: unknown) => ({ ciphertext: 'ct:' + JSON.stringify(o), iv: 'iv' }),
  decryptJson: async (b: { ciphertext: string }) => JSON.parse(b.ciphertext.replace(/^ct:/, '')),
  clearCacheKey: vi.fn(),
}))
import Database from 'better-sqlite3'
import { openDatabase } from '@/db/migrations'
import { writeProfileCache, readProfileCache, clearProfileCache } from '@/lib/profile-cache'

// Adapt the better-sqlite3 instance to the async expo-sqlite surface used by the code
// (runAsync/getFirstAsync/getAllAsync). Copy the adapter from an existing src/db test;
// if none exists, implement a thin wrapper here.

describe('profile-cache', () => {
  let db: any
  beforeEach(async () => { db = makeExpoSqliteAdapter(new Database(':memory:')); await openDatabase(':memory:', db) })
  it('writes then reads back the profile', async () => {
    const profile = { kind: 'patient', displayName: 'Sara', tier: 'FREE' }
    await writeProfileCache(db, 'auth-1', profile as never)
    expect(await readProfileCache(db, 'auth-1')).toEqual(profile)
  })
  it('returns null for a missing sub', async () => {
    expect(await readProfileCache(db, 'nope')).toBeNull()
  })
  it('clearProfileCache wipes all rows', async () => {
    await writeProfileCache(db, 'auth-1', { kind: 'patient', displayName: 'X', tier: 'FREE' } as never)
    await clearProfileCache(db)
    expect(await readProfileCache(db, 'auth-1')).toBeNull()
  })
})
```
> If a shared `makeExpoSqliteAdapter`/test-db helper already exists under `apps/pharmopedia/src/db/__tests__` or `src/__tests__`, import and use it instead of re-implementing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-cache.test.ts`
Expected: FAIL — `profile_cache` table missing / module not found.

- [ ] **Step 3: Add the schema**

In `apps/pharmopedia/src/db/schema.ts`: set `export const SCHEMA_VERSION = 3` and add:
```ts
export const CREATE_PROFILE_CACHE_SQL = `
  CREATE TABLE IF NOT EXISTS profile_cache (
    sub        TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    iv         TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`
```

- [ ] **Step 4: Add the migration**

In `apps/pharmopedia/src/db/migrations.ts`: import `CREATE_PROFILE_CACHE_SQL` from `./schema` and append after the v2 block:
```ts
if (currentVersion < 3) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(CREATE_PROFILE_CACHE_SQL)
  })
  await db.execAsync('PRAGMA user_version = 3')
}
```

- [ ] **Step 5: Implement `profile-cache.ts`**

```ts
import type * as SQLite from 'expo-sqlite'
import type { UserProfile } from '@/api/users'
import { encryptJson, decryptJson } from '@/lib/secure-crypto'

export async function writeProfileCache(db: SQLite.SQLiteDatabase, sub: string, profile: UserProfile): Promise<void> {
  const { ciphertext, iv } = await encryptJson(profile)
  await db.runAsync(
    `INSERT OR REPLACE INTO profile_cache (sub, ciphertext, iv, updated_at) VALUES (?, ?, ?, ?)`,
    [sub, ciphertext, iv, new Date().toISOString()],
  )
}

export async function readProfileCache(db: SQLite.SQLiteDatabase, sub: string): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<{ ciphertext: string; iv: string }>(
    `SELECT ciphertext, iv FROM profile_cache WHERE sub = ?`,
    [sub],
  )
  if (!row) return null
  try {
    return await decryptJson<UserProfile>({ ciphertext: row.ciphertext, iv: row.iv })
  } catch {
    return null
  }
}

export async function clearProfileCache(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync(`DELETE FROM profile_cache`)
}
```
> `new Date().toISOString()` is acceptable here — this is a local cache timestamp, not a sync/HLC event.

- [ ] **Step 6: Wipe on logout**

In `apps/pharmopedia/src/store/auth-store.ts` `logout`, add `clearProfileCache` + `clearCacheKey`:
```ts
import { clearProfileCache } from '@/lib/profile-cache'
import { clearCacheKey } from '@/lib/secure-crypto'
// ...
logout: async (db) => {
  set({ token: null, user: null, isAuthenticated: false })
  useSyncStore.getState().reset()
  useBookmarkStore.getState().reset()
  await clearCatalog(db)
  await clearBookmarks(db)
  await clearProfileCache(db)
  await clearCacheKey()
},
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-cache.test.ts`
Expected: PASS (3 tests). Then run the existing auth-store/logout tests if any: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__` for the auth/logout suites — expect no regression (a logout-test store mock may need `clearProfileCache` to not throw; the real fn no-ops on an empty table).

- [ ] **Step 8: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/db/schema.ts apps/pharmopedia/src/db/migrations.ts apps/pharmopedia/src/lib/profile-cache.ts apps/pharmopedia/src/store/auth-store.ts apps/pharmopedia/src/__tests__/profile-cache.test.ts
git commit -m "feat(pharmopedia): encrypted profile_cache (v3 migration) + logout wipe"
```

---

## Task 5: App `users.getProfile` API client

**Files:**
- Create: `apps/pharmopedia/src/api/users.ts`
- Test: `apps/pharmopedia/src/__tests__/users-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/users-api.test.ts`, mirroring `account-api.test.ts` (mock `@/lib/hub-fetch`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const { mockHubFetch } = vi.hoisted(() => ({ mockHubFetch: vi.fn() }))
vi.mock('@/lib/hub-fetch', () => ({ hubFetch: mockHubFetch }))
import { getProfile } from '@/api/users'

describe('users API client', () => {
  beforeEach(() => vi.clearAllMocks())
  it('GETs users.getProfile with auth header and unwraps the envelope', async () => {
    const profile = { kind: 'patient', displayName: 'Sara', givenName: 'Sara', tier: 'FREE' }
    mockHubFetch.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: profile } } }) })
    const res = await getProfile('tok')
    expect(res).toEqual(profile)
    const [url, opts] = mockHubFetch.mock.calls[0]
    expect(String(url)).toContain('users.getProfile')
    expect(opts.method).toBe('GET')
    expect(opts.headers.Authorization).toBe('Bearer tok')
  })
  it('throws on non-ok', async () => {
    mockHubFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(getProfile('tok')).rejects.toThrow(/users.getProfile/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/users-api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `users.ts`**

Mirror `drug-catalog.ts`'s helpers (`getHubApiUrl`, `makeUrl`, `authHeaders`, `trpcGet`). `getProfile` is an input-less query — pass `undefined` input so no `?input=` is appended (matches `makeUrl` behavior). Export the `UserProfile` type from the File Structure section above, then:
```ts
export function getProfile(token: string): Promise<UserProfile> {
  return trpcGet('users.getProfile', undefined as unknown as object, token)
}
```
> If the Hub rejects a missing `input` for an input-less query, send `{}`: `makeUrl('users.getProfile', {})`. Verify against a real call shape; default to `undefined` (no input param) first.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/users-api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/api/users.ts apps/pharmopedia/src/__tests__/users-api.test.ts
git commit -m "feat(pharmopedia): users.getProfile API client + UserProfile type"
```

---

## Task 6: i18n `profile.*` keys

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts`

- [ ] **Step 1: Add keys to `en.ts`**

Inside the existing `profile` block in `en.ts`, add (keep existing keys):
```ts
accountType: 'Account type',
patient: 'Patient',
practitioner: 'Practitioner',
phone: 'Phone',
email: 'Email',
gender: 'Gender',
age: 'Age',
dateOfBirth: 'Date of birth',
bloodGroup: 'Blood group',
currentAddress: 'Current address',
preferredLanguage: 'Preferred language',
tier: 'Plan',
free: 'Free',
premium: 'Premium',
organization: 'Organization',
facility: 'Facility',
qualification: 'Qualification',
license: 'License',
licenseExpiry: 'License expiry',
status: 'Status',
offlineProfileBanner: 'Connect to see your full profile',
```

- [ ] **Step 2: Add real translations to `prs.ts`, `ps.ts`, `ar.ts`**

Add the same keys with Dari (prs), Pashto (ps), and Arabic (ar) translations, in the same position inside each `profile` block. Use natural clinical wording consistent with existing entries (e.g. ar: `accountType: 'نوع الحساب'`, `phone: 'الهاتف'`, `email: 'البريد الإلكتروني'`, `gender: 'الجنس'`, `age: 'العمر'`, `dateOfBirth: 'تاريخ الميلاد'`, `bloodGroup: 'فصيلة الدم'`, `currentAddress: 'العنوان الحالي'`, `preferredLanguage: 'اللغة المفضلة'`, `tier: 'الخطة'`, `free: 'مجاني'`, `premium: 'مميز'`, `organization: 'المنظمة'`, `facility: 'المنشأة'`, `qualification: 'المؤهل'`, `license: 'الترخيص'`, `licenseExpiry: 'انتهاء الترخيص'`, `status: 'الحالة'`, `offlineProfileBanner: 'اتصل لعرض ملفك الكامل'`). Provide equivalent prs/ps translations.

- [ ] **Step 3: Verify locale parity**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__` for any existing i18n/locale-parity test; otherwise grep each file to confirm all 21 new keys exist in all four locales.
Expected: all four locales contain the new keys; no structural break.

- [ ] **Step 4: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/i18n/locales/en.ts apps/pharmopedia/src/i18n/locales/prs.ts apps/pharmopedia/src/i18n/locales/ps.ts apps/pharmopedia/src/i18n/locales/ar.ts
git commit -m "i18n(pharmopedia): profile.* keys (en/prs/ps/ar)"
```

---

## Task 7: `useProfile` hook (cache-first then network)

**Files:**
- Create: `apps/pharmopedia/src/hooks/useProfile.ts`
- Test: `apps/pharmopedia/src/__tests__/use-profile.test.ts`

**Behavior:** on mount, read cache → set `profile` + `source: 'cache'`; if `token` present, call `getProfile` → set `profile` + `source: 'network'` + write cache; on network failure keep the cached profile (don't blank); expose `{ profile, source, loading }` where `source` is `'cache' | 'network' | 'none'`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/use-profile.test.ts` (use `@testing-library/react-native`'s renderHook or a small test component; mock `@/api/users`, `@/lib/profile-cache`, `@/db/migrations` `getDatabase`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react-native'
const h = vi.hoisted(() => ({ getProfile: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('@/api/users', () => ({ getProfile: h.getProfile }))
vi.mock('@/lib/profile-cache', () => ({ readProfileCache: h.read, writeProfileCache: h.write, clearProfileCache: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: string | null; user: { sub: string } | null }) => unknown) => s({ token: 'tok', user: { sub: 'auth-1' } }) }))
import { useProfile } from '@/hooks/useProfile'

const PAT = { kind: 'patient', displayName: 'Sara', givenName: 'Sara', tier: 'FREE' }
describe('useProfile', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows cache first, then network, and writes cache', async () => {
    h.read.mockResolvedValue({ ...PAT, displayName: 'Cached' })
    h.getProfile.mockResolvedValue(PAT)
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.source).toBe('network'))
    expect(result.current.profile).toEqual(PAT)
    expect(h.write).toHaveBeenCalledWith(expect.anything(), 'auth-1', PAT)
  })
  it('keeps cached profile when the network call fails', async () => {
    h.read.mockResolvedValue({ ...PAT, displayName: 'Cached' })
    h.getProfile.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile?.displayName).toBe('Cached')
    expect(result.current.source).toBe('cache')
  })
  it('source none when no cache and network fails', async () => {
    h.read.mockResolvedValue(null)
    h.getProfile.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile).toBeNull()
    expect(result.current.source).toBe('none')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/use-profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useProfile.ts`**

```ts
import { useEffect, useState } from 'react'
import { getProfile } from '@/api/users'
import { readProfileCache, writeProfileCache } from '@/lib/profile-cache'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import type { UserProfile } from '@/api/users'

export type ProfileSource = 'cache' | 'network' | 'none'

export function useProfile(): { profile: UserProfile | null; source: ProfileSource; loading: boolean } {
  const token = useAuthStore((s) => s.token)
  const sub = useAuthStore((s) => s.user?.sub)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [source, setSource] = useState<ProfileSource>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const db = getDatabase()
      if (sub) {
        const cached = await readProfileCache(db, sub).catch(() => null)
        if (!cancelled && cached) { setProfile(cached); setSource('cache') }
      }
      if (token && sub) {
        try {
          const fresh = await getProfile(token)
          if (!cancelled) { setProfile(fresh); setSource('network'); await writeProfileCache(db, sub, fresh) }
        } catch {
          // keep cache; if none, source stays 'none'
        }
      }
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [token, sub])

  return { profile, source, loading }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/use-profile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/src/hooks/useProfile.ts apps/pharmopedia/src/__tests__/use-profile.test.ts
git commit -m "feat(pharmopedia): useProfile hook (cache-first then network)"
```

---

## Task 8: Refactored profile screen (Clinical Calm)

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Test: `apps/pharmopedia/src/__tests__/profile-screen.test.tsx`, `apps/pharmopedia/src/__tests__/profile-rtl.test.tsx`

**Design:** keep the existing `CollapsibleScreen`, `NetStatusBanner`, preferences section, catalog-sync section, logout, and coach marks (preserve their testIDs + logic). Prepend an identity header (`Avatar` photo-or-initials + `displayName` + role/tier `Chip`s) and identity Cards built from `@ultranos/ui-kit/native` (`Card`, `Avatar`, `Chip`, `Banner`) using `useProfile()`. Add an offline `Banner` (testID `profile-offline-banner`) when `source === 'none'`. Add testIDs `profile-name`, `profile-avatar`, `profile-account-type`. Render patient-specific rows (gender, age, blood group, current address, preferred language) for `kind === 'patient'`, practitioner rows (role, organization, facility, qualification, license, status) for `kind === 'practitioner'`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/profile-screen.test.tsx`. Mock `@/hooks/useProfile`, the stores (auth/sync/lang/theme/coach), `@/sync/catalog-sync`, `@/db/migrations`, i18n (`t` returns the key), and ui-kit native primitives as needed (or render them). Cases:
```ts
// patient profile renders name, account type 'Patient', phone, address, tier chip
it('renders the patient full profile', async () => {
  mockUseProfile.mockReturnValue({ profile: { kind: 'patient', displayName: 'Sara Ahmadi', givenName: 'Sara', phone: '+9370', gender: 'female', age: 36, bloodGroup: 'O+', currentAddress: { province: 'Kabul' }, preferredLanguage: 'prs', tier: 'PREMIUM' }, source: 'network', loading: false })
  const { getByTestId, getByText } = render(<ProfileTab />)
  expect(getByTestId('profile-name')).toBeTruthy()
  expect(getByText('Sara Ahmadi')).toBeTruthy()
  expect(getByText('+9370')).toBeTruthy()
})
// practitioner profile renders role/org/license
it('renders the practitioner full profile', async () => {
  mockUseProfile.mockReturnValue({ profile: { kind: 'practitioner', displayName: 'Ahmad Khan', givenName: 'Ahmad', familyName: 'Khan', role: 'DOCTOR', email: 'a@x.io', organization: 'Kabul Clinic', licenseId: 'LIC-9', status: 'ACTIVE' }, source: 'network', loading: false })
  const { getByText } = render(<ProfileTab />)
  expect(getByText('Ahmad Khan')).toBeTruthy()
  expect(getByText('Kabul Clinic')).toBeTruthy()
})
// offline + no cache shows banner; preferences still present
it('shows the offline banner when source is none', async () => {
  mockUseProfile.mockReturnValue({ profile: null, source: 'none', loading: false })
  const { getByTestId } = render(<ProfileTab />)
  expect(getByTestId('profile-offline-banner')).toBeTruthy()
  expect(getByTestId('lang-btn-en')).toBeTruthy()
})
// logout still wipes (calls logout) and routes to login
it('logout routes to login', async () => {
  mockUseProfile.mockReturnValue({ profile: null, source: 'cache', loading: false })
  const { getByTestId } = render(<ProfileTab />)
  // confirmLogout uses Alert; assert the logout button exists and Alert is invoked
  fireEvent.press(getByTestId('logout-button'))
  expect(AlertMock.alert).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-screen.test.tsx`
Expected: FAIL — new testIDs / identity rows absent.

- [ ] **Step 3: Implement the refactor**

Rewrite `app/(tabs)/profile.tsx` to add the identity header + identity Cards from `@ultranos/ui-kit/native` driven by `useProfile()`, while preserving the existing preferences/sync/logout/coach sections verbatim (including their testIDs and handlers). Use `Avatar` (props per ui-kit native Avatar — `source`/`name` for initials fallback), `Chip` for role + tier, `Card` for grouped rows, `Banner` for the offline state. Add testIDs `profile-avatar`, `profile-name`, `profile-account-type`, `profile-offline-banner`. Localize all labels via `t('profile.*')`. Theme via `useThemeColors`, RTL via `isRtlLang(lang)`. Keep field rows null-safe (omit a row when its value is undefined).

> Build the identity rows from the `useProfile()` union: for `kind: 'patient'` render phone/gender/age/bloodGroup/currentAddress/preferredLanguage/tier; for `kind: 'practitioner'` render role/email/phone/organization/facility/qualification/license/licenseExpiry/status. Reuse the existing `RoleBadge` or a `Chip` for role. If `loading && !profile`, show a `Skeleton`/placeholder; the preferences/sync/logout sections always render.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-screen.test.tsx`
Expected: PASS. Also run the pre-existing profile tests (`profile-theme-toggle.test.tsx`, any logout test) — expect no regression.

- [ ] **Step 5: RTL snapshot test**

Create `apps/pharmopedia/src/__tests__/profile-rtl.test.tsx`: render `ProfileTab` with `lang='ar'` (mock lang store + `isRtlLang` → true) for a patient profile, and snapshot. Also snapshot LTR (`lang='en'`). Mirror the RTL snapshot pattern used by other pharmopedia component tests.

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-rtl.test.tsx`
Expected: PASS (snapshots written).

- [ ] **Step 6: Commit (staging checkpoint)**

```bash
git add apps/pharmopedia/app/(tabs)/profile.tsx apps/pharmopedia/src/__tests__/profile-screen.test.tsx apps/pharmopedia/src/__tests__/profile-rtl.test.tsx
git commit -m "feat(pharmopedia): Clinical-Calm full profile screen (offline-first)"
```

---

## Task 9: Finalize — full verification + reviews

**Files:** none (verification + review only).

- [ ] **Step 1: Full pharmopedia test suite**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run`
Expected: all new E4 suites pass; no regressions beyond the 4 pre-existing `clinical-tab-extended` failures (E5 territory).

- [ ] **Step 2: Hub tests**

Run: `pnpm -F hub-api exec vitest run src/__tests__/users-profile.test.ts`
Expected: 4/4 pass.

- [ ] **Step 3: Typechecks**

Run: `pnpm -F hub-api typecheck 2>&1 | grep "routers/users"` (no new errors) and `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "api/users|secure-crypto|profile-cache|useProfile|(tabs)/profile"` — confirm O3-equivalent baseline (the `tokens.native`/module-resolution + locale literal-type patterns are pre-existing; no new logic errors in E4 source).

- [ ] **Step 4: Two-stage review (controller)**

Dispatch a spec-compliance review against the E4 spec and a code-quality + healthcare-safety review (PHI never logged/audited; opaque audit ids only; signed-URL not leaking unsigned; encrypted cache wiped on logout; practitioner phone actually decrypted). Address blocking/important findings, then re-verify.

- [ ] **Step 5: Commit (controller, on explicit user go-ahead)**

Batch the E4 commit (or confirm the per-task checkpoints) with the standard trailer.

---

## Self-Review (plan vs spec)

**Spec coverage:** §3.1 getProfile → Task 1; §3.2 photo privacy → Task 2; §3.3 client → Task 5; §3.4 cache (secure-crypto + table + wipe) → Tasks 3+4; §3.5 screen → Task 8 (+ useProfile Task 7); §3.6 i18n → Task 6; §4 testing → every task's tests + Task 9. Success criteria §6 all map to tasks. ✅

**Placeholder scan:** No "TBD"/"add error handling" placeholders; the few `> Verify at implementation` notes name the exact thing to check and the fallback. ✅

**Type consistency:** `UserProfile` union defined once (File Structure), consumed identically by `users.ts` client, `profile-cache.ts`, `useProfile.ts`, and the screen. Hub returns the matching shape. `SealedBlob { ciphertext, iv }` consistent between `secure-crypto.ts` and `profile-cache.ts`. `getProfile(token)`, `readProfileCache(db, sub)`, `writeProfileCache(db, sub, profile)`, `clearProfileCache(db)`, `useProfile() → { profile, source, loading }` consistent across tasks. ✅

**Deviations from spec (flagged):** spec §3.4 illustrated the crypto dep as "react-native-quick-crypto/react-native-aes-crypto"; the plan selects `@noble/ciphers` + `expo-crypto` instead (pure-JS, Expo-compatible, no native prebuild) — within the spec's stated criterion and §7's "plan selects the exact dep." Practitioner `telecom_phone` decrypt-on-read added (O3 reality), not explicit in the spec but required for correctness.
