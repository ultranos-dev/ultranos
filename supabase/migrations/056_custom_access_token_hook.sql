-- 056_custom_access_token_hook.sql
--
-- Custom Access Token Hook — inject the internal practitioners.id as a top-level
-- `practitioner_id` JWT claim (Option B: a single practitioner identity across the
-- whole system).
--
-- Background
-- ----------
-- Spoke clients derive the practitioner reference as `practitioner_id ?? sub`. With no
-- `practitioner_id` claim in the token they fell back to the Supabase auth `sub`
-- (= practitioners.auth_user_id), which is NOT practitioners.id. Every clinical write
-- with a hard practitioner FK then failed a foreign-key violation (23503) at the Hub
-- and never synced:
--   * soap_ledger.practitioner_id     -> practitioners.id  (NOT NULL)
--   * service_requests.requester_id   -> practitioners.id  (NOT NULL)
--   * medication_requests.requester_id-> practitioners.id
--   * conditions.recorder_id          -> practitioners.id
-- (Encounters/vitals carry the practitioner in an FK-less JSONB field, so they synced.)
--
-- This hook makes the access token carry the correct internal id, so all spokes stamp
-- the right identity going forward. `sub` is unchanged (still the auth uid): RBAC lab
-- lookups (which join practitioners on auth_user_id = sub) and the OPD-Lite PWA
-- encryption-key derivation (PBKDF2 over sub) are unaffected.
--
-- ENABLEMENT (manual, one-time): this migration only creates the function. The hook
-- must then be turned on in the project's Auth config — Dashboard: Authentication →
-- Hooks → "Customize Access Token (JWT) Claims" → select public.custom_access_token_hook;
-- or via the Management API (auth config: hook_custom_access_token_enabled = true,
-- uri = 'pg-functions://postgres/public/custom_access_token_hook'). Existing sessions
-- must re-login (or refresh) to receive the new claim.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  v_practitioner_id uuid;
begin
  claims := coalesce(event->'claims', '{}'::jsonb);

  select id
    into v_practitioner_id
    from public.practitioners
   where auth_user_id = (event->>'user_id')::uuid
   limit 1;

  if v_practitioner_id is not null then
    claims := jsonb_set(claims, '{practitioner_id}', to_jsonb(v_practitioner_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only GoTrue (supabase_auth_admin) may run the hook.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- GoTrue needs to read the lookup table (RLS is enabled on practitioners).
grant usage on schema public to supabase_auth_admin;
grant select on table public.practitioners to supabase_auth_admin;

drop policy if exists "auth_admin_reads_practitioners_for_token_hook" on public.practitioners;
create policy "auth_admin_reads_practitioners_for_token_hook"
  on public.practitioners
  as permissive
  for select
  to supabase_auth_admin
  using (true);
