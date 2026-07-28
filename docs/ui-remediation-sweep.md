# UI/UX/Layout Remediation Sweep — Agent Brief

**Audience:** an autonomous coding agent tasked with bringing the remaining Ultranos apps up to the UI/UX/layout standard already applied to **OPD-Lite**.

**Status of OPD-Lite:** the reference implementation. All patterns below were fixed and verified there. Treat OPD-Lite as the source of truth; copy its patterns, do not invent new ones.

---

## 0. How to use this document

1. Read §1 (scope), §3 (guardrails), §4 (target state), and §5 (issue catalog) fully before touching code.
2. Work **one app at a time**, and within an app **one page at a time** (§6).
3. For every pattern, **open the cited OPD-Lite reference file and copy the real, current class strings** — do not trust the snippets in this doc if they ever disagree with the live reference file. The reference file wins.
4. Never claim something is fixed/passing without having run the check (§7). This is a **healthcare (PHI) system** — a confident-but-wrong claim is worse than "I don't know yet."
5. This is a large sweep (~120 pages across 3 apps). Track progress in a ledger/todo. Do not stop to ask "should I continue?" — execute; only stop for a real blocker or a §9 decision point.

---

## 1. Scope

### In scope — the three Next.js 15 web PWAs (share the ui-kit design system):
- `apps/admin-portal/`
- `apps/pharmacy-lite/`
- `apps/lab-lite/`

### Out of scope (do NOT touch in this sweep):
- `apps/opd-lite/` — already done (the reference).
- **React Native / Expo apps** — `apps/patient-lite-mobile/`, `apps/opd-lite-mobile/`, `apps/pharmopedia/`. They use `@ultranos/ui-kit/tokens.native` (StyleSheet), NOT Tailwind/ShadCN. None of the web patterns below apply. A native sweep is a separate effort.
- **Auth pages** (`login`, `forgot-password`, `reset-password`, `offline`) — these use the intentional split-panel brand layout. Do **not** apply full-width/toolbar/box rules to them, and **do not tone down or recolor the brand panel** (the user cares about this; changing the login green was an explicit past mistake).

---

## 2. Reference implementation (OPD-Lite — copy from these)

| Pattern | Reference file |
|---|---|
| **Gold-standard list page** (full-width + header + always-on toolbar + boxed content + centered empty) | `apps/opd-lite/src/components/patients/PatientDirectory.tsx` |
| List page: tabs + search + filter dropdown, toolbar always rendered, boxed content, centered empty, `divide-y` panel | `apps/opd-lite/src/components/conflicts/ConflictList.tsx` |
| Two-pane master/detail with toolbar + boxed empties | `apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx` |
| Table page with toolbar + window filter + boxed empties | `apps/opd-lite/src/app/[locale]/(app)/expiring-consents/page.tsx` |
| Toolbar with a primary action folded into the same row | `apps/opd-lite/src/components/notifications/NotificationCenter.tsx` |
| Multi-step form page (full-width, header, step progress, each step in a Card) | `apps/opd-lite/src/app/[locale]/(app)/kyc/page.tsx` |
| The canonical box/Card idiom | `apps/opd-lite/src/components/Card.tsx` |
| EmptyState component API (`md` vs `sm`) | `packages/ui-kit/src/components/ui/empty-state.tsx` |
| i18n machine-translation manifest format | `apps/opd-lite/messages/TRANSLATION_REVIEW.md` |
| Design-system + shell + layout rules (authoritative) | root `CLAUDE.md` |

---

## 3. Non-negotiable guardrails

