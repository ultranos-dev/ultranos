import { emitClientAudit, setAuditStoreAdapter } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { DexieAuditAdapter } from '@ultranos/audit-logger/adapters/dexie'
import { AuditDrainWorker } from '@ultranos/audit-logger/drain'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { getDb } from './db'
import { hlc, serializeHlc } from './hlc'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// Wire the Dexie adapter to the client audit module (client-side only)
let auditAdapter: DexieAuditAdapter | null = null
if (typeof window !== 'undefined') {
  auditAdapter = new DexieAuditAdapter(getDb().clientAuditLog)
  setAuditStoreAdapter(auditAdapter)
}

// Initialize drain worker (syncs pending events to Hub when online)
let drainWorker: AuditDrainWorker | null = null

export function startAuditDrain(): void {
  drainWorker?.stop()
  drainWorker = new AuditDrainWorker({
    store: auditAdapter!,
    syncFn: async (events) => {
      const session = useAuthSessionStore.getState().session
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      // Auth events may be emitted pre-login, so token is optional
      if (session) {
        const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`
        }
      }
      const res = await fetch(`${getHubApiUrl()}/audit.sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ json: { events } }),
      })
      if (!res.ok) throw new Error(`audit.sync failed: ${res.status}`)
      const body = (await res.json()) as { result: { data: { json: { results: Array<{ id: string; success: boolean }> } } } }
      return body.result.data.json.results
    },
  })
  drainWorker.start()
}

export function stopAuditDrain(): void {
  drainWorker?.stop()
  drainWorker = null
}

/**
 * Emit an auth audit event (LOGIN, MFA).
 * Works pre-authentication — actorId/actorRole are optional.
 * Never throws — auth flow must not be blocked by audit failures.
 */
export function reportAuthEvent(
  event: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'MFA_VERIFY_SUCCESS' | 'MFA_VERIFY_FAILURE',
  opts?: { actorId?: string; actorEmail?: string },
): void {
  const action = event.startsWith('MFA') ? AuditAction.MFA_FAIL : AuditAction.LOGIN
  const outcome = event.includes('SUCCESS') ? 'SUCCESS' : 'FAILURE'

  const input: ClientAuditEventInput = {
    actorId: opts?.actorId ?? 'anonymous',
    actorRole: UserRole.LAB_TECH,
    action,
    resourceType: AuditResourceType.USER_ACCOUNT,
    resourceId: opts?.actorId ?? 'pre-auth',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      authEvent: event,
      outcome,
      ...(opts?.actorEmail ? { failedEmail: '[REDACTED]' } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a queue audit event (QUEUE_ENTRY_CREATED, QUEUE_DRAIN_SUCCESS, etc.).
 * Never throws — queue operations must not be blocked by audit failures.
 */
export function reportQueueAuditEvent(payload: {
  action: 'QUEUE_ENTRY_CREATED' | 'QUEUE_DRAIN_SUCCESS' | 'QUEUE_ITEM_EXPIRED' | 'QUEUE_ITEM_DISCARDED'
  queueEntryId: number
  testCategory: string
  patientRef: string
  timestamp: string
  technicianId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    QUEUE_ENTRY_CREATED: AuditAction.CREATE,
    QUEUE_DRAIN_SUCCESS: AuditAction.UPDATE,
    QUEUE_ITEM_EXPIRED: AuditAction.UPDATE,
    QUEUE_ITEM_DISCARDED: AuditAction.UPDATE,
  }

  const outcomeMap: Record<string, 'SUCCESS' | 'FAILURE'> = {
    QUEUE_ENTRY_CREATED: 'SUCCESS',
    QUEUE_DRAIN_SUCCESS: 'SUCCESS',
    QUEUE_ITEM_EXPIRED: 'FAILURE',
    QUEUE_ITEM_DISCARDED: 'FAILURE',
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.technicianId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: String(payload.queueEntryId),
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      queueEvent: payload.action,
      outcome: outcomeMap[payload.action],
      queueEntryId: payload.queueEntryId,
      testCategory: payload.testCategory,
      patientRef: payload.patientRef,
      timestamp: payload.timestamp,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

export { AuditAction, AuditResourceType }
