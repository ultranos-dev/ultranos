# OPD-Lite List-Page Remediation Guide

**For the next agent.** This is the authoritative, battle-tested playbook for remediating pages so they match the **OPD-Lite Notifications page** (`http://localhost:3001/notifications`). It captures the exact template, every pitfall discovered the hard way, and — most importantly — **how to actually verify your work on a running, authenticated app** (not just claim it from reading class strings).

> ⚠️ **The #1 lesson from the last remediation:** _reading the code is NOT verifying the UI._ Class strings can look right and still render wrong (uneven cards, black table headers, centered back-buttons, mismatched radii). **You MUST render every page in a browser and look at it.** A confident-but-wrong "it's done" is the failure mode to avoid. Section 9 tells you exactly how to render + screenshot every page, including detail pages behind auth.

---

## 0. TL;DR checklist (do every one of these)

1. Read this whole doc, plus `docs/ui-remediation-sweep.md` (the older sweep brief) and root `CLAUDE.md`.
2. Work in an **isolated git worktree** on your own branch (§8). Never commit without the human saying so.
3. Open the **reference** in a browser and screenshot it: OPD-Lite `/notifications` (port 3001). Read its source: `apps/opd-lite/src/components/notifications/NotificationCenter.tsx`.
4. Read the **already-done admin-portal reference implementation**: `apps/admin-portal/src/app/[locale]/providers/page.tsx` — it is the OPD template applied to a real table page. Copy its structure.
5. **Enumerate every page** in the target app (`find apps/<app>/src/app -name page.tsx`) and **classify** each (§3).
6. **Capture a baseline** (typecheck + test) so you can tell new breakage from pre-existing (§8).
7. **Stand up the live screenshot harness** (§9) — a dev server on a CORS-allowed port, authenticated via the shared `localhost` session cookie.
8. For each page: **screenshot BEFORE → refactor to the correct template → screenshot AFTER → confirm it renders correctly.** Do **every** page. Do not skip detail/form pages — that's where hidden inconsistencies live.
9. Fix i18n (§7), keep 4-locale parity, flag machine translations.
10. **Verification gate** (§10): typecheck (no new errors), full test suite green, lint clean, i18n parity, AND a screenshot of every page. Report exact numbers.

---

## 1. The gold standard: OPD-Lite Notifications

Source of truth: **`apps/opd-lite/src/components/notifications/NotificationCenter.tsx`** (read the live file; if this guide ever disagrees with it, the file wins).

What the page looks like:

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Notifications                                                    (h1)      │
│  ┌───────────────────────────┐ ┌──────────── search ─────────────┐ [sel] [Btn] │  ← ONE toolbar row
│  │ All  Lab  Rx  System (pills)│ │ Search notifications...  (flex-1)│           │
│  └───────────────────────────┘ └──────────────────────────────────┘           │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │  ← ONE content box
│  │                          (list rows / centered empty)                   │ │     (rounded-xl bg-card
│  │                                                                         │ │      shadow-card ring)
│  └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

The three defining properties (these are what most pages get wrong):

1. **Standalone `<h1>`** — no primary-action button sitting beside it in a header row.
2. **ONE toolbar row** — pill tabs, then a **wide** search (`flex-1`), then filter `<select>`(s), then the **primary action button folded into the END of the same row**.
3. **ONE content box** — a single `rounded-xl bg-card shadow-card ring` container that wraps loading / centered-empty / the list-or-table. Pagination sits **below** the box, not inside it.

---

## 2. The exact template (copy these class strings verbatim)

### 2a. Page shell (identical across the 4 web apps)
The app shell already renders `<main id="main-content" className="flex flex-1 flex-col gap-4 p-4">` and a sticky `BreadcrumbHeader` (`h-14`). So a **page root is just**:

```tsx
<div className="flex flex-col gap-4">
  {/* h1, toolbar, content box, pagination */}
</div>
```

