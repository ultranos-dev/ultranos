# Lab Lite — Diagnostic Lab Portal

**Package:** `@ultranos/lab-lite`

## Purpose

Diagnostic lab result upload portal for the Ultranos ecosystem. Lab technicians use this application to upload test results and associate them with patient encounters via a minimal patient verification flow.

## Target Users

- **Lab Technicians** — Upload diagnostic results, tag metadata, manage upload queue.
- **Phlebotomists** — Verify patient identity before sample collection.

## Data Minimization

The Lab Portal enforces strict data minimization per CLAUDE.md Rule #7:

- The API layer returns **only first name and age** for patient verification.
- Lab technicians **must not** access patient medical history, diagnoses, medications, or allergies.
- This constraint is enforced at the Hub API layer, not the UI.

## Connectivity Model

**Near-online, push-only.** The Lab Portal has the smallest surface area of any spoke app by design.

- Upload queue provides **48-hour offline resilience** for result submissions.
- No pull-based data sync — results are pushed to the Hub API.

## Status

**Scaffolded.** This is the application shell only. Functional lab workflows (credentialing, patient verification, result upload, notifications, AI metadata extraction) will be implemented in **Epic 12: Lab Diagnostics & Reporting** (stories 12.1–12.6).

## Development

```bash
pnpm -F lab-lite dev        # Start dev server on port 3003
pnpm -F lab-lite typecheck  # TypeScript check
pnpm -F lab-lite build      # Production build
```

## PRD Reference

- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- PRD: Section 5.4 — Diagnostic Lab Portal (LAB-001 through LAB-024)
- Epic 12: Lab Diagnostics & Reporting (stories 12.1–12.6)
