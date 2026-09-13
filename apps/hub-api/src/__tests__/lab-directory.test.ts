import { describe, it, expect, vi } from 'vitest'
import { labRouter } from '@/trpc/routers/lab'

function ctx(rows: unknown[]) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return { supabase: { from: vi.fn(() => q) }, user: { role: 'DOCTOR' } } as never
}

describe('lab.searchDirectory', () => {
  it('maps active lab rows to directory entries', async () => {
    const caller = labRouter.createCaller(ctx([
      { id: 'l1', lab_name: 'Central Lab', accreditation_ref: 'ACC-1', status: 'ACTIVE', updated_at: '2026-09-12T00:00:00Z' },
    ]))
    const res = await caller.searchDirectory({ q: 'central', limit: 20 })
    expect(res[0]).toEqual({ id: 'l1', name: 'Central Lab', accreditationRef: 'ACC-1', status: 'ACTIVE', updatedAt: '2026-09-12T00:00:00Z' })
  })
})

describe('lab.syncDirectory', () => {
  it('returns rows and the latest watermark', async () => {
    const rows = [
      { id: 'l1', lab_name: 'A', accreditation_ref: null, status: 'ACTIVE', updated_at: '2026-09-12T01:00:00Z' },
      { id: 'l2', lab_name: 'B', accreditation_ref: null, status: 'ACTIVE', updated_at: '2026-09-12T02:00:00Z' },
    ]
    const res = await labRouter.createCaller(ctx(rows)).syncDirectory({ limit: 500 })
    expect(res.labs).toHaveLength(2)
    expect(res.latestUpdatedAt).toBe('2026-09-12T02:00:00Z')
  })
})
