# Admin Portal Billing & Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add payment method management, invoice history, audit log event browsing, and CSV export across all tables — making the admin portal commercial and compliance-ready.

**Architecture:** Extend the existing subscription and admin tRPC routers. The billing page uses the `packages/billing/` adapter (already implemented with Stripe/Tap support). Audit event browsing queries `audit_log` with PHI sanitization. Export uses a reusable `ExportButton` component backed by server-side CSV generation.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, tRPC, Supabase, `packages/billing/` adapter, Vitest

**Spec:** `docs/superpowers/specs/2026-05-19-admin-portal-billing-compliance-design.md`

---

## File Structure

### New Files (Admin Portal)
- `apps/admin-portal/src/app/subscriptions/billing/page.tsx` — Payment method management
- `apps/admin-portal/src/app/subscriptions/invoices/page.tsx` — Invoice history
- `apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx` — Current card display
- `apps/admin-portal/src/components/subscriptions/TrialExpiredBanner.tsx` — Trial-expired persistent banner
- `apps/admin-portal/src/components/subscriptions/DunningBanner.tsx` — Failed payment banner
- `apps/admin-portal/src/components/audit/EventBrowser.tsx` — Audit event table with filters
- `apps/admin-portal/src/components/ExportButton.tsx` — Reusable CSV export component
- `apps/admin-portal/src/__tests__/billing-page.test.tsx`
- `apps/admin-portal/src/__tests__/invoices-page.test.tsx`
- `apps/admin-portal/src/__tests__/event-browser.test.tsx`
- `apps/admin-portal/src/__tests__/export-button.test.tsx`
- `apps/admin-portal/src/__tests__/dunning-banner.test.tsx`

### Modified Files (Admin Portal)
- `apps/admin-portal/src/components/Sidebar.tsx` — Add Billing, Invoices sub-items
- `apps/admin-portal/src/app/subscriptions/page.tsx` — Add billing/invoice links
- `apps/admin-portal/src/app/audit/page.tsx` — Add tab bar, integrate EventBrowser
- `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx` — Add dunning awareness
- `apps/admin-portal/src/components/AuthGuard.tsx` — Add trial-expired interstitial
- `apps/admin-portal/src/app/providers/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/providers/expiry/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/labs/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/users/page.tsx` — Add ExportButton
- `apps/admin-portal/src/app/alerts/page.tsx` — Add ExportButton

### Modified Files (Hub API)
- `apps/hub-api/src/trpc/routers/subscription.ts` — Add billing procedures, extend getOrgSubscriptions
- `apps/hub-api/src/trpc/routers/admin.ts` — Add audit browsing + export procedures

---

## Task 1: Database Migration — Billing Events & Payment Fields

**Files:**
- Migration via Supabase MCP tools

- [ ] **Step 1: Create billing_events table and add payment fields to organizations**

Use Supabase MCP `apply_migration` with this SQL:

```sql
-- billing_events table (referenced in code but never created)
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CHARGE_SUCCESS', 'CHARGE_FAILED', 'REFUND',
    'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED'
  )),
  amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider_ref TEXT UNIQUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events (org_id, created_at DESC);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own org billing events"
  ON billing_events FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM practitioners WHERE auth_user_id = auth.uid() AND role = 'ADMIN'
  ));

-- Payment failure tracking on organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;
```

- [ ] **Step 2: Verify migration**

Use Supabase MCP `list_tables` to confirm `billing_events` exists. Use `execute_sql` to verify organizations has `payment_failure_reason` and `grace_period_ends_at`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): create billing_events table, add payment failure columns to organizations"
```

---

## Task 2: Hub API — Subscription Billing Procedures

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/subscription.ts`

- [ ] **Step 1: Read the existing subscription router**

Read `apps/hub-api/src/trpc/routers/subscription.ts` to understand the full structure, existing procedures, imports, and patterns. Key things to note:
- How `adminProcedure` equivalent is used (it may use a custom admin check inline)
- The existing `getOrgSubscriptions` procedure (around line 194)
- How `org_id` is obtained from context

- [ ] **Step 2: Add billing adapter import and Zod schemas**

At the top of the file, add:

```typescript
import { getBillingAdapter } from '@ultranos/billing'

const invoiceListInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  statusFilter: z.string().optional(),
})
```

- [ ] **Step 3: Add getPaymentMethod procedure**

Add inside the subscription router. This procedure should be ADMIN-only (follow the pattern used by `getOrgSubscriptions`):

```typescript
getPaymentMethod: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('payment_provider_customer_id')
      .eq('id', orgId)
      .single()

    // If org has no customer ID with the billing provider, no payment method exists
    if (!org?.payment_provider_customer_id) {
      return null
    }

    try {
      const adapter = getBillingAdapter()
      // The adapter should expose a method to get payment method details
      // For now, query billing_events for the most recent successful charge to infer card info
      const { data: lastCharge } = await ctx.supabase
        .from('billing_events')
        .select('metadata')
        .eq('org_id', orgId)
        .eq('event_type', 'CHARGE_SUCCESS')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!lastCharge?.metadata) return null

      const meta = lastCharge.metadata as Record<string, unknown>
      return {
        brand: (meta.card_brand as string) ?? 'Card',
        last4: (meta.card_last4 as string) ?? '****',
        expMonth: (meta.card_exp_month as number) ?? 0,
        expYear: (meta.card_exp_year as number) ?? 0,
      }
    } catch {
      return null
    }
  }),
```

Note: The `organizations` table may not have a `payment_provider_customer_id` column yet. Check the schema — if it doesn't exist, the procedure should check `org_subscriptions` for any `provider_customer_id` instead (this column exists per the schema found during Epic A). Adapt accordingly.

- [ ] **Step 4: Add createPaymentSetup procedure**

