# Admin Portal Foundation — Epic A Design Spec

**Date:** 2026-05-19
**Status:** Draft
**Depends on:** Epic 22 (scaffold, complete), Epic 27 (subscriptions, complete)
**Blocks:** Epic B (Billing & Compliance), Epic C (Operational Polish)

---

## Overview

The admin portal has functional pages for KYC review, lab approvals, alerts, audit chain monitoring, subscriptions, and AI model management. However, it is missing the connective tissue that makes it usable as a daily operations tool: user management, organization settings, discoverable navigation, and an actionable dashboard.

This epic closes those gaps. After it ships, an admin can manage staff access, configure their organization, and use the dashboard as a command center — making the portal viable for a production pilot.

---

## 1. Navigation & Layout Fixes

### 1.1 Sidebar Navigation Additions

**File:** `apps/admin-portal/src/components/Sidebar.tsx`

The sidebar currently has 8 items. Add two nav entries and restructure:

| # | Label | Route | Icon | Notes |
|---|-------|-------|------|-------|
| 1 | Dashboard | `/dashboard` | Home | Existing |
| 2 | Providers | `/providers` | User | Existing |
| 3 | License Expiry | `/providers/expiry` | Clock | Existing, indented |
| 4 | Labs | `/labs` | Flask | Existing |
| 5 | **Users** | `/users` | UsersGroup | **New** |
| 6 | **Create User** | `/users/create` | — | **New**, indented |
| 7 | AI Models | `/ai-models` | Cpu | Existing |
| 8 | Alerts | `/alerts` | Bell | Existing |
| 9 | Audit Log | `/audit` | Scroll | Existing |
| 10 | **Subscriptions** | `/subscriptions` | CreditCard | **New** |
| 11 | Settings | `/settings` | Gear | Existing |

**Active state matching:** The existing sidebar uses `pathname.startsWith(href)` for highlighting. The "Users" parent item highlights when on `/users` or any `/users/*` path. The "Create User" sub-item highlights only on exact `/users/create` match. This matches the existing "Providers" / "License Expiry" pattern.

### 1.2 Sidebar Footer — User Menu & Sign Out

Add a footer section pinned to the bottom of the sidebar:

- **Admin identity:** Display admin's full name (truncated to ~20 chars) and email (truncated) in small text.
- **Sign Out button:** Text button, red on hover. Calls `supabase.auth.signOut()`, clears the Zustand session store, redirects to `/login`.
- **Styling:** Separated from nav by a `border-t border-white/10`. Same padding as nav items.

Data source: The auth session store already holds the admin's email. Full name comes from the JWT claims or a new `admin.getProfile` procedure.

### 1.3 Session Timer

Add a subtle session expiry indicator in the sidebar footer, below the admin identity:

- Displays "Session: Xh Ym remaining" in small muted text.
- Calculated from session creation time (available from Supabase session `created_at`) against the 4-hour max (NFR9).
- **< 15 minutes remaining:** Text turns amber, font-weight semi-bold.
- **Expired:** AuthGuard already handles redirect to `/login`. No additional behavior needed.
- Implementation: A `SessionTimer` component using `setInterval` (60s tick) to update the countdown. Reads session from the Zustand auth store.

---

## 2. User Management

### 2.1 User List Page

**Route:** `/users`
**File:** `apps/admin-portal/src/app/users/page.tsx` (new)

A paginated table of all staff users in the organization.

**Columns:**

| Column | Content | Behavior |
|--------|---------|----------|
| Name | Full name | Clickable → `/users/[userId]` |
| Email | Account email | Plain text |
| Role | e.g. "CLINICIAN (OPD Lite)" | Role name with module in parentheses |
| Status | ACTIVE / SUSPENDED / PENDING_INVITE | Color-coded badge: green / red / amber |
| MFA | Enrolled / Not Enrolled | Amber warning icon if not enrolled |
| Last Login | Relative timestamp | "3 hours ago", "Never" for PENDING_INVITE |
| Actions | Context actions | Edit (→ detail page), Suspend/Reactivate toggle, Resend Invite (PENDING_INVITE only) |

**Filters (top bar):**
- Role dropdown: All / CLINICIAN / PHARMACIST / LAB_TECH / ADMIN
- Status dropdown: All / Active / Suspended / Pending Invite
- Text search: filters on name and email (client-side for <100 users, server-side if paginated)

**Pagination:** 20 users per page. Previous/Next controls. Total count displayed.

