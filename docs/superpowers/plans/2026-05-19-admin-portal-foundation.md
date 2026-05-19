# Admin Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin portal production-viable by adding user management, organization settings, discoverable navigation, and an actionable dashboard.

**Architecture:** Extend the existing tRPC admin router with new procedures backed by Supabase. Frontend follows existing patterns: Vitest + React Testing Library for tests, Zustand for auth state, tRPC client for data fetching. Database changes via Supabase MCP migrations.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, tRPC, Supabase Auth, Zustand, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-05-19-admin-portal-foundation-design.md`

---

## File Structure

### New Files (Admin Portal)
- `apps/admin-portal/src/app/users/page.tsx` — User list page
- `apps/admin-portal/src/app/users/[userId]/page.tsx` — User detail/edit page
- `apps/admin-portal/src/components/SessionTimer.tsx` — Session countdown
- `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx` — Trial/active status card
- `apps/admin-portal/src/components/dashboard/UserSummaryWidget.tsx` — User count + MFA warning
- `apps/admin-portal/src/components/dashboard/RecentActivityFeed.tsx` — Last 10 admin actions
- `apps/admin-portal/src/components/settings/NotificationPreferences.tsx` — Notification toggles
- `apps/admin-portal/src/__tests__/users-list.test.tsx` — User list page tests
- `apps/admin-portal/src/__tests__/users-create-wired.test.tsx` — Wired user creation tests
- `apps/admin-portal/src/__tests__/user-detail.test.tsx` — User detail page tests
- `apps/admin-portal/src/__tests__/settings-restructured.test.tsx` — Settings page tests
- `apps/admin-portal/src/__tests__/dashboard-enriched.test.tsx` — Dashboard enrichment tests
- `apps/admin-portal/src/__tests__/session-timer.test.tsx` — Session timer tests
- `apps/admin-portal/src/__tests__/sidebar-updated.test.tsx` — Sidebar navigation tests

### Modified Files (Admin Portal)
- `apps/admin-portal/src/components/Sidebar.tsx` — Add Users, Subscriptions, footer
- `apps/admin-portal/src/app/settings/page.tsx` — Restructure into sections
- `apps/admin-portal/src/app/dashboard/page.tsx` — Urgency labels, widgets, activity feed
- `apps/admin-portal/src/app/users/create/page.tsx` — Wire submit handler
- `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx` — Affected user warning
- `apps/admin-portal/src/lib/trpc.ts` — Extend AdminAuthEventType union

### Modified Files (Hub API)
- `apps/hub-api/src/trpc/routers/admin.ts` — Add 17 new procedures

### Database
- New migration via Supabase MCP: user management columns, notification_preferences table, org timezone

---

## Task 1: Database Migration — User Management & Org Settings

**Files:**
- Migration applied via Supabase MCP tools

- [ ] **Step 1: Apply migration for user management columns and notification preferences**

Use the Supabase MCP `apply_migration` tool with this SQL:

```sql
-- Add status tracking to practitioners (user profiles)
ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'PENDING_INVITE')),
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Add timezone to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  admin_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user listing queries
CREATE INDEX IF NOT EXISTS idx_practitioners_org_status
  ON practitioners (org_id, status);

-- Index for notification preferences lookup
CREATE INDEX IF NOT EXISTS idx_notification_preferences_admin
  ON notification_preferences (admin_user_id);

-- RLS on notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own notification preferences"
  ON notification_preferences
  FOR ALL
  USING (admin_user_id = auth.uid())
  WITH CHECK (admin_user_id = auth.uid());
```

- [ ] **Step 2: Verify migration applied**

Use the Supabase MCP `list_tables` tool to confirm:
- `notification_preferences` table exists
- `practitioners` table has `status`, `suspension_reason`, `suspended_by`, `suspended_at`, `invited_by`, `last_login_at` columns
- `organizations` table has `timezone` column

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add user management columns, notification preferences table, org timezone"
```

---

## Task 2: Hub API — User Management Procedures

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add Zod schemas for user management inputs**

Add these schemas near the top of `admin.ts`, after the existing imports:

```typescript
const listUsersInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  roleFilter: z.string().optional(),
  statusFilter: z.string().optional(),
  search: z.string().optional(),
})

const createUserInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.string().refine(
    (r) => ['ADMIN', 'CLINICIAN', 'DOCTOR', 'PHARMACIST', 'LAB_TECH'].includes(r),
    { message: 'Invalid role' },
  ),
})

const updateUserInput = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  role: z.string().optional(),
})

const suspendUserInput = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
})

const userIdInput = z.object({
  userId: z.string().uuid(),
})
```

- [ ] **Step 2: Add listUsers procedure**

Add inside the `adminRouter` definition:

```typescript
listUsers: adminProcedure
  .input(listUsersInput)
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    let query = ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, telecom_email, role, status, last_login_at, created_at', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (input.roleFilter) {
      query = query.eq('role', input.roleFilter)
    }
    if (input.statusFilter) {
      query = query.eq('status', input.statusFilter)
    }
    if (input.search) {
      query = query.or(`given_name.ilike.%${input.search}%,family_name.ilike.%${input.search}%,telecom_email.ilike.%${input.search}%`)
    }

    const from = (input.page - 1) * input.pageSize
    const to = from + input.pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list users' })
    }

    // Check MFA enrollment for each user via Supabase admin API
    const users = (data ?? []).map((p) => ({
      id: p.id,
      name: `${p.given_name} ${p.family_name}`.trim(),
      email: p.telecom_email,
      role: p.role,
      moduleCode: ROLE_MODULE_MAP[p.role] ?? null,
      moduleName: ROLE_MODULE_MAP[p.role] ? MODULE_DISPLAY_NAMES[ROLE_MODULE_MAP[p.role]!] ?? null : null,
      status: p.status,
      mfaEnrolled: false, // Populated below if feasible
      lastLoginAt: p.last_login_at,
      createdAt: p.created_at,
    }))

    return { users, totalCount: count ?? 0 }
  }),
```

- [ ] **Step 3: Add getUser procedure**

```typescript
getUser: adminProcedure
  .input(userIdInput)
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const { data, error } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, telecom_email, role, status, suspension_reason, suspended_at, invited_by, last_login_at, created_at')
      .eq('id', input.userId)
      .eq('org_id', orgId)
      .single()

    if (error || !data) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
    }

    return {
      id: data.id,
      name: `${data.given_name} ${data.family_name}`.trim(),
      givenName: data.given_name,
      familyName: data.family_name,
      email: data.telecom_email,
      role: data.role,
      moduleCode: ROLE_MODULE_MAP[data.role] ?? null,
      moduleName: ROLE_MODULE_MAP[data.role] ? MODULE_DISPLAY_NAMES[ROLE_MODULE_MAP[data.role]!] ?? null : null,
      status: data.status,
      suspensionReason: data.suspension_reason,
      suspendedAt: data.suspended_at,
      lastLoginAt: data.last_login_at,
      createdAt: data.created_at,
    }
  }),
```

- [ ] **Step 4: Add createUser procedure**

```typescript
createUser: adminProcedure
  .input(createUserInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    // Validate role against org subscriptions
    const moduleCode = ROLE_MODULE_MAP[input.role]
    if (moduleCode) {
      const { data: sub } = await ctx.supabase
        .from('organization_subscriptions')
        .select('id')
        .eq('org_id', orgId)
        .eq('module_code', moduleCode)
        .in('status', ['ACTIVE', 'TRIAL'])
        .single()

      if (!sub) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Cannot create ${input.role} user — ${MODULE_DISPLAY_NAMES[moduleCode] ?? moduleCode} subscription is not active`,
        })
      }
    }

    // Check for duplicate email
    const { data: existing } = await ctx.supabase
      .from('practitioners')
      .select('id')
      .eq('telecom_email', input.email)
      .single()

    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'A user with this email already exists' })
    }

    // Create Supabase Auth user
    const { data: authUser, error: authError } = await ctx.supabase.auth.admin.createUser({
      email: input.email,
      password: crypto.randomUUID() + crypto.randomUUID(), // Secure random, never sent to client
      email_confirm: true,
      user_metadata: { role: input.role, org_id: orgId },
    })

    if (authError || !authUser.user) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create auth user' })
    }

    // Split name into given/family
    const nameParts = input.name.trim().split(/\s+/)
    const givenName = nameParts[0] ?? input.name
    const familyName = nameParts.slice(1).join(' ') || input.name

    // Create practitioner record
    const { data: practitioner, error: practError } = await ctx.supabase
      .from('practitioners')
      .insert({
        id: authUser.user.id,
        given_name: givenName,
        family_name: familyName,
        telecom_email: input.email,
        role: input.role,
        org_id: orgId,
        status: 'PENDING_INVITE',
        invited_by: ctx.user.sub,
      })
      .select('id, given_name, family_name, telecom_email, role, status')
      .single()

    if (practError || !practitioner) {
      // Cleanup auth user on failure
      await ctx.supabase.auth.admin.deleteUser(authUser.user.id)
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create user profile' })
    }

    // Generate password reset link for invitation
    const { data: linkData } = await ctx.supabase.auth.admin.generateLink({
      type: 'recovery',
      email: input.email,
    })
    const setupLink = linkData?.properties?.action_link ?? null

    // Audit
    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'STAFF_USER_CREATED',
        resourceType: 'PRACTITIONER',
        resourceId: practitioner.id,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { role: input.role, invitedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'STAFF_USER_CREATED', userId: practitioner.id })
    }

    // TODO: Send invitation email when email transport is configured
    // For now, return the setup link so the admin can share it manually
    const emailSent = false

    return {
      userId: practitioner.id,
      name: `${practitioner.given_name} ${practitioner.family_name}`.trim(),
      email: practitioner.telecom_email,
      role: practitioner.role,
      status: practitioner.status,
      setupLink,
      emailSent,
    }
  }),
