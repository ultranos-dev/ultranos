# Admin Portal Operational Polish — Epic C Design Spec

**Date:** 2026-05-19
**Status:** Draft
**Depends on:** Epic A (Foundation — complete), Epic B (Billing & Compliance — complete)

---

## Overview

Epics A and B made the admin portal functional and commercial. Epic C makes it operationally mature. After it ships, admins can view a unified provider profile, run a meaningful escalation workflow on prescribing alerts, tune thresholds to their clinic's context, and configure module-level behavior — the last layer before scale-stage features.

---

## 1. Provider Unified Profile & Search

### 1.1 Provider Search

**Files modified:**
- `apps/admin-portal/src/app/providers/page.tsx`
- `apps/admin-portal/src/app/providers/expiry/page.tsx`

Add a text search input to both provider pages, positioned in the filter bar alongside existing status tabs.

**Search input:** `<input type="text" placeholder="Search by name or email..." />` styled with `rounded-xl border border-border px-4 py-2 text-sm`. Filters on `given_name`, `family_name`, or `telecom_email`.

**Implementation:**
- On the KYC queue page (`/providers`): Pass a `search` parameter to the existing `trpc.admin.listKycSubmissions.query()` call. The Hub API procedure needs to be extended to accept an optional `search` input and filter accordingly.
- On the license expiry page (`/providers/expiry`): Pass a `search` parameter to `trpc.admin.listExpiringProviders.query()`. Same extension needed.
- Debounce the search input (300ms) to avoid excessive API calls.

**Hub API changes:**
- Extend `admin.listKycSubmissions` input schema: add `search: z.string().optional()`
- Extend `admin.listExpiringProviders` input schema: add `search: z.string().optional()`
- Both procedures add `.or(given_name.ilike.%${search}%,family_name.ilike.%${search}%,telecom_email.ilike.%${search}%)` when search is provided. The KYC submissions query joins with practitioners to resolve provider name.

### 1.2 Provider Profile Page

**Route:** `/providers/profile/[practitionerId]`
**File:** `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx` (new)

A unified view of a single provider, aggregating data from multiple tables.

**Layout — four sections:**

**Section A: Identity Card**

Top of page, horizontal card:
- Provider name (large), email, phone (if available)
- Role badge (e.g., "CLINICIAN")
- KYC status badge (PENDING_VERIFICATION / ACTIVE / REJECTED / SUSPENDED)
- License expiry date with urgency coloring (red ≤7d, orange ≤30d, yellow ≤60d, green >60d)
- Organization name

**Section B: KYC History**

Table of all KYC submissions for this provider:

| Column | Content |
|--------|---------|
| Submission ID | Truncated UUID |
| Status | Color-coded badge |
| Submitted | Date |
| Reviewed | Date or "—" |
| Actions | "View Details" → existing `/providers/[submissionId]` page |

Data source: New `admin.getProviderProfile` procedure queries `kyc_submissions` filtered by `practitioner_id`.

**Section C: License Timeline**

- Current license expiry date with large urgency-colored badge
- Days remaining (calculated)
- If license is expired: red alert box "License expired on [date]"
- "Renew License" button (opens the existing `RenewLicenseModal` from the expiry page)

**Section D: Prescribing Alert History**

Table of all anomaly alerts associated with this provider:

| Column | Content |
|--------|---------|
| Alert ID | Truncated |
| Type | CONTROLLED_SUBSTANCE_VOLUME / DRUG_FREQUENCY |
| Severity | HIGH (red) / MEDIUM (amber) |
| Status | UNREVIEWED / ESCALATED / DISMISSED / RESOLVED |
| Date | Created date |
| Actions | "View" → `/alerts/[alertId]` |

Summary line above table: "X total alerts: Y dismissed, Z escalated, W resolved"

Warning if ≥3 escalated or unresolved alerts: amber box "This provider has multiple unresolved alerts."

Data source: `admin.getProviderProfile` also queries `prescribing_anomalies` filtered by `practitioner_id`.

**Back navigation:** "← Back to Providers" → `/providers`

### 1.3 Link Provider Names to Profile

Update these pages to make provider names clickable → `/providers/profile/[practitionerId]`:
- `/providers` (KYC queue) — provider name column
- `/providers/expiry` — provider name column
- `/alerts/[alertId]` — provider name in the prescribing summary section

### 1.4 Hub API Procedure

