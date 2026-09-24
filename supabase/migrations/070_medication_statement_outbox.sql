-- Migration 070: medication_statement_outbox (Story 60.4)
-- Durable outbox for MedicationStatement creation that fails on the best-effort,
-- post-commit path after a successful dispense (medication.ts). A crash or transient
-- error no longer silently diverges the active-medication list from recorded dispenses:
-- the intent is captured here (opaque refs only) and drained with backoff by the
-- /api/cron/medication-statement-outbox job; DEAD after 8 attempts.
--
-- Additive + service-role-only: RLS enabled with NO policies, so the table is reachable
-- only by the hub service-role client (which bypasses RLS) — same pattern as other
-- hub-internal job/outbox tables. Medication identity is NOT stored; it is re-resolved
-- from medication_requests at drain time (PHI minimization).
--
-- NOTE: this table was applied to the Ultranos project during Wave 6 as migration version
-- 20260924055441 (name "066_medication_statement_outbox"). This repo file captures that
-- DDL for repo↔DB parity; the file is numbered 070 to avoid colliding with Story 61.3's
-- authored-but-unapplied RPC migrations 066–069. Uses IF NOT EXISTS so re-application is a no-op.

CREATE TABLE IF NOT EXISTS public.medication_statement_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL,
  patient_ref     text NOT NULL DEFAULT '',
  actor_id        text NOT NULL,
  hlc_timestamp   text NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  next_retry_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One outbox row per prescription (idempotent upsert on retry-enqueue).
CREATE UNIQUE INDEX IF NOT EXISTS medication_statement_outbox_prescription_uniq
  ON public.medication_statement_outbox (prescription_id);

-- Drain query: pending rows whose retry window has opened.
CREATE INDEX IF NOT EXISTS idx_medstmt_outbox_pending
  ON public.medication_statement_outbox (status, next_retry_at)
  WHERE status = 'PENDING';

ALTER TABLE public.medication_statement_outbox ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies: hub-internal table, accessed only by the service-role client.
