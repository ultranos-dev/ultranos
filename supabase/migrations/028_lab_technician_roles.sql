-- Story 42.1: Add lab_role column to lab_technicians table
-- Introduces four-tier lab role hierarchy: LAB_TECH, SENIOR_TECH, SUPERVISOR, LAB_MANAGER
-- Existing rows default to LAB_TECH (non-breaking migration)

ALTER TABLE lab_technicians
  ADD COLUMN lab_role TEXT NOT NULL DEFAULT 'LAB_TECH'
  CONSTRAINT lab_technicians_lab_role_check
    CHECK (lab_role IN ('LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER'));

-- Index for fast staff listing queries scoped by lab and role
CREATE INDEX idx_lab_technicians_lab_role ON lab_technicians (lab_id, lab_role);
