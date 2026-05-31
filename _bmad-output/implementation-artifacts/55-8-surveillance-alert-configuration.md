# Story 55.8: Surveillance Alert Configuration

Status: review

## Story

As a district health officer,
I want to configure which surveillance alerts I receive and set thresholds,
so that I get the right alerts for my jurisdiction.

## Acceptance Criteria

1. **Given** the admin navigates to `/alerts/configuration`, **when** the page loads, **then** they see their current surveillance alert configuration (or a setup wizard if none exists).
2. **Given** the configuration page renders, **when** the admin views the lab selector, **then** they see a checkbox list of all labs in their organization and can select which labs to monitor.
3. **Given** the admin configures thresholds, **when** they set a positivity rate threshold per test category (e.g., malaria RDT > 15%), **then** the threshold is saved and alerts trigger when the rate exceeds the configured value.
4. **Given** the admin configures notification channels, **when** they enable/disable channels, **then** they can set: in-app (always on), SMS (optional — requires phone number), email (optional — requires email address).
5. **Given** alerts have been triggered, **when** the admin views the alert history, **then** they see past alerts with timestamp, lab name, test category, positivity rate, threshold that was exceeded, and acknowledged status.
6. **Given** an unacknowledged alert exists, **when** the admin clicks "Acknowledge", **then** they can add optional notes and the alert is marked as acknowledged with their ID and timestamp.
7. **Given** Lab-Lite generates surveillance data per the existing Story 50.3 pattern, **then** this story only configures the alert rules — it does not change how Lab-Lite generates raw data.

## Tasks / Subtasks

- [x] **Task 1: Database migrations** (AC: 1-6)
  - [x] 1.1 Create `surveillance_alert_configs` table: `id` (UUID PK), `practitioner_id` (FK — the officer who owns this config), `org_id` (FK), `monitored_lab_ids` (JSONB — array of lab UUIDs), `thresholds` (JSONB — array of `{ test_category: string, threshold_pct: number }`), `channels` (JSONB — `{ in_app: boolean, sms_phone?: string, email?: string }`), `created_at` (timestamptz), `updated_at` (timestamptz). Add unique index on `(practitioner_id, org_id)` — one config per officer per org.
  - [x] 1.2 Create `surveillance_alerts` table: `id` (UUID PK), `config_id` (FK → surveillance_alert_configs), `lab_id` (FK), `test_category` (text NOT NULL), `current_rate` (numeric(5,2) NOT NULL — the positivity rate that triggered), `threshold` (numeric(5,2) NOT NULL — the threshold that was exceeded), `triggered_at` (timestamptz NOT NULL), `acknowledged_at` (timestamptz), `acknowledged_by` (FK), `notes` (text), `created_at` (timestamptz). Add index on `(config_id, triggered_at DESC)`.
  - [x] 1.3 Enable RLS on both tables scoped to `org_id`.

- [x] **Task 2: Configuration CRUD endpoints** (AC: 1-4)
  - [x] 2.1 Create `admin.getSurveillanceConfig` query — accepts `{ practitioner_id? }` (defaults to current user), returns the config with monitored lab names joined.
  - [x] 2.2 Create `admin.updateSurveillanceConfig` mutation — accepts `{ monitored_lab_ids, thresholds, channels }`, validates: all lab IDs belong to org, threshold_pct is between 0-100, SMS channel requires valid phone, email channel requires valid email. Upserts the config record. Emits audit event `SURVEILLANCE_CONFIG_UPDATED`.
  - [x] 2.3 Default thresholds (pre-populated when creating first config): malaria 15%, TB 5%, hepatitis 3%.
  - [x] 2.4 Validate channel configuration: `in_app` is always true (cannot be disabled), `sms_phone` must match E.164 format if provided, `email` must be valid format if provided.

- [x] **Task 3: Alert list and acknowledgment endpoints** (AC: 5, 6)
  - [x] 3.1 Create `admin.listSurveillanceAlerts` query — accepts `{ config_id?, acknowledged?: boolean, cursor?, limit? }`, returns paginated alerts with lab name joined. Default sort: triggered_at DESC.
  - [x] 3.2 Create `admin.acknowledgeSurveillanceAlert` mutation — accepts `{ alert_id, notes? }`, validates alert is not already acknowledged, sets acknowledged_at/acknowledged_by, emits audit event `SURVEILLANCE_ALERT_ACKNOWLEDGED`.
  - [x] 3.3 Create `admin.getSurveillanceAlertSummary` query — returns counts: total unacknowledged, triggered today, triggered this week.

