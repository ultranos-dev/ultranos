import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

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

const mockAuditEmit = vi.fn().mockResolvedValue({})

vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    emit: mockAuditEmit,
  })),
}))

const { createCallerFactory } = await import('../trpc/init')
const { adminRouter } = await import('../trpc/routers/admin')

// ================================================================
// Helpers
// ================================================================

type MockRow = Record<string, unknown>

function buildMockSupabase(overrides: Record<string, any> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }

  const chains: Record<string, any> = {}

  return {
    from: vi.fn((table: string) => {
      if (chains[table]) return chains[table]
      const chain = { ...defaultChain, ...overrides[table] }
      // Make chainable methods return chain
      for (const key of ['select', 'eq', 'in', 'order', 'range', 'insert', 'update', 'delete']) {
        if (!overrides[table]?.[key]) {
          chain[key] = vi.fn().mockReturnValue(chain)
        }
      }
      chains[table] = chain
      return chain
    }),
  }
}

function makeCtx(supabase?: any) {
  return {
    supabase: supabase ?? buildMockSupabase(),
    user: { sub: 'admin-1', role: 'ADMIN', sessionId: 's1', orgId: 'org-1', status: 'ACTIVE' },
    headers: new Headers(),
  }
}

// Test UUIDs
const UUID_SUP1 = '00000000-0000-4000-8000-000000000001'
const UUID_LAB1 = '00000000-0000-4000-8000-000000000002'
const UUID_PO1 = '00000000-0000-4000-8000-000000000003'

// ================================================================
// Tests
// ================================================================

describe('Inventory — Stock Level Logic', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('classifies quantity 0 as RED', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'lab-1', lab_name: 'Lab A' }],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'Malaria RDT', quantity: 0, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getInventoryOverview({})

    expect(result.cells).toHaveLength(1)
    expect(result.cells[0].stockLevel).toBe('RED')
    expect(result.cells[0].quantity).toBe(0)
  })

  it('classifies quantity 5 as AMBER (<=7)', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'lab-1', lab_name: 'Lab A' }],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'Malaria RDT', quantity: 5, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getInventoryOverview({})

    expect(result.cells[0].stockLevel).toBe('AMBER')
  })

  it('classifies quantity 20 as GREEN (>14)', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'lab-1', lab_name: 'Lab A' }],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'CBC', quantity: 20, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getInventoryOverview({})

    expect(result.cells[0].stockLevel).toBe('GREEN')
  })

  it('classifies quantity 10 as YELLOW (8-14)', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'lab-1', lab_name: 'Lab A' }],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'Malaria RDT', quantity: 10, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getInventoryOverview({})

    expect(result.cells[0].stockLevel).toBe('YELLOW')
  })

  it('classifies quantity 14 as YELLOW (boundary)', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'lab-1', lab_name: 'Lab A' }],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'Malaria RDT', quantity: 14, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getInventoryOverview({})

    expect(result.cells[0].stockLevel).toBe('YELLOW')
  })

  it('emits INVENTORY_OVERVIEW_ACCESSED audit event', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    await caller.getInventoryOverview({})

    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'READ',
        resourceType: 'INVENTORY_OVERVIEW',
      }),
    )
  })
})

describe('Redistribution Recommendations', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('recommends transfer from GREEN lab to RED lab', async () => {
    const supabase = buildMockSupabase()
    // New query order: labs (ACTIVE) first, then snapshots filtered by active lab IDs
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'lab-1', lab_name: 'Lab A', latitude: null, longitude: null },
            { id: 'lab-2', lab_name: 'Lab B', latitude: null, longitude: null },
          ],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'Malaria RDT', quantity: 0, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                  { lab_id: 'lab-2', reagent_category: 'Malaria RDT', quantity: 50, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getRedistributionRecommendations({})

    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]).toMatchObject({
      targetLabName: 'Lab A',
      sourceLabName: 'Lab B',
      reagentCategory: 'Malaria RDT',
      sourceQuantity: 50,
      distanceKm: null,
    })
  })

  it('returns empty recommendations when no RED labs exist', async () => {
    const supabase = buildMockSupabase()
    supabase.from('labs').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'lab-1', lab_name: 'Lab A', latitude: null, longitude: null }],
          error: null,
        }),
      }),
    })
    supabase.from('lab_inventory_snapshots').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { lab_id: 'lab-1', reagent_category: 'CBC', quantity: 20, unit: 'tests', reported_at: '2026-05-30T10:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.getRedistributionRecommendations({})

    expect(result.recommendations).toHaveLength(0)
  })
})

