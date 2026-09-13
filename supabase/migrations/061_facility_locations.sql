-- Migration 061: facility_locations
-- Facility sub-locations (main store, dispensary, cold-chain fridge, ward cabinet)
-- belonging to one pharmacy_facilities facility. Part of Multi-Location SP1a.
-- Invariant: exactly one is_primary=true row per facility (partial unique index).
-- Scoping is by facility_id via JWT in the tRPC layer (RLS is service_role-only,
-- defense-in-depth), consistent with pharmacy_facilities — no org_id.

CREATE TABLE IF NOT EXISTS facility_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES pharmacy_facilities(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'store',
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_locations_facility
  ON facility_locations(facility_id);

-- One primary per facility, enforced at the DB (backstop for the service logic).
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_locations_one_primary
  ON facility_locations(facility_id) WHERE is_primary;

-- kind domain guard (keeps the string union honest without a Postgres enum type).
ALTER TABLE facility_locations
  ADD CONSTRAINT facility_locations_kind_chk
  CHECK (kind IN ('store','room','fridge','cabinet','other'));

ALTER TABLE facility_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY facility_locations_service_all ON facility_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY facility_locations_authenticated_read ON facility_locations
  FOR SELECT TO authenticated USING (is_active = true);

CREATE OR REPLACE FUNCTION update_facility_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_facility_locations_updated_at
  BEFORE UPDATE ON facility_locations
  FOR EACH ROW EXECUTE FUNCTION update_facility_locations_updated_at();
