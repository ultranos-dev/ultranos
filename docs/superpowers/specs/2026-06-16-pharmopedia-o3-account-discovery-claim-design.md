# Pharmopedia O3 — Account Discovery + Claim (Design Spec, revised)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/` + `apps/hub-api/` + Supabase
**Branch:** `ux-v1.5`
**Status:** Approved for planning (revised after reading the Hub internals)
**Part of:** the Onboarding & Identity program (O1 ✓, O2 ✓ → **O3** → E4).

---

## 1. Background

O2 built the public signup wizard. O3 makes the public identity a real Hub `patients` record (linked to the auth user) and adds **account discovery + claim**: a returning person whose phone already has a record claims it instead of duplicating.

**Schema realities discovered (these shape the design):**
- **Patient `telecom_phone` is stored PLAINTEXT and UNIQUE** on `patients` (the `register` mutation relies on a `23505` unique-violation). So discovery is an **exact phone match** — reliable, post-OTP, no fuzzy MPI required for discovery.
- Because phone is unique, **a phone match is, by definition, the caller's own record** → **Claim only** (you cannot create a second patient with the same phone).
- The MPI (`fetchMpiCandidates` + `computeMpiResult` → `BLOCK`/`WARN`/`ALLOW`) is for **fuzzy name/DOB** dedup at *register* time (different phone, similar identity) and is kept there.
- **Practitioner `telecom_phone` is ENCRYPTED (AES-256-GCM) with no blind index.** Staff-match-by-phone therefore requires a new HMAC blind-index column + backfill.
- `register` stores patient PHI via `encryptField` + `db.toRow()`, creates the row through the `create_patient_with_consent` RPC, links the auth user via `auth.admin.updateUserById(user_metadata.patient_id)`, and audits via `AuditLogger.emit` (opaque ids only).

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Identity model | Public users become a real `patients` record linked via a new **`patients.auth_user_id`** (unique) |
| Discovery | **Post-OTP exact phone match** on `patients` (plaintext, unique). Staff match via a new **`practitioners.telecom_phone_index`** HMAC blind index |
| Patient match | **Claim only** (unique phone ⇒ it's the caller's record). Confirm with **birth-year (DOB) second factor** before linking. No "create new" on a phone match |
| No match | Continue the wizard (name → DOB → photo → address) → create a new linked patient via `registerFromSession` (existing MPI flags fuzzy dups for `duplicate-review`) |
| Staff match | **Not claimable** — sign out the OTP session, route to member login |
| Claim model | An **auth↔patient link** (`patients.auth_user_id`), not a record merge |
| Audit | `discover`, `claim`, `registerFromSession` emit `AuditLogger` events with **opaque ids only** |

## 3. Scope

### 3.1 Migrations + backfill (Supabase MCP / script)
1. **`patients.auth_user_id uuid NULL`** + unique index. Links a public auth user to their patient record (claimed or self-created); what E4 reads for public users.
2. **`practitioners.telecom_phone_index text NULL`** + index. HMAC blind index of the practitioner's phone for equality lookup without decryption.
3. **Backfill `practitioners.telecom_phone_index`**: a one-time server-side script (`apps/hub-api/scripts/backfill-practitioner-phone-index.ts`) that, with the field-encryption keys, reads each practitioner, **decrypts** `telecom_phone` (`decryptField` + `encryptionKey`), computes `generateBlindIndex(phone, hmacKey)`, and writes `telecom_phone_index`. Runs in batches; logs counts only (never phone values). Idempotent (skip rows already indexed).
4. **Write path update**: the admin practitioner-invite mutation (`apps/hub-api/src/trpc/routers/admin.ts`, where `encryptedPhone` is set) also writes `telecom_phone_index: generateBlindIndex(input.phone, hmacKey)` so new practitioners are indexed going forward.

