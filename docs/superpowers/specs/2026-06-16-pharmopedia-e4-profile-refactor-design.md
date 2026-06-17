# Pharmopedia E4 — Profile Refactor + Hub `users.getProfile` (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/` + `apps/hub-api/` + Supabase
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Part of:** the Pharmopedia UX overhaul (E1 ✓, E2 ✓, E3 ✓, O1 ✓, O2 ✓, O3 ✓ → **E4** → E5, E6).

---

## 1. Background

E1–E3 + O1–O3 delivered the Clinical-Calm native ui-kit, the Home dashboard, and the onboarding/identity system (public signup creates a linked Hub `patients` record; Ultranos members are `practitioners`). The current profile screen ([`apps/pharmopedia/app/(tabs)/profile.tsx`](../../../apps/pharmopedia/app/(tabs)/profile.tsx)) shows only a role badge, language/theme prefs, catalog-sync status, and logout — it does not surface who the user actually is.

E4 turns it into a **read-only "full profile"**: a Clinical-Calm identity view fed by a new Hub `users.getProfile` endpoint, that works **offline** via an encrypted on-device cache, and moves patient profile photos behind **signed URLs** (closing O3-1).

**Schema realities (from exploration):**
- **Patients** carry encrypted PHI (`name_local_enc`, `birth_date_enc`) decrypted server-side via `db.fromRow`; plaintext `telecom_phone` (unique); `photo_url`; current address columns (plaintext, established design); `patient_tier` (FREE/PREMIUM); linked via `patients.auth_user_id` (added in O3).
- **Practitioners** are plaintext (no `_enc` columns): `given_name`, `family_name`, `telecom_email`, `telecom_phone`, `role`, `status`, `org_id`, `facility_id`, `qualification_display`, `identifier_value` (license), `license_expiry`; linked via `practitioners.auth_user_id`. **No `photo_url` column.**
- **Local store:** plain `expo-sqlite` (`pharmopedia.db`, `SCHEMA_VERSION = 2`); no SQLCipher, no device PHI crypto today. Auth token is in-memory only.
- **No `users` router** exists in the Hub (`apps/hub-api/src/trpc/routers/_app.ts`).
- **tRPC context** (`apps/hub-api/src/trpc/init.ts`): `ctx.user = { sub, role, sessionId, orgId, facilityId, status }`; `protectedProcedure` already rejects `UNAUTHORIZED` and `SUSPENDED`.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Scope | **Read-only** profile display. Editing (photo/address/name) is a later epic. |
| Photo privacy (O3-1) | **Fix in E4**: `profile-photos` becomes private; served via short-lived `createSignedUrl()` on read. |
| Offline behavior | **Encrypted PHI cache**: full profile shows offline from an encrypted on-device cache. |
| Cache mechanism | **AES-256-GCM blob**, key in `expo-secure-store` (Keystore/Keychain), ciphertext in an `expo-sqlite` `profile_cache` table. Wiped on logout. |
| Profile read keying | `auth_user_id = ctx.user.sub`, branched by `ctx.user.role` (PATIENT → patients, else → practitioners). |
| Practitioner photo | None (no column) → initials Avatar. |
| Signed-URL TTL | ~3600s (1 hour). |

## 3. Scope

### 3.1 Hub — new `users` router, `getProfile` (`apps/hub-api/src/trpc/routers/users.ts`, wired into `_app.ts`)

`getProfile()` (no input; uses `ctx.user`), `protectedProcedure`. Returns a discriminated union:

- **Patient branch** (`ctx.user.role === 'PATIENT'`): `patients.select(...).eq('auth_user_id', ctx.user.sub).maybeSingle()`. Decrypt PHI via the same `db.fromRow`/`decryptField` path `patient.read` uses. Build:
  ```ts
  { kind: 'patient', displayName, givenName, photoUrl?, phone?, gender?,
    birthDate?, age?, bloodGroup?, currentAddress?: { province?, district?, village? },
    preferredLanguage?, tier: 'FREE' | 'PREMIUM' }
  ```
  - `displayName`: prefer decrypted `name_local`; else `name_given` (+ `name_family`). Data-minimal but the user's own full name is fine (self-access).
  - `photoUrl`: if a stored photo path exists, return `createSignedUrl(path, 3600)`; tolerate legacy stored public URLs by extracting the object path (see §3.2).
