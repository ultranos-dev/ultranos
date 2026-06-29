import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, baseProcedure } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { AuditLogger } from '@ultranos/audit-logger'
import { getBillingAdapter, BillingEventType } from '@ultranos/billing'
import { sendBillingNotification } from '@/services/billing-notifications'
import { transitionOrg } from '@/services/subscription-state-machine'

/**
 * Billing domain router — Story 27.8.
 * Handles webhook events from payment providers and invoice access.
 * No PHI involved — billing data is operational/financial metadata only.
 * NEVER log card details, tokens, or PII (AC #8, PCI-DSS).
 */
export const billingRouter = createTRPCRouter({
  /**
   * AC #1, #5: Webhook handler for payment provider events.
   * Public endpoint (no auth) — security via adapter's signature verification.
   * Processes billing events: charges, refunds, subscription lifecycle.
   *
   * NOTE: In production, Stripe webhooks should hit the raw HTTP route at
   * /api/billing/webhook (which preserves raw body for HMAC verification).
   * This tRPC mutation is kept for internal use and testing.
   */
  handleWebhook: baseProcedure
    .input(
      z.object({
        payload: z.string(),
        signature: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adapter = getBillingAdapter()

      // F12: Distinguish signature errors from other failures
      let webhookEvent
      try {
        webhookEvent = await adapter.handleWebhook(input.payload, input.signature)
      } catch (err) {
        // Stripe SDK throws with a specific `type` for signature verification failures
        const msg = err instanceof Error ? err.message.toLowerCase() : ''
        const isSignatureError = msg.includes('signature') || msg.includes('webhook')
        throw new TRPCError({
          code: isSignatureError ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: isSignatureError
            ? 'Webhook signature verification failed'
            : 'Webhook processing error',
        })
      }

      // F6: Unmapped event types return null — acknowledge but skip processing
      if (!webhookEvent) {
        return { received: true }
      }

      // F1: Look up org via provider_customer_id in org_subscriptions
      let orgId = webhookEvent.orgId
      let orgName = 'Unknown Organization'
      let billingEmail = ''

      if (!orgId && webhookEvent.customerId) {
        const { data: sub } = await ctx.supabase
          .from('org_subscriptions')
          .select('org_id')
          .eq('provider_customer_id', webhookEvent.customerId)
          .limit(1)
          .maybeSingle()

        if (sub) {
          orgId = sub.org_id as string
        }
      }

      if (orgId) {
        const { data: org } = await ctx.supabase
          .from('organizations')
          .select('id, name, billing_email')
          .eq('id', orgId)
          .single()

        if (org) {
          orgName = org.name as string
          billingEmail = org.billing_email as string
        }
      }

      // F7: Idempotency guard — skip if this provider event was already processed
      const { data: existing } = await ctx.supabase
        .from('billing_events')
        .select('id')
        .eq('provider_ref', webhookEvent.providerRef)
        .maybeSingle()

      if (existing) {
        return { received: true }
      }

      // Insert billing_events row for every event type
      const { data: billingEventRow, error: insertError } = await ctx.supabase
        .from('billing_events')
        .insert({
          org_id: orgId ?? null,
          event_type: webhookEvent.eventType,
          amount: webhookEvent.amount ?? null,
          currency: webhookEvent.currency ?? 'USD',
          provider_ref: webhookEvent.providerRef,
          metadata: webhookEvent.metadata ?? {},
        })
        .select('id')
        .single()

      // F15: Guard against null data even when error is null
      if (insertError || !billingEventRow) {
        console.error('[BILLING_EVENT_INSERT_FAILED]', { code: insertError?.code })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record billing event',
        })
      }

      // Event-specific handling
      switch (webhookEvent.eventType) {
        case BillingEventType.CHARGE_FAILED: {
          if (orgId) {
            // Set grace period: 7 days from now
            const gracePeriodEnd = new Date()
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7)

            // F8/F9: Scope to specific subscription when possible
            const subQuery = ctx.supabase
              .from('org_subscriptions')
              .update({ grace_period_ends_at: gracePeriodEnd.toISOString() })
              .eq('org_id', orgId)
              .in('status', ['ACTIVE', 'TRIAL'])

            if (webhookEvent.subscriptionId) {
              subQuery.eq('provider_subscription_id', webhookEvent.subscriptionId)
            }

            // F10: Check for errors on update
            const { error: updateErr } = await subQuery
            if (updateErr) {
              console.warn('[BILLING_GRACE_PERIOD_UPDATE_FAILED]', { code: updateErr.code, orgId })
            }

            // Fire-and-forget email notification
            if (billingEmail) {
              void sendBillingNotification(ctx.supabase, 'PAYMENT_FAILED', {
                orgName,
                billingEmail,
                amount: webhookEvent.amount,
                currency: webhookEvent.currency,
              })
            }
          }
          break
        }

        case BillingEventType.CHARGE_SUCCESS: {
          // F14: Skip grace period clearing for zero-amount payments (trials, coupons)
          if (orgId && webhookEvent.amount && webhookEvent.amount > 0) {
            // Clear grace period on subscriptions
            const clearQuery = ctx.supabase
              .from('org_subscriptions')
              .update({ grace_period_ends_at: null })
              .eq('org_id', orgId)
              .in('status', ['ACTIVE', 'TRIAL', 'SUSPENDED'])

            if (webhookEvent.subscriptionId) {
              clearQuery.eq('provider_subscription_id', webhookEvent.subscriptionId)
            }

            const { error: clearErr } = await clearQuery
            if (clearErr) {
              console.warn('[BILLING_GRACE_CLEAR_FAILED]', { code: clearErr.code, orgId })
            }

            // Story 27.9 D2: If org is SUSPENDED, reactivate via transitionOrg
            // (ensures audit event + email notification)
            const { data: currentOrg } = await ctx.supabase
              .from('organizations')
              .select('id, status')
              .eq('id', orgId)
              .single()

            if (currentOrg?.status === 'SUSPENDED') {
              try {
                await transitionOrg(orgId, 'ACTIVE', 'Outstanding payment resolved', { supabase: ctx.supabase })
              } catch (err) {
                console.warn('[BILLING_REACTIVATION_FAILED]', { orgId, error: err instanceof Error ? err.message : 'unknown' })
              }
            }

            // Fire-and-forget email notification for payment receipt
            if (billingEmail) {
              void sendBillingNotification(ctx.supabase, 'PAYMENT_SUCCESS', {
                orgName,
                billingEmail,
                amount: webhookEvent.amount,
                currency: webhookEvent.currency,
              })
            }
          }
          break
        }

        case BillingEventType.SUBSCRIPTION_CREATED: {
          if (orgId) {
            // F8: Use subscription ID from webhook, not providerRef (which is the event ID)
            const providerSubId = webhookEvent.subscriptionId ?? webhookEvent.providerRef

            const { error: subCreateErr } = await ctx.supabase
              .from('org_subscriptions')
              .update({ provider_subscription_id: String(providerSubId) })
              .eq('org_id', orgId)
              .in('status', ['ACTIVE', 'TRIAL'])

            if (subCreateErr) {
              console.warn('[BILLING_SUB_ID_UPDATE_FAILED]', { code: subCreateErr.code, orgId })
            }
          }
          break
        }

        case BillingEventType.SUBSCRIPTION_CANCELLED: {
          if (orgId) {
            // F8: Scope cancellation to the specific subscription
            const cancelQuery = ctx.supabase
              .from('org_subscriptions')
              .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
              .eq('org_id', orgId)
              .in('status', ['ACTIVE', 'TRIAL', 'SUSPENDED'])

            if (webhookEvent.subscriptionId) {
              cancelQuery.eq('provider_subscription_id', webhookEvent.subscriptionId)
            }

            const { error: cancelErr } = await cancelQuery
            if (cancelErr) {
              console.warn('[BILLING_CANCEL_FAILED]', { code: cancelErr.code, orgId })
            }

            // Story 27.9 D1: If no remaining active subscriptions, transition org to CANCELLED
            const { data: remaining } = await ctx.supabase
              .from('org_subscriptions')
              .select('id')
              .eq('org_id', orgId)
              .in('status', ['ACTIVE', 'TRIAL'])
              .limit(1)

            if (!remaining || remaining.length === 0) {
              try {
                await transitionOrg(orgId, 'CANCELLED', 'All subscriptions cancelled', { supabase: ctx.supabase })
              } catch (err) {
                // Log but don't fail webhook — org may already be cancelled
                console.warn('[BILLING_ORG_CANCEL_FAILED]', { orgId, error: err instanceof Error ? err.message : 'unknown' })
              }
            }
          }
          break
        }

        case BillingEventType.REFUND: {
          // Insert billing_events row only — no status change (already done above)
          break
        }
      }

      // AC #8: Audit log for every billing event — amounts and provider refs ONLY
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: `BILLING_${webhookEvent.eventType}`,
          resourceType: 'BillingEvent',
          resourceId: billingEventRow.id as string,
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          outcome: 'SUCCESS',
          sessionId: 'webhook',
          metadata: {
            amount: webhookEvent.amount,
            currency: webhookEvent.currency,
            providerRef: webhookEvent.providerRef,
            // NEVER log card details, tokens, or PII
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: `BILLING_${webhookEvent.eventType}` })
      }

      return { received: true }
    }),

  /**
   * Story 27.9 AC #3: Confirm a pending data purge job.
   * Only PLATFORM_ADMIN. Sets status to CONFIRMED with confirmation metadata.
   * NEVER auto-executes — actual deletion is a future story requiring legal review.
   */
  confirmPurge: roleRestrictedProcedure(['PLATFORM_ADMIN'])
    .input(z.object({ purgeJobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the purge job exists and is PENDING
      const { data: job, error: fetchError } = await ctx.supabase
        .from('data_purge_jobs')
        .select('id, org_id, status')
        .eq('id', input.purgeJobId)
        .single()

      if (fetchError || !job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Purge job not found',
        })
      }

      if (job.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Purge job is not PENDING (current status: ${job.status})`,
        })
      }

      const now = new Date().toISOString()
      const { error: updateError, count } = await ctx.supabase
        .from('data_purge_jobs')
        .update({
          status: 'CONFIRMED',
          confirmed_by: ctx.user.sub,
          confirmed_at: now,
        })
        .eq('id', input.purgeJobId)
        .eq('status', 'PENDING')

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to confirm purge job',
        })
      }

      if (count === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Purge job status changed concurrently',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'DATA_PURGE_CONFIRMED',
          resourceType: 'DataPurgeJob',
          resourceId: input.purgeJobId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { orgId: job.org_id },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'DATA_PURGE_CONFIRMED' })
      }

      return { confirmed: true, purgeJobId: input.purgeJobId }
    }),

  /**
   * Story 27.9 AC #3: Cancel a pending data purge job.
   * Only PLATFORM_ADMIN. Sets status to CANCELLED.
   */
  cancelPurge: roleRestrictedProcedure(['PLATFORM_ADMIN'])
    .input(z.object({ purgeJobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: job, error: fetchError } = await ctx.supabase
        .from('data_purge_jobs')
        .select('id, org_id, status')
        .eq('id', input.purgeJobId)
        .single()

      if (fetchError || !job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Purge job not found',
        })
      }

      if (job.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Purge job is not PENDING (current status: ${job.status})`,
        })
      }

      const { error: updateError, count } = await ctx.supabase
        .from('data_purge_jobs')
        .update({ status: 'CANCELLED' })
        .eq('id', input.purgeJobId)
        .eq('status', 'PENDING')

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel purge job',
        })
      }

      if (count === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Purge job status changed concurrently',
        })
      }

      // Audit event
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'DATA_PURGE_CANCELLED',
          resourceType: 'DataPurgeJob',
          resourceId: input.purgeJobId,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { orgId: job.org_id },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'DATA_PURGE_CANCELLED' })
      }

      return { cancelled: true, purgeJobId: input.purgeJobId }
    }),

  /**
   * AC #7: Invoice download endpoint.
   * ADMIN or PLATFORM_ADMIN. Returns invoice list with PDF URLs from the payment provider.
   * Emits audit event for invoice access (AC #8).
   */
  getInvoices: roleRestrictedProcedure(['ADMIN', 'PLATFORM_ADMIN'])
    .input(
      z.object({
        customerId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.orgId
      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'org_id is required — not available from JWT',
        })
      }

      // Verify the customerId belongs to the caller's org
      const { data: sub } = await ctx.supabase
        .from('org_subscriptions')
        .select('id, org_id, provider_customer_id')
        .eq('org_id', orgId)
        .eq('provider_customer_id', input.customerId)
        .maybeSingle()

      if (!sub) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied — customer ID does not belong to your organization',
        })
      }

      const adapter = getBillingAdapter()
      const invoices = await adapter.getInvoices(input.customerId)

      // AC #8: Audit event for invoice access
      const audit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await audit.emit({
          action: 'READ',
          resourceType: 'Invoice',
          resourceId: `invoices:${input.customerId}`,
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: {
            orgId,
            customerId: input.customerId,
            invoiceCount: invoices.length,
          },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'READ', resourceType: 'Invoice' })
      }

      return {
        invoices: invoices.map((inv) => ({
          invoiceId: inv.invoiceId,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          pdfUrl: inv.pdfUrl,
          createdAt: inv.createdAt.toISOString(),
        })),
      }
    }),
})
