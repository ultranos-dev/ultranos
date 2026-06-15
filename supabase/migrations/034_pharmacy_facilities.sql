-- Migration 034: Pharmacy facilities — GPS-registered pharmacy locations
-- Used by the Pharmopedia pharmacy finder (distance calculation).
-- This table is managed by Pharmacy-Lite (pharmacists register their facility).

CREATE TABLE IF NOT EXISTS pharmacy_facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  province TEXT,
  district TEXT,
  facility_type TEXT NOT NULL DEFAULT 'pharmacy'
    CHECK (facility_type IN ('pharmacy', 'clinic', 'hospital')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pharmacy_facilities_coords_idx
  ON pharmacy_facilities (latitude, longitude);

ALTER TABLE pharmacy_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_facilities_service_all ON pharmacy_facilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY pharmacy_facilities_authenticated_read ON pharmacy_facilities
  FOR SELECT TO authenticated USING (is_active = true);
