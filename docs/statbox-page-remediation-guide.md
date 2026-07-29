# Stat-Box (Dashboard) Page Remediation Guide

**For the next agent.** This is the authoritative playbook for remediating **pages that have stat boxes** (KPI/metric cards, streaks, progress, achievement tiles) — i.e. **dashboards**, as opposed to list/table/form pages (those follow `docs/opd-list-page-remediation-guide.md`). The reference implementation is the **Lab-Lite Quality dashboard**: `http://localhost:3002/quality` → `apps/lab-lite/src/components/quality/QualityDashboard.tsx`. Read the live file; if this guide ever disagrees with it, the file wins (but see "Known nits" at the end — don't copy those verbatim).

> Companion to root `CLAUDE.md` → **Content Area Layout** (the full-width shell rules and the no-stat-box page standard). A page is a "dashboard" for this guide if its primary content is **grids of cards showing numbers/metrics/badges**, with little or no tabular list.

---

## 0. What the Quality dashboard looks like

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Quality Dashboard                                          (BreadcrumbHeader)│
├───────────────────────────────────────────────────────────────────────────┤
│  Your Quality Streaks                              (h2, section heading)     │
│  ┌───────────────────────────┐  ┌───────────────────────────┐              │
│  │ 🔥 QC Passing Days         │  │ 🛡 Zero Rejection Days     │  ← LARGE KPI  │
│  │  0  days                   │  │  91 days                   │    (2-up)     │
│  │  Your best: 0 days         │  │  Your best: 91 days        │              │
│  └───────────────────────────┘  └───────────────────────────┘              │
│                                                                             │
│  This Month's Quality Metrics                      (h2)                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                                │
│  │Hb CV%  │ │TAT     │ │Reject %│ │Training│       ← COMPACT METRIC (4-up)   │
│  │ 0 % —  │ │ 0 min —│ │ 0 % —  │ │ 0 % —  │         (value + unit + trend)  │
│  └────────┘ └────────┘ └────────┘ └────────┘                                │
│                                                                             │
│  Training Progress                                 (h2)                      │
│  ┌───────────────────────────────────────────────────────────────┐  0 / 0  │
│  │ Modules completed this quarter        [▓▓▓▓░░░░░░░░░░░░░░░░]      │        │  ← PROGRESS
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  Your Achievements                                 (h2)                      │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                                                │
│  │ 🔥 │ │ ⭐ │ │ 🏆 │ │ 🎖 │   ← ACHIEVEMENT TILES (4-up), earned = solid,   │
│  │name│ │name│ │name│ │name│     unearned = dimmed (opacity-50, muted bg)    │
│  └────┘ └────┘ └────┘ └────┘                                                │
└───────────────────────────────────────────────────────────────────────────┘
```

Four card archetypes: **Large KPI**, **Compact metric** (with trend), **Progress**, **Achievement tile**. Each lives in a labelled `<section>` with a responsive grid.

---

## 1. Page shell (identical to every other page)

The app shell renders the sticky `BreadcrumbHeader` (`h-14`) and `<main id="main-content" className="flex flex-1 flex-col gap-4 p-4">`. So the dashboard root is exactly:

```tsx
<div className="flex flex-col gap-4" dir="auto">
  {/* sections */}
</div>
```

**Full-width, always.** Never `mx-auto`, `max-w-*`, nested `<main>`, `p-6`/`px-6` wrappers, or inline `style={{ maxWidth, margin:'0 auto' }}`. Unlike list pages, dashboards usually have **no `<h1>` and no toolbar** — the section `<h2>`s title the content. (If a dashboard needs a page title, use a standalone `<h1 className="text-2xl font-semibold text-foreground">` and keep it action-free.)

---

## 2. Section wrapper (repeat per group of cards)

Every group of cards is its own labelled section with an `<h2>` heading and a grid:

```tsx
<section aria-labelledby="streaks-heading">
  <h2 id="streaks-heading" className="text-lg font-semibold mb-4 text-foreground">
    {t('streaks.heading')}
  </h2>
  <div className="grid …gap-4">{/* cards */}</div>
</section>
```

- Heading: `text-lg font-semibold text-foreground` + `mb-4` (the one place `mb-*` is allowed — it's inside a section, not a direct child of the page root; sections are separated by the root's `gap-4`).
- Sections are the **direct children** of the page root → spaced by `gap-4`. Do **not** add `mt-*`/`mb-*` between sections.
- Heading text comes from an i18n key. `aria-labelledby` ties the section to its heading for a11y.

---

## 3. The four stat-box archetypes (copy these class strings)

All cards share the **card idiom**: `rounded-xl` + `bg-card` + a subtle surface. Reference uses `border border-border … shadow-sm`; the **canonical app surface** is `shadow-card ring-[0.65px] ring-border/50` (matches the list-page content box). Pick one and use it for **every** card on the page — see §4.

### 3a. Large KPI card (streaks / headline numbers) — 2-up grid

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col gap-3">
    {/* label + icon */}
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </div>
    {/* value + unit */}
    <div className="flex items-baseline gap-2">
      <span className="text-5xl font-bold tabular-nums text-foreground" aria-label={`${value} days`}>{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
    {/* sublabel — always reserve this line so heights match */}
    <p className="text-xs text-muted-foreground">{t('longestStreak')}: <strong>{best}</strong> {unit}</p>
  </div>
  {/* …second card, identical shape */}
</div>
```
- Padding `p-6`, value `text-5xl font-bold tabular-nums`, icon `size={16}` beside a `text-sm font-medium text-muted-foreground` label.
- `tabular-nums` keeps digits aligned as values change.

### 3b. Compact metric card (with trend arrow) — 4-up grid

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
  <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col gap-2">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex items-center gap-2">
      <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
      <TrendIndicator trend={trend} lowerIsBetter={lowerIsBetter} />
    </div>
  </div>
</div>
```
- Padding `p-4`, value `text-3xl font-bold tabular-nums`, label `text-xs font-medium text-muted-foreground`.
- **Trend arrow** = `TrendingUp` / `TrendingDown` / `Minus` at `size={14}`. Colour by meaning with **semantic tokens**: improving → `text-success`, declining → `text-destructive`, stable → `text-muted-foreground`. For lower-is-better metrics (TAT, rejection rate) flip which direction counts as "improving".

### 3c. Progress card (bar) — full-width single card

```tsx
<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold">{done} / {total}</span>
  </div>
  <div className="w-full bg-muted rounded-full h-2" role="progressbar" aria-valuenow={done} aria-valuemax={total}>
    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: total > 0 ? `${Math.min(done/total*100,100)}%` : '0%' }} />
  </div>
