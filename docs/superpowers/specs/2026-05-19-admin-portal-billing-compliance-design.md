# Admin Portal Billing & Compliance — Epic B Design Spec

**Date:** 2026-05-19
**Status:** Draft
**Depends on:** Epic A (Admin Portal Foundation — complete)
**Blocks:** Epic C (Operational Polish)

---

## Overview

Epic A made the admin portal functional for a pilot — admins can manage users, configure their organization, and use the dashboard. Epic B makes it commercial and compliant. After it ships, admins can pay for their subscriptions, view invoices, browse the audit log for compliance, and export data from any table.

---

## 1. Payment Method Management

### 1.1 Billing Page

**Route:** `/subscriptions/billing`
**File:** `apps/admin-portal/src/app/subscriptions/billing/page.tsx` (new)

**Entry points:**
- "Manage Billing" button on `/subscriptions` page, next to "Add Module" button
- "Set Up Billing" CTA on dashboard subscription widget → deep-links to `/subscriptions/billing`
- New sidebar sub-item: "Billing" indented under Subscriptions

**Page layout — two sections:**

**Section A: Current Payment Method**

Card displaying the active payment method:
- Card brand icon (Visa, Mastercard, Amex, etc.)
- Last 4 digits: "•••• 4242"
- Expiry: "MM/YY"
- "Update" button (re-opens the provider form)
- "Remove" button (with confirmation dialog: "Are you sure? Your subscription will be suspended if no payment method is on file at your next billing date.")

When no payment method is on file:
- Amber warning card: "No payment method on file. Add one to continue your subscription after the trial period."
- Prominent "Add Payment Method" CTA (brand-lime pill button)

Data source: `subscription.getPaymentMethod` query returning `{ brand, last4, expMonth, expYear } | null`.

**Section B: Payment Provider Form**

When the admin clicks "Add Payment Method" or "Update":
1. Frontend calls `subscription.createPaymentSetup.mutate()` which returns a provider-specific setup payload:
   - For Stripe: `{ provider: 'stripe', clientSecret: string }` → frontend renders Stripe Elements
   - For Tap Payments: `{ provider: 'tap', redirectUrl: string }` → frontend redirects to Tap checkout
   - For other providers: `{ provider: string, redirectUrl: string }` or `{ provider: string, clientSecret: string }`
2. Provider's embedded form handles card tokenization — the admin portal never sees raw card numbers
3. On success, the provider callback hits a Hub API webhook endpoint which stores the tokenized payment method reference
4. Frontend polls or receives a callback confirming the payment method was saved, then refreshes the payment method display

**Provider-agnostic architecture:** The `packages/billing/` adapter is configured via `BILLING_PROVIDER` env var. The Hub API procedures delegate to the adapter, which returns provider-specific payloads. The frontend handles two patterns:
- `clientSecret` → render provider's embedded form inline (e.g., Stripe Elements)
- `redirectUrl` → redirect to provider's hosted checkout page, return via callback URL

**Fallback for unconfigured billing:** If `BILLING_PROVIDER` is not set or the billing adapter is not initialized, the page shows: "Billing is not configured for this deployment. Contact your system administrator." No payment form is rendered. This supports self-hosted deployments without a payment provider.

### 1.2 Trial-to-Paid Conversion Flow

**Trial countdown escalation (dashboard subscription widget):**

| Trial Remaining | Widget Behavior |
|----------------|-----------------|
| > 7 days | Standard display: "Free Trial — X days remaining" with green progress bar |
| 3–7 days | Amber progress bar. CTA text changes to "Set Up Billing Now" |
| 1–3 days | Red progress bar. CTA gets red border for urgency |
| Expired | See below |

**Trial expired — no payment method:**

When `organization.status === 'TRIAL'` and `trial_ends_at < now()` and no payment method is on file:

- **Login interstitial:** Implemented as a check in the `AuthGuard` component (`apps/admin-portal/src/components/AuthGuard.tsx`). After verifying the admin session, AuthGuard checks if the org is trial-expired with no payment method. If so, it renders the interstitial overlay instead of `children`. This keeps the gating logic centralized with existing auth checks. The overlay:
  - "Your free trial has expired"
  - "Add a payment method to continue using Ultranos."
  - Single CTA: "Set Up Billing" → `/subscriptions/billing`
  - Small link: "Sign Out" for admins who don't want to convert
  - No way to dismiss — must either set up billing or sign out

- **Persistent banner:** On all non-billing pages, a fixed-position banner at the top of the content area (not blocking the sidebar):
  - "Your trial has expired. [Set up billing](/subscriptions/billing) to restore access."
  - Red background, white text
  - Cannot be dismissed

- **Module access:** The Hub API's existing entitlement gating (403 SUBSCRIPTION_REQUIRED) blocks clinical API calls. The admin portal remains accessible for billing setup.

**Trial expired — payment method on file:**

The Hub API's subscription lifecycle job auto-transitions the org from TRIAL to ACTIVE and charges the first invoice. No admin action needed. The dashboard widget updates to show "Active Subscription."

### 1.3 Sidebar Navigation Updates

Add to `Sidebar.tsx` under Subscriptions:

| # | Label | Route | Indent |
|---|-------|-------|--------|
| 10 | Subscriptions | `/subscriptions` | No |
| 11 | Billing | `/subscriptions/billing` | Yes |
| 12 | Invoices | `/subscriptions/invoices` | Yes |

### 1.4 Subscriptions Page Updates

**File:** `apps/admin-portal/src/app/subscriptions/page.tsx` (modify)

Add two links below the modules table:
- "Manage Billing →" link → `/subscriptions/billing`
- "View Invoices →" link → `/subscriptions/invoices`

Styled as text links with `text-text-muted hover:text-black` to avoid visual clutter.

---

## 2. Invoice & Billing History

### 2.1 Invoice History Page

**Route:** `/subscriptions/invoices`
**File:** `apps/admin-portal/src/app/subscriptions/invoices/page.tsx` (new)

**Table columns:**

| Column | Content | Behavior |
|--------|---------|----------|
| Date | Invoice date, formatted in org timezone | Sorted desc by default |
| Description | e.g., "Monthly subscription — OPD Lite, Pharmacy Lite" | Plain text |
| Amount | "$XX.XX" | Right-aligned |
| Status | PAID / PENDING / FAILED / REFUNDED | Color badge: green / amber / red / neutral |
| Actions | "Download PDF" link | Opens provider-hosted invoice PDF in new tab |

**Filters:** Status dropdown (All / Paid / Pending / Failed / Refunded). No date range filter needed — invoices are already chronological and relatively low volume.

**Pagination:** 20 per page. Previous/Next controls.

**Empty state:** "No invoices yet. Invoices will appear here once your first billing cycle completes."

**Data source:** `subscription.listInvoices` query:
- Input: `{ page, pageSize, statusFilter? }`
- Output: `{ invoices: Invoice[], totalCount: number }`
- Invoice shape: `{ id, date, description, amountUsd, status, downloadUrl }`
- The procedure queries the billing provider API (via `packages/billing/` adapter) for invoice data. Provider-hosted invoices (Stripe, Tap) have their own PDF URLs.
- Fallback: If billing adapter is not configured, returns empty array.

### 2.2 Dunning / Failed Payment UI

**New component:** `apps/admin-portal/src/components/subscriptions/DunningBanner.tsx`

A persistent banner that appears on the dashboard and subscriptions pages when payment has failed.

**States:**

| State | Trigger | Display |
|-------|---------|---------|
| **Payment failed** | `organization.payment_failure_reason IS NOT NULL` AND `status = 'ACTIVE'` | Amber banner: "Your last payment failed. [Update your payment method](/subscriptions/billing) to avoid service interruption." |
| **Grace period** | `organization.grace_period_ends_at IS NOT NULL` AND `grace_period_ends_at > now()` | Amber banner with countdown: "Payment failed. You have X days to [update your payment method](/subscriptions/billing) before your subscription is suspended." |
| **Suspended (payment)** | `organization.status = 'SUSPENDED'` AND `payment_failure_reason IS NOT NULL` | Red banner: "Your subscription has been suspended due to a failed payment. [Update your payment method](/subscriptions/billing) to restore access." |

