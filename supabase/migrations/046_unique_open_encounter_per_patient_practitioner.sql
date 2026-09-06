-- ============================================================
-- Migration 046: Enforce one open encounter per (patient, practitioner)
-- Fixes: duplicate in-progress encounters for the same patient + doctor,
--        created across separate spoke sessions/devices where the client's
--        in-memory guard and local-cache existence check both miss.
-- ============================================================
--
-- Root cause backstop: the spoke's "one open encounter" rule was enforced only
-- by per-session in-memory state + a local-IndexedDB existence check (never the
-- Hub). Two sessions with no local copy of the still-open encounter each created
-- their own. Nothing at the Hub or DB deduplicated. This partial unique index is
-- the authoritative guard.
--
-- Scope: (patient, practitioner). A patient may legitimately have concurrent open
-- encounters with DIFFERENT doctors (and, under the free-floating/provider-agnostic
-- patient model, across different providers), so we do NOT constrain per-patient
-- globally — only per patient+practitioner, which is exactly the observed bug.
--
-- Practitioner is extracted from participant[0].individual.reference — the shape
-- the spoke writes (encounter-store.ts) and that encounter.listByPractitioner
-- already relies on via jsonb containment.
--
-- NOTE: any pre-existing duplicate in-progress rows must be resolved BEFORE this
-- index will build. (The two known stuck rows were closed to 'finished' first.)

CREATE UNIQUE INDEX IF NOT EXISTS uq_encounters_open_per_patient_practitioner
  ON encounters (subject_id, (participant->0->'individual'->>'reference'))
  WHERE status = 'in-progress';

COMMENT ON INDEX uq_encounters_open_per_patient_practitioner IS
  'At most one in-progress encounter per (patient, practitioner). Prevents duplicate open encounters from cross-session/offline spoke creates.';
