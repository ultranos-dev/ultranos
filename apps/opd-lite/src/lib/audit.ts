import { emitClientAudit, setAuditStoreAdapter } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { DexieAuditAdapter } from '@ultranos/audit-logger/adapters/dexie'
import { AuditDrainWorker } from '@ultranos/audit-logger/drain'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import type { UserRole } from '@ultranos/shared-types'
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
 * A PHI-access event captured DURING the session-hydration window (before the auth
 * session store is populated). We must not drop it (Rule #6 — audit every PHI access),
 * so it is buffered here with a null actor and backfilled once the session hydrates.
 */
interface PendingAuditEvent {
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: string
  patientId?: string
  hlcTimestamp: string
  metadata?: Record<string, unknown>
}

// In-memory buffer for no-session events. Memory-only (like the session itself), so a
// tab close before hydration clears it — matching the PHI-safety model. Bounded to avoid
// unbounded growth if a session never arrives.
const MAX_PENDING_AUDIT = 500
const pendingAuditEvents: PendingAuditEvent[] = []
let backfillSubscribed = false

/** Flush buffered no-session events, backfilling the now-known actor, then clear. */
function flushPendingAuditEvents(session: { userId: string; role: string }): void {
  if (pendingAuditEvents.length === 0) return
  const buffered = pendingAuditEvents.splice(0, pendingAuditEvents.length)
  for (const ev of buffered) {
    const input: ClientAuditEventInput = {
      actorId: session.userId,
      actorRole: session.role as UserRole,
      action: ev.action,
      resourceType: ev.resourceType,
      resourceId: ev.resourceId,
      patientId: ev.patientId,
      hlcTimestamp: ev.hlcTimestamp, // preserve the ORIGINAL access time
      metadata: { ...ev.metadata, actorBackfilled: true },
    }
    void emitClientAudit(input)
  }
}

/** Subscribe once so a hydrating session drains the pending buffer. */
function ensureBackfillSubscription(): void {
  if (backfillSubscribed) return
  backfillSubscribed = true
  useAuthSessionStore.subscribe((state) => {
    if (state.session) flushPendingAuditEvents(state.session)
  })
}

/**
 * Emit a client-side audit event with automatic actorId/role from the auth session
 * and HLC timestamp from the shared clock.
 *
 * If no session is present yet (session-hydration race window), the event is BUFFERED
 * with a null actor and backfilled once the session hydrates — never silently dropped
 * (Rule #6). The backfilled events drain to the Hub via the wired audit drain (Story 59.3).
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
  const hlcTimestamp = serializeHlc(hlc.now())

  if (!session) {
    // Buffer with a null actor; backfill on hydration. Do NOT drop.
    // This path MUST NOT throw (auditPhiAccess is documented "never throws" and is called
    // un-awaited from clinical write paths). Guard the subscription/buffer so a
    // non-standard session-store host (e.g. a partial test mock without .subscribe) can
    // never abort the caller's workflow.
    try {
      ensureBackfillSubscription()
      if (pendingAuditEvents.length < MAX_PENDING_AUDIT) {
        pendingAuditEvents.push({
          action,
          resourceType,
          resourceId,
          patientId,
          hlcTimestamp,
          metadata: { ...metadata, source: 'opd-lite', bufferedNoSession: true },
        })
      } else {
        // Extremely defensive: if a session never arrives and the buffer fills, we log the
        // shape only (no PHI) so the drop is at least observable — not silent.
        console.warn('[audit] pending no-session buffer full — event not buffered for action:', action)
      }
    } catch {
      console.warn('[audit] no-session audit buffering unavailable — event not buffered for action:', action)
    }
    return
  }

  const input: ClientAuditEventInput = {
    actorId: session.userId,
    actorRole: session.role as UserRole,
    action,
    resourceType,
    resourceId,
    patientId,
    hlcTimestamp,
    metadata: { ...metadata, source: 'opd-lite' },
  }

  void emitClientAudit(input)
}

// Re-exported from a side-effect-free module so the sync layer can import the mapper
// without pulling in this module's Dexie/drain wiring, and so tests that fully mock
// '@/lib/audit' still resolve the real mapping. See audit-resource-type.ts.
export { fhirToAuditResourceType } from './audit-resource-type'

export { AuditAction, AuditResourceType }
