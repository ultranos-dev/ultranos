# Notification Presentation Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every notification row across OPD-Lite, Pharmacy-Lite, and Lab-Lite show its source app, subject, one-line body, notes, and a top-right timestamp; open a detail modal on click; use a per-source-app icon; and pop a toast for every newly arrived notification.

**Architecture:** The Hub stores a *localizable content descriptor* on each notification (`source_app`, `subject_key`, `body_key`, `body_params`, `notes_key`) built by one central helper that all dispatchers route through. Shared presentational components + a pure presentation module live in `@ultranos/ui-kit` (i18n-agnostic — apps resolve keys→text and pass strings in). Each app keeps its own data/poll container and mounts a `sonner` toaster.

**Tech Stack:** Node/Fastify + tRPC + PostgreSQL (Supabase MCP for all DB ops), Next.js 15 PWA, TypeScript, Tailwind + ShadCN via `@ultranos/ui-kit`, next-intl (en/ar/prs/ps), `sonner` (new), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-notification-presentation-enrichment-design.md`

## Global Constraints

- **PHI safety (Rule #1):** notification content is strictly non-PHI. `body_params` uses an allowlist of non-PHI payload keys (`testCategory`, `labName`, `status`, counts, deep-link IDs). NEVER patient name/DOB/National ID, real patient UUID, diagnosis, or result values.
- **DB ops:** all schema/data changes go through Supabase MCP tools (`apply_migration`, `execute_sql`, `generate_typescript_types`) — never raw psql/migration files.
- **ui-kit changes:** edit source in `packages/ui-kit/src/`, then `pnpm --filter @ultranos/ui-kit build`; clear app `.next` caches if stale. App `src/components/ui/*` are re-export proxies only.
- **Icons:** import from `@ultranos/ui-kit/icons`; medical/system icons (flask, pill, stethoscope, shield, bell) do NOT mirror in RTL (`DirectionalIcon category="medical"`).
- **Layout:** follow the OPD list-page standard; timestamp pinned top-right of the row; no `mx-auto`/`max-w-*` on page roots.
- **i18n:** add keys to ALL 4 locales in EACH touched app; provide real ar/prs/ps translations, flagging uncertain ones in that app's `messages/TRANSLATION_REVIEW.md`.
- **TDD:** every task writes the failing test first and watches it fail before implementing.
- **Commits (project policy overrides "frequent commits"):** do NOT `git add`/`commit` autonomously. Each task's final "Commit" step is prepared but the executor MUST pause and get explicit user approval before running it.
- **Recipient scoping:** the shipped `.in(recipientRefs)` fix in `notification.ts` stays untouched.

---

## File Structure

**Hub API**
- Create `apps/hub-api/src/lib/notification-content.ts` — `buildNotificationContent(type, payload)` + `TYPE_CONTENT` table + non-PHI param allowlist.
- Create `apps/hub-api/src/__tests__/notification-content.test.ts`.
- Modify dispatchers: `trpc/routers/lab.ts`, `trpc/routers/medication.ts`, `trpc/routers/dispense-review.ts`, `trpc/routers/guardian.ts`, `trpc/routers/admin.ts`, `jobs/license-expiry-check.ts`, `services/notification-escalation.ts`.
- Modify `trpc/routers/notification.ts` (`list`) to select/return new fields.

**ui-kit**
- Create `packages/ui-kit/src/notification-presentation.ts` (pure: icon + source-app mapping + `deriveSourceApp`).
- Create `packages/ui-kit/src/components/ui/notification-row.tsx`.
- Create `packages/ui-kit/src/components/ui/notification-detail-modal.tsx`.
- Create `packages/ui-kit/src/components/ui/app-toaster.tsx` (sonner wrapper + `notify`).
- Modify `packages/ui-kit/package.json` (add `sonner`, add exports), `packages/ui-kit/src/index.ts` (barrel).
- Tests under `packages/ui-kit/src/__tests__/`.

**Apps (×3: opd-lite, pharmacy-lite, lab-lite)**
- Modify notification client DTO (`lib/notification-api.ts` / `lib/notification-client.ts`).
- Modify poll hooks to expose new-id diffing.
- Rewire panels/rows to shared components + modal + toaster mount in layout.
- Add i18n keys to `messages/{en,ar,prs,ps}.json`.

---

## Task 1: DB migration — descriptor columns + backfill

**Files:**
- Migration via Supabase MCP `apply_migration` (name: `notifications_presentation_descriptor`).
- Verify via `execute_sql`.

**Interfaces:**
- Produces: `notifications.source_app`, `.subject_key`, `.body_key`, `.body_params` (jsonb), `.notes_key` (all nullable).

- [ ] **Step 1: Inspect current columns**

Run `mcp__plugin_supabase_supabase__list_tables` (schema `public`, verbose) and confirm `notifications` lacks the five columns.

- [ ] **Step 2: Apply migration**

`apply_migration` with:

```sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_app  text,
  ADD COLUMN IF NOT EXISTS subject_key text,
  ADD COLUMN IF NOT EXISTS body_key    text,
  ADD COLUMN IF NOT EXISTS body_params jsonb,
  ADD COLUMN IF NOT EXISTS notes_key   text;

UPDATE public.notifications
SET source_app = 'LAB_LITE',
    subject_key = 'ORDER_RECEIVED',
    body_key = 'orderReceivedBody',
    body_params = jsonb_build_object('testCategory', COALESCE(payload->>'testCategory','')),
    notes_key = 'orderReceivedNotes'
WHERE type = 'ORDER_RECEIVED' AND source_app IS NULL;
```

- [ ] **Step 3: Verify backfill**

`execute_sql`:
```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE source_app='LAB_LITE') AS backfilled
FROM notifications WHERE type='ORDER_RECEIVED';
```
Expected: `total == backfilled` (26 at time of writing).

- [ ] **Step 4: Regenerate types**

Run `mcp__plugin_supabase_supabase__generate_typescript_types`; update the shared DB types file if the repo checks one in (search for the generated types path).

- [ ] **Step 5: Commit** (pause for approval)

```bash
git add -A
git commit -m "feat(hub): add localizable notification descriptor columns + backfill ORDER_RECEIVED"
```

---

## Task 2: `buildNotificationContent` helper (Hub)

**Files:**
- Create: `apps/hub-api/src/lib/notification-content.ts`
- Test: `apps/hub-api/src/__tests__/notification-content.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SourceApp = 'LAB_LITE'|'PHARMACY_LITE'|'OPD_LITE'|'ADMIN'|'SYSTEM'
  export interface NotificationContent {
    sourceApp: SourceApp; subjectKey: string; bodyKey: string;
    bodyParams: Record<string, string | number>; notesKey: string | null;
  }
  export function buildNotificationContent(type: string, payload: Record<string, unknown>): NotificationContent
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildNotificationContent } from '@/lib/notification-content'

const NON_PHI_ALLOWED = ['testCategory','labName','status','orderId','prescriptionId','diagnosticReportId','reviewId','count']

describe('buildNotificationContent', () => {
  it('maps ORDER_RECEIVED to Lab Lite with test category param', () => {
    const c = buildNotificationContent('ORDER_RECEIVED', { testCategory: 'Hemoglobin', orderId: 'o1' })
    expect(c.sourceApp).toBe('LAB_LITE')
    expect(c.subjectKey).toBe('ORDER_RECEIVED')
    expect(c.bodyKey).toBe('orderReceivedBody')
    expect(c.bodyParams.testCategory).toBe('Hemoglobin')
    expect(c.notesKey).toBe('orderReceivedNotes')
  })

  it('maps PRESCRIPTION_DISPENSED to Pharmacy Lite', () => {
    expect(buildNotificationContent('PRESCRIPTION_DISPENSED', {}).sourceApp).toBe('PHARMACY_LITE')
  })

  it('falls back to SYSTEM/default for unknown types', () => {
    const c = buildNotificationContent('TOTALLY_NEW_TYPE', {})
    expect(c.sourceApp).toBe('SYSTEM')
    expect(c.subjectKey).toBe('default')
  })

  it('never copies PHI-shaped payload keys into bodyParams', () => {
    const c = buildNotificationContent('LAB_RESULT_AVAILABLE', {
      testCategory: 'CBC', labName: 'Central',
      patientName: 'Jane Doe', diagnosis: 'X', resultValue: '12.3', nationalId: '123',
    })
    const keys = Object.keys(c.bodyParams)
    expect(keys).not.toContain('patientName')
    expect(keys).not.toContain('diagnosis')
    expect(keys).not.toContain('resultValue')
    expect(keys).not.toContain('nationalId')
    expect(keys.every(k => NON_PHI_ALLOWED.includes(k))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test -- --run notification-content`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
export type SourceApp = 'LAB_LITE' | 'PHARMACY_LITE' | 'OPD_LITE' | 'ADMIN' | 'SYSTEM'

export interface NotificationContent {
  sourceApp: SourceApp
  subjectKey: string
  bodyKey: string
  bodyParams: Record<string, string | number>
  notesKey: string | null
}

/** Non-PHI payload keys allowed into bodyParams. Extend only with non-PHI fields. */
const NON_PHI_PARAM_KEYS = [
  'testCategory', 'labName', 'status', 'orderId', 'prescriptionId',
  'diagnosticReportId', 'reviewId', 'count', 'pathogen',
] as const

