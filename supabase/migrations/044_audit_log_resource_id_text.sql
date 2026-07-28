-- Migration 044: audit_log.resource_id must be TEXT, not UUID.
--
-- An audit resourceId is a LOGICAL reference, not always a patient/row UUID.
-- List and aggregate audit events legitimately use semantic identifiers such as
-- 'patient-list', 'duplicate-review-list', 'expiring-soon', and
-- 'practitioner-encounters:<uuid>'. The audit_emit_with_lock RPC cast
-- p_resource_id::uuid, so every one of those inserts failed with
-- "invalid input syntax for type uuid", the emit() call threw, and the PHI_READ
-- audit was silently dropped (CLAUDE.md Rule #6 violation — every PHI access
-- MUST emit an event).
--
-- Fix: store resource_id as TEXT and stop casting it to uuid in the RPC.
-- The hash chain is unaffected: chain_hash is (and always was) computed from the
-- TEXT form of resource_id via json_build_object, so existing rows re-verify
-- identically and new rows hash the same as before.

ALTER TABLE audit_log
  ALTER COLUMN resource_id TYPE text USING resource_id::text;

-- Recreate the emit RPC with resource_id stored as text (only change from the
-- prior definition is `p_resource_id` in the INSERT, previously `p_resource_id::uuid`).
CREATE OR REPLACE FUNCTION public.audit_emit_with_lock(
  p_id text, p_timestamp text, p_actor_id text DEFAULT NULL::text, p_actor_role text DEFAULT NULL::text,
  p_action text DEFAULT NULL::text, p_resource_type text DEFAULT NULL::text, p_resource_id text DEFAULT NULL::text,
  p_patient_id text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text,
  p_source_ip_hash text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text, p_denial_reason text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT NULL::jsonb, p_org_id text DEFAULT NULL::text)
RETURNS TABLE(id text, "timestamp" text, actor_id text, actor_role text, action text, resource_type text,
  resource_id text, patient_id text, session_id text, device_id text, source_ip_hash text, outcome text,
  denial_reason text, chain_hash text, metadata jsonb, org_id text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_prev_hash text;
  v_chain_hash text;
  v_json_payload text;
BEGIN
  -- 1. Acquire transaction-scoped advisory lock to serialize chain writes
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain_lock'));

  -- 2. Read the latest chain_hash (or genesis if table is empty)
  SELECT al.chain_hash INTO v_prev_hash
  FROM audit_log al
  ORDER BY al."timestamp" DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  END IF;

  -- 3. Build the JSON payload matching JS computeChainHash() exactly.
  v_json_payload := json_strip_nulls(json_build_object(
    'prevHash', v_prev_hash,
    'id', p_id,
    'timestamp', p_timestamp,
    'actorId', p_actor_id,
    'actorRole', p_actor_role,
    'action', p_action,
    'resourceType', p_resource_type,
    'resourceId', p_resource_id,
    'patientId', p_patient_id,
    'outcome', p_outcome
  ))::text;

  -- 4. Compute SHA-256 using pgcrypto (installed in extensions schema)
  v_chain_hash := encode(extensions.digest(v_json_payload, 'sha256'), 'hex');

  -- 5. Insert the new audit row. resource_id is stored as TEXT (no uuid cast).
  INSERT INTO audit_log (
    id, "timestamp", actor_id, actor_role, action, resource_type,
    resource_id, patient_id, session_id, device_id, source_ip_hash,
    outcome, denial_reason, chain_hash, metadata, org_id
  ) VALUES (
    p_id::uuid, p_timestamp::timestamptz, p_actor_id::uuid, p_actor_role, p_action, p_resource_type,
    p_resource_id, p_patient_id::uuid, p_session_id::uuid, p_device_id, p_source_ip_hash,
    p_outcome, p_denial_reason, v_chain_hash, p_metadata, p_org_id::uuid
  );

  -- 6. Return the full inserted row
  RETURN QUERY
  SELECT
    p_id, p_timestamp, p_actor_id, p_actor_role, p_action, p_resource_type,
    p_resource_id, p_patient_id, p_session_id, p_device_id, p_source_ip_hash,
    p_outcome, p_denial_reason, v_chain_hash, p_metadata, p_org_id;
END;
$function$;