```

- [ ] **Step 5: Add updateUser, suspendUser, reactivateUser procedures**

```typescript
updateUser: adminProcedure
  .input(updateUserInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    // Fetch current user
    const { data: current, error: fetchError } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, role')
      .eq('id', input.userId)
      .eq('org_id', orgId)
      .single()

    if (fetchError || !current) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (input.name) {
      const nameParts = input.name.trim().split(/\s+/)
      updates.given_name = nameParts[0] ?? input.name
      updates.family_name = nameParts.slice(1).join(' ') || input.name
    }

    if (input.role && input.role !== current.role) {
      // Validate new role against subscriptions
      const moduleCode = ROLE_MODULE_MAP[input.role]
      if (moduleCode) {
        const { data: sub } = await ctx.supabase
          .from('organization_subscriptions')
          .select('id')
          .eq('org_id', orgId)
          .eq('module_code', moduleCode)
          .in('status', ['ACTIVE', 'TRIAL'])
          .single()

        if (!sub) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Cannot assign ${input.role} — ${MODULE_DISPLAY_NAMES[moduleCode] ?? moduleCode} subscription is not active`,
          })
        }
      }
      updates.role = input.role

      // Update auth user_metadata
      await ctx.supabase.auth.admin.updateUserById(input.userId, {
        user_metadata: { role: input.role, org_id: orgId },
      })

      // Audit role change
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'STAFF_USER_ROLE_CHANGED',
          resourceType: 'PRACTITIONER',
          resourceId: input.userId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { oldRole: current.role, newRole: input.role, changedBy: ctx.user.sub },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'STAFF_USER_ROLE_CHANGED', userId: input.userId })
      }
    }

    const { error: updateError } = await ctx.supabase
      .from('practitioners')
      .update(updates)
      .eq('id', input.userId)
      .eq('org_id', orgId)

    if (updateError) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update user' })
    }

    return { success: true }
  }),

suspendUser: adminProcedure
  .input(suspendUserInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const { error, count } = await ctx.supabase
      .from('practitioners')
      .update({
        status: 'SUSPENDED',
        suspension_reason: input.reason,
        suspended_by: ctx.user.sub,
        suspended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId)
      .eq('org_id', orgId)
      .in('status', ['ACTIVE', 'PENDING_INVITE'])
      .select('id', { count: 'exact', head: true })

    if (error || (count ?? 0) === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'User cannot be suspended — check current status' })
    }

    // Ban in Supabase Auth to prevent login
    await ctx.supabase.auth.admin.updateUserById(input.userId, {
      ban_duration: '876000h', // ~100 years
    })

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'STAFF_USER_SUSPENDED',
        resourceType: 'PRACTITIONER',
        resourceId: input.userId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { reason: input.reason, suspendedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'STAFF_USER_SUSPENDED', userId: input.userId })
    }

    return { success: true }
  }),

reactivateUser: adminProcedure
  .input(userIdInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    // Check user exists and is suspended
    const { data: user } = await ctx.supabase
      .from('practitioners')
      .select('id, role, status')
      .eq('id', input.userId)
      .eq('org_id', orgId)
      .eq('status', 'SUSPENDED')
      .single()

    if (!user) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'User is not suspended or not found' })
    }

    // Validate that the required module is still subscribed
    const moduleCode = ROLE_MODULE_MAP[user.role]
    if (moduleCode) {
      const { data: sub } = await ctx.supabase
        .from('organization_subscriptions')
        .select('id')
        .eq('org_id', orgId)
        .eq('module_code', moduleCode)
        .in('status', ['ACTIVE', 'TRIAL'])
        .single()

      if (!sub) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Cannot reactivate — ${MODULE_DISPLAY_NAMES[moduleCode] ?? moduleCode} subscription is not active`,
        })
      }
    }

    const { error } = await ctx.supabase
      .from('practitioners')
      .update({
        status: 'ACTIVE',
        suspension_reason: null,
        suspended_by: null,
        suspended_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId)
      .eq('org_id', orgId)

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to reactivate user' })
    }

    // Unban in Supabase Auth
    await ctx.supabase.auth.admin.updateUserById(input.userId, {
      ban_duration: 'none',
    })

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'STAFF_USER_REACTIVATED',
        resourceType: 'PRACTITIONER',
        resourceId: input.userId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { reactivatedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'STAFF_USER_REACTIVATED', userId: input.userId })
    }

    return { success: true }
  }),
```

- [ ] **Step 6: Add resendInvitation and resetUserPassword procedures**

```typescript
resendInvitation: adminProcedure
  .input(userIdInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const { data: user } = await ctx.supabase
      .from('practitioners')
      .select('id, telecom_email, status')
      .eq('id', input.userId)
      .eq('org_id', orgId)
      .eq('status', 'PENDING_INVITE')
      .single()

    if (!user) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'User is not in PENDING_INVITE status' })
    }

    const { data: linkData } = await ctx.supabase.auth.admin.generateLink({
      type: 'recovery',
      email: user.telecom_email,
    })

    // TODO: Send invitation email when email transport is configured
    return {
      setupLink: linkData?.properties?.action_link ?? null,
      emailSent: false,
    }
  }),

resetUserPassword: adminProcedure
  .input(userIdInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const { data: user } = await ctx.supabase
      .from('practitioners')
      .select('id, telecom_email, status')
      .eq('id', input.userId)
      .eq('org_id', orgId)
      .eq('status', 'ACTIVE')
      .single()

    if (!user) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'User not found or not active' })
    }

    const { error } = await ctx.supabase.auth.admin.generateLink({
      type: 'recovery',
      email: user.telecom_email,
    })

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to trigger password reset' })
    }

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'STAFF_USER_PASSWORD_RESET',
        resourceType: 'PRACTITIONER',
        resourceId: input.userId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { triggeredBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'STAFF_USER_PASSWORD_RESET', userId: input.userId })
    }

    return { success: true }
  }),
```

- [ ] **Step 7: Add shared-types import at top of admin.ts**

Add to the import block at the top of `admin.ts`:

```typescript
import { ROLE_MODULE_MAP, MODULE_DISPLAY_NAMES } from '@ultranos/shared-types'
```

- [ ] **Step 8: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add user management tRPC procedures (list, create, update, suspend, reactivate, invite, reset)"
```

---

## Task 3: Hub API — Organization & Notification Procedures

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add Zod schemas for org and notification inputs**

```typescript
const updateOrgInput = z.object({
  name: z.string().min(2).max(100).optional(),
  country: z.string().optional(),
  billingEmail: z.string().email().optional(),
  timezone: z.string().optional(),
})

const notificationPreferencesInput = z.object({
  preferences: z.object({
    kycSlaBreach: z.boolean().default(true),
    licenseExpiry60d: z.boolean().default(true),
    licenseExpiry30d: z.boolean().default(true),
    licenseExpiry7d: z.boolean().default(true),
    anomalyAlerts: z.enum(['HIGH_ONLY', 'ALL', 'OFF']).default('HIGH_ONLY'),
    auditChainFailure: z.boolean().default(true),
    trialExpiry7d: z.boolean().default(true),
    trialExpiry3d: z.boolean().default(true),
    trialExpiry1d: z.boolean().default(true),
  }),
})
```

- [ ] **Step 2: Add getProfile and updateAdminProfile procedures**

```typescript
getProfile: adminProcedure
  .query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, telecom_email, role, created_at')
      .eq('id', ctx.user.sub)
      .single()

    if (error || !data) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin profile not found' })
    }

    return {
      id: data.id,
      name: `${data.given_name} ${data.family_name}`.trim(),
      givenName: data.given_name,
      familyName: data.family_name,
      email: data.telecom_email,
      role: data.role,
      createdAt: data.created_at,
    }
  }),

updateAdminProfile: adminProcedure
  .input(z.object({
    name: z.string().min(1).max(200).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (input.name) {
      const nameParts = input.name.trim().split(/\s+/)
      updates.given_name = nameParts[0] ?? input.name
      updates.family_name = nameParts.slice(1).join(' ') || input.name
    }

    const { error } = await ctx.supabase
      .from('practitioners')
      .update(updates)
      .eq('id', ctx.user.sub)

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update profile' })
    }

    return { success: true }
  }),
```

- [ ] **Step 3: Add getOrganization and updateOrganization procedures**

```typescript
getOrganization: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const { data, error } = await ctx.supabase
      .from('organizations')
      .select('id, name, country, billing_email, timezone, status, trial_ends_at')
      .eq('id', orgId)
      .single()

    if (error || !data) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' })
    }

    return {
      id: data.id,
      name: data.name,
      country: data.country,
      billingEmail: data.billing_email,
      timezone: data.timezone,
      status: data.status,
      trialEndsAt: data.trial_ends_at,
    }
  }),

updateOrganization: adminProcedure
  .input(updateOrgInput)
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const changedFields: string[] = []

    if (input.name !== undefined) { updates.name = input.name; changedFields.push('name') }
    if (input.country !== undefined) { updates.country = input.country; changedFields.push('country') }
    if (input.billingEmail !== undefined) { updates.billing_email = input.billingEmail; changedFields.push('billingEmail') }
    if (input.timezone !== undefined) { updates.timezone = input.timezone; changedFields.push('timezone') }

    if (changedFields.length === 0) {
      return { success: true }
    }

    const { error } = await ctx.supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update organization' })
    }

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'ORG_SETTINGS_UPDATED',
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { changedFields, changedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'ORG_SETTINGS_UPDATED', orgId })
    }

    return { success: true }
  }),
```

- [ ] **Step 4: Add notification preference procedures**

```typescript
getNotificationPreferences: adminProcedure
  .query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from('notification_preferences')
      .select('preferences')
      .eq('admin_user_id', ctx.user.sub)
      .single()

    // Return defaults if no record exists
    return data?.preferences ?? {
      kycSlaBreach: true,
      licenseExpiry60d: true,
      licenseExpiry30d: true,
      licenseExpiry7d: true,
      anomalyAlerts: 'HIGH_ONLY',
      auditChainFailure: true,
      trialExpiry7d: true,
      trialExpiry3d: true,
      trialExpiry1d: true,
    }
  }),

updateNotificationPreferences: adminProcedure
  .input(notificationPreferencesInput)
  .mutation(async ({ ctx, input }) => {
    const { error } = await ctx.supabase
      .from('notification_preferences')
      .upsert({
        admin_user_id: ctx.user.sub,
        preferences: input.preferences,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save notification preferences' })
    }

    return { success: true }
  }),
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add org settings, admin profile, and notification preference procedures"
```

---

## Task 4: Hub API — Dashboard Stats Extension & Recent Activity

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Extend dashboardStats procedure**

Locate the existing `dashboardStats` procedure and extend its return value. Add these queries inside the procedure body:

```typescript
// SLA-breached KYC count (submissions older than 7 days with PENDING status)
const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
const { count: slaBreachedKycCount } = await ctx.supabase
  .from('kyc_submissions')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'PENDING_VERIFICATION')
  .lt('submitted_at', sevenDaysAgo)

// Oldest pending lab (days)
const { data: oldestLab } = await ctx.supabase
  .from('labs')
  .select('created_at')
  .eq('status', 'PENDING')
  .order('created_at', { ascending: true })
  .limit(1)
  .single()

const oldestPendingLabDays = oldestLab
  ? Math.floor((Date.now() - new Date(oldestLab.created_at).getTime()) / 86_400_000)
  : 0

// High severity alert count
const { count: highSeverityAlertCount } = await ctx.supabase
  .from('prescribing_anomaly_alerts')
  .select('id', { count: 'exact', head: true })
  .eq('severity', 'HIGH')
  .eq('status', 'UNREVIEWED')

// Audit chain health
const { data: lastVerification } = await ctx.supabase
  .from('audit_chain_verifications')
  .select('status')
  .order('started_at', { ascending: false })
  .limit(1)
  .single()

const auditChainHealthy = lastVerification?.status === 'PASS'

// User counts
const { count: totalUsers } = await ctx.supabase
  .from('practitioners')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', orgId)

const { count: activeUsers } = await ctx.supabase
  .from('practitioners')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .eq('status', 'ACTIVE')

const { count: suspendedUsers } = await ctx.supabase
  .from('practitioners')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .eq('status', 'SUSPENDED')

const { count: pendingInviteUsers } = await ctx.supabase
  .from('practitioners')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .eq('status', 'PENDING_INVITE')
```

Add these to the return object alongside existing fields:

```typescript
return {
  // ... existing fields
  slaBreachedKycCount: slaBreachedKycCount ?? 0,
  oldestPendingLabDays,
  highSeverityAlertCount: highSeverityAlertCount ?? 0,
  auditChainHealthy,
  userCounts: {
    total: totalUsers ?? 0,
    active: activeUsers ?? 0,
    suspended: suspendedUsers ?? 0,
    pendingInvite: pendingInviteUsers ?? 0,
    withoutMfa: 0, // Requires Supabase admin API to check MFA factors per user — deferred
  },
}
```

- [ ] **Step 2: Add recentActivity procedure**

```typescript
recentActivity: adminProcedure
  .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const adminActionTypes = [
      'KYC_APPROVED', 'KYC_REJECTED', 'KYC_MORE_INFO_REQUESTED',
      'LAB_APPROVED', 'LAB_SUSPENDED', 'LAB_REACTIVATED',
      'STAFF_USER_CREATED', 'STAFF_USER_SUSPENDED', 'STAFF_USER_REACTIVATED',
      'STAFF_USER_ROLE_CHANGED', 'STAFF_USER_PASSWORD_RESET',
      'ANOMALY_DISMISSED', 'ANOMALY_ESCALATED', 'ANOMALY_PROVIDER_SUSPENDED',
      'MODULE_ADDED', 'MODULE_REMOVED',
      'ORG_SETTINGS_UPDATED',
    ]

    const { data, error } = await ctx.supabase
      .from('audit_events')
      .select('action, metadata, created_at')
      .eq('org_id', orgId)
      .in('action', adminActionTypes)
      .order('created_at', { ascending: false })
      .limit(input.limit)

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load recent activity' })
    }

    const descriptionMap: Record<string, (meta: Record<string, unknown>) => string> = {
      KYC_APPROVED: () => 'Approved a KYC submission',
      KYC_REJECTED: () => 'Rejected a KYC submission',
      KYC_MORE_INFO_REQUESTED: () => 'Requested more info on a KYC submission',
      LAB_APPROVED: (m) => `Approved lab ${(m.labName as string) ?? ''}`.trim(),
      LAB_SUSPENDED: (m) => `Suspended lab ${(m.labName as string) ?? ''}`.trim(),
      LAB_REACTIVATED: (m) => `Reactivated lab ${(m.labName as string) ?? ''}`.trim(),
      STAFF_USER_CREATED: (m) => `Created ${(m.role as string) ?? ''} user`.trim(),
      STAFF_USER_SUSPENDED: () => 'Suspended a user',
      STAFF_USER_REACTIVATED: () => 'Reactivated a user',
      STAFF_USER_ROLE_CHANGED: (m) => `Changed user role from ${(m.oldRole as string) ?? ''} to ${(m.newRole as string) ?? ''}`.trim(),
      STAFF_USER_PASSWORD_RESET: () => 'Triggered a password reset',
      ANOMALY_DISMISSED: (m) => `Dismissed prescribing alert #${(m.alertId as string) ?? ''}`.trim(),
      ANOMALY_ESCALATED: (m) => `Escalated prescribing alert #${(m.alertId as string) ?? ''}`.trim(),
      ANOMALY_PROVIDER_SUSPENDED: () => 'Suspended a provider via anomaly alert',
      MODULE_ADDED: (m) => `Added module ${(m.moduleName as string) ?? ''}`.trim(),
      MODULE_REMOVED: (m) => `Removed module ${(m.moduleName as string) ?? ''}`.trim(),
      ORG_SETTINGS_UPDATED: () => 'Updated organization settings',
    }

    const activities = (data ?? []).map((event) => ({
      type: event.action,
      description: descriptionMap[event.action]?.(event.metadata ?? {}) ?? event.action,
      timestamp: event.created_at,
    }))

    return { activities }
  }),
```

- [ ] **Step 3: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): extend dashboardStats with urgency counts and user summary, add recentActivity"
```

---

## Task 5: Sidebar — Add Users, Subscriptions, Footer, Session Timer