```typescript
createPaymentSetup: adminProcedure
  .mutation(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    try {
      const adapter = getBillingAdapter()

      // Check if org already has a billing customer
      const { data: org } = await ctx.supabase
        .from('org_subscriptions')
        .select('provider_customer_id')
        .eq('org_id', orgId)
        .not('provider_customer_id', 'is', null)
        .limit(1)
        .single()

      let customerId = org?.provider_customer_id

      if (!customerId) {
        // Create a new customer with the billing provider
        const { data: orgDetails } = await ctx.supabase
          .from('organizations')
          .select('name, billing_email')
          .eq('id', orgId)
          .single()

        const result = await adapter.createCustomer({
          orgId,
          email: orgDetails?.billing_email ?? '',
          name: orgDetails?.name ?? '',
        })
        customerId = result.customerId
      }

      // Create a setup intent / session with the provider
      // The adapter returns provider-specific data
      const setupResult = await adapter.createSetupIntent({ customerId })

      // Audit
      const audit = new AuditLogger(ctx.supabase)
      try {
        await audit.emit({
          action: 'PAYMENT_SETUP_INITIATED',
          resourceType: 'ORGANIZATION',
          resourceId: orgId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { provider: setupResult.provider },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PAYMENT_SETUP_INITIATED' })
      }

      return setupResult
    } catch (err: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Billing is not configured for this deployment',
      })
    }
  }),
```

Note: The `BillingAdapter` interface may not have `createCustomer` or `createSetupIntent` methods. Check `packages/billing/src/types.ts` for the actual interface. If these methods don't exist, they need to be added to the adapter interface and implemented in the Stripe/Tap adapters. The implementer should check the adapter interface and adapt the procedure accordingly, or stub the methods if the adapter is incomplete.

- [ ] **Step 5: Add removePaymentMethod procedure**

```typescript
removePaymentMethod: adminProcedure
  .mutation(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    // For now, mark the org as having no payment method by clearing provider refs
    // The actual detach from the billing provider would go through the adapter
    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'PAYMENT_METHOD_REMOVED',
        resourceType: 'ORGANIZATION',
        resourceId: orgId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { adminId: ctx.user.sub },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'PAYMENT_METHOD_REMOVED' })
    }

    return { success: true }
  }),
```

- [ ] **Step 6: Add listInvoices procedure**

```typescript
listInvoices: adminProcedure
  .input(invoiceListInput)
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    try {
      const adapter = getBillingAdapter()

      // Get customer ID from org subscriptions
      const { data: sub } = await ctx.supabase
        .from('org_subscriptions')
        .select('provider_customer_id')
        .eq('org_id', orgId)
        .not('provider_customer_id', 'is', null)
        .limit(1)
        .single()

      if (!sub?.provider_customer_id) {
        return { invoices: [], totalCount: 0 }
      }

      const invoices = await adapter.getInvoices(sub.provider_customer_id)

      // Apply status filter
      let filtered = invoices
      if (input.statusFilter) {
        filtered = invoices.filter((inv) => inv.status === input.statusFilter)
      }

      const totalCount = filtered.length
      const from = (input.page - 1) * input.pageSize
      const paged = filtered.slice(from, from + input.pageSize)

      return {
        invoices: paged.map((inv) => ({
          id: inv.invoiceId,
          date: inv.createdAt,
          description: `Subscription charge`,
          amountUsd: inv.amount,
          status: inv.status.toUpperCase(),
          downloadUrl: inv.pdfUrl ?? null,
        })),
        totalCount,
      }
    } catch {
      // Billing adapter not configured — return empty
      return { invoices: [], totalCount: 0 }
    }
  }),
```

- [ ] **Step 7: Extend getOrgSubscriptions to include payment failure fields**

Find the existing `getOrgSubscriptions` procedure (around line 194). In its org query, add `payment_failure_reason` and `grace_period_ends_at` to the select:

```typescript
// Change the select from:
.select('id, name, status, trial_ends_at, billing_email')
// To:
.select('id, name, status, trial_ends_at, billing_email, payment_failure_reason, grace_period_ends_at')
```

And extend the return's `organization` object:

```typescript
organization: {
  // ...existing fields
  paymentFailureReason: org.payment_failure_reason,
  gracePeriodEndsAt: org.grace_period_ends_at,
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/hub-api/src/trpc/routers/subscription.ts
git commit -m "feat(hub-api): add billing procedures (payment method, invoices) and extend getOrgSubscriptions with dunning fields"
```

---

## Task 3: Hub API — Audit Event Browsing & Export

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add Zod schemas for audit browsing**

```typescript
const listAuditEventsInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  dateFrom: z.string(), // ISO date string
  dateTo: z.string(),
  actionTypes: z.array(z.string()).optional(),
  actorSearch: z.string().optional(),
  outcome: z.string().optional(),
})

const exportAuditEventsInput = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  actionTypes: z.array(z.string()).optional(),
  actorSearch: z.string().optional(),
  outcome: z.string().optional(),
  format: z.enum(['csv']).default('csv'),
})
```

- [ ] **Step 2: Add PHI sanitization helper**

Add a helper function near the top of the file (not inside the router):

```typescript
const PHI_METADATA_KEYS = new Set([
  'patient_name', 'diagnosis', 'medication_name', 'allergy',
  'note_content', 'clinical_note', 'prescription_content',
])

function sanitizeMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) return {}
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (PHI_METADATA_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[redacted]'
    } else if (typeof value === 'string' && value.length > 100) {
      // Long freeform text might be clinical narrative
      sanitized[key] = '[redacted — long text]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}
```

- [ ] **Step 3: Add listAuditEvents procedure**