**`admin.getProviderProfile`** query:
- Input: `{ practitionerId: z.string().uuid() }`
- Queries:
  1. `practitioners` — provider identity, role, KYC status, license expiry, org membership
  2. `kyc_submissions` — all submissions for this practitioner, ordered by submitted_at desc
  3. `prescribing_anomalies` — all alerts for this practitioner, ordered by created_at desc
- Returns: `{ practitioner, kycSubmissions, alerts, alertSummary: { total, dismissed, escalated, resolved } }`
- Authorization: ADMIN role, scoped to admin's org (practitioner must belong to same org)

---

## 2. Alert Escalation Workflow

### 2.1 Escalation Modal

**File:** `apps/admin-portal/src/components/alerts/EscalationModal.tsx` (new)

Replaces the current inline "Escalate" action on the alert detail page. When admin clicks "Escalate", this modal opens.

**Fields:**

| Field | Type | Required | Details |
|-------|------|----------|---------|
| Assign to | Dropdown | No | Lists ADMIN users in the org via `trpc.admin.listUsers.query({ roleFilter: 'ADMIN', statusFilter: 'ACTIVE' })`. Option: "Unassigned" (default). |
| Priority | Radio buttons | Yes | URGENT / NORMAL. Default: NORMAL. |
| Note | Textarea | Yes | Min 10 chars. Placeholder: "Describe what should be investigated..." |

**Actions:**
- "Escalate" button (brand-lime) — calls `admin.escalateAnomaly.mutate({ alertId, assigneeId?, priority, note })`
- "Cancel" button — closes modal

**On success:** Close modal, refresh alert detail page to show new ESCALATED status.

### 2.2 Escalation Section on Alert Detail

**File:** `apps/admin-portal/src/components/alerts/EscalationSection.tsx` (new)

Rendered on the alert detail page (`/alerts/[alertId]`) when alert status is ESCALATED or RESOLVED.

**Content:**

| Field | Display |
|-------|---------|
| Status | ESCALATED (amber badge) or RESOLVED (green badge) |
| Assigned to | Admin name, or "Unassigned" |
| Priority | URGENT (red badge) / NORMAL (neutral badge) |
| Escalation note | The note text |
| Escalated by | Admin name |
| Escalated at | Formatted datetime |
| Resolution note | Only if RESOLVED — the resolution text |
| Resolved by | Only if RESOLVED — admin name |
| Resolved at | Only if RESOLVED — formatted datetime |

**Actions (when ESCALATED):**
- "Resolve" button — opens inline form with required resolution note textarea (min 10 chars). Calls `admin.resolveAnomaly.mutate({ alertId, resolutionNote })`. Status → RESOLVED.
- "Re-assign" button — opens dropdown to change assignee. Calls `admin.reassignAnomaly.mutate({ alertId, assigneeId })`.

### 2.3 Alert Detail Page Modifications

**File:** `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` (modify)

Changes:
1. Replace the inline "Escalate" button with a button that opens `EscalationModal`
2. Add `EscalationSection` below the existing prescribing summary, visible when status is ESCALATED or RESOLVED
3. Add "View Provider Profile" link next to the provider name → `/providers/profile/[practitionerId]`
4. The existing `admin.getAnomalyDetail` response needs to be extended to include escalation fields (assignee name, priority, note, timestamps, resolution)

### 2.4 Hub API Procedures

**`admin.escalateAnomaly`** mutation:
- Input: `{ alertId: string, assigneeId?: string, priority: 'URGENT' | 'NORMAL', note: string }`
- Updates `prescribing_anomalies`: set `status = 'ESCALATED'`, `assigned_to`, `escalation_priority`, `escalation_note`, `escalated_by = ctx.user.sub`, `escalated_at = now()`
- Emits `ANOMALY_ESCALATED` audit event with `{ alertId, assigneeId, priority, escalatedBy }`
- Returns `{ success: true }`

**`admin.resolveAnomaly`** mutation:
- Input: `{ alertId: string, resolutionNote: string }`
- Validates alert is in ESCALATED status
- Updates: `status = 'RESOLVED'`, `resolution_note`, `resolved_by = ctx.user.sub`, `resolved_at = now()`
- Emits `ANOMALY_RESOLVED` audit event
- Returns `{ success: true }`

**`admin.reassignAnomaly`** mutation:
- Input: `{ alertId: string, assigneeId: string }`
- Validates alert is in ESCALATED status
- Updates: `assigned_to = assigneeId`
- Emits `ANOMALY_REASSIGNED` audit event
- Returns `{ success: true }`