**Top-right CTA:** "Create User" pill button (brand-lime) → `/users/create`.

**Empty state:** Rounded card with text: "No staff users yet. Create your first user to grant access to your subscribed modules." with a "Create User" CTA.

**Data source:** New tRPC procedure `admin.listUsers`:
- Input: `{ page: number, pageSize: number, roleFilter?: string, statusFilter?: string, search?: string }`
- Output: `{ users: User[], totalCount: number }`
- User shape: `{ id, name, email, role, moduleCode, moduleName, status, mfaEnrolled, lastLoginAt, createdAt }`
- Authorization: ADMIN role only, scoped to admin's org via RLS.

### 2.2 User Creation — Complete the Existing Flow

**File:** `apps/admin-portal/src/app/users/create/page.tsx` (modify existing)

The form, role selector, and validation logic already exist. Changes:

**A. Wire the submit handler (replace TODO at line 70):**

The `handleSubmit` function currently validates the role and shows a "not yet implemented" message. Replace with:

```
1. Call `admin.createUser` with { name, email, role }
2. On success → show confirmation state
3. On error → show error message
```

**B. New tRPC procedure `admin.createUser`:**
- Creates a Supabase Auth user with a secure random temporary password (never sent to client)
- Links user to org with selected role
- Sets status to `PENDING_INVITE`
- Triggers invitation email (see 2.2.C)
- Emits audit event: `STAFF_USER_CREATED` with `{ userId, role, invitedBy }`
- Returns: `{ userId, name, email, role, status }`

**C. Invitation email:**

The Hub API sends an email containing:
- Subject: "You've been invited to [Org Name] on Ultranos"
- Body: Welcome message, the module they've been granted access to, a password-set link (Supabase `generateLink` API for `signup` or `recovery` type), and the name of the admin who invited them.
- If email transport is not yet configured at the Hub API layer, the procedure logs the email payload as a structured log entry and returns a `emailSent: false` flag. The UI shows: "User created. Email delivery is not configured — share the setup link manually: [link]."

**D. Success state (replace lines 191-194):**

On successful creation, show:
- Confirmation card: "User created successfully"
- Summary: name, email, role
- If email sent: "An invitation email has been sent to [email]."
- If email not sent: "Email delivery is not configured. Share this setup link manually:" with a copyable URL.
- Two CTAs: "Create Another User" (resets form) and "View All Users" (→ `/users`)

**E. Cancel button fix:**

The "Cancel" link at line 205 already points to `/users`. Once the list page (2.1) exists, this resolves naturally.

### 2.3 User Detail & Edit Page

**Route:** `/users/[userId]`
**File:** `apps/admin-portal/src/app/users/[userId]/page.tsx` (new)

Reached by clicking a user's name in the list or from the Actions column.

**Layout:** Two sections in a single page.

**Section A — User Profile (read + edit):**

- **Name:** Editable text field.
- **Email:** Read-only (email changes require the user themselves via Supabase auth).
- **Role:** Editable via the same role selector from the create page (subscription-gated). Changing role emits `STAFF_USER_ROLE_CHANGED` audit event with `{ userId, oldRole, newRole, changedBy }`.
- **Status:** Read-only badge. Changed via action buttons below.
- **Module:** Read-only, derived from role.
- **Created:** Date the user was created.
- **Last Login:** Relative timestamp or "Never."
- **MFA Status:** "Enrolled" (green) with enrollment date, or "Not Enrolled" (amber warning).

"Save Changes" button, disabled until a field is dirty. Calls `admin.updateUser` with `{ userId, name?, role? }`.

**Section B — Actions:**

| Action | Visibility | Behavior |
|--------|-----------|----------|
| **Suspend User** | ACTIVE or PENDING_INVITE users | Opens inline confirmation with required reason field. Calls `admin.suspendUser({ userId, reason })`. Emits `STAFF_USER_SUSPENDED`. Status → SUSPENDED. User immediately loses access (AuthGuard checks user status on every route). |
| **Reactivate User** | SUSPENDED users only | Calls `admin.reactivateUser({ userId })`. Emits `STAFF_USER_REACTIVATED`. Status → ACTIVE. If user's required module is not subscribed, show error: "Cannot reactivate — [Module] subscription is not active." |
| **Resend Invitation** | PENDING_INVITE users only | Re-triggers the invitation email from 2.2.C. Shows confirmation toast. |
| **Reset Password** | ACTIVE users only | Triggers Supabase password reset email to the user's address. Emits `STAFF_USER_PASSWORD_RESET`. Shows confirmation: "Password reset email sent to [email]." |

