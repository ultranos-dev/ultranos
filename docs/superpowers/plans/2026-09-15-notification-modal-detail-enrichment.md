# Notification Modal Detail Enrichment + Admin-Portal Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the notification detail modal rich (order/reference ID, test/lab/status, date+time received, and an authorized patient line where permitted) across OPD-Lite, Pharmacy-Lite, Lab-Lite, and a new Admin-Portal notification surface — without ever putting PHI into the notification record.

**Architecture:** Extend the shared ui-kit `NotificationDetailModal` with a labelled `details[]` list + an optional async `patient` line. Each app builds non-PHI detail rows from the notification descriptor and, where the recipient is authorized, resolves the patient on-demand (OPD: local encrypted Dexie; Pharmacy: prescription scope) with a PHI_READ audit. Admin-Portal gets a from-scratch notification surface on the shared components.

**Tech Stack:** Next.js 15, TypeScript, next-intl (en/ar/prs/ps), `@ultranos/ui-kit`, Dexie (OPD local DB), tRPC to Hub, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-notification-modal-detail-enrichment-design.md`

## Global Constraints

- **PHI (Rule #1):** never add patient fields to the notification record/DTO/payload. Patient identity appears ONLY via an on-demand, authorized, **audited** (Rule #6, PHI_READ) lookup at modal-open time. Fail soft (show nothing / localized "unavailable offline") if not resolvable.
- **Data-minimization (Rule #7):** Lab-Lite notifications have no patient — do NOT add a patient lookup there. Never expose raw patient UUID or National ID anywhere new.
- **ui-kit is i18n/data-agnostic:** components receive already-localized strings; no next-intl, no hardcoded user-facing English, semantic tokens only, logical CSS props (RTL-safe), medical/source icons don't mirror.
- **ui-kit build:** after editing `packages/ui-kit/src/`, run `pnpm --filter @ultranos/ui-kit build`.
- **i18n:** add new keys to ALL 4 locales of each touched app; real ar/prs/ps, uncertain flagged in that app's `messages/TRANSLATION_REVIEW.md`.
- **TDD:** failing test first, watch it fail, then implement.
- **Commits:** scoped `git add <paths>` only (never `-A`); controller commits per task with user-authorized per-task commits (this SDD run). Do not sweep unrelated concurrent work.
- **Imports:** ui-kit via subpaths (`@ultranos/ui-kit/components/ui/...`, `@ultranos/ui-kit/notification-presentation`).

## File Structure
- ui-kit: `components/ui/notification-detail-modal.tsx` (enrich), a date-time formatter (co-locate with existing `formatDate`), tests.
- OPD-Lite: `hooks/useNotificationPatient.ts` (new), `components/notifications/NotificationCenter.tsx` + `components/NotificationPanel.tsx` (build details + patient + wire), messages ×4, tests.
- Pharmacy-Lite: `components/notifications/NotificationPanel.tsx` (details + patient), a patient resolver, messages ×4, tests.
- Lab-Lite: `components/notifications/NotificationPanel.tsx` (non-PHI details), messages ×4, tests.
- Admin-Portal: `lib/notification-client.ts`, `lib/use-notification-poll.ts`, `components/notifications/{NotificationBell,NotificationPanel}.tsx`, `components/NotificationToaster.tsx`, shell mount, messages ×4, tests.

---

## Task 1: ui-kit — enrich NotificationDetailModal + date-time formatter

**Files:**
- Modify: `packages/ui-kit/src/components/ui/notification-detail-modal.tsx`
- Modify: the module that exports `formatDate` (find via `grep -rn "export function formatDate\|export const formatDate" packages/ui-kit/src`) — add `formatDateTime`.
- Test: `packages/ui-kit/src/__tests__/notification-detail-modal.test.tsx` (extend), `packages/ui-kit/src/__tests__/notification-rtl.test.tsx` (extend with details)

**Interfaces:**
- Produces:
  ```ts
  export interface NotificationDetailField { label: string; value: string; emphasis?: boolean }
  // NotificationDetailModalProps gains: details?: NotificationDetailField[]; patient?: {label,value}|null; patientLoading?: boolean
  export function formatDateTime(date: Date, locale: string): string
  ```

- [ ] **Step 1: Failing test** — extend the modal test: render with `details=[{label:'Order ID',value:'5A4741'},{label:'Received',value:'15 Sep 2026, 06:45'}]`, `patient={label:'Patient',value:'Ahmad K.'}` and assert all render; render with `patientLoading` and assert a loading placeholder shows; render with no details/patient and assert it still renders subject. Add a `formatDateTime` test asserting output contains a time component for a known instant+locale.
- [ ] **Step 2: Run → fail** `pnpm --filter @ultranos/ui-kit test -- --run notification-detail-modal`
- [ ] **Step 3: Implement** — add `formatDateTime` next to `formatDate` (locale-aware date+short-time; RTL-safe). In the modal, after the body/patient, render `details` as a `<dl>`: each row `<div class="flex justify-between gap-4"><dt class="text-muted-foreground">{label}</dt><dd class={emphasis?'text-destructive':'text-foreground'}>{value}</dd></div>` (logical props only). Render the `patient` line prominently near the top (below subject) when provided; when `patientLoading`, render a muted "…" placeholder. Keep the `sr-only` DialogDescription fallback.
- [ ] **Step 4: Run → pass**; extend the RTL test to include `details` and assert logical layout; run `pnpm --filter @ultranos/ui-kit test`; `pnpm --filter @ultranos/ui-kit build`.
- [ ] **Step 5: Commit** (scoped)

---

## Task 2: OPD-Lite — authorized local patient lookup + rich details

**Files:**
- Create: `apps/opd-lite/src/hooks/useNotificationPatient.ts`
- Test: `apps/opd-lite/src/__tests__/use-notification-patient.test.ts`
- Modify: `apps/opd-lite/src/components/notifications/NotificationCenter.tsx`, `apps/opd-lite/src/components/NotificationPanel.tsx`
- Modify: `apps/opd-lite/messages/{en,ar,prs,ps}.json`
- Test: extend `apps/opd-lite/src/__tests__/notification-center.test.tsx`

**Interfaces:**
- Consumes: modal `details`/`patient`/`patientLoading` (Task 1); local Dexie `db` (`serviceRequests`, `diagnosticReports`, `medicationRequests`, `patients`); `auditPhiAccess`, `AuditAction`, `AuditResourceType` from `@/lib/audit` (see existing use in NotificationCenter.tsx).
- Produces: `useNotificationPatient(n: NotificationItem): { name: string | null; loading: boolean }`

- [ ] **Step 1: Failing test** — seed a fake Dexie/mock `db` with a serviceRequest `{id:'o1', subject:{reference:'Patient/p1'}}` and patient `p1` with a display name; assert `useNotificationPatient({type:'ORDER_RECEIVED', payload:{orderId:'o1'}})` resolves `name` to that patient's display name and emits a PHI_READ audit; assert it returns `null` (no throw) when the order/patient is absent. Repeat one case for `LAB_RESULT_AVAILABLE` (diagnosticReportId) and `PRESCRIPTION_DISPENSED` (prescriptionId).
- [ ] **Step 2: Run → fail** `pnpm -F opd-lite test -- --run use-notification-patient`
- [ ] **Step 3: Implement** the hook: switch on `n.type` to pick the source ref (orderId→serviceRequests, diagnosticReportId→diagnosticReports, prescriptionId→medicationRequests), resolve `subject.reference` → `patients.get(id)`, derive the display name from the patient's existing name helper/fields (find how patient names are rendered elsewhere in OPD, e.g. a `patientDisplayName` util or `_ultranos.nameLatin`), emit `auditPhiAccess(PHI_READ, <resourceType>, refId, patientId, {phiAccess:'notification_modal'})` once. Fail soft to `null`.
- [ ] **Step 4:** Wire into `NotificationCenter.tsx` + `NotificationPanel.tsx`: when the modal is open for a notification, call the hook and pass `patient`/`patientLoading`; build `details` (Order/Reference ID full + `slice(-6).toUpperCase()`, Test/Category, Lab, Status, Received via `formatDateTime(new Date(receivedTs), locale)` where `receivedTs = payload.acknowledgedAt ?? createdAt`). Add i18n field-label keys (`notifications.field.*`) to all 4 locales.
- [ ] **Step 5: Run → pass** `pnpm -F opd-lite test -- --run notification`; `pnpm -F opd-lite typecheck` (no new errors in touched files).
- [ ] **Step 6: Commit** (scoped)

---

## Task 3: Pharmacy-Lite — details + audited patient for dispense-review

**Files:** `apps/pharmacy-lite/src/components/notifications/NotificationPanel.tsx`, a patient resolver (local store or existing endpoint — discover), `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`, tests.

- [ ] **Step 1: Failing test** — modal for `DISPENSE_REVIEW_RESOLVED` shows Review ID + Prescription (short) + Status + Received date-time; patient line resolves within scope (mock the resolver) and is audited; fails soft when unavailable.
- [ ] **Step 2: Run → fail** `pnpm -F pharmacy-lite test -- --run notification`
- [ ] **Step 3: Implement** details + patient resolver (reuse pharmacy's existing prescription→patient path; audit the read). Add i18n field labels ×4.
- [ ] **Step 4: Run → pass**; `pnpm -F pharmacy-lite typecheck`.
- [ ] **Step 5: Commit** (scoped)

---

## Task 4: Lab-Lite — non-PHI detail rows

**Files:** `apps/lab-lite/src/components/notifications/NotificationPanel.tsx`, `apps/lab-lite/messages/{en,ar,prs,ps}.json`, tests.

- [ ] **Step 1: Failing test** — modal for `LAB_APPROVED` / `OUTBREAK_MODE_ACTIVATED` shows non-PHI details (Lab name / Pathogen / Reason-Status / Effective date-time). No patient line.
- [ ] **Step 2: Run → fail** `pnpm -F lab-lite test -- --run notification`
- [ ] **Step 3: Implement** `details` from the descriptor's `bodyParams`; Received via `formatDateTime`. i18n field labels ×4.
- [ ] **Step 4: Run → pass**; `pnpm -F lab-lite typecheck` (pre-existing errors in decay-notifier/delegate-notification/surge-inventory are NOT yours).
- [ ] **Step 5: Commit** (scoped)

---

## Task 5: Admin-Portal — new notification surface

**Files (create unless noted):**
- `apps/admin-portal/src/lib/notification-client.ts` (tRPC `notification.list`/`unreadCount`/`acknowledge`, using admin's existing auth-token/tRPC pattern — READ an existing admin API client first to match auth)
- `apps/admin-portal/src/lib/use-notification-poll.ts` (seeded seenIds + newNotifications; mirror pharmacy-lite's)
- `apps/admin-portal/src/components/notifications/NotificationBell.tsx`, `NotificationPanel.tsx` (shared `NotificationRow` + `NotificationDetailModal`)
- `apps/admin-portal/src/components/NotificationToaster.tsx`
- Modify: admin shell/header to mount the bell + toaster (find the header/AuthGuard layout)
- `apps/admin-portal/messages/{en,ar,prs,ps}.json` (full `notifications.*` set: sourceApp/subject/body/notes/viewDetails/unread + `field.*`)
- Tests: `apps/admin-portal/src/__tests__/notification-*.test.tsx`

**Interfaces:** consumes ui-kit shared components + `sourceAppIcon`/`sourceAppNameKey`/`deriveSourceApp`; descriptor fields from `notification.list`.

- [ ] **Step 1: Failing test** — a panel test mocking the client to return an admin descriptor (e.g. `KYC_APPROVED` / `LAB_APPROVED`) asserts the resolved source-app name renders and clicking a row opens the modal with non-PHI details (Practitioner/Lab ref, Submission ID, Action/Status, Received). Toaster test: only new-after-seed notifications toast.
- [ ] **Step 2: Run → fail** `pnpm -F admin-portal test -- --run notification`
- [ ] **Step 3: Implement** the client (match admin auth), poll hook, bell, panel (shared row/modal + resolver identical to the spokes), toaster; mount in the admin shell. Non-PHI `details` for admin types. i18n ×4.
- [ ] **Step 4: Run → pass** `pnpm -F admin-portal test -- --run notification`; `pnpm -F admin-portal typecheck` (no new errors in touched files).
- [ ] **Step 5: Commit** (scoped)

> If the admin auth/tRPC wiring proves large, split into 5a (client + poll) and 5b (bell + panel + toaster + modal + i18n + mount).

---

## Task 6: Cross-app verification

- [ ] **Step 1:** RTL snapshot for the modal WITH details + patient (extend ui-kit `notification-rtl.test.tsx`) — run.
- [ ] **Step 2:** Regression: `pnpm -F opd-lite test -- --run notification`, pharmacy, lab, admin-portal notification suites; ui-kit full; record results vs known pre-existing failures.
- [ ] **Step 3:** PHI guard test/grep: assert no notification DTO/record carries patient fields; patient only via the audited hook path.
- [ ] **Step 4: Commit** (scoped)

---

## Self-Review
- Spec §4 modal → Task 1; §5.1 OPD → Task 2; §5.2 Pharmacy → Task 3; §5.3 Lab → Task 4; §5.4 Admin → Task 5; §6 i18n → per-task Step with field labels; §7 testing → per-task + Task 6. Covered.
- Types: `NotificationDetailField`, `details`/`patient`/`patientLoading` (Task 1) consumed identically by Tasks 2-5; `formatDateTime(date, locale)` used by all; `useNotificationPatient` returns `{name,loading}`.
- PHI: patient only via audited on-demand lookup; Lab/Admin have none; Task 6 Step 3 guards no PHI in the record.