**Extend `admin.getAnomalyDetail`:**
- Add to the select: `assigned_to`, `escalation_priority`, `escalation_note`, `escalated_by`, `escalated_at`, `resolution_note`, `resolved_by`, `resolved_at`
- Join `practitioners` on `assigned_to` and `escalated_by` to resolve names
- Return the escalation fields in the response

### 2.5 Database Changes

New columns on `prescribing_anomalies`:

```sql
ALTER TABLE prescribing_anomalies
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS escalation_priority TEXT CHECK (escalation_priority IN ('URGENT', 'NORMAL')),
  ADD COLUMN IF NOT EXISTS escalation_note TEXT,
  ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
```

---

## 3. Configurable Thresholds

### 3.1 Threshold Settings UI

**File:** `apps/admin-portal/src/components/settings/ThresholdSettings.tsx` (new)

A settings section rendered on the `/settings` page, after the Notifications section.

Add "Thresholds" to the sticky section nav pills.

**Controls:**

| Setting | Control | Default | Validation |
|---------|---------|---------|------------|
| KYC Review SLA | Number input (days) | 7 | Min 1, max 30 |
| Controlled Substance Daily Limit | Number input | 10 | Min 1, max 100 |
| Drug Frequency Threshold | Number input (%) | 20 | Min 1, max 100 |
| License Expiry Warning — Yellow | Number input (days) | 60 | Min 1, max 365 |
| License Expiry Warning — Orange | Number input (days) | 30 | Min 1, max 365 |
| License Expiry Warning — Red | Number input (days) | 7 | Min 1, max 365 |

Each input has a label and helper text explaining what it controls.

"Save Thresholds" button. Calls `admin.updateOrgThresholds.mutate({ thresholds })`.

Data loaded via `admin.getOrgThresholds.query()` on mount.

### 3.2 Settings Page Modification

**File:** `apps/admin-portal/src/app/settings/page.tsx` (modify)

Add fourth section after Notifications:

```tsx
<section id="thresholds" className="mt-8 scroll-mt-16 mb-12">
  <div className="rounded-3xl bg-white p-5 border border-border">
    <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-4">Thresholds</h2>
    <ThresholdSettings />
  </div>
</section>
```

Add "Thresholds" pill to the section nav.

### 3.3 Hub API Procedures

**`admin.getOrgThresholds`** query:
- Reads `thresholds` JSONB from `organizations` table for the admin's org
- Merges with defaults: `{ kycReviewSlaDays: 7, controlledSubstanceDailyLimit: 10, drugFrequencyThresholdPct: 20, licenseExpiryWarningDays: [60, 30, 7] }`
- Returns merged thresholds

**`admin.updateOrgThresholds`** mutation:
- Input: Zod schema matching threshold shape with validation ranges
- Updates `organizations.thresholds` for the admin's org
- Emits `ORG_THRESHOLDS_UPDATED` audit event with `{ changedBy, thresholds }`
- Returns `{ success: true }`

### 3.4 Threshold Consumption (Frontend)

The following pages should read thresholds from the API response rather than hardcoding:

| Page | What Changes |
|------|-------------|
| `/providers` (KYC queue) | SLA countdown uses org's `kycReviewSlaDays` instead of hardcoded 7 |
| `/providers/expiry` | Urgency bands use org's `licenseExpiryWarningDays` instead of hardcoded [60, 30, 7] |
| Dashboard stat cards | SLA breach count calculation uses org threshold |

**Implementation:** Extend the relevant API responses to include the org's threshold values so the frontend can use them for display logic. The actual anomaly detection (Hub API cron) consuming these thresholds is out of scope for this spec — that's a Hub API concern.

### 3.5 Database Changes

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS thresholds JSONB NOT NULL DEFAULT '{}'::jsonb;
```

---

## 4. Module-Specific Settings

### 4.1 Module Settings UI

**File:** `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx` (new)

A component that renders the appropriate settings controls for a given module code.

**Props:** `{ moduleCode: string, moduleName: string }`

**Module configs (static map):**

**OPD Lite (`OPD_LITE`):**

| Setting | Control | Default |
|---------|---------|---------|
| Consultation languages | Multi-select checkboxes (en, ar, fa, ps, ur) | `['en']` |
| Default SOAP template | Dropdown: Standard / Brief / Detailed | Standard |
| AI-assisted notes | Toggle | On |

**Pharmacy Lite (`PHARMACY_LITE`):**

| Setting | Control | Default |
|---------|---------|---------|
| Require pharmacist signature on dispense | Toggle | On |
| Allow partial dispense | Toggle | Off |
| Controlled substance double-verify | Toggle | On |

**Lab Lite (`LAB_LITE`):**

| Setting | Control | Default |
|---------|---------|---------|
| Auto-notify provider on result upload | Toggle | On |
| Result retention days | Number input | 365 |

Each card has its own "Save [Module] Settings" button.

### 4.2 Settings Page — Modules Section

**File:** `apps/admin-portal/src/app/settings/page.tsx` (modify)

Add fifth section after Thresholds:

```tsx
<section id="modules" className="mt-8 scroll-mt-16 mb-12">
  <div className="rounded-3xl bg-white p-5 border border-border">
    <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-4">Modules</h2>
    {/* Render a card for each subscribed module */}
  </div>