interface Entry { sourceApp: SourceApp; subjectKey: string; bodyKey: string; notesKey: string | null }

const TYPE_CONTENT: Record<string, Entry> = {
  LAB_RESULT_AVAILABLE:     { sourceApp: 'LAB_LITE',      subjectKey: 'LAB_RESULT_AVAILABLE',   bodyKey: 'labResultBody',        notesKey: 'labResultNotes' },
  LAB_RESULT_ESCALATION:    { sourceApp: 'LAB_LITE',      subjectKey: 'LAB_RESULT_ESCALATION',  bodyKey: 'labResultBody',        notesKey: 'labResultUrgentNotes' },
  ORDER_RECEIVED:           { sourceApp: 'LAB_LITE',      subjectKey: 'ORDER_RECEIVED',         bodyKey: 'orderReceivedBody',    notesKey: 'orderReceivedNotes' },
  PRESCRIPTION_READY:       { sourceApp: 'PHARMACY_LITE', subjectKey: 'PRESCRIPTION_READY',     bodyKey: 'prescriptionReadyBody',notesKey: null },
  PRESCRIPTION_DISPENSED:   { sourceApp: 'PHARMACY_LITE', subjectKey: 'PRESCRIPTION_DISPENSED', bodyKey: 'prescriptionDispensedBody', notesKey: null },
  DISPENSE_REVIEW_RESOLVED: { sourceApp: 'PHARMACY_LITE', subjectKey: 'DISPENSE_REVIEW_RESOLVED', bodyKey: 'dispenseReviewBody', notesKey: null },
  GUARDIAN_LINKED:          { sourceApp: 'OPD_LITE',      subjectKey: 'GUARDIAN_LINKED',        bodyKey: 'guardianLinkedBody',   notesKey: null },
  GUARDIAN_UNLINKED:        { sourceApp: 'OPD_LITE',      subjectKey: 'GUARDIAN_UNLINKED',      bodyKey: 'guardianUnlinkedBody', notesKey: null },
  CONSENT_CHANGE:           { sourceApp: 'OPD_LITE',      subjectKey: 'CONSENT_CHANGE',         bodyKey: 'consentChangeBody',    notesKey: null },
  ALLERGY_UPDATE:           { sourceApp: 'OPD_LITE',      subjectKey: 'ALLERGY_UPDATE',         bodyKey: 'allergyUpdateBody',    notesKey: 'allergyUpdateNotes' },
  SYNC_CONFLICT:            { sourceApp: 'SYSTEM',        subjectKey: 'SYNC_CONFLICT',          bodyKey: 'syncConflictBody',     notesKey: null },
  LICENSE_EXPIRED:          { sourceApp: 'ADMIN',         subjectKey: 'LICENSE_EXPIRED',        bodyKey: 'licenseExpiredBody',   notesKey: 'licenseExpiredNotes' },
  LICENSE_EXPIRY_WARNING:   { sourceApp: 'ADMIN',         subjectKey: 'LICENSE_EXPIRY_WARNING', bodyKey: 'licenseExpiryWarningBody', notesKey: 'licenseExpiryWarningNotes' },
  PROVIDER_SUSPENDED:       { sourceApp: 'ADMIN',         subjectKey: 'PROVIDER_SUSPENDED',     bodyKey: 'providerSuspendedBody',notesKey: 'providerSuspendedNotes' },
  LAB_APPROVED:             { sourceApp: 'ADMIN',         subjectKey: 'LAB_APPROVED',           bodyKey: 'labStatusBody',        notesKey: null },
  LAB_SUSPENDED:            { sourceApp: 'ADMIN',         subjectKey: 'LAB_SUSPENDED',          bodyKey: 'labStatusBody',        notesKey: null },
  LAB_REACTIVATED:          { sourceApp: 'ADMIN',         subjectKey: 'LAB_REACTIVATED',        bodyKey: 'labStatusBody',        notesKey: null },
  KYC_APPROVED:             { sourceApp: 'ADMIN',         subjectKey: 'KYC_APPROVED',           bodyKey: 'kycStatusBody',        notesKey: null },
  KYC_REJECTED:             { sourceApp: 'ADMIN',         subjectKey: 'KYC_REJECTED',           bodyKey: 'kycStatusBody',        notesKey: 'kycRejectedNotes' },
  OUTBREAK_MODE_ACTIVATED:  { sourceApp: 'ADMIN',         subjectKey: 'OUTBREAK_MODE_ACTIVATED',   bodyKey: 'outbreakBody',     notesKey: null },
  OUTBREAK_MODE_DEACTIVATED:{ sourceApp: 'ADMIN',         subjectKey: 'OUTBREAK_MODE_DEACTIVATED', bodyKey: 'outbreakBody',     notesKey: null },
}

