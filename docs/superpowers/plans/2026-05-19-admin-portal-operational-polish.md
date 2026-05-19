# Admin Portal Operational Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider unified profiles, alert escalation workflow, configurable thresholds, and module-specific settings — making the admin portal operationally mature.

**Architecture:** Extend the existing admin tRPC router with new procedures. New frontend pages/components follow established patterns. The admin.ts file is at ~3,572 lines — new procedures should be added carefully with clear section comments. If the implementer judges the file is becoming unwieldy during implementation, they may extract anomaly-related procedures into a separate router file.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, tRPC, Supabase, Vitest

**Spec:** `docs/superpowers/specs/2026-05-19-admin-portal-operational-polish-design.md`

---

## File Structure

### New Files (Admin Portal)
- `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx` — Provider unified profile
- `apps/admin-portal/src/components/alerts/EscalationModal.tsx` — Escalation assignment modal
- `apps/admin-portal/src/components/alerts/EscalationSection.tsx` — Escalation tracking on alert detail
- `apps/admin-portal/src/components/settings/ThresholdSettings.tsx` — Threshold config controls
- `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx` — Per-module settings card
- `apps/admin-portal/src/__tests__/provider-profile.test.tsx`
- `apps/admin-portal/src/__tests__/escalation.test.tsx`
- `apps/admin-portal/src/__tests__/threshold-settings.test.tsx`
- `apps/admin-portal/src/__tests__/module-settings.test.tsx`

### Modified Files (Admin Portal)
- `apps/admin-portal/src/app/providers/page.tsx` — Add search input, link names to profile
- `apps/admin-portal/src/app/providers/expiry/page.tsx` — Add search input, link names to profile
- `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` — Replace Escalate action with EscalationModal, add EscalationSection, add provider profile link
- `apps/admin-portal/src/app/settings/page.tsx` — Add Thresholds and Modules sections

### Modified Files (Hub API)
- `apps/hub-api/src/trpc/routers/admin.ts` — Add getProviderProfile, escalateAnomaly, resolveAnomaly, reassignAnomaly, getOrgThresholds, updateOrgThresholds, getModuleSettings, updateModuleSettings. Extend listKycSubmissions, listExpiringProviders, getAnomalyDetail.

---

## Task 1: Database Migration — Escalation, Thresholds, Module Settings

**Files:**
- Migration via Supabase MCP tools

- [ ] **Step 1: Apply migration**

Use Supabase MCP `apply_migration` with this SQL:

```sql
-- Escalation columns on prescribing_anomalies
ALTER TABLE prescribing_anomalies
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS escalation_priority TEXT CHECK (escalation_priority IN ('URGENT', 'NORMAL')),
  ADD COLUMN IF NOT EXISTS escalation_note TEXT,
  ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES practitioners(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Org-level threshold configuration
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS thresholds JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Per-module settings table
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

-- Index for escalation queries
CREATE INDEX IF NOT EXISTS idx_anomalies_assigned_to
  ON prescribing_anomalies (assigned_to) WHERE assigned_to IS NOT NULL;
```

- [ ] **Step 2: Verify migration**