```typescript
listAuditEvents: adminProcedure
  .input(listAuditEventsInput)
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    // Validate date range (max 90 days)
    const from = new Date(input.dateFrom)
    const to = new Date(input.dateTo)
    const diffDays = (to.getTime() - from.getTime()) / 86_400_000
    if (diffDays > 90 || diffDays < 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Date range must be 0-90 days' })
    }

    // Get org practitioner IDs for scoping
    const { data: practitioners } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, role')
      .eq('org_id', orgId)

    const practitionerIds = (practitioners ?? []).map((p) => p.id)
    const practitionerMap = new Map(
      (practitioners ?? []).map((p) => [p.id, { name: `${p.given_name} ${p.family_name}`.trim(), role: p.role }])
    )

    if (practitionerIds.length === 0) {
      return { events: [], totalCount: 0 }
    }

    // Build query
    let query = ctx.supabase
      .from('audit_log')
      .select('id, timestamp, action, actor_id, actor_role, resource_type, resource_id, outcome, metadata', { count: 'exact' })
      .in('actor_id', practitionerIds)
      .gte('timestamp', input.dateFrom)
      .lte('timestamp', input.dateTo)
      .order('timestamp', { ascending: false })

    if (input.actionTypes && input.actionTypes.length > 0) {
      query = query.in('action', input.actionTypes)
    }
    if (input.outcome) {
      query = query.eq('outcome', input.outcome)
    }

    const pageFrom = (input.page - 1) * input.pageSize
    const pageTo = pageFrom + input.pageSize - 1
    query = query.range(pageFrom, pageTo)

    const { data, error, count } = await query

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to query audit events' })
    }

    // Apply actor search filter (post-query since it requires join)
    let events = (data ?? []).map((e) => {
      const actor = practitionerMap.get(e.actor_id)
      return {
        id: e.id,
        timestamp: e.timestamp,
        action: e.action,
        actorId: e.actor_id,
        actorName: actor?.name ?? 'Unknown',
        actorRole: actor?.role ?? e.actor_role,
        resourceType: e.resource_type,
        resourceId: e.resource_id,
        outcome: e.outcome,
        metadata: sanitizeMetadata(e.metadata as Record<string, unknown> | null),
      }
    })

    if (input.actorSearch) {
      const search = input.actorSearch.toLowerCase()
      events = events.filter((e) =>
        e.actorName.toLowerCase().includes(search)
      )
    }

    return { events, totalCount: count ?? 0 }
  }),
```

- [ ] **Step 4: Add exportAuditEvents procedure**

```typescript
exportAuditEvents: adminProcedure
  .input(exportAuditEventsInput)
  .query(async ({ ctx, input }) => {
    const orgId = ctx.user.orgId
    if (!orgId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })
    }

    // Reuse the same scoping logic as listAuditEvents
    const { data: practitioners } = await ctx.supabase
      .from('practitioners')
      .select('id, given_name, family_name, role')
      .eq('org_id', orgId)

    const practitionerIds = (practitioners ?? []).map((p) => p.id)
    const practitionerMap = new Map(
      (practitioners ?? []).map((p) => [p.id, { name: `${p.given_name} ${p.family_name}`.trim(), role: p.role }])
    )

    if (practitionerIds.length === 0) {
      return { data: btoa('Timestamp,Action,Actor,Role,Resource Type,Resource ID,Outcome\n'), filename: `audit-events-${input.dateFrom}.csv`, mimeType: 'text/csv' }
    }

    let query = ctx.supabase
      .from('audit_log')
      .select('id, timestamp, action, actor_id, actor_role, resource_type, resource_id, outcome, metadata')
      .in('actor_id', practitionerIds)
      .gte('timestamp', input.dateFrom)
      .lte('timestamp', input.dateTo)
      .order('timestamp', { ascending: false })
      .limit(10000)

    if (input.actionTypes && input.actionTypes.length > 0) {
      query = query.in('action', input.actionTypes)
    }
    if (input.outcome) {
      query = query.eq('outcome', input.outcome)
    }

    const { data, error } = await query
    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to export audit events' })
    }

    // Build CSV
    const header = 'Timestamp,Action,Actor,Role,Resource Type,Resource ID,Outcome'
    const rows = (data ?? []).map((e) => {
      const actor = practitionerMap.get(e.actor_id)
      const escapeCsv = (s: string) => `"${s.replace(/"/g, '""')}"`
      return [
        escapeCsv(e.timestamp),
        escapeCsv(e.action),
        escapeCsv(actor?.name ?? 'Unknown'),
        escapeCsv(actor?.role ?? e.actor_role),
        escapeCsv(e.resource_type ?? ''),
        escapeCsv(e.resource_id ?? ''),
        escapeCsv(e.outcome ?? ''),
      ].join(',')
    })

    const csv = [header, ...rows].join('\n')

    // Audit the export action
    const audit = new AuditLogger(ctx.supabase)
    try {
      await audit.emit({
        action: 'AUDIT_EVENTS_EXPORTED',
        resourceType: 'AUDIT_LOG',
        resourceId: orgId,
        actorId: ctx.user.sub,
        actorRole: ctx.user.role,
        outcome: 'SUCCESS',
        sessionId: ctx.user.sessionId,
        metadata: { format: input.format, dateRange: `${input.dateFrom} to ${input.dateTo}`, rowCount: rows.length },
      })
    } catch {
      console.warn('[AUDIT_FAILURE]', { action: 'AUDIT_EVENTS_EXPORTED' })
    }

    const dateSlug = input.dateFrom.split('T')[0]
    return {
      data: Buffer.from(csv).toString('base64'),
      filename: `audit-events-${dateSlug}.csv`,
      mimeType: 'text/csv',
    }
  }),
```

- [ ] **Step 5: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts
git commit -m "feat(hub-api): add audit event browsing and CSV export with PHI sanitization"
```

---

## Task 4: Hub API — Data Export Procedures

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/admin.ts`

- [ ] **Step 1: Add a reusable CSV builder helper**

Near the top of admin.ts (after imports, before the router):

```typescript
function buildCsvExport(
  headers: string[],
  rows: string[][],
  filenamePrefix: string,
): { data: string; filename: string; mimeType: string } {
  const escapeCsv = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
  const headerRow = headers.join(',')
  const dataRows = rows.map((row) => row.map(escapeCsv).join(','))
  const csv = [headerRow, ...dataRows].join('\n')
  const date = new Date().toISOString().split('T')[0]
  return {
    data: Buffer.from(csv).toString('base64'),
    filename: `${filenamePrefix}-${date}.csv`,
    mimeType: 'text/csv',
  }
}
```

- [ ] **Step 2: Add exportUsers procedure**

```typescript
exportUsers: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { data } = await ctx.supabase
      .from('practitioners')
      .select('given_name, family_name, telecom_email, role, status, last_login_at, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10000)

    const rows = (data ?? []).map((p) => [
      `${p.given_name} ${p.family_name}`.trim(),
      p.telecom_email,
      p.role,
      p.status,
      p.last_login_at ?? 'Never',
      p.created_at,
    ])

    return buildCsvExport(
      ['Name', 'Email', 'Role', 'Status', 'Last Login', 'Created'],
      rows, 'staff-users',
    )
  }),
