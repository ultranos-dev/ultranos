# Notification Modal Detail Enrichment + Admin-Portal Surface — Design Spec

**Date:** 2026-09-15
**Status:** Draft for review
**Path classification:** Architectural (shared ui-kit change + per-app authorized/audited PHI lookups + a from-scratch notification surface for Admin-Portal)
**Builds on:** `2026-09-15-notification-presentation-enrichment-design.md` (descriptor fields, shared row/modal/toaster already shipped)

---

## 1. Problem

The `NotificationDetailModal` is too sparse. Current state (an OPD-Lite modal for a Lab-sourced `ORDER_RECEIVED`):

```
Lab Lite
Lab order received
Hemoglobin
The lab has received the order and is processing the sample.
15/09/2026
```

Missing: the **patient** the order is for, the **lab order ID**, and the **time** (date only, no time-of-day). Users want the modal rich with all relevant detail, across every app.

## 2. Hard constraint — PHI (Rule #1 + Rule #7)

Notifications carry **zero PHI** by design (verified: the record holds only `orderId`, `testCategory`, `acknowledgedAt`, etc.). Patient name is **never** added to the notification record. Instead, where a recipient is authorized, the modal performs a **separate, on-demand, audited** patient lookup on open. Data-minimization is honored per app.

## 3. Recipient → data map (verified from dispatchers)

| App (recipient) | Notification types it receives | Patient present? | Lookup approach |
|---|---|---|---|
| **OPD-Lite** (doctor) | ORDER_RECEIVED, LAB_RESULT_AVAILABLE, LAB_RESULT_ESCALATION, PRESCRIPTION_DISPENSED, KYC_*, PROVIDER_SUSPENDED, CONSENT_CHANGE, ALLERGY_UPDATE, SYNC_CONFLICT | Yes (order/report/rx types) | **Local encrypted DB** (`serviceRequests`/`diagnosticReports`/`medicationRequests` → `patients`), offline, authorized; audited PHI read |
| **Pharmacy-Lite** (pharmacist) | DISPENSE_REVIEW_RESOLVED | Yes (via prescription) | Prescription → patient within pharmacy scope; audited |
| **Lab-Lite** (lab tech) | LAB_APPROVED/SUSPENDED/REACTIVATED, OUTBREAK_* | **No** (admin-sourced) | Non-PHI enrichment only |
| **Admin-Portal** (admin) | KYC_*, LAB_*, PROVIDER_SUSPENDED, OUTBREAK_* | **No** (practitioner/lab-oriented) | Non-PHI enrichment only; **surface built from scratch** |

## 4. Shared component change — `NotificationDetailModal` (ui-kit)

Extend props (stays i18n-agnostic; callers pass resolved strings):

```ts
export interface NotificationDetailField { label: string; value: string; emphasis?: boolean }
export interface NotificationDetailModalProps {
  open: boolean; onOpenChange: (o: boolean) => void
  icon: LucideIcon; appName: string; subject: string; body?: string; notes?: string
  details?: NotificationDetailField[]      // labelled rows (Order ID, Test, Lab, Status, Received…)
  patient?: { label: string; value: string } | null  // resolved, authorized, non-empty only when permitted
  patientLoading?: boolean                 // show a small "loading" placeholder while the async lookup runs
  exactTimestamp: string                   // now date + time
  action?: { label: string; onClick: () => void }
}
```

Render order: header (icon + appName) → subject (title) → body → **patient line (if provided / loading)** → **details definition-list** → notes → exactTimestamp → action. `details` renders as `<dl>` label/value rows using semantic tokens; `emphasis` (e.g. urgent) uses `text-destructive`. The `sr-only` description fallback stays for a11y.

**Timestamp helper:** add `formatDateTime(date, locale)` to ui-kit (date + short time, locale-aware, RTL-safe) if `formatDate` can't already produce time; callers pass the received/acknowledged time.

## 5. Per-app wiring

### 5.1 OPD-Lite (authorized local patient lookup)
- On modal open, a `useNotificationPatient(notification)` hook resolves the patient from local Dexie:
  - `ORDER_RECEIVED` → `serviceRequests.get(orderId)` → `subject` → `patients.get(id)`.
  - `LAB_RESULT_*` → `diagnosticReports.get(diagnosticReportId)` → subject → patient.
  - `PRESCRIPTION_DISPENSED` → `medicationRequests.get(prescriptionId)` → subject → patient.
- Returns `{ name, loading }`; name from the patient's display fields. Emits a **PHI_READ audit** (`@ultranos/audit`, resourceType per source) once per open. Fails soft (no name shown) if not found offline.
- `details`: Order/Reference ID (full + short `slice(-6).toUpperCase()`), Test/Category, Lab, Status, Received (date+time).

### 5.2 Pharmacy-Lite
- `DISPENSE_REVIEW_RESOLVED` → resolve prescription → patient within scope (local store or existing endpoint); audited. `details`: Review ID, Prescription (short), Status, Received.

### 5.3 Lab-Lite
- Non-PHI `details` for admin types: Lab name, Pathogen (outbreak), Reason/Status, Effective time. No patient.

### 5.4 Admin-Portal (new surface)
- Build: `lib/notification-client.ts` (tRPC `notification.list`/`unreadCount`/`acknowledge`, admin auth token), `use-notification-poll.ts` (seeded seenIds), `NotificationBell.tsx`, `NotificationPanel.tsx` (uses shared `NotificationRow` + `NotificationDetailModal`), `NotificationToaster.tsx`, mount in the admin shell/header. Non-PHI `details`: Practitioner/Lab ref, Submission ID, Action/Status, Effective time. i18n keys in admin-portal locales.
- Admin-Portal already re-exports ui-kit via `@/components/ui/*`; import shared notification components via `@ultranos/ui-kit/...` subpaths.

## 6. i18n
Add detail-row label keys (`notifications.field.orderId`, `.test`, `.lab`, `.status`, `.received`, `.patient`, `.referenceId`, `.prescription`, `.reviewId`, `.pathogen`, `.reason`) to all locales of every touched app. Admin-Portal also gets the full `notifications.*` set (sourceApp/subject/body/notes/viewDetails/unread + the new field labels). Real ar/prs/ps; uncertain flagged in each app's `TRANSLATION_REVIEW.md`.

## 7. Testing
- ui-kit: modal renders `details` rows + patient line + loading state; RTL snapshot with details.
- OPD-Lite: patient hook resolves name from a seeded local DB for each source type; emits audit; modal shows Order ID + Received date-time + patient; fails soft when patient absent.
- Pharmacy/Lab/Admin: details render; admin surface bell/panel/modal/toast smoke + poll seeding.
- PHI: assert the notification record/DTO still carries no patient fields; patient only appears via the audited lookup path.

## 8. Non-Goals
- No PHI added to the notification record/payload.
- Patient-Lite-Mobile (RN) unchanged.
- No new notification *types/triggers*.

## 9. Risks
- OPD offline lookup depends on the order/report/rx being in the local cache; fail-soft to "patient unavailable offline" (localized).
- Admin-Portal auth/token wiring for the notification client must match its existing tRPC auth pattern.
- Audit-on-open increases PHI_READ volume (acceptable; Rule #6 requires auditing the read).