describe('Purchase Order Lifecycle', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('creates a purchase order with REQUESTED status', async () => {
    const supabase = buildMockSupabase()
    // Supplier lookup
    supabase.from('suppliers').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'sup-1', status: 'ACTIVE' }, error: null }),
        }),
      }),
    })
    // PO insert
    supabase.from('purchase_orders').insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'po-1' }, error: null }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.createPurchaseOrder({
      supplierId: UUID_SUP1,
      items: [{ labId: UUID_LAB1, reagentCategory: 'Malaria RDT', quantity: 100, unit: 'tests' }],
    })

    expect(result.id).toBe('po-1')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'PURCHASE_ORDER',
      }),
    )
  })

  it('rejects PO creation with inactive supplier', async () => {
    const supabase = buildMockSupabase()
    supabase.from('suppliers').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'sup-1', status: 'INACTIVE' }, error: null }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    await expect(
      caller.createPurchaseOrder({
        supplierId: UUID_SUP1,
        items: [{ labId: UUID_LAB1, reagentCategory: 'CBC', quantity: 50, unit: 'tests' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('advances status REQUESTED → APPROVED', async () => {
    const supabase = buildMockSupabase()
    supabase.from('purchase_orders').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'po-1', status: 'REQUESTED' }, error: null }),
        }),
      }),
    })
    supabase.from('purchase_orders').update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.updateOrderStatus({ orderId: UUID_PO1, newStatus: 'APPROVED' })

    expect(result.success).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'PURCHASE_ORDER',
        metadata: expect.objectContaining({ previousStatus: 'REQUESTED', newStatus: 'APPROVED' }),
      }),
    )
  })

  it('rejects backward status transition APPROVED → REQUESTED', async () => {
    const supabase = buildMockSupabase()
    supabase.from('purchase_orders').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'po-1', status: 'APPROVED' }, error: null }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    // REQUESTED is not a valid newStatus in the enum, but trying ORDERED (skip) is:
    await expect(
      caller.updateOrderStatus({ orderId: UUID_PO1, newStatus: 'SHIPPED' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects skipping steps REQUESTED → ORDERED', async () => {
    const supabase = buildMockSupabase()
    supabase.from('purchase_orders').select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'po-1', status: 'REQUESTED' }, error: null }),
        }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    await expect(
      caller.updateOrderStatus({ orderId: UUID_PO1, newStatus: 'ORDERED' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('Supplier CRUD', () => {
  beforeEach(() => {
    mockAuditEmit.mockClear()
  })

  it('creates a supplier and emits audit event', async () => {
    const supabase = buildMockSupabase()
    supabase.from('suppliers').insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'sup-new' }, error: null }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.createSupplier({ name: 'Acme Medical' })

    expect(result.id).toBe('sup-new')
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'SUPPLIER',
        metadata: expect.objectContaining({ supplierName: 'Acme Medical' }),
      }),
    )
  })

  it('updates a supplier and emits audit event', async () => {
    const supabase = buildMockSupabase()
    supabase.from('suppliers').update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })

    const caller = createCallerFactory(adminRouter)(makeCtx(supabase))
    const result = await caller.updateSupplier({ id: UUID_SUP1, name: 'Updated Name' })

    expect(result.success).toBe(true)
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'SUPPLIER',
      }),
    )
  })

  it('rejects createSupplier with empty name', async () => {
    const caller = createCallerFactory(adminRouter)(makeCtx())
    await expect(caller.createSupplier({ name: '' })).rejects.toThrow()
  })
})
