-- 073: add a nullable owning/registering org to patients (product decision 2026-09-28).
-- Backward-compatible amendment to the Epic 27 free-floating model: NULL = legacy
-- free-floating patient (no forced backfill, no RLS lockout). New registrations stamp
-- the registrar's org (clinician via patient.create, lab via lab.registerPatient).
-- Retained for FUTURE role-based access work; at this stage lab-lite has full
-- unrestricted access and org_id is NOT used to gate anything (see CLAUDE.md Rule #7).
--
-- NOTE: applied to the remote project via the Supabase MCP (migration name:
-- add_patients_owning_org_id); this file mirrors it so migration history stays in sync.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_patients_org_id ON public.patients(org_id);

COMMENT ON COLUMN public.patients.org_id IS
  'Owning/registering org (nullable). NULL = legacy free-floating (Epic 27). Reserved for future role-based access; not used to gate access at this stage.';