</div>
```
- Track `bg-muted rounded-full h-2`; fill `bg-primary h-2 rounded-full`. `role="progressbar"` + `aria-valuenow/aria-valuemax`.

### 3d. Achievement / badge tile — responsive grid, earned vs locked

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
  <div className={`rounded-xl border p-4 flex flex-col items-center gap-2 text-center transition-opacity ${
    earned ? 'border-border bg-card shadow-sm' : 'border-border/50 bg-muted/30 opacity-50'
  }`}>
    <BadgeIcon icon={badge.icon} />           {/* icon size={22} */}
    <p className="text-xs font-semibold text-foreground leading-tight">{badge.name}</p>
    {earned
      ? <p className="text-xs text-muted-foreground">{t('earned')} {earnedAt.slice(0,10)}</p>
      : <p className="text-xs text-muted-foreground italic">{t('keepWorking')}</p>}
  </div>
</div>
```
- **Earned** = `border-border bg-card shadow-sm` (solid). **Locked** = `border-border/50 bg-muted/30 opacity-50` (dimmed) — this is the correct way to show "not yet earned": dim it, don't recolour it.
- Centered content (`items-center text-center`), icon `size={22}`, name `text-xs font-semibold leading-tight`.

---

## 4. Uniformity rules (this is what pages get wrong)

Stat cards in a row **must be visually uniform** (a real past bug: one card was green-tinted and larger than its siblings).

- **Same surface on every card of the page**: same radius (`rounded-xl`), same `bg-card`, same border/shadow treatment. Don't mix `shadow-sm` on some and `shadow-card ring-…` on others. (Reference uses `border border-border … shadow-sm`; the canonical app surface is `shadow-card ring-[0.65px] ring-border/50` — either is fine, but be consistent within a page and, ideally, across the app.)
- **Same value size within a group**: all Large-KPI values `text-5xl`; all Compact-metric values `text-3xl`. Never one bigger than its neighbours.
- **Grid stretches items to equal height.** Reserve optional lines (sublabel, trend) — render a placeholder (`'—'` / `' '`) when empty so all cards in a row are the same height before and after data loads.
- **Convey danger/status with a ring or a semantic token, not a different background.** For a KPI in an alert state: add `ring-2 ring-destructive/50` to the same white `bg-card` card — do **not** switch it to a red-tinted background that makes it look bigger/different. Neutral KPI cards stay uniform white/`bg-card`.
- **Status-semantic cards MAY keep a colored tint** when the color *is* the information (e.g. a RED/AMBER/GREEN readiness board, or paired=green / unmatched=amber / critical=red). Use semantic tokens (`success`/`warning`/`destructive`), not raw palette hex, and keep sizes uniform.
- **Clickable KPI cards** (drill-down): render the card as a `<button type="button">` with `text-start` and `transition-colors hover:bg-muted/40`; keep the same card idiom. Example canonical clickable stat card:
  ```tsx
  <button type="button" onClick={…}
    className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50 transition-colors hover:bg-muted/40">
    <p className="text-sm font-medium text-muted-foreground">{label}</p>
    <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value ?? '—'}</p>
    <p className="mt-1 text-sm font-medium text-muted-foreground">{sublabel}</p> {/* reserve even when empty */}
  </button>
  ```