- **Practitioner branch** (any other role): `practitioners.select(...).eq('auth_user_id', ctx.user.sub).maybeSingle()`. Plaintext. Build:
  ```ts
  { kind: 'practitioner', displayName, givenName, familyName, role,
    email?, phone?, organization?, facility?, qualificationDisplay?,
    licenseId?, licenseExpiry?, status }
  ```
  - `organization`/`facility`: resolve names from `org_id`/`facility_id` if a cheap lookup exists; else return the ids (plan confirms whether a name lookup is available — if not, return ids and label generically).
- **No record found** (e.g., practitioner not yet linked, or patient row missing): return `{ kind, displayName: '', … }` minimal shell so the screen degrades to `ctx`-derived basics — never throw for a missing record.
- **Audit:** emit one event per call via `AuditLogger` (`apps/hub-api`): patient → `action: 'PHI_READ', resourceType: 'PATIENT'`; practitioner → `action: 'READ', resourceType: 'PRACTITIONER'`. `resourceId` = the own record id, `actorId` = `ctx.user.sub`, `actorRole`/`sessionId` from ctx, `metadata: { operation: 'getProfile' }`. **Opaque ids only — no name/phone/DOB in metadata.**

### 3.2 Photo bucket privacy (O3-1)

1. Make the `profile-photos` Supabase Storage bucket **private** (Storage policy change via Supabase MCP).
2. **Upload path** (`apps/pharmopedia/src/lib/profile-photo.ts`, from O2): keep uploading to the bucket, but return/store the **object path** (e.g. `{userId}/avatar.<ext>`), not `getPublicUrl()`. The patient `photo_url` column then holds the path going forward.
3. **Read path** (`getProfile`): `createSignedUrl(path, 3600)`. For legacy rows whose `photo_url` is a full public URL, extract the trailing object path before signing (defensive: if extraction fails, omit the photo rather than return an unsigned URL).

### 3.3 App — API client (`apps/pharmopedia/src/api/users.ts`)

`getProfile(token)` as a tRPC **GET** (query), mirroring `drug-catalog.ts` `trpcGet` (input `?input={"json":{}}` or omitted for no-input; response `{ result: { data: { json: T } } }`; auth via `authHeaders(token)`; transport `hubFetch`). Exports the `UserProfile` discriminated-union type consumed by the screen + cache.

### 3.4 App — encrypted profile cache

- **`apps/pharmopedia/src/lib/secure-crypto.ts`:** AES-256-GCM via a vetted RN crypto library (plan selects the exact dep — e.g. `react-native-quick-crypto` or `react-native-aes-crypto`; criterion: real AES-GCM, maintained, Expo-compatible). `getOrCreateCacheKey()` generates a 256-bit key once and stores it in `expo-secure-store`; `encryptJson(obj)` → `{ ciphertext, iv }`; `decryptJson({ ciphertext, iv })` → obj. Key never leaves SecureStore in plaintext form elsewhere.
- **Schema** (`apps/pharmopedia/src/db/schema.ts` + `migrations.ts`): bump `SCHEMA_VERSION` to **3**; add
  ```sql
  CREATE TABLE IF NOT EXISTS profile_cache (
    sub        TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    iv         TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ```
- **`apps/pharmopedia/src/lib/profile-cache.ts`:** `writeProfileCache(sub, profile)` (encrypt + upsert), `readProfileCache(sub)` (select + decrypt; returns `null` on miss/decrypt-failure), `clearProfileCache()` (delete all rows).
- **Wipe:** `clearProfileCache()` is called on logout (in the existing logout handler) and on any session-end/clear path. PHI never persists past logout.

### 3.5 App — refactored profile screen (`apps/pharmopedia/app/(tabs)/profile.tsx`)

Clinical-Calm, built from `@ultranos/ui-kit/native` primitives (`Avatar`, `Card`, `CardSection`/`ListRow`, `Chip`, `Banner`, `Button`) inside the existing `CollapsibleScreen`:
- **Identity header:** `Avatar` (signed photo, else initials) + `displayName` + role `Chip` (+ tier `Chip` for patients).
- **Account card:** phone; account type; email (practitioner); tier (patient).
- **Personal card (patient):** gender, age/DOB, blood group, current address, preferred language.
- **Professional card (practitioner):** role, organization, facility, qualification, license + expiry, status.
- **Preferences card:** language + theme selectors (existing logic preserved).
- **Catalog sync card:** existing.
- **Log out** (existing destructive `Button`) → also calls `clearProfileCache()`.