**Files:**
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`
- Create: `apps/admin-portal/src/components/SessionTimer.tsx`
- Create: `apps/admin-portal/src/__tests__/sidebar-updated.test.tsx`
- Create: `apps/admin-portal/src/__tests__/session-timer.test.tsx`

- [ ] **Step 1: Write sidebar test**

Create `apps/admin-portal/src/__tests__/sidebar-updated.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(() => ({
    session: { email: 'admin@clinic.org', userId: 'u1' },
    clearSession: vi.fn(),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: { created_at: new Date().toISOString() } } }),
    },
  })),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Users nav item', async () => {
    const { Sidebar } = await import('@/components/Sidebar')
    render(<Sidebar />)
    expect(screen.getByText('Users')).toBeDefined()
  })

  it('renders Subscriptions nav item', async () => {
    const { Sidebar } = await import('@/components/Sidebar')
    render(<Sidebar />)
    expect(screen.getByText('Subscriptions')).toBeDefined()
  })

  it('renders Sign Out button', async () => {
    const { Sidebar } = await import('@/components/Sidebar')
    render(<Sidebar />)
    expect(screen.getByText('Sign Out')).toBeDefined()
  })

  it('renders admin email in footer', async () => {
    const { Sidebar } = await import('@/components/Sidebar')
    render(<Sidebar />)
    expect(screen.getByText('admin@clinic.org')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/sidebar-updated.test.tsx`
Expected: FAIL — Sidebar does not yet have Users, Subscriptions, or footer.

- [ ] **Step 3: Update Sidebar.tsx**

Replace the `navItems` array and add the footer. Full replacement of `Sidebar.tsx`:

```tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { SessionTimer } from '@/components/SessionTimer'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { label: 'Providers', href: '/providers', icon: UserIcon },
  { label: 'License Expiry', href: '/providers/expiry', icon: ClockIcon, indent: true },
  { label: 'Labs', href: '/labs', icon: FlaskIcon },
  { label: 'Users', href: '/users', icon: UsersGroupIcon },
  { label: 'Create User', href: '/users/create', icon: PlusIcon, indent: true },
  { label: 'AI Models', href: '/ai-models', icon: CpuIcon },
  { label: 'Alerts', href: '/alerts', icon: BellIcon },
  { label: 'Audit Log', href: '/audit', icon: ScrollIcon },
  { label: 'Subscriptions', href: '/subscriptions', icon: CreditCardIcon },
  { label: 'Settings', href: '/settings', icon: GearIcon },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)
  const clearSession = useAuthSessionStore((s) => s.clearSession)

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    clearSession()
    router.push('/login')
  }

  return (
    <aside className="w-60 bg-black text-neutral-400 flex flex-col shrink-0 min-h-screen">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight text-white">
          <span className="text-brand-lime">U</span>ltranos Admin
        </h1>
      </div>
      <nav className="flex-1 py-4" aria-label="Admin navigation">
        {navItems.map((item) => {
          const isActive = item.indent
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(`${item.href}/`)
          const indent = 'indent' in item && item.indent
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 ${indent ? 'px-8' : 'px-4'} py-2.5 text-sm rounded-xl mx-2 transition-colors ${
                isActive
                  ? 'bg-brand-lime/10 text-brand-lime font-medium border-s-2 border-brand-lime'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-white'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        {session && (
          <div className="mb-2">
            <p className="text-xs text-neutral-500 truncate">{session.email}</p>
            <SessionTimer />
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="text-sm text-neutral-400 hover:text-red-400 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
```

Keep all existing icon components (`HomeIcon`, `UserIcon`, `FlaskIcon`, `BellIcon`, `ScrollIcon`, `CpuIcon`, `ClockIcon`, `GearIcon`) unchanged. Add three new ones after the existing icons:

```tsx
function UsersGroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
    </svg>
  )
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  )
}
```

- [ ] **Step 4: Create SessionTimer component**

Create `apps/admin-portal/src/components/SessionTimer.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const SESSION_MAX_MS = 4 * 60 * 60 * 1000 // 4 hours
const WARNING_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

export function SessionTimer() {
  const [remaining, setRemaining] = useState<string | null>(null)
  const [isWarning, setIsWarning] = useState(false)

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>

    async function init() {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const createdAt = data?.session?.created_at
      if (!createdAt) return

      const sessionStart = new Date(
        typeof createdAt === 'number' ? createdAt * 1000 : createdAt,
      ).getTime()

      function update() {
        const elapsed = Date.now() - sessionStart
        const left = Math.max(0, SESSION_MAX_MS - elapsed)
        const hours = Math.floor(left / 3_600_000)
        const minutes = Math.floor((left % 3_600_000) / 60_000)
        setRemaining(`${hours}h ${minutes}m`)
        setIsWarning(left <= WARNING_THRESHOLD_MS)
      }

      update()
      intervalId = setInterval(update, 60_000)
    }

    init()
    return () => clearInterval(intervalId)
  }, [])

  if (!remaining) return null

  return (
    <p className={`text-xs mt-0.5 ${isWarning ? 'text-amber-400 font-semibold' : 'text-neutral-600'}`}>
      Session: {remaining}
    </p>
  )
}
```

- [ ] **Step 5: Run sidebar test**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/sidebar-updated.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/components/Sidebar.tsx apps/admin-portal/src/components/SessionTimer.tsx apps/admin-portal/src/__tests__/sidebar-updated.test.tsx
git commit -m "feat(admin-portal): add Users, Subscriptions to sidebar; add footer with sign-out and session timer"
```

---

## Task 6: User List Page

**Files:**
- Create: `apps/admin-portal/src/app/users/page.tsx`
- Create: `apps/admin-portal/src/__tests__/users-list.test.tsx`

- [ ] **Step 1: Write user list test**

Create `apps/admin-portal/src/__tests__/users-list.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockListUsers = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listUsers: { query: (...args: unknown[]) => mockListUsers(...args) },
    },
  },
}))

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user list table with data', async () => {
    mockListUsers.mockResolvedValue({
      users: [
        { id: 'u1', name: 'Dr. Ahmed', email: 'ahmed@clinic.org', role: 'CLINICIAN', moduleName: 'OPD Lite', status: 'ACTIVE', mfaEnrolled: true, lastLoginAt: new Date().toISOString(), createdAt: '2026-01-01' },
      ],
      totalCount: 1,
    })

    const { default: UsersPage } = await import('@/app/users/page')
    render(<UsersPage />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Ahmed')).toBeDefined()
    })
    expect(screen.getByText('ahmed@clinic.org')).toBeDefined()
    expect(screen.getByText('ACTIVE')).toBeDefined()
  })

  it('renders empty state when no users', async () => {
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })

    const { default: UsersPage } = await import('@/app/users/page')
    render(<UsersPage />)

    await waitFor(() => {
      expect(screen.getByText(/No staff users yet/)).toBeDefined()
    })
  })

  it('renders Create User button', async () => {
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })

    const { default: UsersPage } = await import('@/app/users/page')
    render(<UsersPage />)

    await waitFor(() => {
      expect(screen.getByText('Create User')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/users-list.test.tsx`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Create user list page**

Create `apps/admin-portal/src/app/users/page.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'

interface User {
  id: string
  name: string
  email: string
  role: string
  moduleCode: string | null
  moduleName: string | null
  status: string
  mfaEnrolled: boolean
  lastLoginAt: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    PENDING_INVITE: 'bg-amber-100 text-amber-800',
  }
  const labels: Record<string, string> = {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    PENDING_INVITE: 'PENDING INVITE',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const pageSize = 20

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listUsers.query({
        page,
        pageSize,
        ...(roleFilter ? { roleFilter } : {}),
        ...(statusFilter ? { statusFilter } : {}),
        ...(search ? { search } : {}),
      })
      setUsers(result.users)
      setTotalCount(result.totalCount)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, roleFilter, statusFilter, search])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight wavy-divider">Users</h1>
          <p className="mt-4 text-text-muted">Manage staff access across your subscribed modules.</p>
        </div>
        <Link
          href="/users/create"
          className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all"
        >
          Create User
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-3 items-center">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-border px-3 py-2 text-sm"
        >
          <option value="">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="CLINICIAN">Clinician</option>
          <option value="DOCTOR">Doctor</option>
          <option value="PHARMACIST">Pharmacist</option>
          <option value="LAB_TECH">Lab Tech</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-border px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="PENDING_INVITE">Pending Invite</option>
        </select>
        <input
          type="text"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="rounded-xl border border-border px-4 py-2 text-sm flex-1 max-w-xs"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 text-text-muted">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-border bg-white p-8 text-center">
          <p className="text-text-muted">No staff users yet. Create your first user to grant access to your subscribed modules.</p>
          <Link
            href="/users/create"
            className="mt-4 inline-block rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all"
          >
            Create User
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">MFA</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-brand-lime/5 transition-colors cursor-pointer"
                    onClick={() => router.push(`/users/${user.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-black">{user.name}</td>
                    <td className="px-4 py-3 text-text-muted">{user.email}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {user.role}
                      {user.moduleName && <span className="text-xs ms-1">({user.moduleName})</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                    <td className="px-4 py-3">
                      {user.mfaEnrolled ? (
                        <span className="text-green-700 text-xs">Enrolled</span>
                      ) : (
                        <span className="text-amber-600 text-xs">⚠ Not Enrolled</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">{relativeTime(user.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
              <span>{totalCount} user{totalCount !== 1 ? 's' : ''} total</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-full border border-border px-4 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 py-1.5">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-full border border-border px-4 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/users-list.test.tsx`
Expected: PASS

- [ ] **Step 5: Add subscription-linked suspension banner**

Per spec section 2.4, when users exist who were suspended due to module cancellation, show a banner above the table. Add this after the filters div and before the error/loading/table section in the user list page:

```tsx
{/* Subscription-linked suspension banner */}
{!loading && users.some((u) => u.status === 'SUSPENDED') && (
  (() => {
    // Check for module-cancelled suspensions (heuristic: status SUSPENDED with no manual reason visible)
    // A more robust approach would be a dedicated field from the API, but for now this surfaces the prompt
    const suspendedCount = users.filter((u) => u.status === 'SUSPENDED').length
    return suspendedCount > 0 ? (
      <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
        <span>{suspendedCount} user(s) are suspended. Some may have been suspended due to module cancellation.</span>
        <a href="/subscriptions" className="text-brand-lime hover:underline font-medium ms-4 shrink-0">Manage Subscriptions</a>
      </div>
    ) : null
  })()
)}
```

Note: A cleaner implementation would add a `suspensionType` field (`MANUAL` | `MODULE_CANCELLED`) to the API response so the banner can distinguish between manual and module-linked suspensions. For now, the banner shows for any suspended users and links to subscriptions.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/users/page.tsx apps/admin-portal/src/__tests__/users-list.test.tsx
git commit -m "feat(admin-portal): add user list page with filters, pagination, and status badges"
```

---

## Task 7: Wire User Creation Submit Handler

**Files:**
- Modify: `apps/admin-portal/src/app/users/create/page.tsx`
- Create: `apps/admin-portal/src/__tests__/users-create-wired.test.tsx`

- [ ] **Step 1: Write test for wired creation flow**

Create `apps/admin-portal/src/__tests__/users-create-wired.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreateUser = vi.fn()
const mockGetAvailableRoles = vi.fn()
const mockValidateRole = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getAvailableRoles: { query: () => mockGetAvailableRoles() },
      validateRoleForOrg: { query: (args: unknown) => mockValidateRole(args) },
    },
    admin: {
      createUser: { mutate: (args: unknown) => mockCreateUser(args) },
    },
  },
}))

