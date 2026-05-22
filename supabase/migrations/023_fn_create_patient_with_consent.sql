-- Migration 023: Two Postgres RPC functions for MPI Phase 1.
-- Note: create_patient_with_consent was corrected in 023b to target consent_records.
-- This file is preserved for migration history. The authoritative version is 023b.

-- Function 1: Atomic patient + consent insert (see 023b for corrected version)
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

GRANT EXECUTE ON FUNCTION fetch_mpi_candidates(JSONB) TO authenticated;
