-- =====================================================
-- Migration 027: Appointment & Slot tables
-- Epic 37, Story 37.17 — Appointment scheduling system
-- =====================================================

-- Appointments table
CREATE TABLE appointments (
  id UUID PRIMARY KEY,
  resource_type TEXT NOT NULL DEFAULT 'Appointment',
  status TEXT NOT NULL CHECK (status IN (
    'proposed', 'pending', 'booked', 'arrived',
    'fulfilled', 'cancelled', 'noshow', 'entered-in-error'
  )),
  service_type JSONB NOT NULL DEFAULT '[]'::jsonb,
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ NOT NULL,
  participant JSONB NOT NULL DEFAULT '[]'::jsonb,
  participant_refs TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  walk_in BOOLEAN NOT NULL DEFAULT false,
  queue_position INTEGER,
  is_offline_created BOOLEAN NOT NULL DEFAULT false,
  hlc_timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clinic_id TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  double_booking_flag BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT appointments_start_before_end CHECK (start < "end")
);

-- Indexes for appointment queries
CREATE INDEX idx_appointments_start ON appointments (start);
CREATE INDEX idx_appointments_status ON appointments (status);
CREATE INDEX idx_appointments_participant_refs ON appointments USING GIN (participant_refs);
CREATE INDEX idx_appointments_hlc ON appointments (hlc_timestamp);
CREATE INDEX idx_appointments_walk_in ON appointments (walk_in) WHERE walk_in = true;
CREATE INDEX idx_appointments_clinic ON appointments (clinic_id) WHERE clinic_id IS NOT NULL;

-- Slots table
CREATE TABLE slots (
  id UUID PRIMARY KEY,
  resource_type TEXT NOT NULL DEFAULT 'Slot',
  schedule_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN (
    'free', 'busy', 'busy-unavailable', 'busy-tentative', 'entered-in-error'
  )),
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  hlc_timestamp TEXT NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT slots_start_before_end CHECK (start < "end"),
  CONSTRAINT slots_duration_positive CHECK (slot_duration_minutes > 0)
);

-- Indexes for slot queries
CREATE INDEX idx_slots_schedule ON slots (schedule_reference);
CREATE INDEX idx_slots_start ON slots (start);
CREATE INDEX idx_slots_status ON slots (status);
CREATE INDEX idx_slots_schedule_start ON slots (schedule_reference, start);

-- Enable RLS on both tables
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

-- RLS policies for appointments (authenticated users only)
CREATE POLICY "Authenticated users can read appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert appointments"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS policies for slots (authenticated users only)
CREATE POLICY "Authenticated users can read slots"
  ON slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert slots"
  ON slots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update slots"
  ON slots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE appointments IS 'FHIR R4 Appointment resources for OPD scheduling. Tier 3 LWW conflict resolution. participant_refs is a denormalized array of participant UUIDs for efficient filtering.';
COMMENT ON TABLE slots IS 'FHIR R4 Slot resources for practitioner schedule management. Not PHI — contains only practitioner references and time ranges.';
COMMENT ON COLUMN appointments.participant_refs IS 'Denormalized array of participant UUIDs (both practitioners and patients) from the participant JSONB array. Used for efficient .contains() queries.';
COMMENT ON COLUMN appointments.double_booking_flag IS 'Set to true when offline sync detects a double-booking conflict that needs manual review.';