Use Supabase MCP `execute_sql` to confirm:
- `prescribing_anomalies` has `assigned_to`, `escalation_priority`, `escalation_note`, `escalated_by`, `escalated_at`, `resolution_note`, `resolved_by`, `resolved_at`
- `organizations` has `thresholds`
- `org_module_settings` table exists

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add escalation columns, org thresholds, and module settings table"
```

---

## Task 2: Hub API — Provider Profile & Search Extensions

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Read existing admin.ts to understand patterns**

Read `apps/hub-api/src/trpc/routers/admin.ts`. Note:
- The existing `listKycSubmissions` procedure (around line 812-895) — look at how it queries and filters
- The existing `listExpiringProviders` procedure (around line 595-686) — same
- The `getAnomalyDetail` procedure (around line 1255-1353)
- How org scoping works (`ctx.user.orgId`)

- [ ] **Step 2: Extend listKycSubmissions with search parameter**

Find the `listKycSubmissions` procedure. Extend its input schema to include an optional `search` string:

```typescript
// Add to the existing input schema:
search: z.string().optional(),
```

In the query logic, when `input.search` is provided, add a filter that matches practitioner name or email. The procedure already joins with practitioners — add an `.or()` filter:

```typescript
if (input.search) {
  query = query.or(`given_name.ilike.%${input.search}%,family_name.ilike.%${input.search}%,telecom_email.ilike.%${input.search}%`, { foreignTable: 'practitioners' })
}
```

Note: The exact join pattern depends on how the existing query is structured. If it uses a direct select on `kyc_submissions` and separately fetches practitioner data, the search may need to be applied differently — read the code and adapt.

- [ ] **Step 3: Extend listExpiringProviders with search parameter**

Same pattern — add `search: z.string().optional()` to the input. Since this queries practitioners directly, add:

```typescript
if (input.search) {
  query = query.or(`given_name.ilike.%${input.search}%,family_name.ilike.%${input.search}%,telecom_email.ilike.%${input.search}%`)
}
```

- [ ] **Step 4: Add getProviderProfile procedure**

```typescript
getProviderProfile: adminProcedure
  .input(z.object({ practitionerId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    // 1. Fetch practitioner
    const { data: practitioner, error: practError } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, telecom_email, telecom_phone, role, kyc_status, license_expiry, org_id, status, created_at')
      .eq('id', input.practitionerId)
      .eq('org_id', orgId)
      .single()

    if (practError || !practitioner) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' })
    }

    // 2. Fetch KYC submissions
    const { data: kycSubmissions } = await ctx.supabase
      .from('kyc_submissions')
      .select('id, status, submitted_at, reviewed_at, reviewer_id')
      .eq('practitioner_id', input.practitionerId)
      .order('submitted_at', { ascending: false })

    // 3. Fetch prescribing anomaly alerts
    const { data: alerts } = await ctx.supabase
      .from('prescribing_anomalies')
      .select('id, anomaly_type, severity, status, created_at, assigned_to, escalation_priority')
      .eq('practitioner_id', input.practitionerId)
      .order('created_at', { ascending: false })

    // 4. Compute alert summary
    const alertList = alerts ?? []
    const alertSummary = {
      total: alertList.length,
      dismissed: alertList.filter((a) => a.status === 'DISMISSED').length,
      escalated: alertList.filter((a) => a.status === 'ESCALATED').length,
      resolved: alertList.filter((a) => a.status === 'RESOLVED').length,
      unreviewed: alertList.filter((a) => a.status === 'UNREVIEWED').length,
    }

    // 5. Compute license days remaining
    const licenseExpiry = practitioner.license_expiry
    const daysRemaining = licenseExpiry
      ? Math.ceil((new Date(licenseExpiry).getTime() - Date.now()) / 86_400_000)
      : null

    // Audit
    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'PROVIDER_PROFILE_VIEWED',
        resourceType: 'PRACTITIONER',
        resourceId: input.practitionerId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: {},
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'PROVIDER_PROFILE_VIEWED' })
    }

    return {
      practitioner: {
        id: practitioner.id,
        name: `${practitioner.given_name} ${practitioner.family_name}`.trim(),
        email: practitioner.telecom_email,
        phone: practitioner.telecom_phone,
        role: practitioner.role,
        kycStatus: practitioner.kyc_status,
        licenseExpiry: practitioner.license_expiry,
        daysRemaining,
        status: practitioner.status,
        createdAt: practitioner.created_at,
      },
      kycSubmissions: (kycSubmissions ?? []).map((s) => ({
        id: s.id,
        status: s.status,
        submittedAt: s.submitted_at,
        reviewedAt: s.reviewed_at,
      })),
      alerts: alertList.map((a) => ({
        id: a.id,
        anomalyType: a.anomaly_type,
        severity: a.severity,
        status: a.status,
        createdAt: a.created_at,
      })),
      alertSummary,
    }
  }),
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add provider profile procedure and search to KYC/expiry lists"
```

---

## Task 3: Hub API — Escalation Procedures

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add escalateAnomaly procedure**

```typescript
escalateAnomaly: adminProcedure
  .input(z.object({
    alertId: z.string().uuid(),
    assigneeId: z.string().uuid().optional(),
    priority: z.enum(['URGENT', 'NORMAL']),
    note: z.string().min(10).max(2000),
  }))
  .mutation(async ({ ctx, input }) => {
    // Optimistic lock — only escalate if currently UNREVIEWED
    const { error, count } = await ctx.supabase
      .from('prescribing_anomalies')
      .update({
        status: 'ESCALATED',
        assigned_to: input.assigneeId ?? null,
        escalation_priority: input.priority,
        escalation_note: input.note,
        escalated_by: ctx.user.sub,
        escalated_at: new Date().toISOString(),
      })
      .eq('id', input.alertId)
      .eq('status', 'UNREVIEWED')
      .select('id', { count: 'exact', head: true })

    if (error || (count ?? 0) === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Alert cannot be escalated — it may have been reviewed by another admin' })
    }

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'ANOMALY_ESCALATED',
        resourceType: 'PRESCRIBING_ANOMALY',
        resourceId: input.alertId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { assigneeId: input.assigneeId, priority: input.priority, escalatedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'ANOMALY_ESCALATED' })
    }

    return { success: true }
  }),
```

- [ ] **Step 2: Add resolveAnomaly procedure**

```typescript
resolveAnomaly: adminProcedure
  .input(z.object({
    alertId: z.string().uuid(),
    resolutionNote: z.string().min(10).max(2000),
  }))
  .mutation(async ({ ctx, input }) => {
    const { error, count } = await ctx.supabase
      .from('prescribing_anomalies')
      .update({
        status: 'RESOLVED',
        resolution_note: input.resolutionNote,
        resolved_by: ctx.user.sub,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', input.alertId)
      .eq('status', 'ESCALATED')
      .select('id', { count: 'exact', head: true })

    if (error || (count ?? 0) === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Alert cannot be resolved — must be in ESCALATED status' })
    }

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'ANOMALY_RESOLVED',
        resourceType: 'PRESCRIBING_ANOMALY',
        resourceId: input.alertId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { resolutionNote: input.resolutionNote, resolvedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'ANOMALY_RESOLVED' })
    }

    return { success: true }
  }),
