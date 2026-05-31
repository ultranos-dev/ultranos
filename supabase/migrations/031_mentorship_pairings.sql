-- Story 55.4: Mentorship Pairing Management
-- Tables: mentorship_pairings, mentorship_checkins

CREATE TABLE mentorship_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  mentee_practitioner_id UUID NOT NULL REFERENCES practitioners(id),
  lab_id UUID NOT NULL REFERENCES labs(id),
  goals TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISSOLVED')),
  start_date DATE NOT NULL,
  dissolved_at TIMESTAMPTZ,
  dissolved_reason TEXT
    CHECK (dissolved_reason IS NULL OR dissolved_reason IN ('COMPLETED', 'REASSIGNED', 'INACTIVE', 'OTHER')),
  dissolved_notes TEXT,
  created_by UUID NOT NULL REFERENCES practitioners(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate active pairings for the same mentee
CREATE UNIQUE INDEX idx_mentorship_active_mentee
  ON mentorship_pairings (mentee_practitioner_id)
  WHERE status = 'ACTIVE';

-- Index for listing by status
CREATE INDEX idx_mentorship_status ON mentorship_pairings (status);

CREATE TABLE mentorship_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id UUID NOT NULL REFERENCES mentorship_pairings(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('COMPLETED', 'SKIPPED', 'PENDING')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pairing_id, month)
);

-- RLS policies: service role full access on both tables
ALTER TABLE mentorship_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorship_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on mentorship_pairings"
  ON mentorship_pairings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access on mentorship_checkins"
  ON mentorship_checkins
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
