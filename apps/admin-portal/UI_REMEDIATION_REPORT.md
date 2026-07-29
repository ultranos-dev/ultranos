# admin-portal — UI/UX/Layout Remediation Report

Sweep per `docs/ui-remediation-sweep.md`, bringing admin-portal to the OPD-Lite reference standard.
Branch: `ux-v1.5-admin-portal` (isolated worktree). **No commits/staging performed** — all changes left in the working tree.

## List-page redesign to the OPD-Lite `/notifications` template (live-verified)

Per direction, the OPD-Lite Notifications page is the design standard for **list pages without stat boxes**. Every admin list page was refactored to match it and **verified on screen** (authenticated dev server, real data):

Template (from `apps/opd-lite/src/components/notifications/NotificationCenter.tsx`):
- Standalone `<h1>` (no action beside it).
- **One toolbar row** (`flex flex-wrap items-center gap-3`): pill tabs → wide search (`min-w-[200px] flex-1`) → filter `<select>`(s) → **primary action folded into the same row** (Create/Export/Add/Merge).
- **One content box** (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`) holding loading / centered empty (`min-h-[16rem]`) / the table (`overflow-x-auto` → `divide-y` table, tbody transparent). Pagination sits **below** the box.

Refactored + screenshot-verified (10): `providers`, `providers/expiry`, `labs`, `certifications`, `inventory/suppliers`, `patients` (search-first), `subscriptions/invoices`, `users` (AllUsers + LabAssignments tabs), and the list halves of the hybrids `alerts` and `mentorship` (stat/metric cards on those kept). `labs/[labId]/staff` uses the identical template (typecheck-clean; not individually screenshotted).

Verification after refactor: **tests 43/43 files · 271/271 pass**, **0 tsc errors** in touched files.

## Live visual review (added after initial code-level sweep)

The initial sweep was verified at the code/test level only, **not** rendered — which missed real visual
inconsistencies (e.g. the dashboard's 4 stat cards had a green-tinted first card at `text-3xl` while the
others were plain white at `text-xl`). Corrected by driving the app in a browser (Playwright) against a
local dev server authenticated via the existing session, rendering **my** code with **real data**:

- **Dashboard cards** normalized to one uniform box idiom (`rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`), equal value size, equal height, consistent danger accent — **verified on screen**.
- **Cross-page radius** normalized: 13 `rounded-3xl` content cards (settings, patients/merge, and 4 components) → `rounded-xl` to match the box idiom — verified on settings.
- **Visually reviewed** dashboard, audit, settings, providers, ai-models, network, inventory — all render with a single `<h1>`, always-visible toolbars, boxed/centered empty states, and internally-consistent cards.
- Note: a data-review of populated tables was limited because the local Hub API only allows specific dev origins for CORS; pages were reviewed with real (mostly-empty) org data + clean empty states.
- The screenshot harness (temporary `.env.local`, dev server) was fully removed afterward; no auth-bypass or scaffolding remains in the tree.

## Verification numbers (final — after UI sweep + test-catchup)

| Gate | Baseline (HEAD) | Final | Result |
|---|---|---|---|
| **Tests** (`vitest run`) | 27 files fail / 15 pass; 1 test fail / 94 pass (176 tests blocked from even running) | **43 files pass / 43; 271 tests pass / 271** (0 unhandled errors) | ✅ **fully green** (+176 tests now run & pass) |
| **Typecheck** (`tsc --noEmit`, admin-portal `src/`) | 1 error (`certifications/page.tsx:95`) | 0 errors in touched files (certifications bug fixed; 13 pre-existing test-type errors also cleaned up) | ✅ |
| **Lint** (`eslint src`) | 14 errors / 25 warnings | 12 errors / 26 warnings — all 12 errors verified pre-existing `no-unused-vars` at HEAD; 0 introduced | ✅ no new errors |
| **i18n parity** | 664 keys | **743 keys**, en/ar/prs/ps aligned (0 missing / 0 extra) | ✅ |

> `certifications/page.tsx:95` JSX-parent bug (the sole baseline tsc error) was fixed during the sweep. The test suite went from mostly-red (only 95 of 271 tests could even collect) to fully green.

### Pre-existing issues — NOW FIXED (test-catchup, at user request)
- **~26 test files failed at collection** — they imported `../app/<route>/page` but routes live under `../app/[locale]/<route>/page` (stale from the i18n route-group migration). **Fixed:** corrected the `[locale]` import path in 23 test files.
- **`jest-axe` missing dependency** (accessibility.test.tsx) — **Fixed:** added `jest-axe` + `@types/jest-axe` to devDependencies, plus a Vitest matcher type augmentation (`src/test-matchers.d.ts`) for `toHaveNoViolations`.
- **Bare `radix-ui` import** in `sidebar/nav-main.tsx` — this was the correct pattern (ui-kit imports the same unified `radix-ui@1.4.3`); admin-portal just didn't declare it. **Fixed:** added `radix-ui` to dependencies.
- **Missing-locale hrefs "bug"** (previously reported) — **VERIFIED NOT A BUG.** The app config is `localePrefix: 'never'` (`src/i18n/routing.ts`), so non-prefixed URLs (`/subscriptions/billing`) are correct app-wide (the whole nav/sidebar uses them). No change made.
- **Assertion drift** across 19 test files (empty-state text now via i18n keys, h1 duplicating button labels, column-header renames, stale mock shapes) — **Fixed** to match the current render (design-aligned, coverage preserved).
- **13 pre-existing `HTMLElement | undefined` test-type errors** (`noUncheckedIndexedAccess`) — **Fixed** with `!` assertions.

### Genuine bugs found & fixed during test-catchup
- **5 missing i18n keys** referenced by pages but absent from all message files (rendered raw keys in production): `users.detailSave`/`detailCancel`/`detailNever`/`detailSuspendPlaceholder`, `aiModels.loading`. **Added** to all 4 locales (+ translations).
- **`RecentActivityFeed.dotColor` crash** — threw `Cannot read 'toLowerCase' of undefined` on any activity row missing `action`, taking down the **entire dashboard**. **Hardened** (defensive null-guard).
- **`AddModuleDialog` crash** — `modules.length` threw when the query result lacked `modules`. **Hardened** (`result?.modules ?? []`).

### Test infrastructure added (benefits the whole suite)
- Global `next-intl` mock in `setup.ts` resolving real `en.json` messages (unblocked 191 `useTranslations`-without-provider failures at once).
- Global `HTMLCanvasElement.getContext` stub (dashboard/audit chart widgets).

### Environment note
The shared pnpm store was repeatedly thrashed by the concurrent pharmacy-lite/lab-lite sweeps (node_modules/dist wiped mid-run, affecting even the main tree). All verification was run as atomic install→build→check commands to capture clean windows.

## i18n
- **74 new keys** added across all 4 locales (`en` real English; `ar`/`prs`/`ps` machine-translated). Scope limited (per decision) to strings this sweep introduced: page search placeholders, status/filter tab labels, EmptyState titles/descriptions, filtered-empty messages, 2 table-column headers (`providers.colLicenseDoc`, `colRegistryStatus`). Pre-existing hardcoded English (table headers, buttons, pagination, error/success text) left as-is and noted as separate i18n debt.
- All 74 machine translations flagged in `messages/TRANSLATION_REVIEW.md` for native-speaker review.

## Decision points raised & resolved (with the user)
1. **i18n scope** → Scoped to sweep-introduced UI only (not a full pre-existing-English migration).
2. **Patients list** → Kept search-first server-search behavior (no auto-load-all-PHI); applied layout fixes only.
3. **List-page toolbars** → Contextual per page (status pill tabs + wired search + filtered-empty) for genuine lists; dashboards (network grid, inventory heatmap) kept as dashboards.

## Per-page outcome

**Auth / skipped (6):** `login`, `register`, `forgot-password`, `reset-password` (auth brand panels — untouched), `[locale]/page.tsx` (landing — untouched), `staff/page.tsx` (redirect).

**Width-constrained roots fixed (§5.1):** `labs/create`, `users/create`, `staff/[id]/health` (×2 spots), `settings` (6 section `max-w-2xl` removed). *(The other 15 grep hits were legit `DialogContent`/input/prose `max-w` — left.)*

**List pages — full toolbar treatment (§5.4/§5.5) + box + centered empties + filtered-empty:**
`certifications`, `providers`, `providers/expiry`, `labs`, `labs/[labId]/staff`, `inventory/suppliers`, `mentorship`, `subscriptions/invoices`, `users` (`AllUsersTab` + `LabAssignmentsTab`), `alerts`, `patients` (search-first). Each: `<h1>` from `pageTitle`; always-visible `flex flex-wrap items-center gap-3` toolbar with pill tabs (`px-4`, `aria-pressed`) + ui-kit `Input` (`min-w-[200px] flex-1`, `dir="auto"`); table boxed (`overflow-x-auto rounded-xl ring-[0.65px] ring-border/50`, `thead bg-muted`, `tbody bg-background`); bare/ad-hoc empties → boxed centered `md` EmptyState + a distinct `FileSearch` filtered-empty; wired real client-side filtering (or restyled existing server filter).

**Dashboards — header + box + empty polish (§5.2/5.3/5.6):** `dashboard`, `audit` (+ `EventBrowser`), `ai-models`, `network` (+ `OutbreakDashboard`), `inventory`.

**Detail / form pages — header + box + sub-section empties:** `patients/[patientId]`, `patients/merge`, `providers/[submissionId]`, `providers/profile/[practitionerId]`, `labs/[labId]`, `alerts/[alertId]`, `users/[userId]`, `staff/[id]/certifications`, `subscriptions`, `subscriptions/billing`, `labs/create`, `users/create`, `staff/[id]/health`.

**Structural fix:** `alerts/configuration` — removed nested `<main>` + redundant self-rendered `<BreadcrumbHeader>` + double `p-4`; normalized `<h1>`.

**Semantic-token fixes (§3.5):** converted non-semantic palette classes (`bg-red-*`/`green-*`) → `destructive`/`success` tokens in `users/create` and `staff/health` toast.

## Tests added/updated
- **NEW** `suppliers-toolbar.test.tsx` — 3 tests, all pass: toolbar (search + status tabs) renders when list is empty (§5.5); client-side search filtering; status-tab filtering + filtered-empty state.
- **UPDATED** `event-browser.test.tsx` — added `next-intl` key-echo mock (EventBrowser now renders its empty state via the shared `EmptyState` + `useTranslations`) and updated the empty-state assertion to the i18n keys (assertion drift toward the new design, per §7).

## Files changed
33 `.tsx` (pages + `AllUsersTab`/`LabAssignmentsTab`/`EventBrowser`/`OutbreakDashboard`), 4 `messages/*.json`, 1 new `messages/TRANSLATION_REVIEW.md`, 1 new + 1 updated test. All within `apps/admin-portal/` — no other apps, no `packages/ui-kit` edits.
