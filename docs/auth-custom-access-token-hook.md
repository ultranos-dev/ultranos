# Auth — `practitioner_id` Custom Access Token Hook

**Status:** function deployed (migration `056_custom_access_token_hook.sql`). **Enablement is a one-time manual Auth-config step — see below.**

## What it does

Injects the internal `practitioners.id` (the DB primary key) into every issued access
token as a top-level **`practitioner_id`** claim.

Spoke clients derive the practitioner reference as `practitioner_id ?? sub`. Without the
claim they fell back to the Supabase auth `sub` (which equals `practitioners.auth_user_id`,
**not** `practitioners.id`). Because several Hub tables enforce a hard FK to
`practitioners.id`, every clinical write from a spoke failed a foreign-key violation
(Postgres `23503`) and silently never synced:

| Resource | Column | FK target |
|---|---|---|
| SOAP note (`ClinicalImpression`) | `soap_ledger.practitioner_id` | `practitioners.id` (NOT NULL) |
| Lab order (`ServiceRequest`) | `service_requests.requester_id` | `practitioners.id` (NOT NULL) |
| Prescription (`MedicationRequest`) | `medication_requests.requester_id` | `practitioners.id` |
| Diagnosis (`Condition`) | `conditions.recorder_id` | `practitioners.id` |

Encounters and vitals carry the practitioner in an FK-less JSONB field, which is why they
synced fine while the four resources above sat at zero synced rows.

With the hook enabled, the token carries the correct internal id, so **all** spokes
(OPD-Lite, Pharmacy-Lite, Lab-Lite) stamp one consistent practitioner identity.

## What it does NOT change

- **`sub` is untouched** — it remains the Supabase auth user id. Anything keyed on `sub`
  is unaffected:
  - Hub RBAC lab lookup: `practitioners.auth_user_id = ctx.user.sub` (`hub-api/src/trpc/rbac.ts`).
  - OPD-Lite PWA encryption-key derivation: PBKDF2 over `payload.sub` (`login/page.tsx`, `AuthGuard.tsx`).
- The hook is a pure claim addition; it does not alter roles, org, or session claims.

## Enablement (one-time, manual)

The migration only creates `public.custom_access_token_hook`. GoTrue will not call it until
the hook is switched on in the project's Auth config:

- **Dashboard:** Authentication → Hooks → **Customize Access Token (JWT) Claims** →
  select `public.custom_access_token_hook` → Enable.
- **Management API / config:**
  - `hook_custom_access_token_enabled = true`
  - `hook_custom_access_token_uri = 'pg-functions://postgres/public/custom_access_token_hook'`

The migration already grants `execute` to `supabase_auth_admin`, grants it `select` on
`practitioners`, and adds the matching RLS policy (RLS is enabled on that table).

## Rollout notes

- **Re-login required.** Existing tokens were issued before the hook. Clinical staff must
  sign out/in (or wait for token refresh) to receive the `practitioner_id` claim. Until
  then, the Hub-side resolver (below) keeps their writes working.
- **Defense-in-depth resolver stays.** `hub-api/src/trpc/routers/sync.ts` resolves any
  practitioner reference (auth id **or** internal id) to `practitioners.id` before upsert
  (`PRACTITIONER_REF_COLUMNS` + `resolvePractitionerId`). Once the hook is live this is a
  no-op pass-through (the ref is already the internal id), but it protects pre-hook tokens
  and any future spoke that lags the claim. Do not remove it.
- **Existing rows.** The four FK tables had zero synced rows, so there is nothing to
  backfill. A handful of pre-existing encounters carry the auth id in their FK-less JSONB
  `participant` field; this is harmless (no FK) and left as-is.
- **Prerequisite for a user to get the claim:** the signing-in user must have a
  `practitioners` row with `auth_user_id` set. Verified: no duplicate `auth_user_id`s, so
  the hook's lookup is unambiguous.

## Verification

```sql
-- Should return the internal practitioners.id for a linked clinician:
select public.custom_access_token_hook(
  jsonb_build_object(
    'user_id', '<auth_user_id>',
    'claims', jsonb_build_object('sub', '<auth_user_id>', 'role', 'authenticated')
  )
) #>> '{claims,practitioner_id}';
```

After enabling + re-login, decode the access token and confirm a top-level
`practitioner_id` claim is present, then confirm a SOAP note / prescription / lab order
syncs (previously failed).
