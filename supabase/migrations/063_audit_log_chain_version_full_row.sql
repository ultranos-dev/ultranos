-- Migration 062: full-row hash-chain version (chain vNext) for the audit log.
--
-- ⚠️ AUTHORED, NOT APPLIED — Story 61.1 (Lane-E). Do NOT apply to the shared
--    Supabase project from this branch; it is deferred to the deploy step.
--
-- PROBLEM (audit finding P-AUDIT-1): the SHA-256 hash chain covers only 10
-- columns (prevHash + id/timestamp/actorId/actorRole/action/resourceType/
-- resourceId/patientId/outcome). The remaining PHI-context columns —
-- session_id, device_id, source_ip_hash, denial_reason, org_id, and metadata —
-- are NOT tamper-evident: they are protected only by the (droppable) append-only
-- triggers, not by the cryptographic chain.
--
-- FIX: introduce chain_version. NEW rows are written under version 2, whose hash
-- covers a canonical serialization of the FULL row (the 10 legacy fields PLUS
-- session_id, device_id, source_ip_hash, denial_reason, org_id, and a
-- canonicalized metadata object). Existing rows keep chain_version = 1 / NULL and
-- remain verifiable under the legacy 10-column hash — verifyChain() dispatches the
-- recompute per-row on chain_version, so the chain stays continuous across the
-- version boundary. chain_version is ordering/dispatch metadata only and is NOT
-- itself part of the hashed payload (append-only triggers already forbid mutating
-- it after insert).
--
-- PARITY: JS computeChainHash() (packages/audit-logger/src/logger.ts) and the RPC
-- below MUST produce byte-identical payloads. The v2 payload is:
--   json_build_object('prevHash',…,'id',…,'timestamp',…,'actorId',…,'actorRole',…,
--     'action',…,'resourceType',…,'resourceId',…,'patientId',…,'outcome',…,
--     'sessionId',…,'deviceId',…,'sourceIpHash',…,'denialReason',…,'orgId',…,
--     'metadata',<canonical metadata>)
--   → json_strip_nulls(...)::text  (drops null keys; compact, no spaces)
-- Metadata is canonicalized by jsonb_canonical_text() below, which sorts object
-- keys LEXICOGRAPHICALLY (matching JS Array.prototype.sort), strips nulls, and
-- emits compact JSON — because Postgres' native jsonb key ordering (length-then-
-- bytes) does NOT match JS. The canonical metadata text is spliced into the payload
-- as a raw JSON value.

-- ── 1. chain_version column ──────────────────────────────────────────────────
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS chain_version SMALLINT;

COMMENT ON COLUMN audit_log.chain_version IS
  'Hash-chain version: NULL/1 = legacy 10-column hash; 2 = full-row canonical hash. '
  'Dispatch key for verifyChain(). Not part of the hashed payload.';

