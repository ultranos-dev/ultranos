# Agent Prompt — Remediate `<APP>` UI/UX page-by-page, with verified screenshots

> Copy everything below the line into a fresh agent. Replace **`<APP>`** with the target app's folder name (e.g. `pharmacy-lite`, `admin-portal`, `opd-lite`). Replace **`<PORT>`** with a free CORS-allowed dev port (`3002`, `3007`, or `3008`). Everything else is generic.

---

You are remediating the UI/UX of **ONE** app in the Ultranos monorepo: **`apps/<APP>/`**. Your job: bring **EVERY non-auth page** up to the Ultranos page-layout standard and **verify each one on screen** (before and after). Work **one page at a time**. Do not batch-claim.

## 0. Read these in full BEFORE touching code
1. `docs/opd-list-page-remediation-guide.md` — the standard for **pages WITHOUT stat boxes** (list/table, search-first, form, detail, action). The reference is OPD-Lite Notifications: `apps/opd-lite/src/components/notifications/NotificationCenter.tsx`.
2. `docs/statbox-page-remediation-guide.md` — the standard for **pages WITH stat boxes** (dashboards). The reference is the Lab-Lite Quality dashboard: `apps/lab-lite/src/components/quality/QualityDashboard.tsx`.
3. Root `CLAUDE.md` — the **Content Area Layout** section (full-width shell rules, the no-stat-box page standard), the ShadCN/ui-kit import rules, icons, RTL, semantic tokens, and the **⛔ HEALTHCARE SAFETY RULES** (this is a PHI system).
4. A completed reference implementation to copy structure from (already remediated): the admin-portal `providers` (table), `patients` (search-first), `mentorship` (hybrid), `dashboard` (stat cards); and lab-lite `sendouts`/`escalations` (list), `quality` (stat boxes).

## 1. Ground rules (non-negotiable)
- **Work in the main working tree** unless the human tells you otherwise. **Never `git add`/`commit`/stash** without an explicit instruction — the human controls git. If you must run parallel *file-mutating* agents, each needs its own worktree; read-only agents may share the tree.
- **VERIFY, DON'T CLAIM. Reading class strings is NOT verification.** Every "done/fixed/passing" needs a command you just ran or a page you just looked at on screen. A confident-but-wrong "it's done" is the failure mode to avoid.
- **Verify against the SPEC, not your impression.** After a change, open the reference (OPD Notifications / Quality dashboard) side-by-side in your head and check each defining property. (Real prior failure: an agent called a toolbar "perfect" when it had no search and the action was shoved to the far right with a big void — the opposite of the spec.) A page that merely *renders* is not necessarily *conformant*.
- **Semantic tokens only** (no hex, no raw `oklch()`, no `bg-gray/blue/red-NNN` in components). Icons from `@ultranos/ui-kit/icons` (subpath). RTL: logical properties (`ms-*/me-*`, `text-start/end`), never `pl/pr/ml/mr/text-left`.
- **PHI:** never put patient names/IDs/diagnoses/meds in logs, errors, or comments; keep allergy/critical prominence (first, red — via the `destructive` token); audit code is compliance-critical (append-only, hash-chained) — follow the exact existing pattern or escalate.
- **ui-kit changes are source-level + require a rebuild** (`pnpm --filter @ultranos/ui-kit build`); app `src/components/ui/*` are thin re-export proxies. Most work is app-level composition.

## 2. Phase 0 — Baseline + screenshot harness (do this first)
**Capture a baseline** so you can tell NEW breakage from pre-existing. The baseline is very likely **already broken** (many pre-existing typecheck errors + failing tests). Your gate is **"no NEW breakage vs baseline,"** NOT "green."
- Run checks **atomically** (chain in one command) to dodge the pnpm store thrash that wipes `node_modules` between commands:
  ```
  pnpm install && pnpm turbo run build --filter='./packages/*' ; pnpm -F @ultranos/<APP> run typecheck 2>&1 | grep -c 'error TS'
  pnpm -F @ultranos/<APP> test 2>&1 | grep -E 'Test Files|Tests '
  ```
  Save the sorted error list and the failed-test-file set for later diffing. Note: package builds may fail on stale test files → cascading module-resolution "noise" errors that are IN the baseline; don't chase those.

**Stand up the live screenshot harness** (this is how you verify):
- Servers may already be running. Find a lab dev server on a **CORS-allowed port** (`3000/3001/3002/3003/3007/3008` — the Hub API only allows these). If `apps/<APP>` isn't already served on one, start your own: `pnpm -F @ultranos/<APP> exec next dev --port <PORT>`.
- Auth is the human's **shared `localhost` session cookie** (host-only → shared across ports). Drive the **Playwright MCP browser**: navigate to `http://localhost:<PORT>/en/<route>`; the shared cookie authenticates it. If it redirects to `/login`, the JWT expired — navigate to the dashboard once (supabase refreshes) or ask the human to re-sign-in. See `opd-list-page-remediation-guide.md` §9 for the full setup (`.env.local` with the real project ref + anon key, extracting them from the running app's JS bundles).
- If the shared MCP browser is **locked by another agent**, retry over time. Only force-clear the profile lock if there is genuinely no live chrome process holding that profile (a crashed/stale lock) — **never stomp a peer agent's live session**.