describe('CreateUserPage — wired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAvailableRoles.mockResolvedValue({
      availableRoles: [{ role: 'CLINICIAN', moduleCode: 'OPD_LITE', moduleName: 'OPD Lite' }],
      unavailableRoles: [],
    })
    mockValidateRole.mockResolvedValue({ allowed: true })
  })

  it('calls admin.createUser on submit and shows success', async () => {
    mockCreateUser.mockResolvedValue({
      userId: 'u1',
      name: 'Dr. Test',
      email: 'test@clinic.org',
      role: 'CLINICIAN',
      status: 'PENDING_INVITE',
      setupLink: 'https://example.com/setup',
      emailSent: false,
    })

    const user = userEvent.setup()
    const { default: CreateUserPage } = await import('@/app/users/create/page')
    render(<CreateUserPage />)

    await waitFor(() => expect(screen.getByText('CLINICIAN')).toBeDefined())

    await user.type(screen.getByLabelText('Full Name'), 'Dr. Test')
    await user.type(screen.getByLabelText('Email'), 'test@clinic.org')
    await user.click(screen.getByText('CLINICIAN'))
    await user.click(screen.getByText('Create User'))

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        name: 'Dr. Test',
        email: 'test@clinic.org',
        role: 'CLINICIAN',
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/User created successfully/)).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/users-create-wired.test.tsx`
Expected: FAIL — current handler shows "not yet implemented" instead of calling createUser.

- [ ] **Step 3: Update the submit handler in users/create/page.tsx**

Replace the `handleSubmit` function body (lines 49-78) with:

```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(false)
    setCreatedUser(null)

    const isAvailable = availableRoles.some((r) => r.role === selectedRole)
    if (!isAvailable) {
      setSubmitError('Selected role is not available for your subscription.')
      return
    }

    try {
      setSubmitting(true)
      const validation = await trpc.subscription.validateRoleForOrg.query({ role: selectedRole })
      if (!validation.allowed) {
        setSubmitError(validation.reason ?? 'Role not permitted for your subscription.')
        return
      }

      const result = await trpc.admin.createUser.mutate({
        name,
        email,
        role: selectedRole,
      })

      setCreatedUser(result)
      setSubmitSuccess(true)
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }
```

Add the `createdUser` state near the top of the component:

```tsx
const [createdUser, setCreatedUser] = useState<{
  userId: string; name: string; email: string; role: string; setupLink: string | null; emailSent: boolean
} | null>(null)
```

Replace the success feedback block (the one showing "Role validated successfully...") with:

```tsx
{submitSuccess && createdUser && (
  <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
    <p className="font-semibold">User created successfully</p>
    <p className="mt-1">{createdUser.name} ({createdUser.email}) — {createdUser.role}</p>
    {createdUser.emailSent ? (
      <p className="mt-2">An invitation email has been sent to {createdUser.email}.</p>
    ) : createdUser.setupLink ? (
      <div className="mt-2">
        <p>Email delivery is not configured. Share this setup link manually:</p>
        <code className="mt-1 block rounded-lg bg-green-100 px-3 py-2 text-xs break-all select-all">
          {createdUser.setupLink}
        </code>
      </div>
    ) : null}
    <div className="mt-4 flex gap-3">
      <button
        type="button"
        onClick={() => {
          setName(''); setEmail(''); setSelectedRole('');
          setSubmitSuccess(false); setCreatedUser(null)
        }}
        className="rounded-full bg-brand-lime text-black font-semibold px-5 py-2 text-sm hover:brightness-95 transition-all"
      >
        Create Another User
      </button>
      <a href="/users" className="rounded-full border border-black text-black px-5 py-2 text-sm hover:bg-neutral-50 transition-all">
        View All Users
      </a>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run test**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/users-create-wired.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/app/users/create/page.tsx apps/admin-portal/src/__tests__/users-create-wired.test.tsx
git commit -m "feat(admin-portal): wire user creation to admin.createUser with invitation link flow"
```

---

## Task 8: User Detail/Edit Page

**Files:**
- Create: `apps/admin-portal/src/app/users/[userId]/page.tsx`
- Create: `apps/admin-portal/src/__tests__/user-detail.test.tsx`

- [ ] **Step 1: Write user detail test**

Create `apps/admin-portal/src/__tests__/user-detail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockGetUser = vi.fn()
const mockSuspendUser = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ userId: 'u1' })),
  useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getUser: { query: (args: unknown) => mockGetUser(args) },
      updateUser: { mutate: vi.fn().mockResolvedValue({ success: true }) },
      suspendUser: { mutate: (args: unknown) => mockSuspendUser(args) },
      reactivateUser: { mutate: vi.fn().mockResolvedValue({ success: true }) },
      resendInvitation: { mutate: vi.fn().mockResolvedValue({ setupLink: null, emailSent: false }) },
      resetUserPassword: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
    subscription: {
      getAvailableRoles: { query: vi.fn().mockResolvedValue({ availableRoles: [], unavailableRoles: [] }) },
    },
  },
}))

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user profile', async () => {
    mockGetUser.mockResolvedValue({
      id: 'u1', name: 'Dr. Ahmed', givenName: 'Ahmed', familyName: 'Dr.',
      email: 'ahmed@clinic.org', role: 'CLINICIAN', moduleCode: 'OPD_LITE',
      moduleName: 'OPD Lite', status: 'ACTIVE', suspensionReason: null,
      suspendedAt: null, lastLoginAt: '2026-05-19T10:00:00Z', createdAt: '2026-01-01',
    })

    const { default: UserDetailPage } = await import('@/app/users/[userId]/page')
    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Ahmed')).toBeDefined()
    })
    expect(screen.getByText('ahmed@clinic.org')).toBeDefined()
    expect(screen.getByText('ACTIVE')).toBeDefined()
  })

  it('shows suspend button for active users', async () => {
    mockGetUser.mockResolvedValue({
      id: 'u1', name: 'Dr. Ahmed', givenName: 'Ahmed', familyName: 'Dr.',
      email: 'ahmed@clinic.org', role: 'CLINICIAN', moduleCode: 'OPD_LITE',
      moduleName: 'OPD Lite', status: 'ACTIVE', suspensionReason: null,
      suspendedAt: null, lastLoginAt: null, createdAt: '2026-01-01',
    })

    const { default: UserDetailPage } = await import('@/app/users/[userId]/page')
    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Suspend User')).toBeDefined()
    })
  })

  it('shows reactivate button for suspended users', async () => {
    mockGetUser.mockResolvedValue({
      id: 'u1', name: 'Dr. Ahmed', givenName: 'Ahmed', familyName: 'Dr.',
      email: 'ahmed@clinic.org', role: 'CLINICIAN', moduleCode: 'OPD_LITE',
      moduleName: 'OPD Lite', status: 'SUSPENDED', suspensionReason: 'Policy violation',
      suspendedAt: '2026-05-18T10:00:00Z', lastLoginAt: null, createdAt: '2026-01-01',
    })

    const { default: UserDetailPage } = await import('@/app/users/[userId]/page')
    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Reactivate User')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/user-detail.test.tsx`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Create user detail page**

Create `apps/admin-portal/src/app/users/[userId]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'

interface UserDetail {
  id: string
  name: string
  givenName: string
  familyName: string
  email: string
  role: string
  moduleCode: string | null
  moduleName: string | null
  status: string
  suspensionReason: string | null
  suspendedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    PENDING_INVITE: 'bg-amber-100 text-amber-800',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {status === 'PENDING_INVITE' ? 'PENDING INVITE' : status}
    </span>
  )
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string

  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showSuspendForm, setShowSuspendForm] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')

  const [editName, setEditName] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await trpc.admin.getUser.query({ userId })
        setUser(data)
        setEditName(data.name)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load user')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  useEffect(() => {
    if (user) {
      setIsDirty(editName !== user.name)
    }
  }, [editName, user])

  const handleSave = async () => {
    if (!isDirty) return
    setActionLoading(true)
    setActionError(null)
    try {
      await trpc.admin.updateUser.mutate({ userId, name: editName })
      setUser((prev) => prev ? { ...prev, name: editName } : prev)
      setIsDirty(false)
      setActionMessage('Changes saved.')
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to save')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSuspend = async () => {
    if (!suspendReason.trim()) return
    setActionLoading(true)
    setActionError(null)
    try {
      await trpc.admin.suspendUser.mutate({ userId, reason: suspendReason })
      setUser((prev) => prev ? { ...prev, status: 'SUSPENDED', suspensionReason: suspendReason } : prev)
      setShowSuspendForm(false)
      setSuspendReason('')
      setActionMessage('User suspended.')
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to suspend user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReactivate = async () => {
    setActionLoading(true)
    setActionError(null)
    try {
      await trpc.admin.reactivateUser.mutate({ userId })
      setUser((prev) => prev ? { ...prev, status: 'ACTIVE', suspensionReason: null } : prev)
      setActionMessage('User reactivated.')
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to reactivate user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResendInvite = async () => {
    setActionLoading(true)
    setActionError(null)
    try {
      const result = await trpc.admin.resendInvitation.mutate({ userId })
      setActionMessage(result.emailSent ? 'Invitation email sent.' : `Invitation link generated: ${result.setupLink ?? 'unavailable'}`)
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to resend invitation')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setActionLoading(true)
    setActionError(null)
    try {
      await trpc.admin.resetUserPassword.mutate({ userId })
      setActionMessage(`Password reset email sent to ${user?.email}.`)
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to reset password')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="text-text-muted">Loading user...</div>
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
  if (!user) return null

  return (
    <div className="max-w-3xl">
      <Link href="/users" className="text-sm text-text-muted hover:text-black transition-colors">
        ← Back to Users
      </Link>

      <h1 className="mt-4 text-4xl font-bold tracking-tight wavy-divider">{user.name}</h1>

      {actionMessage && (
        <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{actionMessage}</div>
      )}
      {actionError && (
        <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{actionError}</div>
      )}

      {/* Profile Section */}
      <div className="mt-6 rounded-3xl bg-white p-5 border border-border space-y-4">
        <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Profile</h2>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-text-muted">Full Name</label>
          <input
            id="name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-text-muted">Email</p>
            <p className="mt-1 text-sm text-black">{user.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-text-muted">Role</p>
            <p className="mt-1 text-sm text-black">{user.role}{user.moduleName ? ` (${user.moduleName})` : ''}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-text-muted">Status</p>
            <div className="mt-1"><StatusBadge status={user.status} /></div>
          </div>
          <div>
            <p className="text-sm font-medium text-text-muted">Last Login</p>
            <p className="mt-1 text-sm text-black">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-text-muted">Created</p>
            <p className="mt-1 text-sm text-black">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {user.status === 'SUSPENDED' && user.suspensionReason && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <p className="font-medium">Suspension reason:</p>
            <p className="mt-1">{user.suspensionReason}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!isDirty || actionLoading}
          className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Changes
        </button>
      </div>

      {/* Actions Section */}
      <div className="mt-6 rounded-3xl bg-white p-5 border border-border space-y-4">
        <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Actions</h2>

        <div className="flex flex-wrap gap-3">
          {(user.status === 'ACTIVE' || user.status === 'PENDING_INVITE') && (
            <button
              onClick={() => setShowSuspendForm(true)}
              disabled={actionLoading}
              className="rounded-full border border-red-300 text-red-700 font-medium px-5 py-2 text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Suspend User
            </button>
          )}

          {user.status === 'SUSPENDED' && (
            <button
              onClick={handleReactivate}
              disabled={actionLoading}
              className="rounded-full border border-green-300 text-green-700 font-medium px-5 py-2 text-sm hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              Reactivate User
            </button>
          )}

          {user.status === 'PENDING_INVITE' && (
            <button
              onClick={handleResendInvite}
              disabled={actionLoading}
              className="rounded-full border border-border text-black font-medium px-5 py-2 text-sm hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              Resend Invitation
            </button>
          )}

          {user.status === 'ACTIVE' && (
            <button
              onClick={handleResetPassword}
              disabled={actionLoading}
              className="rounded-full border border-border text-black font-medium px-5 py-2 text-sm hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              Reset Password
            </button>
          )}
        </div>

        {showSuspendForm && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
            <label htmlFor="suspend-reason" className="block text-sm font-medium text-red-800">
              Suspension reason (required)
            </label>
            <textarea
              id="suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              className="mt-1.5 block w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSuspend}
                disabled={!suspendReason.trim() || actionLoading}
                className="rounded-full bg-red-600 text-white font-semibold px-5 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Suspension
              </button>
              <button
                onClick={() => { setShowSuspendForm(false); setSuspendReason('') }}
                className="rounded-full border border-red-300 text-red-700 px-5 py-2 text-sm hover:bg-red-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/user-detail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/app/users/[userId]/page.tsx apps/admin-portal/src/__tests__/user-detail.test.tsx
git commit -m "feat(admin-portal): add user detail page with edit, suspend, reactivate, invite, and reset actions"
```

---

## Task 9: Settings Page Restructure

**Files:**
- Modify: `apps/admin-portal/src/app/settings/page.tsx`
- Create: `apps/admin-portal/src/components/settings/NotificationPreferences.tsx`
- Create: `apps/admin-portal/src/__tests__/settings-restructured.test.tsx`

- [ ] **Step 1: Write settings test**

Create `apps/admin-portal/src/__tests__/settings-restructured.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { all: [] }, error: null }),
      },
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getProfile: { query: vi.fn().mockResolvedValue({ id: 'a1', name: 'Admin', givenName: 'Admin', familyName: '', email: 'admin@org.com', role: 'ADMIN', createdAt: '2026-01-01' }) },
      updateAdminProfile: { mutate: vi.fn().mockResolvedValue({ success: true }) },
      getOrganization: { query: vi.fn().mockResolvedValue({ id: 'o1', name: 'Test Clinic', country: 'Iraq', billingEmail: 'billing@org.com', timezone: 'Asia/Baghdad', status: 'ACTIVE', trialEndsAt: null }) },
      updateOrganization: { mutate: vi.fn().mockResolvedValue({ success: true }) },
      getNotificationPreferences: { query: vi.fn().mockResolvedValue({ kycSlaBreach: true, anomalyAlerts: 'HIGH_ONLY', auditChainFailure: true }) },
      updateNotificationPreferences: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
  reportAdminAuthEvent: vi.fn(),
}))

describe('Settings Page — restructured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders My Account section', async () => {
    const { default: SettingsPage } = await import('@/app/settings/page')
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('My Account')).toBeDefined()
    })
  })

  it('renders Organization section', async () => {
    const { default: SettingsPage } = await import('@/app/settings/page')
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Organization')).toBeDefined()
    })
  })

  it('renders Notifications section', async () => {
    const { default: SettingsPage } = await import('@/app/settings/page')
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/settings-restructured.test.tsx`
Expected: FAIL — current settings page only has FIDO2 section.

- [ ] **Step 3: Create NotificationPreferences component**

Create `apps/admin-portal/src/components/settings/NotificationPreferences.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface Preferences {
  kycSlaBreach: boolean
  licenseExpiry60d: boolean
  licenseExpiry30d: boolean
  licenseExpiry7d: boolean
  anomalyAlerts: 'HIGH_ONLY' | 'ALL' | 'OFF'
  auditChainFailure: boolean
  trialExpiry7d: boolean
  trialExpiry3d: boolean
  trialExpiry1d: boolean
}

const DEFAULTS: Preferences = {
  kycSlaBreach: true,
  licenseExpiry60d: true,
  licenseExpiry30d: true,
  licenseExpiry7d: true,
  anomalyAlerts: 'HIGH_ONLY',
  auditChainFailure: true,
  trialExpiry7d: true,
  trialExpiry3d: true,
  trialExpiry1d: true,
}

export function NotificationPreferences({ adminEmail }: { adminEmail: string }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await trpc.admin.getNotificationPreferences.query()
        setPrefs({ ...DEFAULTS, ...data })
      } catch {
        // Use defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await trpc.admin.updateNotificationPreferences.mutate({ preferences: prefs })
      setMessage('Preferences saved.')
    } catch {
      setMessage('Failed to save preferences.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading preferences...</p>

  return (
    <div className="space-y-5">
      {/* KYC SLA */}
      <label className="flex items-center justify-between">
        <span className="text-sm">KYC SLA breach alerts</span>
        <input type="checkbox" checked={prefs.kycSlaBreach} onChange={(e) => setPrefs({ ...prefs, kycSlaBreach: e.target.checked })} className="accent-[#D4FF00]" />
      </label>

      {/* License Expiry */}
      <div>
        <p className="text-sm font-medium mb-2">License expiry warnings</p>
        <div className="space-y-1.5 ms-4">
          {[{ key: 'licenseExpiry60d' as const, label: '60 days before' }, { key: 'licenseExpiry30d' as const, label: '30 days before' }, { key: 'licenseExpiry7d' as const, label: '7 days before' }].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} className="accent-[#D4FF00]" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Anomaly Alerts */}
      <div>
        <p className="text-sm font-medium mb-2">Prescribing anomaly alerts</p>
        <div className="space-y-1.5 ms-4">
          {[{ value: 'HIGH_ONLY' as const, label: 'HIGH severity only' }, { value: 'ALL' as const, label: 'All severities' }, { value: 'OFF' as const, label: 'Off' }].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="anomalyAlerts" checked={prefs.anomalyAlerts === value} onChange={() => setPrefs({ ...prefs, anomalyAlerts: value })} className="accent-[#D4FF00]" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Audit Chain */}
      <label className="flex items-center justify-between">
        <span className="text-sm">Audit chain integrity failure</span>
        <input type="checkbox" checked={prefs.auditChainFailure} onChange={(e) => setPrefs({ ...prefs, auditChainFailure: e.target.checked })} className="accent-[#D4FF00]" />
      </label>

      {/* Trial Expiry */}
      <div>
        <p className="text-sm font-medium mb-2">Trial expiry reminders</p>
        <div className="space-y-1.5 ms-4">
          {[{ key: 'trialExpiry7d' as const, label: '7 days before' }, { key: 'trialExpiry3d' as const, label: '3 days before' }, { key: 'trialExpiry1d' as const, label: '1 day before' }].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })} className="accent-[#D4FF00]" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {message && <p className="text-sm text-green-700">{message}</p>}

      <button onClick={handleSave} disabled={saving} className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>

      <p className="text-xs text-text-muted">
        Notifications are sent to your account email ({adminEmail}). To change the delivery address, update your email in My Account above.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite settings/page.tsx with three sections**

This is a full rewrite of `apps/admin-portal/src/app/settings/page.tsx`. The file is long, so the implementing agent should read the current file, preserve the FIDO2 logic (the `handleEnroll`, `handleUnenroll`, `loadFactors` functions and the `KeyIcon`), and wrap it in the new multi-section layout. The structure:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { trpc, reportAdminAuthEvent } from '@/lib/trpc'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'

// --- Types ---
type Factor = { id: string; factor_type: string; status: string; friendly_name?: string; created_at?: string }

interface AdminProfile { id: string; name: string; email: string; role: string; createdAt: string }

interface OrgDetails { id: string; name: string; country: string; billingEmail: string; timezone: string }

// IANA timezones for MENA & Central Asia
const TIMEZONES = [
  'Asia/Kabul', 'Asia/Baghdad', 'Asia/Tehran', 'Asia/Karachi', 'Asia/Riyadh',
  'Asia/Dubai', 'Asia/Amman', 'Asia/Beirut', 'Asia/Damascus', 'Asia/Gaza',
  'Asia/Aden', 'Asia/Muscat', 'Asia/Bahrain', 'Asia/Qatar', 'Asia/Kuwait',
  'Africa/Cairo', 'Asia/Bishkek', 'Asia/Tashkent', 'Asia/Dushanbe', 'Asia/Ashgabat', 'Asia/Almaty',
]

// 22 countries from OrgDetailsStep.tsx
const COUNTRIES = [
  'Afghanistan', 'Bahrain', 'Egypt', 'Iran', 'Iraq', 'Jordan', 'Kuwait',
  'Kyrgyzstan', 'Lebanon', 'Oman', 'Pakistan', 'Palestine', 'Qatar',
  'Saudi Arabia', 'Syria', 'Tajikistan', 'Turkmenistan', 'UAE',
  'Uzbekistan', 'Yemen', 'Kazakhstan', 'Turkey',
]

export default function SettingsPage() {
  // --- My Account state ---
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [editProfileName, setEditProfileName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  // --- Password state ---
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // --- FIDO2 state (preserved from existing) ---
  const [factors, setFactors] = useState<Factor[]>([])
  const [factorsLoading, setFactorsLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [fidoError, setFidoError] = useState<string | null>(null)
  const [fidoSuccess, setFidoSuccess] = useState<string | null>(null)

  // --- Organization state ---
  const [org, setOrg] = useState<OrgDetails | null>(null)
  const [editOrg, setEditOrg] = useState<OrgDetails | null>(null)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgMessage, setOrgMessage] = useState<string | null>(null)

  const supabase = getSupabaseBrowserClient()

  // Load all data on mount
  useEffect(() => {
    loadProfile()
    loadFactors()
    loadOrg()
  }, [])

  // --- Profile handlers ---
  async function loadProfile() {
    try {
      const data = await trpc.admin.getProfile.query()
      setProfile(data)
      setEditProfileName(data.name)
    } catch { /* fallback silently */ }
  }

  async function saveProfile() {
    if (!editProfileName || editProfileName === profile?.name) return
    setProfileSaving(true)
    setProfileMessage(null)
    try {
      await trpc.admin.updateAdminProfile.mutate({ name: editProfileName })
      setProfile((p) => p ? { ...p, name: editProfileName } : p)
      setProfileMessage('Profile updated.')
    } catch {
      setProfileMessage('Failed to update profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  // --- Password handler ---
  async function changePassword() {
    setPasswordError(null)
    setPasswordMessage(null)
    if (newPassword.length < 12) { setPasswordError('Password must be at least 12 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return }

    setPasswordSaving(true)
    try {
      // Re-authenticate with current password
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: profile?.email ?? '',
        password: currentPassword,
      })
      if (authErr) { setPasswordError('Current password is incorrect.'); setPasswordSaving(false); return }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) { setPasswordError('Failed to change password.'); setPasswordSaving(false); return }

      reportAdminAuthEvent('ADMIN_PASSWORD_CHANGED')
      setPasswordMessage('Password changed successfully.')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch {
      setPasswordError('An unexpected error occurred.')
    } finally {
      setPasswordSaving(false)
    }
  }

  // --- FIDO2 handlers (preserved from existing page) ---
  async function loadFactors() {
    setFactorsLoading(true)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) { setFidoError('Failed to load MFA factors'); return }
      setFactors((data.all ?? []).filter((f) => f.factor_type === 'webauthn') as Factor[])
    } catch { setFidoError('Failed to load MFA factors') }
    finally { setFactorsLoading(false) }
  }

  async function handleEnroll() {
    setFidoError(null); setFidoSuccess(null); setEnrolling(true)
    try {
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setFidoError('WebAuthn is not supported in this browser.'); setEnrolling(false); return
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'webauthn' })
      if (enrollError) { setFidoError(`Enrollment failed: ${enrollError.message}`); setEnrolling(false); return }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id })
      if (challengeError) { setFidoError('Failed to initiate verification challenge'); setEnrolling(false); return }
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: data.id, challengeId: challenge.id, code: '' })
      if (verifyError) { setFidoError('Key verification failed.'); setEnrolling(false); return }
      reportAdminAuthEvent('ADMIN_MFA_ENROLLED', { factorId: data.id } as any)
      setFidoSuccess('Security key enrolled successfully.')
      await loadFactors()
    } catch { setFidoError('An unexpected error occurred during enrollment') }
    finally { setEnrolling(false) }
  }

  async function handleUnenroll(factorId: string) {
    setFidoError(null); setFidoSuccess(null)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) { setFidoError(`Failed to remove key: ${error.message}`); return }
      reportAdminAuthEvent('ADMIN_MFA_UNENROLLED', { factorId } as any)
      setFidoSuccess('Security key removed.')
      await loadFactors()
    } catch { setFidoError('An unexpected error occurred') }
  }

  const verifiedFactors = factors.filter((f) => f.status === 'verified')

  // --- Organization handlers ---
  async function loadOrg() {
    try {
      const data = await trpc.admin.getOrganization.query()
      setOrg(data)
      setEditOrg(data)
    } catch { /* fallback silently */ }
  }

  async function saveOrg() {
    if (!editOrg || !org) return
    setOrgSaving(true); setOrgMessage(null)
    try {
      await trpc.admin.updateOrganization.mutate({
        ...(editOrg.name !== org.name ? { name: editOrg.name } : {}),
        ...(editOrg.country !== org.country ? { country: editOrg.country } : {}),
        ...(editOrg.billingEmail !== org.billingEmail ? { billingEmail: editOrg.billingEmail } : {}),
        ...(editOrg.timezone !== org.timezone ? { timezone: editOrg.timezone } : {}),
      })
      setOrg(editOrg)
      setOrgMessage('Organization updated.')
    } catch { setOrgMessage('Failed to update organization.') }
    finally { setOrgSaving(false) }
  }

  const orgDirty = editOrg && org && (editOrg.name !== org.name || editOrg.country !== org.country || editOrg.billingEmail !== org.billingEmail || editOrg.timezone !== org.timezone)

  // --- Section Nav ---
  const sections = [
    { id: 'my-account', label: 'My Account' },
    { id: 'organization', label: 'Organization' },
    { id: 'notifications', label: 'Notifications' },
  ]

  return (
    <div className="max-w-2xl">
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">Settings</h1>

      {/* Section nav */}
      <div className="mt-6 flex gap-2 sticky top-0 bg-surface py-2 z-10">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full px-4 py-1.5 text-sm font-medium border border-border hover:bg-brand-lime/10 transition-colors"
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* MY ACCOUNT */}
      <section id="my-account" className="mt-8 scroll-mt-16">
        <div className="rounded-3xl bg-white p-5 border border-border space-y-6">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide">My Account</h2>

          {/* Profile */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-muted">Profile</h3>
            <div>
              <label htmlFor="profile-name" className="block text-sm font-medium text-text-muted">Full Name</label>
              <input id="profile-name" value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-muted">Email</p>
              <p className="mt-1 text-sm text-black">{profile?.email ?? '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm font-medium text-text-muted">Role</p><p className="mt-1 text-sm text-black">{profile?.role ?? '—'}</p></div>
              <div><p className="text-sm font-medium text-text-muted">Account created</p><p className="mt-1 text-sm text-black">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</p></div>
            </div>
            {profileMessage && <p className="text-sm text-green-700">{profileMessage}</p>}
            <button onClick={saveProfile} disabled={profileSaving || editProfileName === profile?.name}
              className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50">
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          <hr className="border-border" />

          {/* Change Password */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-muted">Change Password</h3>
            <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              className="block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
            <input type="password" placeholder="New password (min 12 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
            <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
            {passwordError && <p className="text-sm text-red-700">{passwordError}</p>}
            {passwordMessage && <p className="text-sm text-green-700">{passwordMessage}</p>}
            <button onClick={changePassword} disabled={passwordSaving || !currentPassword || !newPassword}
              className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50">
              {passwordSaving ? 'Changing...' : 'Change Password'}
            </button>
          </div>

          <hr className="border-border" />

          {/* Security Keys — FIDO2 (preserved) */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-muted">Security Keys (FIDO2)</h3>
            <p className="text-text-muted text-sm">Register a hardware security key for extra protection.</p>
            {fidoError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fidoError}</div>}
            {fidoSuccess && <div role="status" className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{fidoSuccess}</div>}
            {factorsLoading ? <p className="text-sm text-text-muted">Loading...</p> : (
              <>
                {verifiedFactors.length > 0 && (
                  <div className="space-y-3">
                    {verifiedFactors.map((factor) => (
                      <div key={factor.id} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                        <div className="flex items-center gap-3">
                          <KeyIcon className="h-5 w-5 text-text-muted" />
                          <div>
                            <p className="text-sm font-medium text-black">{factor.friendly_name || 'Security Key'}</p>
                            {factor.created_at && <p className="text-xs text-text-muted">Added {new Date(factor.created_at).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <button type="button" onClick={() => handleUnenroll(factor.id)} className="rounded-full text-sm text-red-600 hover:text-red-800 font-medium">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                {verifiedFactors.length === 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No security key enrolled.</div>
                )}
                <button type="button" onClick={handleEnroll} disabled={enrolling}
                  className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50">
                  {enrolling ? 'Waiting for key...' : 'Register New Security Key'}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ORGANIZATION */}
      <section id="organization" className="mt-8 scroll-mt-16">
        <div className="rounded-3xl bg-white p-5 border border-border space-y-4">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Organization</h2>
          {editOrg ? (
            <>
              <div>
                <label htmlFor="org-name" className="block text-sm font-medium text-text-muted">Organization Name</label>
                <input id="org-name" value={editOrg.name} onChange={(e) => setEditOrg({ ...editOrg, name: e.target.value })}
                  className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
              </div>
              <div>
                <label htmlFor="org-country" className="block text-sm font-medium text-text-muted">Country</label>
                <select id="org-country" value={editOrg.country} onChange={(e) => setEditOrg({ ...editOrg, country: e.target.value })}
                  className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5">
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="org-billing" className="block text-sm font-medium text-text-muted">Billing Email</label>
                <input id="org-billing" type="email" value={editOrg.billingEmail} onChange={(e) => setEditOrg({ ...editOrg, billingEmail: e.target.value })}
                  className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
              </div>
              <div>
                <label htmlFor="org-tz" className="block text-sm font-medium text-text-muted">Timezone</label>
                <select id="org-tz" value={editOrg.timezone} onChange={(e) => setEditOrg({ ...editOrg, timezone: e.target.value })}
                  className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-text-muted">Org ID</p>
                <p className="mt-1 text-sm font-mono text-black">{org?.id ?? '—'}</p>
              </div>
              {orgMessage && <p className="text-sm text-green-700">{orgMessage}</p>}
              <button onClick={saveOrg} disabled={orgSaving || !orgDirty}
                className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50">
                {orgSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : <p className="text-sm text-text-muted">Loading organization...</p>}
        </div>
      </section>

      {/* NOTIFICATIONS */}
      <section id="notifications" className="mt-8 scroll-mt-16 mb-12">
        <div className="rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-4">Notifications</h2>
          <NotificationPreferences adminEmail={profile?.email ?? '—'} />
        </div>
      </section>
    </div>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A.75.75 0 0 1 9.178 14H8v1.25a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V14H3.75a.75.75 0 0 1-.75-.75v-1.428a.75.75 0 0 1 .22-.53l4.084-4.084A5.01 5.01 0 0 1 8 7Zm5-3a.75.75 0 0 0 0 1.5A1.5 1.5 0 0 1 14.5 7 .75.75 0 0 0 16 7a3 3 0 0 0-3-3Z" clipRule="evenodd" />
    </svg>
  )
}
```

**Active Sessions subsection (spec 3.2):** Per the spec, if Supabase does not expose per-session listing, replace with a "Sign Out All Other Sessions" button. Add this after the FIDO2 section inside the My Account card:

```tsx
<hr className="border-border" />

{/* Active Sessions */}
<div className="space-y-4">
  <h3 className="text-sm font-medium text-text-muted">Active Sessions</h3>
  <p className="text-sm text-text-muted">Sign out of all other browser sessions.</p>
  <button
    type="button"
    onClick={async () => {
      await supabase.auth.signOut({ scope: 'others' })
      reportAdminAuthEvent('ADMIN_SESSION_REVOKED')
      setFidoSuccess('All other sessions signed out.')
    }}
    className="rounded-full border border-border text-black font-medium px-5 py-2 text-sm hover:bg-neutral-50 transition-colors"
  >
    Sign Out All Other Sessions
  </button>
</div>
```

Note: The `ADMIN_PASSWORD_CHANGED` and `ADMIN_SESSION_REVOKED` event types need to be added to the `AdminAuthEventType` union in `apps/admin-portal/src/lib/trpc.ts`. Add `| 'ADMIN_PASSWORD_CHANGED' | 'ADMIN_SESSION_REVOKED'` to the existing union.

- [ ] **Step 5: Run test**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/settings-restructured.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/settings/page.tsx apps/admin-portal/src/components/settings/NotificationPreferences.tsx apps/admin-portal/src/__tests__/settings-restructured.test.tsx apps/admin-portal/src/lib/trpc.ts
git commit -m "feat(admin-portal): restructure settings into My Account, Organization, and Notifications sections"
```

---

## Task 10: Dashboard Enrichment

**Files:**
- Modify: `apps/admin-portal/src/app/dashboard/page.tsx`
- Create: `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx`
- Create: `apps/admin-portal/src/components/dashboard/UserSummaryWidget.tsx`
- Create: `apps/admin-portal/src/components/dashboard/RecentActivityFeed.tsx`
- Create: `apps/admin-portal/src/__tests__/dashboard-enriched.test.tsx`

- [ ] **Step 1: Write dashboard test**

Create `apps/admin-portal/src/__tests__/dashboard-enriched.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockDashboardStats = vi.fn()
const mockRecentActivity = vi.fn()
const mockGetOrgSubscriptions = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      dashboardStats: { query: () => mockDashboardStats() },
      recentActivity: { query: () => mockRecentActivity() },
    },
    subscription: {
      getOrgSubscriptions: { query: () => mockGetOrgSubscriptions() },
    },
  },
}))

