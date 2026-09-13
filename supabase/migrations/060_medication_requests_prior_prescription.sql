-- ============================================================
-- Migration 060: MedicationRequest.priorPrescription link
-- Adds a nullable self-reference so an append-only cancellation
-- record (its own uuid id) can point back at the prescription it
-- cancels (FHIR R4 MedicationRequest.priorPrescription).
--
-- Why this matters (Tier-1 safety): OPD-Lite cancels a prescription
-- by appending a NEW cancelled record rather than mutating the active
-- one. The client dedups active vs. cancelled via this link. Without a
-- persisted column the link is lost on sync pull-back and a cancelled
-- prescription can resurface as active.
--
-- FK-less on purpose: the original row may not be present when a
-- cancellation syncs (offline ordering), so this is a plain uuid, not
-- a hard foreign key. NULL for normal (non-cancellation) prescriptions.
-- ============================================================

ALTER TABLE medication_requests
  ADD COLUMN IF NOT EXISTS prior_prescription_id UUID;

-- Find all cancellations of a given original prescription.
CREATE INDEX IF NOT EXISTS idx_medication_requests_prior_prescription_id
  ON medication_requests (prior_prescription_id)
  WHERE prior_prescription_id IS NOT NULL;
