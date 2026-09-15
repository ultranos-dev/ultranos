import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression coverage for the notification recipient-ID mismatch bug.
 *
 * Notifications are dispatched with `recipient_ref` = the resolved `practitioners.id`
 * (lab.acknowledgeOrder, dispatchResultNotifications, medication dispense, admin, etc.),
 * but the notification router used to read with `.eq('recipient_ref', ctx.user.sub)` —
 * the *auth sub*, which differs from the practitioner id. Result: a clinician never saw
 * any of their notifications (they piled up QUEUED forever).
 *
 * The router must resolve the caller's identity the same way `serviceRequest.getOrderStatus`
 * does — auth sub → practitioners.id — and scope reads to ALL of the caller's recipient
 * refs. Patient/guardian recipients (no practitioner row) must still resolve to their sub.
 */

// ── Identity fixtures ──────────────────────────────────────────
const DOCTOR_SUB = 'doctor-auth-sub'
const DOCTOR_PRAC = 'doctor-practitioner-id' // what dispatch writes as recipient_ref
const OTHER_PRAC = 'other-practitioner-id'
const PATIENT_SUB = 'patient-1'

const NOTIF_FOR_DOCTOR = '00000000-0000-4000-8000-00000000d0c1'
const NOTIF_FOR_OTHER = '00000000-0000-4000-8000-00000000000e'
const NOTIF_FOR_PATIENT = '00000000-0000-4000-8000-0000000000a1'

// ── Mocks ──────────────────────────────────────────────────────
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  db: {
    toRow: (d: any) => d,
    toRowRaw: (d: any) => d,
    fromRow: (d: any) => d,
    fromRowRaw: (d: any) => d,
    fromRows: (d: any[]) => d,
  },
}))

const { createTRPCRouter, createCallerFactory } = await import('../trpc/init')
const { notificationRouter } = await import('../trpc/routers/notification')

// ── In-memory Supabase harness (models real filter/mutation semantics) ──
type NotifRow = Record<string, any>
type PracRow = { id: string; auth_user_id: string }

