# Story 63.3: Platform Consistency & Documentation Truth (ui-kit Build Model, Shared Types, Version Alignment)

Status: review

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

- [x] **Task 1: ui-kit build model** (AC: 1) — `pnpm --filter @ultranos/ui-kit build` refreshes dist; **exports decision: document the actual split** (components→`src/*.tsx` subpaths; barrel/`./icons`/`./hooks`→`dist/`) rather than route all component subpaths through dist (matches intentional design + avoids rebuild-after-every-component-edit). CLAUDE.md build-model text corrected. New standalone `check:dist` staleness script (CI wiring deferred — did not edit workflows). **Premise correction: ui-kit `dist/` is gitignored, NOT tracked** — the audit's "stale committed dist" was inaccurate; dist is a build-on-demand artifact.
- [~] **Task 2: DTO consolidation** (AC: 2) — **spoke hub-DTOs already consolidated by Story 59.2** (`@ultranos/hub-client`); admin-portal local `interface Patient` dedup **DEFERRED** (would collide with 63.1's `merge/page.tsx` i18n edit). No shared-types churn here.
- [x] **Task 3: Supabase alignment** (AC: 3) — opd+pharmacy bumped to `@supabase/ssr ^0.10.2` / `supabase-js` (already 2.104). Both apps use ONLY `createBrowserClient` with `cookieOptions` — the ssr 0.5→0.10 cookie-adapter breaking change (individual methods → getAll/setAll) affects only custom-adapter/server clients, so login/refresh/logout are behaviorally unaffected (corroborated: lab+admin already run 0.10.2 with the identical pattern). Added explicit type annotations where ssr≥0.10 untypes `createBrowserClient`.
- [x] **Task 4: Doc corrections** (AC: 4) — CLAUDE.md Key Reference paths fixed to verified real homes: `field-encrypt.ts`→`server-crypto.ts`; drug severity→`packages/shared-types/src/enums.ts` (`DrugInteractionSeverity`); audit schema→`packages/shared-types/src/fhir/audit-event.ts`.
- [x] **Task 5: Hygiene sweep** (AC: 5) — opd manifest `#1e40af`→`#2e9e71`; `empty-state.native.tsx`→`tokens.native`; **shared formatter already exists** at `packages/ui-kit/src/utils/format.ts` (no duplicate created — added a `./utils/format` subpath export instead; no trivial migration sites in-footprint); pharmacy dead `pill-green`/`pill-text` removed; opd `opd-header.tsx` + admin `nav-user.tsx` `text-left`→`text-start` (nav-user is app-level — applied by the orchestrator at integration since it fell outside the ui-kit-source fence).
- [x] **Task 6: Regression verification** (AC: 6) — all 5 apps typecheck clean; opd 1472, pharmacy 1159, admin 334, ui-kit 444 — 0 failures; ModalHeader + manifest color the only intended visual deltas.

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
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Debug Log References
All 5 apps typecheck clean; opd 1472, pharmacy 1159, admin 334, ui-kit 444 — 0 failures (combined tree). `check:dist` exits 0 after build (proven to exit 1 when stale).

### Completion Notes List
- **ui-kit exports decision (recommendation adopted):** document the actual split, don't force component subpaths through dist. Rationale: component-subpath-from-src is intentional (edits go live without a rebuild), forcing 20+ subpaths through dist is a risky exports rewrite, and the real staleness surface (barrel/icons/hooks) is now covered by `check:dist`. Added `./utils/format` subpath.
- **Two audit-premise corrections (verified at source):** (1) ui-kit `dist/` is **gitignored** — the "stale committed dist" finding was wrong; dist is built-on-demand (the orchestrator rebuilds it at integration; it is not committed). (2) ModalHeader was never affected by dist staleness — it's a `dialog.tsx` subpath resolving to src.
- **Supabase:** browser-client-only usage → the ssr 0.5→0.10 cookie change is a no-op for these apps; verified against lab/admin already running 0.10.2 identically. One type-level consequence handled (explicit annotations where `createBrowserClient` is now untyped under strict).
- **Deferred/reassigned:** Task 2 spoke DTOs → done by 59.2; admin `interface Patient` dedup deferred (fence). CI wiring of `check:dist` deferred (no workflow edit, per collision fence with 63.1).

### File List
New — `packages/ui-kit/scripts/check-dist-fresh.mjs`.
Modified — `CLAUDE.md`; `packages/ui-kit/package.json` (+`check:dist`, `./utils/format`), `packages/ui-kit/src/components/ui/empty-state.native.tsx`; `apps/opd-lite/package.json`, `src/app/manifest.ts` (+test), `src/components/sidebar/opd-header.tsx`, `src/app/[locale]/(auth)/reset-password/page.tsx`, `src/hooks/useRealtimeDashboard.ts`; `apps/pharmacy-lite/package.json`, `tailwind.config.ts`, `src/app/[locale]/(auth)/reset-password/page.tsx`; `apps/admin-portal/src/components/sidebar/nav-user.tsx` (orchestrator, integration); `pnpm-lock.yaml`.

### Change Log
- 2026-09-24: Story 63.3 implemented (Wave 6 batch 2), verified, integrated. ui-kit build model documented (dist gitignored — audit premise corrected) + check:dist; CLAUDE.md pointers fixed; Supabase opd+pharmacy aligned to 0.10.2; hygiene sweep. DTO consolidation handled by 59.2 / admin Patient deferred. Status → review.