- [x] **Task 4: `/alerts/configuration/page.tsx` with lab selector and threshold form** (AC: 1-4)
  - [x] 4.1 Create `apps/admin-portal/src/app/alerts/configuration/page.tsx`.
  - [x] 4.2 Layout: `TopHeader` with title "Alert Configuration" and "Save Configuration" button (brand-lime, rounded-full).
  - [x] 4.3 Section 1 — "Monitored Labs": checkbox list of all org labs with lab name and status. Select all / deselect all toggle.
  - [x] 4.4 Section 2 — "Positivity Rate Thresholds": table of test categories with editable threshold percentage inputs. Pre-populated with defaults (malaria 15%, TB 5%, hepatitis 3%). "Add Category" button to add custom test categories.
  - [x] 4.5 Section 3 — "Notification Channels": in-app toggle (always on, disabled), SMS toggle with phone number input (shown when enabled), email toggle with email input (shown when enabled).
  - [x] 4.6 Form validation: at least one lab must be selected, at least one threshold must be configured, channel-specific fields validated when enabled.
  - [x] 4.7 On save: calls `trpc.admin.updateSurveillanceConfig.mutate(...)`, shows success toast.

- [x] **Task 5: Alert history table with acknowledge action** (AC: 5, 6)
  - [x] 5.1 Create `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx`.
  - [x] 5.2 Table with `bg-black` header: Date/Time, Lab, Test Category, Positivity Rate (with threshold comparison, e.g., "23% / 15%"), Status (Unacknowledged=red badge, Acknowledged=green badge), Actions.
  - [x] 5.3 Filter tabs: ALL | UNACKNOWLEDGED | ACKNOWLEDGED.
  - [x] 5.4 "Acknowledge" button per row opens modal with optional notes textarea and confirm button.
  - [x] 5.5 Embed this component in the `/alerts/configuration/page.tsx` below the config form, or as a separate tab.
  - [x] 5.6 Pagination with cursor-based navigation.

- [x] **Task 6: Sidebar navigation update** (AC: 1)
  - [x] 6.1 Add "Alert Config" as indented sub-nav item under "Alerts" in `apps/admin-portal/src/components/Sidebar.tsx` (href: `/alerts/configuration`). Use a settings/sliders icon.

- [x] **Task 7: Tests** (AC: 1-7)
  - [x] 7.1 Hub API unit tests: config CRUD — validate monitored_lab_ids belong to org, threshold range validation (0-100), channel validation (E.164 phone, valid email).
  - [x] 7.2 Hub API unit tests: config upsert — creating new config, updating existing config, default threshold population.
  - [x] 7.3 Hub API unit tests: alert acknowledgment — valid acknowledgment, reject double-acknowledge, notes stored correctly.
  - [x] 7.4 Hub API unit tests: alert list pagination and filtering (acknowledged/unacknowledged).
  - [x] 7.5 Hub API unit tests: audit event emission for config update and alert acknowledgment.
  - [x] 7.6 Admin Portal component tests: lab checkbox selector — select all, deselect all, individual toggle.
  - [x] 7.7 Admin Portal component tests: threshold form — default values populated, custom category addition, percentage validation.
  - [x] 7.8 Admin Portal component tests: channel configuration — SMS field shown when toggled, email field shown when toggled, in-app always on.
  - [x] 7.9 Admin Portal component tests: alert history table — filter tabs, acknowledge modal flow.

## Dev Notes

### Architecture

- All endpoints use `adminProcedure` from `apps/hub-api/src/trpc/routers/admin.ts`.
- This story configures the rules; the actual alert triggering happens at the data layer. When Lab-Lite syncs positivity data to the Hub (per Story 50.3 — automated disease surveillance alerts), a Hub-side background job or trigger checks the data against stored configs and creates `surveillance_alerts` records. That triggering logic can be deferred to a follow-up task — this story focuses on config CRUD, alert viewing, and acknowledgment.
- One config per officer per org (unique constraint). Officers see their own config and all alerts generated from it.
- No PHI is involved in surveillance data — test categories, positivity rates, and lab names are operational/public health data. Audit events must still log actor IDs.

### Default Thresholds

```typescript
const DEFAULT_THRESHOLDS = [
  { test_category: 'Malaria RDT', threshold_pct: 15 },
  { test_category: 'TB (Smear)', threshold_pct: 5 },
  { test_category: 'Hepatitis B', threshold_pct: 3 },
]
```

These are pre-populated in the config form when an officer creates their first configuration. They can add/remove/edit categories and thresholds.

### Channel Validation

```typescript
const channelSchema = z.object({
  in_app: z.literal(true), // always true, cannot disable
  sms_phone: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(), // E.164
  email: z.string().email().optional(),
})
```

### Alert Triggering (Out of Scope for This Story)

