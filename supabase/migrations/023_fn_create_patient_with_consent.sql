-- Migration 023: Two Postgres RPC functions for MPI Phase 1.

-- Function 1: Atomic patient + consent insert
CREATE OR REPLACE FUNCTION create_patient_with_consent(
  p_patient JSONB,
  p_consent  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patient_id UUID;
  v_consent_id UUID;
BEGIN
  INSERT INTO patients
  SELECT * FROM jsonb_populate_record(null::patients, p_patient)
  RETURNING id INTO v_patient_id;

  INSERT INTO consents (
    id,
    patient_id,
    status,
    scope,
    provision_start,
    provision_end,
    consent_method,
    witnessed_by,
    consent_language,
    consent_version,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_patient_id,
    'active',
    'patient-privacy',
    NOW(),
    NOW() + INTERVAL '3 years',
    p_consent->>'consent_method',
    NULLIF(p_consent->>'witnessed_by', '')::UUID,
    p_consent->>'consent_language',
    COALESCE(p_consent->>'consent_version', 'v1.0-en'),
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

-- Function 2: MPI candidate retrieval
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

  RETURN (
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
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_patient_with_consent(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_mpi_candidates(JSONB) TO authenticated;