```

- [ ] **Step 3: Add reassignAnomaly procedure**

```typescript
reassignAnomaly: adminProcedure
  .input(z.object({
    alertId: z.string().uuid(),
    assigneeId: z.string().uuid(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { error, count } = await ctx.supabase
      .from('prescribing_anomalies')
      .update({ assigned_to: input.assigneeId })
      .eq('id', input.alertId)
      .eq('status', 'ESCALATED')
      .select('id', { count: 'exact', head: true })

    if (error || (count ?? 0) === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Alert cannot be reassigned — must be in ESCALATED status' })
    }

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'ANOMALY_REASSIGNED',
        resourceType: 'PRESCRIBING_ANOMALY',
        resourceId: input.alertId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { newAssigneeId: input.assigneeId, reassignedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'ANOMALY_REASSIGNED' })
    }

    return { success: true }
  }),
```

- [ ] **Step 4: Extend getAnomalyDetail to include escalation fields**

Find the existing `getAnomalyDetail` procedure. Extend the select to include the new columns:

```typescript
// Add to the select:
.select('*, assigned_to, escalation_priority, escalation_note, escalated_by, escalated_at, resolution_note, resolved_by, resolved_at')
```

Then resolve assignee and escalator names by querying practitioners:

```typescript
// After fetching the alert, resolve names:
let assigneeName = null
let escalatedByName = null
let resolvedByName = null

if (alert.assigned_to) {
  const { data: assignee } = await ctx.supabase
    .from('practitioners')
    .select('given_name, family_name')
    .eq('id', alert.assigned_to)
    .single()
  assigneeName = assignee ? `${assignee.given_name} ${assignee.family_name}`.trim() : null
}

if (alert.escalated_by) {
  const { data: escalator } = await ctx.supabase
    .from('practitioners')
    .select('given_name, family_name')
    .eq('id', alert.escalated_by)
    .single()
  escalatedByName = escalator ? `${escalator.given_name} ${escalator.family_name}`.trim() : null
}

if (alert.resolved_by) {
  const { data: resolver } = await ctx.supabase
    .from('practitioners')
    .select('given_name, family_name')
    .eq('id', alert.resolved_by)
    .single()
  resolvedByName = resolver ? `${resolver.given_name} ${resolver.family_name}`.trim() : null
}
```

Add these to the return object:

```typescript
return {
  // ...existing fields
  assigneeName,
  escalationPriority: alert.escalation_priority,
  escalationNote: alert.escalation_note,
  escalatedByName,
  escalatedAt: alert.escalated_at,
  resolutionNote: alert.resolution_note,
  resolvedByName,
  resolvedAt: alert.resolved_at,
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add escalation, resolution, and reassignment procedures for anomaly alerts"
```

---

## Task 4: Hub API — Thresholds & Module Settings Procedures

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add default thresholds constant**

Near the top of admin.ts (after imports):

```typescript
const DEFAULT_THRESHOLDS = {
  kycReviewSlaDays: 7,
  controlledSubstanceDailyLimit: 10,
  drugFrequencyThresholdPct: 20,
  licenseExpiryWarningDays: [60, 30, 7],
}

const DEFAULT_MODULE_SETTINGS: Record<string, Record<string, unknown>> = {
  OPD_LITE: { consultationLanguages: ['en'], defaultSoapTemplate: 'Standard', aiAssistedNotes: true },
  PHARMACY_LITE: { requireSignatureOnDispense: true, allowPartialDispense: false, controlledSubstanceDoubleVerify: true },
  LAB_LITE: { autoNotifyProviderOnResult: true, resultRetentionDays: 365 },
}
```

- [ ] **Step 2: Add getOrgThresholds and updateOrgThresholds procedures**

```typescript
getOrgThresholds: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { data } = await ctx.supabase
      .from('organizations')
      .select('thresholds')
      .eq('id', orgId)
      .single()

    return { ...DEFAULT_THRESHOLDS, ...(data?.thresholds as Record<string, unknown> ?? {}) }
  }),

updateOrgThresholds: adminProcedure
  .input(z.object({
    thresholds: z.object({
      kycReviewSlaDays: z.number().int().min(1).max(30).optional(),
      controlledSubstanceDailyLimit: z.number().int().min(1).max(100).optional(),
      drugFrequencyThresholdPct: z.number().int().min(1).max(100).optional(),
      licenseExpiryWarningDays: z.array(z.number().int().min(1).max(365)).length(3).optional(),
    }),
  }))
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { error } = await ctx.supabase
      .from('organizations')
      .update({ thresholds: input.thresholds, updated_at: new Date().toISOString() })
      .eq('id', orgId)

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update thresholds' })

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'ORG_THRESHOLDS_UPDATED',
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { changedBy: ctx.user.sub, thresholds: input.thresholds },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'ORG_THRESHOLDS_UPDATED' })
    }

    return { success: true }
  }),
```

- [ ] **Step 3: Add getModuleSettings and updateModuleSettings procedures**

```typescript
getModuleSettings: adminProcedure
  .input(z.object({ moduleCode: z.string() }))
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { data } = await ctx.supabase
      .from('org_module_settings')
      .select('settings')
      .eq('org_id', orgId)
      .eq('module_code', input.moduleCode)
      .single()

    const defaults = DEFAULT_MODULE_SETTINGS[input.moduleCode] ?? {}
    return { ...defaults, ...(data?.settings as Record<string, unknown> ?? {}) }
  }),