**Placement:** Rendered at the top of the main content area in the root layout, above the page content. Only visible when dunning conditions are met. The banner checks org status on mount via `trpc.admin.getOrganization.query()` (already available from Epic A).

**Dashboard integration:** The `SubscriptionWidget` component (from Epic A) gains awareness of dunning states:
- If `payment_failure_reason` is set, the widget shows the dunning state instead of the normal subscription display
- The widget's data source (`subscription.getOrgSubscriptions`) already returns org status — extend its return type to also include `paymentFailureReason` and `gracePeriodEndsAt` from the organizations table. This requires updating the existing `subscription.getOrgSubscriptions` procedure in the Hub API, not a new procedure.

---

## 3. Audit Log Event Browsing

### 3.1 Audit Page Tab Bar

**File:** `apps/admin-portal/src/app/audit/page.tsx` (modify)

Add a tab bar at the top of the existing audit page:
- **Chain Integrity** — existing content (hash chain status, 30-day health trend, verification history)
- **Event Browser** — new audit event browsing interface

Tab bar styled as pills matching the settings page pattern: `rounded-full px-4 py-1.5 text-sm font-medium`. Active tab uses `bg-brand-lime text-black`. Default active tab: Chain Integrity (preserves existing behavior).

State managed via URL hash (`#integrity` / `#events`) or local state. URL hash preferred so tabs are linkable — the "View All →" link from the dashboard activity feed can link to `/audit#events`.

### 3.2 Event Browser Component

**File:** `apps/admin-portal/src/components/audit/EventBrowser.tsx` (new)

**Filters (top bar):**

| Filter | Type | Options | Default |
|--------|------|---------|---------|
| Date range | Two date inputs (from/to) | Max span: 90 days | Last 7 days |
| Action type | Multi-select dropdown | KYC (KYC_APPROVED, KYC_REJECTED, KYC_MORE_INFO_REQUESTED) / Lab (LAB_APPROVED, LAB_SUSPENDED, LAB_REACTIVATED) / User (STAFF_USER_CREATED, STAFF_USER_SUSPENDED, etc.) / Alert (ANOMALY_DISMISSED, ANOMALY_ESCALATED) / Auth (ADMIN_LOGIN_SUCCESS, ADMIN_LOGIN_FAILURE) / Settings (ORG_SETTINGS_UPDATED) / All | All |
| Actor | Text input | Searches actor name/email | Empty |
| Outcome | Dropdown | All / SUCCESS / DENIED | All |

**Table columns:**

| Column | Content | Behavior |
|--------|---------|----------|
| Timestamp | Full datetime in org timezone (from Epic A) | `Intl.DateTimeFormat` with org's IANA timezone |
| Action | Human-readable label | Mapped from action code (same mapping as RecentActivityFeed from Epic A) |
| Actor | Name + role badge | Resolved from actor_id via joined practitioner data |
| Resource | Type + truncated ID | e.g., "Practitioner abc1…", "Lab def4…" |
| Outcome | SUCCESS / DENIED | Green / red badge |
| Details | Expand toggle | Clicking row expands to show formatted metadata JSON below the row |

**Expanded row:** Shows `metadata` as a formatted key-value list (not raw JSON). Keys are title-cased. Values containing UUIDs are truncated. Values that could contain PHI (any key containing "patient", "diagnosis", "medication", "allergy", "note") are replaced with "[redacted]" — this is a client-side safety net on top of server-side sanitization.

**Pagination:** 50 per page. Previous/Next. Total count.