const DEFAULT_ENTRY: Entry = { sourceApp: 'SYSTEM', subjectKey: 'default', bodyKey: 'defaultBody', notesKey: null }

function extractNonPhiParams(payload: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const k of NON_PHI_PARAM_KEYS) {
    const v = payload[k]
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
  }
  return out
}

export function buildNotificationContent(
  type: string,
  payload: Record<string, unknown>,
): NotificationContent {
  const entry = TYPE_CONTENT[type] ?? DEFAULT_ENTRY
  return {
    sourceApp: entry.sourceApp,
    subjectKey: entry.subjectKey,
    bodyKey: entry.bodyKey,
    bodyParams: extractNonPhiParams(payload ?? {}),
    notesKey: entry.notesKey,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test -- --run notification-content` → PASS.

- [ ] **Step 5: Commit** (pause for approval)

```bash
git add apps/hub-api/src/lib/notification-content.ts apps/hub-api/src/__tests__/notification-content.test.ts
git commit -m "feat(hub): central non-PHI notification content descriptor builder"
```

---

## Task 3: Route all dispatchers through the helper

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (`dispatchResultNotifications` ~L57-88, `acknowledgeOrder` ~L2088-2093)
- Modify: `apps/hub-api/src/trpc/routers/medication.ts` (~L1171-1177)
- Modify: `apps/hub-api/src/trpc/routers/dispense-review.ts` (~L100-107)
- Modify: `apps/hub-api/src/trpc/routers/guardian.ts` (~L202-206, ~L289-294)
- Modify: `apps/hub-api/src/trpc/routers/admin.ts` (lab status ~L644-649, KYC ~L1243-1248, suspend ~L1638-1642, outbreak ~L6697-6705, ~L6791-6800)
- Modify: `apps/hub-api/src/jobs/license-expiry-check.ts` (~L154-160, ~L235-241)
- Modify: `apps/hub-api/src/services/notification-escalation.ts` (~L86-94, ~L118-126)
- Test: extend existing dispatcher tests (e.g. `lab-orders.test.ts`, `lab-submit-result.test.ts`, `guardian.test.ts`, `anomaly-admin.test.ts`) with descriptor assertions.

**Interfaces:**
- Consumes: `buildNotificationContent` (Task 2).

- [ ] **Step 1: Write the failing test** (example — `acknowledgeOrder`)

In `apps/hub-api/src/__tests__/lab-orders.test.ts`, add to the acknowledge flow's insert assertion:

```ts
expect(notifInsert).toHaveBeenCalledWith(expect.objectContaining({
  type: 'ORDER_RECEIVED',
  source_app: 'LAB_LITE',
  subject_key: 'ORDER_RECEIVED',
  body_key: 'orderReceivedBody',
  body_params: expect.objectContaining({ testCategory: expect.any(String) }),
}))
```

(Add an equivalent `source_app` assertion in one test per dispatcher: `PHARMACY_LITE` for dispense, `OPD_LITE` for guardian, `ADMIN` for admin/license.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F hub-api test -- --run lab-orders`
Expected: FAIL (insert lacks `source_app`).

- [ ] **Step 3: Implement — spread descriptor into each insert**

Pattern for `db.toRowRaw` inserts (adds camelCase keys; `toRowRaw` maps to snake):

```ts
const content = buildNotificationContent(type, payload)
notifications.push(db.toRowRaw({
  recipientRef, recipientRole, type,
  payload: JSON.stringify(payload),
  status: 'QUEUED', nextRetryAt,
  sourceApp: content.sourceApp,
  subjectKey: content.subjectKey,
  bodyKey: content.bodyKey,
  bodyParams: content.bodyParams,
  notesKey: content.notesKey,
}, 'non-PHI: notifications'))
```

Pattern for raw snake-case inserts (e.g. `acknowledgeOrder`, admin):

```ts
const content = buildNotificationContent('ORDER_RECEIVED', { orderId: input.orderId, testCategory: order.code_display ?? 'Lab Test' })
.insert({
  recipient_ref: order.requester_id, recipient_role: 'CLINICIAN', type: 'ORDER_RECEIVED',
  payload: JSON.stringify({ orderId: input.orderId, testCategory: order.code_display ?? 'Lab Test', acknowledgedAt: now }),
  status: 'QUEUED', next_retry_at: nextRetryAt,
  source_app: content.sourceApp, subject_key: content.subjectKey,
  body_key: content.bodyKey, body_params: content.bodyParams, notes_key: content.notesKey,
})
```

Apply the matching pattern to every dispatcher listed. For `notification-escalation.ts`, build content with the (copied) type + parsed payload so escalations carry a descriptor.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F hub-api test` (touched suites) → PASS.

- [ ] **Step 5: Commit** (pause for approval)

```bash
git add apps/hub-api/src
git commit -m "feat(hub): populate notification descriptor across all dispatchers"
```

---

## Task 4: Return descriptor from the read API

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/notification.ts` (`list` select ~L57-62 and the returned mapping ~L73-91)
- Test: `apps/hub-api/src/__tests__/notification.test.ts` (extend the list test)

**Interfaces:**
- Produces (per returned notification): `sourceApp`, `subjectKey`, `bodyKey`, `bodyParams`, `notesKey`.

- [ ] **Step 1: Write the failing test**

In `notification.test.ts` list test, seed `mockNotifications[0]` with `source_app:'LAB_LITE', subject_key:'ORDER_RECEIVED', body_key:'orderReceivedBody', body_params:{testCategory:'CBC'}, notes_key:'orderReceivedNotes'` and assert:

```ts
expect(result.notifications[0].sourceApp).toBe('LAB_LITE')
expect(result.notifications[0].subjectKey).toBe('ORDER_RECEIVED')
expect(result.notifications[0].bodyParams).toEqual({ testCategory: 'CBC' })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F hub-api test -- --run notification.test` → FAIL (fields undefined).

- [ ] **Step 3: Implement**

Add the columns to `.select('id, type, payload, status, created_at, delivered_at, acknowledged_at, source_app, subject_key, body_key, body_params, notes_key')` and to the returned object mapping:

```ts
sourceApp: n.source_app ?? null,
subjectKey: n.subject_key ?? null,
bodyKey: n.body_key ?? null,
bodyParams: n.body_params ?? {},
notesKey: n.notes_key ?? null,
```

- [ ] **Step 4: Run to verify it passes** → `pnpm -F hub-api test -- --run notification.test` PASS.

- [ ] **Step 5: Commit** (pause for approval)

```bash
git add apps/hub-api/src/trpc/routers/notification.ts apps/hub-api/src/__tests__/notification.test.ts
git commit -m "feat(hub): return notification descriptor from notification.list"
```

---

## Task 5: ui-kit pure presentation module

**Files:**
- Create: `packages/ui-kit/src/notification-presentation.ts`
- Test: `packages/ui-kit/src/__tests__/notification-presentation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SourceApp = 'LAB_LITE'|'PHARMACY_LITE'|'OPD_LITE'|'ADMIN'|'SYSTEM'
  export function sourceAppIcon(app: SourceApp | string | null | undefined): LucideIcon
  export function sourceAppNameKey(app: SourceApp | string | null | undefined): string
  export function deriveSourceApp(type: string): SourceApp
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { FlaskConical, Pill, Bell, Shield, Stethoscope } from '../icons'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '../notification-presentation'

describe('notification-presentation', () => {
  it('maps each source app to its icon', () => {
    expect(sourceAppIcon('LAB_LITE')).toBe(FlaskConical)
    expect(sourceAppIcon('PHARMACY_LITE')).toBe(Pill)
    expect(sourceAppIcon('OPD_LITE')).toBe(Stethoscope)
    expect(sourceAppIcon('ADMIN')).toBe(Shield)
    expect(sourceAppIcon('SYSTEM')).toBe(Bell)
  })
  it('defaults unknown/null source app to the bell icon', () => {
    expect(sourceAppIcon(null)).toBe(Bell)
    expect(sourceAppIcon('NEW_APP')).toBe(Bell)
  })
  it('derives source app from type when descriptor missing', () => {
    expect(deriveSourceApp('ORDER_RECEIVED')).toBe('LAB_LITE')
    expect(deriveSourceApp('PRESCRIPTION_DISPENSED')).toBe('PHARMACY_LITE')
    expect(deriveSourceApp('UNKNOWN')).toBe('SYSTEM')
  })
  it('builds the source-app i18n name key', () => {
    expect(sourceAppNameKey('LAB_LITE')).toBe('sourceApp.LAB_LITE')
    expect(sourceAppNameKey(null)).toBe('sourceApp.SYSTEM')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @ultranos/ui-kit test -- --run notification-presentation`
Expected: FAIL (module missing). (If ui-kit has no test runner, add Vitest config mirroring another package; confirm before implementing.)

- [ ] **Step 3: Implement**

```ts
import type { LucideIcon } from 'lucide-react'
import { FlaskConical, Pill, Stethoscope, Shield, Bell } from './icons'

export type SourceApp = 'LAB_LITE' | 'PHARMACY_LITE' | 'OPD_LITE' | 'ADMIN' | 'SYSTEM'

const ICONS: Record<SourceApp, LucideIcon> = {
  LAB_LITE: FlaskConical, PHARMACY_LITE: Pill, OPD_LITE: Stethoscope, ADMIN: Shield, SYSTEM: Bell,
}

const TYPE_TO_APP: Record<string, SourceApp> = {
  LAB_RESULT_AVAILABLE: 'LAB_LITE', LAB_RESULT_ESCALATION: 'LAB_LITE', ORDER_RECEIVED: 'LAB_LITE',
  PRESCRIPTION_READY: 'PHARMACY_LITE', PRESCRIPTION_DISPENSED: 'PHARMACY_LITE', DISPENSE_REVIEW_RESOLVED: 'PHARMACY_LITE',
  GUARDIAN_LINKED: 'OPD_LITE', GUARDIAN_UNLINKED: 'OPD_LITE', CONSENT_CHANGE: 'OPD_LITE', ALLERGY_UPDATE: 'OPD_LITE',
  SYNC_CONFLICT: 'SYSTEM',
  LICENSE_EXPIRED: 'ADMIN', LICENSE_EXPIRY_WARNING: 'ADMIN', PROVIDER_SUSPENDED: 'ADMIN',
  LAB_APPROVED: 'ADMIN', LAB_SUSPENDED: 'ADMIN', LAB_REACTIVATED: 'ADMIN',
  KYC_APPROVED: 'ADMIN', KYC_REJECTED: 'ADMIN',
  OUTBREAK_MODE_ACTIVATED: 'ADMIN', OUTBREAK_MODE_DEACTIVATED: 'ADMIN',
}

function normalize(app: SourceApp | string | null | undefined): SourceApp {
  return app && (app as string) in ICONS ? (app as SourceApp) : 'SYSTEM'
}
export function sourceAppIcon(app: SourceApp | string | null | undefined): LucideIcon {
  return ICONS[normalize(app)]
}
export function sourceAppNameKey(app: SourceApp | string | null | undefined): string {
  return `sourceApp.${normalize(app)}`
}
export function deriveSourceApp(type: string): SourceApp {
  return TYPE_TO_APP[type] ?? 'SYSTEM'
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit** (pause for approval)

```bash
git add packages/ui-kit/src/notification-presentation.ts packages/ui-kit/src/__tests__/notification-presentation.test.ts
git commit -m "feat(ui-kit): pure notification presentation mapping (icon/source-app)"
```

---

## Task 6: ui-kit `sonner` toaster wrapper

**Files:**
- Modify: `packages/ui-kit/package.json` (add `sonner` dep + export `./components/ui/app-toaster`)
- Create: `packages/ui-kit/src/components/ui/app-toaster.tsx`
- Test: `packages/ui-kit/src/__tests__/app-toaster.test.tsx` (smoke render)

**Interfaces:**
- Produces: `export function AppToaster(props): JSX.Element`; `export function notify(opts: { icon: LucideIcon; appName: string; subject: string; urgent?: boolean; onClick?: () => void }): void`.

- [ ] **Step 1: Add dependency**

`cd packages/ui-kit && pnpm add sonner` (confirm version pinned in package.json). Add to `exports`: `"./components/ui/app-toaster": "./dist/components/ui/app-toaster.js"` (mirror existing entry shape).

- [ ] **Step 2: Write failing smoke test**

```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AppToaster } from '../components/ui/app-toaster'

describe('AppToaster', () => {
  it('renders without crashing', () => {
    const { container } = render(<AppToaster />)
    expect(container).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 4: Implement**

```tsx
'use client'
import type { LucideIcon } from 'lucide-react'
import { Toaster, toast } from 'sonner'

export function AppToaster(props: React.ComponentProps<typeof Toaster>) {
  return <Toaster position="top-end" richColors closeButton {...props} />
}

export function notify(opts: {
  icon: LucideIcon; appName: string; subject: string; urgent?: boolean; onClick?: () => void
}) {
  const Icon = opts.icon
  const fn = opts.urgent ? toast.error : toast
  fn(opts.subject, {
    description: opts.appName,
    icon: <Icon className="h-4 w-4" aria-hidden />,
    onClick: opts.onClick,
  })
}
```

- [ ] **Step 5: Run to verify it passes** → PASS. Then `pnpm --filter @ultranos/ui-kit build`.

- [ ] **Step 6: Commit** (pause for approval)

```bash
git add packages/ui-kit/package.json packages/ui-kit/src/components/ui/app-toaster.tsx packages/ui-kit/src/__tests__/app-toaster.test.tsx pnpm-lock.yaml
git commit -m "feat(ui-kit): sonner-based AppToaster + notify() helper"
```

---

## Task 7: ui-kit `NotificationRow` component

**Files:**
- Create: `packages/ui-kit/src/components/ui/notification-row.tsx`
- Test: `packages/ui-kit/src/__tests__/notification-row.test.tsx`
- Modify: `packages/ui-kit/package.json` exports + `src/index.ts` barrel.

**Interfaces:**
- Produces:
  ```ts
  export interface NotificationRowProps {
    icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string;
    timeAgo: string; unread?: boolean; urgent?: boolean; onClick?: () => void
  }
  export function NotificationRow(p: NotificationRowProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FlaskConical } from '../icons'
import { NotificationRow } from '../components/ui/notification-row'

describe('NotificationRow', () => {
  it('shows app name as title, subject, body, notes and time in the top-right', () => {
    render(<NotificationRow icon={FlaskConical} appName="Lab Lite" subject="Lab order received"
      body="Hemoglobin · Central Lab" notes="Sample is being processed." timeAgo="2h ago" />)
    expect(screen.getByText('Lab Lite')).toBeInTheDocument()
    expect(screen.getByText('Lab order received')).toBeInTheDocument()
    expect(screen.getByText('Hemoglobin · Central Lab')).toBeInTheDocument()
    expect(screen.getByText('Sample is being processed.')).toBeInTheDocument()
    const time = screen.getByText('2h ago')
    expect(time).toHaveAttribute('data-slot', 'notification-time')
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement**

```tsx
'use client'
import type { LucideIcon } from 'lucide-react'
import { DirectionalIcon } from '..'

export interface NotificationRowProps {
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  timeAgo: string; unread?: boolean; urgent?: boolean; onClick?: () => void
}

export function NotificationRow({ icon: Icon, appName, subject, body, notes, timeAgo, unread, urgent, onClick }: NotificationRowProps) {
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
      className={`flex items-start gap-3 px-4 py-3 outline-none transition-colors cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${unread ? 'bg-primary/10' : ''} ${urgent ? 'ring-1 ring-inset ring-destructive/40' : ''}`}>
      <div className="mt-0.5 shrink-0">
        <DirectionalIcon category="medical"><Icon className={`h-5 w-5 ${urgent ? 'text-destructive' : 'text-primary'}`} aria-hidden /></DirectionalIcon>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`text-sm font-medium ${urgent ? 'text-destructive' : 'text-foreground'}`}>{appName}</p>
          {unread && <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          <span data-slot="notification-time" className="ms-auto shrink-0 text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="mt-0.5 text-sm text-foreground">{subject}</p>
        {body && <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>}
        {notes && <p className="mt-0.5 text-xs text-muted-foreground/80">{notes}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Add barrel/export + build**

Add to `src/index.ts` and package `exports` (`./components/ui/notification-row`). Run `pnpm --filter @ultranos/ui-kit build`.

- [ ] **Step 6: Commit** (pause for approval)

```bash
git add packages/ui-kit
git commit -m "feat(ui-kit): NotificationRow with source-app icon + top-right timestamp"
```

---

## Task 8: ui-kit `NotificationDetailModal` component

**Files:**
- Create: `packages/ui-kit/src/components/ui/notification-detail-modal.tsx`
- Test: `packages/ui-kit/src/__tests__/notification-detail-modal.test.tsx`
- Modify: package `exports` + `src/index.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface NotificationDetailModalProps {
    open: boolean; onOpenChange: (o: boolean) => void;
    icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string;
    exactTimestamp: string; action?: { label: string; onClick: () => void }
  }
  export function NotificationDetailModal(p: NotificationDetailModalProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FlaskConical } from '../icons'
import { NotificationDetailModal } from '../components/ui/notification-detail-modal'

describe('NotificationDetailModal', () => {
  it('renders content when open', () => {
    render(<NotificationDetailModal open onOpenChange={vi.fn()} icon={FlaskConical}
      appName="Lab Lite" subject="Lab order received" body="Hemoglobin · Central Lab"
      notes="Sample is being processed." exactTimestamp="15 Sep 2026, 06:45"
      action={{ label: 'View order', onClick: vi.fn() }} />)
    expect(screen.getByText('Lab order received')).toBeInTheDocument()
    expect(screen.getByText('15 Sep 2026, 06:45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View order' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement** (uses existing ui-kit `dialog`)

```tsx
'use client'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'
import { Button } from './button'

export interface NotificationDetailModalProps {
  open: boolean; onOpenChange: (o: boolean) => void
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  exactTimestamp: string; action?: { label: string; onClick: () => void }
}

export function NotificationDetailModal({ open, onOpenChange, icon: Icon, appName, subject, body, notes, exactTimestamp, action }: NotificationDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-xs font-medium text-muted-foreground">{appName}</span>
          </div>
          <DialogTitle>{subject}</DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        {notes && <p className="text-sm text-muted-foreground">{notes}</p>}
        <p className="text-xs text-muted-foreground">{exactTimestamp}</p>
        {action && (
          <DialogFooter>
            <Button onClick={action.onClick}>{action.label}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

(If `DialogDescription`/`DialogFooter` are not exported by the ui-kit dialog, use the exported subcomponents; confirm names in `dialog.tsx` first.)

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Export + build** → add barrel/exports, `pnpm --filter @ultranos/ui-kit build`.

- [ ] **Step 6: Commit** (pause for approval)

```bash
git add packages/ui-kit
git commit -m "feat(ui-kit): NotificationDetailModal"
```

---

## Task 9: OPD-Lite integration (center + bell + toast + modal + i18n)

**Files:**
- Modify: `apps/opd-lite/src/lib/notification-api.ts` (extend `NotificationItem`)
- Modify: `apps/opd-lite/src/lib/use-notification-poll.ts` (expose `newIds` since last poll)
- Modify: `apps/opd-lite/src/components/notifications/NotificationCenter.tsx`
- Modify: `apps/opd-lite/src/components/NotificationPanel.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/layout.tsx` (mount `<AppToaster/>` + toast-on-new effect)
- Modify: `apps/opd-lite/messages/{en,ar,prs,ps}.json`
- Test: `apps/opd-lite/src/__tests__/notification-center.test.tsx`, `notification-panel.test.tsx`

**Interfaces:**
- Consumes: `NotificationRow`, `NotificationDetailModal`, `AppToaster`, `notify`, `sourceAppIcon`, `sourceAppNameKey`, `deriveSourceApp` from ui-kit; descriptor fields from Task 4.

- [ ] **Step 1: Extend the DTO**

Add to `NotificationItem`: `sourceApp?: string | null; subjectKey?: string | null; bodyKey?: string | null; bodyParams?: Record<string, string | number>; notesKey?: string | null`.

- [ ] **Step 2: Write the failing test** (center row shows app name + top-right time + opens modal)

```tsx
// notification-center.test.tsx — with a mocked poll returning one ORDER_RECEIVED descriptor
it('renders source app as title and opens the detail modal on click', async () => {
  // ...render NotificationCenter with mocked useNotificationPoll returning:
  // { id:'n1', type:'ORDER_RECEIVED', sourceApp:'LAB_LITE', subjectKey:'ORDER_RECEIVED',
  //   bodyKey:'orderReceivedBody', bodyParams:{testCategory:'Hemoglobin'}, notesKey:'orderReceivedNotes',
  //   status:'SENT', createdAt: <2h ago> }
  expect(screen.getByText('Lab Lite')).toBeInTheDocument()
  await userEvent.click(screen.getByText('Lab Lite'))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run to verify it fails** → FAIL.

- [ ] **Step 4: Implement the row/modal rewire**

In `NotificationCenter.tsx`: replace `TypeIcon`/`notificationLabelKey` row body with the shared component. Add resolver + modal state:

```tsx
const tNotif = useTranslations('notifications')
const app = (n.sourceApp ?? deriveSourceApp(n.type))
const subject = t(`subject.${n.subjectKey ?? n.type}`)
const body = n.bodyKey ? t(`body.${n.bodyKey}`, n.bodyParams ?? {}) : undefined
const notes = n.notesKey ? t(`notes.${n.notesKey}`) : undefined
const appName = tNotif(sourceAppNameKey(app))
// row:
<NotificationRow icon={sourceAppIcon(app)} appName={appName} subject={subject} body={body}
  notes={notes} timeAgo={formatTimestamp(n.createdAt, locale)}
  unread={n.status !== 'ACKNOWLEDGED'} urgent={n.type === 'LAB_RESULT_ESCALATION'}
  onClick={() => { setOpenId(n.id); void handleNotificationClick(n) }} />
```

Add `<NotificationDetailModal open={openId===n.id} onOpenChange={o=>!o&&setOpenId(null)} ... action={deepLink ? { label: t('viewDetails'), onClick:()=>router.push(deepLink) } : undefined} />`. Repeat the resolver in `NotificationPanel.tsx` dropdown rows.

- [ ] **Step 5: Toast-on-new**

In `use-notification-poll.ts`, keep a `seenIdsRef` (seed on first successful load), and return `newNotifications` (present this poll, absent from `seenIds`). In app layout:

```tsx
useEffect(() => {
  for (const n of newNotifications) {
    const app = n.sourceApp ?? deriveSourceApp(n.type)
    notify({ icon: sourceAppIcon(app), appName: tNotif(sourceAppNameKey(app)),
      subject: t(`subject.${n.subjectKey ?? n.type}`), urgent: n.type === 'LAB_RESULT_ESCALATION',
      onClick: () => router.push('/notifications') })
  }
}, [newNotifications])
```
Mount `<AppToaster/>` once in the layout.

- [ ] **Step 6: i18n keys — add to all 4 locale files**

Under `notifications`: `sourceApp.{LAB_LITE,PHARMACY_LITE,OPD_LITE,ADMIN,SYSTEM}`, `subject.*`, `body.*` (with `{testCategory}`/`{labName}` placeholders), `notes.*`, `viewDetails`, `toast.*`. English values e.g. `subject.ORDER_RECEIVED: "Lab order received"`, `body.orderReceivedBody: "{testCategory}"`, `notes.orderReceivedNotes: "The lab has received the order and is processing the sample."`. Add ar/prs/ps translations; flag any uncertain in `TRANSLATION_REVIEW.md`.

- [ ] **Step 7: Run tests** → `pnpm -F opd-lite test -- --run notification` PASS. Clear `.next` if styles stale.

- [ ] **Step 8: Commit** (pause for approval)

```bash
git add apps/opd-lite
git commit -m "feat(opd-lite): enriched notification rows, detail modal, and toasts"
```

---

## Task 10: Pharmacy-Lite integration

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/notification-client.ts` (DTO), the poll hook, `components/notifications/NotificationBell.tsx`, `components/notifications/NotificationPanel.tsx`, app layout (AppToaster + toast effect), `messages/{en,ar,prs,ps}.json`
- Test: `apps/pharmacy-lite/src/__tests__/notification-client.test.ts` + a panel render test.

**Interfaces:**
- Consumes: same ui-kit exports + descriptor fields as Task 9.

- [ ] **Step 1: Write the failing test** — panel renders `Pharmacy Lite` title for a `PRESCRIPTION_DISPENSED` descriptor and opens modal on click (mirror Task 9 Step 2 with pharmacy fixture).
- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Extend DTO** (same fields as Task 9 Step 1).
- [ ] **Step 4: Rewire panel rows** to `NotificationRow` + `NotificationDetailModal` using the same resolver block as Task 9 Step 4.
- [ ] **Step 5: Toast-on-new** — same `seenIds` diff + `notify()` + `<AppToaster/>` in layout (Task 9 Step 5).
- [ ] **Step 6: i18n** — add the same `notifications.*` keys to all 4 pharmacy locale files (Task 9 Step 6 set).
- [ ] **Step 7: Run tests** → `pnpm -F pharmacy-lite test -- --run notification` PASS.
- [ ] **Step 8: Commit** (pause for approval)

```bash
git add apps/pharmacy-lite
git commit -m "feat(pharmacy-lite): enriched notification rows, detail modal, and toasts"
```

---

## Task 11: Lab-Lite integration

**Files:**
- Modify: `apps/lab-lite/src/lib/notifications-client.ts` (DTO), the poll hook, `components/notifications/NotificationBell.tsx`, `NotificationPanel.tsx`, `NotificationItem.tsx`, app layout (AppToaster + toast effect), `messages/{en,ar,prs,ps}.json`
- Test: `apps/lab-lite/src/__tests__/notifications.test.tsx` + client test.

**Interfaces:**
- Consumes: same ui-kit exports + descriptor fields as Task 9.

- [ ] **Step 1: Write the failing test** — `NotificationItem` renders `Lab Lite` title for a `LAB_RESULT_AVAILABLE` descriptor, time is top-right, click opens modal (mirror Task 9 Step 2 with lab fixture).
- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Extend DTO** (same fields).
- [ ] **Step 4: Rewire `NotificationItem.tsx`** to render `NotificationRow` + wire `NotificationDetailModal` in the panel, using the Task 9 resolver block.
- [ ] **Step 5: Toast-on-new** — same `seenIds` diff + `notify()` + `<AppToaster/>` in layout.
- [ ] **Step 6: i18n** — add the same `notifications.*` keys to all 4 lab locale files.
- [ ] **Step 7: Run tests** → `pnpm -F lab-lite test -- --run notification` PASS.
- [ ] **Step 8: Commit** (pause for approval)

```bash
git add apps/lab-lite
git commit -m "feat(lab-lite): enriched notification rows, detail modal, and toasts"
```

---

## Task 12: Cross-app verification & RTL snapshots

**Files:**
- Test: add RTL snapshot tests for `NotificationRow` + `NotificationDetailModal` (ui-kit or per-app, following existing RTL snapshot pattern).

- [ ] **Step 1: Write RTL snapshot tests** rendering row + modal under `dir="rtl"` (ar locale) and `dir="ltr"` (en); assert timestamp stays inline-end and icons are not mirrored.
- [ ] **Step 2: Run** → `pnpm -F opd-lite test -- --run rtl` (and ui-kit) PASS.
- [ ] **Step 3: Full regression** → `pnpm -F hub-api test`, `pnpm -F opd-lite test`, `pnpm -F pharmacy-lite test`, `pnpm -F lab-lite test`, `pnpm --filter @ultranos/ui-kit test`; `pnpm typecheck`. Record any pre-existing failures separately.
- [ ] **Step 4: Manual smoke (optional)** — run OPD-Lite, confirm the 26 backfilled `ORDER_RECEIVED` rows show "Lab Lite" + subject + time top-right, click opens modal, and a new notification pops a toast.
- [ ] **Step 5: Commit** (pause for approval)

```bash
git add -A
git commit -m "test: RTL snapshots + cross-app notification regression"
```

---

## Self-Review

- **Spec coverage:** §4 data model → Task 1; §5 backend helper/dispatchers/API → Tasks 2-4; §6 ui-kit (presentation/toaster/row/modal) → Tasks 5-8; §7 per-app integration → Tasks 9-11; §8 i18n → Tasks 9-11 Step 6; §10 RTL/a11y + §11 testing → Tasks 7-8, 12. All covered.
- **Placeholder scan:** concrete code/keys given for load-bearing tasks; repeated app-integration tasks (10, 11) explicitly reuse the Task 9 code blocks by reference to the same steps (identical wiring) — acceptable since the code is fully written once in Task 9 and the fixtures differ only by source app.
- **Type consistency:** `NotificationContent`/`SourceApp` (Task 2) align with ui-kit `SourceApp` (Task 5); descriptor field names (`source_app`/`sourceApp`, `subject_key`/`subjectKey`, etc.) consistent across DB (Task 1), API (Task 4), DTO + resolver (Tasks 9-11). `NotificationRowProps`/`NotificationDetailModalProps` match their consumers.
- **Open confirmation:** icon set + `sonner` absence + Dialog presence verified against source before planning.
