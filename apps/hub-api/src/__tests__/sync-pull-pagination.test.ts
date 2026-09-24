import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// sync.pull cursor pagination — Story 62.2 (M-HUB-5)
// The pull was unbounded (~20 sequential queries, all rows). It now:
//   - caps each table at `limit` and runs them concurrently,
//   - returns { changes, nextCursor, hasMore } as a page contract,
//   - lets the spoke resume via `cursor` (keyset on hlc_timestamp).
// ============================================================

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: {
    toRow: (d: Record<string, unknown>) => d,
    fromRow: (d: Record<string, unknown>) => d,
    fromRows: (d: Record<string, unknown>[]) => d,
  },
}))

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: vi.fn().mockResolvedValue({}) })),
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')

const PATIENT_UUID = '55555555-5555-5555-5555-555555555555'

function authCtx(supabase: unknown) {
  return {
    supabase: supabase as never,
    user: { sub: 'user-1', role: 'DOCTOR' as never, sessionId: 's1', orgId: 'org-1', facilityId: null, status: 'ACTIVE' },
    headers: new Headers(),
  }
}

/** Build an HLC that sorts correctly for a given ordinal. */
function hlc(n: number): string {
  return `${String(1_700_000_000_000 + n).padStart(15, '0')}:00000:node-A`
}

/**
 * Mock supabase whose `conditions` table (Condition resourceType, patient col
 * subject_id) returns `totalRows` rows, but honours the `.limit()` the pull
 * applies. `capturedLimit`/`capturedGt` record what the pull requested so the
 * keyset behavior can be asserted. All other tables are empty + consent active.
 */
function makeSupabase(totalRows: number) {
  const state = { capturedLimit: null as number | null, gtBounds: [] as string[] }

  const conditionRows = Array.from({ length: totalRows }, (_, i) => ({
    id: `cond-${i}`,
    hlcTimestamp: hlc(i + 1),
    hlc_timestamp: hlc(i + 1),
  }))

  const supabase = {
    from: (table: string) => {
      if (table === 'conditions') {
        let limit = Infinity
        let gt = ''
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.gt = (_c: string, v: string) => {
          gt = v
          state.gtBounds.push(v)
          return b
        }
        b.order = () => b
        b.limit = (n: number) => {
          limit = n
          state.capturedLimit = n
          return b
        }
        b.eq = () => b
        b.then = (res: (v: unknown) => unknown) => {
          const rows = conditionRows.filter((r) => r.hlc_timestamp > gt).slice(0, limit)
          return Promise.resolve({ data: rows, error: null }).then(res)
        }
        return b
      }
      if (table === 'consents') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.eq = () => b
        b.order = () => b
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [{ id: 'c1', status: 'ACTIVE', category: ['FULL_RECORD'], date_time: '2026-01-01T00:00:00Z', provision_end: null }],
            error: null,
          }).then(res)
        return b
      }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'gt', 'order', 'eq', 'in', 'limit', 'single', 'maybeSingle', 'insert']) {
        b[m] = () => b
      }
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return b
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  return { supabase, state }
}

describe('sync.pull — cursor pagination (M-HUB-5)', () => {
  const createCaller = createCallerFactory(appRouter)
  beforeEach(() => { vi.clearAllMocks() })

  it('caps the page at `limit` and reports hasMore + nextCursor when truncated', async () => {
    const { supabase, state } = makeSupabase(5)
    const caller = createCaller(authCtx(supabase))

    const page = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: hlc(0),
      resourceTypes: ['Condition'],
      limit: 2,
    })

    // The per-table query received the page limit.
    expect(state.capturedLimit).toBe(2)
    expect(page.changes).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBe(page.changes[page.changes.length - 1]!.hlcTimestamp)
  })

  it('the spoke can page to exhaustion via nextCursor (keyset, no dupes/gaps)', async () => {
    const seen: string[] = []
    let cursor: string | null = null
    let hasMore = true
    let guard = 0

    while (hasMore && guard++ < 20) {
      const { supabase } = makeSupabase(5)
      const caller = createCaller(authCtx(supabase))
      const page = await caller.sync.pull({
        patientId: PATIENT_UUID,
        sinceHlc: hlc(0),
        resourceTypes: ['Condition'],
        limit: 2,
        ...(cursor ? { cursor } : {}),
      })
      for (const c of page.changes) seen.push(c.resourceId)
      hasMore = page.hasMore
      cursor = page.nextCursor
    }

    // All 5 rows retrieved exactly once, in order, no gaps or duplicates.
    expect(seen).toEqual(['cond-0', 'cond-1', 'cond-2', 'cond-3', 'cond-4'])
    expect(new Set(seen).size).toBe(5)
  })

  it('returns hasMore=false and a null cursor when everything fits in one page', async () => {
    const { supabase } = makeSupabase(3)
    const caller = createCaller(authCtx(supabase))
    const page = await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: hlc(0),
      resourceTypes: ['Condition'],
      limit: 10,
    })
    expect(page.changes).toHaveLength(3)
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })

  it('defaults to a bounded page limit when none is supplied', async () => {
    const { supabase, state } = makeSupabase(1)
    const caller = createCaller(authCtx(supabase))
    await caller.sync.pull({
      patientId: PATIENT_UUID,
      sinceHlc: hlc(0),
      resourceTypes: ['Condition'],
    })
    // A finite default limit is applied (not unbounded).
    expect(state.capturedLimit).toBeGreaterThan(0)
    expect(Number.isFinite(state.capturedLimit)).toBe(true)
  })
})