</section>
```

Add "Modules" pill to the section nav.

The section fetches subscribed modules via `trpc.subscription.getOrgSubscriptions.query()` and renders a `ModuleSettingsCard` for each active/trial module.

If no modules are subscribed: "No modules configured. Subscribe to a module to see its settings."

### 4.3 Hub API Procedures

**`admin.getModuleSettings`** query:
- Input: `{ moduleCode: string }`
- Queries `org_module_settings` for `(org_id, module_code)`
- Merges with module-specific defaults (hardcoded in the procedure per module code)
- Returns merged settings object

**`admin.updateModuleSettings`** mutation:
- Input: `{ moduleCode: string, settings: Record<string, unknown> }`
- Validates moduleCode is one of: OPD_LITE, PHARMACY_LITE, LAB_LITE
- Validates the org has an active subscription for this module
- Upserts into `org_module_settings`
- Emits `MODULE_SETTINGS_UPDATED` audit event with `{ moduleCode, changedBy }`
- Returns `{ success: true }`

### 4.4 Database Changes

```sql
CREATE TABLE IF NOT EXISTS org_module_settings (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, module_code)
);

ALTER TABLE org_module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own org module settings"
  ON org_module_settings
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM practitioners WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM practitioners WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
  ));
```

---

## Audit Events

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `ANOMALY_ESCALATED` | Admin escalates alert | `{ alertId, assigneeId, priority, escalatedBy }` |
| `ANOMALY_RESOLVED` | Admin resolves escalated alert | `{ alertId, resolutionNote, resolvedBy }` |
| `ANOMALY_REASSIGNED` | Admin re-assigns escalated alert | `{ alertId, newAssigneeId, reassignedBy }` |
| `ORG_THRESHOLDS_UPDATED` | Admin updates org thresholds | `{ changedBy, thresholds }` |
| `MODULE_SETTINGS_UPDATED` | Admin updates module settings | `{ moduleCode, changedBy }` |

No PHI in any event payload.

---

## Out of Scope

- **Hub API anomaly detection logic** consuming thresholds — this spec provides the UI and API to set thresholds; the cron job that evaluates prescribing patterns against them is a separate concern
- **Spoke app consumption** of module settings — spoke apps reading settings from Hub API is their concern, not the admin portal's
- **Custom report builder** → Scale-stage
- **Multi-admin RBAC** → Scale-stage
- **Admin portal internationalization** → Scale-stage
- **Dark mode** → Scale-stage
- **Mobile-responsive layout** → Scale-stage

---

## Files Changed Summary

### New (Admin Portal):
- `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx` — Provider unified profile
- `apps/admin-portal/src/components/alerts/EscalationModal.tsx` — Escalation assignment modal
- `apps/admin-portal/src/components/alerts/EscalationSection.tsx` — Escalation tracking display
- `apps/admin-portal/src/components/settings/ThresholdSettings.tsx` — Threshold configuration controls
- `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx` — Per-module settings card

### Modified (Admin Portal):
- `apps/admin-portal/src/app/providers/page.tsx` — Add search, link names to profile
- `apps/admin-portal/src/app/providers/expiry/page.tsx` — Add search, link names to profile
- `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` — Add EscalationModal, EscalationSection, provider profile link
- `apps/admin-portal/src/app/settings/page.tsx` — Add Thresholds and Modules sections

### Hub API:
- `apps/hub-api/src/trpc/routers/admin.ts` — Add getProviderProfile, escalateAnomaly, resolveAnomaly, reassignAnomaly, getOrgThresholds, updateOrgThresholds, getModuleSettings, updateModuleSettings. Extend listKycSubmissions, listExpiringProviders, getAnomalyDetail with search and escalation fields.
- Database migrations for prescribing_anomalies escalation columns, organizations.thresholds, org_module_settings table
