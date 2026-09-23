-- Migration 064: org_security_policies
-- Story 56.3 — MFA as an admin-controlled, org-level feature toggle (default OFF).
--
-- Background
-- ----------
-- Post-audit decision (2026-09-23): MFA is NOT a platform-wide mandate. It is an
-- org-level feature toggle owned by the org Admin in the Admin Portal, disabled by
-- default, and enforced server-side at the Hub (aal2) ONLY when an org enables it.
-- Patient auth stays OTP-only and is never affected by this toggle.
--
-- This table is the single source of truth for the per-org security posture. The
-- Hub reads `mfa_required` (with a short-TTL in-memory cache) to decide whether to
-- require aal2 from staff-role tokens; clients only adapt UX. A row is created on
-- first write (upsert) — orgs with no row behave exactly as MFA-disabled (the
-- default), so this migration is behaviorally inert until an admin toggles it on.
--
-- APPLY: authored-not-applied. This file is committed for the deploy pipeline to
-- apply alongside other Wave-1/2 migrations — do NOT apply it ad hoc.

CREATE TABLE IF NOT EXISTS org_security_policies (
  -- One policy row per organization; the org id IS the primary key.
  org_id                UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- The toggle. Default false => MFA disabled => no aal requirement (today's behavior).
  mfa_required          BOOLEAN NOT NULL DEFAULT false,
  -- Rollout grace window (days) measured from mfa_enabled_at. During grace, staff at
  -- aal1 are warned + allowed (telemetry only); after grace, aal2 is enforced.
  -- Range 0..30 enforced both here (backstop) and in the tRPC input schema.
  mfa_grace_period_days INTEGER NOT NULL DEFAULT 7,
  -- Timestamp MFA was most recently turned ON. NULL while disabled. Grace is
  -- computed as mfa_enabled_at + mfa_grace_period_days.
  mfa_enabled_at        TIMESTAMPTZ,
  -- Auth user (admin) who last changed the policy. auth.users, not practitioners,
  -- because the actor is the signed-in admin identity (JWT sub).
  updated_by            UUID REFERENCES auth.users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grace window is a non-negative, bounded number of days (staging aid, not a
-- security knob). Keeps the string/int union honest at the DB layer.
ALTER TABLE org_security_policies
  ADD CONSTRAINT org_security_policies_grace_range_chk
  CHECK (mfa_grace_period_days >= 0 AND mfa_grace_period_days <= 30);

-- Defense-in-depth: RLS on, service_role only. All access is via the Hub tRPC
-- layer under the service-role key, org-scoped by ctx.user.orgId — never directly
-- from a browser session.
ALTER TABLE org_security_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_security_policies_service_all ON org_security_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Keep updated_at fresh on every write (backstop for the service logic which also
-- stamps it explicitly).
CREATE OR REPLACE FUNCTION update_org_security_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_security_policies_updated_at ON org_security_policies;
CREATE TRIGGER trg_org_security_policies_updated_at
  BEFORE UPDATE ON org_security_policies
  FOR EACH ROW EXECUTE FUNCTION update_org_security_policies_updated_at();

COMMENT ON TABLE org_security_policies IS
  'Story 56.3: per-org security posture. mfa_required is the admin-controlled MFA feature toggle (default OFF); the Hub enforces aal2 for staff roles only when true and past the grace window. Provider-agnostic; future per-role granularity can extend this row without a rename.';