## 3. Phase 1 — Enumerate + classify EVERY page
- `git ls-files "apps/<APP>/src/app/**/page.tsx"` (or `find`). Many `page.tsx` just `return <SomeComponent/>` — **the delegate component is effectively the page root** and must follow the same rules.
- Classify each route:

| Class | How to spot it | Which guide |
|---|---|---|
| **List / table** | a collection with columns/rows | opd-list-page guide (full toolbar+box template) |
| **Search-first list** | loads nothing until a search term | opd-list-page guide (keep load-on-search) |
| **Hybrid** | stat cards **and** a list | statbox guide for the cards + opd-list guide for the list part |
| **Dashboard (stat boxes)** | grids of KPI/metric/streak/badge cards | **statbox guide** |
| **Detail** | one record, side-by-side info cards | opd-list guide §5 (box idiom, `w-fit` back button) |
| **Form / wizard** | create/edit inputs, multi-step | opd-list guide §5 (boxed sections) |
| **Auth** | login/register/forgot/reset/landing | **SKIP** — do not touch the brand panel |
| **Redirect / kiosk / mobile-context** | e.g. `staff→/users`, a wall display, a CHW field screen | judgment — skip redirects; kiosk/mobile screens may not fit the desktop toolbar (document the call) |

Produce a classification table before editing.

## 4. Phase 2 — The per-page loop (repeat for EACH non-auth page)
1. **Navigate + screenshot BEFORE.** Actually read the PNG.
2. **Read** the `page.tsx` + its delegate component(s).
3. **Diff against the applicable guide's spec** (the three defining properties for no-stat-box pages; the four card archetypes + uniformity rules for stat-box pages). List the exact deviations with `file:line`.
4. **Remediate** to the spec.
5. **Screenshot AFTER** and **look at it.** Routes often show a transient full-page spinner — **poll for `#main-content h1`** before screenshotting (up to ~5s). If it stays blank / shows "Safe Mode" / 500s, **diagnose** (see §6) — do not move on.
6. **Confirm on screen** it matches the reference. If a page has no data record (empty org) or is behind a role gate you can't satisfy, say so **honestly** and fix it structurally + by grep anyway; note it can't be screenshot-verified.
7. **Record the outcome:** `changed` / `already-conformed` / `skipped (reason)` / `blocked (pre-existing bug: …)`. For detail pages, reach them by clicking a `tbody` row (`browser_evaluate(() => document.querySelector('tbody tr')?.click())`).

Do **every** non-auth page. Detail/form pages are where hidden inconsistencies live — do not skip them.

