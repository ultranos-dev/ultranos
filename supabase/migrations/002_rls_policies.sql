-- ============================================================
-- Migration 002: Row Level Security
-- All tables RLS-enabled. Hub API uses service_role (bypasses RLS).
-- RLS is a defense-in-depth layer against direct DB access.
-- ============================================================

ALTER TABLE practitioners   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- service_role can do everything (Hub API server-side operations)
-- anon/authenticated roles have no access — all access through Hub API only

CREATE POLICY "service_role_all_practitioners"  ON practitioners   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_patients"       ON patients        TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_consent"        ON consent_records TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_insert_audit"       ON audit_log       TO service_role USING (true) WITH CHECK (true);

-- No authenticated/anon policies — zero direct client access
