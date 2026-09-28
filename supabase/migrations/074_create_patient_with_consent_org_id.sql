-- 074: recreate create_patient_with_consent adding org_id passthrough (from
-- p_patient->>'org_id'). Backward-compatible: NULL when absent (legacy free-floating).
-- Body identical to migration 072 + the org_id INSERT column/value.
--
-- NOTE: applied to the remote project via the Supabase MCP (migration name:
-- create_patient_with_consent_org_id); this file mirrors it so migration history
-- stays in sync.
CREATE OR REPLACE FUNCTION public.create_patient_with_consent(
  p_patient jsonb,
  p_consent jsonb,
  p_allergies jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_patient_id  UUID;
  v_consent_id  UUID;
  v_audit_hash  TEXT;
  v_scope       TEXT[];
  v_allergy     JSONB;
  v_recorder    TEXT;
BEGIN
  IF (p_consent->>'grantor_id') IS NULL THEN
    RAISE EXCEPTION 'consent grantor_id is required';
  END IF;

  INSERT INTO patients (
    id,
    name_given, name_given_enc,
    name_father, name_father_enc,
    name_grandfather, name_grandfather_enc,
    name_family, name_family_enc,
    name_phonetic_given, name_phonetic_father, name_phonetic_grandfather,
    name_local, name_latin,
    birth_date, birth_year, birth_year_only,
    gender,
    telecom_phone, telecom_phone_use,
    national_id_hash, national_id_type, national_id_last4,
    tazkira_paper_hash,
    biometric_fingerprint_hash, biometric_algorithm_version,
    address_province_origin, address_district_origin, address_village_origin,
    address_province_current, address_district_current, address_village_current,
    is_nomadic,
    identifiers,
    household_id,
    marital_status,
    displacement_category, nationality, occupation, education_level, disability,
    blood_group, photo_url,
    emergency_contacts,
    preferred_language,
    patient_tier,
    org_id,
    guardian_id,
    created_by,
    is_active, mpi_score, mpi_warn,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    p_patient->>'name_given', p_patient->>'name_given_enc',
    p_patient->>'name_father', p_patient->>'name_father_enc',
    p_patient->>'name_grandfather', p_patient->>'name_grandfather_enc',
    p_patient->>'name_family', p_patient->>'name_family_enc',
    ARRAY(SELECT jsonb_array_elements_text(p_patient->'name_phonetic_given')),
    ARRAY(SELECT jsonb_array_elements_text(p_patient->'name_phonetic_father')),
    ARRAY(SELECT jsonb_array_elements_text(p_patient->'name_phonetic_grandfather')),
    p_patient->>'name_local', p_patient->>'name_latin',
    NULLIF(p_patient->>'birth_date', '')::DATE,
    NULLIF(p_patient->>'birth_year', '')::SMALLINT,
    COALESCE((p_patient->>'birth_year_only')::BOOLEAN, FALSE),
    p_patient->>'gender',
    p_patient->>'telecom_phone', p_patient->>'telecom_phone_use',
    p_patient->>'national_id_hash', p_patient->>'national_id_type', NULLIF(p_patient->>'national_id_last4', ''),
    p_patient->>'tazkira_paper_hash',
    p_patient->>'biometric_fingerprint_hash', p_patient->>'biometric_algorithm_version',
    p_patient->>'address_province_origin', p_patient->>'address_district_origin', p_patient->>'address_village_origin',
    p_patient->>'address_province_current', p_patient->>'address_district_current', p_patient->>'address_village_current',
    COALESCE((p_patient->>'is_nomadic')::BOOLEAN, FALSE),
    CASE WHEN p_patient->'identifiers' IS NOT NULL AND p_patient->>'identifiers' != 'null'
         THEN (p_patient->'identifiers')::JSONB
         ELSE NULL
    END,
    NULLIF(p_patient->>'household_id', ''),
    NULLIF(p_patient->>'marital_status', ''),
    NULLIF(p_patient->>'displacement_category', ''),
    NULLIF(p_patient->>'nationality', ''),
    NULLIF(p_patient->>'occupation', ''),
    NULLIF(p_patient->>'education_level', ''),
    NULLIF(p_patient->>'disability', '')::BOOLEAN,
    NULLIF(p_patient->>'blood_group', ''),
    NULLIF(p_patient->>'photo_url', ''),
    COALESCE(NULLIF(p_patient->>'emergency_contacts', '')::JSONB, '[]'::JSONB),
    p_patient->>'preferred_language',
    COALESCE(p_patient->>'patient_tier', 'FREE'),
    NULLIF(p_patient->>'org_id', '')::UUID,
    NULLIF(p_patient->>'guardian_id', '')::UUID,
    NULLIF(p_patient->>'created_by', '')::UUID,
    TRUE,
    NULL,
    FALSE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_patient_id;

  v_scope := CASE
    WHEN jsonb_typeof(p_consent->'scope') = 'array'
         AND jsonb_array_length(p_consent->'scope') > 0
    THEN ARRAY(SELECT jsonb_array_elements_text(p_consent->'scope'))
    ELSE ARRAY['TREATMENT']
  END;

  v_audit_hash := encode(
    sha256((v_patient_id::text || p_consent::text || NOW()::text)::bytea),
    'hex'
  );

  INSERT INTO consent_records (
    id, patient_id, grantor_id, grantor_role, purpose, scope,
    valid_from, valid_until, status, consent_version, consent_method,
    witnessed_by, consent_language, audit_hash, created_at
  ) VALUES (
    gen_random_uuid(),
    v_patient_id,
    (p_consent->>'grantor_id')::UUID,
    COALESCE(p_consent->>'grantor_role', 'SELF'),
    'TREATMENT',
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

  v_recorder := NULLIF(p_patient->>'created_by', '');
  FOR v_allergy IN SELECT * FROM jsonb_array_elements(COALESCE(p_allergies, '[]'::jsonb))
  LOOP
    CONTINUE WHEN NULLIF(v_allergy->>'substance_text', '') IS NULL;
    INSERT INTO allergy_intolerances (
      id, clinical_status_code, verification_status_code, type, criticality,
      substance_text, substance_code, substance_system, substance_free_text,
      patient_ref, recorder_ref, recorded_date,
      hlc_timestamp, synced_by, synced_at, meta_last_updated
    ) VALUES (
      gen_random_uuid(),
      'active',
      'unconfirmed',
      'allergy',
      COALESCE(NULLIF(v_allergy->>'criticality', ''), 'unable-to-assess'),
      v_allergy->>'substance_text',
      NULLIF(v_allergy->>'substance_code', ''),
      NULLIF(v_allergy->>'substance_system', ''),
      v_allergy->>'substance_text',
      v_patient_id::text,
      v_recorder,
      NOW(),
      COALESCE(NULLIF(v_allergy->>'hlc_timestamp', ''), '0'),
      COALESCE(v_recorder, 'system'),
      NOW(),
      NOW()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'patientId', v_patient_id,
    'consentId', v_consent_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;