Never add: `mx-auto`, `max-w-*`, a nested `<main>`, a second `<h1>`, `p-6`/`px-6` wrappers, `gap-5/6/8`, or `mt-*/mb-*` on direct children (flex `gap-4` handles spacing).

### 2b. Header (standalone)
```tsx
<h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>
```
- Text comes from an existing i18n key (every namespace already has `pageTitle`; some have `xxxPageTitle`). Do **not** invent an English string.
- If the page has a "back" link (detail/sub-pages), put it just before the h1 in a small row: `<div className="flex flex-wrap items-center gap-3"><Button variant="ghost" size="sm" className="w-fit px-0" onClick={...}>← Back</Button><h1 …>…</h1></div>`. **The `w-fit` is mandatory** — see pitfall §6.2.

### 2c. Toolbar (ONE row, primary action folded in)
```tsx
<div className="flex flex-wrap items-center gap-3">
  {/* pill tab-bar */}
  <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
    {TABS.map((tab) => (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-pressed={active === tab}          // or aria-selected for role=tab
        onClick={() => setActive(tab)}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          active === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {tabLabel[tab]}
      </button>
    ))}
  </div>

  {/* wide search — SearchInput renders the field + a trailing circular magnifier button */}
  <SearchInput
    type="text"
    dir="auto"
    placeholder={t('searchPlaceholder')}
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="min-w-[200px] flex-1"
    aria-label={t('searchPlaceholder')}
    // onSearch optional: omit for live-filter bars (button focuses the field);
    // wire it for load-on-submit / typeahead bars to execute the fetch.
  />

  {/* optional secondary filter(s) */}
  <select
    value={filter}
    onChange={(e) => setFilter(e.target.value)}
    className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
    aria-label={t('filterLabel')}
  >
    <option value="all">…</option>
  </select>

  {/* PRIMARY ACTION folded into the same row (Create / Export / Add / Assign / Merge) */}
  <Button onClick={…}>{t('createX')}</Button>
</div>
```
Rules:
- `px-4` on tab buttons — **not** `px-5`.
- **Search is the shared `SearchInput`** (`@ultranos/ui-kit/components/ui/search-input`), `min-w-[200px] flex-1` so it fills the row. `SearchInput` wraps the ui-kit `Input` and adds a **trailing circular magnifier button** at the inline-end — see §2g. The search must be the **wide** element in the row (never a narrow labeled field boxed between other controls — that reads as a form, not the OPD toolbar). Don't leave stacked field labels on the search/selects; use placeholders + `aria-label`.
- The primary action(s) live at the **end of this row**, not in a separate header row.
- The toolbar is **always rendered** — never behind a `loading`/`data.length>0` gate, so search/tabs stay visible when the list is empty. (Only the content-box below swaps.)