function makeSupabase(store: NotifRow[], practitioners: PracRow[]) {
  function selectBuilder(head: boolean) {
    let rows = store.slice()
    const b: any = {
      eq(col: string, val: unknown) {
        rows = rows.filter((r) => r[col] === val)
        return b
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter((r) => vals.includes(r[col]))
        return b
      },
      order() {
        return b
      },
      limit() {
        return Promise.resolve({ data: rows, error: null })
      },
      single() {
        return rows.length === 1
          ? Promise.resolve({ data: rows[0], error: null })
          : Promise.resolve({ data: null, error: { message: 'no rows' } })
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      // Terminal for count/head queries that are awaited directly.
      then(resolve: any, reject: any) {
        const res = head ? { count: rows.length, error: null } : { data: rows, error: null }
        return Promise.resolve(res).then(resolve, reject)
      },
    }
    return b
  }

  function updateBuilder(payload: NotifRow) {
    let targets = store.slice()
    const apply = () => {
      for (const row of store) {
        if (targets.includes(row)) Object.assign(row, payload)
      }
      return { error: null }
    }
    const b: any = {
      eq(col: string, val: unknown) {
        targets = targets.filter((r) => r[col] === val)
        return b
      },
      in(col: string, vals: unknown[]) {
        targets = targets.filter((r) => vals.includes(r[col]))
        return b
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(apply()).then(resolve, reject)
      },
    }
    return b
  }

  return {
    from(table: string) {
      if (table === 'practitioners') {
        let rows = practitioners.slice()
        const b: any = {
          select() {
            return b
          },
          eq(col: string, val: unknown) {
            rows = rows.filter((r) => (r as any)[col] === val)
            return b
          },
          maybeSingle() {
            return Promise.resolve({ data: rows[0] ?? null, error: null })
          },
        }
        return b
      }
      if (table === 'notifications') {
        return {
          select(_cols: string, opts?: { head?: boolean }) {
            return selectBuilder(Boolean(opts?.head))
          },
          update(payload: NotifRow) {
            return updateBuilder(payload)
          },
        }
      }
      return {}
    },
  }
}

function makeCtx(
  user: { sub: string; practitionerId?: string; role: string; sessionId: string } | null,
  store: NotifRow[],
  practitioners: PracRow[],
) {
  const supabase = makeSupabase(store, practitioners) as never
  return { supabase, user: user as never, headers: new Headers() }
}

const DOCTOR_PRACS: PracRow[] = [{ id: DOCTOR_PRAC, auth_user_id: DOCTOR_SUB }]
const DOCTOR_USER = { sub: DOCTOR_SUB, practitionerId: DOCTOR_SUB, role: 'DOCTOR', sessionId: 's1' }
const PATIENT_USER = { sub: PATIENT_SUB, practitionerId: PATIENT_SUB, role: 'PATIENT', sessionId: 's2' }

function seedNotifs(): NotifRow[] {
  return [
    {
      id: NOTIF_FOR_DOCTOR,
      recipient_ref: DOCTOR_PRAC,
      recipient_role: 'CLINICIAN',
      type: 'ORDER_RECEIVED',
      payload: JSON.stringify({ orderId: 'o1' }),
      status: 'QUEUED',
      created_at: '2026-09-15T06:00:00.000Z',
      delivered_at: null,
      acknowledged_at: null,
    },
    {
      id: NOTIF_FOR_OTHER,
      recipient_ref: OTHER_PRAC,
      recipient_role: 'CLINICIAN',
      type: 'ORDER_RECEIVED',
      payload: JSON.stringify({ orderId: 'o2' }),
      status: 'QUEUED',
      created_at: '2026-09-15T06:05:00.000Z',
      delivered_at: null,
      acknowledged_at: null,
    },
    {
      id: NOTIF_FOR_PATIENT,
      recipient_ref: PATIENT_SUB,
      recipient_role: 'PATIENT',
      type: 'LAB_RESULT_AVAILABLE',
      payload: JSON.stringify({ testCategory: 'CBC' }),
      status: 'QUEUED',
      created_at: '2026-09-15T06:10:00.000Z',
      delivered_at: null,
      acknowledged_at: null,
    },
  ]
}

function callerFor(ctx: ReturnType<typeof makeCtx>) {
  const router = createTRPCRouter({ notification: notificationRouter })
  return createCallerFactory(router)(ctx)
}

// ── Tests ──────────────────────────────────────────────────────

describe('notification recipient resolution (auth sub → practitioners.id)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list returns a clinician notification keyed by the resolved practitioner id', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    const result = await caller.notification.list()

    const ids = result.notifications.map((n) => n.id)
    expect(ids).toContain(NOTIF_FOR_DOCTOR)
  })

  it('list does NOT leak another clinician\'s notifications', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    const result = await caller.notification.list()

    const ids = result.notifications.map((n) => n.id)
    expect(ids).not.toContain(NOTIF_FOR_OTHER)
    expect(ids).not.toContain(NOTIF_FOR_PATIENT)
  })

  it('list still returns a patient notification keyed by the patient sub (no practitioner row)', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(PATIENT_USER, store, DOCTOR_PRACS))

    const result = await caller.notification.list()

    const ids = result.notifications.map((n) => n.id)
    expect(ids).toContain(NOTIF_FOR_PATIENT)
    expect(ids).not.toContain(NOTIF_FOR_DOCTOR)
  })

  it('list flips the clinician\'s QUEUED notification to SENT', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    await caller.notification.list()

    const row = store.find((r) => r.id === NOTIF_FOR_DOCTOR)
    expect(row?.status).toBe('SENT')
    // Another clinician's notification must be untouched.
    expect(store.find((r) => r.id === NOTIF_FOR_OTHER)?.status).toBe('QUEUED')
  })

  it('unreadCount counts clinician notifications keyed by the resolved practitioner id', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    const { count } = await caller.notification.unreadCount()

    expect(count).toBe(1)
  })

  it('acknowledge succeeds for a notification owned via the resolved practitioner id', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    const result = await caller.notification.acknowledge({ notificationId: NOTIF_FOR_DOCTOR })

    expect(result.success).toBe(true)
    expect(store.find((r) => r.id === NOTIF_FOR_DOCTOR)?.status).toBe('ACKNOWLEDGED')
  })

  it('acknowledge refuses a notification the caller does not own', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    await expect(
      caller.notification.acknowledge({ notificationId: NOTIF_FOR_OTHER }),
    ).rejects.toThrow()
    expect(store.find((r) => r.id === NOTIF_FOR_OTHER)?.status).toBe('QUEUED')
  })

  it('acknowledgeAll marks only the caller\'s (practitioner-id-keyed) unread notifications', async () => {
    const store = seedNotifs()
    const caller = callerFor(makeCtx(DOCTOR_USER, store, DOCTOR_PRACS))

    await caller.notification.acknowledgeAll()

    expect(store.find((r) => r.id === NOTIF_FOR_DOCTOR)?.status).toBe('ACKNOWLEDGED')
    // Never a cross-recipient wipe.
    expect(store.find((r) => r.id === NOTIF_FOR_OTHER)?.status).toBe('QUEUED')
    expect(store.find((r) => r.id === NOTIF_FOR_PATIENT)?.status).toBe('QUEUED')
  })
})