The `surveillance_alerts` table will be populated by a Hub-side process that:
1. On each lab data sync, computes positivity rates per test category per lab
2. Checks each rate against matching `surveillance_alert_configs`
3. If rate > threshold, inserts a `surveillance_alerts` record
4. Optionally sends SMS/email via configured channels

This triggering logic is out of scope for Story 55.8 — this story handles config and alert management only. For testing, seed alert records directly.

### Project Structure Notes

**New files to create:**
- `apps/admin-portal/src/app/alerts/configuration/page.tsx` — config form + alert history
- `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx` — alert history table
- `apps/admin-portal/src/components/alerts/SurveillanceConfigForm.tsx` — config form component
- `apps/admin-portal/src/components/alerts/AcknowledgeAlertModal.tsx` — acknowledge modal
- `apps/admin-portal/src/__tests__/surveillance-config.test.tsx` — component tests
- `apps/hub-api/src/__tests__/surveillance-config.test.ts` — API tests

**Files to modify:**
- `apps/hub-api/src/trpc/routers/admin.ts` — add surveillance config and alert endpoints
- `apps/admin-portal/src/components/Sidebar.tsx` — add "Alert Config" indented sub-nav under Alerts (after line 19, after the Alerts entry)

### Component Patterns to Follow

- Table header: `bg-black text-white`
- Buttons: `rounded-full` with brand-lime accent for save, danger variant for destructive actions
- Tab-style filters: horizontal button group for status filtering
- Form sections: labeled card sections with clear visual hierarchy
- Modals: confirmation modals with optional note input (see `EscalationModal.tsx`)
- Checkbox list: scrollable container with search/filter for large lab lists
- Status badges: colored pill badges (Unacknowledged=red, Acknowledged=green)

### References

- [Source: apps/admin-portal/src/app/alerts/page.tsx] — existing alerts page (this story adds configuration sub-route)
- [Source: apps/admin-portal/src/app/alerts/[alertId]/page.tsx] — alert detail page pattern
- [Source: apps/admin-portal/src/components/alerts/EscalationModal.tsx] — modal pattern with notes
- [Source: apps/admin-portal/src/components/Sidebar.tsx] — nav item structure, indent pattern (line 12, 17)
- [Source: apps/hub-api/src/trpc/routers/admin.ts] — `adminProcedure`, audit event pattern
- [Source: apps/admin-portal/src/lib/trpc.ts] — tRPC client setup
- [Source: apps/admin-portal/src/components/settings/ThresholdSettings.tsx] — threshold input pattern (reusable)
- [Source: _bmad-output/implementation-artifacts/50-3-automated-disease-surveillance-alerts.md] — Lab-Lite surveillance alert generation (related story)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
None — clean implementation.

### Completion Notes List
- Task 1: Applied Supabase migration `create_surveillance_alert_configs_and_alerts` with both tables, unique index, RLS policies, and `updated_at` trigger.
- Task 2: Added `getSurveillanceConfig` (query with lab join) and `updateSurveillanceConfig` (mutation with org validation, upsert, audit) to admin router.
- Task 3: Added `listSurveillanceAlerts` (paginated, filterable by ack status), `acknowledgeSurveillanceAlert` (double-ack rejection, org validation, audit), and `getSurveillanceAlertSummary` (unacknowledged/today/week counts).
- Task 4: Created config page at `/alerts/configuration` with `SurveillanceConfigForm` (lab checkboxes, threshold table, channel toggles) and embedded alert history.
- Task 5: Created `SurveillanceAlertHistory` with bg-black header table, filter tabs, pagination, and `AcknowledgeAlertModal` with optional notes.
- Task 6: Added "Alert Config" indented sub-nav under Alerts in Sidebar with SlidersIcon.
- Task 7: 16 hub-api tests (config CRUD validation, acknowledgment, listing, summary) and 19 admin-portal component tests (form, history, modal).

### File List
- `apps/admin-portal/src/app/alerts/configuration/page.tsx` (new)
- `apps/admin-portal/src/components/alerts/SurveillanceConfigForm.tsx` (new)
- `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx` (new)
- `apps/admin-portal/src/components/alerts/AcknowledgeAlertModal.tsx` (new)
- `apps/admin-portal/src/components/Sidebar.tsx` (modified — added Alert Config nav + SlidersIcon)
- `apps/hub-api/src/trpc/routers/admin.ts` (modified — added 5 surveillance endpoints)
- `apps/hub-api/src/__tests__/surveillance-config.test.ts` (new)
- `apps/admin-portal/src/__tests__/surveillance-config.test.tsx` (new)

### Change Log
- 2026-05-30: Story 55.8 implemented — all 7 tasks complete, 35 tests passing.