updateModuleSettings: adminProcedure
  .input(z.object({
    moduleCode: z.enum(['OPD_LITE', 'PHARMACY_LITE', 'LAB_LITE']),
    settings: z.record(z.unknown()),
  }))
  .mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    // Validate org has active subscription for this module
    const { data: sub } = await ctx.supabase
      .from('org_subscriptions')
      .select('id')
      .eq('org_id', orgId)
      .eq('module_code', input.moduleCode)
      .in('status', ['ACTIVE', 'TRIAL'])
      .single()

    if (!sub) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `No active subscription for ${input.moduleCode}` })
    }

    const { error } = await ctx.supabase
      .from('org_module_settings')
      .upsert({
        org_id: orgId,
        module_code: input.moduleCode,
        settings: input.settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,module_code' })

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update module settings' })

    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'MODULE_SETTINGS_UPDATED',
        resourceType: 'ORG_MODULE_SETTINGS',
        resourceId: `${orgId}:${input.moduleCode}`,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { moduleCode: input.moduleCode, changedBy: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'MODULE_SETTINGS_UPDATED' })
    }

    return { success: true }
  }),
```

- [ ] **Step 4: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add org threshold and module settings procedures"
```

---

## Task 5: Provider Search on Providers & Expiry Pages

**Files:**
- Modify: `apps/admin-portal/src/app/providers/page.tsx`
- Modify: `apps/admin-portal/src/app/providers/expiry/page.tsx`

- [ ] **Step 1: Add search to providers page**

Read `apps/admin-portal/src/app/providers/page.tsx`. Add:

1. A `search` state: `const [search, setSearch] = useState('')`
2. A text input in the filter bar (next to the status tabs):

```tsx
<input
  type="text"
  placeholder="Search by name or email..."
  value={search}
  onChange={(e) => { setSearch(e.target.value); /* reset pagination */ }}
  className="rounded-xl border border-border px-4 py-2 text-sm max-w-xs"
/>
```

3. Pass `search` to the tRPC query call (the procedure was extended in Task 2):

```tsx
trpc.admin.listKycSubmissions.query({ status: filter, cursor, limit: PAGE_SIZE, search: search || undefined })
```

4. Debounce the search: use a simple `useEffect` with a 300ms timeout to delay the query trigger.

5. Make provider names clickable → `/providers/profile/[practitionerId]`:

Change the provider name cell from plain text to a Link:

```tsx
<Link href={`/providers/profile/${entry.practitionerId}`} className="text-black hover:text-brand-lime font-medium">
  {entry.providerName}
</Link>
```

- [ ] **Step 2: Add search to expiry page**

Read `apps/admin-portal/src/app/providers/expiry/page.tsx`. Same pattern:

1. Add `search` state
2. Add text input in the filter bar
3. Pass to `trpc.admin.listExpiringProviders.query({ window, cursor, limit, search })`
4. Make provider names link to `/providers/profile/[practitionerId]`

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/providers/page.tsx apps/admin-portal/src/app/providers/expiry/page.tsx
git commit -m "feat(admin-portal): add provider search and profile links to providers and expiry pages"
```

---

## Task 6: Provider Profile Page

**Files:**
- Create: `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx`
- Create: `apps/admin-portal/src/__tests__/provider-profile.test.tsx`

- [ ] **Step 1: Write provider profile test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockGetProviderProfile = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ practitionerId: 'p1' })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getProviderProfile: { query: (args: unknown) => mockGetProviderProfile(args) },
    },
  },
}))

describe('ProviderProfilePage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders provider identity', async () => {
    mockGetProviderProfile.mockResolvedValue({
      practitioner: {
        id: 'p1', name: 'Dr. Ahmed', email: 'ahmed@clinic.org', phone: null,
        role: 'CLINICIAN', kycStatus: 'ACTIVE', licenseExpiry: '2027-01-01',
        daysRemaining: 200, status: 'ACTIVE', createdAt: '2026-01-01',
      },
      kycSubmissions: [{ id: 's1', status: 'APPROVED', submittedAt: '2026-01-15', reviewedAt: '2026-01-16' }],
      alerts: [],
      alertSummary: { total: 0, dismissed: 0, escalated: 0, resolved: 0, unreviewed: 0 },
    })

    const { default: Page } = await import('@/app/providers/profile/[practitionerId]/page')
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Ahmed')).toBeDefined()
      expect(screen.getByText('ahmed@clinic.org')).toBeDefined()
      expect(screen.getByText('ACTIVE')).toBeDefined()
    })
  })

  it('shows alert warning when multiple escalated alerts', async () => {
    mockGetProviderProfile.mockResolvedValue({
      practitioner: {
        id: 'p1', name: 'Dr. Risk', email: 'risk@clinic.org', phone: null,
        role: 'CLINICIAN', kycStatus: 'ACTIVE', licenseExpiry: '2027-01-01',
        daysRemaining: 200, status: 'ACTIVE', createdAt: '2026-01-01',
      },
      kycSubmissions: [],
      alerts: [
        { id: 'a1', anomalyType: 'CONTROLLED_SUBSTANCE_VOLUME', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-01' },
        { id: 'a2', anomalyType: 'DRUG_FREQUENCY', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-10' },
        { id: 'a3', anomalyType: 'CONTROLLED_SUBSTANCE_VOLUME', severity: 'MEDIUM', status: 'UNREVIEWED', createdAt: '2026-05-15' },
      ],
      alertSummary: { total: 3, dismissed: 0, escalated: 2, resolved: 0, unreviewed: 1 },
    })

    const { default: Page } = await import('@/app/providers/profile/[practitionerId]/page')
    render(<Page />)

    await waitFor(() => {
      expect(screen.getByText(/multiple unresolved alerts/i)).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create provider profile page**

Create `apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx`:

Four sections following admin portal styling:
- **Identity card:** Name, email, role badge, KYC status badge, license expiry with urgency color, days remaining
- **KYC History:** Table of submissions (ID, Status, Submitted, Reviewed, "View Details" link to `/providers/[submissionId]`)
- **License Timeline:** Expiry date, days remaining badge, expired alert if applicable
- **Prescribing Alerts:** Table (ID, Type, Severity, Status, Date, "View" link to `/alerts/[alertId]`). Summary line above. Warning if ≥3 escalated+unreviewed.

Back link: "← Back to Providers" → `/providers`

Data source: `trpc.admin.getProviderProfile.query({ practitionerId })`

Follow exact same patterns as the user detail page (card layout, status badges, table styling).

- [ ] **Step 3: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/provider-profile.test.tsx`

