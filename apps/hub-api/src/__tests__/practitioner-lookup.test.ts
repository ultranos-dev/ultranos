import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
}))

function createMockSupabase(overrides?: {
  selectReturn?: { data: unknown; error: unknown }
}) {
  const defaultReturn = overrides?.selectReturn ?? { data: null, error: null }
  const single = vi.fn().mockResolvedValue(defaultReturn)
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from, select, eq, single }
}

describe('getPractitionerFromAuthId', () => {
  it('returns practitioner data when found in DB', async () => {
    const { getPractitionerFromAuthId } = await import('../lib/practitioner-lookup')
    const mock = createMockSupabase({
      selectReturn: {
        data: {
          id: 'prac-001',
          fhir_practitioner_id: 'Practitioner/prac-001',
          role: 'DOCTOR',
        },
        error: null,
      },
    })

    const result = await getPractitionerFromAuthId(mock as never, 'auth-uuid-123')
    expect(result).toEqual({
      practitionerId: 'Practitioner/prac-001',
      role: 'DOCTOR',
    })
    expect(mock.from).toHaveBeenCalledWith('practitioners')
    expect(mock.eq).toHaveBeenCalledWith('auth_user_id', 'auth-uuid-123')
  })

  it('returns null when practitioner not found', async () => {
    const { getPractitionerFromAuthId } = await import('../lib/practitioner-lookup')
    const mock = createMockSupabase({
      selectReturn: { data: null, error: { code: 'PGRST116' } },
    })

    const result = await getPractitionerFromAuthId(mock as never, 'unknown-uuid')
    expect(result).toBeNull()
  })

  it('returns null on database error (fail-safe)', async () => {
    const { getPractitionerFromAuthId } = await import('../lib/practitioner-lookup')
    const mock = createMockSupabase({
      selectReturn: { data: null, error: { code: '42P01' } },
    })

    const result = await getPractitionerFromAuthId(mock as never, 'auth-uuid-123')
    expect(result).toBeNull()
  })
})
