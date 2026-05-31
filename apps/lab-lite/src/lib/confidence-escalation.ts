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
    actorRole: UserRole.LAB_TECH,
    action: 'AI_AUTO_ESCALATION' as AuditAction,
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

  // 2. Notify Hub API (best-effort — never blocks UI)
  void _postEscalationToHub(payload, session?.userId)
}

async function _postEscalationToHub(
  payload: EscalationPayload,
  actorId: string | undefined,
): Promise<void> {
  try {
    const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return

    await fetch(`${getHubApiUrl()}/lab.escalateAiResult`, {
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
  } catch {
    // Escalation notification is best-effort — network/auth failures are silent.
    // The audit event above is the primary record.
  }
}
