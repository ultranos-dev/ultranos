# Story 27.8: Billing Integration

Status: done

## Story

As a platform operator,
I want subscription payments processed through a provider-agnostic billing adapter,
so that institutional clients can pay using whichever payment provider is available in their country.

## Acceptance Criteria

1. Payment is processed via a `BillingAdapter` interface in `packages/billing/` with methods: `createCustomer()`, `createSubscription()`, `cancelSubscription()`, `handleWebhook()`, `getInvoices()`
2. Concrete adapter implementations exist for at least one provider (Stripe as default, with Tap Payments as the MENA-specific alternative)
3. The active adapter is selected via environment variable (`BILLING_PROVIDER=stripe|tap`)
4. A `billing_events` table tracks: `id` (UUID), `org_id` (FK), `event_type` (CHARGE_SUCCESS, CHARGE_FAILED, REFUND, SUBSCRIPTION_CREATED, SUBSCRIPTION_CANCELLED), `amount_usd` (numeric), `currency` (ISO 4217), `provider_ref` (string), `metadata` (JSONB), `created_at`
5. Failed payments trigger a 7-day grace period, then the org transitions to `SUSPENDED`
6. The Admin receives email notifications for: payment success, payment failure, grace period warning (day 1, day 5), suspension
7. Invoice PDFs are generated (or fetched from the provider) and downloadable from the Admin Portal Subscription Dashboard
8. All billing events are audit-logged (amounts and provider refs only -- no card details ever stored or logged)

## Tasks / Subtasks

