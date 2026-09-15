# Notification Presentation Enrichment — Design Spec

**Date:** 2026-09-15
**Status:** Draft for review
**Author:** Ultranos Dev (with Claude)
**Path classification:** Architectural (spans Hub DB + API + `ui-kit` + 3 spoke apps; adds new infra: toast system, detail modal, localizable content descriptor)

---

## 1. Problem & Context

The notification rows in OPD-Lite (and the equivalent panels in Pharmacy-Lite and Lab-Lite) are uninformative:

- The row **title** shows the notification *type label*, which for unmapped types (e.g. `ORDER_RECEIVED`) falls through to `typeDefault` = literally **"Notification"**.
- There is **no indication of which app** the notification came from.
- There is no **subject / notes / body** distinction — just a single type label and, sometimes, a `testCategory · labName` sub-line.
- The **timestamp** sits on its own line at the bottom of the row.
- Clicking a row acknowledges it and *sometimes* navigates via a deep link that is usually `null`, so **nothing visibly happens**; there is **no detail view**.
- The row icon for "system" types is a **gear** (`Settings`).
- **No toast** appears when a notification arrives — no toast library exists anywhere in the repo.

**Root data constraint (verified):** the `notifications` table stores only `type` + a small non-PHI `payload` (`testCategory`, `labName`, `orderId`, `message`, `diagnosticReportId`, `prescriptionId`, …). There is **no** `source_app`, `subject`, `body`, or `notes` field. All richer presentation must therefore be *added* to the record (backend enrichment — chosen approach) rather than guessed on the client.

**Verified current surfaces (all must change):**
- OPD-Lite: `apps/opd-lite/src/components/notifications/NotificationCenter.tsx` (full page) and `apps/opd-lite/src/components/NotificationPanel.tsx` (bell dropdown).
- Pharmacy-Lite: `apps/pharmacy-lite/src/components/notifications/NotificationBell.tsx` + `NotificationPanel.tsx`.
- Lab-Lite: `apps/lab-lite/src/components/notifications/NotificationBell.tsx` + `NotificationPanel.tsx` + `NotificationItem.tsx`.

## 2. Goals / Non-Goals