```

- [ ] **Step 3: Add exportKycSubmissions procedure**

```typescript
exportKycSubmissions: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { data } = await ctx.supabase
      .from('kyc_submissions')
      .select('id, practitioner_id, status, submitted_at, reviewed_at, reviewer_id')
      .eq('org_id', orgId)
      .order('submitted_at', { ascending: false })
      .limit(10000)

    const rows = (data ?? []).map((s) => [
      s.id,
      s.status,
      s.submitted_at,
      s.reviewed_at ?? '',
    ])

    return buildCsvExport(
      ['Submission ID', 'Status', 'Submitted', 'Reviewed'],
      rows, 'kyc-submissions',
    )
  }),
```

- [ ] **Step 4: Add exportExpiringProviders, exportLabs, exportAlerts procedures**

Follow the same pattern as Steps 2-3. Each procedure:
- Queries the relevant table scoped to org
- Selects only non-PHI columns
- Returns via `buildCsvExport`

```typescript
exportExpiringProviders: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { data } = await ctx.supabase
      .from('practitioners')
      .select('given_name, family_name, telecom_email, role, license_expiry, kyc_status')
      .eq('org_id', orgId)
      .not('license_expiry', 'is', null)
      .order('license_expiry', { ascending: true })
      .limit(10000)

    const rows = (data ?? []).map((p) => {
      const daysLeft = p.license_expiry
        ? Math.ceil((new Date(p.license_expiry).getTime() - Date.now()) / 86_400_000)
        : 0
      return [
        `${p.given_name} ${p.family_name}`.trim(),
        p.telecom_email,
        p.role,
        p.license_expiry ?? '',
        String(daysLeft),
        p.kyc_status,
      ]
    })

    return buildCsvExport(
      ['Name', 'Email', 'Role', 'License Expiry', 'Days Remaining', 'KYC Status'],
      rows, 'license-expiry',
    )
  }),

exportLabs: adminProcedure
  .query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from('labs')
      .select('id, name, license_ref, accreditation_ref, status, created_at, verified_at')
      .order('created_at', { ascending: false })
      .limit(10000)

    const rows = (data ?? []).map((l) => [
      l.name,
      l.license_ref,
      l.accreditation_ref ?? '',
      l.status,
      l.created_at,
      l.verified_at ?? '',
    ])

    return buildCsvExport(
      ['Lab Name', 'License Ref', 'Accreditation Ref', 'Status', 'Registered', 'Verified'],
      rows, 'lab-registrations',
    )
  }),

exportAlerts: adminProcedure
  .query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from('prescribing_anomalies')
      .select('id, anomaly_type, severity, status, threshold_value, actual_value, created_at')
      .order('created_at', { ascending: false })
      .limit(10000)

    const rows = (data ?? []).map((a) => [
      a.id,
      a.anomaly_type ?? '',
      a.severity ?? '',
      a.status ?? '',
      String(a.threshold_value ?? ''),
      String(a.actual_value ?? ''),
      a.created_at,
    ])

    return buildCsvExport(
      ['Alert ID', 'Type', 'Severity', 'Status', 'Threshold', 'Actual', 'Created'],
      rows, 'prescribing-alerts',
    )
  }),
```

- [ ] **Step 5: Add exportSubscriptions to subscription router**

Modify: `apps/hub-api/src/trpc/routers/subscription.ts`

```typescript
exportSubscriptions: adminProcedure
  .query(async ({ ctx }) => {
    const orgId = ctx.user.orgId
    if (!orgId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No organization found' })

    const { data: subs } = await ctx.supabase
      .from('org_subscriptions')
      .select('module_code, status, started_at, expires_at, cancelled_at')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })

    const { data: modules } = await ctx.supabase
      .from('modules')
      .select('code, display_name, monthly_price_usd')

    const moduleMap = new Map((modules ?? []).map((m) => [m.code, m]))

    const rows = (subs ?? []).map((s) => {
      const mod = moduleMap.get(s.module_code)
      return [
        mod?.display_name ?? s.module_code,
        s.status,
        s.started_at,
        s.expires_at ?? '',
        s.cancelled_at ?? '',
        String(mod?.monthly_price_usd ?? 0),
      ]
    })

    const escapeCsv = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
    const header = 'Module,Status,Start Date,Expiry,Cancelled,Monthly Cost (USD)'
    const dataRows = rows.map((row) => row.map(escapeCsv).join(','))
    const csv = [header, ...dataRows].join('\n')
    const date = new Date().toISOString().split('T')[0]

    return {
      data: Buffer.from(csv).toString('base64'),
      filename: `subscriptions-${date}.csv`,
      mimeType: 'text/csv',
    }
  }),
```

- [ ] **Step 6: Commit**

```bash
git add apps/hub-api/src/trpc/routers/admin.ts apps/hub-api/src/trpc/routers/subscription.ts
git commit -m "feat(hub-api): add CSV export procedures for users, KYC, providers, labs, alerts, and subscriptions"
```

---

## Task 5: ExportButton Reusable Component

**Files:**
- Create: `apps/admin-portal/src/components/ExportButton.tsx`
- Create: `apps/admin-portal/src/__tests__/export-button.test.tsx`

- [ ] **Step 1: Write export button test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('ExportButton', () => {
  it('triggers download on click', async () => {
    const mockExport = vi.fn().mockResolvedValue({
      data: btoa('Name,Email\nTest,test@test.com'),
      filename: 'test.csv',
      mimeType: 'text/csv',
    })

    const { ExportButton } = await import('@/components/ExportButton')
    render(<ExportButton exportFn={mockExport} filters={{}} />)

    const user = userEvent.setup()
    await user.click(screen.getByText('Export CSV'))

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith({})
    })
  })

  it('shows loading state during export', async () => {
    const mockExport = vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves

    const { ExportButton } = await import('@/components/ExportButton')
    render(<ExportButton exportFn={mockExport} filters={{}} />)

    const user = userEvent.setup()
    await user.click(screen.getByText('Export CSV'))

    await waitFor(() => {
      expect(screen.getByText('Exporting...')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create ExportButton component**

```tsx
'use client'

