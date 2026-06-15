# Content Area Standardization — Design Spec

**Date:** 2026-06-05
**Status:** Approved
**Scope:** App shell (3 files) + ~49 page files across all 4 spoke apps

---

## Problem

Two layers of layout inconsistency exist across the four apps:

**Layer 1 — App Shell:** Header heights are split between `h-12` (admin-portal, lab-lite) and `h-14` (opd-lite, pharmacy-lite). Admin-portal's `<main>` is missing `id="main-content"`.

**Layer 2 — Page content:** Pages add their own `mt-6`/`mt-4` margins, `px-6 pb-6` wrappers, non-standard gap values (`gap-5`, `gap-6`, `gap-8`), and duplicate border-b header bars — all on top of the shell's existing `p-4 gap-4`, creating inconsistent spacing throughout the apps.

---

## Decision

Standardize both layers across all four apps using the ShadCN sidebar-07 dashboard template as the reference. No new components are introduced — this is purely a consistency sweep of existing markup.

---

## Governing Rules

These five rules define "done" for every file touched:

| Rule | Standard |
|------|----------|
| Header height | `h-14` on all `BreadcrumbHeader` / `PageHeader` components |
| Shell `<main>` | `flex flex-1 flex-col gap-4 p-4` + `id="main-content"` on all 4 apps |
| Page root div | `flex flex-col gap-4` — no `mt-*`, no extra `px-*`/`py-*`/`p-*` |
| Inner grids/stacks | `gap-4` only (not gap-5/6/8); `space-y-4` (not space-y-6) |
| `max-w-*` constraints | Preserved — kept on the page root div, not a nested wrapper |