**No delete action.** Users are suspended, never deleted. This preserves audit trail integrity — audit events reference user IDs and must remain resolvable.

**Back navigation:** "← Back to Users" link at top → `/users`.

### 2.4 Subscription-Linked User Suspension UI

The existing design (Story 27.7) specifies that when a module is removed, users with roles requiring that module transition to SUSPENDED at billing period end. This behavior has no UI surface currently.

**Add to the user list page (`/users`):**

- When suspended-by-module-cancellation users exist, show a banner above the table:
  - "X user(s) were suspended when [Module Name] was cancelled on [date]. Subscribe to [Module] to reactivate them."
  - "Resubscribe" link → `/subscriptions`
- These users show a distinct status badge variant: "Suspended (module cancelled)" instead of just "Suspended" — uses the same red badge but with italic text to distinguish from manual suspensions.

**Add to the RemoveModuleDialog (`apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`):**

- Before the existing cancellation warning, add: "X active user(s) with [Role] roles will be suspended when this module's billing period ends on [date]."
- Data source: `subscription.removeModule` response should include `affectedUserCount`.

---

## 3. Organization Settings

### 3.1 Settings Page Restructure

**File:** `apps/admin-portal/src/app/settings/page.tsx` (modify existing)

Replace the single FIDO2 section with a multi-section layout:

**Section nav (sticky, top of page):**
Three anchor links styled as pills: "My Account" | "Organization" | "Notifications". Active pill uses brand-lime background. Clicking scrolls to the corresponding section with `scroll-margin-top` for the sticky nav.

Each section is a separate `rounded-3xl bg-white border border-border` card, consistent with existing card styling.

### 3.2 My Account Section

**Profile subsection:**
- **Full Name:** Editable text field. Saved via `admin.updateAdminProfile({ name })`.
- **Email:** Editable text field. Changing email triggers Supabase email re-verification flow (`auth.updateUser({ email })`). Show warning: "You will need to verify your new email address before the change takes effect."
- **Role:** Read-only. Displays "ADMIN".
- **Account created:** Read-only date.

**Change Password subsection:**
- Fields: Current password, New password, Confirm new password.
- Client-side validation: minimum 12 characters, must not match current.
- Flow: First re-authenticates the admin by calling `supabase.auth.signInWithPassword()` with the current email + current password. If that succeeds, calls `supabase.auth.updateUser({ password: newPassword })` to set the new password. If re-authentication fails, shows "Current password is incorrect." This is a client-side flow — no custom tRPC procedure needed (remove `admin.changePassword` from the procedures table).
- Emits audit event: `ADMIN_PASSWORD_CHANGED` (via `reportAdminAuthEvent`, same pattern as MFA events).
- Success message: "Password changed successfully."

**Security Keys (FIDO2) subsection:**
- Existing functionality from current settings page, moved under this heading.
- No behavioral changes. Same enroll/unenroll/list flow.

**Active Sessions subsection:**
- Table showing active sessions for the current admin:
  - Columns: Device/Browser (parsed from user-agent), Last Active (relative timestamp), IP Address
  - Current session row highlighted with "(this session)" label
  - "Revoke" button on each row except current session
  - "Revoke All Other Sessions" button below the table if >1 session exists
- Revoke calls `admin.revokeSession({ sessionId })`. Emits `ADMIN_SESSION_REVOKED`.
- Data source: New `admin.listSessions` procedure. If Supabase does not expose per-session listing, this section is replaced with a single "Sign Out All Other Sessions" button that calls `supabase.auth.signOut({ scope: 'others' })`.

### 3.3 Organization Section

All fields loaded via existing `subscription.getOrgSubscriptions` (which returns org info) or a new `admin.getOrganization` procedure.