```bash
git add apps/admin-portal/src/app/providers/profile/[practitionerId]/page.tsx apps/admin-portal/src/__tests__/provider-profile.test.tsx
git commit -m "feat(admin-portal): add provider unified profile page with KYC history and alert tracking"
```

---

## Task 7: Escalation Modal + Section Components

**Files:**
- Create: `apps/admin-portal/src/components/alerts/EscalationModal.tsx`
- Create: `apps/admin-portal/src/components/alerts/EscalationSection.tsx`
- Create: `apps/admin-portal/src/__tests__/escalation.test.tsx`

- [ ] **Step 1: Write escalation test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockListUsers = vi.fn()
const mockEscalateAnomaly = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listUsers: { query: (args: unknown) => mockListUsers(args) },
      escalateAnomaly: { mutate: (args: unknown) => mockEscalateAnomaly(args) },
      resolveAnomaly: { mutate: vi.fn().mockResolvedValue({ success: true }) },
      reassignAnomaly: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
}))

describe('EscalationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({
      users: [{ id: 'a1', name: 'Admin One', role: 'ADMIN' }],
      totalCount: 1,
    })
  })

  it('renders escalation form with assignee dropdown and priority', async () => {
    const { EscalationModal } = await import('@/components/alerts/EscalationModal')
    render(<EscalationModal alertId="alert-1" onClose={vi.fn()} onSuccess={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Priority/)).toBeDefined()
      expect(screen.getByText('URGENT')).toBeDefined()
      expect(screen.getByText('NORMAL')).toBeDefined()
    })
  })
})

describe('EscalationSection', () => {
  it('renders escalation details', async () => {
    const { EscalationSection } = await import('@/components/alerts/EscalationSection')
    render(
      <EscalationSection
        alertId="alert-1"
        status="ESCALATED"
        assigneeName="Admin One"
        escalationPriority="URGENT"
        escalationNote="Needs investigation"
        escalatedByName="Admin Two"
        escalatedAt="2026-05-19T10:00:00Z"
        resolutionNote={null}
        resolvedByName={null}
        resolvedAt={null}
        onResolve={vi.fn()}
        onReassign={vi.fn()}
      />,
    )

    expect(screen.getByText('URGENT')).toBeDefined()
    expect(screen.getByText('Needs investigation')).toBeDefined()
    expect(screen.getByText('Admin One')).toBeDefined()
  })
})
```

- [ ] **Step 2: Create EscalationModal**

Create `apps/admin-portal/src/components/alerts/EscalationModal.tsx`:

Modal with:
- **Assign to:** Dropdown populated from `trpc.admin.listUsers.query({ roleFilter: 'ADMIN', statusFilter: 'ACTIVE', page: 1, pageSize: 50 })`. Default: "Unassigned".
- **Priority:** Two radio buttons: URGENT / NORMAL. Default: NORMAL.
- **Note:** Textarea, required, min 10 chars. Placeholder: "Describe what should be investigated..."
- **Buttons:** "Escalate" (brand-lime, disabled until note ≥10 chars) and "Cancel"
- On submit: calls `trpc.admin.escalateAnomaly.mutate({ alertId, assigneeId?, priority, note })`. On success: calls `onSuccess()` callback.
- Overlay: `fixed inset-0 bg-black/50 flex items-center justify-center z-50`
- Card: `rounded-3xl bg-white p-6 max-w-lg mx-4`

Props: `{ alertId: string, onClose: () => void, onSuccess: () => void }`

- [ ] **Step 3: Create EscalationSection**

Create `apps/admin-portal/src/components/alerts/EscalationSection.tsx`:

A card rendered on the alert detail page when status is ESCALATED or RESOLVED.

Props:
```tsx
interface EscalationSectionProps {
  alertId: string
  status: string
  assigneeName: string | null
  escalationPriority: string | null
  escalationNote: string | null
  escalatedByName: string | null
  escalatedAt: string | null
  resolutionNote: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  onResolve: () => void
  onReassign: () => void
}
```

Displays:
- Status badge (ESCALATED amber, RESOLVED green)
- Assigned to, Priority badge (URGENT red, NORMAL neutral), Note, Escalated by, Escalated at
- If RESOLVED: resolution note, resolved by, resolved at
- If ESCALATED: "Resolve" button (opens inline textarea for resolution note), "Re-assign" button

Styled as `rounded-3xl bg-white p-5 border border-border`.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/escalation.test.tsx`

