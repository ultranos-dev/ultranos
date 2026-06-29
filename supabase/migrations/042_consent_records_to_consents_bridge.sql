-- ============================================================
-- Migration 042: Bridge consent_records (registration consent capture) into the
-- `consents` ledger that enforceConsent + the consent router read.
--
-- The codebase is built on the granular `consents` model (category[],
-- provision_end). Registration writes the coarse consent_records (scope/purpose
-- = 'TREATMENT'). This mirrors each consent_record into `consents` so consent
-- enforcement becomes functional. A broad TREATMENT consent maps to a
-- FULL_RECORD grant (clinical-staff access to the record).
--
-- The trigger is best-effort and exception-guarded: a mirror failure NEVER
-- blocks the consent_records write (registration must not break). For consent,
-- a missed mirror fails closed (enforcement denies), which is safe.
-- ============================================================

CREATE OR REPLACE FUNCTION mirror_consent_record_to_consents()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO consents (
      id, status, category, patient_ref, date_time, provision_start, provision_end,
      grantor_id, grantor_role, purpose, consent_version, audit_hash,
      withdrawn_at, withdrawal_reason, synced_by, synced_at
    )
    VALUES (
      NEW.id,
      NEW.status,
      CASE WHEN NEW.purpose = 'TREATMENT' OR 'TREATMENT' = ANY(COALESCE(NEW.scope, ARRAY[]::text[]))
           THEN ARRAY['FULL_RECORD']
           ELSE COALESCE(NEW.scope, ARRAY['FULL_RECORD']) END,
      'Patient/' || NEW.patient_id::text,
      NEW.valid_from, NEW.valid_from, NEW.valid_until,
      NEW.grantor_id::text, NEW.grantor_role, NEW.purpose, NEW.consent_version, NEW.audit_hash,
      NEW.withdrawn_at, NEW.withdrawal_reason, NEW.grantor_id::text, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status           = EXCLUDED.status,
      provision_end    = EXCLUDED.provision_end,
      withdrawn_at     = EXCLUDED.withdrawn_at,
      withdrawal_reason = EXCLUDED.withdrawal_reason;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'consent mirror to consents failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mirror_consent_records ON consent_records;
CREATE TRIGGER trg_mirror_consent_records
  AFTER INSERT OR UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION mirror_consent_record_to_consents();

-- Backfill existing consent_records into consents.
INSERT INTO consents (
  id, status, category, patient_ref, date_time, provision_start, provision_end,
  grantor_id, grantor_role, purpose, consent_version, audit_hash,
  withdrawn_at, withdrawal_reason, synced_by, synced_at
)
SELECT
  cr.id,
  cr.status,
  CASE WHEN cr.purpose = 'TREATMENT' OR 'TREATMENT' = ANY(COALESCE(cr.scope, ARRAY[]::text[]))
       THEN ARRAY['FULL_RECORD']
       ELSE COALESCE(cr.scope, ARRAY['FULL_RECORD']) END,
  'Patient/' || cr.patient_id::text,
  cr.valid_from, cr.valid_from, cr.valid_until,
  cr.grantor_id::text, cr.grantor_role, cr.purpose, cr.consent_version, cr.audit_hash,
  cr.withdrawn_at, cr.withdrawal_reason, cr.grantor_id::text, now()
FROM consent_records cr
ON CONFLICT (id) DO NOTHING;