### 2d. Error banner (between toolbar and content box)
```tsx
{error && (
  <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
)}
```
(OPD-Lite uses its `<Alert variant="warning">`; the admin-portal uses the div above. Match the app's own convention.)

### 2e. The ONE content box (this is the part most pages get wrong)
```tsx
<div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
  {loading ? (
    <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
      {t('loading')}
    </div>
  ) : rows.length === 0 ? (
    <div className="flex min-h-[16rem] items-center justify-center">
      <EmptyState
        icon={SomeIcon}
        title={filtersActive ? t('noResultsTitle') : t('noX')}
        description={filtersActive ? t('noResultsDescription') : t('noXDescription')}
        action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : { label: t('createX'), onClick: openCreate }}
      />
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colName')}</th>
            {/* … */}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} onClick={…} className="cursor-pointer transition-colors hover:bg-muted/50">
              {/* … */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```
Critical details:
- **One box wraps all three states.** Do NOT use a separate boxed empty state + a separate `overflow-x-auto rounded-xl ring` table wrapper — unify into this single box.
- `<thead className="bg-muted">` with `text-muted-foreground` headers. **Never `bg-black text-white`, never `bg-card`/`bg-popover` for a table header.** (See pitfall §6.1.)
- **`<tbody>` has NO `bg-background`/`bg-popover`** — it inherits the box's `bg-card`. (Leaving `bg-background` creates a subtle two-tone seam.)
- Row hover: `hover:bg-muted/50`. Danger rows: `bg-destructive/10 hover:bg-destructive/10`.
- For a **non-tabular list** (like OPD notifications itself — items, not columns), replace the `<table>` with `<div className="divide-y divide-border">{rows}</div>` and render each row as `flex items-start gap-3 px-4 py-3 … hover:bg-muted`, unread = `bg-primary/10`, escalated = `ring-1 ring-inset ring-destructive/40`.

### 2f. Pagination (BELOW the box, root sibling)
```tsx
{!loading && rows.length > 0 && totalPages > 1 && (
  <div className="flex items-center justify-between text-sm text-muted-foreground">
    <span>Showing {from}–{to} of {total}</span>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={…} onClick={…}>Previous</Button>
      <span className="flex items-center px-2">Page {n} of {total}</span>
      <Button variant="outline" size="sm" disabled={…} onClick={…}>Next</Button>
    </div>
  </div>
)}
```
(Pagination "Previous/Next/Showing" text is pre-existing English and out of scope for i18n unless the app already keys it.)

### 2g. Search field — `SearchInput` with a trailing circular magnifier button

**Every search bar** (list toolbars, search-first pages, typeaheads, dashboard patient search) uses the shared **`SearchInput`** from `@ultranos/ui-kit/components/ui/search-input` — never a bare `Input` or a native `<input>`. It composes the ui-kit `Input` + a **circular magnifier `Button`** pinned to the inline-**end** of the field, so the user has an explicit control to execute the search.

Source of truth: **`packages/ui-kit/src/components/ui/search-input.tsx`** (read the live file; it wins over this guide).

```tsx
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'

<SearchInput
  type="text"
  dir="auto"
  placeholder={t('searchPlaceholder')}
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="min-w-[200px] flex-1"     // layout classes go on the WRAPPER; the input is w-full
  aria-label={t('searchPlaceholder')}
  onSearch={runSearch}                 // OPTIONAL — see below
/>
```

How it's built (for parity if you ever need to hand-roll it): a `relative` wrapper holds the `Input` (given `pe-11` to reserve room) and a `<Button variant="default" size="icon-sm">` (the ui-kit Button is already `rounded-full`, so `icon-sm` = a 32px circle) carrying `<Search className="size-4" />` from `@ultranos/ui-kit/icons`, positioned `absolute end-1.5 top-1/2 -translate-y-1/2`.

Rules:
- **RTL:** the button is at the logical `end` (`end-1.5`) — right in LTR, **left in RTL**. Never hardcode `right-*`.
- **`onSearch` semantics.** It fires on button click **and** on Enter. **Omit it for live-filter bars** (results already update on `onChange`; the button then focuses the field so it's never inert). **Wire it for load-on-submit / typeahead bars** to run the fetch immediately (e.g. `onSearch={() => handleSearch(query)}`).
- **No new i18n keys** — the button's `aria-label` auto-derives from the field's `aria-label`, then `placeholder`. (Pass `searchLabel` only to override.)
- **`className` sizes the wrapper** (put `min-w-[200px] flex-1` here); the inner input is always `w-full`. Use `inputClassName` for input-only tweaks.
- **The search must be the wide element** in the toolbar. Do NOT wrap it in a `flex-col` with a stacked label, and do NOT box it narrowly between other controls — that regresses the toolbar into a labeled form (real example: the pharmacy `HistoryFilterBar` originally rendered a narrow labeled "Medication" field; it was rewritten to a wide unlabeled `SearchInput` with the date/select filters using `display:contents` so everything sits in one Notifications-style row).
- **Test gotcha:** the field and its magnifier button share the same accessible name (both derive from `aria-label`/`placeholder`), so `getByLabelText(...)` will match **two** elements. Query the field by **`getByPlaceholderText`** or a `data-testid` instead.

---

## 3. Classify every page — then apply the right recipe

Run `find apps/<app>/src/app -name page.tsx` and classify each:

| Class | How to spot it | Recipe |
|---|---|---|
| **List / table (no stat boxes)** | A collection: patients, providers, labs, users, suppliers, certifications, invoices, alerts (list part), etc. | **The full §2 OPD template.** This is the main target. |
| **Search-first list** | Loads nothing until a search term (e.g. admin `patients`) | Same template, but **do not change the load-on-search behavior**. The content box shows a centered "search prompt" empty until results exist. |
| **Hybrid (stats + list)** | Has stat/metric cards AND a list (e.g. `mentorship`, `alerts`) | Keep the stat cards where they are (right after h1). Apply §2c toolbar + §2e content box to the **list part only**. |
| **Dashboard (stat boxes)** | Grid of stat cards, no list (e.g. `dashboard`, `audit`, `ai-models`) | **Not** the list template. Use uniform stat cards (§4). Keep tabs if present. |
| **Detail** | Single record, side-by-side info cards (e.g. `labs/[id]`, `users/[id]`) | §5 detail recipe (equal cards, left-aligned `w-fit` back button). |
| **Form / wizard** | Create/edit inputs (e.g. `*/create`, `patients/merge`, settings) | §5 form recipe (full-width boxed sections; each step/section in a card). |
| **Auth** | `login`, `register`, `forgot-password`, `reset-password`, root landing | **SKIP.** Do not touch the split-panel/brand layout. Do not recolor the brand green. |
| **Redirect** | e.g. `staff/page.tsx` → `/users` | Skip. |

> "Pages without stat boxes" (list/table/form/detail) are what the human means by "make them like Notifications." The **list/table** pages get the toolbar+content-box template; detail/form pages get the box idiom but not the toolbar.

---

## 4. Dashboard / stat-card pages

Stat cards must be **uniform** (this was a real bug — one card was green-tinted and larger). Every card in a row:
```tsx
<button type="button" onClick={…}
  className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40">
  <p className="text-sm font-medium text-muted-foreground">{t('label')}</p>
  <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value ?? '—'}</p>
  <p className="mt-1 text-sm font-medium text-muted-foreground">{sublabel}</p>  {/* reserve this line even when empty so heights match */}
</button>
```
- Same `bg-card`, same radius (`rounded-xl`), same value size (`text-3xl`) on ALL cards.
- Convey danger with a ring, not a different background: `ring-2 ring-destructive/50` when in an alert state.
- Grid stretches items to equal height; reserve the sub-label line (render `' '`) so heights match before/after data loads.
- **Status-semantic** stat cards (e.g. mentorship's paired=green / unmatched=amber / check-in=red) may keep colored tints — the color carries meaning there. Neutral KPI cards must be uniform white.

---

## 5. Detail & form recipes

**Detail pages:**
- Header: `← Back` as `<Button variant="ghost" size="sm" className="w-fit px-0">` (left-aligned; see §6.2), then `<h1>` (record name), plus a status badge/actions on the header row if present.
- Info cards side-by-side in a `grid gap-4 md:grid-cols-2`, each card the box idiom `rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`. Equal height. **Avoid card-in-card** — nested cards become `rounded-xl bg-muted/40 p-4`.
- Sub-section empties (e.g. "No status transitions") → `size="sm"` EmptyState or a boxed centered md if it's a main area.

**Form pages:**
- Full-width. Each form/section in a card (box idiom). Multi-step: a step indicator, each step in a card (see OPD `apps/opd-lite/src/app/[locale]/(app)/kyc/page.tsx`).
- Convert non-semantic palette classes (`bg-red-*`, `text-green-*`, amber) to semantic tokens (`destructive`/`success`/`warning`).

---

## 6. Pitfalls found last time (do NOT repeat these)

**6.1 Black table headers.** Some delegate components used `<thead className="bg-black text-white">` (e.g. `SurveillanceConfigForm.tsx`, `SurveillanceAlertHistory.tsx`). Every table header must be `<thead className="bg-muted">` with `text-muted-foreground` th's. Grep: `grep -rn "bg-black\|bg-foreground" apps/<app>/src --include=*.tsx` and `grep -rn "<thead" … | grep -v bg-muted`.

**6.2 Stretched/centered back buttons.** A `<Button variant="ghost" onClick={…}>← Back</Button>` placed as a direct child of a `flex flex-col` **stretches full-width** (align-items: stretch) and renders its text **centered**. Always add `size="sm" className="w-fit px-0"`. Grep: `grep -rn 'variant="ghost".*Back\|router.push' … | grep -v w-fit`.

**6.3 Primary action in a header row instead of the toolbar.** The old pattern put the action top-right beside the h1 (`flex … justify-between`). The OPD template **folds it into the toolbar row**. Standalone h1, action at the end of the toolbar.

**6.4 Split empty box + table wrapper.** The old pattern had a boxed EmptyState AND a separate `overflow-x-auto rounded-xl ring` table wrapper — two boxes. Unify into the **one** content box (§2e).

**6.5 Radius drift.** `rounded-2xl` (70+ occurrences) and `rounded-3xl` (13) coexisted with the idiom's `rounded-xl`. Content cards/tables should be `rounded-xl`. (Small pills/badges/error banners at `rounded-2xl` are fine.) Grep `rounded-3xl` / audit `rounded-2xl` on content cards.

**6.6 `bg-popover` / `bg-background` on content surfaces & table bodies.** Content cards should be `bg-card`; table `<tbody>` should be transparent (inherit the box). Grep `bg-popover`.

**6.7 Nested `<main>` / double padding.** A page must never render its own `<main>` or `<BreadcrumbHeader>` (the shell provides them) or add `p-6` over the shell's `p-4`. (Found in `alerts/configuration`.)

**6.8 Crash-on-undefined in list/dashboard components.** Defensive guards matter — one malformed row shouldn't crash a page. Real bugs found: `RecentActivityFeed.dotColor(action)` threw on `undefined.toLowerCase()`; `AddModuleDialog` did `modules.length` when the query returned no `modules`. Guard with `(x ?? '')` / `result?.field ?? []`.

**6.9 Not full-width.** No `mx-auto`/`max-w-*` on page roots or section cards (repeated human requirement). Forms too.

**6.10 EmptyState.** Always the ui-kit `EmptyState` (`components/ui/empty-state`), never ad-hoc `<p>No data</p>`. Main-area empties centered `md`; genuine tiny sub-sections `size="sm"`. Provide a distinct filtered-empty (icon `FileSearch`, `noResultsTitle`/`noResultsDescription`, "clear" action) vs no-data empty.

---

## 7. i18n rules

- **Reuse** existing keys (page titles from each namespace's `pageTitle`; `common.*` for all/active/cancel/etc.). Add **new** keys only for strings you introduce (search placeholders, tab/filter labels, empty titles/descriptions, filtered-empty).
- **4-locale parity is mandatory:** `en`, `ar`, `prs`, `ps`. Every new key in **all four**. Verify:
  ```
  node -e "function k(o,p=''){let a=[];for(const x in o){const v=o[x],n=p?p+'.'+x:x;v&&typeof v=='object'&&!Array.isArray(v)?a=a.concat(k(v,n)):a.push(n)}return a} const en=new Set(k(require('./en.json'))); for(const l of ['ar','prs','ps']){const s=new Set(k(require('./'+l+'.json')));console.log(l,'missing',[...en].filter(x=>!s.has(x)).length,'extra',[...s].filter(x=>!en.has(x)).length)}"
  ```
- **Preserve byte conventions.** These JSONs are **CRLF** with a trailing newline. Inject via a script that `JSON.parse`→`JSON.stringify(obj,null,2)`→restore CRLF+trailing-NL. A blind rewrite that flips line endings creates a massive noise diff.
- **Machine-translate** non-en values (they're UI strings — safe) and **flag every one** in `messages/TRANSLATION_REVIEW.md` (mirror OPD-Lite's format: one section per key with en/ar/prs/ps). Never machine-translate legal/consent bodies.
- **Watch for missing keys.** Pages sometimes call `t('foo')` where `namespace.foo` doesn't exist → renders the raw key in production. Scan: for each file, map `useTranslations('ns')` bindings, then check every `t('key')` resolves in `en.json`. (Last time this found `users.detailSave/detailCancel/detailNever/detailSuspendPlaceholder`, `aiModels.loading`.)

---

## 8. Environment & isolation (read before running anything)

- **Work in an isolated git worktree** on your own branch (`git worktree add .claude/worktrees/<app>-ux -b <branch> HEAD`). Other agents remediate other apps simultaneously; sharing a tree corrupts uncommitted work. Never run `git stash/reset/checkout --` in a shared tree.
- **The worktree needs its own `node_modules` + built package `dist/`.** After `pnpm install`, build the shared packages: `pnpm turbo run build --filter='./packages/*'` (or at minimum `pnpm --filter @ultranos/ui-kit build`). Apps resolve ui-kit through `dist/`.
- **The pnpm store gets thrashed by concurrent agents.** `node_modules` (clsx, the framework bin, ui-kit `dist/`) can be wiped **between** your commands. Symptom: `pnpm install` says "Done" but `node_modules/.bin/next` or `clsx` is missing seconds later. Mitigation: **run install→build→check as ONE chained command** so it executes in a single window:
  ```
  pnpm install && pnpm --filter @ultranos/ui-kit build && pnpm -F <app> run typecheck
  ```
  A long-running dev server survives once started (the wipe happens between commands, not during one).
- **No autonomous commits.** Leave everything uncommitted until the human says "commit". When they do: commit on your branch, then a **fast-forward merge** into their branch (they run `:3003` from the main tree, on a different branch — your uncommitted worktree changes are invisible there until merged). End the commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Capture a baseline first** so you can distinguish new breakage from pre-existing:
  ```
  pnpm -F <app> run typecheck 2>&1 | grep 'error TS' | sort > /tmp/tsc-baseline.txt
  pnpm -F <app> test 2>&1 | grep -E 'Test Files|Tests '   # note the pass/fail counts
  ```
  (Admin-portal's baseline had many pre-existing failures — see §11.)

---

## 9. ⭐ The live screenshot harness (this is how you actually verify)

**You cannot verify UI by reading code. Render every page and look.** Here's the exact, working setup (used successfully last time):

### 9a. Servers already running
- `:3001` = OPD-Lite (the reference). `:3003` = the admin-portal the human runs. `:3004` = the Hub API. Don't fight them; run **your** server on a different port.
- The Hub API only allows specific dev origins for CORS (see `apps/hub-api/src/lib/cors.ts`): **`localhost:3000, 3001, 3002, 3003, 3007, 3008`**. **Run your dev server on a free one of these** (e.g. `3002`, `3007`, or `3008`) so trpc calls reach the Hub API and pages load **real data**. A non-allowed port (e.g. 3055) → CORS failures → "Failed to load" banners.

### 9b. Auth: reuse the human's session (no login flow, no bypass)
The app uses `@supabase/ssr` which stores the session in a **cookie** named `sb-<projectRef>-auth-token`, scoped to **`localhost`** (host-only → **shared across ports**). So a server you run on `localhost:3002` will read the same session cookie the human's browser already has — **if** your server's `SUPABASE_URL` matches the project ref in that cookie.

Steps (via the Playwright MCP browser):
1. Navigate to the human's app (`http://localhost:3003/dashboard`) so the browser holds the session cookie.
2. Read the project ref + config from the running app:
   ```js
   // cookie name reveals the ref:
   document.cookie.split('; ').map(c=>c.split('=')[0]).filter(n=>n.startsWith('sb-'))
   // → e.g. "sb-<ref>-auth-token"
   // extract SUPABASE_URL + anon key from the app's JS bundles:
   (async () => { for (const s of [...document.querySelectorAll('script[src]')].map(s=>s.src)) {
     const t = await (await fetch(s)).text();
     const url = t.match(/https:\/\/<ref>\.supabase\.co/)?.[0];
     const key = (t.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)||[]).find(k=>{try{return JSON.parse(atob(k.split('.')[1])).role==='anon'}catch{return false}});
     if (url&&key) return {url,key};
   } })()
   ```
3. Create `apps/<app>/.env.local` (untracked; delete when done) with those real values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key>
   NEXT_PUBLIC_HUB_API_URL=http://localhost:3004/api/trpc
   ```
4. Start your server on a CORS-allowed port: `pnpm -F <app> exec next dev --port 3007`.
5. Navigate the Playwright browser to `http://localhost:3007/<route>` — the shared cookie authenticates it; you see **your** code with **real data**.

Notes:
- Sessions **expire** (short-lived admin JWT). If you get redirected to `/login`, navigate to `http://localhost:3007/dashboard` once (supabase-js refreshes the token) or ask the human to re-sign-in, then continue. Don't fight refresh-token rotation races.
- `TaskStop` kills the parent pnpm but a **lingering `next` node process can hold the port** → `EADDRINUSE` on restart. Use another allowed port, or kill by PID: `netstat -ano | grep ":3007 " | grep LISTENING` → `taskkill //PID <pid> //F`.
- If a page 500s with `PageNotFoundError` / `ENOENT rename …pack.gz`, the `.next` webpack cache corrupted — `rm -rf apps/<app>/.next` and restart.

### 9c. Screenshot & review every page
- `browser_navigate` → `browser_take_screenshot` (use `fullPage: true` for long pages) → **read the PNG** and actually look at it.
- **Detail pages need a record id.** Get one by clicking a list row: `browser_evaluate(() => document.querySelector('tbody tr')?.click())` navigates to `/labs/<id>`; screenshot that. Do the same for users, etc.
- **Data-empty pages:** some records won't exist in the test org (patients, provider submissions) — you can't open those detail pages. Note them honestly; fix their code structurally + via grep (e.g. the back-button pitfall) even if you can't screenshot.
- Screenshot BEFORE and AFTER each change so you can prove the fix.

### 9d. Cleanup when done
Delete `apps/<app>/.env.local`, kill your dev servers, and remove any screenshot PNGs the MCP dropped into the repo root (`git ls-files --others --exclude-standard -- '*.png' | xargs rm`).

---

## 10. Verification gate (all must pass; report exact numbers)

1. **Typecheck:** `pnpm -F <app> run typecheck` — **no NEW errors** vs baseline. (Filter env noise: `clsx`/`tailwind-merge` "cannot find module" = the store got wiped mid-run, not your code.)
2. **Tests:** `pnpm -F <app> test` — full suite green, or no NEW failures vs the documented baseline. Inspect every snapshot diff before `-u` (layout-only, no content regression). Update assertion drift **toward the new design**, don't revert fixes. Add a regression test for "toolbar visible when list is empty" and any client filtering you wire.
3. **Lint:** `pnpm -F <app> lint` — no new errors (pre-existing `no-unused-vars` may exist; don't introduce new ones).
4. **i18n parity:** the §7 script shows `missing 0 / extra 0` for ar/prs/ps.
5. **Visual:** a screenshot of **every** non-auth page, reviewed, matching the template. This is the gate that was skipped last time — **do not skip it.**

Run checks atomically (§8) to dodge the store thrash.

---

## 11. Admin-portal status (already done — use as reference, and note the known baseline)

**Done** (branch merged into `ux-v1.5`): all list pages on the OPD template (`providers`, `providers/expiry`, `labs`, `labs/[id]/staff`, `certifications`, `inventory/suppliers`, `patients`, `subscriptions/invoices`, `users` both tabs, `alerts` + `mentorship` list parts); uniform dashboard/stat cards; the black-header + back-button + radius fixes; i18n (79 keys ×4 + `TRANSLATION_REVIEW.md`); test-catchup (suite green **271/271, 43 files**).

**Reference implementations to copy:** `apps/admin-portal/src/app/[locale]/providers/page.tsx` (table list), `…/patients/page.tsx` (search-first), `…/mentorship/page.tsx` (hybrid), `…/dashboard/page.tsx` (uniform stat cards).

**Pre-existing baseline (NOT caused by the sweep; still open):**
- ~26 admin test files originally failed at collection due to stale `../app/<route>` imports (missing the `[locale]` segment) — these were fixed during the catch-up; if you touch another app, expect the same pattern.
- Missing dep pattern: tests needed `jest-axe` (+`@types/jest-axe`) and the app needed `radix-ui` declared (nav-main imports the unified `radix-ui@1.4.3`, same as ui-kit). Add them to the app's `package.json` if absent.
- Test infra added last time and reusable: a **global `next-intl` mock** (resolves real `en.json` so English assertions pass) and a **canvas `getContext` stub** in `src/__tests__/setup.ts`; a vitest matcher augmentation `src/test-matchers.d.ts` for `toHaveNoViolations`.
- **Open functional bug (not layout):** `alerts/configuration` renders a **raw Zod error array** (`[{"code":"too_big",…}]`) instead of a friendly message when the saved surveillance config violates a max — fix the error handling in `SurveillanceConfigForm`, not the layout.

**Remaining admin-portal pages not individually screenshotted** (no data records in the test org, so they can't render): `patients/[patientId]`, `providers/[submissionId]`, `providers/profile/[practitionerId]`, `staff/[practitionerId]/certifications`, `staff/[practitionerId]/health`. Their code follows the box/detail idiom; seed a record and screenshot-verify them.

**Other apps to remediate the same way:** `apps/pharmacy-lite/` and `apps/lab-lite/` (Next.js PWAs sharing the ui-kit). ⚠️ lab-lite has **intentional inline SVGs** listed in root `CLAUDE.md` (token-icons, ResultColorIndicator, ConfidenceIndicator, QcHistoryView, CulturalFlags, spinners) — do **not** migrate those to Lucide.

---

## 12. Guardrails (from `CLAUDE.md` — non-negotiable)

- **Healthcare/PHI:** never put patient names/IDs/diagnoses/meds in logs, errors, or comments. Allergy displays stay at highest prominence (first, red, never collapsed) — never restructure to reduce prominence.
- **Auth pages excluded**; never tone down/recolor the brand panel (the login green is a known past mistake).
- **Semantic tokens only** — no hardcoded hex or raw `oklch()` in components.
- **Icons** from `@ultranos/ui-kit/icons` (subpath import); `DirectionalIcon category="navigation"` mirrors arrows/chevrons in RTL, `category="medical"` never mirrors.
- **RTL:** logical properties (`ps-*/pe-*`, `ms-*/me-*`, `text-start/end`), never `pl/pr/ml/mr/text-left`.
- **ui-kit changes are source-level + require a rebuild** (`pnpm --filter @ultranos/ui-kit build`); app `src/components/ui/*` are thin re-export proxies only. Most of this work is app-level composition, not ui-kit edits.
- **No autonomous commits/staging.** **Parallel file-mutating agents each need their own worktree.** **Verify before claiming** — every "done/fixed/passing" needs a run or an on-screen observation behind it.

---

### One-line summary
Every non-auth **list page**: full-width root → standalone `<h1>` → **one toolbar row** (pill tabs · **wide `SearchInput` with its trailing circular magnifier button** · filters · **folded primary action**) → **one content box** (`rounded-xl bg-card shadow-card ring`) wrapping loading / centered-empty / table-with-`bg-muted`-header → pagination below. Detail/form pages get the box idiom (equal cards, `w-fit` back button, boxed forms). Dashboards get uniform stat cards. **Then render every page in a browser and confirm it — don't claim it.**
