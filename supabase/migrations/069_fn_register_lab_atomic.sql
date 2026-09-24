-- Migration 069: Atomic lab registration + practitioner-id resolution
-- (Story 61.3, audit M-HUB-4 + M-HUB-7).
--
-- lab.register inserted the labs row and the lab_technicians row as two separate
-- calls, using a COMPENSATING DELETE of the lab if the technician insert failed
-- (M-HUB-4). It also inserted ctx.user.sub (the AUTH user id) into
-- lab_technicians.practitioner_id, which is a FK to practitioners.id — the wrong
-- id family (M-HUB-7). Because labRestrictedProcedure (rbac.ts) resolves a
-- technician by joining practitioners.auth_user_id = ctx.user.sub, a lab_technicians
-- row keyed by the auth id can never be found again — self-registration silently
-- produced an unusable affiliation.
--
-- This RPC:
--   1. Resolves the real practitioners.id from p_auth_user_id (auth_user_id).
--   2. Inserts the labs row (PENDING) and the lab_technicians row keyed by that
--      practitioners.id, in ONE transaction — a failure rolls back the lab, so no
--      orphan lab and no compensating delete.
--
-- Model: create_patient_with_consent (023b) — SECURITY DEFINER, JSONB payload.
-- Authorization is unchanged: any authenticated caller may self-register a lab
-- exactly as before; this RPC only corrects the id used and the atomicity.
--
-- Returns { labId }.  Raises:
--   PRACTITIONER_NOT_FOUND (P0001) — no practitioner row for this auth user.
--   unique_violation (23505)       — technician already affiliated (one lab per tech).
CREATE OR REPLACE FUNCTION register_lab_atomic(
  p_auth_user_id     UUID,
  p_lab_name         TEXT,
  p_license_ref      TEXT,
  p_accreditation_ref TEXT,
  p_credential_ref   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_practitioner_id UUID;
  v_lab_id          UUID;
BEGIN
  -- 1. Resolve the practitioner PK from the auth user id (M-HUB-7 fix).
  SELECT id INTO v_practitioner_id
    FROM practitioners
   WHERE auth_user_id = p_auth_user_id;

  IF v_practitioner_id IS NULL THEN
    RAISE EXCEPTION 'PRACTITIONER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Insert the lab (PENDING) and bind the registering practitioner as its
  --    technician — one transaction. license_ref UNIQUE / practitioner_id UNIQUE
  --    violations propagate as 23505 (mapped to CONFLICT by the caller).
  INSERT INTO labs (name, license_ref, accreditation_ref, status)
  VALUES (p_lab_name, p_license_ref, p_accreditation_ref, 'PENDING')
  RETURNING id INTO v_lab_id;

  INSERT INTO lab_technicians (practitioner_id, lab_id, credential_ref)
  VALUES (v_practitioner_id, v_lab_id, p_credential_ref);

  RETURN jsonb_build_object('labId', v_lab_id);
END;
$$;

GRANT EXECUTE ON FUNCTION register_lab_atomic(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
