-- Story 55.3: Employee Health & Vaccination Registry
-- Table for storing occupational health records per practitioner

CREATE TABLE employee_health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) UNIQUE,
  hep_b_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (hep_b_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE')),
  hep_b_titer_date DATE,
  tetanus_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (tetanus_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE')),
  tetanus_date DATE,
  covid_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (covid_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE')),
  covid_doses INTEGER DEFAULT 0,
  covid_last_dose_date DATE,
  tb_screening_date DATE,
  tb_screening_result TEXT
    CHECK (tb_screening_result IN ('NEGATIVE', 'POSITIVE', 'INDETERMINATE')),
  exposure_history_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policy: service role only (all access via Hub API)
ALTER TABLE employee_health_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON employee_health_records
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_employee_health_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_health_updated_at
  BEFORE UPDATE ON employee_health_records
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_health_updated_at();