**Goals**
1. Each notification row shows: **source-app name** (title), **subject**, **one-line body**, **notes**, and **"time ago" in the top-right corner**.
2. Each row uses a **per-source-app icon** (Lab → flask, Pharmacy → pill, OPD → stethoscope, Admin → shield, System → bell).
3. Clicking a row opens a **detail modal** describing what happened, with any available deep-link action; acknowledges on open.
4. A **toast** fires for **every newly arrived notification**; clicking it opens the detail modal.
5. All of the above are **consistent across OPD-Lite, Pharmacy-Lite, and Lab-Lite**, implemented once in `@ultranos/ui-kit`.
6. Everything is **localized** (en/ar/prs/ps) and **RTL-correct**.
7. Presentation content is **strictly non-PHI** (Rule #1).

**Non-Goals**
- No change to notification *dispatch triggers* (who gets notified, when). We only enrich the stored content and the display. (The separate `SPECIMEN_COLLECTED` feature discussed earlier is **out of scope** here.)
- No change to the recipient-resolution fix already shipped.
- No push/native notifications, no email/SMS — in-app only.
- Patient-Lite-Mobile (React Native) is **out of scope** for this pass (web spokes only).

## 3. Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Content source | **Backend enrichment** — the record carries the content descriptor |
| App scope | **All 3 web spokes** (OPD, Pharmacy, Lab) |
| Row icon | **Per-source-app icon** |
| Toast trigger | **Every newly arrived notification** |
| i18n of stored content | **Localizable descriptor** (store i18n *keys* + non-PHI *params*, resolved per-locale on the client) — NOT frozen prose. Confirmed in design review. |

### 3.1 Why a localizable descriptor (not literal strings)

The apps run in 4 languages incl. RTL. Storing literal `subject`/`body` prose at dispatch time would freeze the language. So "backend enrichment" is implemented as: the row stores `source_app` + `subject_key` + `body_key` + `body_params` (+ optional `notes_key`). The client resolves keys→text in the recipient's locale. This keeps the record authoritative about *what* the notification says while preserving localization.

## 4. Data Model (Hub — `notifications` table)

### 4.1 Migration (via Supabase MCP `apply_migration`)

Add five nullable columns (nullable so in-flight dispatchers never break mid-rollout; client has a type-derived fallback for any null):

```sql
ALTER TABLE public.notifications
  ADD COLUMN source_app  text,   -- 'LAB_LITE'|'PHARMACY_LITE'|'OPD_LITE'|'ADMIN'|'SYSTEM'
  ADD COLUMN subject_key text,   -- i18n key, e.g. 'ORDER_RECEIVED'
  ADD COLUMN body_key    text,   -- i18n key, e.g. 'orderReceivedBody'
  ADD COLUMN body_params jsonb,  -- non-PHI interpolation params
  ADD COLUMN notes_key   text;   -- optional i18n key, nullable
```

A `CHECK (source_app IN (...))` constraint is **not** added (keeps forward-compat with new apps; the client defaults unknown values to the System/bell icon).

### 4.2 Backfill (same migration)

The 26 existing `ORDER_RECEIVED` rows (verified present) are backfilled so they render correctly immediately:

```sql
UPDATE public.notifications
SET source_app = 'LAB_LITE',
    subject_key = 'ORDER_RECEIVED',
    body_key = 'orderReceivedBody',
    body_params = jsonb_build_object('testCategory', payload->>'testCategory'),
    notes_key = 'orderReceivedNotes'
WHERE type = 'ORDER_RECEIVED' AND source_app IS NULL;
```

(Only `ORDER_RECEIVED` exists in the table today; the `WHERE type=...` pattern generalizes if others are present at migration time.)

### 4.3 TypeScript types

Regenerate Supabase types (`generate_typescript_types`) and extend the `NotificationItem` DTO in each app's notification client (`notification-api.ts` / `notification-client.ts`) with the new optional fields.

## 5. Backend (Hub API)

### 5.1 Central content helper

New module `apps/hub-api/src/lib/notification-content.ts`:

```ts
export type SourceApp = 'LAB_LITE' | 'PHARMACY_LITE' | 'OPD_LITE' | 'ADMIN' | 'SYSTEM'
export interface NotificationContent {
  sourceApp: SourceApp
  subjectKey: string
  bodyKey: string
  bodyParams: Record<string, string | number>
  notesKey: string | null
}
export function buildNotificationContent(
  type: string,
  payload: Record<string, unknown>,
): NotificationContent
```

- A `TYPE_CONTENT` table maps every dispatched type to `{ sourceApp, subjectKey, bodyKey, notesKey }`.
- `bodyParams` is extracted from the payload with an **allowlist of non-PHI keys** (`testCategory`, `labName`, `status`, counts, IDs used only for deep-linking). **Never** patient name, DOB, National ID, real patient UUID, diagnosis, or result values.
- Unknown type → safe default `{ sourceApp: 'SYSTEM', subjectKey: 'default', bodyKey: 'defaultBody', bodyParams: {}, notesKey: null }`.

**Complete type → content map (initial):**

| type | source_app | subject_key | notes | deep-link |
|---|---|---|---|---|
| `LAB_RESULT_AVAILABLE` | LAB_LITE | labResultAvailable | yes | diagnosticReport |
| `LAB_RESULT_ESCALATION` | LAB_LITE | labResultUrgent | yes (urgent) | diagnosticReport |
| `ORDER_RECEIVED` | LAB_LITE | orderReceived | yes | order status |
| `PRESCRIPTION_READY` | PHARMACY_LITE | prescriptionReady | — | — |
| `PRESCRIPTION_DISPENSED` | PHARMACY_LITE | prescriptionDispensed | — | prescription |
| `DISPENSE_REVIEW_RESOLVED` | PHARMACY_LITE | dispenseReviewResolved | — | review |
| `GUARDIAN_LINKED` | OPD_LITE | guardianLinked | — | — |
| `GUARDIAN_UNLINKED` | OPD_LITE | guardianUnlinked | — | — |
| `CONSENT_CHANGE` | OPD_LITE | consentChange | — | — |
| `ALLERGY_UPDATE` | OPD_LITE | allergyUpdate | yes | — |
| `SYNC_CONFLICT` | SYSTEM | syncConflict | — | /conflicts |
| `LICENSE_EXPIRED` | ADMIN | licenseExpired | yes | — |
| `LICENSE_EXPIRY_WARNING` | ADMIN | licenseExpiryWarning | yes | — |
| `PROVIDER_SUSPENDED` | ADMIN | providerSuspended | yes | — |
| `LAB_APPROVED` / `LAB_SUSPENDED` / `LAB_REACTIVATED` | ADMIN | lab{Approved,Suspended,Reactivated} | — | — |
| `KYC_APPROVED` / `KYC_REJECTED` | ADMIN | kyc{Approved,Rejected} | — | — |
| `OUTBREAK_MODE_ACTIVATED` / `OUTBREAK_MODE_DEACTIVATED` | ADMIN | outbreak{Activated,Deactivated} | — | — |
| _unknown_ | SYSTEM | default | — | — |

### 5.2 Wire all dispatchers through the helper

Every insert into `notifications` sets the new columns from `buildNotificationContent(type, payload)`:
- `apps/hub-api/src/trpc/routers/lab.ts` (`dispatchResultNotifications`, `acknowledgeOrder`)
- `apps/hub-api/src/trpc/routers/medication.ts` (`PRESCRIPTION_DISPENSED`)
- `apps/hub-api/src/trpc/routers/dispense-review.ts`
- `apps/hub-api/src/trpc/routers/guardian.ts`
- `apps/hub-api/src/trpc/routers/admin.ts` (lab status, KYC, provider suspend, outbreak)
- `apps/hub-api/src/jobs/license-expiry-check.ts`
- `apps/hub-api/src/services/notification-escalation.ts` (re-insert path)

### 5.3 Read API

`apps/hub-api/src/trpc/routers/notification.ts` `list` (and the bell feed) select and return `source_app, subject_key, body_key, body_params, notes_key`. The recipient-resolution `.in()` scoping already shipped stays as-is.

## 6. Shared Frontend (`@ultranos/ui-kit`)

Presentational + pure, **i18n-agnostic** (apps resolve keys→text and pass strings in). This is what makes it "build once."

### 6.1 Pure presentation module — `packages/ui-kit/src/notification-presentation.ts`
- `sourceAppIcon(sourceApp): LucideIcon` — `LAB_LITE→FlaskConical`, `PHARMACY_LITE→Pill`, `OPD_LITE→Stethoscope`, `ADMIN→Shield`, `SYSTEM`/unknown→`Bell`. All are **medical/system icons → do NOT mirror in RTL** (wrap with `DirectionalIcon category="medical"` where rendered).
- `sourceAppNameKey(sourceApp): string` — key into a `notifications.sourceApp.*` i18n group.
- `deriveSourceApp(type): SourceApp` — client-side fallback when `source_app` is null (mirrors the backend table) so pre-migration/edge rows still render sensibly.

### 6.2 Components (exported via `@ultranos/ui-kit/components/ui/*`)
- `NotificationRow` — props: `{ icon, appName, subject, body, notes, timeAgo, unread, urgent, onClick }`. Layout: icon (left) · content column (appName title, subject, body one-liner, notes) · **`timeAgo` pinned top-right** (`absolute`/flex `ms-auto` in a top row). Unread + urgent styling preserved from current rows.
- `NotificationDetailModal` — built on the existing `dialog` component. Props: `{ open, onOpenChange, icon, appName, subject, body, notes, exactTimestamp, action? }`. Shows full content + exact localized timestamp; optional primary action button (deep link). **Non-PHI only.**
- `AppToaster` + `notify()` — thin wrapper around **`sonner`** (new dependency in `ui-kit`). `AppToaster` mounts once per app; `notify({ icon, appName, subject, urgent, onClick })` shows a toast; click → `onClick` (opens modal / navigates).

### 6.3 Packaging
- Add `sonner` to `packages/ui-kit/package.json` deps.
- Export new paths in ui-kit `package.json` `exports` + barrel where appropriate.
- **Rebuild ui-kit** (`pnpm --filter @ultranos/ui-kit build`) and clear app `.next` caches (per CLAUDE.md).

## 7. Per-App Integration

Each app keeps its own **container** (data fetch, poll, i18n) and renders the shared components. Container responsibilities:

1. **Resolve content**: `subject = t(subjectKey)`, `body = t(bodyKey, bodyParams)`, `notes = notesKey ? t(notesKey) : undefined`, `appName = t(sourceAppNameKey(sourceApp ?? deriveSourceApp(type)))`.
2. **Icon**: `sourceAppIcon(sourceApp ?? deriveSourceApp(type))`.
3. **Timestamp**: existing `formatTimestamp` (relative) for the row; exact `formatDate` for the modal.
4. **Modal**: local `useState` for the open row; row `onClick` → acknowledge + open modal (replaces the current "acknowledge + maybe navigate" behavior; deep-link becomes the modal's action button).
5. **Toast (every new notification)**: on each poll, diff returned ids against a `seenIds` ref (seeded on first load so the initial backlog does **not** toast); for each genuinely new id, call `notify(...)`. Mount `<AppToaster/>` once in each app layout.

Touched files:
- OPD-Lite: `NotificationCenter.tsx`, `NotificationPanel.tsx`, `lib/use-notification-poll.ts` (expose new-id diffing), app layout (`AppToaster`), messages ×4.
- Pharmacy-Lite: `notifications/NotificationBell.tsx`, `NotificationPanel.tsx`, notification client + poll, layout, messages ×4.
- Lab-Lite: `notifications/NotificationBell.tsx`, `NotificationPanel.tsx`, `NotificationItem.tsx`, client + poll, layout, messages ×4.

The stale `notification-label.ts` type→label map is superseded by `subject_key`; keep a thin shim only if other callers depend on it, else remove.

## 8. i18n Keys

New `notifications` sub-keys added to **all 4 locales in all 3 apps** (12 message files):
- `sourceApp.LAB_LITE|PHARMACY_LITE|OPD_LITE|ADMIN|SYSTEM` (app display names — brand names, largely identical across locales but still translated for script).
- `subject.<key>` and `body.<key>` (+ `{param}` placeholders) and `notes.<key>` for every row in the §5.1 table.
- Toast + modal chrome (`toast.newNotification`, `modal.close`, `modal.viewDetails`, etc.).

Translations for ar/prs/ps: provide accurate translations (not English placeholders) consistent with existing catalog quality; flag any that need native review in `TRANSLATION_REVIEW.md`.

## 9. Data Flow

```
dispatcher → buildNotificationContent(type,payload) → INSERT notifications(+source_app,subject_key,body_key,body_params,notes_key)
   → client poll (30s) → notification.list returns descriptor
   → container resolves keys→localized text + icon
   → new ids diffed → notify() toast (click → modal)
   → NotificationRow renders (appName / subject / body / notes / timeAgo top-right)
   → row click → acknowledge + NotificationDetailModal
```

## 10. Error Handling / Offline / A11y / RTL

- **Offline-first:** unchanged — poll failures are swallowed; rows render from cached data; null descriptors fall back to `deriveSourceApp(type)` + `subject_key ?? type`.
- **PHI safety:** `bodyParams` allowlist enforced in the helper; a dispatcher-content test asserts no PHI-shaped keys leak.
- **A11y:** row is a button (existing pattern); modal uses ShadCN dialog focus trap; toast is polite `aria-live` (sonner default). Icons have `aria-hidden` + text label.
- **RTL:** logical properties only; timestamp uses `ms-auto`/inset-inline; source-app/medical icons do **not** mirror.

## 11. Testing

- **Backend:** `buildNotificationContent` table-driven unit tests (type→content); **PHI-absence** test over all mapped types + representative payloads; per-dispatcher test asserting the new columns are written; migration backfill verified (query the 26 rows post-migration).
- **ui-kit:** `notification-presentation` (icon + source-app mapping incl. unknown→Bell); `NotificationRow` layout test (timestamp top-right, correct icon, unread/urgent); `NotificationDetailModal` render.
- **Per-app:** row click → acknowledge + modal open; toast fires only for **new** ids (not initial backlog); RTL snapshots for row + modal in en + ar.
- All new code via **TDD** (write failing test first) per project rules.

## 12. Rollout & Backward Compatibility

1. Migration (columns nullable + backfill) — safe, additive.
2. Backend helper + dispatcher wiring + API fields.
3. ui-kit components + `sonner`; rebuild ui-kit.
4. Per-app integration, app by app (OPD → Pharmacy → Lab).

Null-tolerant client fallback means each step is independently deployable; old rows and any un-migrated dispatcher still render via `deriveSourceApp`.

## 13. Risks / Open Questions

- **sonner dependency** in ui-kit — new third-party dep; small, ShadCN-standard. Acceptable.
- **Toast noise:** "every new notification" can be chatty for high-volume recipients; the `seenIds` seed prevents backlog floods, but a future cap/grouping may be wanted (out of scope now).
- **notification-escalation re-insert** copies the original payload; must also set descriptor via the helper so escalations aren't blank.
- **Admin app** (`apps/admin-portal`) also consumes some ADMIN-targeted types but is **not** in the requested 3-spoke scope — its notification UI (if any) is unchanged this pass; the backend enrichment still benefits it later.

## 14. Out of Scope
- New notification triggers (incl. `SPECIMEN_COLLECTED`).
- Patient-Lite-Mobile and Admin-Portal notification UIs.
- Push/email/SMS delivery, toast grouping/rate-limiting, notification preferences.