## 5. The standard, in one screen
**No-stat-box page (list/table/form/detail):** full-width root `flex flex-col gap-4` (never `mx-auto`/`max-w-*`/nested `<main>`/inline `maxWidth`) → standalone `<h1 text-2xl font-semibold>` → **ONE always-rendered toolbar row** (`flex flex-wrap items-center gap-3`: pill tabs · **wide `SearchInput` `min-w-[200px] flex-1`** · filter `<select>`s · **primary action folded at the END**; the search is the space-filler — don't `ms-auto` a lone action) → **ONE content box** `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50` wrapping loading / centered `EmptyState` / table (`thead bg-muted`, `th` muted-xs-uppercase, `tbody` **no** `bg-background`, rows `hover:bg-muted/50`) → pagination **below** the box. Detail/form: box idiom, `<Button variant="ghost" size="sm" className="w-fit px-0">` back button.

**Stat-box page (dashboard):** full-width root → labelled `<section>`s (`h2 text-lg font-semibold mb-4` + a responsive card grid) → **uniform** `rounded-xl bg-card` cards (Large-KPI `p-6`/`text-5xl`, Compact-metric `p-4`/`text-3xl`+semantic trend, Progress bar, Achievement tiles earned-solid/locked-`opacity-50`) → **convey danger with a `ring-2 ring-destructive/50` or a semantic token, NEVER a different-sized/coloured background** → reserve optional lines so heights match.

## 6. Known bug patterns to HUNT (found the hard way in prior remediations)
1. **Route renders blank (no `#main-content`, 0 console errors) = double auth guard.** If a page wraps its content in a page-level `<AuthGuard>` *and* the app layout already provides one, the nested guard blanks the route. **Bisect:** temporarily stub the page (`return <div>TEST</div>`); if the stub renders but the guarded version doesn't, remove the redundant page-level guard. (This blanked ~14 pages in one app.)
2. **Missing i18n namespace / key mismatch.** A page calls `t('x')` where the key/namespace doesn't exist → raw keys render or it throws. Whole namespaces can be absent; components can reference keys that don't match the messages file (`t('tab.active')` vs a `activeTab` key). Grep every `t('…')`, reconcile against `en.json`, add to **all four** locales.
3. **Broken imports / missing deps surface once guards are removed** → `500` or a "Safe Mode" error boundary. Symptoms: `import X from '…'` where X isn't exported; an icon not in ui-kit (`<undefined/>` → "Element type is invalid"); a `import('pkg')` for an uninstalled package (webpack fails the whole chunk). Fix by finding the real export / adding the missing icon to ui-kit + rebuild / installing the dep. **Compliance-critical code (audit `report*` functions): follow the exact existing pattern or ESCALATE — never guess the AuditAction/ResourceType.**
4. **Not full-width** — `mx-auto`/`max-w-*` on page roots or delegate roots (grep the whole tree, not just `page.tsx`), inline `style={{ maxWidth, margin:'0 auto' }}`, nested `<main>`, `p-6`/`px-6` double-padding. Strip them (roots that become empty → `flex flex-col gap-4`).
5. **Non-semantic colours** — sweep `text-gray-* → foreground/muted-foreground`, `border-gray-* → border`, `bg-gray-50/100 → bg-muted`, `bg-white → bg-card`, and interactive `blue → primary` / focus rings → `ring`. Keep status colours **semantic** (`destructive`/`warning`/`success`); status-meaning tints may stay. Keep critical/allergy/emergency **red** via `destructive`.
6. **Black/gray/plain table headers** (`bg-black`, `bg-gray-50`, bare `<thead>`) → `bg-muted`. **`bg-popover`/`bg-background` on `<tbody>`** → remove (inherit the box).
7. **Back buttons missing `w-fit`** (a ghost button as a direct flex-col child stretches full-width + centers its text). **Action in a header row** instead of folded into the toolbar. **Split empty-box + separate table wrapper** → unify into one box. **Radius drift** (`rounded-2xl/3xl/lg` on content cards → `rounded-xl`). **`crash-on-undefined`** in list/dashboard components (guard `(x ?? '')`).
8. **Orphaned pages / dead nav paths.** Map the sidebar `url:`s + every `href`/`router.push`/`window.open` against all routes; any route with no inbound nav is unreachable. Add sidebar links / parent-page cards for the clear cases; **escalate workflow decisions** (where a clinical detail page's entry belongs) rather than inventing an awkward one.

## 7. i18n
Reuse existing keys (page titles from each namespace's `pageTitle`; `common.*`). Add **new** keys to **all four** locales (`en`, `ar`, `prs`, `ps`), **preserving the CRLF byte convention** (parse→stringify(2-space)→restore CRLF+trailing-NL; a blind rewrite flips line endings and creates a massive noise diff). Machine-translate non-en (UI strings are safe) and **flag every one** in `messages/TRANSLATION_REVIEW.md`. Never MT legal/consent bodies. Keep parity `missing 0 / extra 0`:
```
node -e "function k(o,p=''){let a=[];for(const x in o){const v=o[x],n=p?p+'.'+x:x;v&&typeof v=='object'&&!Array.isArray(v)?a=a.concat(k(v,n)):a.push(n)}return a} const en=new Set(k(require('./en.json'))); for(const l of ['ar','prs','ps']){const s=new Set(k(require('./'+l+'.json')));console.log(l,'missing',[...en].filter(x=>!s.has(x)).length,'extra',[...s].filter(x=>!en.has(x)).length)}"
```

## 8. Verification gate (report EXACT numbers)
- **Per page:** a reviewed AFTER screenshot that matches the reference spec.
- **Typecheck:** `pnpm -F @ultranos/<APP> run typecheck` — **no NEW errors** vs baseline (filter the package-build module-resolution noise).
- **Tests:** `pnpm -F @ultranos/<APP> test` — **no NEW failures** vs baseline. Inspect every snapshot diff before `-u` (className-only, layout toward the new design — never revert a fix). Add a regression test: **"toolbar/controls visible when the list is empty."** Watch for baseline collection-failures that now run (net improvement) and pre-existing wall-clock flakes (not yours).
- **Lint:** no NEW errors.
- **i18n parity:** `missing 0 / extra 0` for ar/prs/ps.
- **Visual:** a reviewed screenshot of **every** non-auth page. This is the gate that gets skipped — do NOT skip it.

Run checks atomically. Clean up the harness afterward (delete any `.env.local` you created, kill dev servers you started, `git ls-files --others --exclude-standard -- '*.png' | xargs rm` any screenshots the browser dropped in the repo).

## 9. Deliverables
- The code changes + new i18n keys (4-locale parity + flagged in `TRANSLATION_REVIEW.md`) + tests.
- A **per-app remediation report** (`docs/<APP>-ux-remediation-report.md`): every page with its outcome (changed / already-conformed / skipped-reason / blocked-reason), pitfalls found (with the bug-pattern from §6), the final verification numbers, and which screenshots were reviewed.
- **Do NOT commit** — leave everything in the working tree for the human.

## 10. Escalate, don't guess
Surface (don't silently "fix"): genuine functional bugs, compliance-critical audit code, library version-compat, and ambiguous workflow decisions (e.g. where an orphaned clinical page's entry point belongs). Present options with a recommendation and let the human decide. When you can't verify something, say so plainly — an honest "I couldn't render this page because of pre-existing bug X" beats a confident wrong "it's done."
