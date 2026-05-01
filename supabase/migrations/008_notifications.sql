-- ============================================================
-- Migration 008: Notifications
-- Story 12.4: Notification Dispatch
-- PRD: LAB-023 (Notification Dispatch)
--
-- Generic ecosystem notification infrastructure.
-- Supports all notification types (lab results, prescriptions,
-- consent changes, sync conflicts, allergy updates).
-- No PHI in notification payloads — data minimized by design.
-- ============================================================

-- ── NOTIFICATIONS ────────────────────────────────────────────
-- Generic notification queue. Recipients poll or receive push.
-- Status lifecycle: QUEUED → SENT → DELIVERED → ACKNOWLEDGED
-- Failed deliveries tracked for retry with exponential backoff.
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_ref     TEXT NOT NULL,                -- Opaque recipient identifier (user sub)
  recipient_role    TEXT NOT NULL
                      CHECK (recipient_role IN ('CLINICIAN', 'PATIENT')),
  type              TEXT NOT NULL
                      CHECK (type IN (
                        'LAB_RESULT_AVAILABLE',
                        'LAB_RESULT_ESCALATION',
                        'PRESCRIPTION_READY',
                        'CONSENT_CHANGE',
                        'SYNC_CONFLICT',
                        'ALLERGY_UPDATE'
                      )),
  payload           JSONB NOT NULL DEFAULT '{}',  -- Data-minimized: test category, lab name, timestamp only. NO PHI.
  status            TEXT NOT NULL DEFAULT 'QUEUED'
                      CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'ACKNOWLEDGED', 'FAILED')),
  retry_count       INTEGER NOT NULL DEFAULT 0,
  next_retry_at     TIMESTAMPTZ,                  -- Exponential backoff: 1s, 2s, 4s, 8s... max 60s
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at      TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ
);

-- ── INDEXES ──────────────────────────────────────────────────
-- Primary query pattern: fetch notifications for a recipient, newest first
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_ref
  ON notifications (recipient_ref);

-- Unread notifications query (bell icon count)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status
  ON notifications (recipient_ref, status);

-- Escalation job: find unacknowledged critical notifications
CREATE INDEX IF NOT EXISTS idx_notifications_type_status_created
  ON notifications (type, status, created_at)
  WHERE type IN ('LAB_RESULT_AVAILABLE', 'LAB_RESULT_ESCALATION')
    AND status IN ('QUEUED', 'SENT');

-- Retry queue: find failed notifications due for retry
CREATE INDEX IF NOT EXISTS idx_notifications_retry
  ON notifications (status, next_retry_at)
  WHERE status = 'FAILED' AND next_retry_at IS NOT NULL;
