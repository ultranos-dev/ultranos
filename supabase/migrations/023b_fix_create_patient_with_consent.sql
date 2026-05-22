-- Migration 023b: Correct create_patient_with_consent() to target consent_records.
-- Migration 023 created the function targeting a non-existent 'consents' table.
-- This replaces it with the correct implementation against consent_records.
--
-- p_consent expected keys:
--   consent_method     TEXT   — WRITTEN | VERBAL_WITNESSED | SELF_REGISTERED
--   witnessed_by       TEXT   — UUID string (optional, required for VERBAL_WITNESSED)
--   consent_language   TEXT   — en | ar | prs
--   consent_version    TEXT   — e.g. 'v1.0-en' (defaults to 'v1.0-en')
--   grantor_id         TEXT   — UUID string of the practitioner or auth user granting consent
--   grantor_role       TEXT   — e.g. 'PATIENT', 'PRACTITIONER' (defaults to 'PATIENT')
--   scope              JSONB  — text array, defaults to ['patient-privacy']

CREATE OR REPLACE FUNCTION create_patient_with_consent(
  p_patient JSONB,
  p_consent  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patient_id  UUID;
  v_consent_id  UUID;
  v_audit_hash  TEXT;
  v_scope       TEXT[];
BEGIN
  -- Insert patient row atomically
  INSERT INTO patients
  SELECT * FROM jsonb_populate_record(null::patients, p_patient)
  RETURNING id INTO v_patient_id;

  -- Default scope if not provided
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_consent->'scope')),
    ARRAY['patient-privacy']
  ) INTO v_scope;

  -- Compute audit hash: SHA-256 of (patient_id || consent payload || timestamp)
  v_audit_hash := encode(
    sha256((v_patient_id::text || p_consent::text || NOW()::text)::bytea),
    'hex'
  );

  INSERT INTO consent_records (
    id,
    patient_id,
    grantor_id,
    grantor_role,
    purpose,
    scope,
    valid_from,
    valid_until,
    status,
    consent_version,
    consent_method,
    witnessed_by,
    consent_language,
    audit_hash,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_patient_id,
    (p_consent->>'grantor_id')::UUID,
    COALESCE(p_consent->>'grantor_role', 'PATIENT'),
    'patient-privacy',
    v_scope,
    NOW(),
    NOW() + INTERVAL '3 years',
    'ACTIVE',
    COALESCE(p_consent->>'consent_version', 'v1.0-en'),
    p_consent->>'consent_method',
    NULLIF(p_consent->>'witnessed_by', '')::UUID,
    p_consent->>'consent_language',
    v_audit_hash,
    NOW()
  )
  RETURNING id INTO v_consent_id;

  RETURN jsonb_build_object(
    'patientId',  v_patient_id,
    'consentId',  v_consent_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION create_patient_with_consent(JSONB, JSONB) TO authenticated;