- [x] Task 1: Scaffold `packages/billing/` package (AC: #1)
  - [x] 1.1 Create `packages/billing/package.json` with name `@ultranos/billing`, matching the monorepo package pattern (type: module, private: true, main/types pointing to dist/)
  - [x] 1.2 Create `packages/billing/tsconfig.json` extending the root tsconfig
  - [x] 1.3 Create `packages/billing/src/index.ts` barrel file exporting all public types and the adapter factory
  - [x] 1.4 Create `packages/billing/src/types.ts` with `BillingAdapter` interface and all supporting types
  - [x] 1.5 Create stub files: `src/adapters/stripe.ts`, `src/adapters/tap.ts`, `src/factory.ts`
  - [x] 1.6 Add `@ultranos/billing` to `pnpm-workspace.yaml` if not auto-discovered, and run `pnpm install` to link

- [x] Task 2: Implement BillingAdapter interface and types (AC: #1)
  - [x] 2.1 Define `BillingAdapter` interface in `src/types.ts`:
    - `createCustomer(orgId: string, billingEmail: string, name: string): Promise<string>` -- returns provider customer ID
    - `createSubscription(customerId: string, moduleCode: string, priceId: string): Promise<SubscriptionResult>`
    - `cancelSubscription(subscriptionId: string): Promise<void>`
    - `handleWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent>`
    - `getInvoices(customerId: string): Promise<Invoice[]>`
  - [x] 2.2 Define `SubscriptionResult` type: `{ subscriptionId: string; status: string; currentPeriodEnd: Date }`
  - [x] 2.3 Define `WebhookEvent` type: `{ eventType: BillingEventType; orgId?: string; amount?: number; currency?: string; providerRef: string; metadata?: Record<string, unknown> }`
  - [x] 2.4 Define `Invoice` type: `{ invoiceId: string; amount: number; currency: string; status: string; pdfUrl?: string; createdAt: Date }`
  - [x] 2.5 Define `BillingEventType` enum: `CHARGE_SUCCESS`, `CHARGE_FAILED`, `REFUND`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_CANCELLED`

- [x] Task 3: Implement Stripe adapter (AC: #2)
  - [x] 3.1 Create `src/adapters/stripe.ts` implementing `BillingAdapter`
  - [x] 3.2 Add `stripe` npm package as a dependency of `@ultranos/billing`
  - [x] 3.3 Implement `createCustomer()` using `stripe.customers.create()` with `metadata.org_id`
  - [x] 3.4 Implement `createSubscription()` using `stripe.subscriptions.create()` -- map module codes to Stripe price IDs via a config map (env var `STRIPE_PRICE_MAP` or JSON config)
  - [x] 3.5 Implement `cancelSubscription()` using `stripe.subscriptions.cancel()` with `cancel_at_period_end: true` (access continues until billing period end)
  - [x] 3.6 Implement `handleWebhook()` using `stripe.webhooks.constructEvent()` for signature verification, then map Stripe event types to `BillingEventType`
  - [x] 3.7 Implement `getInvoices()` using `stripe.invoices.list()` -- return invoice PDF URLs from Stripe
  - [x] 3.8 Constructor takes `{ secretKey: string; webhookSecret: string; priceMap: Record<string, string> }` -- all sourced from env vars

- [x] Task 4: Stub Tap Payments adapter (AC: #2)
  - [x] 4.1 Create `src/adapters/tap.ts` implementing `BillingAdapter`
  - [x] 4.2 Implement all interface methods with `TODO` stubs that throw `new Error('Tap Payments adapter not yet implemented')`
  - [x] 4.3 Add JSDoc comments documenting the Tap Payments REST API mapping for each method:
    - `createCustomer` -> `POST /v2/customers`
    - `createSubscription` -> Tap recurring payments API
    - `cancelSubscription` -> `DELETE /v2/subscriptions/{id}`
    - `handleWebhook` -> HMAC-SHA256 signature verification
    - `getInvoices` -> `GET /v2/invoices`
  - [x] 4.4 Define constructor accepting `{ apiKey: string; webhookSecret: string }` for future implementation

- [x] Task 5: Adapter factory with env var selection (AC: #3)
  - [x] 5.1 Create `src/factory.ts` exporting `getBillingAdapter(): BillingAdapter`
  - [x] 5.2 Read `BILLING_PROVIDER` env var (default: `stripe`)
  - [x] 5.3 Switch on value: `stripe` -> instantiate `StripeAdapter`, `tap` -> instantiate `TapAdapter`
  - [x] 5.4 Throw `Error(`Unknown billing provider: ${provider}. Supported: stripe, tap`)` on unknown value
  - [x] 5.5 Lazy-singleton pattern: cache the adapter instance after first creation
  - [x] 5.6 Read provider-specific env vars within each adapter constructor:
    - Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MAP` (JSON string)
    - Tap: `TAP_API_KEY`, `TAP_WEBHOOK_SECRET`

- [x] Task 6: Create `billing_events` table migration via Supabase MCP (AC: #4)
  - [x] 6.1 Use `mcp__plugin_supabase_supabase__list_tables` to audit current schema
  - [x] 6.2 Use `mcp__plugin_supabase_supabase__apply_migration` to create:
    ```sql
    CREATE TABLE billing_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id),
      event_type TEXT NOT NULL CHECK (event_type IN (
        'CHARGE_SUCCESS', 'CHARGE_FAILED', 'REFUND',
        'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_CANCELLED'
      )),
      amount_usd NUMERIC(12, 2),
      currency TEXT NOT NULL DEFAULT 'USD',
      provider_ref TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ```
  - [x] 6.3 Create indexes: `idx_billing_events_org_id` on `org_id`, `idx_billing_events_event_type` on `event_type`, `idx_billing_events_created_at` on `created_at`
  - [x] 6.4 Enable RLS on `billing_events`:
    - SELECT: org admins can read their own org's events (`auth.jwt() ->> 'org_id' = org_id::text AND auth.jwt() ->> 'role' IN ('ADMIN', 'PLATFORM_ADMIN')`)
    - INSERT: denied via RLS (server-side only via service role)
    - PLATFORM_ADMIN bypass for all operations

- [x] Task 7: Create webhook handler endpoint in Hub API (AC: #1, #5)
  - [x] 7.1 Create `apps/hub-api/src/trpc/routers/billing.ts` with a `handleWebhook` mutation
  - [x] 7.2 This endpoint is public (no auth -- webhooks come from external providers) but verified via adapter's signature check
  - [x] 7.3 On `CHARGE_FAILED`:
    - Look up org via provider customer ID -> `org_subscriptions` mapping
    - Set `grace_period_ends_at = NOW() + INTERVAL '7 days'` on the org subscription record
    - Insert `billing_events` row
  - [x] 7.4 On `CHARGE_SUCCESS`:
    - Clear any `grace_period_ends_at` on the org subscription
    - If org status is `SUSPENDED` and payment resolves the outstanding balance, transition back to `ACTIVE`
    - Insert `billing_events` row
  - [x] 7.5 On `SUBSCRIPTION_CREATED`: insert `billing_events` row, update `org_subscriptions.provider_subscription_id`
  - [x] 7.6 On `SUBSCRIPTION_CANCELLED`: insert `billing_events` row, update `org_subscriptions.status`
  - [x] 7.7 On `REFUND`: insert `billing_events` row only (no status change)
  - [x] 7.8 Register the billing router in `apps/hub-api/src/trpc/routers/_app.ts`

- [x] Task 8: Email notification triggers (AC: #6)
  - [x] 8.1 Create `apps/hub-api/src/services/billing-notifications.ts`
  - [x] 8.2 Define notification types: `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `GRACE_WARNING_DAY_1`, `GRACE_WARNING_DAY_5`, `SUSPENSION`
  - [x] 8.3 Implement fire-and-forget email dispatch (use existing email service or abstract via interface)
  - [x] 8.4 Email targets: org's `billing_email` from `organizations` table
  - [x] 8.5 Templates (plain text initially, HTML later):
    - Payment success: "Payment of {amount} {currency} received for {org_name}"
    - Payment failure: "Payment failed for {org_name}. Please update your payment method within 7 days to avoid service suspension."
    - Grace warning day 1: "Your payment is overdue. You have 6 days remaining before service suspension."
    - Grace warning day 5: "URGENT: Your payment is 5 days overdue. Service will be suspended in 2 days."
    - Suspension: "Your organization's access has been suspended due to non-payment."
  - [x] 8.6 Grace warning emails are triggered by the `subscription_lifecycle` cron job (Story 27.9), not by the webhook handler
  - [x] 8.7 No PHI in any email template -- only org name, amounts, and dates

- [x] Task 9: Invoice download endpoint (AC: #7)
  - [x] 9.1 Add `getInvoices` query to `apps/hub-api/src/trpc/routers/billing.ts`
  - [x] 9.2 Require `ADMIN` role and org_id match
  - [x] 9.3 Call `adapter.getInvoices(customerId)` -- the adapter returns PDF URLs from the provider
  - [x] 9.4 Return invoice list with `{ invoiceId, amount, currency, status, pdfUrl, createdAt }`
  - [x] 9.5 If provider doesn't support PDF generation, return a link to the provider's hosted invoice page

- [x] Task 10: Audit logging for all billing events (AC: #8)
  - [x] 10.1 In the webhook handler (Task 7), emit audit events for every billing event processed:
    ```typescript
    await audit.emit({
      action: `BILLING_${event.eventType}`,
      resourceType: 'BillingEvent',
      resourceId: billingEventRow.id,
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      outcome: 'SUCCESS',
      sessionId: 'webhook',
      metadata: {
        amount: event.amount,
        currency: event.currency,
        providerRef: event.providerRef,
        // NEVER log card details, tokens, or PII
      },
    })
    ```
  - [x] 10.2 In the invoice download endpoint (Task 9), emit an audit event for invoice access
  - [x] 10.3 Verify no card numbers, CVVs, bank account details, or payment tokens appear in any audit log entry or application log

- [x] Task 11: Tests (AC: #1-#8)
  - [x] 11.1 Create `packages/billing/src/__tests__/factory.test.ts`:
    - Test: `getBillingAdapter()` returns StripeAdapter when `BILLING_PROVIDER=stripe`
    - Test: `getBillingAdapter()` returns TapAdapter when `BILLING_PROVIDER=tap`
    - Test: `getBillingAdapter()` throws on unknown provider
    - Test: singleton behavior -- same instance returned on subsequent calls
  - [x] 11.2 Create `packages/billing/src/__tests__/stripe-adapter.test.ts`:
    - Mock the `stripe` npm package
    - Test: `createCustomer()` calls `stripe.customers.create` with correct params
    - Test: `createSubscription()` maps module codes to price IDs
    - Test: `cancelSubscription()` uses `cancel_at_period_end: true`
    - Test: `handleWebhook()` verifies signature and maps event types correctly
    - Test: `getInvoices()` returns formatted invoice list
  - [x] 11.3 Create `apps/hub-api/src/__tests__/billing-webhook.test.ts`:
    - Test: CHARGE_FAILED sets grace period on org subscription
    - Test: CHARGE_SUCCESS clears grace period
    - Test: CHARGE_SUCCESS transitions SUSPENDED org back to ACTIVE
    - Test: audit event emitted for every webhook event
    - Test: no card details in audit log metadata
  - [x] 11.4 Create `apps/hub-api/src/__tests__/billing-invoices.test.ts`:
    - Test: non-ADMIN role is rejected
    - Test: cross-org invoice access is blocked
    - Test: audit event emitted on invoice download

## Dev Notes

### Architecture & Patterns

**Provider-Agnostic Billing (Locked Decision):**
The billing system uses an adapter pattern to support multiple payment providers per deployment region. Stripe is the default, but MENA deployments may use Tap Payments (supports SAR, AED, KWD, and other Gulf currencies). The active adapter is selected at startup via `BILLING_PROVIDER` env var -- there is no runtime switching. Each deployment gets exactly one provider.

**Webhook Security:**
Webhook endpoints bypass standard tRPC auth (no JWT) because they receive requests from external payment providers. Security is handled by the adapter's signature verification (e.g., Stripe's `stripe.webhooks.constructEvent()`). The webhook endpoint should be exposed as a raw HTTP handler if tRPC's body parsing interferes with signature verification -- Stripe requires the raw request body for HMAC validation.

**Grace Period Flow:**
```
CHARGE_FAILED (webhook) -> set grace_period_ends_at = now() + 7 days
  -> Day 1: email warning (via cron, Story 27.9)
  -> Day 5: urgent email warning (via cron, Story 27.9)
  -> Day 7: grace_period_ends_at reached -> org status = SUSPENDED (via cron, Story 27.9)
CHARGE_SUCCESS during grace -> clear grace_period_ends_at, status stays ACTIVE
```

**No Card Details -- Ever:**
Per CLAUDE.md healthcare safety rule #6 and PCI-DSS requirements, never store, log, or transmit raw card details. The `billing_events` table stores `provider_ref` (an opaque ID like `ch_1234`) and `amount`/`currency` only. Audit logs follow the same constraint. If a developer needs to debug a payment, they use the provider's dashboard with the `provider_ref`.

**Billing Events vs. Audit Events:**
Two separate tables serve different purposes:
- `billing_events` -- operational record of financial transactions, queryable by org admins via the Subscription Dashboard
- `audit_events` -- immutable compliance trail with SHA-256 hash chaining, used for regulatory audits

Both are populated on every billing action. They are NOT redundant -- they serve different audiences and retention policies.

### Project Structure Notes

**New package structure:**
```
packages/billing/
  package.json          # @ultranos/billing
  tsconfig.json
  src/
    index.ts            # barrel exports
    types.ts            # BillingAdapter interface, SubscriptionResult, WebhookEvent, Invoice, BillingEventType
    factory.ts          # getBillingAdapter() -- reads BILLING_PROVIDER env var
    adapters/
      stripe.ts         # StripeAdapter implements BillingAdapter
      tap.ts            # TapAdapter implements BillingAdapter (stubs)
    __tests__/
      factory.test.ts
      stripe-adapter.test.ts
```

**Hub API additions:**
```
apps/hub-api/src/
  trpc/routers/
    billing.ts          # handleWebhook mutation, getInvoices query
  services/
    billing-notifications.ts  # email dispatch for billing events
  __tests__/
    billing-webhook.test.ts
    billing-invoices.test.ts
```

**Database additions:**
- New table: `billing_events` (requires `organizations` table from Story 27.1)
- Modified table: `org_subscriptions` needs `provider_customer_id` and `provider_subscription_id` columns (verify these exist from Story 27.2, add if missing)
- Modified table: `org_subscriptions` needs `grace_period_ends_at TIMESTAMPTZ` column

**Environment variables required:**
- `BILLING_PROVIDER` -- `stripe` or `tap` (default: `stripe`)
- `STRIPE_SECRET_KEY` -- Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` -- Stripe webhook signing secret
- `STRIPE_PRICE_MAP` -- JSON mapping module codes to Stripe price IDs, e.g., `{"OPD_LITE":"price_xxx","PHARMACY_LITE":"price_yyy","LAB_LITE":"price_zzz"}`
- `TAP_API_KEY` -- Tap Payments API key (only when `BILLING_PROVIDER=tap`)
- `TAP_WEBHOOK_SECRET` -- Tap webhook signing secret (only when `BILLING_PROVIDER=tap`)

### References

- Epic 27 stories and architecture: `_bmad-output/planning-artifacts/epics.md` (line ~1918)
- Organizations table schema: Story 27.1 (`_bmad-output/implementation-artifacts/27-1-tenant-organization-data-model.md`)
- Module catalog and org_subscriptions: Story 27.2 (`_bmad-output/implementation-artifacts/27-2-module-catalog-subscription-state.md` -- if exists)
- Existing package pattern: `packages/audit-logger/package.json`
- tRPC router registration: `apps/hub-api/src/trpc/routers/_app.ts`
- Audit logger usage pattern: `packages/audit-logger/src/index.ts`
- CLAUDE.md billing audit rule: "Billing events: log amounts and provider refs only -- NO card details ever"
- CLAUDE.md database operations: "ALL database operations MUST use Supabase MCP tools"
- Stripe webhooks docs: https://stripe.com/docs/webhooks/signatures
- Tap Payments API docs: https://developers.tap.company/reference
- Depends on: Story 27.1 (organizations table), Story 27.2 (org_subscriptions table, module catalog)
- Depended on by: Story 27.9 (subscription lifecycle relies on billing events and grace period logic)

### Review Findings

#### Decision Needed (Resolved)

- [x] [Review][Decision] **F1: orgId extraction from Stripe webhooks uses non-existent `customer_metadata` field** — Resolved: Option C. Stripe adapter now returns `customerId` extracted from event object. Billing router looks up org via `provider_customer_id` in `org_subscriptions`. (blind+edge+auditor)
- [x] [Review][Decision] **F2: tRPC body parsing may break Stripe HMAC signature verification** — Resolved: Option A. Created raw HTTP route at `/api/billing/webhook` that reads raw body via `request.text()` and extracts `stripe-signature` header. tRPC mutation kept for tests. (auditor)
- [x] [Review][Decision] **F3: Non-transactional multi-table writes allow partial state corruption** — Resolved: Option A. Created `billing_handle_charge_success` RPC function wrapping grace period clearing and org/subscription reactivation in a single transaction. (edge)
- [x] [Review][Decision] **F4: Audit log failure on billing events silently swallowed** — Resolved: Option C. Kept current behavior — billing events are not PHI, and the `billing_events` table provides the primary financial record. (edge)
- [x] [Review][Decision] **F5: `amount_usd` column stores amounts in arbitrary currencies** — Resolved: Option A. Renamed column to `amount` via migration. Code updated to use `amount` field. (blind+edge+auditor)

#### Patch (Resolved)

- [x] [Review][Patch] **F6: Unmapped Stripe events silently returned as CHARGE_SUCCESS** — Fixed: `handleWebhook` now returns `null` for unmapped events. Router skips processing for null results. [stripe.ts, billing.ts] (blind+edge+auditor)
- [x] [Review][Patch] **F7: No webhook replay/idempotency protection** — Fixed: Added idempotency check querying `billing_events` by `provider_ref` before processing. Duplicate events return `{ received: true }` without side effects. [billing.ts] (blind+edge)
- [x] [Review][Patch] **F8: SUBSCRIPTION_CANCELLED cancels ALL org subscriptions** — Fixed: Update now scopes by `provider_subscription_id` when available from webhook event. [billing.ts] (blind)
- [x] [Review][Patch] **F9: CHARGE_SUCCESS reactivates ALL suspended subscriptions** — Fixed: RPC function and fallback logic scope by `provider_subscription_id`. [billing.ts] (blind)
- [x] [Review][Patch] **F10: Missing error handling on org_subscriptions update operations** — Fixed: All update operations now check for errors and log warnings with structured tags. [billing.ts] (edge)
- [x] [Review][Patch] **F11: `createSubscription` falls back to untrusted caller-supplied priceId** — Fixed: Throws `Error` with descriptive message when module code not found in priceMap. [stripe.ts:47] (edge)
- [x] [Review][Patch] **F12: Webhook catch block swallows all errors as signature failures** — Fixed: Error classification now case-insensitively checks for 'signature'/'webhook' keywords. Non-signature errors return INTERNAL_SERVER_ERROR instead of UNAUTHORIZED. [billing.ts] (edge)
- [x] [Review][Patch] **F13: PLATFORM_ADMIN excluded from invoice access** — Fixed: `roleRestrictedProcedure(['ADMIN', 'PLATFORM_ADMIN'])`. [billing.ts] (auditor)
- [x] [Review][Patch] **F14: Zero-amount CHARGE_SUCCESS clears grace periods** — Fixed: CHARGE_SUCCESS handler now validates `amount > 0` before processing. Zero-amount events still recorded but do not trigger state transitions. [billing.ts] (edge)
- [x] [Review][Patch] **F15: `billingEventRow.id` accessed without null check** — Fixed: Guard checks both `insertError` and `!billingEventRow` before proceeding. [billing.ts] (blind+edge)

#### Deferred

- [x] [Review][Defer] **W3: No pagination for invoice listing** [stripe.ts:122-125] — deferred, acceptable for initial implementation; can add cursor-based pagination when needed
- [x] [Review][Defer] **W4: notification_queue table may not exist** [billing-notifications.ts:61] — deferred, code handles absence gracefully; queue infrastructure is a separate concern

## Dev Agent Record

### Implementation Plan

Followed the story task sequence. Created `packages/billing/` with adapter pattern (Stripe concrete, Tap stub), factory with env-var selection and singleton caching. Created Hub API billing router with webhook handler (public/unauthenticated, signature-verified) and invoice download (ADMIN-only with cross-org protection). All billing events written to `billing_events` table. Audit events emitted for every billing action with amounts/provider refs only -- no card details. Email notifications use fire-and-forget dispatch to notification_queue.

### Debug Log

- Fixed Stripe SDK type cast issue: `event.data.object` needs `as unknown as Record<string, unknown>` double cast
- Added ioredis mock to hub-api tests (pre-existing requirement since rate-limiting introduction)
- Used `@/` path alias for service imports to match project convention

### Completion Notes

All 11 tasks and all subtasks completed. 27 tests pass across 4 test files (factory: 8, stripe-adapter: 10, billing-webhook: 6, billing-invoices: 3). Database migration applied via Supabase MCP adding `billing_events` table with RLS and indexes, plus `provider_customer_id`, `provider_subscription_id`, and `grace_period_ends_at` columns to `org_subscriptions`.

## File List

### New Files
- `packages/billing/package.json`
- `packages/billing/tsconfig.json`
- `packages/billing/src/index.ts`
- `packages/billing/src/types.ts`
- `packages/billing/src/factory.ts`
- `packages/billing/src/adapters/stripe.ts`
- `packages/billing/src/adapters/tap.ts`
- `packages/billing/src/__tests__/factory.test.ts`
- `packages/billing/src/__tests__/stripe-adapter.test.ts`
- `apps/hub-api/src/trpc/routers/billing.ts`
- `apps/hub-api/src/services/billing-notifications.ts`
- `apps/hub-api/src/__tests__/billing-webhook.test.ts`
- `apps/hub-api/src/__tests__/billing-invoices.test.ts`
- `apps/hub-api/src/app/api/billing/webhook/route.ts` -- raw HTTP webhook endpoint (F2)

### Modified Files
- `apps/hub-api/src/trpc/routers/_app.ts` -- registered billing router
- `apps/hub-api/package.json` -- added @ultranos/billing dependency
- `apps/hub-api/.env.example` -- added billing env vars documentation

### Database Changes
- New table: `billing_events` (with indexes and RLS policies)
- Modified table: `org_subscriptions` (+provider_customer_id, +provider_subscription_id, +grace_period_ends_at)
- Renamed column: `billing_events.amount_usd` -> `billing_events.amount` (F5)
- New RPC: `billing_handle_charge_success(p_org_id, p_subscription_id)` (F3)

## Change Log

- 2026-05-14: Implemented Story 27.8 Billing Integration -- all 11 tasks complete, 27 tests passing
- 2026-05-14: Code review completed -- 15 findings fixed (5 decisions + 10 patches), 2 deferred, 10 dismissed. 31 tests passing (19 billing + 12 hub-api). Added raw HTTP webhook route, RPC function for atomic CHARGE_SUCCESS, idempotency guard, subscription scoping, and org lookup via provider_customer_id.