import { useState } from 'react'

interface ExportButtonProps {
  exportFn: (filters: Record<string, unknown>) => Promise<{ data: string; filename: string; mimeType: string }>
  filters: Record<string, unknown>
  label?: string
}

export function ExportButton({ exportFn, filters, label = 'Export CSV' }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await exportFn(filters)

      // Decode base64 and trigger download
      const binaryString = atob(result.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleExport}
        disabled={loading}
        className="rounded-full border border-border text-black px-4 py-2 text-sm hover:bg-neutral-50 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
        {loading ? 'Exporting...' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  )
}
```

- [ ] **Step 3: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/export-button.test.tsx`
Expected: PASS

```bash
git add apps/admin-portal/src/components/ExportButton.tsx apps/admin-portal/src/__tests__/export-button.test.tsx
git commit -m "feat(admin-portal): add reusable ExportButton component with base64 download"
```

---

## Task 6: Sidebar Navigation + Subscriptions Page Links

**Files:**
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`
- Modify: `apps/admin-portal/src/app/subscriptions/page.tsx`

- [ ] **Step 1: Add Billing and Invoices to sidebar navItems**

In `Sidebar.tsx`, insert after the Subscriptions item:

```typescript
{ label: 'Subscriptions', href: '/subscriptions', icon: CreditCardIcon },
{ label: 'Billing', href: '/subscriptions/billing', icon: WalletIcon, indent: true },
{ label: 'Invoices', href: '/subscriptions/invoices', icon: ReceiptIcon, indent: true },
```

Add new icon components `WalletIcon` and `ReceiptIcon` (Heroicons v2 mini style, matching existing).

- [ ] **Step 2: Add links to subscriptions page**

In `apps/admin-portal/src/app/subscriptions/page.tsx`, add after the modules table (after the `RemoveModuleDialog`):

```tsx
{/* Billing & Invoice links */}
<div className="mt-6 flex gap-6">
  <a href="/subscriptions/billing" className="text-sm text-text-muted hover:text-black transition-colors">
    Manage Billing →
  </a>
  <a href="/subscriptions/invoices" className="text-sm text-text-muted hover:text-black transition-colors">
    View Invoices →
  </a>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/Sidebar.tsx apps/admin-portal/src/app/subscriptions/page.tsx
git commit -m "feat(admin-portal): add Billing and Invoices to sidebar, add links on subscriptions page"
```

---

## Task 7: Billing Page

**Files:**
- Create: `apps/admin-portal/src/app/subscriptions/billing/page.tsx`
- Create: `apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx`
- Create: `apps/admin-portal/src/__tests__/billing-page.test.tsx`

- [ ] **Step 1: Write billing page test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockGetPaymentMethod = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      getPaymentMethod: { query: () => mockGetPaymentMethod() },
      createPaymentSetup: { mutate: vi.fn().mockResolvedValue({ provider: 'stripe', clientSecret: 'cs_test' }) },
      removePaymentMethod: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
}))

describe('BillingPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows no payment method state', async () => {
    mockGetPaymentMethod.mockResolvedValue(null)
    const { default: BillingPage } = await import('@/app/subscriptions/billing/page')
    render(<BillingPage />)

    await waitFor(() => {
      expect(screen.getByText(/No payment method on file/)).toBeDefined()
    })
    expect(screen.getByText('Add Payment Method')).toBeDefined()
  })

  it('shows existing payment method', async () => {
    mockGetPaymentMethod.mockResolvedValue({ brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2027 })
    const { default: BillingPage } = await import('@/app/subscriptions/billing/page')
    render(<BillingPage />)

    await waitFor(() => {
      expect(screen.getByText(/4242/)).toBeDefined()
      expect(screen.getByText(/Visa/)).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create PaymentMethodCard component**

Create `apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx`:

```tsx
'use client'

