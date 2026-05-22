-- Migration 025: Patient merge support for MPI Phase 3.
-- Adds merged_into pointer on patients + merge_audits table for reversible merges.

-- merged_into column — soft merge pointer
ALTER TABLE patients ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES patients(id);
CREATE INDEX IF NOT EXISTS idx_patients_merged_into
  ON patients(merged_into) WHERE merged_into IS NOT NULL;

COMMENT ON COLUMN patients.merged_into IS 'UUID of the survivor patient this record was merged into. NULL = not merged.';

-- merge_audits table — reversible merge log
CREATE TABLE IF NOT EXISTS merge_audits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id         UUID NOT NULL REFERENCES patients(id),
  duplicate_id        UUID NOT NULL REFERENCES patients(id),
  field_resolutions   JSONB NOT NULL,
  original_survivor   JSONB NOT NULL,
  original_duplicate  JSONB NOT NULL,
  merged_by           UUID NOT NULL REFERENCES practitioners(id),
  merged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unmerge_deadline    TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVERSED', 'ARCHIVED')),
  reversed_by         UUID REFERENCES practitioners(id),
  reversed_at         TIMESTAMPTZ
);

CREATE INDEX idx_merge_audits_active
  ON merge_audits(status) WHERE status = 'ACTIVE';

ALTER TABLE merge_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY merge_audits_select ON merge_audits FOR SELECT TO authenticated USING (true);
CREATE POLICY merge_audits_insert ON merge_audits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY merge_audits_update ON merge_audits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE merge_audits IS 'MPI Phase 3: reversible patient merge audit trail with 72-hour unmerge window';
COMMENT ON COLUMN merge_audits.original_survivor IS 'Snapshot of survivor fields before merge — used for unmerge rollback';
COMMENT ON COLUMN merge_audits.original_duplicate IS 'Snapshot of duplicate fields before merge — used for unmerge rollback';
COMMENT ON COLUMN merge_audits.unmerge_deadline IS 'NOW() + 72 hours. After deadline, status transitions to ARCHIVED and unmerge is blocked.';