-- ── 2. Canonical JSON serializer (parity with JS canonicalizeJson) ───────────
-- Produces the same compact text as JSON.stringify of a value whose object keys
-- are recursively sorted lexicographically and whose null properties are removed.
-- Arrays preserve order; array null elements are kept as null (matching JS).
CREATE OR REPLACE FUNCTION public.jsonb_canonical_text(v jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  k text;
  parts text[] := ARRAY[]::text[];
  elem jsonb;
  elem_text text;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN 'null';
  END IF;

  IF jsonb_typeof(v) = 'object' THEN
    FOR k IN SELECT key FROM jsonb_object_keys(v) AS t(key) ORDER BY key COLLATE "C"
    LOOP
      -- json_strip_nulls parity: drop keys whose value is JSON null.
      IF jsonb_typeof(v -> k) = 'null' THEN
        CONTINUE;
      END IF;
      parts := array_append(
        parts,
        to_jsonb(k)::text || ':' || public.jsonb_canonical_text(v -> k)
      );
    END LOOP;
    RETURN '{' || array_to_string(parts, ',') || '}';
  ELSIF jsonb_typeof(v) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(v) AS t(value)
    LOOP
      IF jsonb_typeof(elem) = 'null' THEN
        elem_text := 'null';
      ELSE
        elem_text := public.jsonb_canonical_text(elem);
      END IF;
      parts := array_append(parts, elem_text);
    END LOOP;
    RETURN '[' || array_to_string(parts, ',') || ']';
  ELSE
    -- Scalar (string/number/boolean): jsonb's own compact text is byte-identical
    -- to JSON.stringify for these primitive types.
    RETURN v::text;
  END IF;
END;
$function$;

-- ── 3. Recreate the emit RPC: accept p_chain_version, stamp it, and hash the ─
--       full row when version >= 2. The new arg makes this a DISTINCT function
--       identity from migration 045's 15-arg version, so drop the old one first —
--       otherwise both overloads coexist and a 15-arg call becomes ambiguous
--       ("could not choose best candidate"). The 16-arg version's p_chain_version
--       DEFAULT 1 serves any legacy 15-arg caller.
DROP FUNCTION IF EXISTS public.audit_emit_with_lock(
  text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, text
);
CREATE OR REPLACE FUNCTION public.audit_emit_with_lock(
  p_id text, p_timestamp text, p_actor_id text DEFAULT NULL::text, p_actor_role text DEFAULT NULL::text,
  p_action text DEFAULT NULL::text, p_resource_type text DEFAULT NULL::text, p_resource_id text DEFAULT NULL::text,
  p_patient_id text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text,
  p_source_ip_hash text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text, p_denial_reason text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT NULL::jsonb, p_org_id text DEFAULT NULL::text, p_chain_version smallint DEFAULT 1)
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
  v_version smallint := COALESCE(p_chain_version, 1);
BEGIN
  -- 1. Acquire transaction-scoped advisory lock to serialize chain writes
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain_lock'));

  -- 2. Read the current chain tip by chain order (NOT wall-clock timestamp).
  SELECT al.chain_hash INTO v_prev_hash
  FROM audit_log al
  ORDER BY al.chain_seq DESC NULLS LAST, al."timestamp" DESC, al.id DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  END IF;

  -- 3. Assign this row's monotonic chain position under the lock.
  v_seq := nextval('audit_log_chain_seq');

  -- 4. Build the JSON payload matching JS computeChainHash() exactly, per version.
  IF v_version >= 2 THEN
    -- FULL-ROW (v2): legacy 10 fields + the previously-unchained columns + canonical
    -- metadata. Metadata is spliced as a raw JSON value (jsonb_canonical_text) so JS
    -- and PG agree on key order; if metadata is NULL it is stripped by json_strip_nulls.
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
      'outcome', p_outcome,
      'sessionId', p_session_id,
      'deviceId', p_device_id,
      'sourceIpHash', p_source_ip_hash,
      'denialReason', p_denial_reason,
      'orgId', p_org_id,
      -- metadata is embedded as a canonical JSON STRING (text), NOT re-parsed to jsonb —
      -- re-parsing would let Postgres re-order the keys (length-then-bytes) and break JS
      -- parity. As a text value it lands in the payload as "metadata":"{...}", identical to
      -- the JS side. When metadata is absent we pass SQL NULL so json_strip_nulls drops the
      -- key entirely (matching the JS side, which omits it when metadata is null/undefined).
      'metadata', CASE WHEN p_metadata IS NULL THEN NULL
                       ELSE public.jsonb_canonical_text(p_metadata) END
    ))::text;
  ELSE
    -- LEGACY (v1): unchanged from migration 045.
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
  END IF;

  -- 5. Compute SHA-256 using pgcrypto (installed in extensions schema)
  v_chain_hash := encode(extensions.digest(v_json_payload, 'sha256'), 'hex');

  -- 6. Insert the new audit row (chain_seq + chain_version assigned).
  INSERT INTO audit_log (
    id, "timestamp", actor_id, actor_role, action, resource_type,
    resource_id, patient_id, session_id, device_id, source_ip_hash,
    outcome, denial_reason, chain_hash, metadata, org_id, chain_seq, chain_version
  ) VALUES (
    p_id::uuid, p_timestamp::timestamptz, p_actor_id::uuid, p_actor_role, p_action, p_resource_type,
    p_resource_id, p_patient_id::uuid, p_session_id::uuid, p_device_id, p_source_ip_hash,
    p_outcome, p_denial_reason, v_chain_hash, p_metadata, p_org_id::uuid, v_seq, v_version
  );

  -- 7. Return the full inserted row (signature unchanged — chain_seq/version not returned)
  RETURN QUERY
  SELECT
    p_id, p_timestamp, p_actor_id, p_actor_role, p_action, p_resource_type,
    p_resource_id, p_patient_id, p_session_id, p_device_id, p_source_ip_hash,
    p_outcome, p_denial_reason, v_chain_hash, p_metadata, p_org_id;
END;
$function$;