- **Organization Name:** Editable text field. Min 2 chars, max 100 chars.
- **Country:** Dropdown. Same 22-country list as registration (`OrgDetailsStep.tsx`). Changing country updates the timezone suggestion (see below).
- **Billing Email:** Editable email field. This is the address for future invoice delivery (Epic B). Separate from the admin's personal email.
- **Timezone:** Dropdown of IANA timezones filtered to MENA & Central Asia regions:
  - `Asia/Kabul`, `Asia/Baghdad`, `Asia/Tehran`, `Asia/Karachi`, `Asia/Riyadh`, `Asia/Dubai`, `Asia/Amman`, `Asia/Beirut`, `Asia/Damascus`, `Asia/Gaza`, `Asia/Aden`, `Asia/Muscat`, `Asia/Bahrain`, `Asia/Qatar`, `Asia/Kuwait`, `Africa/Cairo`, `Asia/Bishkek`, `Asia/Tashkent`, `Asia/Dushanbe`, `Asia/Ashgabat`, `Asia/Almaty`
  - Default: auto-selected based on country (e.g., Iraq → `Asia/Baghdad`).
  - Stored on org record as `timezone` field.
  - Used by: SLA countdown calculations (business days in org's local timezone), alert timestamps display, report period boundaries, dashboard "Recent" window calculations.
- **Org ID:** Read-only, displayed as monospace text. Useful for support tickets.

"Save Changes" button at bottom of section. Disabled until a field is dirty. Single API call: `admin.updateOrganization({ name?, country?, billingEmail?, timezone? })`. Emits `ORG_SETTINGS_UPDATED` audit event with changed fields listed.

### 3.4 Notifications Section

Notification preferences that control which events trigger an email to the admin. Stored as a JSON preferences object on the admin's user record.

| Setting | Control Type | Options | Default |
|---------|-------------|---------|---------|
| KYC SLA breach alerts | Toggle | On / Off | On |
| License expiry warnings | Multi-checkbox | 60 days / 30 days / 7 days before | All checked |
| Prescribing anomaly alerts | Radio | On HIGH severity only / On all / Off | HIGH only |
| Audit chain integrity failure | Toggle | On / Off | On |
| Trial expiry reminders | Multi-checkbox | 7 days / 3 days / 1 day before | All checked |

"Save Preferences" button. Calls `admin.updateNotificationPreferences({ preferences })`.

Footer note: "Notifications are sent to your account email (admin@example.com). To change the delivery address, update your email in My Account above."

**Important:** This section stores preferences only. The actual email-sending logic lives in the Hub API (notification service) and reads these preferences when deciding whether to send. If the notification service does not exist yet, these preferences are still stored — they become active once the service is wired.

---

## 4. Dashboard Enrichment

### 4.1 Stat Cards — Add Urgency Context

**File:** `apps/admin-portal/src/app/dashboard/page.tsx` (modify existing)

Extend the 4 existing stat cards with sub-labels:

| Card | Current | Sub-label Added | Visual Cue |
|------|---------|-----------------|------------|
| Pending KYC Reviews | Raw count | "X breaching SLA" | Sub-label in red text. Card gets `border-2 border-red-500` if breached count > 0. |
| Pending Lab Approvals | Raw count | "oldest: Xd ago" | Sub-label in amber if oldest > 7 days. |
| Active Alerts | Raw count | "X HIGH severity" | Sub-label in red text if HIGH count > 0. |
| Recent Audit Events | Raw count, not clickable | Chain status: "Healthy" or "Broken" | Make card clickable → `/audit`. Sub-label green for Healthy, red for Broken. |

**Data source:** Extend `admin.dashboardStats` response to include:
```typescript
{
  pendingKycReviews: number
  slaBreachedKycCount: number        // NEW
  pendingLabApprovals: number
  oldestPendingLabDays: number       // NEW
  activeAlerts: number
  highSeverityAlertCount: number     // NEW
  recentAuditEvents: number
  auditChainHealthy: boolean         // NEW
}
```

### 4.2 Subscription Status Widget

**New component:** `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx`

A horizontal card spanning the full width below the stat cards row.

**States:**

| Org Status | Display |
|------------|---------|
| **TRIAL** | "Free Trial — X days remaining" with a progress bar. Bar color: green (>7d), amber (3-7d), red (<3d). Right-aligned CTA: "Set Up Billing" pill button → `/subscriptions`. |
| **ACTIVE** | "Active Subscription — X modules, $Y.YY/mo". Shows next renewal date. No CTA. |
| **SUSPENDED** | Red background card: "Subscription Suspended — Update your billing to restore access." CTA: "Manage Subscription" → `/subscriptions`. |
| **CANCELLED** | Neutral card: "Subscription Cancelled — Access ends [date]." CTA: "Resubscribe" → `/subscriptions`. |

Data source: Reuse `subscription.getOrgSubscriptions` (already called on `/subscriptions` page). Cache in React Query to avoid duplicate fetches if admin navigates between pages.

### 4.3 User Summary Widget

**New component:** `apps/admin-portal/src/components/dashboard/UserSummaryWidget.tsx`

Card displayed in a two-column row alongside the subscription widget (subscription left, users right).

Content:
- **Total staff users** — large number.
- Breakdown text: "X active, Y suspended, Z pending invite"
- **MFA warning:** If any active users lack MFA: amber text "X user(s) without MFA" with a shield-warning icon.
- Entire card clickable → `/users`.

Data source: New field in `admin.dashboardStats`:
```typescript
{
  // ... existing fields
  userCounts: {
    total: number
    active: number
    suspended: number
    pendingInvite: number
    withoutMfa: number    // count of ACTIVE users with no MFA enrolled
  }
}
```

### 4.4 Recent Activity Feed

**New component:** `apps/admin-portal/src/components/dashboard/RecentActivityFeed.tsx`

A compact list below the widget row showing the last 10 admin-initiated actions.

**Entry format:**
```
[Action icon] [Description] — [relative time]
```

**Action types and descriptions (examples):**

| Audit Event Type | Feed Description |
|------------------|------------------|
| `KYC_APPROVED` | "Approved KYC for [provider role title]" |
| `KYC_REJECTED` | "Rejected KYC for [provider role title]" |
| `LAB_APPROVED` | "Approved lab [lab name]" |
| `LAB_SUSPENDED` | "Suspended lab [lab name]" |
| `STAFF_USER_CREATED` | "Created [role] user [email]" |
| `STAFF_USER_SUSPENDED` | "Suspended user [email]" |
| `ANOMALY_DISMISSED` | "Dismissed prescribing alert #[id]" |
| `ANOMALY_ESCALATED` | "Escalated prescribing alert #[id]" |
| `MODULE_ADDED` | "Added module [module name]" |
| `MODULE_REMOVED` | "Removed module [module name]" |
| `ORG_SETTINGS_UPDATED` | "Updated organization settings" |

**PHI safety:** Descriptions use role titles, lab names, emails, and alert IDs — never patient names, diagnoses, or clinical data. The feed shows admin operational actions, not clinical data access.

**Data source:** New tRPC procedure `admin.recentActivity`:
- Input: `{ limit: number }` (default 10)
- Output: `{ activities: { type: string, description: string, timestamp: string }[] }`
- Queries audit events filtered to: admin-initiated action types for the current org, ordered by timestamp desc, limit 10.
- Authorization: ADMIN role, scoped to org.

**Layout:** Compact list inside a `rounded-3xl` card. Each entry is a single line with a small icon (color-coded by category: green for approvals, red for suspensions, blue for user actions, neutral for settings). "View All →" link at bottom → `/audit`.

### 4.5 Dashboard Layout

```
Row 1: 4 stat cards (existing, enriched) — grid-cols-4
Row 2: Subscription widget (2/3 width) + User summary (1/3 width)
Row 3: Recent activity feed (full width)
```

Responsive: On tablet (< lg), Row 1 becomes 2x2 grid. Row 2 stacks vertically. Feed remains full width.

---

## New tRPC Procedures Summary

All procedures are ADMIN-role-only, scoped to the admin's organization via RLS.

| Procedure | Type | Purpose |
|-----------|------|---------|
| `admin.listUsers` | query | Paginated user list with filters |
| `admin.getUser` | query | Single user detail by ID |
| `admin.createUser` | mutation | Create Supabase Auth user, assign role, send invite |
| `admin.updateUser` | mutation | Update name, role |
| `admin.suspendUser` | mutation | Set status SUSPENDED with reason |
| `admin.reactivateUser` | mutation | Set status ACTIVE (validates module subscription) |
| `admin.resendInvitation` | mutation | Re-trigger invitation email for PENDING_INVITE users |
| `admin.resetUserPassword` | mutation | Trigger Supabase password reset email |
| `admin.getProfile` | query | Current admin's profile (name, email, createdAt) |
| `admin.updateAdminProfile` | mutation | Update admin's name, email |
| ~~`admin.changePassword`~~ | — | Not needed — handled client-side via Supabase re-auth + `updateUser` |
| `admin.listSessions` | query | Active sessions for current admin |
| `admin.revokeSession` | mutation | Revoke a specific session |
| `admin.getOrganization` | query | Full org details including timezone |
| `admin.updateOrganization` | mutation | Update org name, country, billing email, timezone |
| `admin.getNotificationPreferences` | query | Current notification settings |
| `admin.updateNotificationPreferences` | mutation | Save notification preferences |
| `admin.recentActivity` | query | Last N admin-initiated audit events |
| `admin.dashboardStats` | query | **Extended** with urgency counts and user summary |

---

## Database Changes

### New columns on `organizations` table:
- `timezone TEXT NOT NULL DEFAULT 'UTC'` — IANA timezone identifier

### New columns on `user_profiles` table (or equivalent):
- `status TEXT NOT NULL DEFAULT 'ACTIVE'` — enum: ACTIVE, SUSPENDED, PENDING_INVITE
- `suspension_reason TEXT` — nullable, populated on suspend
- `suspended_by TEXT` — nullable, references admin user ID
- `suspended_at TIMESTAMPTZ` — nullable
- `invited_by TEXT` — references admin user ID who created the user
- `last_login_at TIMESTAMPTZ` — nullable, updated on successful auth

### New table: `notification_preferences`
- `admin_user_id TEXT PRIMARY KEY REFERENCES auth.users(id)`
- `preferences JSONB NOT NULL DEFAULT '{}'::jsonb`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

All schema changes applied via Supabase MCP migration tools per CLAUDE.md.

---

## Audit Events

All new admin actions emit structured audit events via `@ultranos/audit-logger`:

| Event Type | Payload |
|------------|---------|
| `STAFF_USER_CREATED` | `{ userId, role, invitedBy }` |
| `STAFF_USER_ROLE_CHANGED` | `{ userId, oldRole, newRole, changedBy }` |
| `STAFF_USER_SUSPENDED` | `{ userId, reason, suspendedBy }` |
| `STAFF_USER_REACTIVATED` | `{ userId, reactivatedBy }` |
| `STAFF_USER_PASSWORD_RESET` | `{ userId, triggeredBy }` |
| `ADMIN_PASSWORD_CHANGED` | `{ adminId }` |
| `ADMIN_SESSION_REVOKED` | `{ adminId, sessionId }` |
| `ORG_SETTINGS_UPDATED` | `{ changedFields: string[], changedBy }` |

No PHI in any audit event payload — only user IDs, roles, and action metadata.

---

## Out of Scope

The following are explicitly NOT part of this epic:

- **Payment method management, invoices, trial-to-paid conversion** → Epic B
- **Audit log event browsing, filtering, export** → Epic B
- **Data export (CSV/PDF) across tables** → Epic B
- **Failed payment / dunning UI** → Epic B
- **Provider unified profile and search** → Epic C
- **Alert escalation workflow and configurable thresholds** → Epic C
- **Module-specific settings (OPD Lite defaults, Pharmacy rules, etc.)** → Epic C
- **Notification email sending implementation** → Hub API concern; this epic stores preferences only
- **Multi-admin RBAC** → Scale-stage
- **Internationalization of admin portal** → Scale-stage
- **Dark mode** → Scale-stage

---

## Files Changed (Admin Portal App)

### Modified:
- `apps/admin-portal/src/components/Sidebar.tsx` — Add Users, Subscriptions nav items; add footer with user menu, sign-out, session timer
- `apps/admin-portal/src/app/settings/page.tsx` — Restructure into My Account / Organization / Notifications sections
- `apps/admin-portal/src/app/dashboard/page.tsx` — Add urgency sub-labels, widget row, activity feed
- `apps/admin-portal/src/app/users/create/page.tsx` — Wire submit handler, success state, cancel link
- `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx` — Add affected user count warning

### New:
- `apps/admin-portal/src/app/users/page.tsx` — User list page
- `apps/admin-portal/src/app/users/[userId]/page.tsx` — User detail/edit page
- `apps/admin-portal/src/components/SessionTimer.tsx` — Session countdown component
- `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx` — Trial/active/suspended status card
- `apps/admin-portal/src/components/dashboard/UserSummaryWidget.tsx` — User count card with MFA warning
- `apps/admin-portal/src/components/dashboard/RecentActivityFeed.tsx` — Last 10 admin actions feed
- `apps/admin-portal/src/components/settings/NotificationPreferences.tsx` — Notification toggle/checkbox UI

### Hub API:
- `apps/hub-api/src/trpc/routers/admin.ts` — Add 15 new procedures (see procedures table above), extend `dashboardStats`
- Database migration for new columns and `notification_preferences` table