**Data source:** `admin.listAuditEvents` query:
- Input: `{ page, pageSize, dateFrom: string, dateTo: string, actionTypes?: string[], actorSearch?: string, outcome?: string }`
- Output: `{ events: AuditEvent[], totalCount: number }`
- AuditEvent shape: `{ id, timestamp, action, actorId, actorName, actorRole, resourceType, resourceId, outcome, metadata }`
- Server-side behavior:
  - Joins `audit_log` with `practitioners` on `actor_id = practitioners.id` to resolve actor names
  - Scopes to org by filtering `actor_id IN (SELECT id FROM practitioners WHERE org_id = ?)` — since `audit_log.org_id` is not reliably populated by AuditLogger
  - Strips PHI from metadata: removes keys matching `patient_name`, `diagnosis`, `medication_name`, `allergy`, `note_content`, and any value that looks like a clinical narrative (>100 chars of freeform text)
  - Respects max 90-day date range
  - Returns max 10,000 rows per query (hard cap)

### 3.3 Audit Export

**Export buttons** on the Event Browser, above the table:

| Button | Behavior |
|--------|----------|
| "Export CSV" | Downloads current filtered result set as CSV. Max 10,000 rows. |
| "Export PDF" | Generates a formatted PDF report with: org name, export date, filter criteria summary, event table. |

**Data source:** `admin.exportAuditEvents` query:
- Input: same filters as `listAuditEvents` + `{ format: 'csv' | 'pdf' }`
- Output: `{ data: string, filename: string, mimeType: string }` — base64-encoded content
- CSV: standard comma-separated with header row. Same PHI sanitization as the list query.
- PDF: generated server-side using a lightweight PDF library (e.g., `pdfkit` or `@react-pdf/renderer` on the server). Includes: report header (org name, date range, filters), table of events, footer with page numbers and "Generated by Ultranos Admin Portal" watermark.

**Frontend download:** The `ExportButton` component (see section 4) decodes the base64 blob, creates a `Blob` with the correct MIME type, and triggers a download via `URL.createObjectURL`.

---

## 4. Data Export Across Tables

### 4.1 ExportButton Component

**File:** `apps/admin-portal/src/components/ExportButton.tsx` (new)

A reusable button component that triggers a CSV export for any table:

```tsx
interface ExportButtonProps {
  exportFn: (filters: Record<string, unknown>) => Promise<{ data: string; filename: string; mimeType: string }>
  filters: Record<string, unknown>
  label?: string // Default: "Export CSV"
}
```

**Behavior:**
1. On click, sets loading state (button shows spinner + "Exporting...")
2. Calls the provided export function with current filters
3. Decodes the base64 `data` response
4. Creates a `Blob` with the returned `mimeType`
5. Triggers browser download via `URL.createObjectURL` + hidden `<a>` click
6. Resets loading state
7. On error: shows inline error message "Export failed. Try again."

**Styling:** Secondary button: `rounded-full border border-border text-black px-4 py-2 text-sm`. Download icon prefix.

### 4.2 Export Procedures

Each export procedure follows the same pattern:
- Accepts the same filters as the corresponding list procedure
- Queries up to 10,000 rows (hard cap — returns error if filter would exceed)
- Strips PHI from all fields (no patient names, diagnoses, medications, clinical content)
- Returns `{ data: string (base64 CSV), filename: string, mimeType: 'text/csv' }`
- All procedures are `adminProcedure` (ADMIN role only, org-scoped)

| Procedure | Table | Columns Exported | PHI Risk |
|-----------|-------|-----------------|----------|
| `admin.exportKycSubmissions` | `kyc_submissions` | Submission ID, provider name, submitted date, status, SLA status, reviewer | None — no patient data in KYC |
| `admin.exportExpiringProviders` | `practitioners` (filtered) | Provider name, email, license expiry date, days remaining, status | None — provider data only |
| `admin.exportLabs` | `labs` | Lab name, license ref, accreditation ref, status, registration date, verified date | None — lab data only |
| `admin.exportUsers` | `practitioners` | Name, email, role, module, status, MFA enrolled, last login, created date | None — staff data only |
| `admin.exportAlerts` | `prescribing_anomalies` | Alert ID, type, severity, threshold, status, provider (name only), date range | None — aggregate metrics only, no patient data |
| `subscription.exportSubscriptions` | `org_subscriptions` | Module name, status, start date, expiry date, monthly cost | None — billing data only |
| `admin.exportAuditEvents` | `audit_log` | Covered in section 3.3 | Sanitized server-side |

