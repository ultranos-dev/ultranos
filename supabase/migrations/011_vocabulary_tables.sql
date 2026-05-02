-- Vocabulary tables for terminology service (Story 10.3)
-- Non-PHI reference data. RLS restricts to authenticated role (proprietary data).

-- ============================================================
-- 1. TABLE CREATION
-- ============================================================

CREATE TABLE vocabulary_medications (
  code TEXT PRIMARY KEY,
  display TEXT NOT NULL,
  form TEXT NOT NULL,
  strength TEXT NOT NULL,
  atc_code TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE vocabulary_icd10 (
  code TEXT PRIMARY KEY,
  display TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE vocabulary_interactions (
  id SERIAL PRIMARY KEY,
  drug_a TEXT NOT NULL,
  drug_b TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_vocab_ix_drug_pair UNIQUE (drug_a, drug_b)
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_vocab_med_display ON vocabulary_medications (display);
CREATE INDEX idx_vocab_med_version ON vocabulary_medications (version);

CREATE INDEX idx_vocab_icd10_display ON vocabulary_icd10 (display);
CREATE INDEX idx_vocab_icd10_version ON vocabulary_icd10 (version);

CREATE INDEX idx_vocab_ix_drug_a ON vocabulary_interactions (drug_a);
CREATE INDEX idx_vocab_ix_drug_b ON vocabulary_interactions (drug_b);
CREATE INDEX idx_vocab_ix_version ON vocabulary_interactions (version);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE vocabulary_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_icd10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_interactions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read vocabulary (no PHI — no role restriction beyond auth)
CREATE POLICY "authenticated_read_medications"
  ON vocabulary_medications FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_icd10"
  ON vocabulary_icd10 FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_interactions"
  ON vocabulary_interactions FOR SELECT TO authenticated USING (true);

-- Service role can write vocabulary (seed/sync updates come from the Hub service)
CREATE POLICY "service_write_medications"
  ON vocabulary_medications FOR ALL TO service_role USING (true);

CREATE POLICY "service_write_icd10"
  ON vocabulary_icd10 FOR ALL TO service_role USING (true);

CREATE POLICY "service_write_interactions"
  ON vocabulary_interactions FOR ALL TO service_role USING (true);

-- ============================================================
-- 4. SAMPLE SEED ROWS
-- Full vocabulary loaded by scripts/seed-vocabulary.ts
-- ============================================================

INSERT INTO vocabulary_medications (code, display, form, strength, version) VALUES
  ('RX001', 'Amoxicillin', 'Capsule', '500 mg', 1),
  ('RX002', 'Metformin', 'Tablet', '500 mg', 1),
  ('RX003', 'Amlodipine', 'Tablet', '5 mg', 1);

INSERT INTO vocabulary_icd10 (code, display, version) VALUES
  ('I10', 'Essential (primary) hypertension', 1),
  ('E11.9', 'Type 2 diabetes mellitus without complications', 1),
  ('J06.9', 'Acute upper respiratory infection, unspecified', 1);

INSERT INTO vocabulary_interactions (drug_a, drug_b, severity, description, version) VALUES
  ('Warfarin', 'Aspirin', 'CONTRAINDICATED', 'Increased bleeding risk — dual antiplatelet/anticoagulant effect', 1),
  ('Warfarin', 'Ibuprofen', 'MAJOR', 'NSAIDs potentiate anticoagulant effect and cause GI bleeding', 1),
  ('Omeprazole', 'Clopidogrel', 'MODERATE', 'CYP2C19 inhibition reduces clopidogrel activation', 1);