---

## 5. Responsive grid cheat-sheet

| Card type | Grid classes | Rationale |
|---|---|---|
| Large KPI (headline) | `grid grid-cols-1 sm:grid-cols-2 gap-4` | 1-up on phones, 2-up on tablet+ |
| Compact metric | `grid grid-cols-2 sm:grid-cols-4 gap-4` | 2-up on phones, 4-up on tablet+ |
| Achievement tile | `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3` | scales 2→3→4 |
| Progress / single wide | no grid — full-width single card | |

- Card grids use `gap-4` (tiles `gap-3`). Never `gap-5/6/8`.
- Always start at a mobile column count and step up with `sm:`/`md:` — offline-first field devices are often small/tablet.

---

## 6. Pitfalls (do NOT repeat)

1. **Non-uniform cards** — one card larger, green-tinted, or a different radius than its row-mates. Make them identical; convey state with a ring, not size/background.
2. **Non-semantic trend/status colours** — `text-green-600`/`text-red-600`/`bg-amber-50` for trends or reset messages. Use `text-success`/`text-destructive`/`text-warning` and `bg-warning/10` etc. (See "Known nits".)
3. **Not full-width** — any `mx-auto`/`max-w-*`/inline `maxWidth` on the page root or a section. Dashboards are full-width like every other page.
4. **Missing empty/loading uniformity** — cards jumping height when data loads because an optional line wasn't reserved. Reserve it.
5. **Ad-hoc empty states** — when a whole section has no data, use the ui-kit `EmptyState` (or a boxed centered message), not a bare `<p>` (the metrics section's `<p>{t('noData')}</p>` fallback is acceptable inline text, but a whole-section empty should use `EmptyState`).
6. **`p-6`/`px-6` on the root or double-padding** — the shell already provides `p-4`.
7. **Radius drift** — `rounded-2xl`/`rounded-3xl`/`rounded-lg` on cards. Cards are `rounded-xl`; only the progress bar/track is `rounded-full`.
8. **Icons** from `@ultranos/ui-kit/icons` (subpath import) only; medical icons never mirror in RTL, navigation icons do (`DirectionalIcon`).

---

## 7. i18n & a11y

- Section headings, labels, units, and sublabels all come from i18n keys (namespaces like `quality`, `quality.metrics`, `quality.badges`). Add new keys to **all four locales** (en/ar/prs/ps) with CRLF preserved; machine-translate non-en and flag in `messages/TRANSLATION_REVIEW.md` (see the list-page guide §7).
- Big numbers get an `aria-label` with the unit (`aria-label={`${value} days`}`). Progress bars get `role="progressbar"` + `aria-valuenow/max`. Sections use `aria-labelledby` pointing at their `<h2>`. Use `tabular-nums` on all numeric values.
- RTL: logical properties only (`ms-*`/`me-*`, `text-start/end`); `dir="auto"` on the root.

---

## 8. Known nits in the reference (fix when you touch it; don't copy verbatim)

The Quality dashboard is the structural gold standard, but two color details are **not** semantic and should be corrected wherever you apply this pattern:
- `TrendIndicator` uses `text-green-600 dark:text-green-400` / `text-red-600 dark:text-red-400` → should be `text-success` / `text-destructive`.
- `StreakCard` reset message uses `bg-amber-50 dark:bg-amber-950 border-amber-200 … text-amber-800` → should be the warning tokens (`bg-warning/10 text-warning`, or the app's `<Alert variant="warning">`).
- Card surface uses `border border-border … shadow-sm`; for cross-app consistency with the list-page content box, prefer `bg-card shadow-card ring-[0.65px] ring-border/50`.

---

### One-line summary
Dashboard = full-width `flex flex-col gap-4` root → labelled `<section>`s (each `h2 text-lg font-semibold mb-4` + a responsive card grid) → **uniform** `rounded-xl bg-card` cards (Large-KPI `p-6`/`text-5xl`, Compact-metric `p-4`/`text-3xl`+trend, Progress bar, Achievement tiles earned-solid/locked-dimmed) → convey danger with a **ring or semantic token, never a different-sized/coloured background** → semantic trend/status colours, reserved lines for equal heights, i18n + a11y throughout.