describe('Dashboard — enriched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDashboardStats.mockResolvedValue({
      pendingKycReviews: 5,
      slaBreachedKycCount: 2,
      pendingLabApprovals: 3,
      oldestPendingLabDays: 10,
      activeAlerts: 4,
      highSeverityAlertCount: 1,
      recentAuditEvents: 42,
      auditChainHealthy: true,
      userCounts: { total: 8, active: 6, suspended: 1, pendingInvite: 1, withoutMfa: 2 },
    })
    mockRecentActivity.mockResolvedValue({
      activities: [
        { type: 'KYC_APPROVED', description: 'Approved a KYC submission', timestamp: new Date().toISOString() },
      ],
    })
    mockGetOrgSubscriptions.mockResolvedValue({
      organization: { id: 'o1', name: 'Test Clinic', status: 'TRIAL', trialEndsAt: new Date(Date.now() + 12 * 86_400_000).toISOString(), billingEmail: 'b@t.com' },
      subscriptions: [],
      totalMonthlyCostUsd: 0,
    })
  })

  it('shows SLA breach count on KYC card', async () => {
    const { default: DashboardPage } = await import('@/app/dashboard/page')
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('5')).toBeDefined()
      expect(screen.getByText(/2 breaching SLA/)).toBeDefined()
    })
  })

  it('shows subscription widget', async () => {
    const { default: DashboardPage } = await import('@/app/dashboard/page')
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/Free Trial/)).toBeDefined()
    })
  })

  it('shows user summary widget', async () => {
    const { default: DashboardPage } = await import('@/app/dashboard/page')
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('8')).toBeDefined()
      expect(screen.getByText(/2 user\(s\) without MFA/)).toBeDefined()
    })
  })

  it('shows recent activity', async () => {
    const { default: DashboardPage } = await import('@/app/dashboard/page')
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Approved a KYC submission')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/dashboard-enriched.test.tsx`
Expected: FAIL — dashboard doesn't have widgets or urgency labels.

- [ ] **Step 3: Create SubscriptionWidget**

Create `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'

interface OrgInfo { status: string; trialEndsAt: string | null; name: string }

export function SubscriptionWidget() {
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [moduleCount, setModuleCount] = useState(0)
  const [totalCost, setTotalCost] = useState(0)

  useEffect(() => {
    trpc.subscription.getOrgSubscriptions.query().then((r) => {
      setOrg(r.organization)
      setModuleCount(r.subscriptions.filter((s: any) => s.status === 'ACTIVE' || s.status === 'TRIAL').length)
      setTotalCost(r.totalMonthlyCostUsd)
    }).catch(() => {})
  }, [])

  if (!org) return null

  const daysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0

  const trialProgress = org.trialEndsAt ? Math.max(0, Math.min(100, (daysLeft / 30) * 100)) : 0
  const barColor = daysLeft > 7 ? 'bg-green-500' : daysLeft > 3 ? 'bg-amber-500' : 'bg-red-500'

  if (org.status === 'TRIAL') {
    return (
      <div className="rounded-3xl bg-white p-5 border border-border flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold text-black">Free Trial — {daysLeft} days remaining</p>
          <div className="mt-2 h-2 rounded-full bg-neutral-200 w-full max-w-xs">
            <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${trialProgress}%` }} />
          </div>
        </div>
        <Link href="/subscriptions" className="rounded-full bg-brand-lime text-black font-semibold px-5 py-2 text-sm hover:brightness-95 transition-all">
          Set Up Billing
        </Link>
      </div>
    )
  }

  if (org.status === 'ACTIVE') {
    return (
      <div className="rounded-3xl bg-white p-5 border border-border">
        <p className="text-sm font-semibold text-black">Active Subscription — {moduleCount} module{moduleCount !== 1 ? 's' : ''}, ${totalCost.toFixed(2)}/mo</p>
      </div>
    )
  }

  if (org.status === 'SUSPENDED') {
    return (
      <div className="rounded-3xl bg-red-50 p-5 border border-red-200 flex items-center justify-between">
        <p className="text-sm font-semibold text-red-800">Subscription Suspended — Update your billing to restore access.</p>
        <Link href="/subscriptions" className="rounded-full bg-red-600 text-white font-semibold px-5 py-2 text-sm hover:bg-red-700 transition-colors">
          Manage Subscription
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-3xl bg-white p-5 border border-border flex items-center justify-between">
      <p className="text-sm font-semibold text-text-muted">Subscription Cancelled</p>
      <Link href="/subscriptions" className="rounded-full border border-border text-black font-semibold px-5 py-2 text-sm hover:bg-neutral-50 transition-colors">
        Resubscribe
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Create UserSummaryWidget**

Create `apps/admin-portal/src/components/dashboard/UserSummaryWidget.tsx`:

```tsx
'use client'

import Link from 'next/link'

interface UserCounts {
  total: number
  active: number
  suspended: number
  pendingInvite: number
  withoutMfa: number
}

export function UserSummaryWidget({ counts }: { counts: UserCounts | null }) {
  if (!counts) return null

  return (
    <Link href="/users" className="block rounded-3xl bg-white p-5 border border-border hover:scale-[1.01] transition-all">
      <p className="text-4xl font-bold tracking-tight text-black">{counts.total}</p>
      <p className="text-sm text-text-muted mt-1">staff user{counts.total !== 1 ? 's' : ''}</p>
      <p className="text-xs text-text-muted mt-2">
        {counts.active} active, {counts.suspended} suspended, {counts.pendingInvite} pending invite
      </p>
      {counts.withoutMfa > 0 && (
        <p className="text-xs text-amber-600 font-medium mt-1">
          ⚠ {counts.withoutMfa} user(s) without MFA
        </p>
      )}
    </Link>
  )
}
```

- [ ] **Step 5: Create RecentActivityFeed**

Create `apps/admin-portal/src/components/dashboard/RecentActivityFeed.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'

interface Activity {
  type: string
  description: string
  timestamp: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const iconColors: Record<string, string> = {
  KYC_APPROVED: 'text-green-600',
  LAB_APPROVED: 'text-green-600',
  LAB_REACTIVATED: 'text-green-600',
  STAFF_USER_REACTIVATED: 'text-green-600',
  KYC_REJECTED: 'text-red-600',
  LAB_SUSPENDED: 'text-red-600',
  STAFF_USER_SUSPENDED: 'text-red-600',
  ANOMALY_PROVIDER_SUSPENDED: 'text-red-600',
  STAFF_USER_CREATED: 'text-blue-600',
  STAFF_USER_ROLE_CHANGED: 'text-blue-600',
  STAFF_USER_PASSWORD_RESET: 'text-blue-600',
}

export function RecentActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trpc.admin.recentActivity.query({ limit: 10 })
      .then((r) => setActivities(r.activities))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  return (
    <div className="rounded-3xl bg-white p-5 border border-border">
      <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-4">Recent Activity</h2>
      {activities.length === 0 ? (
        <p className="text-sm text-text-muted">No recent activity.</p>
      ) : (
        <div className="space-y-2.5">
          {activities.map((a, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className={`mt-0.5 text-xs ${iconColors[a.type] ?? 'text-neutral-400'}`}>●</span>
              <span className="flex-1 text-black">{a.description}</span>
              <span className="text-xs text-text-muted shrink-0">{relativeTime(a.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 text-end">
        <Link href="/audit" className="text-xs text-text-muted hover:text-black transition-colors">View All →</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Rewrite dashboard/page.tsx**

Replace `apps/admin-portal/src/app/dashboard/page.tsx` with the enriched version:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { SubscriptionWidget } from '@/components/dashboard/SubscriptionWidget'
import { UserSummaryWidget } from '@/components/dashboard/UserSummaryWidget'
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed'

interface DashboardStats {
  pendingKycReviews: number
  slaBreachedKycCount: number
  pendingLabApprovals: number
  oldestPendingLabDays: number
  activeAlerts: number
  highSeverityAlertCount: number
  recentAuditEvents: number
  auditChainHealthy: boolean
  userCounts: {
    total: number
    active: number
    suspended: number
    pendingInvite: number
    withoutMfa: number
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    trpc.admin.dashboardStats.query().then(setStats).catch(() => setStatsError(true))
  }, [])

  const statCards = [
    {
      title: 'Pending KYC Reviews',
      value: stats?.pendingKycReviews ?? '—',
      sub: stats?.slaBreachedKycCount ? `${stats.slaBreachedKycCount} breaching SLA` : null,
      subColor: 'text-red-600',
      color: stats?.slaBreachedKycCount ? 'bg-brand-lime text-black border-2 border-red-500' : 'bg-brand-lime text-black',
      href: '/providers',
    },
    {
      title: 'Pending Lab Approvals',
      value: stats?.pendingLabApprovals ?? '—',
      sub: stats?.oldestPendingLabDays ? `oldest: ${stats.oldestPendingLabDays}d ago` : null,
      subColor: (stats?.oldestPendingLabDays ?? 0) > 7 ? 'text-amber-600' : 'text-neutral-500',
      color: 'bg-black text-white',
      href: '/labs',
    },
    {
      title: 'Active Alerts',
      value: stats?.activeAlerts ?? '—',
      sub: stats?.highSeverityAlertCount ? `${stats.highSeverityAlertCount} HIGH severity` : null,
      subColor: 'text-red-600',
      color: 'bg-white text-black border border-border',
      href: '/alerts',
    },
    {
      title: 'Audit Events',
      value: stats?.recentAuditEvents ?? '—',
      sub: stats ? (stats.auditChainHealthy ? 'Healthy' : 'Broken') : null,
      subColor: stats?.auditChainHealthy ? 'text-green-600' : 'text-red-600',
      color: 'bg-white text-black border border-border',
      href: '/audit',
    },
  ]

  return (
    <div>
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">Dashboard</h1>
      <p className="mt-4 text-text-muted">Overview of pending actions and system health.</p>

      {statsError && (
        <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">Failed to load dashboard stats.</div>
      )}

      {/* Row 1: Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            onClick={card.href ? () => router.push(card.href) : undefined}
            className={`rounded-3xl p-6 ${card.color} ${card.href ? 'cursor-pointer hover:scale-[1.02] transition-all' : ''}`}
          >
            <p className="text-sm font-medium opacity-70">{card.title}</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">{card.value}</p>
            {card.sub && (
              <p className={`mt-1 text-xs font-medium ${card.subColor}`}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Row 2: Subscription + User summary */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SubscriptionWidget />
        </div>
        <div>
          <UserSummaryWidget counts={stats?.userCounts ?? null} />
        </div>
      </div>

      {/* Row 3: Recent Activity */}
      <div className="mt-6">
        <RecentActivityFeed />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run test**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/dashboard-enriched.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/admin-portal/src/app/dashboard/page.tsx apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx apps/admin-portal/src/components/dashboard/UserSummaryWidget.tsx apps/admin-portal/src/components/dashboard/RecentActivityFeed.tsx apps/admin-portal/src/__tests__/dashboard-enriched.test.tsx
git commit -m "feat(admin-portal): enrich dashboard with urgency labels, subscription widget, user summary, and activity feed"
```

---

## Task 11: RemoveModuleDialog — Affected User Warning

**Files:**
- Modify: `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`

- [ ] **Step 1: Read the current RemoveModuleDialog**

Read `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx` to understand the current structure and props.

- [ ] **Step 2: Add affected user count query**

Inside the dialog component, add a useEffect that fetches the count of active users whose role requires the module being removed:

```tsx
const [affectedUserCount, setAffectedUserCount] = useState<number | null>(null)

useEffect(() => {
  const moduleCode = subscription.moduleCode
  // Map module to roles
  const affectedRoles = Object.entries(ROLE_MODULE_MAP)
    .filter(([, mod]) => mod === moduleCode)
    .map(([role]) => role)

  if (affectedRoles.length === 0) return

  trpc.admin.listUsers.query({ page: 1, pageSize: 1, roleFilter: affectedRoles[0], statusFilter: 'ACTIVE' })
    .then((r) => setAffectedUserCount(r.totalCount))
    .catch(() => {})
}, [subscription.moduleCode])
```

Add the warning before the existing cancellation message:

```tsx
{affectedUserCount !== null && affectedUserCount > 0 && (
  <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
    {affectedUserCount} active user(s) with roles requiring this module will be suspended when the billing period ends.
  </div>
)}
```

Import `ROLE_MODULE_MAP` from `@ultranos/shared-types` and `trpc` from `@/lib/trpc` if not already imported.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx
git commit -m "feat(admin-portal): show affected user count warning in RemoveModuleDialog"
```

---

## Task 12: Final Integration Verification

- [ ] **Step 1: Run all admin-portal tests**

Run: `pnpm -F admin-portal exec vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm -F admin-portal exec tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run lint**

Run: `pnpm -F admin-portal exec eslint src/ --ext .ts,.tsx`
Expected: No errors (warnings acceptable).

- [ ] **Step 4: Commit any fixes from verification**

If any tests fail or types break, fix them and commit:

```bash
git add -A
git commit -m "fix(admin-portal): resolve integration issues from admin portal foundation"
```
