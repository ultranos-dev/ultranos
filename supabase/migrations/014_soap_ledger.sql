-- Story 16.5: SOAP Note Sync Endpoints
-- Creates the soap_ledger table for append-only SOAP note storage.
-- Maps to FHIR ClinicalImpression resource.

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS soap_ledger (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id      UUID NOT NULL REFERENCES encounters(id),
  practitioner_id   TEXT NOT NULL,
  soap_subjective   TEXT,          -- encrypted PHI
  soap_objective    TEXT,          -- encrypted PHI
  soap_assessment   TEXT,          -- encrypted PHI
  soap_plan         TEXT,          -- encrypted PHI
  hlc_timestamp     TEXT NOT NULL,
  version_id        TEXT NOT NULL DEFAULT '1',
  last_updated      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_soap_ledger_encounter_id
  ON soap_ledger (encounter_id);

CREATE INDEX IF NOT EXISTS idx_soap_ledger_hlc_timestamp
  ON soap_ledger (hlc_timestamp);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE soap_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_soap_ledger
  ON soap_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Append-Only Trigger ─────────────────────────────────────────────────────
-- Defense-in-depth: prevents UPDATE and DELETE at the DB level.
-- Same pattern as audit_log (Story 8.2).

CREATE OR REPLACE FUNCTION prevent_soap_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'soap_ledger is append-only: % operations are not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER soap_ledger_no_update
  BEFORE UPDATE ON soap_ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_soap_ledger_modification();

CREATE TRIGGER soap_ledger_no_delete
  BEFORE DELETE ON soap_ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_soap_ledger_modification();