```bash
git add apps/admin-portal/src/components/alerts/EscalationModal.tsx apps/admin-portal/src/components/alerts/EscalationSection.tsx apps/admin-portal/src/__tests__/escalation.test.tsx
git commit -m "feat(admin-portal): add EscalationModal and EscalationSection components"
```

---

## Task 8: Alert Detail Page Modifications

**Files:**
- Modify: `apps/admin-portal/src/app/alerts/[alertId]/page.tsx`

- [ ] **Step 1: Read the existing alert detail page**

Read `apps/admin-portal/src/app/alerts/[alertId]/page.tsx`. Note:
- Lines 257-278: The three action buttons (DISMISS, ESCALATE, SUSPEND_PROVIDER)
- Lines 82-163: The action modal with reason field
- The data fetching pattern and state management

- [ ] **Step 2: Replace ESCALATE action with EscalationModal**

1. Import the new components:
```tsx
import { EscalationModal } from '@/components/alerts/EscalationModal'
import { EscalationSection } from '@/components/alerts/EscalationSection'
```

2. Add state for the escalation modal:
```tsx
const [showEscalationModal, setShowEscalationModal] = useState(false)
```

3. Replace the ESCALATE button (around line 265-269) with:
```tsx
<button
  onClick={() => setShowEscalationModal(true)}
  disabled={submitting}
  className="rounded-full bg-purple-600 text-white font-semibold px-5 py-2 text-sm hover:bg-purple-700 disabled:opacity-50"
>
  Escalate
</button>
```

4. Render the modal when open:
```tsx
{showEscalationModal && (
  <EscalationModal
    alertId={alertId}
    onClose={() => setShowEscalationModal(false)}
    onSuccess={() => { setShowEscalationModal(false); fetchData() }}
  />
)}
```

- [ ] **Step 3: Add EscalationSection**

After the existing prescribing summary section, add:

```tsx
{(alert.status === 'ESCALATED' || alert.status === 'RESOLVED') && (
  <div className="mt-6">
    <EscalationSection
      alertId={alertId}
      status={alert.status}
      assigneeName={alert.assigneeName}
      escalationPriority={alert.escalationPriority}
      escalationNote={alert.escalationNote}
      escalatedByName={alert.escalatedByName}
      escalatedAt={alert.escalatedAt}
      resolutionNote={alert.resolutionNote}
      resolvedByName={alert.resolvedByName}
      resolvedAt={alert.resolvedAt}
      onResolve={fetchData}
      onReassign={fetchData}
    />
  </div>
)}
```

The `fetchData` callback refreshes the alert data after resolve/reassign.

- [ ] **Step 4: Add provider profile link**

In the prescribing summary section, make the provider name a link:

```tsx
<Link href={`/providers/profile/${alert.practitionerId}`} className="text-black hover:text-brand-lime font-medium">
  {alert.practitionerName}
</Link>
```

- [ ] **Step 5: Hide ESCALATE/DISMISS/SUSPEND buttons when already ESCALATED or RESOLVED**

The action buttons should only show when status is UNREVIEWED:

```tsx
{alert.status === 'UNREVIEWED' && (
  <div className="flex gap-3">
    {/* DISMISS, ESCALATE, SUSPEND buttons */}
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/alerts/[alertId]/page.tsx
git commit -m "feat(admin-portal): integrate escalation modal and section into alert detail page"
```

---

## Task 9: Threshold Settings Component + Settings Page

**Files:**
- Create: `apps/admin-portal/src/components/settings/ThresholdSettings.tsx`
- Modify: `apps/admin-portal/src/app/settings/page.tsx`
- Create: `apps/admin-portal/src/__tests__/threshold-settings.test.tsx`

- [ ] **Step 1: Write threshold test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getOrgThresholds: { query: vi.fn().mockResolvedValue({
        kycReviewSlaDays: 7, controlledSubstanceDailyLimit: 10,
        drugFrequencyThresholdPct: 20, licenseExpiryWarningDays: [60, 30, 7],
      })},
      updateOrgThresholds: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
}))

