-- ============================================================
-- Migration 030: Atomic Last-Manager Role Update RPC
-- Story 55.1 AC #3: Prevent demotion of the last LAB_MANAGER
-- via a single transaction with SELECT...FOR UPDATE.
--
-- Fixes TOCTOU race condition in the existing updateStaffRole
-- endpoint where two concurrent demotions could both pass the
-- count check, leaving zero managers.
-- ============================================================

CREATE OR REPLACE FUNCTION update_lab_role_atomic(
  p_target_id UUID,
  p_lab_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_previous_role TEXT;
  v_manager_count INT;
  v_valid_roles TEXT[] := ARRAY['LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER'];
BEGIN
  -- Validate new role value
  IF p_new_role != ALL(v_valid_roles) THEN
    RAISE EXCEPTION 'Invalid lab role: %. Must be one of: LAB_TECH, SENIOR_TECH, SUPERVISOR, LAB_MANAGER', p_new_role;
  END IF;

  -- Get the target's current role (FOR UPDATE locks the row to prevent concurrent mutations)
  SELECT lab_role INTO v_previous_role
  FROM lab_technicians
  WHERE practitioner_id = p_target_id AND lab_id = p_lab_id
  FOR UPDATE;

  IF v_previous_role IS NULL THEN
    RAISE EXCEPTION 'Staff member not found in this lab';
  END IF;

  -- No-op if same role
  IF v_previous_role = p_new_role THEN
    RETURN jsonb_build_object('success', true, 'previousRole', v_previous_role, 'newRole', p_new_role, 'changed', false);
  END IF;

  -- Last-manager protection: lock all LAB_MANAGER rows for this lab
  IF v_previous_role = 'LAB_MANAGER' AND p_new_role != 'LAB_MANAGER' THEN
    SELECT COUNT(*) INTO v_manager_count
    FROM lab_technicians
    WHERE lab_id = p_lab_id AND lab_role = 'LAB_MANAGER'
    FOR UPDATE;

    IF v_manager_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last Lab Manager in this lab';
    END IF;
  END IF;

  -- Perform the update
  UPDATE lab_technicians
  SET lab_role = p_new_role
  WHERE practitioner_id = p_target_id AND lab_id = p_lab_id;

  RETURN jsonb_build_object('success', true, 'previousRole', v_previous_role, 'newRole', p_new_role, 'changed', true);
END;
$$;

-- Grant execute to service_role only — API-layer (adminProcedure / labRestrictedProcedure)
-- enforces authorization. Authenticated users must NOT call this RPC directly because
-- SECURITY DEFINER bypasses RLS.
GRANT EXECUTE ON FUNCTION update_lab_role_atomic(UUID, UUID, TEXT) TO service_role;
