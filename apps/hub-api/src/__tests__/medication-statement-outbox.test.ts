import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 60.4 (Task 4 / AC 6): MedicationStatement durability.
 *
 * Asserts the swallow → durable-outbox behavior change:
 *   - writeMedicationStatementFromPrescription THROWS on DB error (so the caller
 *     can enqueue a retry) and returns created/updated/skipped on success.
 *   - enqueueMedicationStatementRetry upserts a PENDING outbox row (opaque refs).
 *   - drainMedicationStatementOutbox retries pending rows, marks DONE on success,
 *     requeues with backoff on transient failure, and dead-letters (DEAD) after
 *     max attempts — never silently dropping the intent.
 */

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({})),
  db: { toRow: (d: any) => d, toRowRaw: (d: any) => d, fromRow: (d: any) => d },
}))

const {
  writeMedicationStatementFromPrescription,
  enqueueMedicationStatementRetry,
  drainMedicationStatementOutbox,
} = await import('../lib/medication-statement-outbox')

const RX_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => { vi.clearAllMocks() })

describe('writeMedicationStatementFromPrescription', () => {
  function supabaseWith(opts: {
    rx?: any
    rxError?: any
    existing?: any[]
    insertError?: any
    updateError?: any
  }) {
    return {
      from(table: string) {
        if (table === 'medication_requests') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: opts.rx ?? null, error: opts.rxError ?? null }),
              }),
            }),
          }
        }
        // medication_statements
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: opts.existing ?? [], error: null }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: opts.insertError ?? null }),
          update: () => ({ eq: () => Promise.resolve({ error: opts.updateError ?? null }) }),
        }
      },
    }
  }

  it('creates a statement when none exists', async () => {
    const supabase = supabaseWith({ rx: { id: RX_ID, medication_display: 'X', subject_reference: 'Patient/p' }, existing: [] })
    const out = await writeMedicationStatementFromPrescription(supabase as never, {
      prescriptionId: RX_ID, patientRef: 'Patient/p', actorId: 'doc', hlcTimestamp: 'hlc',
    })
    expect(out).toBe('created')
  })

  it('updates the effective period when an active statement exists', async () => {
    const supabase = supabaseWith({ rx: { id: RX_ID }, existing: [{ id: 'stmt-1' }] })
    const out = await writeMedicationStatementFromPrescription(supabase as never, {
      prescriptionId: RX_ID, patientRef: 'Patient/p', actorId: 'doc', hlcTimestamp: 'hlc',
    })
    expect(out).toBe('updated')
  })

  it('skips when the source prescription no longer exists', async () => {
    const supabase = supabaseWith({ rx: null, existing: [] })
    const out = await writeMedicationStatementFromPrescription(supabase as never, {
      prescriptionId: RX_ID, patientRef: '', actorId: 'doc', hlcTimestamp: 'hlc',
    })
    expect(out).toBe('skipped')
  })

  it('THROWS on insert error (no longer swallowed) so the caller can enqueue a retry', async () => {
    const supabase = supabaseWith({ rx: { id: RX_ID }, existing: [], insertError: { code: '500' } })
    await expect(
      writeMedicationStatementFromPrescription(supabase as never, {
        prescriptionId: RX_ID, patientRef: 'Patient/p', actorId: 'doc', hlcTimestamp: 'hlc',
      }),
    ).rejects.toThrow()
  })
})

describe('enqueueMedicationStatementRetry', () => {
  it('upserts a PENDING outbox row keyed by prescription_id', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = { from: () => ({ upsert }) }
    await enqueueMedicationStatementRetry(
      supabase as never,
      { prescriptionId: RX_ID, patientRef: 'Patient/p', actorId: 'doc', hlcTimestamp: 'hlc' },
      'insert failed',
    )
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ prescription_id: RX_ID, status: 'PENDING' }),
      { onConflict: 'prescription_id' },
    )
  })

  it('never throws even if the enqueue itself fails', async () => {
    const supabase = { from: () => ({ upsert: vi.fn().mockRejectedValue(new Error('db down')) }) }
    await expect(
      enqueueMedicationStatementRetry(supabase as never, { prescriptionId: RX_ID, patientRef: '', actorId: 'd', hlcTimestamp: 'h' }, 'x'),
    ).resolves.toBeUndefined()
  })
})

describe('drainMedicationStatementOutbox', () => {
  function drainSupabase(outboxRows: any[], statementFactory: () => any) {
    const updates: any[] = []
    return {
      __updates: updates,
      from(table: string) {
        if (table === 'medication_statement_outbox') {
          return {
            select: () => ({
              eq: () => ({
                lte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: outboxRows, error: null }),
                  }),
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: (_c: string, id: string) => {
                updates.push({ id, ...payload })
                return Promise.resolve({ error: null })
              },
            }),
          }
        }
        return statementFactory()
      },
    }
  }

  it('marks a row DONE after a successful statement write', async () => {
    const supabase = drainSupabase(
      [{ id: 'ob-1', prescription_id: RX_ID, patient_ref: 'Patient/p', actor_id: 'd', hlc_timestamp: 'h', attempts: 0 }],
      () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: RX_ID }, error: null }) }) }),
        insert: () => Promise.resolve({ error: null }),
      }),
    )
    // medication_statements existing-lookup path also needs to resolve — provide it:
    ;(supabase as any).from = ((orig) => (table: string) => {
      if (table === 'medication_statements') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return orig(table)
    })((supabase as any).from.bind(supabase))

    const res = await drainMedicationStatementOutbox(supabase as never)
    expect(res.succeeded).toBe(1)
    expect(supabase.__updates.some((u) => u.status === 'DONE')).toBe(true)
  })

  it('dead-letters (DEAD) a row that has already reached max attempts', async () => {
    const supabase = drainSupabase(
      [{ id: 'ob-2', prescription_id: RX_ID, patient_ref: 'Patient/p', actor_id: 'd', hlc_timestamp: 'h', attempts: 7 }],
      () => ({
        // prescription lookup fails → write throws → drain increments to 8 == MAX → DEAD
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: '500' } }) }) }),
      }),
    )
    ;(supabase as any).from = ((orig) => (table: string) => {
      if (table === 'medication_requests') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: '500' } }) }) }) }
      }
      return orig(table)
    })((supabase as any).from.bind(supabase))

    const res = await drainMedicationStatementOutbox(supabase as never)
    expect(res.deadLettered).toBe(1)
    expect(supabase.__updates.some((u) => u.status === 'DEAD')).toBe(true)
  })
})