Custom border-b header bars rendered inside page content (not the shell's BreadcrumbHeader) are removed. The BreadcrumbHeader is the only sticky header in every app.

---

## File Scope

### Layer 1 — App Shell (3 files)

| File | Change |
|------|--------|
| `apps/admin-portal/src/components/BreadcrumbHeader.tsx` | `h-12` → `h-14` |
| `apps/admin-portal/src/components/AuthGuard.tsx` | Add `id="main-content"` to `<main>` |
| `apps/lab-lite/src/components/PageHeader.tsx` | `h-12` → `h-14` |

### Layer 2 — Admin Portal (~20 pages)

| File | Issues | Fix |
|------|--------|-----|
| `src/app/[locale]/dashboard/page.tsx` | 3× `mt-6` | Remove all `mt-6` |
| `src/app/[locale]/alerts/page.tsx` | `mt-6`, `mt-4` | Remove |
| `src/app/[locale]/alerts/[alertId]/page.tsx` | 6× `mt-*`, `gap-6` | Remove `mt-*`, `gap-6` → `gap-4` |
| `src/app/[locale]/ai-models/page.tsx` | root `gap-6` | `gap-6` → `gap-4` |
| `src/app/[locale]/audit/page.tsx` | 5× `mt-*` | Remove |
| `src/app/[locale]/inventory/page.tsx` | `mt-6`, `space-y-6` | Remove `mt-6`, `space-y-6` → `space-y-4` |
| `src/app/[locale]/certifications/page.tsx` | `mt-6`, `mt-4` | Remove |
| `src/app/[locale]/labs/[labId]/page.tsx` | `mt-6`, `gap-6` | Remove `mt-*`, `gap-6` → `gap-4` |
| `src/app/[locale]/labs/[labId]/staff/page.tsx` | `mt-6` | Remove |
| `src/app/[locale]/network/page.tsx` | `mt-4`, `mt-8 pt-6` | Remove `mt-*`; keep `border-t` |
| `src/app/[locale]/patients/page.tsx` | `mt-4` | Remove |
| `src/app/[locale]/patients/[patientId]/page.tsx` | `mt-6`, `gap-6` | Remove `mt-*`, `gap-6` → `gap-4` |
| `src/app/[locale]/patients/merge/page.tsx` | 3× `mt-6`, `space-y-6` | Remove `mt-6`, `space-y-6` → `space-y-4` |
| `src/app/[locale]/providers/page.tsx` | `mt-4` | Remove |
| `src/app/[locale]/subscriptions/page.tsx` | `mt-6` | Remove |
| `src/app/[locale]/subscriptions/billing/page.tsx` | `mt-6` | Remove |
| `src/app/[locale]/subscriptions/invoices/page.tsx` | `mt-6`, `mt-4` | Remove |
| `src/app/[locale]/mentorship/page.tsx` | `mt-6`, `mt-4` | Remove |
| `src/app/[locale]/settings/page.tsx` | root `gap-8` | `gap-8` → `gap-4` |

### Layer 2 — OPD Lite (~8 pages)

| File | Issues | Fix |
|------|--------|-----|
| `src/app/[locale]/(app)/appointments/page.tsx` | `px-6 pb-4`, `px-6 pb-6` | Remove padding wrappers |
| `src/app/[locale]/(app)/conflicts/page.tsx` | `px-6 pb-6` | Remove padding wrapper |
| `src/app/[locale]/(app)/duplicate-review/page.tsx` | `px-6 pb-6` | Remove padding wrapper |
| `src/app/[locale]/(app)/expiring-consents/page.tsx` | `px-6 pb-6` | Remove padding wrapper |
| `src/app/[locale]/(app)/kyc/page.tsx` | `px-6 pb-6` | Remove padding (keep `max-w-2xl`) |
| `src/app/[locale]/(app)/notifications/page.tsx` | `px-6 pb-6` | Remove padding wrapper |
| `src/app/[locale]/(app)/register-patient/page.tsx` | `px-6 pb-6` | Remove padding (keep `max-w-3xl`) |
| `src/app/[locale]/(app)/settings/page.tsx` | `px-6 pb-6` | Remove padding (keep `max-w-2xl`) |

### Layer 2 — Pharmacy Lite (~2 pages)

| File | Issues | Fix |
|------|--------|-----|
| `src/app/[locale]/(app)/settings/data-budget/page.tsx` | `mx-auto max-w-3xl` on nested div | Move constraint to page root div |
| `src/app/[locale]/(app)/register-patient/page.tsx` | `mx-auto max-w-3xl` on nested div | Move constraint to page root div |

### Layer 2 — Lab Lite (~17 pages)

| File | Issues | Fix |
|------|--------|-----|
| `src/app/[locale]/(app)/achievements/page.tsx` | custom `border-b` header bar + `px-6 py-4` | Remove custom header bar entirely |
| `src/app/[locale]/(app)/portfolio/page.tsx` | custom `border-b` header bar + `px-6 py-4` | Remove custom header bar entirely |
| `src/app/[locale]/(app)/page.tsx` | root `gap-5` | `gap-5` → `gap-4` |
| `src/app/[locale]/(app)/history/page.tsx` | 2× `gap-6` | `gap-6` → `gap-4` |
| `src/app/[locale]/(app)/orders/page.tsx` | root `gap-5` | `gap-5` → `gap-4` |
| `src/app/[locale]/(app)/sendouts/page.tsx` | `gap-6` | `gap-6` → `gap-4` |
| `src/app/[locale]/(app)/planner/page.tsx` | `gap-6` | `gap-6` → `gap-4` (keep `max-w-5xl`) |
| `src/app/[locale]/(app)/network/page.tsx` | `gap-6` | `gap-6` → `gap-4` |
| `src/app/[locale]/(app)/certification/page.tsx` | `px-4 py-6`, `space-y-6` | Remove `px-4 py-6`, `space-y-6` → `space-y-4` |
| `src/app/[locale]/(app)/competency/page.tsx` | `px-4 py-6`, `space-y-6` | Remove `px-4 py-6`, `space-y-6` → `space-y-4` |
| `src/app/[locale]/(app)/mentorship/page.tsx` | root `p-6` | Remove `p-6` |
| `src/app/[locale]/(app)/notifications/page.tsx` | `mx-auto max-w-3xl` on nested div | Move to root div |
| `src/app/[locale]/(app)/escalations/page.tsx` | `mx-auto max-w-3xl` on nested div | Move to root div |
| `src/app/[locale]/(app)/queue/page.tsx` | `mx-auto max-w-3xl` on nested div | Move to root div |
| `src/app/[locale]/(app)/consent/page.tsx` | `mx-auto max-w-2xl` on nested div | Move to root div |
| `src/app/[locale]/(app)/patients/register/page.tsx` | `mx-auto max-w-lg` on nested div | Move to root div |
| `src/app/[locale]/(app)/settings/data-budget/page.tsx` | `mx-auto max-w-3xl` on nested div | Move to root div |

---

## What Is NOT Changing

- The `<main>` className (`flex flex-1 flex-col gap-4 p-4`) — no changes to the shell padding itself
- `max-w-*` constraint values — preserved, just repositioned to the page root div
- `border-t` dividers used as visual separators inside page content — kept, only the `mt-*` before them is removed
- `gap-4` on inner grids (e.g. `grid grid-cols-2 gap-4`) — already correct, untouched
- Table row empty states (`<td colSpan>`) — already excluded from component scope
- Lab-lite's `PageHeader` component name — cosmetic rename out of scope

---

## Testing

No snapshot tests are expected to change as a result of this work — these are spacing class removals, not structural DOM changes. Verify by visual inspection in the browser after each app's changes:

1. Open each modified page and confirm content is flush with the shell's `p-4` — no visible double-padding
2. Confirm all 4 app headers are the same height
3. Confirm sections within pages flow with consistent vertical rhythm (no jumpy spacing between sections)
4. Confirm form pages (`register-patient`, `kyc`, `settings`) still have their max-width constraint applied correctly

---

## Out of Scope

- Adding a `PageHeader` component (title + description + action) — no current requirement
- Renaming `lab-lite/PageHeader.tsx` to `BreadcrumbHeader.tsx` — cosmetic only
- Standardizing card internal padding (`p-5` vs `p-6` inside cards) — addressed separately
- Any page not listed in the scope tables above
