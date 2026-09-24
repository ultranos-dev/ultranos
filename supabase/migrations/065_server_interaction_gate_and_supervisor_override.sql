-- Story 57.2: Server-side interaction gate + real supervisor override.

-- 1. Authoritative server-computed interaction status alongside the client-attested one.
--    interaction_check (existing) remains the CLIENT-ATTESTED advisory value (telemetry / drift).
--    interaction_check_server is the AUTHORITATIVE value the dispense gate blocks on.
--    interaction_check_client mirrors the client value explicitly for drift monitoring
--    (kept separate so a future change to interaction_check semantics cannot silently
--    reinterpret the historical client attestation).
ALTER TABLE medication_requests
  ADD COLUMN IF NOT EXISTS interaction_check_server TEXT
    CHECK (interaction_check_server IN ('CLEAR','WARNING','BLOCKED','UNAVAILABLE')),
  ADD COLUMN IF NOT EXISTS interaction_check_client TEXT
    CHECK (interaction_check_client IN ('CLEAR','WARNING','BLOCKED','UNAVAILABLE'));

COMMENT ON COLUMN medication_requests.interaction_check_server IS
  'Story 57.2: authoritative Hub-computed drug-interaction status. Dispense gate blocks on THIS, never on the client-attested interaction_check. NULL = not yet computed (offline-created rx pending server check at first dispense).';
COMMENT ON COLUMN medication_requests.interaction_check_client IS
  'Story 57.2: client-attested interaction status captured at create (advisory/telemetry, drift monitoring). Never a dispense-gate input.';

-- 2. Supervisor PIN hash for server-side supervisor re-auth on override.
--    SHA-256 hex digest of the supervisor PIN (matches the existing crypto.createHash
--    pattern used elsewhere in the Hub; no new dependency). NULL = no PIN set →
--    that practitioner cannot act as an override supervisor.
ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS supervisor_pin_hash TEXT;

COMMENT ON COLUMN practitioners.supervisor_pin_hash IS
  'Story 57.2: SHA-256 hex of the supervisor override PIN. Server-verified during a dispense override (medication.recordDispense). NULL disables supervisor capability for this practitioner.';

-- 3. dispense_reviews: structured reason code + whether the supervisor credential
--    was server-verified at record time (false for offline-queued attestations
--    pending drain-time verification).
ALTER TABLE dispense_reviews
  ADD COLUMN IF NOT EXISTS override_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS override_supervisor_verified BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN dispense_reviews.override_reason_code IS
  'Story 57.2: structured OverrideReasonCode enum value (replaces the free-text severity prefix heuristic). override_reason keeps the supplementary free text.';
COMMENT ON COLUMN dispense_reviews.override_supervisor_verified IS
  'Story 57.2: TRUE when the supervisor credential was verified server-side at dispense time. FALSE for offline-queued overrides whose supervisor attestation still needs drain-time verification; a failed verification transitions the review to FLAGGED.';
