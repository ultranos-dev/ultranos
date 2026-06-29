# Org-level Calendar Preference — Phase 1 (Display + Propagation)

Date: 2026-06-26
Status: Approved design — pending implementation plan

## Goal

Let an organization admin choose the calendar system used to **display** dates,
and have that choice apply across every app the org is subscribed to
(admin-portal, opd-lite, pharmacy-lite, lab-lite). All dates remain **stored** as
Gregorian/ISO; only rendering changes.

This is **Phase 1**. Calendar-aware date **input** (typing dates in a non-Gregorian
calendar with conversion back to Gregorian) is **Phase 2** — deferred to its own
spec, because `Intl` can format but not parse non-Gregorian dates, so input needs
a conversion layer and calendar-aware pickers that build on this foundation.

## Calendar set

Display-only, rendered via the standard `Intl.DateTimeFormat` `calendar` option:

| Label (admin UI)              | Stored value         | Region/use |
|-------------------------------|----------------------|------------|
| Gregorian (default)           | `gregory`            | International |
| Solar Hijri (Jalali)          | `persian`            | Afghanistan, Iran |
| Islamic — Umm al-Qura         | `islamic-umalqura`   | Saudi Arabia / Gulf official |
| Islamic — Civil (tabular)     | `islamic-civil`      | Algorithmic Hijri |
| Coptic                        | `coptic`             | Egypt |

`default_calendar` is constrained to exactly these five values.

## Non-goals (Phase 1)

- No calendar-aware date **entry**/pickers/parsing (Phase 2).
- No **per-user** override — the setting is strictly org-wide (additive later).
- No change to **stored** timestamps — storage stays Gregorian/ISO everywhere.
- Calendar is independent of **language/locale** (locale still controls
  digits/RTL/field order; calendar controls the calendar system).

## Data model

Add to `organizations`:

```
default_calendar text NOT NULL DEFAULT 'gregory'
  CHECK (default_calendar IN ('gregory','persian','islamic-umalqura','islamic-civil','coptic'))
```

Migration via Supabase MCP `apply_migration`. Backfill is implicit (default).

## Hub API

1. **`admin.updateOrganization`** — extend its input/update to accept
   `defaultCalendar` (validated against the enum). Admin-only (`adminProcedure`),
   audited via the existing `ORGANIZATION_UPDATED` audit path.
2. **`organization.getSettings`** — NEW `protectedProcedure` query (any
   authenticated role, scoped to `ctx.user.orgId`) returning non-sensitive org
   settings: `{ defaultCalendar, timezone }`. This is what the spoke apps call;
   `admin.getOrganization` stays admin-only and is not reused for spokes.
   - Router placement: a small `organization` router (or an existing
     non-admin-gated router) — decided during planning.

## Admin-portal UI

- In the settings page's existing **"organization"** section, add a **calendar
  picker** (ShadCN `select` from ui-kit) listing the five options, bound to the
  org's current `defaultCalendar`, saved through `admin.updateOrganization`.
- Follows the existing org-settings save/feedback pattern (same as name/timezone).

## Propagation to all apps

- Each app, after auth, calls `organization.getSettings` once on load.
- The returned `defaultCalendar` is:
  - cached in `localStorage` (a calendar preference is **not** PHI — explicitly
    allowed, unlike PHI which must never touch localStorage), and
  - applied via `setCalendarPreference(cal)` (see ui-kit below).
- **Offline:** fall back to the cached `localStorage` value; if none, `gregory`.
- **Change propagation:** an admin's change is picked up on each app's next load
  / next `getSettings` fetch. (No live push in Phase 1.)
- **Why not a JWT claim:** an org-level value embedded per-user would require
  re-stamping every user's token on change; a small cached query is a single
  source of truth with no duplication.

## ui-kit formatters (leverage point)

`packages/ui-kit/src/utils/format.ts`:

- A module-level calendar preference: `setCalendarPreference(cal)` /
  `getCalendarPreference()` (default `gregory`).
- `formatDate` / `formatDateTime` / `formatDateShort` / `formatTime` gain an
  optional trailing `calendar?` argument. Resolution order:
  **explicit arg → module preference → `gregory`**.
- The existing DD/MM/YYYY ordering + per-locale numerals (the `en-GB-u-nu-*`
  base) is retained; only the `calendar` option changes, so a non-Gregorian
  calendar renders in DD/MM/YYYY **field order** with that calendar's values and
  the locale's digits (e.g. Jalali year in Persian digits).
- Because every date render in the apps already routes through these helpers
  (after the recent sweep), setting the preference once flips all output — **no
  per-call-site changes**.

Each app sets the preference at startup from the fetched/cached org calendar
(e.g. in the existing auth/sync provider init).

## Testing

- **ui-kit:** each calendar renders correctly (persian→Jalali year, islamic→Hijri
  month/year, coptic), `gregory` unchanged; preference setter/getter resolution
  order; explicit-arg override.
- **Hub:** `organization.getSettings` returns the caller's org calendar;
  `updateOrganization` validates the enum and rejects invalid values; audit emitted.
- **Admin-portal:** picker renders the five options, reflects the saved value, and
  triggers the update mutation.
- **Spoke (opd-lite as reference):** on load, the preference is set from the
  cached/fetched value; a directory date renders in the chosen calendar.

## Rollout

- ui-kit + Hub + admin-portal + opd-lite wired end-to-end as the reference.
- pharmacy-lite, lab-lite, admin-portal each get the same ~3-line startup init
  (fetch settings → cache → `setCalendarPreference`).

## Open items (resolve during planning)

- Exact router/file for `organization.getSettings`.
- Exact startup hook in each app where `setCalendarPreference` is called.
- Whether `formatDateShort`/`formatTime` need the same locale hardening done for
  `formatDate`/`formatDateTime` (they currently use the `prs→fa` mapping).