describe('ThresholdSettings', () => {
  it('renders threshold inputs with defaults', async () => {
    const { ThresholdSettings } = await import('@/components/settings/ThresholdSettings')
    render(<ThresholdSettings />)

    await waitFor(() => {
      expect(screen.getByLabelText(/KYC Review SLA/)).toBeDefined()
      expect(screen.getByLabelText(/Controlled Substance/)).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create ThresholdSettings component**

Create `apps/admin-portal/src/components/settings/ThresholdSettings.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface Thresholds {
  kycReviewSlaDays: number
  controlledSubstanceDailyLimit: number
  drugFrequencyThresholdPct: number
  licenseExpiryWarningDays: number[]
}

const DEFAULTS: Thresholds = {
  kycReviewSlaDays: 7,
  controlledSubstanceDailyLimit: 10,
  drugFrequencyThresholdPct: 20,
  licenseExpiryWarningDays: [60, 30, 7],
}

export function ThresholdSettings() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    trpc.admin.getOrgThresholds.query()
      .then((data) => setThresholds({ ...DEFAULTS, ...data }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await trpc.admin.updateOrgThresholds.mutate({ thresholds })
      setMessage('Thresholds saved.')
    } catch {
      setMessage('Failed to save thresholds.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading thresholds...</p>

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="kycSla" className="block text-sm font-medium text-text-muted">
          KYC Review SLA (days)
        </label>
        <p className="text-xs text-text-muted mt-0.5">Days before a pending KYC submission is flagged as SLA-breached</p>
        <input id="kycSla" type="number" min={1} max={30} value={thresholds.kycReviewSlaDays}
          onChange={(e) => setThresholds({ ...thresholds, kycReviewSlaDays: Number(e.target.value) })}
          className="mt-1.5 block w-32 rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
      </div>

      <div>
        <label htmlFor="controlledLimit" className="block text-sm font-medium text-text-muted">
          Controlled Substance Daily Limit
        </label>
        <p className="text-xs text-text-muted mt-0.5">Prescriptions per day per provider before triggering anomaly alert</p>
        <input id="controlledLimit" type="number" min={1} max={100} value={thresholds.controlledSubstanceDailyLimit}
          onChange={(e) => setThresholds({ ...thresholds, controlledSubstanceDailyLimit: Number(e.target.value) })}
          className="mt-1.5 block w-32 rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
      </div>

      <div>
        <label htmlFor="drugFreq" className="block text-sm font-medium text-text-muted">
          Drug Frequency Threshold (%)
        </label>
        <p className="text-xs text-text-muted mt-0.5">Percentage of patients receiving same drug in 7 days before alert</p>
        <input id="drugFreq" type="number" min={1} max={100} value={thresholds.drugFrequencyThresholdPct}
          onChange={(e) => setThresholds({ ...thresholds, drugFrequencyThresholdPct: Number(e.target.value) })}
          className="mt-1.5 block w-32 rounded-xl border border-border px-4 py-2.5 focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
      </div>

      <div>
        <p className="text-sm font-medium text-text-muted">License Expiry Warning Bands (days)</p>
        <p className="text-xs text-text-muted mt-0.5">Days before expiry for yellow, orange, and red urgency levels</p>
        <div className="mt-1.5 flex gap-3">
          {['Yellow', 'Orange', 'Red'].map((label, i) => (
            <div key={label}>
              <label htmlFor={`expiry-${label}`} className="block text-xs text-text-muted">{label}</label>
              <input id={`expiry-${label}`} type="number" min={1} max={365}
                value={thresholds.licenseExpiryWarningDays[i] ?? 0}
                onChange={(e) => {
                  const updated = [...thresholds.licenseExpiryWarningDays]
                  updated[i] = Number(e.target.value)
                  setThresholds({ ...thresholds, licenseExpiryWarningDays: updated })
                }}
                className="mt-0.5 block w-20 rounded-xl border border-border px-3 py-2 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30" />
            </div>
          ))}
        </div>
      </div>

      {message && <p className="text-sm text-green-700">{message}</p>}

      <button onClick={handleSave} disabled={saving}
        className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Thresholds'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add Thresholds section to settings page**

Read `apps/admin-portal/src/app/settings/page.tsx`. Add "Thresholds" to the section nav and add a new section after Notifications:

1. Import: `import { ThresholdSettings } from '@/components/settings/ThresholdSettings'`
2. Add `{ id: 'thresholds', label: 'Thresholds' }` to the sections array
3. Add section:

```tsx
<section id="thresholds" className="mt-8 scroll-mt-16">
  <div className="rounded-3xl bg-white p-5 border border-border">
    <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-4">Thresholds</h2>
    <ThresholdSettings />
  </div>
</section>
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/threshold-settings.test.tsx`

```bash
git add apps/admin-portal/src/components/settings/ThresholdSettings.tsx apps/admin-portal/src/app/settings/page.tsx apps/admin-portal/src/__tests__/threshold-settings.test.tsx
git commit -m "feat(admin-portal): add configurable threshold settings to settings page"
```

---

## Task 10: Module Settings Component + Settings Page

**Files:**
- Create: `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx`
- Modify: `apps/admin-portal/src/app/settings/page.tsx`
- Create: `apps/admin-portal/src/__tests__/module-settings.test.tsx`

- [ ] **Step 1: Write module settings test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getModuleSettings: { query: vi.fn().mockResolvedValue({
        consultationLanguages: ['en'], defaultSoapTemplate: 'Standard', aiAssistedNotes: true,
      })},
      updateModuleSettings: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
}))

describe('ModuleSettingsCard', () => {
  it('renders OPD Lite settings', async () => {
    const { ModuleSettingsCard } = await import('@/components/settings/ModuleSettingsCard')
    render(<ModuleSettingsCard moduleCode="OPD_LITE" moduleName="OPD Lite" />)

    await waitFor(() => {
      expect(screen.getByText('OPD Lite')).toBeDefined()
      expect(screen.getByText(/SOAP template/i)).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create ModuleSettingsCard component**

Create `apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx`:

A component that renders different controls based on `moduleCode`.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface ModuleSettingsCardProps {
  moduleCode: string
  moduleName: string
}

const MODULE_CONFIGS: Record<string, Array<{ key: string; label: string; type: 'toggle' | 'select' | 'number' | 'multicheck'; options?: string[]; min?: number; max?: number }>> = {
  OPD_LITE: [
    { key: 'consultationLanguages', label: 'Consultation Languages', type: 'multicheck', options: ['en', 'ar', 'fa', 'ps', 'ur'] },
    { key: 'defaultSoapTemplate', label: 'Default SOAP Template', type: 'select', options: ['Standard', 'Brief', 'Detailed'] },
    { key: 'aiAssistedNotes', label: 'AI-Assisted Notes', type: 'toggle' },
  ],
  PHARMACY_LITE: [
    { key: 'requireSignatureOnDispense', label: 'Require Pharmacist Signature on Dispense', type: 'toggle' },
    { key: 'allowPartialDispense', label: 'Allow Partial Dispense', type: 'toggle' },
    { key: 'controlledSubstanceDoubleVerify', label: 'Controlled Substance Double-Verify', type: 'toggle' },
  ],
  LAB_LITE: [
    { key: 'autoNotifyProviderOnResult', label: 'Auto-Notify Provider on Result Upload', type: 'toggle' },
    { key: 'resultRetentionDays', label: 'Result Retention (days)', type: 'number', min: 30, max: 3650 },
  ],
}

export function ModuleSettingsCard({ moduleCode, moduleName }: ModuleSettingsCardProps) {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const config = MODULE_CONFIGS[moduleCode]

  useEffect(() => {
    trpc.admin.getModuleSettings.query({ moduleCode })
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [moduleCode])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await trpc.admin.updateModuleSettings.mutate({ moduleCode, settings })
      setMessage('Settings saved.')
    } catch {
      setMessage('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!config) return null
  if (loading) return <p className="text-sm text-text-muted">Loading {moduleName} settings...</p>

  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      <h3 className="text-sm font-semibold text-black">{moduleName}</h3>

      {config.map((field) => (
        <div key={field.key}>
          {field.type === 'toggle' && (
            <label className="flex items-center justify-between">
              <span className="text-sm">{field.label}</span>
              <input type="checkbox" checked={!!settings[field.key]}
                onChange={(e) => setSettings({ ...settings, [field.key]: e.target.checked })}
                className="accent-[#D4FF00]" />
            </label>
          )}

          {field.type === 'select' && (
            <div>
              <label className="block text-sm text-text-muted">{field.label}</label>
              <select value={(settings[field.key] as string) ?? ''}
                onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                className="mt-1 rounded-xl border border-border px-3 py-2 text-sm">
                {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          )}

          {field.type === 'number' && (
            <div>
              <label className="block text-sm text-text-muted">{field.label}</label>
              <input type="number" min={field.min} max={field.max}
                value={(settings[field.key] as number) ?? 0}
                onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) })}
                className="mt-1 w-32 rounded-xl border border-border px-3 py-2 text-sm" />
            </div>
          )}

          {field.type === 'multicheck' && (
            <div>
              <p className="text-sm text-text-muted">{field.label}</p>
              <div className="mt-1 flex flex-wrap gap-3">
                {field.options?.map((opt) => {
                  const current = (settings[field.key] as string[]) ?? []
                  return (
                    <label key={opt} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={current.includes(opt)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...current, opt]
                            : current.filter((v) => v !== opt)
                          setSettings({ ...settings, [field.key]: updated })
                        }}
                        className="accent-[#D4FF00]" />
                      {opt}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {message && <p className="text-sm text-green-700">{message}</p>}

      <button onClick={handleSave} disabled={saving}
        className="rounded-full bg-brand-lime text-black font-semibold px-5 py-2 text-sm hover:brightness-95 transition-all disabled:opacity-50">
        {saving ? 'Saving...' : `Save ${moduleName} Settings`}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add Modules section to settings page**

In `apps/admin-portal/src/app/settings/page.tsx`:

1. Import: `import { ModuleSettingsCard } from '@/components/settings/ModuleSettingsCard'`
2. Add `{ id: 'modules', label: 'Modules' }` to the sections array
3. Fetch subscribed modules (reuse the existing `trpc.subscription.getOrgSubscriptions.query()` data if already fetched, or add a new useEffect)
4. Add section:

```tsx
<section id="modules" className="mt-8 scroll-mt-16 mb-12">
  <div className="rounded-3xl bg-white p-5 border border-border">
    <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-4">Modules</h2>
    {subscribedModules.length === 0 ? (
      <p className="text-sm text-text-muted">No modules configured. Subscribe to a module to see its settings.</p>
    ) : (
      <div className="space-y-4">
        {subscribedModules.map((mod) => (
          <ModuleSettingsCard key={mod.moduleCode} moduleCode={mod.moduleCode} moduleName={mod.moduleName} />
        ))}
      </div>
    )}
  </div>
</section>
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/module-settings.test.tsx`

```bash
git add apps/admin-portal/src/components/settings/ModuleSettingsCard.tsx apps/admin-portal/src/app/settings/page.tsx apps/admin-portal/src/__tests__/module-settings.test.tsx
git commit -m "feat(admin-portal): add per-module settings cards to settings page"
```

---

## Task 11: Final Integration Verification

- [ ] **Step 1: Run all admin-portal tests**

Run: `pnpm -F admin-portal exec vitest run`
Expected: All new tests pass. Pre-existing failures unchanged.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm -F admin-portal exec tsc --noEmit`

- [ ] **Step 3: Run Hub API TypeScript check**

Run: `pnpm -F hub-api exec tsc --noEmit`

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix(admin-portal): resolve integration issues from Epic C"
```
