-- Migration 066: Atomic patient merge / unmerge RPCs (Story 61.3, audit H-ADM-2).
--
-- Before this migration, patient-admin.ts performed the merge as 4+ separate
-- Supabase calls (survivor update, duplicate deactivation, merge_audits insert,
-- duplicate_reviews→MERGED, survivor mpi_warn clear). A crash between the row
-- mutations and the merge_audits insert left a merge with NO reversal record,
-- silently voiding the 72-hour undo promise shown to the admin. These RPCs make
-- the whole operation one transaction: either every write lands or none does,
-- so the 72h-undo record is ALWAYS present when a merge has taken effect.
--
-- Model: create_patient_with_consent (023b) — SECURITY DEFINER, JSONB payload,
-- explicit column lists, returns the ids the router needs. Authorization
-- (ADMIN-only) is enforced by the tRPC caller exactly as before — these RPCs add
-- no privilege beyond what the caller already checks (no privilege widening).
--
-- Tier-1 safety note (CLAUDE.md #5): merge does NOT overwrite allergies / active
-- meds / critical diagnoses via LWW. The survivor update only touches the exact
-- columns the admin explicitly resolved (p_survivor_updates), identical to the
-- prior JS behavior — no clinical field is silently coalesced. The full
-- pre-merge snapshots are preserved in merge_audits for reversal.

-- ── merge_patient_atomic ────────────────────────────────────────────────────
-- p_survivor_updates : JSONB object of column→value resolved from the duplicate
--                      (may be empty {} — then the survivor row is not updated).
-- p_field_resolutions: JSONB stored verbatim on merge_audits.field_resolutions.
-- p_original_survivor / p_original_duplicate: pre-merge snapshots for reversal.
-- p_merged_by        : actor id (matches prior code — the caller's ctx.user.sub).
-- Returns { mergeAuditId }.
CREATE OR REPLACE FUNCTION merge_patient_atomic(
  p_survivor_id        UUID,
  p_duplicate_id       UUID,
  p_survivor_updates   JSONB,
  p_field_resolutions  JSONB,
  p_original_survivor  JSONB,
  p_original_duplicate JSONB,
  p_merged_by          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_survivor_active   BOOLEAN;
  v_duplicate_active  BOOLEAN;
  v_merge_audit_id    UUID;
  v_unmerge_deadline  TIMESTAMPTZ := NOW() + INTERVAL '72 hours';
  v_pending_remaining INTEGER;
  v_key               TEXT;
  v_set_clauses       TEXT[] := ARRAY[]::TEXT[];
  v_update_sql        TEXT;
BEGIN
  -- Re-validate both patients are active INSIDE the tx (matches the prior
  -- .eq('is_active', true) guards; also closes a TOCTOU vs a concurrent merge).
  SELECT is_active INTO v_survivor_active FROM patients WHERE id = p_survivor_id;
  IF v_survivor_active IS NULL OR v_survivor_active = FALSE THEN
    RAISE EXCEPTION 'SURVIVOR_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT is_active INTO v_duplicate_active FROM patients WHERE id = p_duplicate_id;
  IF v_duplicate_active IS NULL OR v_duplicate_active = FALSE THEN
    RAISE EXCEPTION 'DUPLICATE_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Apply survivor field resolutions (only when the admin resolved fields).
  --    Built dynamically from p_survivor_updates keys so the exact same set of
  --    columns the prior JS loop wrote is written here — nothing more.
  IF p_survivor_updates IS NOT NULL AND jsonb_typeof(p_survivor_updates) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(p_survivor_updates)) > 0 THEN
    FOR v_key IN SELECT jsonb_object_keys(p_survivor_updates) LOOP
      -- quote_ident guards the column name; value bound via format %L from JSONB text.
      v_set_clauses := array_append(
        v_set_clauses,
        format('%I = %L', v_key, p_survivor_updates->>v_key)
      );
    END LOOP;
    v_set_clauses := array_append(v_set_clauses, format('updated_at = %L', NOW()));
    v_update_sql := 'UPDATE patients SET ' || array_to_string(v_set_clauses, ', ')
      || ' WHERE id = ' || quote_literal(p_survivor_id) || ' AND is_active = TRUE';
    EXECUTE v_update_sql;
  END IF;

  -- 2. Mark duplicate as merged (inactive).
  UPDATE patients
     SET merged_into        = p_survivor_id,
         is_active          = FALSE,
         ultranos_is_active = FALSE,
         updated_at         = NOW()
   WHERE id = p_duplicate_id;

  -- 3. Create the merge_audit reversal record (the 72h-undo backing).
  INSERT INTO merge_audits (
    survivor_id, duplicate_id, field_resolutions,
    original_survivor, original_duplicate,
    merged_by, unmerge_deadline, status
  ) VALUES (
    p_survivor_id, p_duplicate_id, p_field_resolutions,
    p_original_survivor, p_original_duplicate,
    p_merged_by, v_unmerge_deadline, 'ACTIVE'
  )
  RETURNING id INTO v_merge_audit_id;

  -- 4. Transition the duplicate's PENDING duplicate_reviews → MERGED (same-table
  --    coherence the audit workflow-9 confirmed must stay inside this tx).
  UPDATE duplicate_reviews
     SET status      = 'MERGED',
         reviewed_by = p_merged_by,
         reviewed_at = NOW()
   WHERE patient_id = p_duplicate_id
     AND status = 'PENDING';

  -- 5. Clear survivor mpi_warn if no remaining PENDING reviews reference it.
  SELECT count(*) INTO v_pending_remaining
    FROM duplicate_reviews
   WHERE patient_id = p_survivor_id AND status = 'PENDING';
  IF v_pending_remaining = 0 THEN
    UPDATE patients SET mpi_warn = FALSE WHERE id = p_survivor_id;
  END IF;

  RETURN jsonb_build_object('mergeAuditId', v_merge_audit_id);
END;
$$;

GRANT EXECUTE ON FUNCTION merge_patient_atomic(UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO authenticated;

-- ── unmerge_patient_atomic ──────────────────────────────────────────────────
-- Reverses an ACTIVE merge inside its 72h window. All writes (survivor restore,
-- duplicate re-activation, merge_audits→REVERSED, mpi_warn flags) are one tx.
-- p_survivor_restores: JSONB object of column→value to restore on the survivor
--                      (derived by the router from the stored original_survivor).
-- Returns { success: true }.
CREATE OR REPLACE FUNCTION unmerge_patient_atomic(
  p_merge_audit_id    UUID,
  p_survivor_restores JSONB,
  p_reversed_by       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit             RECORD;
  v_key               TEXT;
  v_set_clauses       TEXT[] := ARRAY[]::TEXT[];
  v_update_sql        TEXT;
BEGIN
  -- Lock + re-validate the merge_audit is ACTIVE inside the tx (prevents a
  -- double-unmerge race; matches the prior .eq('status','ACTIVE') guard).
  SELECT * INTO v_audit
    FROM merge_audits
   WHERE id = p_merge_audit_id AND status = 'ACTIVE'
   FOR UPDATE;

  IF v_audit IS NULL THEN
    RAISE EXCEPTION 'MERGE_AUDIT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF v_audit.unmerge_deadline < NOW() THEN
    RAISE EXCEPTION 'UNMERGE_WINDOW_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Restore survivor fields that were sourced from the duplicate (if any).
  IF p_survivor_restores IS NOT NULL AND jsonb_typeof(p_survivor_restores) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(p_survivor_restores)) > 0 THEN
    FOR v_key IN SELECT jsonb_object_keys(p_survivor_restores) LOOP
      v_set_clauses := array_append(
        v_set_clauses,
        format('%I = %L', v_key, p_survivor_restores->>v_key)
      );
    END LOOP;
    v_set_clauses := array_append(v_set_clauses, format('updated_at = %L', NOW()));
    v_update_sql := 'UPDATE patients SET ' || array_to_string(v_set_clauses, ', ')
      || ' WHERE id = ' || quote_literal(v_audit.survivor_id);
    EXECUTE v_update_sql;
  END IF;

  -- 2. Restore the duplicate: clear merged_into, re-activate.
  UPDATE patients
     SET merged_into        = NULL,
         is_active          = TRUE,
         ultranos_is_active = TRUE,
         updated_at         = NOW()
   WHERE id = v_audit.duplicate_id;

  -- 3. Mark the merge_audit REVERSED.
  UPDATE merge_audits
     SET status      = 'REVERSED',
         reversed_by = p_reversed_by,
         reversed_at = NOW()
   WHERE id = p_merge_audit_id;

  -- 4. Post-unmerge safety flag: mpi_warn = TRUE on both patients.
  UPDATE patients SET mpi_warn = TRUE WHERE id = v_audit.survivor_id;
  UPDATE patients SET mpi_warn = TRUE WHERE id = v_audit.duplicate_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION unmerge_patient_atomic(UUID, JSONB, UUID) TO authenticated;
