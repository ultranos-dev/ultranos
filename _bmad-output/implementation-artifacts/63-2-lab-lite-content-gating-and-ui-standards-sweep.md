# Story 63.2: Lab-Lite Placeholder Content Gating & UI Standards Sweep

Status: ready-for-dev

## Story

As a lab technician relying on clinical reference tools,
I want placeholder clinical content gated off until real (no gray-square atlas images, no `[TRANSLATE]` guidance, no no-op escalate buttons), and the app's ~210 palette-color and 16 RTL violations swept to platform standards,
so that clinicians never mistake scaffolding for clinical truth and the UI meets the shared design system in both directions.

## Acceptance Criteria

1. **Given** the Visual Atlas, **when** entries have placeholder images (`PLACEHOLDER_JPEG` 1×1 gray) or the placeholder author ("Dr. A. Placeholder" — `atlas-seed-data.ts:19-36`), **then** the atlas is feature-flagged off (or those entries hidden with an explicit "content pending" state) until real photomicrographs land — a clinical reference tool must not render gray squares.
2. **Given** public-health guidance in ar/prs/ps containing `[TRANSLATE]` markers or empty audio fields (`guidance-seed-data.ts`), **then** non-translated entries are hidden per-locale (English fallback with a "translation pending" notice, or hidden — decision recorded) — never raw `[TRANSLATE]` shown to patients/clinicians.
3. **Given** the readiness board's stubbed equipment dimension (`readiness-engine.ts:236`) and the `AnomalyFlagDisplay` escalate no-op (`enter/page.tsx:415-416` — both buttons just `router.push('/worklist')`), **then** each is either implemented minimally or visibly disabled with honest state — no fake-functional controls (escalate should wire to the Story 59.1 escalation endpoint disposition).
4. **Given** the ~210 hardcoded Tailwind palette usages in ~90 files (e.g., `chw/page.tsx:77`, `equipment/EquipmentPage.tsx:34,46` — which also uses INVALID `primary-500/600` classes absent from the preset, `authorization/ResultReviewPanel.tsx:61-97`, result-entry error box `enter/page.tsx:176`), **then** they are converted to semantic tokens (`destructive`, `primary`, `muted-foreground`, etc.), preserving the documented intentional exceptions (ConfidenceIndicator, token-icons, etc.).
5. **Given** the 16 physical-direction class occurrences in 9 files (`PageHeader.tsx`, `sidebar/LabHeader.tsx`, `NavLabUser.tsx`, `KnowledgeCardPanel.tsx`, `orders/WaitTimeIndicator.tsx`, `reports/DailyLogHistory.tsx`, `security/RestorationWizard.tsx`, `settings/LabSettingsView.tsx`, `workload/WorkloadPatterns.tsx`), **then** they use logical properties (`ms-/me-/ps-/pe-/text-start`); plus the layout-standard deviations: `finance/payment` page root, result-entry's ad-hoc `‹` back button (→ `Button variant="ghost" size="sm" className="w-fit px-0"` + `DirectionalIcon`), and the `queue/display` kiosk page gets a documented exception comment.
6. **Zero regression:** every real feature keeps working and looking correct (visual QA on the touched pages, LTR and RTL); gated content returns exactly when flags flip; all pre-existing tests and RTL snapshots pass (snapshots updated only where the fix IS the change); `pnpm typecheck` passes; no feature or functionality is removed or degraded — gating placeholder content is state-honesty, not removal, and each gate is reversible by flag.

## Tasks / Subtasks

- [ ] **Task 1: Content gates** (AC: 1, 2, 3) — feature flags (settings-driven or env) for atlas/guidance-locales; per-entry pending states; escalate/readiness honest-state fixes; decision points (hide vs fallback) presented before implementing.
- [ ] **Task 2: Palette sweep** (AC: 4) — mechanical conversion by file cluster; verify invalid `primary-*` classes were rendering as no-ops (confirming visual QA needs); keep documented exceptions intact.
- [ ] **Task 3: RTL + layout fixes** (AC: 5) — logical-property conversion; back-button standardization; kiosk exception doc; `sms/message-formatter` `Math.random()` → `crypto.randomUUID()` and `enqueueSyncEvent` same-ms ID collision if not already fixed by Story 60.1 (check).
- [ ] **Task 4: Regression verification** (AC: 6) — full lab-lite suite; RTL snapshot run; visual pass (en + ar) over the ~15 most-touched pages; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **M-LAB-2 [A]** (placeholder clinical content — "worse than absent in a diagnostic context"), **L-LAB-1/2/3/4/5 [A/V-spot]** (palette, RTL, layout deviations), **L-LAB-11/12/15 [A]**, audit §5.

### Architecture

- CLAUDE.md UI standards govern: semantic tokens only, logical properties, EmptyState, box idiom, `DirectionalIcon` categories (navigation mirrors, medical never).
- The gamification-cluster scope question (achievements/portfolio/competency — real but sprawling) is a PRODUCT decision tracked in the remediation overview, NOT this story — do not remove features here.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. All real features function and render correctly after the sweep; gated placeholder content is flag-reversible; snapshots update only where the correction is the intended change. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** ~90 files (palette, mechanical), 9 RTL files, seed-data/flag modules, result-entry page, finance/payment page.
**New files:** `lib/feature-flags.ts` (if absent), pending-state components.

### References

- [Source: docs/system-audit-2026-09-23.md#5-lab-lite-appslab-lite] — M-LAB-2, L-items
- [Source: CLAUDE.md#ui-component-system-shadcn / #content-area-layout / #icons / #rtl-support]
- [Source: packages/ui-kit/src/tokens.css] — semantic variables (note: no `primary-500` scale exists)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