1. **Shared UI changes are source-level + require a rebuild.** Any change to a shared component/token belongs in `packages/ui-kit/src/`, never duplicated into an app. After editing ui-kit: `pnpm --filter @ultranos/ui-kit build` (apps resolve `dist/`, so a source edit without rebuild has no effect). App-level `src/components/ui/*` files are thin re-export proxies only. Most of this sweep should be **app-level page/component composition**, not ui-kit edits.
2. **Full-width pages.** Page roots are `flex flex-col gap-4` with **no** `mx-auto` / `max-w-*`. This applies to forms and dashboards too. (Explicit, repeated user requirement.)
3. **Do not weaken brand or safety UI.** Don't recolor/tone-down auth brand panels. In any clinical app, keep allergy displays at highest prominence (first, red, never collapsed) — never restructure them to reduce prominence.
4. **PHI hygiene.** Never put patient names/IDs/diagnoses/meds into `console.log`, thrown error strings, or comments. If you add logging while debugging, log shape not content, and remove it.
5. **Semantic tokens only.** Use `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, etc. Never hardcoded hex (`bg-[#...]`) or raw `oklch(...)` in component code. (Good news: current hardcoded-hex count in all three apps is 0 — keep it that way.)
6. **Icons** from `@ultranos/ui-kit/icons` (subpath import), with `DirectionalIcon category="navigation"` for arrows/chevrons in RTL and `category="medical"` for pill/flask/etc. (never mirror). **lab-lite has intentional inline SVGs** listed in `CLAUDE.md` (token-icons, ResultColorIndicator, ConfidenceIndicator, QcHistoryView, CulturalFlags, spinners) — **do not migrate those.**
7. **No autonomous commits/staging.** Do not `git add`/`git commit` unless the human explicitly says so.
8. **RTL.** Use logical properties (`ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`/`text-end`), never `pl/pr/ml/mr/text-left`. The app must work in both LTR and RTL.
9. **Parallel work isolation.** If you dispatch multiple *file-mutating* subagents, each must run in its own git worktree. Read-only audit agents may share the tree. Never run `git stash`/`checkout --`/`reset` in a shared working tree.

---

## 4. Target state (design invariants)

Every non-auth page, once remediated, must satisfy:

- **Full-width root:** `<div className="flex flex-col gap-4">` (optionally a header row inside). No width constraint.
- **One page header (`<h1>`)** at the top: `className="text-2xl font-semibold text-foreground"`, text from an existing i18n key (reuse `sidebar.*` / the page's namespace `title` — do not invent English strings inline). Optional right-aligned primary action on the same header row (`flex flex-wrap items-center justify-between gap-4`). Exactly one header per page; never add a nested `<main>` (the shell provides it).
- **Content sits in box container(s)** — the Card idiom: `rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50` (use the `Card` component if the app has one; otherwise the raw classes). Lists/tables fill the box width.
- **Empty states are centered** (see §5.6) and use the ui-kit `EmptyState`, never ad-hoc `<p>No data</p>`.
- **List/collection pages get a contextualized toolbar** (see §5.4/§5.5) that **renders even when the list is empty**.
- **Spacing:** `gap-4` only (never `gap-5/6/8`); `space-y-4` for vertical stacks; no `mt-*`/`mb-*` on direct children of the page root (flex `gap-4` handles spacing). Header height stays `h-14`.
- **Tokens, icons, RTL, i18n parity** all per §3.

---

## 5. Issue catalog

For each: **symptom → rule → fix → how to find**. These are exactly the classes of bug fixed in OPD-Lite.

### 5.1 Width-constrained pages (HIGH — most common)
- **Symptom:** page content is centered in a narrow column instead of filling the content area.
- **Rule:** page roots are full-width; no `mx-auto`/`max-w-*` (including delegate-component roots).
- **Fix:** change the page root (and any delegate root, e.g. a form/dashboard component) from `mx-auto max-w-3xl flex flex-col gap-4` → `flex flex-col gap-4`.
- **Find:** `grep -rlE 'className="[^"]*(mx-auto|max-w-)' apps/<app>/src/app --include=page.tsx`, and check each page's top-level delegate component for the same.
- **Seed counts:** admin-portal **21**, pharmacy-lite **6**, lab-lite **24** page roots currently constrained. (Verify each is a page-root/content constraint before removing — a `max-w` on a *modal* or a *prose paragraph* like `max-w-xs` on descriptive text may be legitimate; the rule targets **page/content-area** width.)

### 5.2 Missing page header (`<h1>`)
- **Symptom:** page renders content with no title; looks headerless.
- **Rule:** every page has one `<h1 className="text-2xl font-semibold text-foreground">` sourced from an existing i18n key.
- **Fix:** add the header as the first child of the page root. If the page has a primary action (e.g. "Create"), put it right-aligned on the header row. Confirm the shell breadcrumb only shows a short crumb (so the `<h1>` isn't a duplicate — this is the Patients pattern: crumb "Patients" + h1 "Patient Directory").
- **Find:** open each page; if there's no `<h1>` in the page or its delegate, it's missing.

### 5.3 Content not in a box container
- **Symptom:** lists/sections/forms float directly on the page background.
- **Rule:** primary content sits in the Card box idiom.
- **Fix:** wrap the content region in `rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50` (or `<Card>`). For **forms/multi-step** pages, wrap each step/section in a Card (see kyc). **Avoid card-in-card** — if wrapping introduces nesting, convert the inner Card to a subtle panel `rounded-xl bg-muted/40 p-4`.

### 5.4 Missing / non-contextual toolbar on list pages
- **Symptom:** a list/table page has no search, no tabs, no filters — or has them placed inconsistently.
- **Rule:** list/collection pages get a **single toolbar row** matching Patients: `flex flex-wrap items-center gap-3` containing, in order, a pill **tab-bar** (status/segment), a **search input** (`flex-1`), then **filter dropdown(s)**; a primary action may sit at the row's end.
- **Contextualize per page** — pick tabs/filters that fit the data (e.g. status tabs `All/Active`, a type/category dropdown, a date-window dropdown). Wire **real client-side filtering** (search + each control), not decorative controls. Add a filtered-empty state ("no matches") distinct from the no-data empty state.
- **Canonical sub-snippets** (verify against `PatientDirectory.tsx` / `ConflictList.tsx`):
  - Pill tab-bar container: `flex gap-1 rounded-full border border-border bg-card p-1 w-fit`
  - Tab button: `rounded-full px-4 py-1.5 text-sm font-medium transition-colors`; active `bg-primary text-primary-foreground`; inactive `text-muted-foreground hover:text-foreground`; set `aria-pressed`/`role="tab"`. **Use `px-4`, not `px-5`.**
  - Search: ui-kit `Input`, `className="min-w-[200px] flex-1"`, `dir="auto"`, and an `aria-label`.
  - Filter `<select>`: `rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm` + `aria-label`.

### 5.5 Toolbar hidden when the list is empty (HIGH — subtle)
- **Symptom:** the toolbar only appears once data exists; on an empty page the search/tabs/filters vanish.
- **Root cause:** the component `return`s the empty state **before** rendering the toolbar (early-return), or gates the toolbar inside a `data.length > 0` branch.
- **Rule:** the toolbar renders whenever the page has **loaded** (not during the initial loading skeleton, not on a hard error) — **including the empty state**. Only the *content region below the toolbar* swaps between list and empty state. This mirrors Patients (toolbar always; only the stat strip is gated on having rows).
- **Fix:** hoist the toolbar out of the data branch; render `toolbar` then `{data.length === 0 ? <centered empty> : <list>}`.
- **Add a regression test** asserting the search/tabs render in the empty state (see §7).

### 5.6 Empty states not centered / ad-hoc / wrong size
- **Symptom:** empty state is a bare left-aligned line, a raw `<p>No results</p>`, or a compact `size="sm"` used as a full page's empty.
- **Rule:**
  - **Main content-area empties** → `md` EmptyState centered in a min-height box: `<div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50"><EmptyState icon={...} title={...} description={...} /></div>` (use `min-h-[18rem]` for a whole-page empty; if the surrounding element is already a box/Card, use just `flex min-h-[16rem] items-center justify-center` without a nested box).
  - **Genuinely compact sub-section empties** — inside dropdowns, modals, collapsible accordions, narrow side panels, table-cell placeholders — **keep `size="sm"`**. Do NOT force these to centered `md`; over-centering small affordances looks wrong. (In OPD-Lite: audit-trail accordion, active-meds card, detail modals, notification bell dropdown stayed `sm` deliberately.)
  - **Never** hand-roll empty markup; always use `EmptyState` from `@ultranos/ui-kit/components/ui/empty-state`.
- **Schedule/grid views are special:** where a time-grid always renders (day/week schedules), the grid is the content; keep the "no appointments" hint modest (boxed, `py-8`, not a giant `min-h`), don't fight the grid.
- **Find:** `grep -rn 'size="sm"' apps/<app>/src` (triage each: main-area → upgrade+center; sub-section → leave); `grep -rniE '>(\s*)(No |Nothing|Empty|None )' apps/<app>/src --include=*.tsx` for ad-hoc empties.
- **Seed counts:** `size="sm"` occurrences — admin-portal **44**, pharmacy-lite **8**, lab-lite **18** (these need triage, not blanket change). Ad-hoc empties (rough) — admin-portal ~18, lab-lite ~6.

### 5.7 Icon-only buttons clipping text content
- **Symptom:** a button that contains a dot + text (or icon + text) is clipped/overlapping because it's forced to a fixed square.
- **Rule:** a fixed-square icon button variant (e.g. `variant="icon"` → 36×36) is only for a **single glyph**. Any button with text/badge content must use a content-sized variant (`ghost`/`primary`) with explicit padding/height.
- **Fix:** swap `variant="icon"` → `variant="ghost"` + `h-9 gap-2 px-2` (or equivalent) for content buttons. (This was the OPD-Lite header-overlap bug.)
- **Find:** `grep -rn 'variant="icon"' apps/<app>/src` then inspect each for non-glyph children. **Seed:** current count is **0** in all three apps — but verify each app's Button adapter/variants and check header widget rows (sync/lang/data-budget indicators) don't overlap.

### 5.8 Loose stacked cards where a single panel reads better
- **Symptom:** a list renders each row as its own bordered card in a `space-y-*` stack, looking noisy.
- **Rule (optional, judgment):** prefer a single box with `divide-y divide-border` rows (see ConflictList). Only do this where it improves clarity and doesn't disturb per-item affordances (expanders, danger highlights). Preserve any `data-testid`s. Don't refactor clinical per-item cards if it risks safety-reviewed layouts — note and skip.

### 5.9 Shell/spacing drift
- **Symptom:** `gap-5/6/8`, `mt-6`/`mb-8` on page-root children, `p-6` wrappers adding double padding over the shell's `p-4`, custom per-page headers, nested `<main>`.
- **Rule:** follow the "Content Area Layout" table in `CLAUDE.md` exactly (header `h-14`; shell `<main>` is `flex flex-1 flex-col gap-4 p-4`; page root `flex flex-col gap-4`; `gap-4` only; no extra padding/margins on root children).
- **Fix:** normalize to `gap-4`/`space-y-4`, remove double padding and stray margins.

---

## 6. Per-app execution process

Do this for `admin-portal`, then `pharmacy-lite`, then `lab-lite` (independent; if parallelizing across apps, use one worktree per app).

**Step 1 — Recon.** Enumerate pages (`find apps/<app>/src/app -name page.tsx`). Run the §10 grep suite to get the anti-pattern hit-list. Skim the app's shell (layout, sidebar, breadcrumb) and its `Card`/`EmptyState`/`Input` re-exports so you use the app's own idioms.

**Step 2 — Classify each page** as: *list/collection* (gets full toolbar treatment), *table*, *dashboard* (cards), *form / multi-step* (boxed sections, no toolbar), *detail view*, or *auth* (skip). This determines which §5 rules apply.

**Step 3 — Fix, one page at a time**, applying only the applicable §5 items. Reuse existing i18n keys; when you must add strings, follow §8. Keep edits minimal and idiomatic to the app.

**Step 4 — Verify the page** (typecheck the file; run any test that references it). Then move on.

**Step 5 — App-level gate** (§7) before declaring the app done.

> **Read-only audit agents** can parallelize Step 1–2 across page groups safely (they share the tree). **File-mutating** fixes should be serial per app, or in isolated worktrees.

---

## 7. Verification gates (per app, before "done")

Run and make green:
- `pnpm -F <app> exec tsc --noEmit` — **no NEW errors** in files you touched. (Some apps carry pre-existing baseline errors; capture the baseline first with a clean `tsc` run so you can distinguish new from pre-existing.)
- `pnpm -F <app> test` (Vitest) — full suite green. Expect fallout and handle it honestly:
  - **Snapshot changes:** inspect every diff before `-u`. Confirm the diff is only your intended layout change (box classes, centering) and there is **no allergy-prominence or content regression**. Then update.
  - **Assertion drift:** e.g. a test asserting `size="sm"` on an empty you upgraded to centered `md` — update the assertion to the new intent (assert centered/`md` + wrapper), don't revert the fix.
  - **Test-harness quirks:** the `next-intl` mock typically returns the i18n **key** as the string; query by key. Some components re-fetch on `t` identity churn — for empty-state tests use a **persistent** fetch mock (`mockResolvedValue`, not `...Once`) so churn re-fetches don't fall into an error branch.
  - **Add regression tests** for §5.5 (toolbar present in empty state) and any filtering you wired.
- `pnpm -F <app> lint` — clean.
- **i18n parity** (§8) — all locales identical key sets.
- **RTL** — run the app's RTL snapshot tests if present; visually confirm logical properties.
- If you changed **ui-kit**: `pnpm --filter @ultranos/ui-kit build` and re-run affected app tests.

Report the exact numbers (files, pass/fail, snapshots updated) — do not say "tests pass" without the run output.

---

## 8. i18n rules

- **Reuse** existing keys wherever possible (page titles from `sidebar.*` or the namespace `title`). Add new keys only for genuinely new UI (search placeholders, tab/filter labels, filtered-empty messages).
- **Key parity across all locales.** Each app ships `en` + the RTL/Dari/Pashto set (`ar`, `prs`, `ps`) — confirm the app's actual locale list. Every new key must be added to **every** locale. Verify parity programmatically after editing:
  ```
  node -e "function k(o,p=''){let a=[];for(const x in o){const v=o[x],n=p?p+'.'+x:x;v&&typeof v=='object'&&!Array.isArray(v)?a=a.concat(k(v,n)):a.push(n)}return a} const en=new Set(k(require('./en.json'))); for(const l of ['ar','prs','ps']){const s=new Set(k(require('./'+l+'.json')));const miss=[...en].filter(x=>!s.has(x)),ex=[...s].filter(x=>!en.has(x));console.log(l,'missing',miss.length,'extra',ex.length)}"
  ```
- **Preserve each file's byte conventions.** Message JSONs may use **CRLF** (often `en.json`) vs **LF**, and may or may not end with a trailing newline. Inject keys via a script that round-trips through `JSON.parse`/`JSON.stringify(obj,null,2)` and then restores the file's original line-ending + trailing-newline (see the approach used for OPD-Lite). A blind rewrite that flips line endings creates a massive noise diff — avoid it.
- **Flag machine translations.** Non-`en` values you add are machine-generated and unverified. Append them to that app's `messages/TRANSLATION_REVIEW.md` (create it, mirroring OPD-Lite's format: one section per key with `en/ar/prs/ps` lines, and a dated addendum header) so a native speaker can review. Never machine-translate legal/consent bodies — flag those for certified translation.

---

## 9. Decision points — stop and ask the human

Present options with a recommendation (don't silently pick) when:
- A page's **information architecture** is ambiguous — e.g. which tabs/filters are "contextual" for a domain-specific page (lab worklist, POS, QC), or whether a screen is a list vs a dashboard.
- A fix would require **ui-kit changes** (broader blast radius) vs an app-local composition change.
- Converting stacked cards → single panel (§5.8) would disturb a **safety-reviewed clinical layout**.
- A test encodes an expectation that **contradicts** the new design (which governs?).
- You find a **functional bug** (not cosmetic) while sweeping — report it separately; don't silently "fix" behavior.

Batch these into one message per app where possible rather than interrupting per page.

---

## 10. Seed findings & recon commands

Reproduce/extend with:
```
# page roots with width constraints (§5.1)
grep -rlE 'className="[^"]*(mx-auto|max-w-)' apps/<app>/src/app --include=page.tsx

# icon-only buttons to inspect for clipping (§5.7)
grep -rn 'variant="icon"' apps/<app>/src

# EmptyState usage + compact-size occurrences to triage (§5.6)
grep -rl 'EmptyState' apps/<app>/src --include='*.tsx' | grep -v __tests__
grep -rn 'size="sm"' apps/<app>/src --include='*.tsx'

# ad-hoc empty text to replace with EmptyState (§5.6)
grep -rniE '>(\s*)(No |Nothing|Empty|None )' apps/<app>/src --include='*.tsx'

# hardcoded colors that must become tokens (§3.5)
grep -rnoE '\[#[0-9a-fA-F]{3,6}\]' apps/<app>/src --include='*.tsx'
```

**Baseline measured for this brief (starting points, not a complete list):**

| App | page roots with max-w/mx-auto | `variant="icon"` files | files using EmptyState | `size="sm"` occurrences | ad-hoc "No…" text | hardcoded hex |
|---|---|---|---|---|---|---|
| admin-portal | 21 | 0 | 14 | 44 | ~18 | 0 |
| pharmacy-lite | 6 | 0 | 12 | 8 | 0 | 0 |
| lab-lite | 24 | 0 | 9 | 18 | ~6 | 0 |

Page counts: admin-portal ~37, pharmacy-lite ~24, lab-lite ~62 (incl. auth pages, which are excluded).

Interpretation: width-constraint removal (§5.1) and empty-state centering/triage (§5.6) are the bulk of the work; icon-button clipping (§5.7) and hardcoded colors (§3.5) appear absent but must still be verified per app. The toolbar work (§5.4/§5.5) applies to whichever pages are genuine list/collection views — identify those in Step 2.

---

## 11. Deliverables

For each app, produce:
1. The code changes (page/component composition; ui-kit only if unavoidable + rebuilt).
2. New i18n keys across all locales, parity verified, machine translations flagged in `TRANSLATION_REVIEW.md`.
3. Tests added/updated; full suite green; snapshots updated with verified diffs.
4. A short **remediation report** per app: pages audited, per-page what changed (or "already conformed" / "skipped — reason"), decision points raised, and the final verification numbers (typecheck, test pass count, snapshots updated, i18n parity).

Do **not** commit. Leave changes in the working tree and report; the human controls git.

---

### One-line summary of the target
Every non-auth page: **full-width root → one `<h1>` header → (if a list) an always-visible contextual toolbar → content in a Card box → centered `md` empty state** — using shared ui-kit components, semantic tokens, logical (RTL-safe) properties, and full i18n key parity, with the test suite green.
