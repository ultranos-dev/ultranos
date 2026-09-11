-- 057_backfill_practitioner_identity_on_encounters.sql
--
-- Backfill for the custom_access_token_hook rollout (migration 056).
--
-- Before the hook, spoke sessions had no `practitioner_id` claim and fell back to
-- the auth `sub` (= practitioners.auth_user_id) as the practitioner reference. So
-- encounters created pre-hook carry `Practitioner/<auth_user_id>` in
-- participant[0].individual.reference. After the hook, sessions use practitioners.id,
-- and encounter.listByPractitioner (the login pull) scopes on `Practitioner/<id>`.
-- Result: pre-hook encounters become invisible to their own clinician, who then
-- starts an empty duplicate and sees no pre-filled SOAP/vitals/prescriptions.
--
-- This migration normalizes those stale refs to practitioners.id. Idempotent:
-- re-running finds no auth_user_id refs. Wrapped in the implicit migration txn.
--
-- Step 1 defends the normalization: if an empty NEW-identity in-progress encounter
-- collides with an OLD-identity in-progress sibling for the same patient+practitioner,
-- cancel the empty one first so Step 2 cannot violate the partial unique index
-- uq_encounters_open_per_patient_practitioner (migration 046). A real double-data
-- conflict (both siblings have children) is intentionally NOT auto-merged: Step 2
-- would then hit the unique index and roll the whole migration back for manual review.

-- Step 1: cancel childless NEW-identity in-progress duplicates that shadow an
--         OLD-identity in-progress sibling.
WITH empties AS (
  SELECT new_e.id
  FROM encounters new_e
  JOIN practitioners p
    ON new_e.participant->0->'individual'->>'reference' = 'Practitioner/' || p.id::text
  JOIN encounters old_e
    ON old_e.subject_id = new_e.subject_id
   AND old_e.status = 'in-progress'
   AND old_e.participant->0->'individual'->>'reference' = 'Practitioner/' || p.auth_user_id::text
  WHERE new_e.status = 'in-progress'
    AND NOT EXISTS (SELECT 1 FROM soap_ledger s        WHERE s.encounter_id = new_e.id)
    AND NOT EXISTS (SELECT 1 FROM observations o       WHERE o.encounter_id = new_e.id)
    AND NOT EXISTS (SELECT 1 FROM medication_requests m WHERE m.encounter_reference = 'Encounter/' || new_e.id::text)
    AND NOT EXISTS (SELECT 1 FROM service_requests sr  WHERE sr.encounter_id = new_e.id)
    AND NOT EXISTS (SELECT 1 FROM conditions c         WHERE c.encounter_id = new_e.id)
)
UPDATE encounters
SET status = 'cancelled',
    last_updated = now(),
    version_id = (COALESCE(NULLIF(version_id, ''), '1')::int + 1)::text
WHERE id IN (SELECT id FROM empties);

-- Step 2: normalize participant refs auth_user_id -> practitioners.id.
UPDATE encounters e
SET participant = jsonb_set(
      e.participant,
      '{0,individual,reference}',
      to_jsonb('Practitioner/' || p.id::text)
    ),
    last_updated = now(),
    version_id = (COALESCE(NULLIF(e.version_id, ''), '1')::int + 1)::text
FROM practitioners p
WHERE e.participant->0->'individual'->>'reference' = 'Practitioner/' || p.auth_user_id::text;