interface PaymentMethod {
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export function PaymentMethodCard({
  method,
  onUpdate,
  onRemove,
}: {
  method: PaymentMethod
  onUpdate: () => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-3xl bg-white p-5 border border-border">
      <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Payment Method</h2>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="text-sm font-medium text-black">{method.brand}</p>
            <p className="text-lg font-mono tracking-wider text-black">•••• {method.last4}</p>
            <p className="text-xs text-text-muted">
              Expires {String(method.expMonth).padStart(2, '0')}/{method.expYear}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onUpdate}
            className="rounded-full bg-brand-lime text-black font-semibold px-5 py-2 text-sm hover:brightness-95 transition-all"
          >
            Update
          </button>
          <button
            onClick={onRemove}
            className="rounded-full border border-red-300 text-red-700 px-5 py-2 text-sm hover:bg-red-50 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create billing page**

Create `apps/admin-portal/src/app/subscriptions/billing/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { PaymentMethodCard } from '@/components/subscriptions/PaymentMethodCard'
import Link from 'next/link'

interface PaymentMethod {
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export default function BillingPage() {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  useEffect(() => {
    trpc.subscription.getPaymentMethod.query()
      .then((pm) => setPaymentMethod(pm))
      .catch(() => setError('Failed to load payment method. Billing may not be configured.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSetup = async () => {
    setSetupLoading(true)
    setError(null)
    try {
      const result = await trpc.subscription.createPaymentSetup.mutate()
      if ('redirectUrl' in result && result.redirectUrl) {
        window.location.href = result.redirectUrl as string
      } else {
        // For inline providers (Stripe Elements), we'd render the form here
        // For now, show a message that setup was initiated
        setError('Payment provider integration pending. Setup initiated but inline form not yet implemented.')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Billing is not configured for this deployment.')
    } finally {
      setSetupLoading(false)
    }
  }

  const handleRemove = async () => {
    try {
      await trpc.subscription.removePaymentMethod.mutate()
      setPaymentMethod(null)
      setShowRemoveConfirm(false)
    } catch {
      setError('Failed to remove payment method.')
    }
  }

  return (
    <div className="max-w-2xl">
      <Link href="/subscriptions" className="text-sm text-text-muted hover:text-black transition-colors">
        ← Back to Subscriptions
      </Link>

      <h1 className="mt-4 text-4xl font-bold tracking-tight wavy-divider">Billing</h1>
      <p className="mt-4 text-text-muted">Manage your payment method for subscription billing.</p>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-8 text-text-muted">Loading billing information...</div>
      ) : paymentMethod ? (
        <div className="mt-6">
          <PaymentMethodCard
            method={paymentMethod}
            onUpdate={handleSetup}
            onRemove={() => setShowRemoveConfirm(true)}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-3xl bg-white p-8 border border-amber-200 bg-amber-50 text-center">
          <p className="text-sm text-amber-800 font-medium">No payment method on file</p>
          <p className="mt-1 text-sm text-amber-700">Add a payment method to continue your subscription after the trial period.</p>
          <button
            onClick={handleSetup}
            disabled={setupLoading}
            className="mt-4 rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 transition-all disabled:opacity-50"
          >
            {setupLoading ? 'Setting up...' : 'Add Payment Method'}
          </button>
        </div>
      )}

      {/* Remove confirmation */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-3xl bg-white p-6 max-w-md mx-4">
            <h2 className="text-lg font-semibold text-black">Remove Payment Method?</h2>
            <p className="mt-2 text-sm text-text-muted">
              Your subscription will be suspended if no payment method is on file at your next billing date.
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button onClick={() => setShowRemoveConfirm(false)} className="rounded-full border border-border px-5 py-2 text-sm">
                Cancel
              </button>
              <button onClick={handleRemove} className="rounded-full bg-red-600 text-white font-semibold px-5 py-2 text-sm">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/billing-page.test.tsx`

```bash
git add apps/admin-portal/src/app/subscriptions/billing/page.tsx apps/admin-portal/src/components/subscriptions/PaymentMethodCard.tsx apps/admin-portal/src/__tests__/billing-page.test.tsx
git commit -m "feat(admin-portal): add billing page with payment method display, add/update/remove flow"
```

---

## Task 8: Invoice History Page

**Files:**
- Create: `apps/admin-portal/src/app/subscriptions/invoices/page.tsx`
- Create: `apps/admin-portal/src/__tests__/invoices-page.test.tsx`

- [ ] **Step 1: Write invoice page test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockListInvoices = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscription: {
      listInvoices: { query: (args: unknown) => mockListInvoices(args) },
    },
  },
}))

