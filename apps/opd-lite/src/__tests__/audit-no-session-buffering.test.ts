import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setAuditStoreAdapter, type AuditStoreAdapter, type ClientAuditEvent } from '@ultranos/audit-logger/client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { auditPhiAccess } from '@/lib/audit'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'

// ============================================================
// Story 61.1 (M-OPD-1) — PHI reads during the session-hydration window must be
// BUFFERED with a null actor and backfilled once the session hydrates, never dropped.
// ============================================================

let appended: ClientAuditEvent[] = []
const mockAdapter: AuditStoreAdapter = {
  append: async (event) => { appended.push(event) },
}

// Let the microtask queue flush the `void emitClientAudit(...)` promises.
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('OPD auditPhiAccess — no-session buffering + backfill', () => {
  beforeEach(() => {
    appended = []
    setAuditStoreAdapter(mockAdapter)
    useAuthSessionStore.getState().clearSession()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('buffers a PHI read when there is no session, then backfills the actor on hydration', async () => {
    // No session yet — the event must NOT be dropped, but it must not reach the store yet
    // (no actor to attribute it to).
    auditPhiAccess(AuditAction.PHI_READ, AuditResourceType.PATIENT, 'res-1', 'pat-1', { phiAccess: 'view' })
    await flush()
    expect(appended).toHaveLength(0)

    // Session hydrates → buffered event is flushed with the backfilled actor.
    useAuthSessionStore.getState().setSession({
      userId: 'doctor-9', practitionerId: 'doctor-9', role: 'DOCTOR',
      sessionId: 'sess-9', email: 'd@x.com',
    })
    await flush()

    expect(appended).toHaveLength(1)
    const ev = appended[0]!
    expect(ev.actorId).toBe('doctor-9')
    expect(ev.actorRole).toBe('DOCTOR')
    expect(ev.resourceId).toBe('res-1')
    expect(ev.patientId).toBe('pat-1')
    expect(ev.metadata).toMatchObject({ actorBackfilled: true, bufferedNoSession: true, source: 'opd-lite' })
  })

  it('emits immediately (no buffering) when a session already exists', async () => {
    useAuthSessionStore.getState().setSession({
      userId: 'doctor-1', practitionerId: 'doctor-1', role: 'DOCTOR',
      sessionId: 'sess-1', email: 'd@x.com',
    })
    auditPhiAccess(AuditAction.PHI_READ, AuditResourceType.PATIENT, 'res-2', 'pat-2')
    await flush()
    expect(appended).toHaveLength(1)
    expect(appended[0]!.actorId).toBe('doctor-1')
    expect(appended[0]!.metadata).not.toHaveProperty('bufferedNoSession')
  })
})
