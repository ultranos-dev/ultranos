# Story 63.3: Platform Consistency & Documentation Truth (ui-kit Build Model, Shared Types, Version Alignment)

Status: ready-for-dev

## Story

As a monorepo maintainer,
I want the shared-layer inconsistencies closed — ui-kit's stale dist and misdocumented build model fixed, per-app DTO duplicates consolidated into shared-types, dependency drift aligned, stale CLAUDE.md pointers corrected, and the small cross-app hygiene items swept,
so that the platform's shared foundations match their documentation and apps stop drifting apart.

## Acceptance Criteria

1. **Given** `packages/ui-kit`, **then** `dist/` is rebuilt (currently stale: `src/components/ui/dialog.tsx`/`avatar.tsx` newer than newest dist file — barrel importers get pre-ModalHeader code), AND the build model is made coherent: either component subpath exports also resolve via `dist/` (matching CLAUDE.md), or CLAUDE.md is corrected to document the actual split (components → `src/*.tsx`, barrel + icons → `dist/`) with accurate rebuild guidance — decision recorded.
2. **Given** duplicated entity types, **then** admin-portal's two local `interface Patient` declarations (`patients/page.tsx:15`, `merge/page.tsx:17`) and the spokes' re-declared hub DTOs (e.g., opd's `HubDiagnosticReportItem`, lab's `LabOrderEntry`) are consolidated into `@ultranos/shared-types` (or the Story 59.2 client package) — one source of truth per wire shape.
3. **Given** dependency drift, **then** `@supabase/supabase-js` and `@supabase/ssr` are aligned across all apps (currently ^2.45/^0.5 in opd+pharmacy vs ^2.49/^0.10.2 elsewhere — cookie-handling behavior changed across that range), with auth flows regression-tested after the bump.
4. **Given** CLAUDE.md's stale references, **then** they are corrected: `packages/crypto/src/field-encrypt.ts` → `server-crypto.ts`, `packages/drug-db/src/severity.ts` → shared-types location, `packages/audit-logger/src/schema.ts` → actual location; plus the ui-kit build-model text from AC 1.
5. **Given** the hygiene items, **then**: OPD's PWA `manifest.ts` theme color matches brand (`#1e40af` → `#2e9e71`); `empty-state.native.tsx` uses `tokens.native` constants instead of hardcoded hex grays; a shared date/time formatter utility replaces the ~35 inline `formatDate` copies (adopt incrementally — new/touched code uses it, mechanical migration where trivial); pharmacy's dead `pill-green`/`pill-text` hex config entries are removed; opd `opd-header.tsx:18` `text-left` → `text-start`; admin sidebar physical-property fixes route through ui-kit source (per the source-level-only rule), followed by the rebuild.
6. **Zero regression:** every app builds and renders identically post-rebuild (the ONLY intended visual deltas are the ModalHeader refresh that was already authored in src and the manifest color); auth works on the aligned Supabase versions in all four apps; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: ui-kit build model** (AC: 1) — `pnpm --filter @ultranos/ui-kit build`; clear affected `.next` caches; pick + implement the exports-map decision; update CLAUDE.md; add a CI staleness check (dist mtime vs src, or build-in-CI).
- [ ] **Task 2: DTO consolidation** (AC: 2) — move shapes to shared-types; type-only imports at call sites; no runtime changes (coordinate with Story 59.2 — if the typed client landed, DTOs live there).
- [ ] **Task 3: Supabase alignment** (AC: 3) — bump opd+pharmacy; read the `@supabase/ssr` 0.5→0.10 changelog for cookie-behavior changes; regression-test login/refresh/logout in both apps.
- [ ] **Task 4: Doc corrections** (AC: 4) — CLAUDE.md edits (build model, Key Reference paths).
- [ ] **Task 5: Hygiene sweep** (AC: 5) — the six listed items; ui-kit-source-first for anything shared (sidebar nav-user/pharmacy-header physical props — fix in `packages/ui-kit/src/`, rebuild, verify all apps).
- [ ] **Task 6: Regression verification** (AC: 6) — build all apps; visual spot-check of modals (ModalHeader delta is expected), sidebars (RTL), manifest; full monorepo test run (`pnpm test`); `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **P-UIKIT-1 [V-mtime]** (stale dist + misdocumented resolution — "a source edit without a rebuild will have no effect" is currently biting the barrel imports), **P-TYPES-1 [A]**, **supabase drift [A]**, **CLAUDE.md stale pointers [V-per-agent]**, **L-hygiene items** (audit §4 Low #22-23, §6 Low #30/32, §8 Low #29/31) — audit §8.

### Architecture

- Source-level-only rule (CLAUDE.md): shared component fixes go in `packages/ui-kit/src/`, never app-level copies; app `src/components/ui/` files stay thin re-exports (admin's 16 proxies verified pure — keep them that way).
- The drug-db substring-allergy-matching improvement (P-DRUG-1, clinically high-value) is deliberately NOT bundled here — it needs clinical vocabulary work; tracked in the remediation overview as a follow-up epic candidate.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Builds, visuals (except the two named intended deltas), auth, and types all hold; DTO moves are compile-time only. Full monorepo test suite passes; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `packages/ui-kit/package.json` (+ build), CLAUDE.md, `packages/shared-types` additions, 2 app package.json bumps, the six hygiene files, CI workflow (staleness check).
**New files:** `packages/shared-types/src/hub-dtos/…` (or client-package home), shared `format-date.ts` utility + tests.

### References

- [Source: docs/system-audit-2026-09-23.md#8-shared-packages-packages] — P-UIKIT-1, P-TYPES-1, drift table
- [Source: CLAUDE.md#ui-component-system-shadcn] — build/rebuild doctrine to correct
- [Source: packages/ui-kit/package.json] — exports map ground truth

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