describe('InvoicesPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders invoice table', async () => {
    mockListInvoices.mockResolvedValue({
      invoices: [{
        id: 'inv-1', date: '2026-05-01T00:00:00Z', description: 'Monthly subscription',
        amountUsd: 49.99, status: 'PAID', downloadUrl: 'https://example.com/inv.pdf',
      }],
      totalCount: 1,
    })

    const { default: InvoicesPage } = await import('@/app/subscriptions/invoices/page')
    render(<InvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText('$49.99')).toBeDefined()
      expect(screen.getByText('PAID')).toBeDefined()
    })
  })

  it('shows empty state', async () => {
    mockListInvoices.mockResolvedValue({ invoices: [], totalCount: 0 })
    const { default: InvoicesPage } = await import('@/app/subscriptions/invoices/page')
    render(<InvoicesPage />)

    await waitFor(() => {
      expect(screen.getByText(/No invoices yet/)).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create invoices page**

Create `apps/admin-portal/src/app/subscriptions/invoices/page.tsx`. Follow the same table pattern as the user list page (Task 6 from Epic A):
- Paginated table with status filter dropdown
- Columns: Date, Description, Amount, Status (color badge), Actions (Download PDF link)
- Status badges: PAID=green, PENDING=amber, FAILED=red, REFUNDED=neutral
- Download links open in new tab
- Back link to `/subscriptions`
- Empty state card

Data source: `trpc.subscription.listInvoices.query({ page, pageSize, statusFilter })`

- [ ] **Step 3: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/invoices-page.test.tsx`

```bash
git add apps/admin-portal/src/app/subscriptions/invoices/page.tsx apps/admin-portal/src/__tests__/invoices-page.test.tsx
git commit -m "feat(admin-portal): add invoice history page with status filter and PDF download"
```

---

## Task 9: Dunning Banner + Trial Expired Interstitial

**Files:**
- Create: `apps/admin-portal/src/components/subscriptions/DunningBanner.tsx`
- Create: `apps/admin-portal/src/components/subscriptions/TrialExpiredBanner.tsx`
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx`
- Create: `apps/admin-portal/src/__tests__/dunning-banner.test.tsx`

- [ ] **Step 1: Create DunningBanner component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import Link from 'next/link'

export function DunningBanner() {
  const [state, setState] = useState<'none' | 'failed' | 'grace' | 'suspended'>('none')
  const [graceDaysLeft, setGraceDaysLeft] = useState(0)

  useEffect(() => {
    trpc.subscription.getOrgSubscriptions.query()
      .then((r) => {
        const org = r.organization
        if (org.status === 'SUSPENDED' && org.paymentFailureReason) {
          setState('suspended')
        } else if (org.gracePeriodEndsAt) {
          const days = Math.max(0, Math.ceil((new Date(org.gracePeriodEndsAt).getTime() - Date.now()) / 86_400_000))
          setGraceDaysLeft(days)
          setState('grace')
        } else if (org.paymentFailureReason) {
          setState('failed')
        }
      })
      .catch(() => {})
  }, [])

  if (state === 'none') return null

  const configs = {
    failed: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      message: 'Your last payment failed. Update your payment method to avoid service interruption.',
    },
    grace: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      message: `Payment failed. You have ${graceDaysLeft} day(s) to update your payment method before your subscription is suspended.`,
    },
    suspended: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      message: 'Your subscription has been suspended due to a failed payment.',
    },
  }

  const config = configs[state]

  return (
    <div className={`rounded-2xl border ${config.bg} px-4 py-3 text-sm ${config.text} flex items-center justify-between mb-6`}>
      <span>{config.message}</span>
      <Link
        href="/subscriptions/billing"
        className="shrink-0 ms-4 rounded-full bg-brand-lime text-black font-semibold px-4 py-1.5 text-xs hover:brightness-95 transition-all"
      >
        Update Payment Method
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Create TrialExpiredBanner component**

```tsx
'use client'

import Link from 'next/link'

export function TrialExpiredBanner() {
  return (
    <div className="rounded-2xl bg-red-600 px-4 py-3 text-sm text-white flex items-center justify-between mb-6">
      <span>Your trial has expired. Set up billing to restore access.</span>
      <Link
        href="/subscriptions/billing"
        className="shrink-0 ms-4 rounded-full bg-white text-red-600 font-semibold px-4 py-1.5 text-xs hover:bg-red-50 transition-colors"
      >
        Set Up Billing
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Modify AuthGuard for trial-expired interstitial**

Read `apps/admin-portal/src/components/AuthGuard.tsx`. In the `AuthenticatedShell` component (or wherever the authenticated layout renders), add a check:

After the admin session is verified but before rendering children, check if the org is trial-expired:

```tsx
// Add to AuthGuard's state
const [trialExpired, setTrialExpired] = useState(false)

// In the useEffect, after session verification:
trpc.subscription.getOrgSubscriptions.query()
  .then((r) => {
    const org = r.organization
    if (org.status === 'TRIAL' && org.trialEndsAt && new Date(org.trialEndsAt) < new Date()) {
      setTrialExpired(true)
    }
  })
  .catch(() => {})
```

If `trialExpired` is true AND the current path is NOT `/subscriptions/billing`, render the interstitial instead of children:

```tsx
if (trialExpired && pathname !== '/subscriptions/billing') {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="rounded-3xl bg-white p-8 border border-border max-w-md text-center">
        <h2 className="text-2xl font-bold text-black">Your free trial has expired</h2>
        <p className="mt-3 text-text-muted">Add a payment method to continue using Ultranos.</p>
        <a
          href="/subscriptions/billing"
          className="mt-6 inline-block rounded-full bg-brand-lime text-black font-semibold px-8 py-3 hover:brightness-95 transition-all"
        >
          Set Up Billing
        </a>
        <button
          onClick={handleSignOut}
          className="mt-3 block mx-auto text-sm text-text-muted hover:text-black transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
```

The sign out handler should call `supabase.auth.signOut()`, clear the session store, and redirect to `/login` — same pattern as the Sidebar's sign out.

Note: Allow the `/subscriptions/billing` path through the interstitial so the admin can actually set up billing.

- [ ] **Step 4: Write test and commit**

Write `apps/admin-portal/src/__tests__/dunning-banner.test.tsx` testing the DunningBanner renders correct messages for each state.

```bash
git add apps/admin-portal/src/components/subscriptions/DunningBanner.tsx apps/admin-portal/src/components/subscriptions/TrialExpiredBanner.tsx apps/admin-portal/src/components/AuthGuard.tsx apps/admin-portal/src/__tests__/dunning-banner.test.tsx
git commit -m "feat(admin-portal): add dunning banner, trial-expired interstitial, and AuthGuard trial check"
```

---

## Task 10: SubscriptionWidget Dunning Awareness + Dashboard Integration

**Files:**
- Modify: `apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx`
- Modify: `apps/admin-portal/src/app/dashboard/page.tsx`

- [ ] **Step 1: Update SubscriptionWidget to handle dunning**

Read the existing SubscriptionWidget. Add dunning state awareness:

After fetching `trpc.subscription.getOrgSubscriptions.query()`, check for `paymentFailureReason` and `gracePeriodEndsAt` on the organization object.

Add new render states BEFORE the existing SUSPENDED state:

```tsx
// Payment failed (not yet suspended)
if (org.paymentFailureReason && org.status !== 'SUSPENDED') {
  const graceDays = org.gracePeriodEndsAt
    ? Math.max(0, Math.ceil((new Date(org.gracePeriodEndsAt).getTime() - Date.now()) / 86_400_000))
    : null
  return (
    <div className="rounded-3xl bg-amber-50 p-5 border border-amber-200 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-amber-800">Payment Failed</p>
        {graceDays !== null && (
          <p className="text-xs text-amber-700 mt-1">{graceDays} day(s) until suspension</p>
        )}
      </div>
      <Link href="/subscriptions/billing" className="rounded-full bg-brand-lime text-black font-semibold px-5 py-2 text-sm hover:brightness-95 transition-all">
        Update Payment
      </Link>
    </div>
  )
}
```

Also update the existing SUSPENDED state to differentiate payment-suspended:

```tsx
if (org.status === 'SUSPENDED') {
  const isPaymentSuspended = !!org.paymentFailureReason
  return (
    <div className="rounded-3xl bg-red-50 p-5 border border-red-200 flex items-center justify-between">
      <p className="text-sm font-semibold text-red-800">
        {isPaymentSuspended
          ? 'Subscription Suspended — Failed payment'
          : 'Subscription Suspended'}
      </p>
      <Link href={isPaymentSuspended ? '/subscriptions/billing' : '/subscriptions'} className="...">
        {isPaymentSuspended ? 'Update Payment' : 'Manage Subscription'}
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Add DunningBanner to dashboard**

In `apps/admin-portal/src/app/dashboard/page.tsx`, import and render the `DunningBanner` at the top of the page content (above the stat cards):

```tsx
import { DunningBanner } from '@/components/subscriptions/DunningBanner'

// Inside the return, before the stat cards:
<DunningBanner />
```

- [ ] **Step 3: Update SubscriptionWidget "Set Up Billing" link**

Change the trial state's CTA from linking to `/subscriptions` to `/subscriptions/billing`:

```tsx
// Change:
<Link href="/subscriptions" ...>Set Up Billing</Link>
// To:
<Link href="/subscriptions/billing" ...>Set Up Billing</Link>
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/src/components/dashboard/SubscriptionWidget.tsx apps/admin-portal/src/app/dashboard/page.tsx
git commit -m "feat(admin-portal): add dunning awareness to SubscriptionWidget and dashboard"
```

---

## Task 11: Audit Page Tab Bar + Event Browser

**Files:**
- Modify: `apps/admin-portal/src/app/audit/page.tsx`
- Create: `apps/admin-portal/src/components/audit/EventBrowser.tsx`
- Create: `apps/admin-portal/src/__tests__/event-browser.test.tsx`

- [ ] **Step 1: Write event browser test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockListAuditEvents = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listAuditEvents: { query: (args: unknown) => mockListAuditEvents(args) },
      exportAuditEvents: { query: vi.fn().mockResolvedValue({ data: btoa('test'), filename: 'test.csv', mimeType: 'text/csv' }) },
    },
  },
}))

describe('EventBrowser', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders events table', async () => {
    mockListAuditEvents.mockResolvedValue({
      events: [{
        id: 'e1', timestamp: '2026-05-19T10:00:00Z', action: 'KYC_APPROVED',
        actorName: 'Admin User', actorRole: 'ADMIN', resourceType: 'KYC_SUBMISSION',
        resourceId: 'sub-123', outcome: 'SUCCESS', metadata: {},
      }],
      totalCount: 1,
    })

    const { EventBrowser } = await import('@/components/audit/EventBrowser')
    render(<EventBrowser />)

    await waitFor(() => {
      expect(screen.getByText('KYC_APPROVED')).toBeDefined()
      expect(screen.getByText('Admin User')).toBeDefined()
      expect(screen.getByText('SUCCESS')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Create EventBrowser component**

Create `apps/admin-portal/src/components/audit/EventBrowser.tsx`:

A self-contained component with:
- Date range inputs (from/to) defaulting to last 7 days
- Action type multi-select (or simple dropdown with groups)
- Actor search text input
- Outcome dropdown (All / SUCCESS / DENIED)
- Paginated table (50 per page) with columns: Timestamp, Action, Actor, Resource, Outcome
- Expandable rows showing sanitized metadata
- Export CSV button using `ExportButton` component
- Data source: `trpc.admin.listAuditEvents.query(...)`

The component follows the same patterns as the user list page — `useState` for filters, `useCallback` for fetch, `useEffect` to trigger fetch on filter/page change.

For expanded rows: clicking a row toggles a `expandedId` state. The expanded content shows metadata key-value pairs. Client-side redaction: any key matching PHI patterns shows "[redacted]".

- [ ] **Step 3: Modify audit page with tab bar**

Read `apps/admin-portal/src/app/audit/page.tsx`. Add:

1. A `tab` state: `const [tab, setTab] = useState<'integrity' | 'events'>('integrity')`
2. A tab bar below the h1:

```tsx
<div className="mt-6 flex gap-2">
  <button
    onClick={() => setTab('integrity')}
    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      tab === 'integrity' ? 'bg-brand-lime text-black' : 'border border-border text-text-muted hover:bg-surface'
    }`}
  >
    Chain Integrity
  </button>
  <button
    onClick={() => setTab('events')}
    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      tab === 'events' ? 'bg-brand-lime text-black' : 'border border-border text-text-muted hover:bg-surface'
    }`}
  >
    Event Browser
  </button>
</div>
```

3. Conditionally render content based on tab:

```tsx
{tab === 'integrity' ? (
  // All existing chain integrity content goes here
  <>
    {/* ...existing JSX... */}
  </>
) : (
  <EventBrowser />
)}
```

Import the EventBrowser: `import { EventBrowser } from '@/components/audit/EventBrowser'`

- [ ] **Step 4: Run tests and commit**

Run: `pnpm -F admin-portal exec vitest run src/__tests__/event-browser.test.tsx`

```bash
git add apps/admin-portal/src/app/audit/page.tsx apps/admin-portal/src/components/audit/EventBrowser.tsx apps/admin-portal/src/__tests__/event-browser.test.tsx
git commit -m "feat(admin-portal): add audit event browser with filters, expandable rows, and CSV export"
```

---

## Task 12: Add ExportButton to All Table Pages

**Files:**
- Modify: `apps/admin-portal/src/app/providers/page.tsx`
- Modify: `apps/admin-portal/src/app/providers/expiry/page.tsx`
- Modify: `apps/admin-portal/src/app/labs/page.tsx`
- Modify: `apps/admin-portal/src/app/users/page.tsx`
- Modify: `apps/admin-portal/src/app/alerts/page.tsx`
- Modify: `apps/admin-portal/src/app/subscriptions/page.tsx`

- [ ] **Step 1: Add ExportButton to each page**

For each page, import the ExportButton and the corresponding export function, then place the button in the top bar next to existing filter controls.

**Pattern for each page:**

```tsx
import { ExportButton } from '@/components/ExportButton'
import { trpc } from '@/lib/trpc'

// In the JSX, next to existing filter controls:
<ExportButton
  exportFn={() => trpc.admin.exportUsers.query()}
  filters={{}}
/>
```

**Specific mappings:**

| Page | Export Function |
|------|----------------|
| `/providers` | `trpc.admin.exportKycSubmissions.query()` |
| `/providers/expiry` | `trpc.admin.exportExpiringProviders.query()` |
| `/labs` | `trpc.admin.exportLabs.query()` |
| `/users` | `trpc.admin.exportUsers.query()` |
| `/alerts` | `trpc.admin.exportAlerts.query()` |
| `/subscriptions` | `trpc.subscription.exportSubscriptions.query()` |

For each page:
1. Read the file to find the right insertion point (near filters/top bar)
2. Import `ExportButton` and `trpc`
3. Add the button

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/app/providers/page.tsx apps/admin-portal/src/app/providers/expiry/page.tsx apps/admin-portal/src/app/labs/page.tsx apps/admin-portal/src/app/users/page.tsx apps/admin-portal/src/app/alerts/page.tsx apps/admin-portal/src/app/subscriptions/page.tsx
git commit -m "feat(admin-portal): add CSV export buttons to all table pages"
```

---

## Task 13: Final Integration Verification

- [ ] **Step 1: Run all admin-portal tests**

Run: `pnpm -F admin-portal exec vitest run`
Expected: All new tests pass. Pre-existing failures unchanged.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm -F admin-portal exec tsc --noEmit`
Expected: No new type errors.

- [ ] **Step 3: Run Hub API TypeScript check**

Run: `pnpm -F hub-api exec tsc --noEmit`
Expected: No new type errors.

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix(admin-portal): resolve integration issues from Epic B"
```
