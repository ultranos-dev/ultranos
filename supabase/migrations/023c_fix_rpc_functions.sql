-- Migration 023c: Fix critical issues in create_patient_with_consent and fetch_mpi_candidates.
--
-- Fixes applied:
--   1. Replace jsonb_populate_record mass-assignment with explicit column list in patients INSERT
--      (prevents caller injection of id, is_active, mpi_score, mpi_warn, created_at, updated_at)
--   2. Add grantor_id NULL guard before consent_records INSERT
--   3. Fix scope defaulting to handle JSON null without crashing
--   4. fetch_mpi_candidates: return '[]'::JSONB instead of NULL when no candidates found
--   5. Add comment to fetch_mpi_candidates clarifying phonetic field semantics
--
-- Skipped from requested column list (columns do not exist on patients table):
--   - name_local_enc
--   - mpi_proceed_token_jti

-- ─────────────────────────────────────────────────────────────────────────────
-- Function 1: create_patient_with_consent (corrected)
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Issue 2: Guard against missing grantor_id before any insert
  IF (p_consent->>'grantor_id') IS NULL THEN
    RAISE EXCEPTION 'consent grantor_id is required';
  END IF;

  -- Issue 1: Explicit column list — server-controlled columns (id, is_active, mpi_score,
  -- mpi_warn, created_at, updated_at) are NOT taken from caller input.
  -- Columns skipped (not present on patients table): name_local_enc, mpi_proceed_token_jti
  INSERT INTO patients (
    id,
    name_given,
    name_given_enc,
    name_father,
    name_father_enc,
    name_grandfather,
    name_grandfather_enc,
    name_phonetic_given,
    name_phonetic_father,
    name_phonetic_grandfather,
    name_local,
    name_latin,
    birth_date,
    birth_year,
    birth_year_only,
    gender,
    telecom_phone,
    national_id_hash,
    tazkira_paper_hash,
    biometric_fingerprint_hash,
    biometric_algorithm_version,
    address_province_origin,
    address_district_origin,
    address_village_origin,
    address_province_current,
    address_district_current,
    address_village_current,
    is_nomadic,
    identifiers,
    preferred_language,
    patient_tier,
    guardian_id,
    created_by,
    is_active,
    mpi_score,
    mpi_warn,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_patient->>'name_given',
    p_patient->>'name_given_enc',
    p_patient->>'name_father',
    p_patient->>'name_father_enc',
    p_patient->>'name_grandfather',
    p_patient->>'name_grandfather_enc',
    ARRAY(SELECT jsonb_array_elements_text(p_patient->'name_phonetic_given')),
    ARRAY(SELECT jsonb_array_elements_text(p_patient->'name_phonetic_father')),
    ARRAY(SELECT jsonb_array_elements_text(p_patient->'name_phonetic_grandfather')),
    p_patient->>'name_local',
    p_patient->>'name_latin',
    NULLIF(p_patient->>'birth_date', '')::DATE,
    NULLIF(p_patient->>'birth_year', '')::SMALLINT,
    COALESCE((p_patient->>'birth_year_only')::BOOLEAN, FALSE),
    p_patient->>'gender',
    p_patient->>'telecom_phone',
    p_patient->>'national_id_hash',
    p_patient->>'tazkira_paper_hash',
    p_patient->>'biometric_fingerprint_hash',
    p_patient->>'biometric_algorithm_version',
    p_patient->>'address_province_origin',
    p_patient->>'address_district_origin',
    p_patient->>'address_village_origin',
    p_patient->>'address_province_current',
    p_patient->>'address_district_current',
    p_patient->>'address_village_current',
    COALESCE((p_patient->>'is_nomadic')::BOOLEAN, FALSE),
    CASE WHEN p_patient->'identifiers' IS NOT NULL AND p_patient->>'identifiers' != 'null'
         THEN (p_patient->'identifiers')::JSONB
         ELSE NULL
    END,
    p_patient->>'preferred_language',
    COALESCE(p_patient->>'patient_tier', 'FREE'),
    NULLIF(p_patient->>'guardian_id', '')::UUID,
    NULLIF(p_patient->>'created_by', '')::UUID,
    -- server-controlled
    TRUE,
    NULL,
    FALSE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_patient_id;

  -- Issue 3: Scope defaulting — safe against JSON null
  v_scope := CASE
    WHEN jsonb_typeof(p_consent->'scope') = 'array'
         AND jsonb_array_length(p_consent->'scope') > 0
    THEN ARRAY(SELECT jsonb_array_elements_text(p_consent->'scope'))
    ELSE ARRAY['patient-privacy']
  END;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Function 2: fetch_mpi_candidates (corrected)
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: name_given, name_father, name_grandfather in the return payload are
-- normalized phonetic forms for MPI scoring only — NOT display names.
-- Display names are in the encrypted _enc columns (fetch separately).
CREATE OR REPLACE FUNCTION fetch_mpi_candidates(
  p_input JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phonetic_given        TEXT[];
  v_phonetic_father       TEXT[];
  v_national_id_hash      TEXT;
  v_tazkira_paper_hash    TEXT;
  v_biometric_hash        TEXT;
  v_birth_year            SMALLINT;
  v_district_origin       TEXT;
  v_phone                 TEXT;
BEGIN
  SELECT
    ARRAY(SELECT jsonb_array_elements_text(p_input->'phoneticGiven')),
    ARRAY(SELECT jsonb_array_elements_text(p_input->'phoneticFather')),
    p_input->>'nationalIdHash',
    p_input->>'tazkiraPaperHash',
    p_input->>'biometricFingerprintHash',
    (p_input->>'birthYear')::SMALLINT,
    p_input->>'addressDistrictOrigin',
    p_input->>'phone'
  INTO
    v_phonetic_given, v_phonetic_father,
    v_national_id_hash, v_tazkira_paper_hash, v_biometric_hash,
    v_birth_year, v_district_origin, v_phone;

  -- Issue 4: Return empty array instead of NULL when no candidates match
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(c))
      FROM (
        SELECT
          id,
          name_given,
          name_father,
          name_grandfather,
          name_phonetic_given,
          name_phonetic_father,
          name_phonetic_grandfather,
          birth_year,
          gender,
          address_district_origin,
          address_province_origin,
          telecom_phone    AS phone,
          national_id_hash,
          tazkira_paper_hash,
          biometric_fingerprint_hash
        FROM patients
        WHERE is_active = TRUE
          AND (
            (v_phonetic_given  IS NOT NULL AND array_length(v_phonetic_given,  1) > 0 AND name_phonetic_given  && v_phonetic_given)
            OR (v_phonetic_father IS NOT NULL AND array_length(v_phonetic_father, 1) > 0 AND name_phonetic_father && v_phonetic_father)
            OR (v_national_id_hash   IS NOT NULL AND national_id_hash        = v_national_id_hash)
            OR (v_tazkira_paper_hash IS NOT NULL AND tazkira_paper_hash      = v_tazkira_paper_hash)
            OR (v_biometric_hash     IS NOT NULL AND biometric_fingerprint_hash = v_biometric_hash)
            OR (v_birth_year IS NOT NULL AND v_district_origin IS NOT NULL
                AND birth_year = v_birth_year AND address_district_origin = v_district_origin)
            OR (v_phone IS NOT NULL AND telecom_phone = v_phone)
          )
        LIMIT 50
      ) c
    ),
    '[]'::JSONB
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fetch_mpi_candidates(JSONB) TO authenticated;
