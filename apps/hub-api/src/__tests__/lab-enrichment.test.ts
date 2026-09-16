import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Environment stubs ───────────────────────────────────────
vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

// ── Supabase & db mock ──────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

// ── Audit logger mock ───────────────────────────────────────
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

// ── Crypto mock ─────────────────────────────────────────────
vi.mock('@ultranos/crypto/server', () => ({
  generateBlindIndex: vi.fn((val: string) => `hmac_${val}`),
  encryptField: vi.fn((val: string) => `v1:encrypted_${val.slice(0, 10)}`),
  getEncryptionConfig: vi.fn(() => ({
    randomizedFields: ['report_conclusion', 'encrypted_content'],
  })),
}))

vi.mock('@/lib/field-encryption', () => ({
  getFieldEncryptionKeys: vi.fn(() => ({
    encryptionKey: 'a'.repeat(64),
    hmacKey: 'b'.repeat(64),
  })),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// ── Test helpers ────────────────────────────────────────────
function makeAdminCtx(supabase: any) {
  return {
    supabase,
    user: { sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'ADMIN', sessionId: 'sess-1', orgId: 'org-1', status: null },
    headers: new Headers(),
  }
}

// ────────────────────────────────────────────────────────────
// admin.archiveLab
// ────────────────────────────────────────────────────────────
describe('admin.archiveLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets status ARCHIVED (with updated_at) and inserts history row', async () => {
    // updateChain: update().eq().eq().select().maybeSingle()
    const updateChain: Record<string, any> = {}
    updateChain.eq = vi.fn().mockReturnValue(updateChain)
    updateChain.select = vi.fn().mockReturnValue(updateChain)
    updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'lab1' }, error: null })

    const updateFn = vi.fn().mockReturnValue(updateChain)
    const insertFn = vi.fn().mockResolvedValue({ error: null })

    const from = vi.fn((table: string) => {
      if (table === 'labs') return { update: updateFn }
      if (table === 'lab_status_history') return { insert: insertFn }
      return {}
    })

    const supabase = { from } as never
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    const res = await caller.archiveLab({ labId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })

    // The update must include status:'ARCHIVED' and bump updated_at
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ status: 'ARCHIVED', updated_at: expect.any(String) }))

    // history row inserted
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ lab_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'ARCHIVED' }),
    )

    expect(res).toMatchObject({ id: 'lab1' })
  })

  it('passes reason to history row', async () => {
    const updateChain: Record<string, any> = {}
    updateChain.eq = vi.fn().mockReturnValue(updateChain)
    updateChain.select = vi.fn().mockReturnValue(updateChain)
    updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'lab2' }, error: null })

    const insertFn = vi.fn().mockResolvedValue({ error: null })

    const from = vi.fn((table: string) => {
      if (table === 'labs') return { update: vi.fn().mockReturnValue(updateChain) }
      if (table === 'lab_status_history') return { insert: insertFn }
      return {}
    })

    const supabase = { from } as never
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.archiveLab({ labId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', reason: 'Non-compliant' })

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Non-compliant' }),
    )
  })

  it('emits ARCHIVE/LAB audit event', async () => {
    const updateChain: Record<string, any> = {}
    updateChain.eq = vi.fn().mockReturnValue(updateChain)
    updateChain.select = vi.fn().mockReturnValue(updateChain)
    updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'lab3' }, error: null })

    const from = vi.fn((table: string) => {
      if (table === 'labs') return { update: vi.fn().mockReturnValue(updateChain) }
      if (table === 'lab_status_history') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      return {}
    })

    const supabase = { from } as never
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.archiveLab({ labId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ARCHIVE',
        resourceType: 'LAB',
      }),
    )
  })
})

// ────────────────────────────────────────────────────────────
// admin.updateLab
// ────────────────────────────────────────────────────────────
describe('admin.updateLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does an org-scoped update and returns id', async () => {
    const updateChain: Record<string, any> = {}
    updateChain.eq = vi.fn().mockReturnValue(updateChain)
    updateChain.select = vi.fn().mockReturnValue(updateChain)
    updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'lab-u1' }, error: null })

    const updateFn = vi.fn().mockReturnValue(updateChain)

    const from = vi.fn((table: string) => {
      if (table === 'labs') return { update: updateFn }
      return {}
    })

    const supabase = { from } as never
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    const res = await caller.updateLab({
      labId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      labName: 'Updated Lab',
      phone: '+971-555-0001',
    })

    // update called with the changed fields AND updated_at bump
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ lab_name: 'Updated Lab', phone: '+971-555-0001', updated_at: expect.any(String) }))
    // org scoping: eq('org_id', 'org-1')
    expect(updateChain.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(res).toMatchObject({ id: 'lab-u1' })
  })

  it('emits UPDATE/LAB audit event', async () => {
    const updateChain: Record<string, any> = {}
    updateChain.eq = vi.fn().mockReturnValue(updateChain)
    updateChain.select = vi.fn().mockReturnValue(updateChain)
    updateChain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'lab-u2' }, error: null })

    const from = vi.fn((table: string) => {
      if (table === 'labs') return { update: vi.fn().mockReturnValue(updateChain) }
      return {}
    })

    const supabase = { from } as never
    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.updateLab({ labId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', labName: 'New Name' })

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'LAB',
      }),
    )
  })
})

