-- Migration 026: dispense_reviews for unverified offline dispenses.
CREATE TABLE IF NOT EXISTS dispense_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispense_id           UUID NOT NULL,
  prescription_id       UUID,
  override_reason       TEXT NOT NULL,
  override_supervisor   UUID NOT NULL REFERENCES practitioners(id),
  status                TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'FLAGGED')),
  reviewed_by           UUID REFERENCES practitioners(id),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispense_reviews_pending ON dispense_reviews(status) WHERE status = 'PENDING';

ALTER TABLE dispense_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispense_reviews_select ON dispense_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY dispense_reviews_insert ON dispense_reviews FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dispense_reviews_update ON dispense_reviews FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