### 3.2 Hub endpoints — `apps/hub-api/src/trpc/routers/patient-registration.ts` (`protectedProcedure`)
- **`discover({ phone })` → `{ matchType: 'none'|'patient'|'staff', candidate? }`**
  - Staff: `generateBlindIndex(phone, hmacKey)` → `practitioners.select('id').eq('telecom_phone_index', hash).maybeSingle()`. If found → `{ matchType: 'staff' }` (no detail).
  - Patient: `patients.select('id, name_local, birth_date, birth_year, auth_user_id').eq('telecom_phone', phone).maybeSingle()`. If found and `auth_user_id` is null (or equals `ctx.user.sub`) → `{ matchType: 'patient', candidate: { ref, maskedName, birthYear } }` where `ref = generateBlindIndex(patient.id, hmacKey)`, `maskedName` = given name + initial. If found but `auth_user_id` belongs to a *different* user → `{ matchType: 'none' }` + audit anomaly (don't expose). Else `{ matchType: 'none' }`.
  - Audit `PATIENT_DISCOVER` (opaque ref + matchType only).
- **`claim({ ref, birthYear })` → `{ ok: true }`**
  - Re-resolve: query the caller's phone-matched patient (same exact-phone query as discover), compute its `generateBlindIndex(id, hmacKey)`, and require it to equal `ref` (prevents claiming an arbitrary id). Guard: patient `auth_user_id` is null or already the caller; not linked to a different user.
  - **DOB factor**: require `birthYear` to equal the patient's `birth_year` (or year of `birth_date`). On mismatch → `FORBIDDEN` (audit `PATIENT_CLAIM` outcome DENIED).
  - Set `patients.auth_user_id = ctx.user.sub` + `auth.admin.updateUserById(user_metadata.patient_id)`; audit `PATIENT_CLAIM` SUCCESS (opaque ids only).
- **`registerFromSession({ firstName, nameFather?, gender?, dateOfBirth, address, preferredLanguage, photoUrl? })` → `{ patientId (opaque ref) }`**
  - Mirrors the existing `register` insert/encryption (`encryptField`, `db.toRow`, `create_patient_with_consent` RPC) but **without OTP re-verify** (session already authenticated) and sets `auth_user_id = ctx.user.sub` + stores `photo_url`/address. Runs MPI fuzzy dedup (`computeMpiResult`): `BLOCK` → return `{ blocked: true }` (no create); `WARN` → create with `mpi_warn = true`; `ALLOW` → create. Audit `PATIENT_SELF_REGISTER`.

### 3.3 App API client — `apps/pharmopedia/src/api/account.ts`
Thin tRPC-over-REST wrappers via `hubFetch`: `discoverAccount(token, { phone })`, `claimAccount(token, { ref, birthYear })`, `registerFromSession(token, input)`.

### 3.4 Wizard changes — `apps/pharmopedia/app/(auth)/register.tsx`
- After **OTP verify**, call `discoverAccount({ phone })`:
  - **`staff`** → info screen → `supabase.auth.signOut()` + `router.replace('/(auth)/login')`.
  - **`patient`** → "We found your record" card (masked name + birth year) → a **birth-year input** + **Claim** → `claimAccount({ ref, birthYear })` → on success `router.replace('/(tabs)')`; on DOB mismatch show an inline error (allow retry; the only path forward is the correct DOB, since the phone is theirs).
  - **`none`** → continue the wizard: **name → DOB → photo → address** → finish calls `registerFromSession` (+ photo upload + `user_metadata` write as in O2).
- DOB collected at the **claim step** (match) or the wizard **DOB step** (no-match). The new-patient path needs `dateOfBirth` for `registerFromSession`.

### 3.5 i18n
Add discovery/claim keys to the `signup` namespace (4 locales, real prs/ps/ar): `foundAccountTitle/Body`, `confirmBirthYear`, `claim`, `claimMismatch`, `staffMatchTitle/Body`, `goToMemberLogin`, plus the wizard DOB label. Keep structural parity.

## 4. Testing
- **Hub (vitest, `pnpm -F @ultranos/hub-api test`):** mock `ctx.supabase` (query-builder chain + `.rpc`) and `ctx.user`.
  - `discover`: staff match (blind-index hit) → `staff`; patient exact-phone hit (unclaimed) → `patient` + opaque ref + masked candidate; claimed-by-other → `none` + anomaly audit; no hit → `none`.
  - `claim`: ref re-resolves to the caller's phone match; birth-year match → sets `auth_user_id` + audit SUCCESS; birth-year mismatch → `FORBIDDEN` + audit DENIED; already-claimed-by-other → reject.
  - `registerFromSession`: `ALLOW`→creates linked patient + audit; `WARN`→creates with `mpi_warn`; `BLOCK`→`{ blocked }`; audits opaque-only.
  - Backfill script: unit-test the per-row transform (decrypt→blind-index) with mocked crypto.
  - admin invite writes `telecom_phone_index`.
- **App (vitest):** `account.ts` client encoding (mock hubFetch). Wizard: post-OTP `staff`→signOut+login; `patient`→claim (birthYear) → tabs; mismatch shows error; `none`→register path. Mock the account API + supabase.
- No regression; hub-api + ui-kit + native typechecks clean.

## 5. Out of Scope (O3)
- **E4** Profile display/edit.
- Patient record↔record **merge** UX (claim is an auth-link; record dedup stays in `duplicate-review`).
- Changing the existing `register` mutation (O3 adds `registerFromSession` alongside it).
- Backfilling `patients.auth_user_id` (set only on claim/self-register).

## 6. Success Criteria
- Post-OTP, an existing phone surfaces a "We found your record" claim (birth-year-gated) that links `auth_user_id`; a staff phone bounces to member login; a new phone proceeds to create a linked free-floating patient.
- `practitioners.telecom_phone_index` exists, is backfilled, and is written on new invites; the backfill never logs phone values.
- `discover`/`claim`/`registerFromSession` audit with opaque ids only; claim enforces the birth-year factor.
- New migrations applied; endpoints + wizard branch + i18n (4 locales); tests pass; typechecks clean.

## 7. Risks / Open Questions (pinned at plan time)
- **`registerFromSession` insert fidelity**: must mirror `register`'s exact encrypted columns + `create_patient_with_consent` RPC params (read the mutation; the plan pins the row shape) and add `auth_user_id`/`photo_url`/address columns.
- **Backfill safety**: decrypts staff phones in-process; run server-side with keys, batch, log counts only, idempotent. Confirm `decryptField` import + signature at plan time.
- **`maskedName` source**: `patients.name_local` is encrypted; discover must decrypt server-side to mask (`decryptField`) or use a non-encrypted name part — plan decides (default: decrypt `name_local`, return only given + initial).
- **`birth_year` vs `birth_date`**: claim compares against `birth_year` when present, else `Number(birth_date.slice(0,4))`.
- **Already-authenticated session for Hub calls**: the OTP user has `role: PATIENT`; `protectedProcedure` suffices.
- Real-device/premium validation in an Expo run (standing caveat).
