# Story 63.2: Lab-Lite Placeholder Content Gating & UI Standards Sweep

Status: review

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

- [x] **Task 1: Content gates** (AC: 1, 2, 3) — new `lib/feature-flags.ts`; atlas placeholder entries hidden with "content pending" EmptyState (default hidden until real photomicrographs); `[TRANSLATE]`/empty-audio guidance hidden per-locale with "translation pending" (**decision: hide, NO English fallback** — patient-facing; raw marker can never render; reversible via `NEXT_PUBLIC_LAB_SHOW_UNTRANSLATED_GUIDANCE`); readiness equipment stub → honest "not available" (additive `unavailable` flag, excluded from RAG rollup); escalate no-op → **wired to real `lab.escalateAiResult`** via the existing `confidence-escalation.ts` client wrapper (PHI-free payload), not disabled.
- [x] **Task 2: Palette sweep** (AC: 4) — ~1705 palette-shade tokens + 117 invalid `primary-500/600` across ~184 files → semantic tokens (shade-aware two-tone mapping: light shades→`/10`/`/30` tints; red→destructive, amber/yellow/orange→warning, green/emerald/teal→success, blue/indigo→primary, neutrals→muted/border). Invalid `primary-NNN` **confirmed no-op** (preset has only `primary.DEFAULT`/`.foreground`) → conversion is a real visual fix. Documented inline-SVG exceptions + `cultural-flags.ts` registry preserved.
- [x] **Task 3: RTL + layout fixes** (AC: 5) — 16 physical-direction classes across the 9 files → logical (`ms/me/ps/pe/text-start/end`); result-entry back button → `Button variant="ghost" size="sm" className="w-fit px-0"` + `DirectionalIcon`; finance/payment h1 layout fix; kiosk exception comment; `generateMessageId` `Math.random()`→`crypto.randomUUID()` (verified: `enqueueSyncEvent` same-ms collision already fixed by 60.1; `generateConfirmCode` already uses `crypto.getRandomValues`).
- [x] **Task 4: Regression verification** (AC: 6) — lab-lite 3977 passed (13 skipped), 0 failures; all 5 apps typecheck clean; 41 snapshots updated (palette class-strings only; RTL logical positioning preserved; no blanket `-u`).

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
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Debug Log References
`pnpm -F lab-lite typecheck` clean; all 5 apps typecheck clean; `pnpm -F lab-lite test` → 304 files, 3977 passed, 13 skipped, 0 failures (combined tree).

### Completion Notes List
- **Guidance decision (recorded): HIDE per-locale, no English fallback.** A misleading English block to a patient expecting their language is worse than an honest "translation pending" state; a raw `[TRANSLATE]` token can never reach the UI (defensive strip even when revealed). Reversible flag.
- **Escalate WIRED (not disabled):** a tested client wrapper (`confidence-escalation.ts` → `triggerAutoEscalation` → `POST lab.escalateAiResult`, landed by 59.1) already existed; the former `router.push('/worklist')` no-op now fires it with a PHI-free payload then navigates.
- **Palette scale ~8× the story estimate** (~1705 tokens + 117 invalid `primary-NNN` across ~184 files vs "~210 in ~90"). Handled via a reviewed shade-aware conversion (each file reconstructed from HEAD so two-tone light/dark pairs map to legible `/10`+solid tints, not red-on-red); conversions confined to className strings (0 false positives). Invalid `primary-500/600` verified no-op → real visual fix.
- **60.1 collision checks (verified at source):** `enqueueSyncEvent` id already collision-safe (`...-${Date.now()}-${crypto.randomUUID()}`); `generateMessageId` still used `Math.random()` (60.1 didn't touch that file) → fixed.
- **Exceptions preserved:** documented inline-SVG list + `cultural-flags.ts` registry (kept intentional `indigo-*`, feeds the "blue/purple NOT red" cultural-distinction test). `EmergencyButton` inline `style rgb(220,38,38)` left as-is (inline style, outside mechanical class scope). Readiness used an additive `unavailable?` flag rather than widening the strict `RAGStatus` union (lower blast radius).

### File List
New — `apps/lab-lite/src/lib/feature-flags.ts`, `src/__tests__/content-gates.test.ts`.
Modified — ~216 lab-lite files: content gates (`lib/visual-atlas.ts`, `components/atlas/AtlasBrowser.tsx`, `lib/public-health-guidance.ts`, `lib/readiness-engine.ts`, `components/dashboard/ReadinessBriefingCard.tsx`, `results/[sampleId]/enter/page.tsx`, `messages/{en,ar,prs,ps}.json`); ~178 palette-swept components/lib; 9 RTL/layout files; `sms/message-formatter`; 16 `.snap` files (41 snapshots) + ~8 assertion tests.

### Change Log
- 2026-09-24: Story 63.2 implemented (Wave 6 batch 3), verified, integrated. Placeholder atlas/guidance gated (flag-reversible, hide-not-fallback), escalate wired to escalateAiResult, readiness honest-state; ~1705 palette tokens + 117 invalid primary-NNN → semantic tokens; 16 RTL fixes. Status → review.
