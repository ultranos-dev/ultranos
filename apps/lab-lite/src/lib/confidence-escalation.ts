import { emitClientAudit } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { hlc, serializeHlc } from './hlc'
import { getHubApiUrl } from './trpc'
import { ConfidenceLevel } from './confidence'

export interface EscalationPayload {
  confidence: ConfidenceLevel
  score?: number
  /** Brief description of what the AI produced — NO PHI, no raw values */
  aiOutputSummary: string
  /** e.g. 'anomaly-detection', 'consultation-formatter' */
  sourceFeature: string
  /** Opaque identifier for the relevant data — no patient names or diagnoses */
  sampleId: string
  /** i18n key: e.g. 'confidence.escalation.belowThreshold' */
  escalationReason: string
}

/**
 * Trigger an AI auto-escalation notification when confidence falls at or below
 * the configured threshold (default: LOW).
 *
 * This function:
 *   1. Emits an `AI_AUTO_ESCALATION` audit event (no PHI in metadata)
 *   2. Posts a critical-priority notification to the Hub API for physician review
 *
 * Never throws — escalation must not block the clinical UI.
 * No PHI in any payload (CLAUDE.md Rule #1).
 *
 * Story 53.5 — Task 5 (AC: 3, 7)
 */
export function triggerAutoEscalation(payload: EscalationPayload): void {
  const session = useAuthSessionStore.getState().session

  // 1. Emit audit event (fire-and-forget, no PHI)
  const auditInput: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: (session?.role as UserRole) ?? UserRole.LAB_TECH,
    action: AuditAction.AI_AUTO_ESCALATION,
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: payload.sampleId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      escalationEvent: 'AI_AUTO_ESCALATION',
      outcome: 'SUCCESS',
      sourceFeature: payload.sourceFeature,
      confidence: payload.confidence,
      ...(payload.score != null ? { score: payload.score } : {}),
      aiOutputSummary: payload.aiOutputSummary,
      escalationReason: payload.escalationReason,
      sampleId: payload.sampleId,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(auditInput)

  // 2. Notify Hub API (best-effort — never blocks UI). Skip if no authenticated session.
  if (session?.userId) {
    void _postEscalationToHub(payload, session.userId)
  }
}

async function _postEscalationToHub(
  payload: EscalationPayload,
  actorId: string | undefined,
): Promise<void> {
  try {
    const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      _surfaceEscalationFailure(payload, 'NO_TOKEN')
      return
    }

    const res = await fetch(`${getHubApiUrl()}/lab.escalateAiResult`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        json: {
          type: 'AI_ESCALATION',
          priority: 'critical',
          sourceFeature: payload.sourceFeature,
          confidence: payload.confidence,
          sampleId: payload.sampleId,
          aiOutputSummary: payload.aiOutputSummary,
          escalationReason: payload.escalationReason,
          actorId: actorId ?? 'unknown',
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      _surfaceEscalationFailure(payload, `HTTP_${res.status}`)
    }
  } catch {
    // Story 59.1 (AC 4): escalation delivery failure is SURFACED (sync-status
    // store + FAILURE audit event) instead of vanishing silently. The local
    // AI_AUTO_ESCALATION audit event above remains the primary record.
    _surfaceEscalationFailure(payload, 'NETWORK_ERROR')
  }
}

/**
 * Surface a failed hub escalation dispatch: sync-status store banner + a
 * FAILURE-outcome client audit event (no PHI — opaque sample id only).
 * Never throws.
 */
function _surfaceEscalationFailure(payload: EscalationPayload, reason: string): void {
  try {
    // Lazy import avoids a hard store dependency in non-browser test contexts.
    void import('@/stores/sync-store').then(({ useSyncStore }) => {
      useSyncStore.getState().setSyncError('AI_ESCALATION_SYNC_FAILED')
    }).catch(() => { /* store unavailable */ })

    const session = useAuthSessionStore.getState().session
    void emitClientAudit({
      actorId: session?.userId ?? 'unknown',
      actorRole: (session?.role as UserRole) ?? UserRole.LAB_TECH,
      action: AuditAction.AI_AUTO_ESCALATION,
      resourceType: AuditResourceType.LAB_RESULT,
      resourceId: payload.sampleId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        escalationEvent: 'AI_AUTO_ESCALATION_HUB_DISPATCH',
        outcome: 'FAILURE',
        failureReason: reason,
        sourceFeature: payload.sourceFeature,
        sampleId: payload.sampleId,
        source: 'lab-lite',
      },
    })
  } catch {
    // Surfacing must never block the clinical UI.
  }
}