**Data flow (offline-first):**
1. On mount, `readProfileCache(sub)` → if present, render immediately.
2. If online, call `getProfile` → render + `writeProfileCache(sub, profile)`.
3. Offline with no cache → render `ctx`/auth-store basics (role) + a subtle `Banner` ("Connect to see your full profile").
4. Network failure during fetch never blanks an already-rendered cached profile.

Theme-aware (`useThemeColors`) and RTL-aware (`isRtlLang`). Preserve existing testIDs (`lang-btn-{en|prs|ps|ar}`, `theme-{light|dark|system}`, `last-synced-text`, `sync-now-button`, `show-tips-button`, `logout-button`) and add `profile-name`, `profile-avatar`, `profile-account-type`, `profile-offline-banner`.

### 3.6 i18n

Add a `profile.*` key set to all four locales (en/prs/ps/ar, real translations in prs/ps/ar): `accountType`, `patient`, `practitioner`, `phone`, `email`, `gender`, `age`, `dateOfBirth`, `bloodGroup`, `currentAddress`, `preferredLanguage`, `tier`, `free`, `premium`, `organization`, `facility`, `qualification`, `license`, `licenseExpiry`, `status`, `offlineProfileBanner`. Keep structural parity.

## 4. Testing

- **Hub (vitest, `pnpm -F hub-api ...`):** `users.getProfile` — patient branch (decrypts name/DOB, signs photo, audits `PHI_READ` opaque-only), practitioner branch (plaintext, audits `READ`), no-record shell (no throw), photo path-vs-legacy-URL signing. Mock `ctx.supabase` query-builder + `.storage.from().createSignedUrl`, `ctx.user`, crypto, AuditLogger.
- **App (vitest):** `users.ts` client encoding (mock hubFetch); `secure-crypto` + `profile-cache` encrypt→decrypt round-trip, miss returns null, `clearProfileCache` wipes; profile screen renders patient shape, practitioner shape, offline-from-cache, offline-no-cache basics + banner, logout calls `clearProfileCache`. RTL snapshot of the profile screen (LTR + RTL).
- No regression beyond the pre-existing `clinical-tab-extended` failures (E5 territory); hub-api + native + ui-kit typechecks introduce no new errors.

## 5. Out of Scope (E4)

- Profile **editing** (photo/address/name change) — later epic.
- Full **SQLCipher** migration of the local store — its own cross-cutting story.
- **Address-at-rest encryption** on patients (O3-2) — dedicated cross-cutting story.
- E5 (drug-detail rework + the 4 `clinical-tab-extended` P0 fixes) and E6 (translations/DrugCard/a11y).
- Org/facility **name** resolution if no cheap lookup exists (fall back to ids + generic labels).

## 6. Success Criteria

- A patient sees their name, photo (via signed URL), phone, demographics, address, language, and tier; a practitioner sees their name, role, email, phone, org/facility, qualification, and license — both Clinical-Calm, theme- and RTL-correct.
- The full profile renders **offline** from the encrypted cache; logout wipes it; no PHI persists in plaintext on device or in logs/audit.
- `profile-photos` is private; profile photos resolve only via short-lived signed URLs.
- `users.getProfile` audits every read with opaque ids only and never throws on a missing record.
- New endpoint + client + cache + screen + i18n (4 locales); tests pass; typechecks clean.

## 7. Risks / Open Questions (pinned at plan time)

- **RN AES-GCM dependency:** confirm a maintained, Expo-compatible library with real AES-256-GCM at plan time; ensure it is mockable in the node/vitest test env (hand-written mock in `src/__mocks__`).
- **`db.fromRow` reuse from a new router:** confirm the decrypt path used by `patient.read` is reusable for a `patients` row fetched by `auth_user_id` (same columns), or call `decryptField` directly for the few needed fields (name_local_enc, birth_date_enc).
- **Org/facility name lookup:** verify whether a cheap name lookup exists; if not, return ids.
- **Legacy `photo_url` values:** existing rows may hold public URLs; the path-extraction fallback must be robust (omit photo on failure, never return unsigned).
- **expo-secure-store availability in tests:** mock exists (`src/__mocks__/expo-secure-store.js`); extend if the key-management calls need more surface.
- **Real-device/premium validation in an Expo run** (standing caveat).
