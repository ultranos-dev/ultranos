-- Migration 043: per-candidate MPI scores for duplicate_reviews.
-- The review row already stores candidate_ids (UUID[]) and a single top_score
-- (the max across candidates). The clinician review UI needs the score for EACH
-- candidate, not just the max, so it can rank/compare individual matches.
--
-- candidate_scores is a parallel array to candidate_ids: candidate_scores[i] is
-- the MPI similarity score for candidate_ids[i]. Scores are computed at flag time
-- (async MPI scoring) and frozen — they reflect what the system matched when the
-- duplicate was raised, which is what the reviewer is adjudicating.

ALTER TABLE duplicate_reviews
  ADD COLUMN IF NOT EXISTS candidate_scores SMALLINT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN duplicate_reviews.candidate_scores IS
  'Per-candidate MPI scores, parallel array to candidate_ids (candidate_scores[i] scores candidate_ids[i]). Frozen at flag time.';
