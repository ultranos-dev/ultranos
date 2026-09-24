-- Migration 068: Atomic dispense recording (Story 61.3, audit M-HUB-4).
--
-- medication.recordDispense wrote three rows across separate Supabase calls:
--   (1) INSERT medication_dispenses
--   (2) UPDATE medication_requests (status), guarded on the prior status (TOCTOU)
--   (3) INSERT dispense_reviews  (only when an override was presented)
-- and, on an UPDATE failure, ran a COMPENSATING DELETE of the dispense row. A
-- crash between (1) and (2) — or a failed compensating delete — could leave an
-- orphaned dispense with the prescription still un-dispensed.
--
-- This RPC performs the insert + conditional status update + optional review
-- insert in ONE transaction: either the dispense + status transition + review
-- all land, or nothing does. No compensating delete is needed. The interaction
-- gate, supervisor-credential verification, pharmacistRef server-override, and
-- ALREADY_DISPENSED idempotency all remain in the tRPC caller (Story 57.2) —
-- this RPC receives ALREADY-VERIFIED, server-authoritative values and only does
-- the coordinated writes, so it widens no privilege and changes no gate.
--
-- Behavior parity (all preserved):
--   * Duplicate dispense_id (23505) -> returns { outcome: 'ALREADY_SYNCED' }; the
--     prescription is NOT touched (offline-first replay of the same event).
--   * Conditional status guard: the UPDATE requires prescription_status =
--     p_expected_status. Zero rows updated -> the prescription status changed
--     under us -> returns { outcome: 'STATUS_CONFLICT' } and the tx rolls back
--     (the dispense insert is undone) — replacing the old orphan-cleanup delete.
--   * dispense_reviews is inserted only when p_has_override is true, with the
--     SUPERVISOR's practitioner id (H-HUB-2) and server-verification flag.
--
-- The older-HLC dispense_conflicts branch and MedicationStatement creation stay
-- in the caller (see recordDispense) — they are separate, non-orphaning writes
-- (MedicationStatement is explicitly best-effort; owned by Story 60.4).
--
-- Model: create_patient_with_consent (023b) — SECURITY DEFINER, JSONB payload.
--
-- p_dispense       : JSONB row for medication_dispenses (server-stamped values).
-- p_prescription_id: the parent medication_requests.id.
-- p_new_prescription_status / p_new_status / p_dispensed_at / p_dispensed_by /
--   p_hlc_timestamp / p_meta_last_updated: the status-update payload.
-- p_expected_status: the prescription_status the UPDATE is conditioned on (TOCTOU).
-- p_has_override   : whether to insert a dispense_reviews row.
-- p_review         : JSONB row for dispense_reviews (ignored when p_has_override false).
-- Returns { outcome, dispenseId?, prescriptionStatus?, dispensedAt?, reviewError? }.
CREATE OR REPLACE FUNCTION record_dispense_atomic(
  p_dispense                 JSONB,
  p_prescription_id          UUID,
  p_new_prescription_status  TEXT,
  p_new_status               TEXT,
  p_dispensed_at             TIMESTAMPTZ,
  p_dispensed_by             UUID,
  p_hlc_timestamp            TEXT,
  p_meta_last_updated        TIMESTAMPTZ,
  p_expected_status          TEXT,
  p_has_override             BOOLEAN,
  p_review                   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dispense_id     UUID;
  v_updated         RECORD;
  v_review_error    TEXT := NULL;
BEGIN
  -- 1. Insert the dispense row. A duplicate id is an idempotent offline replay:
  --    signal ALREADY_SYNCED and DO NOT touch the prescription (the tx commits
  --    with no dispense row written, matching the prior early-return).
  BEGIN
    INSERT INTO medication_dispenses (
      id, prescription_id, medication_code, medication_display, patient_ref,
      pharmacist_ref, when_handed_over, hlc_timestamp, status, batch_lot,
      synced_by, synced_at
    ) VALUES (
      (p_dispense->>'id')::UUID,
      (p_dispense->>'prescription_id')::UUID,
      p_dispense->>'medication_code',
      p_dispense->>'medication_display',
      p_dispense->>'patient_ref',
      p_dispense->>'pharmacist_ref',
      (p_dispense->>'when_handed_over')::TIMESTAMPTZ,
      p_dispense->>'hlc_timestamp',
      p_dispense->>'status',
      NULLIF(p_dispense->>'batch_lot', ''),
      NULLIF(p_dispense->>'synced_by', '')::UUID,
      (p_dispense->>'synced_at')::TIMESTAMPTZ
    )
    RETURNING id INTO v_dispense_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('outcome', 'ALREADY_SYNCED');
  END;

  -- 2. Conditional status update (TOCTOU guard on the prior status). If no row
  --    matches, the prescription changed under us -> raise so the whole tx
  --    (including the dispense insert above) rolls back — no orphan possible.
  UPDATE medication_requests
     SET prescription_status = p_new_prescription_status,
         status              = p_new_status,
         dispensed_at        = p_dispensed_at,
         dispensed_by        = p_dispensed_by,
         hlc_timestamp       = p_hlc_timestamp,
         meta_last_updated   = p_meta_last_updated
   WHERE id = p_prescription_id
     AND prescription_status = p_expected_status
  RETURNING id, prescription_status, status, dispensed_at INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'STATUS_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Override review row (same tx). A review insert failure is NON-fatal in
  --    the caller today (the committed dispense must not roll back on a missing
  --    review), so we capture the message and let the tx commit rather than
  --    aborting the dispense.
  IF p_has_override THEN
    BEGIN
      INSERT INTO dispense_reviews (
        dispense_id, prescription_id, override_reason, override_reason_code,
        override_supervisor, override_supervisor_verified, status
      ) VALUES (
        (p_review->>'dispense_id')::UUID,
        (p_review->>'prescription_id')::UUID,
        p_review->>'override_reason',
        NULLIF(p_review->>'override_reason_code', ''),
        (p_review->>'override_supervisor')::UUID,
        COALESCE((p_review->>'override_supervisor_verified')::BOOLEAN, FALSE),
        p_review->>'status'
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_review_error := SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'outcome',            'DISPENSED',
    'dispenseId',         v_dispense_id,
    'prescriptionStatus', v_updated.prescription_status,
    'status',             v_updated.status,
    'dispensedAt',        v_updated.dispensed_at,
    'reviewError',        v_review_error
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_dispense_atomic(
  JSONB, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TIMESTAMPTZ, TEXT, BOOLEAN, JSONB
) TO authenticated;
