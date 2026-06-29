-- ============================================================
-- Migration 041: Create tables referenced by hub-api code but never migrated.
-- Schemas derived from the code's actual select/insert/eq/order usage.
-- RLS enabled on every table — the hub-api uses the SERVICE ROLE (bypasses RLS),
-- so this is zero-regression while blocking anon/authenticated direct access.
-- ============================================================

-- ── consents: FHIR Consent ledger (enforceConsent middleware + consent router) ──
CREATE TABLE IF NOT EXISTS consents (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status            text NOT NULL CHECK (status IN ('ACTIVE','WITHDRAWN','EXPIRED','SUPERSEDED')),
  category          text[],
  patient_ref       text NOT NULL,
  date_time         timestamptz,
  provision_start   timestamptz,
  provision_end     timestamptz,
  grantor_id        text,
  grantor_role      text,
  purpose           text,
  consent_version   text,
  audit_hash        text,
  hlc_timestamp     text,
  withdrawn_at      timestamptz,
  withdrawal_reason text,
  synced_by         text,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consents_patient_ref   ON consents (patient_ref);
CREATE INDEX IF NOT EXISTS idx_consents_status        ON consents (status);
CREATE INDEX IF NOT EXISTS idx_consents_provision_end ON consents (provision_end);
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- ── sync_conflicts: Tier-1 conflict tracking (patient.unresolvedConflictCount, admin, jobs) ──
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_type  text NOT NULL,
  resource_id    uuid,
  patient_ref    text,
  status         text NOT NULL DEFAULT 'UNRESOLVED' CHECK (status IN ('UNRESOLVED','RESOLVED')),
  local_version  jsonb,
  remote_version jsonb,
  resolution     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status     ON sync_conflicts (status);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_created_at ON sync_conflicts (created_at);
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;

-- ── clinical_safety_reports: monthly safety report snapshots (cron + admin) ──
CREATE TABLE IF NOT EXISTS clinical_safety_reports (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  month        int NOT NULL,
  year         int NOT NULL,
  report_data  jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinical_safety_reports_period ON clinical_safety_reports (year, month);
ALTER TABLE clinical_safety_reports ENABLE ROW LEVEL SECURITY;

-- ── job_runs: background job execution log (all cron jobs) ──
CREATE TABLE IF NOT EXISTS job_runs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name     text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status       text,
  summary      jsonb
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_name ON job_runs (job_name, started_at DESC);
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

-- ── active_sessions: practitioner session registry (admin force-logout on suspend) ──
CREATE TABLE IF NOT EXISTS active_sessions (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id uuid NOT NULL,
  session_id     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz,
  expires_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_active_sessions_practitioner ON active_sessions (practitioner_id);
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- ── notification_queue: outbound email/notification queue (billing + subscription services) ──
CREATE TABLE IF NOT EXISTS notification_queue (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel    text NOT NULL,
  recipient  text NOT NULL,
  subject    text,
  body       text,
  metadata   jsonb,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue (status, created_at);
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- ── patient_subscription_events: webhook idempotency ledger ──
CREATE TABLE IF NOT EXISTS patient_subscription_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id text NOT NULL UNIQUE,
  patient_id      uuid,
  event_type      text,
  platform        text,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE patient_subscription_events ENABLE ROW LEVEL SECURITY;

-- ── vocab_versions: vocabulary staleness metadata (drug adapter) ──
CREATE TABLE IF NOT EXISTS vocab_versions (
  vocab_type     text PRIMARY KEY,
  last_synced_at timestamptz,
  version        text
);
ALTER TABLE vocab_versions ENABLE ROW LEVEL SECURITY;
