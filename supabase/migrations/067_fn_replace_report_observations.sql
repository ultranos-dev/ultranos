-- Migration 067: Atomic analyte replacement for lab result submission
-- (Story 61.3, audit M-HUB-4).
--
-- lab.submitResult replaces a report's structured analytes with:
--     DELETE FROM diagnostic_report_observations WHERE diagnostic_report_id = $1;
--     INSERT INTO diagnostic_report_observations (...) VALUES ...;
-- as two separate Supabase calls. A crash between the DELETE and the INSERT
-- leaves the report with its observations permanently LOST (deleted, never
-- re-inserted) — a silent clinical-data-loss window on every re-submission.
--
-- This RPC performs the delete + insert in ONE transaction: a crash rolls back
-- to the prior observation set, so a report can never end up with zero analytes
-- because a resubmit was interrupted. Idempotent-resubmit is preserved: passing
-- the same analyte set replaces like-for-like (the caller already computed the
-- authoritative full set), and passing an empty array clears them (matching the
-- prior behavior where an empty observations input skipped the INSERT after the
-- DELETE).
--
-- Model: create_patient_with_consent (023b) — SECURITY DEFINER, JSONB payload,
-- explicit column list. Ownership / lab-scoping is enforced by the tRPC caller
-- BEFORE this RPC runs (report row is upserted and lab-ownership-checked there),
-- so this RPC widens no privilege.
--
-- p_report_id   : the diagnostic_reports.id whose analytes are being replaced.
-- p_observations: JSONB array; each element is a full analyte row with keys:
--   observation_id, loinc_code, loinc_display, value_quantity, value_string,
--   interpretation, reference_range, note, effective_date_time.
-- Returns { observationCount }.
CREATE OR REPLACE FUNCTION replace_report_observations(
  p_report_id    UUID,
  p_observations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- 1. Clear the existing analyte set (idempotent re-delivery).
  DELETE FROM diagnostic_report_observations
   WHERE diagnostic_report_id = p_report_id;

  -- 2. Re-insert the caller-supplied authoritative set (may be empty).
  IF p_observations IS NOT NULL
     AND jsonb_typeof(p_observations) = 'array'
     AND jsonb_array_length(p_observations) > 0 THEN
    INSERT INTO diagnostic_report_observations (
      diagnostic_report_id,
      observation_id,
      loinc_code,
      loinc_display,
      value_quantity,
      value_string,
      interpretation,
      reference_range,
      note,
      effective_date_time
    )
    SELECT
      p_report_id,
      (o->>'observation_id')::UUID,
      COALESCE(o->>'loinc_code', 'UNKNOWN'),
      o->>'loinc_display',
      CASE WHEN jsonb_typeof(o->'value_quantity') = 'null' THEN NULL ELSE o->'value_quantity' END,
      o->>'value_string',
      CASE WHEN jsonb_typeof(o->'interpretation') = 'null' THEN NULL ELSE o->'interpretation' END,
      CASE WHEN jsonb_typeof(o->'reference_range') = 'null' THEN NULL ELSE o->'reference_range' END,
      CASE WHEN jsonb_typeof(o->'note') = 'null' THEN NULL ELSE o->'note' END,
      NULLIF(o->>'effective_date_time', '')::TIMESTAMPTZ
    FROM jsonb_array_elements(p_observations) AS o;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('observationCount', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION replace_report_observations(UUID, JSONB) TO authenticated;