### 4.3 Pages Modified to Add Export

Each page gets an `ExportButton` placed in the top bar, next to existing filter controls:

| Page | Export Function |
|------|----------------|
| `/providers` | `admin.exportKycSubmissions` |
| `/providers/expiry` | `admin.exportExpiringProviders` |
| `/labs` | `admin.exportLabs` |
| `/users` | `admin.exportUsers` |
| `/alerts` | `admin.exportAlerts` |
| `/subscriptions` | `subscription.exportSubscriptions` |
| `/audit` (Event Browser tab) | `admin.exportAuditEvents` (section 3.3) |

---

## Database Changes

### New columns on `organizations` table:
- `payment_failure_reason TEXT` — nullable. Set by billing webhook on payment failure. Cleared on successful payment. Distinguishes payment-suspended from manually-suspended.
- `grace_period_ends_at TIMESTAMPTZ` — nullable. Set when payment fails. The subscription lifecycle job suspends the org when this passes.

### No new tables required.
The `billing_events` table already exists. Invoice data is fetched from the billing provider API, not stored locally (provider is the source of truth for invoices).

---

## Audit Events

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `PAYMENT_METHOD_ADDED` | Admin adds a payment method | `{ provider, last4, adminId }` |
| `PAYMENT_METHOD_REMOVED` | Admin removes payment method | `{ adminId }` |
| `AUDIT_EVENTS_EXPORTED` | Admin exports audit log | `{ format, dateRange, rowCount, adminId }` |
| `DATA_EXPORTED` | Admin exports any table | `{ entity, format, rowCount, filters, adminId }` |

No PHI in any event payload.

---

## Out of Scope

- **Billing provider adapter implementation** — the `packages/billing/` adapter interface is used but the actual provider integration (Stripe webhook handlers, Tap checkout flow) is a separate concern. This spec defines the admin portal UI and Hub API procedures that call the adapter.
- **Automated subscription lifecycle** (trial expiry processing, grace period suspension) — these are Hub API cron jobs, not admin portal features. This spec assumes they exist and the admin portal reacts to the resulting org status changes.
- **Provider unified profile and search** → Epic C
- **Alert escalation workflow and configurable thresholds** → Epic C
- **Module-specific settings** → Epic C
- **Custom report builder** → Scale-stage

---

## Files Changed Summary

### New (Admin Portal):
- `apps/admin-portal/src/app/subscriptions/billing/page.tsx` — Payment method management
- `apps/admin-portal/src/app/subscriptions/invoices/page.tsx` — Invoice history
- `apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx` — Current card display + update/remove
- `apps/admin-portal/src/components/subscriptions/TrialExpiredBanner.tsx` — Full-page interstitial + persistent banner
- `apps/admin-portal/src/components/subscriptions/DunningBanner.tsx` — Failed payment warning banner
- `apps/admin-portal/src/components/audit/EventBrowser.tsx` — Audit event table with filters + expandable rows
- `apps/admin-portal/src/components/ExportButton.tsx` — Reusable CSV export trigger

### Modified (Admin Portal):
- `apps/admin-portal/src/components/Sidebar.tsx` — Add Billing, Invoices sub-items under Subscriptions
- `apps/admin-portal/src/app/subscriptions/page.tsx` — Add "Manage Billing" and "View Invoices" links
- `apps/admin-portal/src/app/audit/page.tsx` — Add tab bar (Chain Integrity / Event Browser)
- `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx` — Add dunning state awareness
- `apps/admin-portal/src/app/providers/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/providers/expiry/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/labs/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/users/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/alerts/page.tsx` — Add ExportButton

### Hub API:
- `apps/hub-api/src/trpc/routers/admin.ts` — Add listAuditEvents, exportAuditEvents, export procedures for KYC/providers/labs/users/alerts
- `apps/hub-api/src/trpc/routers/subscription.ts` — Add createPaymentSetup, getPaymentMethod, removePaymentMethod, listInvoices, getInvoiceDownloadUrl, exportSubscriptions
- Database migration for payment_failure_reason and grace_period_ends_at on organizations
