-- Migration 045: monotonic chain-order sequence for the audit log.
--
-- PROBLEM: AuditLogger.emit() stamps `timestamp` in JS BEFORE the RPC acquires
-- its advisory lock. Under concurrency, two emits can be serialized by the lock
-- in a different order than their JS timestamps, so a row can be stored with a
-- timestamp earlier than the row it actually chains onto. verifyChain ordered by
-- `timestamp`, so it walked such rows out of chain order and reported FALSE
-- integrity failures (the chain itself is fine — the advisory lock prevents forks;
-- only the *verification ordering* was wrong).
--
-- FIX: assign a monotonic `chain_seq` from a sequence INSIDE the locked RPC, and
-- order the chain by chain_seq instead of the wall-clock timestamp. Because it is
-- assigned under the same advisory lock that serializes inserts, chain_seq strictly
-- increases in true chain order — tie-free (unlike sub-millisecond timestamps) and
-- independent of any timestamp string format. `timestamp` remains the (legitimately
-- pre-lock) wall-clock of the event; it is simply no longer the ordering key.
--
-- chain_seq is ordering metadata only and is NOT part of the hash: integrity is
-- still enforced by the prevHash linkage, and audit_log is append-only (BEFORE
-- UPDATE/DELETE triggers) so chain_seq cannot be altered after insert. Pre-existing
-- rows keep chain_seq = NULL (append-only forbids backfilling them) and continue to
-- be ordered by timestamp, exactly as before — no historical row is mutated.

CREATE SEQUENCE IF NOT EXISTS audit_log_chain_seq;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS chain_seq BIGINT;

-- Composite index for tip lookup (RPC) and verification windowing:
-- seq'd rows first (newest chain position), legacy null-seq rows by timestamp.
CREATE INDEX IF NOT EXISTS idx_audit_log_chain_seq
  ON audit_log (chain_seq DESC NULLS LAST, "timestamp" DESC);

-- The emit RPC runs as the calling role (SECURITY INVOKER); those roles need
-- USAGE on the sequence to call nextval().
GRANT USAGE ON SEQUENCE audit_log_chain_seq TO authenticated, service_role;

-- Recreate the emit RPC: assign chain_seq under the lock, and pick the chain tip
-- by chain order (chain_seq first, timestamp only as a fallback while seq'd rows
-- do not yet exist). Signature and hash inputs are unchanged from migration 044.
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
  v_seq bigint;
BEGIN
  -- 1. Acquire transaction-scoped advisory lock to serialize chain writes
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain_lock'));

  -- 2. Read the current chain tip by chain order (NOT wall-clock timestamp).
  --    Newly-seq'd rows sort first; while none exist yet, fall back to timestamp.
  SELECT al.chain_hash INTO v_prev_hash
  FROM audit_log al
  ORDER BY al.chain_seq DESC NULLS LAST, al."timestamp" DESC, al.id DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  END IF;

  -- 3. Assign this row's monotonic chain position under the lock.
  v_seq := nextval('audit_log_chain_seq');

  -- 4. Build the JSON payload matching JS computeChainHash() exactly (unchanged).
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

  -- 5. Compute SHA-256 using pgcrypto (installed in extensions schema)
  v_chain_hash := encode(extensions.digest(v_json_payload, 'sha256'), 'hex');

  -- 6. Insert the new audit row (resource_id stored as text; chain_seq assigned).
  INSERT INTO audit_log (
    id, "timestamp", actor_id, actor_role, action, resource_type,
    resource_id, patient_id, session_id, device_id, source_ip_hash,
    outcome, denial_reason, chain_hash, metadata, org_id, chain_seq
  ) VALUES (
    p_id::uuid, p_timestamp::timestamptz, p_actor_id::uuid, p_actor_role, p_action, p_resource_type,
    p_resource_id, p_patient_id::uuid, p_session_id::uuid, p_device_id, p_source_ip_hash,
    p_outcome, p_denial_reason, v_chain_hash, p_metadata, p_org_id::uuid, v_seq
  );

  -- 7. Return the full inserted row (signature unchanged — chain_seq not returned)
  RETURN QUERY
  SELECT
    p_id, p_timestamp, p_actor_id, p_actor_role, p_action, p_resource_type,
    p_resource_id, p_patient_id, p_session_id, p_device_id, p_source_ip_hash,
    p_outcome, p_denial_reason, v_chain_hash, p_metadata, p_org_id;
END;
$function$;
