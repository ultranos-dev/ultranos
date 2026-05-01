-- ============================================================
-- Migration 010: Practitioner Key Lifecycle Management
-- Story 7.4: Ed25519 public key registry with revocation support
-- ============================================================

CREATE TABLE IF NOT EXISTS practitioner_keys (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id       UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  public_key_ed25519    TEXT NOT NULL UNIQUE,
  revoked_at            TIMESTAMPTZ,
  revocation_reason     TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for KRL queries: find all revoked keys efficiently
CREATE INDEX idx_practitioner_keys_revoked
  ON practitioner_keys (revoked_at)
  WHERE revoked_at IS NOT NULL;

-- Index for practitioner lookup
CREATE INDEX idx_practitioner_keys_practitioner
  ON practitioner_keys (practitioner_id);

-- RLS: restrict direct table access (all access goes through Hub API service role)
ALTER TABLE practitioner_keys ENABLE ROW LEVEL SECURITY;

-- Service role (Hub API) has full access
CREATE POLICY "service_role_full_access" ON practitioner_keys
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read key status (for cache revalidation)
CREATE POLICY "authenticated_read_keys" ON practitioner_keys
  FOR SELECT
  USING (auth.role() = 'authenticated');
