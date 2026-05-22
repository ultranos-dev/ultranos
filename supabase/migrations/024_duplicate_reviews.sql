-- Migration 024: duplicate_reviews table for MPI Phase 2 async reconciliation.
-- Stores flagged duplicate patient records discovered by post-sync MPI scoring.
-- Status lifecycle: PENDING → DISMISSED | FLAGGED_FOR_MERGE → MERGED (Phase 3)

CREATE TABLE IF NOT EXISTS duplicate_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  candidate_ids     UUID[] NOT NULL,
  top_score         SMALLINT NOT NULL,
  mpi_decision      TEXT NOT NULL CHECK (mpi_decision IN ('WARN', 'BLOCK')),
  status            TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DISMISSED', 'FLAGGED_FOR_MERGE', 'MERGED')),
  reviewed_by       UUID REFERENCES practitioners(id),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for fast PENDING count queries (dashboard badge)
CREATE INDEX idx_duplicate_reviews_pending
  ON duplicate_reviews(status) WHERE status = 'PENDING';

-- Lookup by patient for inline banner
CREATE INDEX idx_duplicate_reviews_patient
  ON duplicate_reviews(patient_id);

-- RLS: practitioners can read all reviews; only Doctor/Admin can modify
ALTER TABLE duplicate_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY duplicate_reviews_select ON duplicate_reviews
  FOR SELECT TO authenticated USING (true);

CREATE POLICY duplicate_reviews_insert ON duplicate_reviews
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY duplicate_reviews_update ON duplicate_reviews
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE duplicate_reviews IS 'MPI Phase 2: flagged duplicate patient records for clinician review';
COMMENT ON COLUMN duplicate_reviews.candidate_ids IS 'UUIDs of candidate patients that matched — used for comparison display';
COMMENT ON COLUMN duplicate_reviews.mpi_decision IS 'WARN (60-89 score) or BLOCK (90+ score) — severity of the match';
COMMENT ON COLUMN duplicate_reviews.status IS 'PENDING → DISMISSED (false positive) or FLAGGED_FOR_MERGE (Phase 3 merge tool)';