// ────────────────────────────────────────────────────────────
// admin.listLabs — ARCHIVED exclusion
// ────────────────────────────────────────────────────────────
describe('admin.listLabs — ARCHIVED exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excludes ARCHIVED by default (no includeArchived param)', async () => {
    const resolvedResult = { data: [], error: null, count: 0 }
    const chainable: Record<string, any> = {}
    chainable.eq = vi.fn().mockReturnValue(chainable)
    chainable.neq = vi.fn().mockReturnValue(chainable)
    chainable.order = vi.fn().mockReturnValue(chainable)
    chainable.range = vi.fn().mockReturnValue(chainable)
    chainable.then = (resolve: any) => resolve(resolvedResult)

    const selectFn = vi.fn().mockReturnValue(chainable)
    const supabase = { from: vi.fn(() => ({ select: selectFn })) } as never

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.listLabs({})

    // neq('status', 'ARCHIVED') must be called when includeArchived is not set
    expect(chainable.neq).toHaveBeenCalledWith('status', 'ARCHIVED')
  })

  it('excludes ARCHIVED when includeArchived=false', async () => {
    const resolvedResult = { data: [], error: null, count: 0 }
    const chainable: Record<string, any> = {}
    chainable.eq = vi.fn().mockReturnValue(chainable)
    chainable.neq = vi.fn().mockReturnValue(chainable)
    chainable.order = vi.fn().mockReturnValue(chainable)
    chainable.range = vi.fn().mockReturnValue(chainable)
    chainable.then = (resolve: any) => resolve(resolvedResult)

    const selectFn = vi.fn().mockReturnValue(chainable)
    const supabase = { from: vi.fn(() => ({ select: selectFn })) } as never

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.listLabs({ includeArchived: false })

    expect(chainable.neq).toHaveBeenCalledWith('status', 'ARCHIVED')
  })

  it('does NOT call neq when includeArchived=true', async () => {
    const resolvedResult = { data: [], error: null, count: 0 }
    const chainable: Record<string, any> = {}
    chainable.eq = vi.fn().mockReturnValue(chainable)
    chainable.neq = vi.fn().mockReturnValue(chainable)
    chainable.order = vi.fn().mockReturnValue(chainable)
    chainable.range = vi.fn().mockReturnValue(chainable)
    chainable.then = (resolve: any) => resolve(resolvedResult)

    const selectFn = vi.fn().mockReturnValue(chainable)
    const supabase = { from: vi.fn(() => ({ select: selectFn })) } as never

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.listLabs({ includeArchived: true })

    expect(chainable.neq).not.toHaveBeenCalledWith('status', 'ARCHIVED')
  })

  it('uses eq(status) when explicit status is given, does not double-neq', async () => {
    const resolvedResult = { data: [], error: null, count: 0 }
    const chainable: Record<string, any> = {}
    chainable.eq = vi.fn().mockReturnValue(chainable)
    chainable.neq = vi.fn().mockReturnValue(chainable)
    chainable.order = vi.fn().mockReturnValue(chainable)
    chainable.range = vi.fn().mockReturnValue(chainable)
    chainable.then = (resolve: any) => resolve(resolvedResult)

    const selectFn = vi.fn().mockReturnValue(chainable)
    const supabase = { from: vi.fn(() => ({ select: selectFn })) } as never

    const caller = createCallerFactory(adminRouter)(makeAdminCtx(supabase))
    await caller.listLabs({ status: 'ACTIVE' })

    expect(chainable.eq).toHaveBeenCalledWith('status', 'ACTIVE')
    // neq should NOT also be applied when a specific status is given
    expect(chainable.neq).not.toHaveBeenCalledWith('status', 'ARCHIVED')
  })
})
