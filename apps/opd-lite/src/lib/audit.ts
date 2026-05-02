import { emitClientAudit, setAuditStoreAdapter } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { DexieAuditAdapter } from '@ultranos/audit-logger/adapters/dexie'
import { AuditDrainWorker } from '@ultranos/audit-logger/drain'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { db } from './db'
import { hlc, serializeHlc } from './hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// Wire the Dexie adapter to the client audit module
const auditAdapter = new DexieAuditAdapter(db.clientAuditLog)
setAuditStoreAdapter(auditAdapter)

// Initialize drain worker (syncs pending events to Hub when online)
let drainWorker: AuditDrainWorker | null = null

export function startAuditDrain(hubBaseUrl: string, getAuthToken: () => string): void {
  drainWorker?.stop()
  drainWorker = new AuditDrainWorker({
    store: auditAdapter,
    syncFn: async (events) => {
      const token = getAuthToken()
      const res = await fetch(`${hubBaseUrl}/audit.sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ json: { events } }),
      })
      if (!res.ok) throw new Error(`audit.sync failed: ${res.status}`)
      const data = (await res.json()) as { result: { data: { json: { results: Array<{ id: string; success: boolean }> } } } }
      return data.result.data.json.results
    },
  })
  drainWorker.start()
}

export function stopAuditDrain(): void {
  drainWorker?.stop()
  drainWorker = null
}

/**
 * Emit a client-side audit event with automatic actorId/role from the auth session
 * and HLC timestamp from the shared clock.
 *
 * Never throws — safe to call from any clinical workflow.
 */
export function auditPhiAccess(
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  patientId?: string,
  metadata?: Record<string, unknown>,
): void {
  const session = useAuthSessionStore.getState().session
  if (!session) {
    console.warn('[audit] No auth session — audit event dropped for action:', action)
    return
  }

  const input: ClientAuditEventInput = {
    actorId: session.userId,
    actorRole: session.role as UserRole,
    action,
    resourceType,
    resourceId,
    patientId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: { ...metadata, source: 'opd-lite' },
  }

  void emitClientAudit(input)
}

export { AuditAction, AuditResourceType }
